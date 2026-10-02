import { and, eq, inArray, isNull } from "drizzle-orm";
import { isUuid, withSessionContext, type SessionContext } from "@/db/session-context";
import {
  ProfileRequiredError,
  ROUND_STATUSES,
  listVoteCandidatesTx,
  listVoterRoundsTx,
  type RoundStatus,
  type VoteCandidate,
} from "@/modules/casting/repository";
import {
  HouseholdAccountCannotVoteError,
  PermissionDeniedError,
  assertAccountCanVoteTx,
  assertHasPermissionTx,
  assertHoldsAnyPermissionTx,
} from "@/modules/identity/repository";
import { parseScaleWeights, type ScaleWeights } from "./scale-weights";
import { vote } from "./schema";
import { VOTE_VALUES, type VoteValue } from "./vote-values";

type Tx = Parameters<Parameters<typeof withSessionContext>[1]>[0];

// ---------------------------------------------------------------------------------------------
// Deliberation's repository (F4 change 1, design D3-D5). The vote rules live in the database
// (drizzle/0028 `vote_guard`); this file maps its refusals to typed codes and owns the one
// definition of "awaiting my vote", used by the deck and by Start's T-5 count. It reads casting
// data only through casting's two query ports, never in its own SQL (kontextgrenzen.md §4).
// ---------------------------------------------------------------------------------------------

export type VoteErrorCode =
  | "invalid_input"
  | "not_found"
  | "round_not_open"
  | "not_eligible"
  | "not_votable"
  | "own_application";

export class VoteError extends Error {
  readonly code: VoteErrorCode;
  readonly roundStatus?: RoundStatus;
  constructor(code: VoteErrorCode, roundStatus?: RoundStatus) {
    super(`Vote refused: ${code}`);
    this.name = "VoteError";
    this.code = code;
    this.roundStatus = roundStatus;
  }
}

// Any database error castVote does not map. Drizzle's own message ("Failed query ... params: ...")
// holds the vote value and the ids, which are personal, so it must never reach a log or the
// client: the message here names the SQLSTATE and the constraint only. `cause` is kept for a
// debugger, not for output (capture D4, "No value leaves in an error").
export class VoteWriteError extends Error {
  readonly code = "db_refused";
  readonly sqlState: string | null;
  readonly constraint: string | null;
  constructor(sqlState: string | null, constraint: string | null, cause: unknown) {
    super(
      `Vote write refused by the database (${sqlState ?? "unknown"}${constraint ? `, ${constraint}` : ""})`,
      { cause },
    );
    this.name = "VoteWriteError";
    this.sqlState = sqlState;
    this.constraint = constraint;
  }
}

// The constraint names `vote_guard` raises, and the code each becomes. `vote_identity_immutable`
// is deliberately absent: it can only mean a bug, so it is wrapped like any unknown error.
const CONSTRAINT_TO_CODE: Readonly<Record<string, VoteErrorCode>> = {
  vote_round_open: "round_not_open",
  vote_voter_eligible: "not_eligible",
  vote_application_paired: "not_found",
  vote_not_own_application: "own_application",
  vote_application_votable: "not_votable",
};

function readDatabaseError(err: unknown): {
  sqlState: string | null;
  constraint: string | null;
  detail: string | null;
} {
  // The postgres driver's error is on `cause` for a Drizzle-wrapped one, or the error itself.
  const candidates = [err, (err as { cause?: unknown } | null)?.cause];
  let sqlState: string | null = null;
  let constraint: string | null = null;
  let detail: string | null = null;
  for (const c of candidates) {
    if (typeof c !== "object" || c === null) continue;
    const fields = c as { code?: unknown; constraint_name?: unknown; detail?: unknown };
    if (sqlState === null && typeof fields.code === "string" && /^[0-9A-Z]{5}$/.test(fields.code)) {
      sqlState = fields.code;
    }
    if (
      constraint === null &&
      typeof fields.constraint_name === "string" &&
      /^[A-Za-z0-9_]{1,63}$/.test(fields.constraint_name)
    ) {
      constraint = fields.constraint_name;
    }
    if (detail === null && typeof fields.detail === "string") detail = fields.detail;
  }
  return { sqlState, constraint, detail };
}

