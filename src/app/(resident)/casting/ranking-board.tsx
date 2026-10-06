import { EyeOff } from "lucide-react";
import Link from "next/link";
import type { RankedGroup, Ranking } from "@/modules/deliberation/repository";
import { de } from "@/ui/strings";
import { WeightsList } from "./weights-list";

const t = de.casting;

type BoardRanking = Extract<Ranking, { kind: "board" }>;
type Row = { applicationId: string; applicantName: string };

// F5 change 1, screen D1: the scoreboard. A pure render of what `getRanking` returned, so every
// visibility rule has already been applied in the repository (V-1, V-2, V-4); nothing here decides
// who may see what. A server component with no client JavaScript: nothing on it is interactive
// except the "(?)" pop-over, which is native (as in the screening deck).
//
// There are no rank numbers anywhere (FR-5.10), no distribution (Q-10) and no word about a person
// (C-10, AC-5.28). A row without a score carries no ring and no numeral of its own, only the
// notice that names the real threshold (C-5.1).
export function RankingBoard({ ranking }: { ranking: Ranking }) {
  if (ranking.kind === "none") return <EmptyState title={null} />;
  if (ranking.kind === "refused") {
    if (ranking.reason === "round_not_available") {
      return <Refusal text={t.refusal.notAvailable(de.status.round[ranking.status])} />;
    }
    return <Refusal text={ranking.reason === "rules_invalid" ? t.refusal.rulesInvalid : t.refusal.notEligible} />;
  }
  const { decided, invited, hidden } = ranking;
  const total =
    decided.scored.length +
    decided.unscored.length +
    invited.scored.length +
    invited.unscored.length +
    hidden.length;
  if (total === 0) return <EmptyState title={ranking.round.title} />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-muted-foreground">{ranking.round.title}</p>
        <RulesPopover ranking={ranking} />
      </div>
      {/* Only this group highlights (design D10): the repository sets `leading` here and nowhere else. */}
      <Group heading={t.scoredHeading} group={decided} openRoomCount={ranking.openRoomCount} />
      <Group heading={t.invitedHeading} group={invited} openRoomCount={ranking.openRoomCount} />
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

// One group of the board: its heading and its scored rows, then its unscored rows. A group with no
// row renders nothing, not even a heading.
function Group({
  heading,
  group,
  openRoomCount,
}: {
  heading: string;
  group: RankedGroup;
  openRoomCount: number;
}) {
  if (group.scored.length + group.unscored.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{heading}</h2>
      <ul className="space-y-3">
        {group.scored.map((row) => (
          <li key={row.applicationId} className={`card ranking-row${row.leading ? " ranking-leading" : ""}`}>
            <ScoreRing score={row.score} n={row.n} />
            <div className="min-w-0 flex-1">
              <RowName row={row} />
              <p className="text-xs text-muted-foreground">{t.scoreOf(row.n)}</p>
              {row.leading && <span className="sr-only">{t.leadingLabel(openRoomCount)}</span>}
            </div>
          </li>
        ))}
        {group.unscored.map((row) => (
          <li key={row.applicationId} className="card ranking-row">
            <div className="min-w-0 flex-1">
              <RowName row={row} />
              <p className="text-sm text-muted-foreground">{t.unscored(row.needed, row.n)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The group a row sits in says whether it is invited, so the row carries only the name.
function RowName({ row }: { row: Row }) {
  return <p className="truncate font-medium">{row.applicantName}</p>;
}

// The circular progress ring: the score inside, a text equivalent for the whole (FR-5.10, AC-5.28).
// `pathLength` normalises the circle to 100, so the dash is the score itself.
function ScoreRing({ score, n }: { score: number; n: number }) {
  return (
    <div className="score-ring" role="img" aria-label={t.ringLabel(score, n)}>
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle className="score-ring-track" cx="22" cy="22" r="19" fill="none" strokeWidth="4" />
        <circle
          className="score-ring-fill"
          cx="22"
          cy="22"
          r="19"
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${score} 100`}
        />
      </svg>
      <span className="score-ring-value" aria-hidden="true">
        {score}
      </span>
    </div>
  );
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
        <WeightsList weights={ranking.rules.weights} />
        <p className="mt-3 text-sm text-muted-foreground">{t.formula}</p>
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

function Refusal({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}
