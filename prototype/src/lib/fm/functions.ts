import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BACKWARD,
  FORWARD,
  SIDE,
  type AppRole,
  type AppState,
  type FmContext,
  type FmProfile,
  type FmRound,
  type Invite,
  type RankingRow,
  type Room,
  type VoteValue,
} from "./types";

type Ctx = {
  supabase: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>;
  userId: string;
};

const NO_CASTING_FOR_HOUSEHOLD_ACCOUNT =
  "Das WG-Konto verwaltet die WG — Bewerbungen und Abstimmung bleiben bei den Bewohner:innen.";

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function newInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const raw = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

async function loadContext(supabase: Ctx["supabase"], userId: string): Promise<FmContext> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, display_name, about, status, is_voter, household_id, contact, moved_in_on, moved_out_on, households(name), user_roles(role)",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return { profile: null, roles: [], isModerator: false, isHouseholdAccount: false, householdName: "" };
  }
  const roles = ((data as { user_roles?: { role: AppRole }[] }).user_roles ?? []).map((r) => r.role);
  return {
    profile: {
      id: data.id,
      display_name: data.display_name,
      about: data.about,
      status: data.status,
      is_voter: data.is_voter,
      household_id: data.household_id,
      contact: data.contact,
      moved_in_on: data.moved_in_on,
      moved_out_on: data.moved_out_on,
    },
    roles,
    isModerator: roles.includes("moderator"),
    isHouseholdAccount: roles.includes("household_account"),
    householdName: (data as { households?: { name: string } | null }).households?.name ?? "",
  };
}

async function requireModerator(ctx: Ctx) {
  const me = await loadContext(ctx.supabase, ctx.userId);
  if (!me.isModerator && !me.isHouseholdAccount) throw new Error("Nur die Moderation kann das.");
  return me;
}

/** Moderation im engeren Sinn — Runden und Bewerbungen. Das WG-Konto darf das nie. */
async function requireCastingModerator(ctx: Ctx) {
  const me = await loadContext(ctx.supabase, ctx.userId);
  if (me.isHouseholdAccount) throw new Error(NO_CASTING_FOR_HOUSEHOLD_ACCOUNT);
  if (!me.isModerator) throw new Error("Nur die Moderation kann das.");
  return me;
}

async function loadCurrentRound(supabase: Ctx["supabase"], householdId: string): Promise<FmRound | null> {
  const { data, error } = await supabase
    .from("rounds")
    .select(
      "id, title, status, hide_results_until_voted, quorum_share, settings_snapshot, opened_at, closed_at, phase_deadline_at, household_id",
    )
    .eq("household_id", householdId)
    .in("status", ["open", "draft", "closed"])
    .order("opened_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const round = data as unknown as FmRound & { household_id: string };
  const { data: rrs } = await supabase
    .from("round_rooms")
    .select("rooms(id, name, size_sqm, available_from, status)")
    .eq("round_id", round.id);
  round.rooms = ((rrs ?? []) as { rooms: Room | Room[] }[]).map((r) => r.rooms as Room).filter(Boolean);
  return round;
}

// ---------- Kontext ----------

export const getMyContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => loadContext(context.supabase, context.userId));

/** Öffentlich: prüft einen Einladungscode und nennt nur den WG-Namen. */
export const peekInvite = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ code: z.string().min(4).max(40) }).parse(d))
  .handler(async ({ data }): Promise<{ valid: boolean; reason?: string; householdName?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hash = await sha256Hex(data.code.trim().toUpperCase());
    const { data: invite } = await supabaseAdmin
      .from("invites")
      .select("id, expires_at, max_uses, used_count, revoked, households(name)")
      .eq("code_hash", hash)
      .maybeSingle();
    if (!invite) return { valid: false, reason: "Diesen Einladungslink kennen wir nicht." };
    const inv = invite as unknown as {
      expires_at: string;
      max_uses: number;
      used_count: number;
      revoked: boolean;
      households: { name: string } | null;
    };
    // FR-2.8: Jede Ablehnung nennt den Grund UND den Weg weiter.
    const askForNew = "Frag in der WG nach einem neuen Link.";
    if (inv.revoked) return { valid: false, reason: `Dieser Einladungslink wurde durch einen neuen ersetzt. ${askForNew}` };
    if (new Date(inv.expires_at) < new Date()) return { valid: false, reason: `Dieser Einladungslink ist abgelaufen. ${askForNew}` };
    if (inv.used_count >= inv.max_uses) return { valid: false, reason: `Dieser Einladungslink ist aufgebraucht. ${askForNew}` };
    return { valid: true, householdName: inv.households?.name ?? "" };
  });

