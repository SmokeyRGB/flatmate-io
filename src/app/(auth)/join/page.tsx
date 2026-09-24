import { de } from "@/ui/strings";
import { JoinCodeForm } from "./join-code-form";

const t = de.join.joinByCode;

// A3's Leer state (proposal.md Assumption 1): arriving on the join path with no code at all. This
// route resolves nothing (design.md Decision 1) — it only normalises the typed code and, if it
// could be one, redirects to `/join/<CODE>`, where the actual invitation (neutral or bound) is
// resolved and A3's other states live.
export default function JoinCodePage() {
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>
      <p className="text-sm text-muted-foreground">{t.emptyBody}</p>
      <JoinCodeForm />
    </div>
  );
}
