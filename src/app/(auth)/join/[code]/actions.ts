"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { JOIN_PASSWORD_MIN_LENGTH, JoinError, joinAttemptSourceHash, joinHousehold } from "@/modules/identity/auth";
import { recordJoinAttempt } from "@/modules/identity/repository";
import { getCurrentSession, sessionCookieMaxAge, setSessionCookie } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import { getClientIp } from "./request-ip";

export interface JoinFormState {
  error: string | null;
  fieldError: "displayName" | "password" | null;
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
    };
  }

  // design.md Decision 1, step 1: the rate limit runs BEFORE any code lookup, structurally
  // (AC-2.25) — this submission is a second, independent "attempt" on top of whatever the page's
  // own GET already recorded, exactly as EC-2.14/FR-2.28 require of every check against a code.
  const ip = getClientIp(await headers());
  const allowed = await recordJoinAttempt(joinAttemptSourceHash(ip));
  if (!allowed) {
    return { error: t.errors.rateLimited, fieldError: null };
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
          return { error: t.errors.invalidLink, fieldError: null };
        case "name_taken":
          // Only ever reached for a NEUTRAL link (a bound link skips the collision check
          // entirely, design.md Decision 13) — displayName is therefore always present here.
          return { error: t.errors.nameTaken((displayName ?? "").trim()), fieldError: "displayName" };
        case "rate_limited":
          return { error: t.errors.rateLimited, fieldError: null };
        case "missing_fields":
          return { error: t.errors.missingFields, fieldError: null };
        case "password_too_short":
          return {
            error: t.errors.passwordTooShort(JOIN_PASSWORD_MIN_LENGTH),
            fieldError: "password",
          };
        case "already_member":
          // EC-2.4: no inline error at all — taken to Start (the temporary /dashboard landing
          // target, proposal Assumption 4) with a note, exactly like the page's own GET refusal.
          redirect("/dashboard?note=already_member");
        case "other_household":
          return { error: t.errors.otherHousehold, fieldError: null };
        case "signup_failed":
          console.error(err);
          return { error: t.errors.genericFailure, fieldError: null };
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