export const joinHousehold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ displayName: z.string().min(2).max(60), code: z.string().min(4).max(40) }).parse(d))
  .handler(async ({ context, data }) => {
    const existing = await loadContext(context.supabase, context.userId);
    if (existing.profile) return existing;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hash = await sha256Hex(data.code.trim().toUpperCase());
    const { data: invite } = await supabaseAdmin
      .from("invites")
      .select("id, household_id, expires_at, max_uses, used_count, revoked")
      .eq("code_hash", hash)
      .maybeSingle();
    const inv = invite as { id: string; household_id: string; expires_at: string; max_uses: number; used_count: number; revoked: boolean } | null;
    if (!inv) throw new Error("Diesen Einladungslink kennen wir nicht.");
    if (inv.revoked) throw new Error("Dieser Einladungslink wurde durch einen neuen ersetzt. Frag in der WG nach einem neuen Link.");
    if (new Date(inv.expires_at) < new Date()) throw new Error("Dieser Einladungslink ist abgelaufen. Frag in der WG nach einem neuen Link.");
    if (inv.used_count >= inv.max_uses) throw new Error("Dieser Einladungslink ist aufgebraucht. Frag in der WG nach einem neuen Link.");

    const wanted = normalizeName(data.displayName);
    const { data: members } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("household_id", inv.household_id)
      .eq("status", "active");
    if ((members ?? []).some((m) => normalizeName(m.display_name) === wanted)) {
      throw new Error(`„${data.displayName.trim()}" wohnt hier schon — wähle bitte einen anderen Namen.`);
    }

    const { data: profile, error } = await context.supabase
      .from("profiles")
      .insert({
        user_id: context.userId,
        household_id: inv.household_id,
        display_name: data.displayName.trim(),
        status: "active",
        is_voter: true,
        moved_in_on: new Date().toISOString().slice(0, 10),
      })
      .select("id, display_name, about, status, is_voter, household_id")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new Error(`„${data.displayName.trim()}" wohnt hier schon — wähle bitte einen anderen Namen.`);
      }
      throw error;
    }
    const { error: roleErr } = await context.supabase
      .from("user_roles")
      .insert({ profile_id: (profile as FmProfile).id, role: "resident" });
    if (roleErr) throw roleErr;

    await supabaseAdmin
      .from("invites")
      .update({ used_count: inv.used_count + 1 })
      .eq("id", inv.id);

    return loadContext(context.supabase, context.userId);
  });

/** Eine neue WG gründen — das angemeldete Konto wird WG-Konto und Moderation. */
export const createHousehold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ householdName: z.string().min(2).max(80), displayName: z.string().min(2).max(60), address: z.string().max(200).optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const existing = await loadContext(context.supabase, context.userId);
    if (existing.profile) return existing;

    // Henne-Ei: vor dem ersten Profil greifen die WG-Leseregeln noch nicht,
    // darum legt der Server die WG als ein Vorgang an — mit Rücknahme bei Fehlern.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: household, error } = await supabaseAdmin
      .from("households")
      .insert({ name: data.householdName.trim(), address: data.address?.trim() || null })
      .select("id")
      .single();
    if (error) throw new Error("Die WG konnte nicht angelegt werden. Versuch es bitte nochmal.");
    const householdId = (household as { id: string }).id;

    try {
      const { data: profile, error: pErr } = await supabaseAdmin
        .from("profiles")
        .insert({
          user_id: context.userId,
          household_id: householdId,
          display_name: data.displayName.trim(),
          status: "active",
          is_voter: false,
        })
        .select("id")
        .single();
      if (pErr) throw pErr;
      const profileId = (profile as { id: string }).id;
      const { error: rErr } = await supabaseAdmin
        .from("user_roles")
        .insert([
          { profile_id: profileId, role: "household_account" as AppRole },
          { profile_id: profileId, role: "moderator" as AppRole },
        ]);
      if (rErr) throw rErr;
    } catch (err) {
      await supabaseAdmin.from("households").delete().eq("id", householdId);
      if ((err as { code?: string }).code === "23505") {
        throw new Error("Diesen Namen gibt es hier schon — wähle bitte einen anderen.");
      }
      throw new Error("Die WG konnte nicht angelegt werden. Versuch es bitte nochmal.");
    }

    return loadContext(context.supabase, context.userId);
  });

/** Setzt die Demo-WG auf ihren Ausgangszustand zurück (nur dort möglich). */
export const resetDemoHousehold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireModerator(context);
    const { error } = await context.supabase.rpc("reset_demo_household");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Namen der Moderation — für „Keine Berechtigung"-Hinweise. */
export const getModerators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ names: string[] }> => {
    const me = await loadContext(context.supabase, context.userId);
    if (!me.profile) return { names: [] };
    const { data } = await context.supabase
      .from("profiles")
      .select("display_name, status, user_roles(role)")
      .eq("household_id", me.profile.household_id)
      .eq("status", "active");
    const names = ((data ?? []) as { display_name: string; user_roles?: { role: AppRole }[] }[])
      .filter((p) => (p.user_roles ?? []).some((r) => r.role === "moderator"))
      .map((p) => p.display_name);
    return { names };
  });

// ---------- Zuhause (B1) ----------

