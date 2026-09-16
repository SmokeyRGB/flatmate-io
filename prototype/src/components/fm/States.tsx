import { fmError } from "@/lib/fm/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RotateCcw, Clock } from "lucide-react";
import { deadlineLabel, distributionLine, phaseLabel, type AppState } from "@/lib/fm/types";

/**
 * Ladezustand (§6): Platzhalter in der Form des erwarteten Inhalts,
 * kein Textsatz, kein Sprung im Layout.
 */
export function FmLoading({ rows = 3, header = true }: { rows?: number; header?: boolean }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Wird geladen …</span>
      {header && (
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      )}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="fm-card space-y-3 p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** Fehlerzustand (§6): ein Satz ohne Fachwort, ein Weg zurück, nichts geht verloren. */
export function FmError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Card className="fm-card">
      <CardContent className="space-y-3 py-8 text-center">
        <p className="font-medium">{fmError(error)}</p>
        <p className="text-sm text-muted-foreground">
          Es ist nichts verloren gegangen — deine Stimmen und Eingaben sind gespeichert.
        </p>
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            <RotateCcw className="mr-1 size-4" /> Erneut versuchen
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Phasenanzeige (§3): wo die Runde steht, dazu die tatsächliche Verteilung
 * und — falls gesetzt — die Frist. Sperrt nichts.
 */
export function PhaseBar({
  counts,
  deadline,
  roundTitle,
}: {
  counts: Partial<Record<AppState, number>>;
  deadline: string | null;
  roundTitle?: string;
}) {
  const phase = phaseLabel(counts);
  const dist = distributionLine(counts);
  const frist = deadlineLabel(deadline);

  return (
    <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-medium">{phase}</span>
        {frist && (
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="size-3.5" /> {frist}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground">{dist || (roundTitle ?? "Noch keine Bewerbung erfasst")}</p>
    </div>
  );
}