function toVoteError(err: unknown): VoteError | VoteWriteError {
  const { sqlState, constraint, detail } = readDatabaseError(err);
  const code = constraint !== null && sqlState === "23514" ? CONSTRAINT_TO_CODE[constraint] : undefined;
  if (code === undefined) return new VoteWriteError(sqlState, constraint, err);
  // The trigger puts the round's status in DETAIL; it is kept only if it is a real status.
  const roundStatus =
    code === "round_not_open" && detail !== null && (ROUND_STATUSES as readonly string[]).includes(detail)
      ? (detail as RoundStatus)
      : undefined;
  return new VoteError(code, roundStatus);
}

// "Awaiting my vote" (design D3): casting's candidates for these rounds, minus those on which the
// viewer holds a non-withdrawn `invite` vote. The single definition; the deck and T-5 both call it.
async function awaitingVoteTx(
  tx: Tx,
  context: SessionContext,
  roundIds: string[],
  options: { withCard: boolean },
): Promise<VoteCandidate[]> {
  if (context.profileId === null) throw new ProfileRequiredError("awaitingVote");
  const candidates = await listVoteCandidatesTx(tx, context, roundIds, options);
  if (candidates.length === 0) return [];
  const rated = await tx
    .select({ applicationId: vote.applicationId })
    .from(vote)
    .where(
      and(
        eq(vote.householdId, context.householdId),
        eq(vote.residentProfileId, context.profileId),
        eq(vote.stage, "invite"),
        isNull(vote.withdrawnAt),
        inArray(
          vote.applicationId,
          candidates.map((c) => c.applicationId),
        ),
      ),
    );
  const ratedIds = new Set(rated.map((r) => r.applicationId));
  return candidates.filter((c) => !ratedIds.has(c.applicationId));
}

// T-5 per open round the viewer may vote in. A profile-less context gets an empty map with no
// query (start spec, "No application-derived number for the household account"). A round missing
// from the map counts 0. Matrix row „Vote abgeben / ändern": the stored `vote` permission is
// checked first inside this transaction (F3 change 2b, design D11); a caller that does not hold it
// gets the same empty map as the household account, not an error.
export async function getAwaitingVoteCounts(context: SessionContext): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (context.profileId === null) return counts;
  return withSessionContext(context, async (tx) => {
    try {
      // A count read: no row lock (identity's rule for a read that returns nothing an ended
      // membership could not see), so Start does not hold the caller's membership row.
      await assertHoldsAnyPermissionTx(tx, context, ["vote"], { lock: false });
    } catch (err) {
      if (err instanceof PermissionDeniedError) return counts;
      throw err;
    }
    const rounds = (await listVoterRoundsTx(tx, context)).filter((r) => r.status === "open");
    if (rounds.length === 0) return counts;
    const awaiting = await awaitingVoteTx(
      tx,
      context,
      rounds.map((r) => r.roundId),
      { withCard: false },
    );
    for (const c of awaiting) counts.set(c.roundId, (counts.get(c.roundId) ?? 0) + 1);
    return counts;
  });
}

export interface ScreeningCard {
  applicationId: string;
  applicantName: string;
  age: number | null;
  messageRaw: string | null;
  // Passed through as stored: the CHECK of drizzle/0025 is their validator.
  attributes: { label: string; value: string }[] | null;
}

export type ScreeningPass =
  | { kind: "deck"; round: { id: string; title: string }; weights: ScaleWeights; cards: ScreeningCard[] }
  | { kind: "empty" }
  | { kind: "refused"; reason: "not_eligible" | "rules_invalid" }
  | { kind: "refused"; reason: "round_not_open"; status: RoundStatus };