export const getHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{
    me: FmContext;
    round: FmRound | null;
    totalApplications: number;
    /** Gleiche Menge wie das Screening-Deck (FR-4.1): offene Bewerbungen ohne die eigene. */
    openCount: number;
    waitingForMe: number;
    myVoted: number;
    votesReceived: number;
    votersCount: number;
    votersVoted: number;
    votesNeeded: number;
    stateCounts: Partial<Record<AppState, number>>;
    moderationTasks: number;
  }> => {
    const me = await loadContext(context.supabase, context.userId);
    const empty = {
      me,
      round: null,
      totalApplications: 0,
      openCount: 0,
      waitingForMe: 0,
      myVoted: 0,
      votesReceived: 0,
      votersCount: 0,
      votersVoted: 0,
      votesNeeded: 0,
      stateCounts: {} as Partial<Record<AppState, number>>,
      moderationTasks: 0,
    };
    // ADR-014: Das WG-Konto bekommt keinerlei Rundendaten.
    if (!me.profile || me.isHouseholdAccount) return empty;
    const hh = me.profile.household_id;
    const round = await loadCurrentRound(context.supabase, hh);

    if (!round) {
      const { count: voters } = await context.supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("household_id", hh)
        .eq("status", "active")
        .eq("is_voter", true);
      return { ...empty, votersCount: voters ?? 0, moderationTasks: me.isModerator ? 1 : 0 };
    }

    // Der Nenner steht seit dem Eröffnen der Runde fest (Teilnahme wird eingefroren).
    const { data: votersRpc } = await context.supabase.rpc("round_voters_count", { _round_id: round.id });
    const votersCount = Number(votersRpc ?? 0);

    const { data: apps } = await context.supabase
      .from("applications")
      .select("id, state, became_resident_id")
      .eq("round_id", round.id);
    const appList = (apps ?? []) as { id: string; state: AppState; became_resident_id: string | null }[];
    const openApps = appList.filter(
      (a) => (a.state === "new" || a.state === "screened") && a.became_resident_id !== me.profile!.id,
    );
    const stateCounts: Partial<Record<AppState, number>> = {};
    for (const a of appList) stateCounts[a.state] = (stateCounts[a.state] ?? 0) + 1;

    const { data: myVotes } = await context.supabase
      .from("votes")
      .select("application_id")
      .eq("voter_id", me.profile.id)
      .eq("stage", "invite");
    const myVoteSet = new Set((myVotes ?? []).map((v) => v.application_id));

    // Gesamtzahl der Stimmen über alle Mitglieder — die einzelnen Stimmen bleiben privat.
    const { data: stats } = await context.supabase.rpc("round_vote_stats", { _round_id: round.id });
    const stat = ((stats ?? []) as { total_votes: number; voters_voted: number }[])[0];

    // Grobe Zahl für die Moderations-Brücke: was die Moderation als Nächstes tun könnte.
    let moderationTasks = 0;
    if (me.isModerator) {
      moderationTasks = (stateCounts.screened ?? 0) > 0 ? 1 : 0;
      if (appList.length === 0) moderationTasks += 1;
      if (round.status !== "open") moderationTasks += 1;
    }

    return {
      me,
      round,
      totalApplications: appList.length,
      openCount: openApps.length,
      waitingForMe: openApps.filter((a) => !myVoteSet.has(a.id)).length,
      myVoted: openApps.filter((a) => myVoteSet.has(a.id)).length,
      votesReceived: stat?.total_votes ?? 0,
      votersCount,
      votersVoted: stat?.voters_voted ?? 0,
      votesNeeded: Math.ceil(round.quorum_share * votersCount),
      stateCounts,
      moderationTasks,
    };
  });

/** Reine Namensliste der Teilnehmenden — ohne Angabe, wer schon abgestimmt hat. */
export const getParticipants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ name: string; isVoter: boolean; status: string }[]> => {
    const me = await loadContext(context.supabase, context.userId);
    if (!me.profile || me.isHouseholdAccount) return [];
    const { data } = await context.supabase
      .from("profiles")
      .select("display_name, is_voter, status")
      .eq("household_id", me.profile.household_id)
      .order("display_name");
    return ((data ?? []) as { display_name: string; is_voter: boolean; status: string }[]).map((p) => ({
      name: p.display_name,
      isVoter: p.is_voter,
      status: p.status,
    }));
  });

// ---------- Screening (C1) ----------

export const getDeck = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ me: FmContext; round: FmRound | null; deck: { id: string; applicant_name: string; age: number | null; contact: string | null; message: string | null; myVote: VoteValue | null }[] }> => {
    const me = await loadContext(context.supabase, context.userId);
    // ADR-014: Das WG-Konto sieht keine Bewerbungen und keine Rundendaten.
    if (!me.profile || me.isHouseholdAccount) return { me, round: null, deck: [] };
    const round = await loadCurrentRound(context.supabase, me.profile.household_id);
    if (!round || round.status !== "open") return { me, round, deck: [] };

    const { data: apps, error } = await context.supabase
      .from("applications")
      .select("id, applicant_name, age, contact, message, state, became_resident_id, created_at")
      .eq("round_id", round.id)
      .in("state", ["new", "screened"])
      .order("created_at", { ascending: true });
    if (error) throw error;

    // FR-4.2/4.3: eigene Bewerbung ausschließen, bevor die Daten den Client erreichen.
    const deck = ((apps ?? []) as { id: string; applicant_name: string; age: number | null; contact: string | null; message: string | null; became_resident_id: string | null }[])
      .filter((a) => a.became_resident_id !== me.profile!.id)
      .map((a) => ({ id: a.id, applicant_name: a.applicant_name, age: a.age, contact: a.contact, message: a.message, myVote: null as VoteValue | null }));

    if (deck.length) {
      const { data: myVotes } = await context.supabase
        .from("votes")
        .select("application_id, value")
        .eq("voter_id", me.profile.id)
        .eq("stage", "invite")
        .in("application_id", deck.map((d) => d.id));
      const map = new Map((myVotes ?? []).map((v) => [v.application_id, v.value as VoteValue]));
      for (const d of deck) d.myVote = map.get(d.id) ?? null;
    }
    return { me, round, deck };
  });

export const castVote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid(), value: z.enum(["no", "rather_not", "good", "definitely"]) }).parse(d))
  .handler(async ({ context, data }) => {
    const me = await loadContext(context.supabase, context.userId);
    if (me.isHouseholdAccount) throw new Error(NO_CASTING_FOR_HOUSEHOLD_ACCOUNT);
    if (!me.profile || !me.profile.is_voter) throw new Error("Du stimmst in dieser Runde nicht ab.");
    const { data: app } = await context.supabase
      .from("applications")
      .select("id, state, round_id, rounds(status)")
      .eq("id", data.applicationId)
      .maybeSingle();
    const a = app as { id: string; state: AppState; round_id: string; rounds: { status: string } | null } | null;
    if (!a || a.rounds?.status !== "open") throw new Error("Die Runde ist nicht (mehr) offen.");
    if (a.state !== "new" && a.state !== "screened") throw new Error("Über diese Bewerbung wird gerade nicht abgestimmt.");

    const { error } = await context.supabase
      .from("votes")
      .upsert(
        { application_id: data.applicationId, voter_id: me.profile.id, stage: "invite", value: data.value, updated_at: new Date().toISOString() },
        { onConflict: "application_id,voter_id,stage" },
      );
    if (error) throw error;
    return { ok: true };
  });

