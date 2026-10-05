import type { SessionContext } from "@/db/session-context";

// start-screen design.md Decision 3: the ONE rule for which surface a session lands on —
// `profileId === null` (the household account) goes to the organisation overview (O1,
// `/organization`; changed from the settings screen O20 after the 2026-10-05 walkthrough);
// anything else (a resident profile acting) goes to Start (B1). Pure, no I/O, called at every
// entry point so the rule exists exactly once (proposal.md "Every identity lands on its own
// surface").
export function landingPathFor(context: SessionContext): "/dashboard" | "/organization" {
  return context.profileId === null ? "/organization" : "/dashboard";
}
