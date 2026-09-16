import { FmError, FmLoading } from "@/components/fm/States";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRanking, castVote } from "@/lib/fm/functions";
import { fmError } from "@/lib/fm/errors";
import { toast } from "sonner";
import { STATE_LABELS, VOTE_LABELS, VOTE_ORDER, type RankingRow, type VoteValue } from "@/lib/fm/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { InviteDispatchDialog } from "@/components/fm/InviteDispatch";
import { EyeOff, Info, Hourglass, HelpCircle, ChevronRight } from "lucide-react";

const VOTE_BG: Record<VoteValue, string> = {
  no: "bg-vote-no",
  rather_not: "bg-vote-rather",
  good: "bg-vote-good",
  definitely: "bg-vote-definitely",
};

export function RankingBoard({ onGoToScreening }: { onGoToScreening: () => void }) {
  const fetchRanking = useServerFn(getRanking);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["ranking"], queryFn: fetchRanking });
  const [detail, setDetail] = useState<RankingRow | null>(null);

  if (isLoading) return <FmLoading rows={3} header={false} />;
  if (error) return <FmError error={error} onRetry={() => refetch()} />;
  if (!data) return null;

  const { rows, round, me } = data;
  const isModerator = me.isModerator;

  if (!round) {
    return (
      <Card className="fm-card">
        <CardContent className="py-10 text-center text-muted-foreground">
          Gerade läuft keine Casting-Runde. Sobald die Moderation eine eröffnet, steht die Rangliste hier.
        </CardContent>
      </Card>
    );
  }

  const relevant = rows.filter((r) => !r.is_self && r.state !== "archived" && r.state !== "withdrawn");
  const ranked = relevant.filter((r) => r.quorum_reached);
  const waiting = relevant.filter((r) => !r.quorum_reached);
  const canInvite = (r: RankingRow) => isModerator && r.state === "screened";

  // Stimme bleibt änderbar, solange noch nicht eingeladen wurde.
  const canVote = (r: RankingRow) =>
    round.status === "open" && !r.is_self && (r.state === "new" || r.state === "screened");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {round.title}
            {round.hide_results_until_voted && " · Ergebnisse bleiben verdeckt, bis du selbst abgestimmt hast."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ExplainDialog />
        </div>
      </div>

      {rows.some((r) => r.is_self) && (
        <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
          Bewertungen über deine eigene Bewerbung siehst du nicht — das ist eine feste Regel, kein Zufall.
        </p>
      )}

      {relevant.length === 0 && (
        <Card className="fm-card">
          <CardContent className="py-10 text-center text-muted-foreground">
            Noch keine Bewerbungen in dieser Runde.
          </CardContent>
        </Card>
      )}

      {ranked.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Rangliste</h2>
          {ranked.map((row, i) => (
            <RankedCard
              key={row.application_id}
              row={row}
              rank={i + 1}
              onOpen={() => setDetail(row)}
              onGoToScreening={onGoToScreening}
              canInvite={canInvite(row)}
            />
          ))}
        </section>
      )}

      {waiting.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Hourglass className="size-4" /> Wartet noch auf Stimmen
          </h2>
          <p className="text-xs text-muted-foreground">
            Ohne genug Stimmen gibt es hier bewusst keinen Score und keinen Platz.
          </p>
          {waiting.map((row) => (
            <Card key={row.application_id} className="fm-card">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <p className="font-medium">{row.applicant_name}</p>
                <Badge variant="secondary">
                  {row.vote_count ?? 0} von {row.votes_needed} nötigen Stimmen
                </Badge>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {detail.applicant_name}
                  {detail.age ? <span className="ml-2 text-base font-normal text-muted-foreground">{detail.age}</span> : null}
                </DialogTitle>
                <DialogDescription>Status: {STATE_LABELS[detail.state]}</DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {detail.message?.trim() ? detail.message : "Zu dieser Bewerbung liegt kein Text vor."}
                </p>
                {detail.contact && <p className="text-xs text-muted-foreground">Kontakt: {detail.contact}</p>}
              </div>

              {canVote(detail) && (
                <VoteEditor
                  row={detail}
                  onVoted={(value) => {
                    setDetail({ ...detail, my_vote: value });
                    void refetch();
                  }}
                />
              )}

              {detail.visible ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-2xl font-semibold">
                      {detail.score !== null ? `${detail.score} von 100` : "Noch kein Score"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {detail.score !== null
                        ? `Mittelwert aus ${detail.vote_count} ${detail.vote_count === 1 ? "Stimme" : "Stimmen"}, auf 100 Punkte skaliert`
                        : "Es hat noch niemand abgestimmt"}
                    </p>
                  </div>
                  <Breakdown row={detail} />
                  {detail.my_vote && (
                    <p className="text-xs text-muted-foreground">
                      Deine Stimme: <span className="font-medium text-foreground">{VOTE_LABELS[detail.my_vote]}</span>
                      {detail.my_vote === "definitely" && " — das ist dein Favorit."}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Das Ergebnis bleibt verdeckt, bis du selbst abgestimmt hast.
                  </p>
                  <Button onClick={onGoToScreening}>Jetzt abstimmen</Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Breakdown({ row }: { row: RankingRow }) {
  const counts: Record<VoteValue, number> = {
    no: row.c_no ?? 0,
    rather_not: row.c_rather_not ?? 0,
    good: row.c_good ?? 0,
    definitely: row.c_definitely ?? 0,
  };
  const total = VOTE_ORDER.reduce((sum, v) => sum + counts[v], 0);
  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        {VOTE_ORDER.map((v) =>
          total > 0 && counts[v] > 0 ? (
            <div
              key={v}
              className={cn(VOTE_BG[v], "h-full")}
              style={{ width: `${(counts[v] / total) * 100}%` }}
              title={`${VOTE_LABELS[v]}: ${counts[v]}`}
            />
          ) : null,
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {VOTE_ORDER.map((v) => (
          <span key={v}>
            <span className={cn("mr-1 inline-block size-2 rounded-full align-middle", VOTE_BG[v])} />
            {VOTE_LABELS[v]}: {counts[v]}
          </span>
        ))}
      </div>
    </div>
  );
}

function RankedCard({
  row,
  rank,
  onOpen,
  onGoToScreening,
  canInvite,
}: {
  row: RankingRow;
  rank: number;
  onOpen: () => void;
  onGoToScreening: () => void;
  canInvite: boolean;
}) {
  const inviteButton = canInvite ? (
    <InviteDispatchDialog
      applications={[{ id: row.application_id, applicant_name: row.applicant_name, contact: row.contact ?? null }]}
      triggerLabel="Einladen"
      triggerSize="sm"
    />
  ) : null;
  if (!row.visible) {
    return (
      <Card className="fm-card">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3">
            <EyeOff className="size-4 text-muted-foreground" />
            <div>
              <p className="font-medium">{row.applicant_name}</p>
              <p className="text-xs text-muted-foreground">Ergebnis verdeckt, bis du abgestimmt hast</p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={onGoToScreening}>
            Zur Abstimmung
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="fm-card">
      <CardContent className="p-0">
        <button onClick={onOpen} className="flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground">
            {rank}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{row.applicant_name}</span>
            <span className="block text-xs text-muted-foreground">
              {row.score !== null
                ? `${row.score} von 100 · Mittelwert aus ${row.vote_count} ${row.vote_count === 1 ? "Stimme" : "Stimmen"}`
                : "Noch kein Score"}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </button>
        <div className="space-y-3 px-4 pb-4">
          <Breakdown row={row} />
          {inviteButton && <div className="flex justify-end">{inviteButton}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function ExplainDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="shrink-0">
          <HelpCircle className="size-4" /> Wie wird gerechnet?
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>So entsteht die Rangliste</DialogTitle>
          <DialogDescription>Keine Blackbox — jede:r kann es nachrechnen.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>Jede Stimme ist eine von vier Stufen mit festem Wert: Nein 0 · Eher nicht 1 · Finde gut 3 · Unbedingt 5.</p>
          <p>
            Der Score ist der <span className="font-medium text-foreground">Mittelwert</span> aller abgegebenen
            Stimmen-Werte, auf 100 Punkte skaliert. Beispiel: 3 × „Finde gut" und 2 × „Unbedingt" ergeben (3+3+3+5+5) ÷ 5
            = 3,8 von 5 → 76 von 100.
          </p>
          <p>
            <span className="font-medium text-foreground">Genug Stimmen</span> heißt standardmäßig: mindestens die
            Hälfte der stimmberechtigten Bewohner:innen hat abgestimmt. Vorher steht die Bewerbung unter „Wartet noch
            auf Stimmen" — ohne Score und ohne Platz.
          </p>
          <p>
            Ehemalige Bewohner:innen können weiter mitlesen, ihre Stimmen bleiben gespeichert — zählen aber nicht mehr
            mit, wenn gezählt wird, ob genug Stimmen da sind.
          </p>
          <p className="flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0" />
            Ergebnisse bleiben verdeckt, bis du selbst abgestimmt hast. Das verhindert Mitläufer-Stimmen.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VoteEditor({ row, onVoted }: { row: RankingRow; onVoted: (value: VoteValue) => void }) {
  const vote = useServerFn(castVote);
  const [saving, setSaving] = useState<VoteValue | null>(null);

  async function pick(value: VoteValue) {
    setSaving(value);
    try {
      await vote({ data: { applicationId: row.application_id, value } });
      onVoted(value);
    } catch (err) {
      toast.error(fmError(err));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">
        {row.my_vote ? "Du kannst deine Stimme noch ändern." : "Du hast noch nicht abgestimmt."}
      </p>
      <div className="grid grid-cols-4 gap-2">
        {VOTE_ORDER.map((v) => (
          <Button
            key={v}
            size="sm"
            variant={row.my_vote === v ? "default" : "secondary"}
            disabled={saving !== null}
            onClick={() => void pick(v)}
            className="h-auto whitespace-normal py-2 text-xs"
          >
            {VOTE_LABELS[v]}
          </Button>
        ))}
      </div>
    </div>
  );
}