// ---------- Rangliste (D1) ----------

export const getRanking = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ me: FmContext; round: FmRound | null; rows: RankingRow[] }> => {
    const me = await loadContext(context.supabase, context.userId);
    if (!me.profile || me.isHouseholdAccount) return { me, round: null, rows: [] };
    const round = await loadCurrentRound(context.supabase, me.profile.household_id);
    if (!round) return { me, round: null, rows: [] };

    const { data: rpcRows, error } = await context.supabase.rpc("round_ranking", { _round_id: round.id });
    if (error) throw error;
    const rows = (rpcRows ?? []) as unknown as RankingRow[];

    // Einzelansicht zeigt den vollen Bewerbungstext — Details nachladen.
    if (rows.length) {
      const { data: details } = await context.supabase
        .from("applications")
        .select("id, age, contact, message")
        .eq("round_id", round.id);
      const dmap = new Map(((details ?? []) as { id: string; age: number | null; contact: string | null; message: string | null }[]).map((d) => [d.id, d]));
      for (const row of rows) {
        const d = dmap.get(row.application_id);
        row.age = d?.age ?? null;
        row.contact = d?.contact ?? null;
        row.message = d?.message ?? null;
      }
    }

    // Systemwechsel: Sobald das Quorum erreicht ist, gilt die Bewerbung als "gesehen".
    for (const row of rows) {
      if (row.quorum_reached && row.state === "new") {
        const { error: updErr } = await context.supabase
          .from("applications")
          .update({ state: "screened" })
          .eq("id", row.application_id)
          .eq("state", "new");
        if (!updErr) {
          await context.supabase.from("application_events").insert({
            application_id: row.application_id,
            household_id: me.profile.household_id,
            from_state: "new",
            to_state: "screened",
            is_backward: false,
            note: "Genug Stimmen — automatisch gesehen.",
            actor_id: null,
          });
          row.state = "screened";
        }
      }
    }
    return { me, round, rows };
  });

// ---------- Organisation (O1) ----------

export const getOrganisation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{
    me: FmContext;
    round: FmRound | null;
    rooms: Room[];
    rounds: { id: string; title: string; status: string; opened_at: string | null }[];
    applications: { id: string; applicant_name: string; age: number | null; contact: string | null; message: string | null; state: AppState; created_at: string }[];
    members: (FmProfile & { roles: AppRole[] })[];
    invites: Invite[];
    settings: { hide_results_until_voted: boolean; quorum_share: number; scale_weights: Record<VoteValue, number>; favorite_budget_factor: number };
    openRoomCount: number;
  }> => {
    const me = await loadContext(context.supabase, context.userId);
    if (!me.profile) throw new Error("Kein Profil gefunden.");
    const hh = me.profile.household_id;
    // ADR-014: Für das WG-Konto verlassen keine Rundendaten den Server.
    const round = me.isHouseholdAccount ? null : await loadCurrentRound(context.supabase, hh);

    const { data: rooms } = await context.supabase
      .from("rooms")
      .select("id, name, size_sqm, available_from, status")
      .eq("household_id", hh)
      .order("name");

    let rounds: { id: string; title: string; status: string; opened_at: string | null }[] = [];
    if (!me.isHouseholdAccount) {
      const { data } = await context.supabase
        .from("rounds")
        .select("id, title, status, opened_at")
        .eq("household_id", hh)
        .order("created_at", { ascending: false });
      rounds = (data ?? []) as typeof rounds;
    }

    let applications: { id: string; applicant_name: string; age: number | null; contact: string | null; message: string | null; state: AppState; created_at: string }[] = [];
    if (!me.isHouseholdAccount && round) {
      const { data: apps } = await context.supabase
        .from("applications")
        .select("id, applicant_name, age, contact, message, state, created_at")
        .eq("round_id", round.id)
        .order("created_at", { ascending: true });
      applications = (apps ?? []) as typeof applications;
    }

    const { data: memberRows } = await context.supabase
      .from("profiles")
      .select("id, display_name, about, status, is_voter, household_id, contact, moved_in_on, moved_out_on, user_roles(role)")
      .eq("household_id", hh)
      .order("created_at", { ascending: true });
    const members = ((memberRows ?? []) as (FmProfile & { user_roles?: { role: AppRole }[] })[]).map((m) => ({
      id: m.id,
      display_name: m.display_name,
      about: m.about,
      status: m.status,
      is_voter: m.is_voter,
      household_id: m.household_id,
      contact: m.contact ?? null,
      moved_in_on: m.moved_in_on ?? null,
      moved_out_on: m.moved_out_on ?? null,
      roles: (m.user_roles ?? []).map((r) => r.role),
    }));

    let invites: Invite[] = [];
    if (me.isModerator || me.isHouseholdAccount) {
      const { data: inviteRows } = await context.supabase
        .from("invites")
        .select("id, label, expires_at, max_uses, used_count, revoked, code")
        .eq("household_id", hh)
        .eq("revoked", false)
        .order("created_at", { ascending: false });
      invites = ((inviteRows ?? []) as (Omit<Invite, "code"> & { code: string | null })[]).map((i) => ({
        ...i,
        // Abgelaufene oder aufgebrauchte Links geben den Code nicht mehr her.
        code: new Date(i.expires_at) > new Date() && i.used_count < i.max_uses ? i.code : null,
      }));
    }

    const { data: hhRow } = await context.supabase
      .from("households")
      .select("hide_results_until_voted, quorum_share, scale_weights, favorite_budget_factor")
      .eq("id", hh)
      .maybeSingle();
    const settings = {
      hide_results_until_voted: (hhRow?.hide_results_until_voted ?? true) as boolean,
      quorum_share: Number(hhRow?.quorum_share ?? 0.5),
      scale_weights: (hhRow?.scale_weights ?? { no: 0, rather_not: 1, good: 3, definitely: 5 }) as unknown as Record<VoteValue, number>,
      favorite_budget_factor: Number((hhRow as { favorite_budget_factor?: number } | null)?.favorite_budget_factor ?? 1.5),
    };

    const roomList = (rooms ?? []) as Room[];
    return {
      me,
      round,
      rooms: roomList,
      rounds,
      applications,
      members,
      invites,
      settings,
      openRoomCount: roomList.filter((r) => r.status === "open").length,
    };
  });

