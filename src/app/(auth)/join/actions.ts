"use server";

import { redirect } from "next/navigation";
import { buildJoinUrl, isWellFormedJoinCode, normalizeJoinCode } from "@/modules/identity/repository";
import { de } from "@/ui/strings";

export interface JoinCodeFormState {
  error: string | null;
}

const t = de.join;

// design.md Decision 1: `/join` RESOLVES NOTHING — it only normalises the typed code and, if it
// could be a code at all, redirects to the invitation route that does the actual (non-consuming)
// resolve. A malformed string is refused here, before any lookup, so it is never checked against a
// link and never counts as an FR-2.28 attempt (spec: "SHALL NOT count as a redemption attempt").
//
// G-A5: the code arrives in the request BODY (never a query string) and, on success, leaves only as
// a PATH SEGMENT built by buildJoinUrl from a string isWellFormedJoinCode has already accepted
// (I2) — never assembled from anything else. On refusal, the returned state carries no copy of the
// input (design.md constraint 5): the previous state is what next dev's server-function log prints
// on the NEXT submit, so echoing the near-miss code back here would put it in that log one action
// later. The typed value the visitor sees again is kept entirely in the browser (join-code-form.tsx
// Decision 4), never round-tripped through this action's state.
export async function enterJoinCodeAction(
  _prevState: JoinCodeFormState,
  formData: FormData,
): Promise<JoinCodeFormState> {
  const raw = String(formData.get("code") ?? "");
  const normalised = normalizeJoinCode(raw);

  if (!isWellFormedJoinCode(normalised)) {
    return { error: t.joinByCode.codeInvalid };
  }

  redirect(buildJoinUrl(null, normalised));
}
