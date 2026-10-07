import { EyeOff } from "lucide-react";
import Link from "next/link";
import { InviteDialog } from "@/app/(org)/rounds/[id]/applications/invite-dialog";
import type { RankedGroup, Ranking } from "@/modules/deliberation/repository";
import { LinkPendingHint } from "@/ui/link-pending-hint";
import { de } from "@/ui/strings";
import { Refusal } from "./refusal";
import { ScoreRing } from "./score-ring";
import { WeightsList } from "./weights-list";

const t = de.casting;

type BoardRanking = Extract<Ranking, { kind: "board" }>;
type Row = { applicationId: string; applicantName: string };

// F5 change 1, screen D1: the scoreboard. A pure render of what `getRanking` returned, so every
// visibility rule has already been applied in the repository (V-1, V-2, V-4); nothing here decides
// who may see what. A server component. Its one client island is `InviteDialog` („Einladen",
// F5 `candidate-invite`); apart from that, nothing on it is interactive except the "(?)" pop-over,
// which is native (as in the screening deck).
//
// There are no rank numbers anywhere (FR-5.10), no distribution (Q-10) and no word about a person
// (C-10, AC-5.28). A row without a score carries no ring and no numeral of its own, only the
// notice that names the real threshold (C-5.1).
//
// `canInvite` is decided by the page from the stored permission (never by a role, never here).
// Only the „Score" group receives it, so an invited or hidden row never carries „Einladen". The
// dialog gets the row's id and name, which the row already holds, and nothing else.
export function RankingBoard({ ranking, canInvite = false }: { ranking: Ranking; canInvite?: boolean }) {
  if (ranking.kind === "none") return <EmptyState title={null} />;
  if (ranking.kind === "refused") {
    if (ranking.reason === "round_not_available") {
      return <Refusal text={t.refusal.notAvailable(de.status.round[ranking.status])} />;
    }
    return <Refusal text={ranking.reason === "rules_invalid" ? t.refusal.rulesInvalid : t.refusal.notEligible} />;
  }
  const { decided, invited, closed, hidden } = ranking;
  const closedCount = closed.scored.length + closed.unscored.length;
  const total =
    decided.scored.length +
    decided.unscored.length +
    invited.scored.length +
    invited.unscored.length +
    closedCount +
    hidden.length;
  if (total === 0) return <EmptyState title={ranking.round.title} />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{ranking.round.title}</p>
          <p className="text-sm text-muted-foreground">
            {t.openRooms(ranking.openRoomCount)}
          </p>
        </div>
        <RulesPopover ranking={ranking} />
      </div>
      {/* Only this group highlights (design D10): the repository sets `leading` here and nowhere else. */}
      <Group
        heading={t.scoredHeading}
        group={decided}
        openRoomCount={ranking.openRoomCount}
        roundId={ranking.round.id}
        canInvite={canInvite}
      />
      <Group
        heading={t.invitedHeading}
        group={invited}
        openRoomCount={ranking.openRoomCount}
        roundId={ranking.round.id}
      />
      {/* The applications out of the running stay until deleted (candidate-detail D9, human decision
          2026-10-07): a native <details>, closed by default, so it needs no client JavaScript and is
          keyboard-operable. Its rows name their state and carry no „Einladen". */}
      {closedCount > 0 && (
        <details className="closed-group">
          <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">
            {t.closedHeading} {t.closedCount(closedCount)}
          </summary>
          <Rows
            group={closed}
            openRoomCount={ranking.openRoomCount}
            roundId={ranking.round.id}
            showState
            className="mt-3 space-y-3"
          />
        </details>
      )}
      {hidden.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">{t.hiddenHeading}</h2>
          <ul className="space-y-3">
            {hidden.map((row) => (
              <li key={row.applicationId} className="card ranking-row ranking-hidden">
                <EyeOff className="ranking-icon" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <RowName row={row} />
                  <p className="text-sm">{t.hidden}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// One group of the board: its heading and its rows. A group with no row renders nothing, not even a
// heading.
function Group({
  heading,
  group,
  openRoomCount,
  roundId,
  canInvite = false,
}: {
  heading: string;
  group: RankedGroup;
  openRoomCount: number;
  roundId: string;
  canInvite?: boolean;
}) {
  if (group.scored.length + group.unscored.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{heading}</h2>
      <Rows group={group} openRoomCount={openRoomCount} roundId={roundId} canInvite={canInvite} />
    </section>
  );
}

// A group's scored rows, then its unscored rows. The name and the ring are one link to the
// candidate's detail (F5 candidate-detail, D2); „Einladen" stays a sibling of the link, so the
// dialog never sits inside it. `showState` names the row's state, for the group out of the running.
function Rows({
  group,
  openRoomCount,
  roundId,
  canInvite = false,
  showState = false,
  className = "space-y-3",
}: {
  group: RankedGroup;
  openRoomCount: number;
  roundId: string;
  canInvite?: boolean;
  showState?: boolean;
  className?: string;
}) {
  return (
    <ul className={className}>
      {group.scored.map((row) => (
        <li key={row.applicationId} className={`card ranking-row${row.leading ? " ranking-leading" : ""}`}>
          <DetailLink applicationId={row.applicationId}>
            <ScoreRing score={row.score} n={row.n} />
            <div className="min-w-0 flex-1">
              <RowName row={row} />
              {showState && <StateLine state={row.state} />}
              <p className="text-xs text-muted-foreground">{t.scoreOf(row.n)}</p>
              {row.leading && <span className="sr-only">{t.leadingLabel(openRoomCount)}</span>}
            </div>
          </DetailLink>
          {canInvite && (
            <InviteDialog roundId={roundId} applicationId={row.applicationId} applicantName={row.applicantName} />
          )}
        </li>
      ))}
      {group.unscored.map((row) => (
        <li key={row.applicationId} className="card ranking-row">
          <DetailLink applicationId={row.applicationId}>
            <div className="min-w-0 flex-1">
              <RowName row={row} />
              {showState && <StateLine state={row.state} />}
              <p className="text-sm text-muted-foreground">{t.unscored(row.needed, row.n)}</p>
            </div>
          </DetailLink>
          {canInvite && (
            <InviteDialog roundId={roundId} applicationId={row.applicationId} applicantName={row.applicantName} />
          )}
        </li>
      ))}
    </ul>
  );
}

// The row's link to its detail. A plain link: a tap from the board is intercepted into the sliding
// card (casting/@detail), a direct address renders the full page.
function DetailLink({ applicationId, children }: { applicationId: string; children: React.ReactNode }) {
  return (
    <Link href={`/casting/candidate/${applicationId}`} className="ranking-link">
      {children}
      <LinkPendingHint />
    </Link>
  );
}

export function StateLine({ state }: { state: keyof typeof de.status.application }) {
  return <p className="text-xs text-muted-foreground">{de.status.application[state]}</p>;
}

// The group a row sits in says whether it is invited, so the row carries only the name.
function RowName({ row }: { row: Row }) {
  return <p className="truncate font-medium">{row.applicantName}</p>;
}

// "(?)": the round's frozen weights, the formula and the quorum rule with the round's real
// numbers, one tap away without leaving the screen (PRD 4.1.6, P-3). The trigger is a plain
// type="button", as in the deck, so it is never read as a submit.
function RulesPopover({ ranking }: { ranking: BoardRanking }) {
  return (
    <>
      <button type="button" className="deck-help" popoverTarget="ranking-rules-popover" aria-label={t.rulesToggleLabel}>
        {t.rulesToggle}
      </button>
      <div id="ranking-rules-popover" popover="auto" className="weights-popover card">
        <p className="font-semibold">{t.rulesHeading}</p>
        <p className="mt-3 text-sm text-muted-foreground">{t.formula}</p>
        <WeightsList weights={ranking.rules.weights} />
        <p className="mt-2 text-sm">{t.quorumRule(ranking.rules.needed, ranking.rules.denominator)}</p>
      </div>
    </>
  );
}

function EmptyState({ title }: { title: string | null }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t.empty(title)}</p>
      <Link href="/dashboard" className="back-link">
        {t.backToStart}
      </Link>
    </div>
  );
}