/** Hält fest, wer beim Eröffnen stimmberechtigt war — der Nenner bleibt danach stabil. */
async function freezeParticipants(ctx: Ctx, roundId: string, householdId: string) {
  const { data: existing } = await ctx.supabase.from("round_participants").select("profile_id").eq("round_id", roundId).limit(1);
  if ((existing ?? []).length > 0) return;
  const { data: voters } = await ctx.supabase
    .from("profiles")
    .select("id")
    .eq("household_id", householdId)
    .eq("status", "active")
    .eq("is_voter", true);
  const rows = ((voters ?? []) as { id: string }[]).map((p) => ({ round_id: roundId, profile_id: p.id }));
  if (rows.length) await ctx.supabase.from("round_participants").insert(rows);
}

export const createRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      title: z.string().min(3).max(120),
      roomIds: z.array(z.string().uuid()).min(1),
      hideResults: z.boolean(),
      quorumShare: z.number().min(0.1).max(1),
      deadline: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const me = await requireCastingModerator(context);
    const { data: existing } = await context.supabase
      .from("rounds")
      .select("id")
      .eq("household_id", me.profile!.household_id)
      .eq("status", "open")
      .maybeSingle();
    if (existing) throw new Error("Es läuft bereits eine offene Runde.");
    const { data: hh } = await context.supabase
      .from("households")
      .select("scale_weights, favorite_budget_factor")
      .eq("id", me.profile!.household_id)
      .maybeSingle();
    const { data: round, error } = await context.supabase
      .from("rounds")
      .insert({
        household_id: me.profile!.household_id,
        title: data.title,
        status: "open",
        hide_results_until_voted: data.hideResults,
        quorum_share: data.quorumShare,
        phase_deadline_at: data.deadline ? new Date(`${data.deadline}T23:59:59`).toISOString() : null,
        settings_snapshot: {
          scale_weights: (hh?.scale_weights ?? { no: 0, rather_not: 1, good: 3, definitely: 5 }) as never,
          favorite_budget_factor: Number((hh as { favorite_budget_factor?: number } | null)?.favorite_budget_factor ?? 1.5),
        } as never,
        opened_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    const roundId = (round as { id: string }).id;
    const { error: rrErr } = await context.supabase
      .from("round_rooms")
      .insert(data.roomIds.map((roomId) => ({ round_id: roundId, room_id: roomId })));
    if (rrErr) throw rrErr;
    await freezeParticipants(context, roundId, me.profile!.household_id);
    return { ok: true };
  });

/** Freiwillige Rundenfrist — sperrt nichts, steht nur neben der Phase. */
export const setRoundDeadline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ roundId: z.string().uuid(), deadline: z.string().nullable() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireCastingModerator(context);
    const { error } = await context.supabase
      .from("rounds")
      .update({ phase_deadline_at: data.deadline ? new Date(`${data.deadline}T23:59:59`).toISOString() : null })
      .eq("id", data.roundId);
    if (error) throw error;
    return { ok: true };
  });

export const setRoundStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ roundId: z.string().uuid(), status: z.enum(["draft", "open", "closed", "archived"]) }).parse(d))
  .handler(async ({ context, data }) => {
    const me = await requireCastingModerator(context);
    const { data: current } = await context.supabase
      .from("rounds")
      .select("id, status, household_id")
      .eq("id", data.roundId)
      .maybeSingle();
    const r = current as { id: string; status: string; household_id: string } | null;
    if (!r) throw new Error("Runde nicht gefunden.");
    if (data.status === "open" && r.status !== "open") {
      const { data: other } = await context.supabase
        .from("rounds")
        .select("id")
        .eq("household_id", me.profile!.household_id)
        .eq("status", "open")
        .neq("id", r.id)
        .maybeSingle();
      if (other) throw new Error("Es läuft bereits eine andere offene Runde.");
    }
    const patch: Partial<import("@/integrations/supabase/types").Database["public"]["Tables"]["rounds"]["Update"]> = { status: data.status };
    if (data.status === "open") {
      patch.opened_at = new Date().toISOString();
      patch.closed_at = null;
    }
    if (data.status === "closed") patch.closed_at = new Date().toISOString();
    const { error } = await context.supabase.from("rounds").update(patch).eq("id", data.roundId);
    if (error) throw error;
    if (data.status === "open") await freezeParticipants(context, r.id, r.household_id);
    return { ok: true };
  });

