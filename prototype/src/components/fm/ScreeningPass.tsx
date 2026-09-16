import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getDeck, castVote } from "@/lib/fm/functions";
import { fmError } from "@/lib/fm/errors";
import { VOTE_ORDER, type VoteValue } from "@/lib/fm/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FmError, FmLoading } from "@/components/fm/States";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";

const VOTE_STYLES: Record<VoteValue, string> = {
  no: "bg-vote-no text-vote-no-foreground hover:bg-vote-no/90",
  rather_not: "bg-vote-rather text-vote-rather-foreground hover:bg-vote-rather/90",
  good: "bg-vote-good text-vote-good-foreground hover:bg-vote-good/90",
  definitely: "bg-vote-definitely text-vote-definitely-foreground hover:bg-vote-definitely/90",
};

const SHORT_LABELS: Record<VoteValue, string> = {
  no: "Nein",
  rather_not: "Eher nicht",
  good: "Finde gut",
  definitely: "Unbedingt",
};

export function ScreeningPass({ onGoToRanking }: { onGoToRanking: () => void }) {
  const fetchDeck = useServerFn(getDeck);
  const vote = useServerFn(castVote);
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["deck"], queryFn: fetchDeck });
  const [index, setIndex] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const [editing, setEditing] = useState(false);
  const [cardMotion, setCardMotion] = useState<"idle" | "leaving" | "entering">("entering");
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const deck = data?.deck ?? [];
  const current = deck[Math.min(index, Math.max(deck.length - 1, 0))];
  const allVoted = deck.length > 0 && deck.every((d) => d.myVote !== null);
  const currentId = current?.id ?? null;
  const currentVote = current?.myVote ?? null;

  useEffect(() => {
    const pos = currentVote ? VOTE_ORDER.indexOf(currentVote) : 0;
    setFocusIdx(pos < 0 ? 0 : pos);
  }, [currentId, currentVote]);

  useEffect(() => {
    if (cardMotion !== "entering") return;
    const timer = window.setTimeout(() => setCardMotion("idle"), 360);
    return () => window.clearTimeout(timer);
  }, [cardMotion, currentId]);

  const doVote = useCallback(
    (value: VoteValue) => {
      if (!currentId) return;
      const votedId = currentId;
      setPending(value);

      // Sofort sichtbar: Stimme lokal setzen, Karte wechseln — der Server folgt im Hintergrund.
      queryClient.setQueryData(["deck"], (old: typeof data | undefined) =>
        old
          ? { ...old, deck: old.deck.map((d) => (d.id === votedId ? { ...d, myVote: value } : d)) }
          : old,
      );

      const advance = !editing && index < deck.length - 1;
      if (advance) {
        setCardMotion("leaving");
        window.setTimeout(() => {
          setIndex((i) => Math.min(i + 1, deck.length - 1));
          setCardMotion("entering");
          setPending(null);
        }, 160);
      } else {
        setPending(null);
      }

      void (async () => {
        try {
          await vote({ data: { applicationId: votedId, value } });
          void queryClient.invalidateQueries({ queryKey: ["home"] });
          void queryClient.invalidateQueries({ queryKey: ["ranking"] });
        } catch (err) {
          toast.error(fmError(err));
          void queryClient.invalidateQueries({ queryKey: ["deck"] });
        }
      })();
    },
    [currentId, data, deck.length, editing, index, queryClient, vote],
  );


  const select = useCallback(
    (next: number) => {
      const bounded = (next + VOTE_ORDER.length) % VOTE_ORDER.length;
      setFocusIdx(bounded);
      optionRefs.current[bounded]?.focus();
      void doVote(VOTE_ORDER[bounded]!);
    },
    [doVote],
  );

  // Tastatur gilt für den ganzen Bildschirm, nicht nur für die fokussierte Schaltfläche.
  useEffect(() => {
    if (!currentId) return;
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (pending !== null) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        select(focusIdx + 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        select(focusIdx - 1);
      } else if (["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        select(Number(e.key) - 1);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setFocusIdx(focusIdx);
        optionRefs.current[focusIdx]?.focus();
        void doVote(VOTE_ORDER[focusIdx]!);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentId, focusIdx, pending, select, doVote]);

  if (isLoading) return <FmLoading rows={1} header={false} />;
  if (error) return <FmError error={error} onRetry={() => refetch()} />;
  if (!data) return null;

  const round = data.round;

  if (!round || round.status !== "open") {
    return (
      <Card className="fm-card">
        <CardContent className="py-10 text-center text-muted-foreground">
          Gerade läuft keine offene Runde — es gibt nichts zu sehen.
        </CardContent>
      </Card>
    );
  }

  if (deck.length === 0 || (allVoted && !editing)) {
    return (
      <Card className="fm-card">
        <CardContent className="py-12 text-center">
          <Check className="mx-auto size-10 text-vote-good" />
          <p className="mt-3 font-medium">Nichts wartet mehr auf dich — alles gesehen.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Deine Stimmen kannst du bis zum Rundenende noch ändern.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button onClick={onGoToRanking}>Zur Rangliste</Button>
            {deck.length > 0 && (
              <Button variant="ghost" onClick={() => setEditing(true)}>
                Stimmen ändern
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const card = current!;
  const isLast = index >= deck.length - 1;

  return (
    <div className="space-y-4 overflow-x-clip pb-24 md:pb-28">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {deck.map((d, i) => (
          <button
            key={d.id}
            onClick={() => setIndex(i)}
            title={d.applicant_name}
            aria-label={`Karte ${i + 1}: ${d.applicant_name}`}
            className={cn(
              "h-2.5 w-8 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              i === index ? "bg-primary" : d.myVote ? "bg-vote-good/70" : "bg-border",
            )}
          />
        ))}
        <span className="ml-1 text-xs text-muted-foreground">
          Karte {index + 1} von {deck.length}
        </span>
      </div>

      <Card
        key={card.id}
        className={cn(
          "fm-card",
          cardMotion === "leaving" && "fm-card-voted",
          cardMotion === "entering" && "fm-card-next",
        )}
      >
        <CardContent className="space-y-4 pt-6">
          <div>
            <h2 className="text-2xl font-semibold">{card.applicant_name}</h2>
            {card.age !== null && <p className="text-sm text-muted-foreground">{card.age} Jahre</p>}
          </div>
          {card.message && (
            <p className="whitespace-pre-wrap rounded-xl bg-secondary/60 p-4 text-sm leading-relaxed">{card.message}</p>
          )}
          {card.contact && <p className="text-xs text-muted-foreground">Kontakt: {card.contact}</p>}
        </CardContent>
      </Card>

      <div className="flex shrink-0 justify-between">
        <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          <ChevronLeft className="size-4" /> Zurück
        </Button>
        <Button variant="ghost" size="sm" onClick={() => (isLast ? onGoToRanking() : setIndex(index + 1))}>
          {isLast ? "Zur Rangliste" : "Weiter"} <ChevronRight className="size-4" />
        </Button>
      </div>

      <p className="hidden text-center text-xs text-muted-foreground md:block">
        Werte dieser Runde: Nein 0 · Eher nicht 1 · Finde gut 3 · Unbedingt 5. Der Score ist der Mittelwert aller
        Stimmen, auf 100 Punkte skaliert.
      </p>


      {/* Bewertungsleiste — immer sichtbar, über der mobilen Navigation. */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-card/95 backdrop-blur md:bottom-0">
        <div className="mx-auto w-full max-w-3xl px-3 py-3">
          <p id="vote-help" className="mb-2 hidden text-center text-[11px] text-muted-foreground md:block">
            Wie passt {card.applicant_name.split(" ")[0]} zu uns? Pfeiltasten oder 1–4 wählen sofort, Enter bestätigt.
          </p>
          <div
            role="radiogroup"
            aria-label={`Wie passt ${card.applicant_name.split(" ")[0]} zu uns?`}
            aria-labelledby="vote-help"
            className="grid grid-cols-4 gap-2"
          >
            {VOTE_ORDER.map((v, i) => (
              <button
                key={v}
                ref={(el) => {
                  optionRefs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={card.myVote === v}
                tabIndex={focusIdx === i ? 0 : -1}
                disabled={pending !== null}
                onFocus={() => setFocusIdx(i)}
                onClick={() => doVote(v)}
                className={cn(
                  "flex h-14 items-center justify-center rounded-xl px-1 py-2 text-[13px] leading-tight font-medium transition-[color,background-color,box-shadow] sm:text-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                  VOTE_STYLES[v],
                  card.myVote === v && "ring-2 ring-offset-2 ring-offset-card ring-foreground/60",
                  pending === v && "opacity-70",
                )}
              >
                <span>{SHORT_LABELS[v]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