// The screen's state, decided in one transaction (design D4). `roundId` null picks the newest open
// round that still awaits the viewer. Nothing about the pass is stored; the client holds the deck.
// Matrix row „Vote abgeben / ändern": the stored `vote` permission is checked first inside the
// transaction (F3 change 2b, design D11), on top of the participation the reads below already
// require; a caller without it gets the `not_eligible` refusal the screen already renders.
export async function getScreeningPass(context: SessionContext, roundId: string | null): Promise<ScreeningPass> {
  if (context.profileId === null) throw new ProfileRequiredError("getScreeningPass");
  return withSessionContext(context, async (tx): Promise<ScreeningPass> => {
    try {
      await assertHasPermissionTx(tx, context, "vote");
    } catch (err) {
      if (err instanceof PermissionDeniedError) return { kind: "refused", reason: "not_eligible" };
      throw err;
    }
    let round;
    if (roundId === null) {
      const open = (await listVoterRoundsTx(tx, context)).filter((r) => r.status === "open");
      if (open.length === 0) return { kind: "empty" };
      const awaiting = await awaitingVoteTx(
        tx,
        context,
        open.map((r) => r.roundId),
        { withCard: false },
      );
      const withWork = new Set(awaiting.map((c) => c.roundId));
      // `open` is ordered newest first.
      round = open.find((r) => withWork.has(r.roundId));
      if (!round) return { kind: "empty" };
    } else {
      // A malformed id or no voter row is the same refusal, and names no title (EC-4.3, V-2).
      const [found] = await listVoterRoundsTx(tx, context, { roundId });
      if (!found) return { kind: "refused", reason: "not_eligible" };
      if (found.status !== "open") return { kind: "refused", reason: "round_not_open", status: found.status };
      round = found;
    }

    const snapshot = round.settingsSnapshot as { scaleWeights?: unknown } | null;
    const weights = parseScaleWeights(snapshot?.scaleWeights);
    if (weights === null) return { kind: "refused", reason: "rules_invalid" };

    const awaiting = await awaitingVoteTx(tx, context, [round.roundId], { withCard: true });
    if (awaiting.length === 0) return { kind: "empty" };
    const cards: ScreeningCard[] = awaiting.map((c) => ({
      applicationId: c.applicationId,
      applicantName: c.card?.applicantName ?? "",
      age: c.card?.age ?? null,
      messageRaw: c.card?.messageRaw ?? null,
      attributes: (c.card?.attributes ?? null) as ScreeningCard["attributes"],
    }));
    return { kind: "deck", round: { id: round.roundId, title: round.title }, weights, cards };
  });
}

// One rating, one statement (design D5). The trigger decides round, eligibility, pairing and
// votability under lock; there is deliberately no TypeScript pre-check of those, which would be a
// second copy of the rule that can drift from it. Only the profile refusal and the input check
// come early, because they must issue no query at all.
export async function castVote(
  context: SessionContext,
  input: { roundId: string; applicationId: string; value: string },
): Promise<void> {
  if (context.profileId === null) throw new ProfileRequiredError("castVote");
  const profileId = context.profileId;
  const { roundId, applicationId, value } = input;
  if (
    typeof roundId !== "string" ||
    typeof applicationId !== "string" ||
    !isUuid(roundId) ||
    !isUuid(applicationId) ||
    !(VOTE_VALUES as readonly string[]).includes(value)
  ) {
    throw new VoteError("invalid_input");
  }
  // FR-1.7: the stored `vote` permission, checked first INSIDE the insert's transaction with the
  // caller's membership locked FOR SHARE (F3 change 2b, design D11): a move-out or a stripped
  // `vote` committed first is seen, and one in flight is waited for. A stale context (a member who
  // moved out or was removed while the session lived) has no live membership and lands here. The
  // household account and a moderator without a resident profile hold no `vote`. Lock order:
  // membership first, then the trigger's profile/round locks (identity/repository.ts,
  // revokeMembershipForProfileTx).
  try {
    await withSessionContext(context, async (tx) => {
      try {
        await assertAccountCanVoteTx(tx, context);
      } catch (err) {
        if (err instanceof HouseholdAccountCannotVoteError) throw new VoteError("not_eligible");
        throw err;
      }
      await tx
        .insert(vote)
        .values({
          householdId: context.householdId,
          roundId,
          applicationId,
          residentProfileId: profileId,
          stage: "invite",
          value: value as VoteValue,
        })
        .onConflictDoUpdate({
          target: [vote.applicationId, vote.residentProfileId, vote.stage],
          set: { value: value as VoteValue, withdrawnAt: null },
        });
    });
  } catch (err) {
    if (err instanceof VoteError) throw err;
    throw toVoteError(err);
  }
}
