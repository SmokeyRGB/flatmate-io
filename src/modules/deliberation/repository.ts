import { and, eq, inArray, isNull } from "drizzle-orm";
import { isUuid, withSessionContext, type SessionContext } from "@/db/session-context";
import {
  ProfileRequiredError,
  ROUND_STATUSES,
  getRoundTallyBasisTx,
  getVoteCandidateCardTx,
  listVoteCandidatesTx,
  listVoterRoundsTx,
  type RoundStatus,
  type VoteCandidate,
  type VoteCandidateOptions,
} from "@/modules/casting/repository";
import {
  HouseholdAccountCannotVoteError,
  PermissionDeniedError,
  assertAccountCanVoteTx,
  assertHasPermissionTx,
  assertHoldsAnyPermissionTx,
} from "@/modules/identity/repository";
import { computeRanking, explainScore, quorumNeeded, type ScoreExplanation } from "./ranking";
import { parseRoundRules, parseScaleWeights, type RoundRules, type ScaleWeights } from "./round-rules";
import { vote } from "./schema";
import { VOTE_VALUES, type VoteValue } from "./vote-values";

type Tx = Parameters<Parameters<typeof withSessionContext>[1]>[0];

// ---------------------------------------------------------------------------------------------
// Deliberation's repository (F4 change 1, design D3-D5). The vote rules live in the database
// (drizzle/0028 `vote_guard`); this file maps its refusals to typed codes and owns the one
// definition of "awaiting my vote", used by the deck and by Start's T-5 count. It reads casting
// data only through casting's query ports, never in its own SQL (kontextgrenzen.md §4).
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
  options: Extract<VoteCandidateOptions, { scope: "votable" }>,
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
// query (start spec, "No application-derived number for the household account"). Every open round
// the viewer may vote in has an entry, 0 when nothing awaits; a round with NO entry is unknown (the
// caller was refused), which only the acknowledgement treats differently from 0. Matrix row „Vote abgeben / ändern": the stored `vote` permission is
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
    // An explicit 0 for every open round the viewer may vote in: "nothing awaiting" is then told
    // apart from "no answer" (refused above), which has no entry at all.
    for (const r of rounds) counts.set(r.roundId, 0);
    const awaiting = await awaitingVoteTx(
      tx,
      context,
      rounds.map((r) => r.roundId),
      { scope: "votable", fields: "ids" },
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
        { scope: "votable", fields: "ids" },
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

    const awaiting = await awaitingVoteTx(tx, context, [round.roundId], { scope: "votable", fields: "cards" });
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

export interface ScoredRow {
  applicationId: string;
  applicantName: string;
  state: VoteCandidate["state"];
  score: number;
  n: number;
  leading: boolean;
}

// No `score` key at all (AC-5.4, C-5.1): NO_SCORE is not a number in the types.
export interface UnscoredRow {
  applicationId: string;
  applicantName: string;
  state: VoteCandidate["state"];
  n: number;
  needed: number;
}

// A row whose results the viewer may not see yet (V-4): exactly these three keys, and no result
// field of any kind, so AC-5.16 holds by type and by test.
export interface HiddenRow {
  applicationId: string;
  applicantName: string;
  state: VoteCandidate["state"];
}

export interface RankedGroup {
  scored: ScoredRow[];
  unscored: UnscoredRow[];
}

export type Ranking =
  | {
      kind: "board";
      round: { id: string; title: string; status: RoundStatus };
      rules: { weights: ScaleWeights; needed: number; denominator: number };
      openRoomCount: number;
      // Design D10: the applications still being decided (`new`/`screened`), the invited ones
      // (nobody can vote on them any more), and the rows the viewer may not see yet.
      decided: RankedGroup;
      invited: RankedGroup;
      // The applications out of the running (rejected, declined, withdrawn), kept on the board until
      // deleted (candidate-detail D9, human decision 2026-10-07). Ranked like `invited`: no highlight.
      closed: RankedGroup;
      hidden: HiddenRow[];
    }
  | { kind: "none" }
  | { kind: "refused"; reason: "not_eligible" | "rules_invalid" }
  | { kind: "refused"; reason: "round_not_available"; status: RoundStatus };

// F5 change 1 (ranking), design D4: the scoreboard's one read, in ONE transaction, read-only. It
// enforces before anything reaches the client: V-2 (a participant only), V-1 (the own application
// is absent from every list and count: the candidate port's predicate) and V-4 (results per
// candidate only after one's own non-withdrawn `invite` vote, or once nobody can vote on it). `roundId` null picks the newest
// `open` or `paused` round the viewer takes part in; a closed or archived round is refused, since
// no path closes a round yet and `quorum_denominator_frozen` has no writer (F-12).
//
// Authorization matrix: a read. The stored `vote` permission is checked first inside the
// transaction (the lock it takes is the one every permission-checked read takes, FOR SHARE on the
// caller's membership row, taken first so the lock order is unchanged); a caller without it gets
// `not_eligible`, the refusal the screen already renders. Its visibility is tested in
// tests/integration/deliberation/ranking.test.ts.
//
// Consistency without a stricter isolation level: reveal and aggregate come from ONE statement
// (the vote read), so a castVote committing mid-read cannot make a row visible without its new
// vote or the reverse. The tally basis is a separate statement, but a vote counts only if its
// voter is in that same set, so numerator <= denominator always holds.
export async function getRanking(context: SessionContext, roundId: string | null): Promise<Ranking> {
  if (context.profileId === null) throw new ProfileRequiredError("getRanking");
  return withSessionContext(context, async (tx): Promise<Ranking> => {
    try {
      await assertHasPermissionTx(tx, context, "vote");
    } catch (err) {
      if (err instanceof PermissionDeniedError) return { kind: "refused", reason: "not_eligible" };
      throw err;
    }

    let round;
    if (roundId === null) {
      round = (await listVoterRoundsTx(tx, context)).find((r) => r.status === "open" || r.status === "paused");
      if (!round) return { kind: "none" };
    } else {
      // A malformed id or no voter row is the same refusal and names no title (V-2).
      const [found] = await listVoterRoundsTx(tx, context, { roundId });
      if (!found) return { kind: "refused", reason: "not_eligible" };
      if (found.status !== "open" && found.status !== "paused") {
        return { kind: "refused", reason: "round_not_available", status: found.status };
      }
      round = found;
    }

    const rules = parseRoundRules(round.settingsSnapshot);
    if (rules === null) return { kind: "refused", reason: "rules_invalid" };

    const tally = await readRoundTallyTx(tx, context, round.roundId, rules);
    if (tally === null) return { kind: "refused", reason: "not_eligible" };
    const { candidates, denominator, countedValues, isVisible } = tally;

    const visible = candidates.filter(isVisible);
    const hidden: HiddenRow[] = candidates
      .filter((c) => !isVisible(c))
      .map((c) => ({ applicationId: c.applicationId, applicantName: c.applicantName ?? "", state: c.state }));

    // The sort is a total order on per-candidate keys, so ranking only a subset keeps the relative
    // order. Each group is ranked on its own: the highlight slots (Q-15) go to the decided group
    // only, and an invited or closed row never takes one (N = 0 there).
    const byId = new Map(visible.map((c) => [c.applicationId, c]));
    const orderOf = new Map(candidates.map((c, i) => [c.applicationId, i]));
    const rankGroup = (group: typeof visible, slots: number): RankedGroup => {
      const ranked = computeRanking({
        weights: rules.weights,
        quorumShare: rules.quorumShare,
        denominator,
        openRoomCount: slots,
        // `order` is the candidate's position in the port's full-precision (created_at, id) order;
        // `createdAt` is a millisecond Date and cannot tell two applications of one millisecond apart.
        candidates: group.map((c) => ({
          id: c.applicationId,
          order: orderOf.get(c.applicationId)!,
          values: (countedValues.get(c.applicationId) ?? []).map((v) => v.value),
        })),
      });
      return {
        scored: ranked.scored.map((r) => {
          const c = byId.get(r.id)!;
          return {
            applicationId: r.id,
            applicantName: c.applicantName ?? "",
            state: c.state,
            score: r.score,
            n: r.n,
            leading: r.leading,
          };
        }),
        unscored: ranked.unscored.map((r) => {
          const c = byId.get(r.id)!;
          return {
            applicationId: r.id,
            applicantName: c.applicantName ?? "",
            state: c.state,
            n: r.n,
            needed: r.needed,
          };
        }),
      };
    };
    // "Decided" is an explicit new/screened test, so the end states cannot fall into it (D9).
    const isDecided = (c: VoteCandidate) => c.state === "new" || c.state === "screened";
    return {
      kind: "board",
      round: { id: round.roundId, title: round.title, status: round.status },
      rules: { weights: rules.weights, needed: quorumNeeded(rules.quorumShare, denominator), denominator },
      openRoomCount: tally.openRoomCount,
      decided: rankGroup(visible.filter(isDecided), tally.openRoomCount),
      invited: rankGroup(
        visible.filter((c) => c.state === "invited"),
        0,
      ),
      closed: rankGroup(
        visible.filter((c) => CLOSED_STATES.includes(c.state)),
        0,
      ),
      hidden,
    };
  });
}

// The applications out of the running (candidate-detail D9, human decision 2026-10-07).
const CLOSED_STATES: VoteCandidate["state"][] = ["rejected_by_household", "declined_by_applicant", "withdrawn"];

interface RoundTally {
  // The board-scope candidates, oldest first (the port's order).
  candidates: VoteCandidate[];
  denominator: number;
  openRoomCount: number;
  // The counted voters (the quorum denominator's set) with their display names. Names never reach
  // a board payload; the detail reads them only when the round's frozen flag is on.
  countedVoters: { id: string; displayName: string }[];
  // Per candidate: the counted votes, with the voter. A vote counts only if its voter is in the tally
  // basis' set, so numerator <= denominator always holds.
  countedValues: Map<string, { voterId: string; value: VoteValue }[]>;
  // Per candidate: the votes of voters who are no longer counted (former members, Q-6).
  formerCounts: Map<string, number>;
  ownVoted: Set<string>;
  isVisible: (c: VoteCandidate) => boolean;
}

// The core both the scoreboard and the candidate detail run (candidate-detail design D2), so the two
// can never disagree on visibility or numbers. Null when the tally basis is null (the viewer is no
// longer a counted voter): the caller refuses `not_eligible`. The statement order is the consistency
// argument below and was moved here verbatim from getRanking.
async function readRoundTallyTx(
  tx: Tx,
  context: SessionContext,
  roundId: string,
  rules: RoundRules,
): Promise<RoundTally | null> {
  const viewerId = context.profileId!;
  // ORDER IS THE CONSISTENCY ARGUMENT (Copilot round on PR #54; no stricter isolation level,
  // since REPEATABLE READ would turn assertHasPermissionTx's FOR SHARE on the membership row
  // into a 40001 whenever a concurrent move-out updates it). Step 1: ONE statement reads every
  // non-withdrawn `invite` vote of the round, scoped by household and round only. Step 2: the
  // candidates, with their state, are read AFTER it. A row is revealed only if its state, read
  // in step 2, is no longer new/screened. Every vote in the result was committed before that
  // read, and no vote can be cast on an invited application (`vote_guard`), so a revealed row
  // never carries a vote cast after the viewer could have been anchored by it. A vote committed
  // between the two reads is simply absent: conservative, never a leak. Reveal (the viewer's own
  // votes) and scoring (the counted votes) both come from this one vote statement, so a
  // castVote committing mid-read cannot show a row without its new vote or the reverse.
  const allVotes = await tx
    .select({
      applicationId: vote.applicationId,
      residentProfileId: vote.residentProfileId,
      value: vote.value,
    })
    .from(vote)
    .where(
      and(
        eq(vote.householdId, context.householdId),
        eq(vote.roundId, roundId),
        eq(vote.stage, "invite"),
        isNull(vote.withdrawnAt),
      ),
    );

  const candidates = await listVoteCandidatesTx(tx, context, [roundId], { scope: "board", fields: "names" });

  // The candidate and tally reads are separate statements under READ COMMITTED, so a move-out of
  // the viewer committing in between makes the port return null: refused, never thrown. An empty
  // set cannot reach here (the port returns null when the viewer is not in it), so a zero
  // denominator is this same refusal (EC-5.7), never `rules_invalid`.
  const basis = await getRoundTallyBasisTx(tx, context, roundId);
  if (basis === null) return null;
  const counted = new Set(basis.countedVoters.map((v) => v.id));

  // Only votes on the port's candidates may reach the result: nothing about another application
  // (the viewer's own included, V-1) can be counted, revealed or listed. A vote counts only if
  // its voter is in the tally basis' set, so numerator <= denominator always holds.
  const candidateIds = new Set(candidates.map((c) => c.applicationId));
  const ownVoted = new Set<string>();
  const countedValues = new Map<string, { voterId: string; value: VoteValue }[]>();
  const formerCounts = new Map<string, number>();
  for (const v of allVotes) {
    if (!candidateIds.has(v.applicationId)) continue;
    if (v.residentProfileId === viewerId) ownVoted.add(v.applicationId);
    if (counted.has(v.residentProfileId)) {
      const list = countedValues.get(v.applicationId) ?? [];
      list.push({ voterId: v.residentProfileId, value: v.value });
      countedValues.set(v.applicationId, list);
    } else {
      formerCounts.set(v.applicationId, (formerCounts.get(v.applicationId) ?? 0) + 1);
    }
  }

  // V-4, per candidate (design D4 step 8, D10). A candidate is visible when hiding is off, when
  // the viewer holds a vote on it, or when it is no longer `new`/`screened`: `vote_guard`
  // refuses every vote on it then, so there is nothing left to protect. A paused round reveals
  // nothing by itself, because voting resumes. A candidate that is not visible carries no
  // vote-derived field and is listed oldest first (the port's order), never by anything derived
  // from votes.
  const isVisible = (c: VoteCandidate) =>
    !rules.hideResultsUntilVoted ||
    ownVoted.has(c.applicationId) ||
    (c.state !== "new" && c.state !== "screened");

  return {
    candidates,
    denominator: basis.countedVoters.length,
    openRoomCount: basis.openRoomCount,
    countedVoters: basis.countedVoters,
    countedValues,
    formerCounts,
    ownVoted,
    isVisible,
  };
}

// ---------------------------------------------------------------------------------------------
// The candidate detail (F5 candidate-detail, screen D2). It re-reads everything under the
// scoreboard's rules: the same D2 core (`readRoundTallyTx`) and the same candidate predicate
// (`getVoteCandidateCardTx` shares `voteCandidateWhere` with the board list), so the detail and the
// board can never disagree on visibility or numbers. Voter ids never leave this function; display
// names leave it only when the ROUND's frozen `revealVoteAuthorship` is on.
// ---------------------------------------------------------------------------------------------

export type DetailCard = ScreeningCard & { state: VoteCandidate["state"] };

type DetailRound = { id: string; title: string; status: RoundStatus };

export type CandidateDetail =
  // Exactly these keys: no vote-derived field of any kind (V-4, AC-5.16).
  | { kind: "hidden"; round: DetailRound; application: { id: string; name: string; state: VoteCandidate["state"] } }
  // No `score`, no `distribution`, no `explanation` key: a score from too few votes is never shown.
  | {
      kind: "unscored";
      round: DetailRound;
      application: DetailCard;
      n: number;
      needed: number;
      denominator: number;
      formerCount: number;
      // The display names of the counted voters who voted, without any rating; null when the round's
      // frozen flag is off.
      voters: string[] | null;
    }
  | {
      kind: "scored";
      round: DetailRound;
      application: DetailCard;
      score: number;
      n: number;
      denominator: number;
      weights: ScaleWeights;
      distribution: Record<VoteValue, number>;
      explanation: ScoreExplanation;
      formerCount: number;
      // Display names per rating; null when the round's frozen flag is off.
      authorship: Record<VoteValue, string[]> | null;
    }
  | { kind: "refused"; reason: "not_found" | "not_eligible" | "rules_invalid" }
  | { kind: "refused"; reason: "round_not_available"; status: RoundStatus };

// Matrix row: a read. The stored `vote` permission is checked first inside the transaction, as on
// the board; a caller without it gets `not_eligible`. Every other refusal that would tell the viewer
// something about the application (own, foreign, unknown, malformed, not a participant, a state the
// board does not hold) is the one `not_found` (Q-9). Visibility is tested in
// tests/integration/deliberation/candidate-detail.test.ts.
export async function getCandidateDetail(context: SessionContext, applicationId: string): Promise<CandidateDetail> {
  if (context.profileId === null) throw new ProfileRequiredError("getCandidateDetail");
  return withSessionContext(context, async (tx): Promise<CandidateDetail> => {
    try {
      await assertHasPermissionTx(tx, context, "vote");
    } catch (err) {
      if (err instanceof PermissionDeniedError) return { kind: "refused", reason: "not_eligible" };
      throw err;
    }
    if (!isUuid(applicationId)) return { kind: "refused", reason: "not_found" };

    const rounds = await listVoterRoundsTx(tx, context);
    const card = await getVoteCandidateCardTx(
      tx,
      context,
      rounds.map((r) => r.roundId),
      applicationId,
    );
    if (card === null) return { kind: "refused", reason: "not_found" };
    const round = rounds.find((r) => r.roundId === card.roundId);
    if (!round) return { kind: "refused", reason: "not_found" };
    if (round.status !== "open" && round.status !== "paused") {
      return { kind: "refused", reason: "round_not_available", status: round.status };
    }
    const rules = parseRoundRules(round.settingsSnapshot);
    if (rules === null) return { kind: "refused", reason: "rules_invalid" };

    const tally = await readRoundTallyTx(tx, context, round.roundId, rules);
    if (tally === null) return { kind: "refused", reason: "not_eligible" };
    // Belt and braces: the port and the core use the same predicate, so this only fails when a
    // concurrent change lands between their two statements.
    const candidate = tally.candidates.find((c) => c.applicationId === applicationId);
    if (!candidate) return { kind: "refused", reason: "not_found" };

    const detailRound: DetailRound = { id: round.roundId, title: round.title, status: round.status };
    if (!tally.isVisible(candidate)) {
      return {
        kind: "hidden",
        round: detailRound,
        application: { id: card.applicationId, name: card.applicantName, state: candidate.state },
      };
    }

    const application: DetailCard = {
      applicationId: card.applicationId,
      applicantName: card.applicantName,
      age: card.age,
      messageRaw: card.messageRaw,
      // Passed through as stored: the CHECK of drizzle/0025 is their validator.
      attributes: card.attributes as ScreeningCard["attributes"],
      state: candidate.state,
    };
    const counted = tally.countedValues.get(applicationId) ?? [];
    const formerCount = tally.formerCounts.get(applicationId) ?? 0;
    const names = new Map(tally.countedVoters.map((v) => [v.id, v.displayName]));
    const collator = new Intl.Collator("de");
    const namesOf = (voterIds: string[]) => voterIds.map((id) => names.get(id) ?? "").sort(collator.compare);

    // The score is the ranking's own function over this one candidate: score and quorum are
    // per-candidate, so this equals its board score. It is never re-implemented.
    const ranked = computeRanking({
      weights: rules.weights,
      quorumShare: rules.quorumShare,
      denominator: tally.denominator,
      openRoomCount: 0,
      candidates: [{ id: applicationId, order: 0, values: counted.map((v) => v.value) }],
    });
    const scored = ranked.scored[0];
    if (!scored) {
      const pending = ranked.unscored[0];
      return {
        kind: "unscored",
        round: detailRound,
        application,
        n: pending.n,
        needed: pending.needed,
        denominator: tally.denominator,
        formerCount,
        voters: rules.revealVoteAuthorship ? namesOf(counted.map((v) => v.voterId)) : null,
      };
    }
    const distribution = Object.fromEntries(
      VOTE_VALUES.map((value) => [value, counted.filter((v) => v.value === value).length]),
    ) as Record<VoteValue, number>;
    const authorship = rules.revealVoteAuthorship
      ? (Object.fromEntries(
          VOTE_VALUES.map((value) => [value, namesOf(counted.filter((v) => v.value === value).map((v) => v.voterId))]),
        ) as Record<VoteValue, string[]>)
      : null;
    return {
      kind: "scored",
      round: detailRound,
      application,
      score: scored.score,
      n: scored.n,
      denominator: tally.denominator,
      weights: rules.weights,
      distribution,
      explanation: explainScore(
        rules.weights,
        counted.map((v) => v.value),
      ),
      formerCount,
      authorship,
    };
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
