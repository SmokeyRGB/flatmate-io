import type { SessionContext } from "@/db/session-context";

// start-screen design.md Decision 3: the ONE rule for which surface a session lands on —
// `profileId === null` (the household account) goes to the household settings screen (O20);
// anything else (a resident profile acting) goes to Start (B1). Pure, no I/O, called at every
// entry point so the rule exists exactly once (proposal.md "Every identity lands on its own
// surface").
export function landingPathFor(context: SessionContext): "/dashboard" | "/settings" {
  return context.profileId === null ? "/settings" : "/dashboard";
}
