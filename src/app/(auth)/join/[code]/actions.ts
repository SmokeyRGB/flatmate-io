"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { landingPathFor } from "@/app/landing";
import {
  JOIN_PASSWORD_MIN_LENGTH,
  JoinError,
  joinAttemptSourceHash,
  joinHousehold,
  redeemPasswordReset,
} from "@/modules/identity/auth";
import {
  buildJoinUrl,
  isWellFormedJoinCode,
  normalizeJoinCode,
  recordJoinAttempt,
  revokeSession,
} from "@/modules/identity/repository";
import {
  clearSessionCookie,
  getCurrentSession,
  sessionCookieMaxAge,
  setSessionCookie,
} from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import { getClientIp } from "./request-ip";

// design.md Decision 10: `refusal` names the ONE OTHER way-forward component this refusal needs
// beside its inline message (join-ways-forward.tsx) — never a typed value (design.md constraint 5:
// the previous state is what next dev's action log prints on the NEXT submit).
export interface JoinFormState {
  error: string | null;
  // review fix: "email" added alongside displayName/password — invalid_email below needs somewhere
  // to point the inline error at, following the exact same fieldError convention.
  fieldError: "displayName" | "password" | "email" | null;
  refusal: "invalid_link" | "other_household" | null;
}

const t = de.join;

