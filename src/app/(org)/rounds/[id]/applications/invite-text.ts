// Outbound text (language-switch D7): the invitation is addressed to a person outside the app, so
// it stays German whatever language the viewer chose (vocabulary spec, "Text for people outside the
// app stays German"). This file and notice.tsx are the only places outside src/ui/strings that
// import the German table directly.
import { de } from "@/ui/strings";

// F5 candidate-invite (design D4). The pure half of the invitation dialog: no React, no I/O. The
// words live in src/ui/strings/de.ts; this file composes them.

// The permission behind „Einladen", the one the declared rows into `invited` require
// (casting/transitions.ts; pinned by invite-text.test.ts). Both pages decide the button from it.
export const INVITE_PERMISSION = "change_application_state";

// The states „Einladen" is offered for: inviteApplication takes these (and no-ops on `invited`).
export const INVITABLE_STATES: readonly string[] = ["new", "screened"];

// The name as the dialog shows it: trimmed, or the placeholder when blank. One rule for the heading,
// the button's label and the example text.
export function displayName(name: string): string {
  const trimmed = name.trim();
  return trimmed === "" ? de.applications.notice.nameFallback : trimmed;
}

// The example text: the invitation with its one greeting, and nothing else. It carries no privacy
// notice and no deadline: the notice is shown when an applicant is added, and informing the person
// is the household's own task (human decision 2026-10-06, proposal.md).
export function inviteText(name: string): string {
  return de.invite.text({ name: displayName(name) });
}

// O5 offers „Einladen" only to a holder of change_application_state, for an application that can
// still be invited (spec `casting/invitation`, "Where the invitation is offered").
export function showInvite(permitted: boolean, state: string): boolean {
  return permitted && INVITABLE_STATES.includes(state);
}
