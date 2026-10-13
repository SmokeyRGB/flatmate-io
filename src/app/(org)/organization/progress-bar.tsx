import type { Strings } from "@/ui/strings";
import type { StatusHeader } from "./status-sentence";

// organisation-task-list D4 point 3: a thin segmented bar plus a visible caption. Each segment
// carries its own accessible name, so the bar needs no labelled dot row. It never gates anything.
export function ProgressBar({ header, s }: { header: StatusHeader; s: Strings }) {
  if (header.steps.length === 0) return null;
  const t = s.org.dashboard;
  const word = { done: t.progressDone, current: t.progressCurrent, running: t.progressRunning, next: t.progressNext };
  return (
    <div className="space-y-2">
      <ol className="org-progress">
        {header.steps.map((step) => (
          <li key={step.label} data-state={step.state} aria-current={step.state === "current" ? "step" : undefined}>
            <span className="sr-only">{t.progressSegment(step.label, word[step.state])}</span>
          </li>
        ))}
      </ol>
      {header.caption && <p className="text-xs text-muted-foreground">{header.caption}</p>}
    </div>
  );
}