// design.md Decision 10: a `useActionState` reducer — validate up front, `return { error }` for
// known domain failures, re-throw everything else, `redirect()` OUTSIDE the try (Next implements
// it by throwing, and this action's own try/catch would otherwise swallow that throw).
//
// The code arrives as a HIDDEN FORM FIELD (G-A5) — never a query parameter — read from `formData`
// exactly like every other field, never assembled from the URL.
export async function joinHouseholdAction(
  _prevState: JoinFormState,
  formData: FormData,
): Promise<JoinFormState> {
  const code = String(formData.get("code") ?? "");
  // design.md Decision 13: `displayName` may be absent entirely — a bound link's form (join-form
  // tsx) renders no name field at all, so `formData.get` returns null rather than an empty
  // string. `undefined` (not `""`) is what tells joinHousehold "this field was never asked for",
  // which matters because it is the one thing that decides whether a missing name is even an
  // error (a bound link needs none; a neutral one does).
  const displayNameField = formData.get("displayName");
  const displayName = typeof displayNameField === "string" ? displayNameField : undefined;
  const password = String(formData.get("password") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const rememberMe = formData.get("rememberMe") === "on";

  // Same fast, pre-network check this action has always done — but `displayName` is only ever
  // judged when the FIELD ITSELF was submitted. join-form.tsx renders no name field at all for a
  // bound link (design.md Decision 13), so `formData.get` returns null and `displayName` stays
  // `undefined` — that must never be treated the same as `""` (present, cleared), or a bound
  // link's own submission (no name field to clear) would be refused for a field it never had.
  // joinHousehold makes the authoritative call once it knows whether the link is bound.
  if ((displayName !== undefined && !displayName.trim()) || !password) {
    return {
      error: t.errors.missingFields,
      fieldError: displayName !== undefined && !displayName.trim() ? "displayName" : "password",
      refusal: null,
    };
  }

  // design.md Decision 1, step 1: the rate limit runs BEFORE any code lookup, structurally
  // (AC-2.25) — this submission is a second, independent "attempt" on top of whatever the page's
  // own GET already recorded, exactly as EC-2.14/FR-2.28 require of every check against a code.
  const ip = getClientIp(await headers());
  const allowed = await recordJoinAttempt(joinAttemptSourceHash(ip));
  if (!allowed) {
    return { error: t.errors.rateLimited, fieldError: null, refusal: null };
  }

  const current = await getCurrentSession();

  try {
    const result = await joinHousehold(
      code,
      { displayName, password, email: email || null },
      { rememberMe, currentSession: current?.context ?? null },
    );
    await setSessionCookie(
      result.session.id,
      result.context.householdId,
      sessionCookieMaxAge(result.session.expiresAt),
    );
  } catch (err) {
    if (err instanceof JoinError) {
      // Exhaustive switch (design.md Decision 4): a missed code is a compile error. Named
      // `errCode`, not `code` — the outer `code` above is the join code itself (G-A5: never
      // logged, never reused for anything but the claim), and shadowing it here would invite a
      // future edit to reach for the wrong one.
      const errCode = err.code;
      switch (errCode) {
        case "invalid_link":
          // design.md Decision 10 (EC-2.9/EC-2.1): a link deleted or spent mid-registration is
          // refused the same way the page itself would refuse it, hand-entry link included.
          return { error: t.errors.invalidLink, fieldError: null, refusal: "invalid_link" };
        case "name_taken":
          // Only ever reached for a NEUTRAL link (a bound link skips the collision check
          // entirely, design.md Decision 13). The message is fixed text: the typed name stays in
          // the browser's own draft and never travels back in this state (PR #20 review).
          return { error: t.errors.nameTaken, fieldError: "displayName", refusal: null };
        case "rate_limited":
          return { error: t.errors.rateLimited, fieldError: null, refusal: null };
        case "missing_fields":
          return { error: t.errors.missingFields, fieldError: null, refusal: null };
        case "password_too_short":
          return {
            error: t.errors.passwordTooShort(JOIN_PASSWORD_MIN_LENGTH),
            fieldError: "password",
            refusal: null,
          };
        case "already_member": {
          // EC-2.4: no inline error at all — taken to the caller's OWN landing (design.md
          // Decision 3: Start for a resident, the household settings screen for the household
          // account) with a note, exactly like the page's own GET refusal. `already_member` is
          // only ever thrown when `current` was passed to joinHousehold as the acting session
          // (the branch above), so it is never null here.
          const landingPath = landingPathFor(current!.context);
          redirect(`${landingPath}?note=already_member`);
        }
        case "other_household":
          // design.md Decision 10 (EC-2.5 met again at submit time): the same sign-out way forward
          // as the page's own Keine-Berechtigung state.
          return { error: t.errors.otherHousehold, fieldError: null, refusal: "other_household" };
        case "email_taken":
          // resident-settings design.md Decision 3: names no one (proposal Assumption 2). Shown on
          // the email field itself (review fix: JoinFormState now has an "email" fieldError variant,
          // added for invalid_email below and reused here).
          return { error: t.errors.emailTaken, fieldError: "email", refusal: null };
        case "invalid_email":
          // review fix: auth.ts's joinHousehold now validates the optional email itself
          // (normalizeEmail/isWellFormedEmail) — a malformed value is refused here, before any Auth
          // user is created or any link is claimed. Name and email stay typed in the browser's own
          // draft (join-form.tsx), never the password.
          return { error: t.errors.invalidEmail, fieldError: "email", refusal: null };
        case "signup_failed":
          // design.md I1: unchanged from before this change — a JoinError's own message never
          // contains the code (join-code-never-in-query-or-log.test.ts, extended by task 7.4), so
          // logging the error itself here is not a G-A5 violation. The join is one transaction, so
          // a failed one created nothing (t.errors.genericFailure states that now, task 2.2).
          console.error(err);
          return { error: t.errors.genericFailure, fieldError: null, refusal: null };
        // review fix: reset_done_sign_in_failed belongs to redeemPasswordReset's own refusals —
        // joinHousehold never throws it, covered here only so this switch stays exhaustive.
        case "reset_done_sign_in_failed":
          return { error: t.errors.genericFailure, fieldError: null, refusal: null };
        default: {
          const _exhaustive: never = errCode;
          return _exhaustive;
        }
      }
    }
    throw err;
  }

  // start-screen design.md Decision 3: a join always yields a resident, whose landing is fixed —
  // landingPathFor(...) would answer the same thing, but this site knows its identity statically.
  // `/dashboard` is B1 (Start) everywhere now, not the "temporary Start stand-in" it used to be.
  redirect("/dashboard");
}

// design.md Decision 7 (EC-2.5's Keine-Berechtigung way forward): in exactly
// src/app/(org)/sign-out-action.ts's shape — revokeSession enforces ownership itself (it refuses a
// session that is not the caller's own), so this action adds no authorization check of its own
// (G-C unchanged) and cannot widen it. redirect() stays OUTSIDE the try/finally, same reasoning as
// sign-out-action.ts: Next implements it by throwing, and keeping it outside makes that explicit.
//
// The action's only argument is `formData` — next dev's server-function log prints it as `{}`
// (design.md constraint 5), never the code inside it.
export async function signOutAndReturnAction(formData: FormData): Promise<void> {
  const current = await getCurrentSession();
  if (current) {
    try {
      await revokeSession(current.context, current.sessionId);
    } finally {
      await clearSessionCookie();
    }
  } else {
    await clearSessionCookie();
  }

  // I2: only ever redirects to a join path this app assembled itself, from a code that has passed
  // the shape check — never a raw copy of the body's value (buildJoinUrl does not encode).
  const raw = String(formData.get("code") ?? "");
  const normalised = normalizeJoinCode(raw);
  if (isWellFormedJoinCode(normalised)) {
    redirect(buildJoinUrl(null, normalised));
  }
  redirect("/join");
}

// identity/password-reset (O-16): A3's `reset` shape submit. german-ui-vocabulary: a `code`
// discriminant, never a typed value, in the action state (design.md constraint 5).
export interface ResetFormState {
  error: string | null;
  fieldError: "password" | null;
  // review fix: mirrors JoinFormState's own refusal field — invalid_link needs the same way-forward
  // component (HandEntryWayBack) the join form renders, not just an inline error.
  refusal: "invalid_link" | null;
}

// FR-2.28/EC-2.14: the attempt is recorded on page load (page.tsx's resolve) AND here, on submit —
// a redemption is itself an attempt, exactly as joinHouseholdAction records a second one on top of
// the page's own GET. The code arrives as a hidden form field (G-A5), never a query parameter.
export async function redeemPasswordResetAction(
  _prevState: ResetFormState,
  formData: FormData,
): Promise<ResetFormState> {
  const code = String(formData.get("code") ?? "");
  const password = String(formData.get("password") ?? "");
  const rememberMe = formData.get("rememberMe") === "on";

  const ip = getClientIp(await headers());
  const allowed = await recordJoinAttempt(joinAttemptSourceHash(ip));
  if (!allowed) {
    return { error: t.errors.rateLimited, fieldError: null, refusal: null };
  }

  // design.md Decision 8 (pre-mortem fix, 2026-09-24): captured BEFORE redemption so the visitor's
  // OWN previous session (own account only, revokeSession enforces that) can be revoked once the
  // redemption itself succeeds — otherwise the cookie this action is about to overwrite would
  // leave a valid, orphaned session row behind. redeemPasswordReset itself does the revoke
  // (own session only, via repository.ts's revokeSession) once the redemption has unconditionally
  // succeeded, mirroring joinHousehold's own `options.currentSession`.
  const current = await getCurrentSession();

  try {
    const result = await redeemPasswordReset(code, { password }, { rememberMe, currentSession: current });

    await setSessionCookie(
      result.session.id,
      result.context.householdId,
      sessionCookieMaxAge(result.session.expiresAt),
    );
  } catch (err) {
    if (err instanceof JoinError) {
      // Exhaustive switch (design.md Decision 4): a missed code is a compile error.
      const errCode = err.code;
      switch (errCode) {
        case "invalid_link":
          // review fix: the same refusal shape joinHouseholdAction gives — an inline message PLUS
          // the way forward (hand entry), rendered by reset-form.tsx reusing HandEntryWayBack.
          return { error: t.errors.invalidLink, fieldError: null, refusal: "invalid_link" };
        case "missing_fields":
          return { error: t.errors.missingFields, fieldError: null, refusal: null };
        case "password_too_short":
          return {
            error: t.errors.passwordTooShort(JOIN_PASSWORD_MIN_LENGTH),
            fieldError: "password",
            refusal: null,
          };
        case "rate_limited":
          return { error: t.errors.rateLimited, fieldError: null, refusal: null };
        case "signup_failed":
          console.error(err);
          return { error: t.errors.genericFailure, fieldError: null, refusal: null };
        case "reset_done_sign_in_failed":
          // review fix: past this point the reset has ALREADY SUCCEEDED (password set, sessions
          // revoked, link spent) — only the immediate sign-in afterwards failed. Showing the
          // generic failure text here would be a lie (it promises "your invitation is not
          // consumed", which is false for a spent reset link). Redirect to sign-in with a note
          // instead, same shape as joinHouseholdAction's own already_member redirect (inside this
          // catch block, so the outer try's own catch can never intercept it).
          redirect("/sign-in?note=password_reset");
        // The remaining JoinErrorCode members belong to joinHousehold's own refusals
        // (name collisions, an already-signed-in visitor, a duplicate email) and redeemPasswordReset
        // never throws them — covered here only so this switch stays exhaustive.
        case "name_taken":
        case "already_member":
        case "other_household":
        case "email_taken":
        case "invalid_email":
          return { error: t.errors.genericFailure, fieldError: null, refusal: null };
        default: {
          const _exhaustive: never = errCode;
          return _exhaustive;
        }
      }
    }
    throw err;
  }

  redirect("/dashboard");
}