export const createApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      roundId: z.string().uuid(),
      applicantName: z.string().min(2).max(80),
      age: z.number().int().min(16).max(99).nullable().optional(),
      contact: z.string().max(200).nullable().optional(),
      message: z.string().max(2000).nullable().optional(),
      source: z.enum(["applicant", "third_party"]),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const me = await requireCastingModerator(context);
    const { data: round } = await context.supabase.from("rounds").select("status").eq("id", data.roundId).maybeSingle();
    if (!round || (round as { status: string }).status !== "open") throw new Error("Es gibt keine offene Runde, in die die Bewerbung gehört.");
    const { data: app, error } = await context.supabase
      .from("applications")
      .insert({
        round_id: data.roundId,
        household_id: me.profile!.household_id,
        applicant_name: data.applicantName,
        age: data.age ?? null,
        contact: data.contact ?? null,
        message: data.message ?? null,
        state: "new",
        source: data.source,
        created_by: me.profile!.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    const { error: evErr } = await context.supabase.from("application_events").insert({
      application_id: (app as { id: string }).id,
      household_id: me.profile!.household_id,
      from_state: null,
      to_state: "new",
      is_backward: false,
      note: data.source === "third_party" ? "Von Hand erfasst — Angaben von dritter Seite." : "Von Hand erfasst — Angaben von der Person selbst.",
      actor_id: me.profile!.id,
    });
    if (evErr) throw evErr;
    return { ok: true, id: (app as { id: string }).id };
  });

export const changeApplicationState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid(), to: z.string(), note: z.string().max(500).optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const me = await requireCastingModerator(context);
    const to = data.to as AppState;

    const { data: app } = await context.supabase
      .from("applications")
      .select("id, state, household_id")
      .eq("id", data.applicationId)
      .maybeSingle();
    const a = app as { id: string; state: AppState; household_id: string } | null;
    if (!a) throw new Error("Bewerbung nicht gefunden.");
    const from = a.state;

    const allowed =
      FORWARD[from]?.includes(to) ||
      SIDE[from]?.includes(to) ||
      BACKWARD[from]?.includes(to) ||
      (from === "archived" && to !== "archived");
    if (!allowed) throw new Error(`Von „${from}" nach „${to}" ist nicht erlaubt.`);

    const { error } = await context.supabase.from("applications").update({ state: to }).eq("id", a.id);
    if (error) throw error;
    const isBackward = BACKWARD[from]?.includes(to) || (from === "archived" && to !== "archived");
    const { error: evErr } = await context.supabase.from("application_events").insert({
      application_id: a.id,
      household_id: a.household_id,
      from_state: from,
      to_state: to,
      is_backward: isBackward,
      note: data.note ?? null,
      actor_id: me.profile!.id,
    });
    if (evErr) throw evErr;
    return { ok: true };
  });

export const deleteApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireCastingModerator(context);
    const { error } = await context.supabase.from("applications").delete().eq("id", data.applicationId);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Mitglieder, Zimmer, Regeln ----------

export const updateMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      profileId: z.string().uuid(),
      action: z.enum(["grant_moderator", "revoke_moderator", "mark_moved_out", "reactivate", "set_contact"]),
      contact: z.string().max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireModerator(context);
    if (data.action === "grant_moderator") {
      const { error } = await context.supabase.from("user_roles").upsert({ profile_id: data.profileId, role: "moderator" }, { onConflict: "profile_id,role" });
      if (error) throw error;
    } else if (data.action === "revoke_moderator") {
      const { error } = await context.supabase.from("user_roles").delete().eq("profile_id", data.profileId).eq("role", "moderator");
      if (error) throw error;
    } else if (data.action === "set_contact") {
      const { error } = await context.supabase
        .from("profiles")
        .update({ contact: data.contact?.trim() || null })
        .eq("id", data.profileId);
      if (error) throw error;
    } else if (data.action === "reactivate") {
      const { error } = await context.supabase
        .from("profiles")
        .update({ status: "active", is_voter: true, moved_out_on: null })
        .eq("id", data.profileId);
      if (error) {
        if ((error as { code?: string }).code === "23505") throw new Error("Es wohnt schon jemand mit diesem Namen hier.");
        throw error;
      }
      await context.supabase.from("user_roles").delete().eq("profile_id", data.profileId).eq("role", "former_resident");
      await context.supabase.from("user_roles").upsert({ profile_id: data.profileId, role: "resident" }, { onConflict: "profile_id,role" });
    } else {
      const { error } = await context.supabase
        .from("profiles")
        .update({ status: "moved_out", is_voter: false, moved_out_on: new Date().toISOString().slice(0, 10) })
        .eq("id", data.profileId);
      if (error) throw error;
      await context.supabase.from("user_roles").delete().eq("profile_id", data.profileId).in("role", ["resident", "moderator"]);
      await context.supabase.from("user_roles").upsert({ profile_id: data.profileId, role: "former_resident" }, { onConflict: "profile_id,role" });
    }
    return { ok: true };
  });

/**
 * Endgültiges Entfernen einer Person aus der WG (Schutz vor ungewollten Beitritten
 * über den Einladungslink). Alle Interaktionen verfallen, nicht umkehrbar.
 */
