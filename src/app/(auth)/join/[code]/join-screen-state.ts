import type { JoinCodeResolution } from "@/modules/identity/repository";

// design.md Decision 2: the ONE pure function that decides which of A3's states applies. `page.tsx`
// keeps the fixed order (session -> recordJoinAttempt -> resolveJoinCode, design.md's Context) and
// simply hands the three results here — nothing in this file makes a network or database call, so
// vitest's node environment (no DOM, Design Non-Goals) can exercise every branch directly.
export type JoinScreen =
  | { kind: "rate_limited" }
  | { kind: "invalid_link" }
  | { kind: "already_member" } // page.tsx redirects: EC-2.4
  | { kind: "other_household" } // Keine Berechtigung: EC-2.5
  | { kind: "neutral"; householdName: string }
  | { kind: "bound"; householdName: string; displayName: string };

export interface DecideJoinScreenInput {
  allowed: boolean;
  resolved: JoinCodeResolution;
  sessionHouseholdId: string | null;
}

// The order below is the order design.md's Context describes the page as having today: the rate
// limit runs before any code lookup at all (AC-2.25), so it wins over everything else here too. An
// invalid link wins over the session branch next, because refusing on EC-2.5 ("Keine Berechtigung")
// is itself a statement that THIS link is fine — that statement must not be made about a link that
// never resolved to anything. Only after both does the session decide already_member vs.
// other_household, and only then does the resolved link's own shape (bound vs. neutral) matter.
export function decideJoinScreen(input: DecideJoinScreenInput): JoinScreen {
  if (!input.allowed) return { kind: "rate_limited" };

  if (!input.resolved) return { kind: "invalid_link" };

  if (input.sessionHouseholdId !== null) {
    if (input.sessionHouseholdId === input.resolved.householdId) {
      return { kind: "already_member" };
    }
    return { kind: "other_household" };
  }

  const bound = input.resolved.boundResidentProfile;
  if (bound) {
    return { kind: "bound", householdName: input.resolved.householdName, displayName: bound.displayName };
  }
  return { kind: "neutral", householdName: input.resolved.householdName };
}
