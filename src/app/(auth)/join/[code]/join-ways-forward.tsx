import Link from "next/link";
import { de } from "@/ui/strings";
import { signOutAndReturnAction } from "./actions";

const t = de.join;

// design.md Decision 10: shared by BOTH the page's own state rendering (page.tsx, an opened link
// that is already refused) and the form's inline refusal rendering (join-form.tsx, a refusal that
// arrives at submit) — one component per way forward, so a rule stated on one path can never drift
// from the other (CLAUDE.md's "sibling entry" hazard, applied to screens).

// The invalid-link refusal's second way back (FR-2.27): never prefills the damaged code — that is
// the part that is wrong, and prefilling it would need a query string (G-A5).
export function HandEntryWayBack() {
  return (
    <Link href="/join" className="btn btn-secondary">
      {t.handEntryWayBack}
    </Link>
  );
}

// EC-2.5's Keine-Berechtigung way forward: ends only the visitor's OWN session (revokeSession
// enforces that, design.md Decision 7 — this form adds no check of its own) and returns to this
// same invitation. The code travels in the request BODY as a hidden field, never a query string.
export function SignOutAndReturnForm({ code }: { code: string }) {
  return (
    <form action={signOutAndReturnAction}>
      <input type="hidden" name="code" value={code} />
      <button type="submit" className="btn btn-secondary">
        {t.signOutAndReturn}
      </button>
    </form>
  );
}