export const deleteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ profileId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const me = await requireModerator(context);
    if (!me.profile) throw new Error("Kein Profil gefunden.");
    if (me.profile.id === data.profileId) throw new Error("Du kannst dich nicht selbst löschen.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("id, household_id, user_id, display_name, user_roles(role)")
      .eq("id", data.profileId)
      .maybeSingle();
    if (!target || target.household_id !== me.profile.household_id) {
      throw new Error("Diese Person gehört nicht zu deiner WG.");
    }
    const roles = ((target as { user_roles?: { role: AppRole }[] }).user_roles ?? []).map((r) => r.role);
    if (roles.includes("household_account")) throw new Error("Das WG-Konto lässt sich nicht löschen.");

    await supabaseAdmin.from("votes").delete().eq("voter_id", data.profileId);
    await supabaseAdmin.from("round_participants").delete().eq("profile_id", data.profileId);
    await supabaseAdmin.from("notification_reads").delete().eq("profile_id", data.profileId);
    await supabaseAdmin.from("user_roles").delete().eq("profile_id", data.profileId);
    await supabaseAdmin.from("application_events").update({ actor_id: null }).eq("actor_id", data.profileId);
    await supabaseAdmin.from("applications").update({ created_by: null }).eq("created_by", data.profileId);
    await supabaseAdmin.from("applications").update({ became_resident_id: null }).eq("became_resident_id", data.profileId);
    await supabaseAdmin.from("invites").update({ created_by: null }).eq("created_by", data.profileId);

    const { error } = await supabaseAdmin.from("profiles").delete().eq("id", data.profileId);
    if (error) throw error;
    if (target.user_id) {
      await supabaseAdmin.auth.admin.deleteUser(target.user_id);
    }
    return { ok: true, name: target.display_name as string };
  });



export const saveRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1).max(80),
      sizeSqm: z.number().min(1).max(200).nullable().optional(),
      availableFrom: z.string().nullable().optional(),
      status: z.enum(["open", "promised", "occupied"]),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const me = await requireModerator(context);
    const patch = {
      name: data.name.trim(),
      size_sqm: data.sizeSqm ?? null,
      available_from: data.availableFrom || null,
      status: data.status,
    };
    if (data.id) {
      const { error } = await context.supabase.from("rooms").update(patch).eq("id", data.id);
      if (error) throw error;
    } else {
      const { error } = await context.supabase.from("rooms").insert({ ...patch, household_id: me.profile!.household_id });
      if (error) throw error;
    }
    return { ok: true };
  });

export const updateRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      hideResults: z.boolean(),
      quorumShare: z.number().min(0.1).max(1),
      favoriteBudgetFactor: z.number().min(1).max(3),
      weights: z.object({ no: z.number().min(0).max(10), rather_not: z.number().min(0).max(10), good: z.number().min(0).max(10), definitely: z.number().min(0).max(10) }),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const me = await requireModerator(context);
    const hh = me.profile!.household_id;
    const { data: openRound } = await context.supabase
      .from("rounds")
      .select("title")
      .eq("household_id", hh)
      .eq("status", "open")
      .maybeSingle();
    if (openRound) {
      throw new Error(`Solange „${(openRound as { title: string }).title}" offen ist, bleiben die Regeln unverändert. Schließe die Runde zuerst.`);
    }
    const { error } = await context.supabase
      .from("households")
      .update({
        hide_results_until_voted: data.hideResults,
        quorum_share: data.quorumShare,
        favorite_budget_factor: data.favoriteBudgetFactor,
        scale_weights: data.weights as never,
      })
      .eq("id", hh);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Einladungen ----------

export const createInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ label: z.string().max(80).optional(), days: z.number().int().min(1).max(60).default(7), maxUses: z.number().int().min(1).max(50).default(5) }).parse(d))
  .handler(async ({ context, data }): Promise<{ code: string }> => {
    const me = await requireModerator(context);
    const code = newInviteCode();
    const hash = await sha256Hex(code);
    const expires = new Date(Date.now() + data.days * 86400000).toISOString();
    const { error } = await context.supabase.from("invites").insert({
      household_id: me.profile!.household_id,
      code_hash: hash,
      // Der Klartext bleibt lesbar, damit die Moderation den Link später wieder herausgeben kann.
      code,
      label: data.label?.trim() || null,
      expires_at: expires,
      max_uses: data.maxUses,
      created_by: me.profile!.id,
    });
    if (error) throw error;
    return { code };
  });

export const updateInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), action: z.enum(["extend", "revoke"]), days: z.number().int().min(1).max(60).optional(), maxUses: z.number().int().min(1).max(50).optional() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireModerator(context);
    if (data.action === "revoke") {
      const { error } = await context.supabase.from("invites").update({ revoked: true }).eq("id", data.id);
      if (error) throw error;
      return { ok: true };
    }
    const patch: { expires_at: string; max_uses?: number } = {
      expires_at: new Date(Date.now() + (data.days ?? 7) * 86400000).toISOString(),
    };
    if (data.maxUses) patch.max_uses = data.maxUses;
    const { error } = await context.supabase.from("invites").update(patch).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/**
 * Anmelden ohne E-Mail: löst einen Anmeldenamen in die intern erzeugte
 * Login-Adresse auf. Echte E-Mail-Adressen werden nie herausgegeben.
 */
export const resolveLoginEmail = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ identifier: z.string().min(2).max(80) }).parse(d))
  .handler(async ({ data }): Promise<{ email: string | null }> => {
    const wanted = normalizeName(data.identifier);
    if (wanted.includes("@")) return { email: data.identifier.trim() };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("display_name, user_id")
      .eq("status", "active");
    const match = (profiles ?? []).find((p) => normalizeName(p.display_name) === wanted && p.user_id);
    if (!match?.user_id) return { email: null };
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(match.user_id);
    const email = user?.user?.email ?? null;
    // Nur intern erzeugte Adressen verlassen den Server.
    return { email: email && email.endsWith("@wg.local") ? email : null };
  });

// ---------- Einstellungen (E1) ----------

export const getAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ email: string | null; hasRealEmail: boolean; displayName: string }> => {
    const me = await loadContext(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = data?.user?.email ?? null;
    return {
      email,
      hasRealEmail: Boolean(email && !email.endsWith("@wg.local")),
      displayName: me.profile?.display_name ?? "",
    };
  });

