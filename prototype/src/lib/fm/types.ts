import type { Database } from "@/integrations/supabase/types";

export type AppState = Database["public"]["Enums"]["application_state"];
export type VoteValue = Database["public"]["Enums"]["vote_value"];
export type AppRole = Database["public"]["Enums"]["app_role"];

export const VOTE_LABELS: Record<VoteValue, string> = {
  no: "Nein",
  rather_not: "Eher nicht",
  good: "Finde gut",
  definitely: "Unbedingt",
};

export const VOTE_WEIGHTS: Record<VoteValue, number> = {
  no: 0,
  rather_not: 1,
  good: 3,
  definitely: 5,
};

export const VOTE_ORDER: VoteValue[] = ["no", "rather_not", "good", "definitely"];

export const STATE_LABELS: Record<AppState, string> = {
  new: "Neu",
  screened: "Gesehen",
  invited: "Eingeladen",
  scheduled: "Termin vereinbart",
  interviewed: "Kennengelernt",
  offer_made: "Zusage gemacht",
  moved_in: "Eingezogen",
  rejected_by_household: "Abgelehnt von der WG",
  declined_by_applicant: "Abgesagt",
  withdrawn: "Zurückgezogen",
  archived: "Archiviert",
};

export const STATE_ORDER: AppState[] = [
  "new",
  "screened",
  "invited",
  "scheduled",
  "interviewed",
  "offer_made",
  "moved_in",
  "rejected_by_household",
  "declined_by_applicant",
  "withdrawn",
  "archived",
];

/** Zulässige Schritte vorwärts (Hauptpfad). */
export const FORWARD: Partial<Record<AppState, AppState[]>> = {
  new: ["screened"],
  screened: ["invited"],
  invited: ["scheduled"],
  scheduled: ["interviewed"],
  interviewed: ["offer_made"],
  offer_made: ["moved_in"],
};

/** Zulässige Seitenausgänge. */
export const SIDE: Partial<Record<AppState, AppState[]>> = {
  new: ["rejected_by_household", "withdrawn", "archived"],
  screened: ["rejected_by_household", "withdrawn", "archived"],
  invited: ["rejected_by_household", "declined_by_applicant", "withdrawn", "archived"],
  scheduled: ["rejected_by_household", "declined_by_applicant", "withdrawn", "archived"],
  interviewed: ["rejected_by_household", "declined_by_applicant", "withdrawn", "archived"],
  offer_made: ["declined_by_applicant", "withdrawn", "archived"],
  moved_in: ["declined_by_applicant", "archived"],
  rejected_by_household: ["archived"],
  declined_by_applicant: ["archived"],
  withdrawn: ["archived"],
};

/** Zulässige Rückschritte (jeder protokolliert, siehe S-15). */
export const BACKWARD: Partial<Record<AppState, AppState[]>> = {
  moved_in: ["offer_made"],
  rejected_by_household: ["screened"],
  declined_by_applicant: ["invited"],
  withdrawn: ["new"],
  archived: [], // vorheriger Zustand wird aus dem Protokoll ermittelt
};

export interface RankingRow {
  application_id: string;
  applicant_name: string;
  state: AppState;
  created_at: string;
  my_vote: VoteValue | null;
  visible: boolean;
  score: number | null;
  vote_count: number | null;
  votes_needed: number;
  quorum_reached: boolean;
  c_no: number | null;
  c_rather_not: number | null;
  c_good: number | null;
  c_definitely: number | null;
  is_self: boolean;
  age?: number | null;
  contact?: string | null;
  message?: string | null;
}

export type InfoSource = "applicant" | "third_party";

export const INFO_SOURCE_LABELS: Record<InfoSource, string> = {
  applicant: "Von der Person selbst",
  third_party: "Von dritter Seite",
};

export interface Invite {
  id: string;
  label: string | null;
  expires_at: string;
  max_uses: number;
  used_count: number;
  revoked: boolean;
  code: string | null;
}

export interface FmProfile {
  id: string;
  display_name: string;
  about: string | null;
  status: "active" | "moved_out";
  is_voter: boolean;
  household_id: string;
  contact?: string | null;
  moved_in_on?: string | null;
  moved_out_on?: string | null;
}

export interface FmContext {
  profile: FmProfile | null;
  roles: AppRole[];
  isModerator: boolean;
  isHouseholdAccount: boolean;
  householdName: string;
}

export interface Room {
  id: string;
  name: string;
  size_sqm: number | null;
  available_from: string | null;
  status: "open" | "promised" | "occupied";
}

export interface FmRound {
  id: string;
  title: string;
  status: "draft" | "open" | "closed" | "archived";
  hide_results_until_voted: boolean;
  quorum_share: number;
  settings_snapshot: { scale_weights: Record<VoteValue, number> };
  opened_at: string | null;
  closed_at: string | null;
  phase_deadline_at: string | null;
  rooms: Room[];
}

/* ---------- Phasenanzeige (Rahmenwerk §3) ---------- */

/** Hauptpfad — die Phase ergibt sich aus der am weitesten fortgeschrittenen Bewerbung. */
export const MAIN_PATH_ORDER: AppState[] = [
  "new",
  "screened",
  "invited",
  "scheduled",
  "interviewed",
  "offer_made",
  "moved_in",
];

const PHASE_BY_STATE: Partial<Record<AppState, string>> = {
  new: "Abstimmung Runde 1",
  screened: "Abstimmung Runde 1",
  invited: "Terminfindung",
  scheduled: "Terminfindung",
  interviewed: "Abstimmung Runde 2",
  offer_made: "Zusage läuft",
  moved_in: "Eingezogen",
};

/** Gruppen für die Verteilungszeile („7 in Sichtung · 2 im Termin · 1 gecastet"). */
const DISTRIBUTION: { label: (n: number) => string; states: AppState[] }[] = [
  { label: (n) => `${n} in Sichtung`, states: ["new", "screened"] },
  { label: (n) => `${n} im Termin`, states: ["invited", "scheduled", "interviewed"] },
  { label: (n) => `${n} gecastet`, states: ["offer_made", "moved_in"] },
  { label: (n) => (n === 1 ? `${n} abgesagt` : `${n} abgesagt`), states: ["rejected_by_household", "declined_by_applicant"] },
];

export function phaseLabel(counts: Partial<Record<AppState, number>>): string {
  for (const state of [...MAIN_PATH_ORDER].reverse()) {
    if ((counts[state] ?? 0) > 0) return PHASE_BY_STATE[state] ?? "Abstimmung Runde 1";
  }
  return "Warten auf Bewerbungen";
}

export function distributionLine(counts: Partial<Record<AppState, number>>): string {
  return DISTRIBUTION.map((g) => {
    const n = g.states.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
    return n > 0 ? g.label(n) : null;
  })
    .filter(Boolean)
    .join(" · ");
}

/** „noch 2 Tage" / „seit gestern fällig" — nie ohne die Phase daneben. */
export function deadlineLabel(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (days < 0) return `Frist seit ${Math.abs(days)} ${Math.abs(days) === 1 ? "Tag" : "Tagen"} überschritten`;
  if (days === 0) return "Frist heute";
  if (days === 1) return "noch 1 Tag";
  return `noch ${days} Tage`;
}