export const updatePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ password: z.string().min(8).max(120) }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** E-Mail nachtragen — damit man wieder reinkommt, nie als Sperre. */
export const addEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ email: z.string().email().max(160) }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      email: data.email.trim().toLowerCase(),
      email_confirm: true,
    });
    if (error) {
      if (/already|registered|exists/i.test(error.message)) {
        throw new Error("Diese E-Mail-Adresse gehört schon zu einem anderen Konto.");
      }
      throw new Error(error.message);
    }
    return { ok: true };
  });

/** Das WG-Konto legt sich zusätzlich ein Bewohner-Profil an (ADR-013, eigener Login). */
export const createResidentProfileForOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ displayName: z.string().min(2).max(60), password: z.string().min(8).max(120) }).parse(d))
  .handler(async ({ context, data }): Promise<{ loginEmail: string }> => {
    const me = await loadContext(context.supabase, context.userId);
    if (!me.profile || !me.isHouseholdAccount) throw new Error("Das kann nur das WG-Konto.");
    const hh = me.profile.household_id;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const wanted = normalizeName(data.displayName);
    const { data: members } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("household_id", hh)
      .eq("status", "active");
    if ((members ?? []).some((m) => normalizeName(m.display_name) === wanted)) {
      throw new Error(`„${data.displayName.trim()}" wohnt hier schon — wähle bitte einen anderen Namen.`);
    }

    const loginEmail = `${wanted.replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}@wg.local`;
    const { data: created, error: uErr } = await supabaseAdmin.auth.admin.createUser({
      email: loginEmail,
      password: data.password,
      email_confirm: true,
    });
    if (uErr || !created?.user) throw new Error("Das Bewohner-Profil konnte nicht angelegt werden.");

    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .insert({
        user_id: created.user.id,
        household_id: hh,
        display_name: data.displayName.trim(),
        status: "active",
        is_voter: true,
        moved_in_on: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();
    if (pErr) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error("Das Bewohner-Profil konnte nicht angelegt werden.");
    }
    await supabaseAdmin.from("user_roles").insert({ profile_id: (profile as { id: string }).id, role: "resident" });
    return { loginEmail };
  });

// ---------- Mitteilungen (Verlauf in der App) ----------

export interface FmNotification {
  id: string;
  created_at: string;
  /** Namen der betroffenen Bewerbungen — mehrere, wenn eine Handlung mehrere betraf (ADR-003, correlation_id). */
  names: string[];
  applicant_name: string;
  from_state: AppState | null;
  to_state: AppState;
  is_backward: boolean;
  note: string | null;
  actor_name: string | null;
  unread: boolean;
}

export const getNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: FmNotification[]; unread: number }> => {
    const me = await loadContext(context.supabase, context.userId);
    if (!me.profile) return { items: [], unread: 0 };

    const { data: seenRow } = await context.supabase
      .from("notification_reads")
      .select("last_seen_at")
      .eq("profile_id", me.profile.id)
      .maybeSingle();
    const lastSeen = seenRow ? new Date((seenRow as { last_seen_at: string }).last_seen_at).getTime() : 0;

    const { data, error } = await context.supabase
      .from("application_events")
      .select(
        "id, created_at, from_state, to_state, is_backward, note, applications(applicant_name, became_resident_id), actor:profiles!application_events_actor_id_fkey(display_name)",
      )
      .eq("household_id", me.profile.household_id)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw error;

    type Row = {
      id: string;
      created_at: string;
      from_state: AppState | null;
      to_state: AppState;
      is_backward: boolean;
      note: string | null;
      applications: { applicant_name: string; became_resident_id: string | null } | null;
      actor: { display_name: string } | null;
    };

    const rows = ((data ?? []) as unknown as Row[])
      // Die eigene Bewerbung bleibt unsichtbar (Sichtbarkeitsinvariante).
      .filter((r) => r.applications && r.applications.became_resident_id !== me.profile!.id);

    // ADR-003: Ereignisse einer Handlung sind eine Zeile, nicht zwölf.
    // Ohne correlation_id bündeln wir über gleiche Handlung + Zeitfenster.
    const WINDOW_MS = 10 * 60 * 1000;
    const items: FmNotification[] = [];
    for (const r of rows) {
      const last = items[items.length - 1];
      const sameAction =
        last &&
        last.from_state === r.from_state &&
        last.to_state === r.to_state &&
        last.is_backward === r.is_backward &&
        last.note === r.note &&
        last.actor_name === (r.actor?.display_name ?? null) &&
        new Date(last.created_at).getTime() - new Date(r.created_at).getTime() < WINDOW_MS;
      if (sameAction) {
        last.names.push(r.applications!.applicant_name);
        continue;
      }
      items.push({
        id: r.id,
        created_at: r.created_at,
        names: [r.applications!.applicant_name],
        applicant_name: r.applications!.applicant_name,
        from_state: r.from_state,
        to_state: r.to_state,
        is_backward: r.is_backward,
        note: r.note,
        actor_name: r.actor?.display_name ?? null,
        unread: new Date(r.created_at).getTime() > lastSeen,
      });
    }

    return { items, unread: items.filter((i) => i.unread).length };
  });

export const markNotificationsSeen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const me = await loadContext(context.supabase, context.userId);
    if (!me.profile) return { ok: true };
    const { error } = await context.supabase
      .from("notification_reads")
      .upsert({ profile_id: me.profile.id, last_seen_at: new Date().toISOString() }, { onConflict: "profile_id" });
    if (error) throw error;
    return { ok: true };
  });
