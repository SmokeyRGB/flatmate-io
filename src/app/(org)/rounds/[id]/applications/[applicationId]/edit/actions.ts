"use server";

import { redirect } from "next/navigation";
import { ApplicationInputError } from "@/modules/casting/application-input";
import {
  ApplicationUpdateError,
  ApplicationWriteError,
  ProfileRequiredError,
  updateApplication,
} from "@/modules/casting/repository";
import { PermissionDeniedError } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import type { CaptureFormState } from "../../new/actions";

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

// Screen O5's correction form (F3 change 3, design D4/D5), in the shape of the capture action: it
// maps FormData to the raw input and calls the repository, which decides everything (permission,
// row lock, parsing, the stale check, the write). Every error is mapped to a code by CLASS, never
// by message. The state that comes back holds a code and at most a field name, never a value, and
// this function never logs an error object: a database refusal would put the typed values into the
// log through Drizzle's "params:" (change 2, D4). It logs at most { code, sqlState, constraint } or
// { code: "unexpected", name }.
//
// `baseline` is the digest of the values the form was shown; it goes straight to the repository's
// stale check and is never echoed back or logged.
export async function updateApplicationAction(
  _prevState: CaptureFormState,
  formData: FormData,
): Promise<CaptureFormState> {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  const roundId = text(formData, "roundId");
  const applicationId = text(formData, "applicationId");
  const labels = formData.getAll("attrLabel").map((v) => (typeof v === "string" ? v : ""));
  const values = formData.getAll("attrValue").map((v) => (typeof v === "string" ? v : ""));
  const attributes = labels.map((label, i) => ({ label, value: values[i] ?? "" }));

  let changedCount: number;
  try {
    const { changed } = await updateApplication(current.context, {
      roundId,
      applicationId,
      baseline: text(formData, "baseline"),
      applicantName: text(formData, "applicantName"),
      age: text(formData, "age"),
      contacts: formData.getAll("contact").map((v) => (typeof v === "string" ? v : "")),
      messageRaw: text(formData, "message"),
      attributes,
      collectedFrom: text(formData, "collectedFrom"),
    });
    changedCount = changed.length;
  } catch (err) {
    if (err instanceof PermissionDeniedError) return { status: "error", code: "permission_denied" };
    if (err instanceof ProfileRequiredError) return { status: "error", code: "profile_required" };
    if (err instanceof ApplicationUpdateError) return { status: "error", code: err.code };
    if (err instanceof ApplicationInputError) return { status: "error", code: err.code, field: err.field };
    if (err instanceof ApplicationWriteError) {
      console.error({ code: err.code, sqlState: err.sqlState, constraint: err.constraint });
      return { status: "error", code: "save_failed" };
    }
    console.error({ code: "unexpected", name: err instanceof Error ? err.name : typeof err });
    return { status: "error", code: "save_failed" };
  }

  // redirect() works by throwing, so it stays OUTSIDE the try/catch above. Both ids are uuids by
  // now: the repository refused anything else as not_found before it wrote. `updated=0` when nothing
  // changed, so the detail says „Keine Änderungen" instead of claiming a save (human walkthrough,
  // 2026-09-29: a no-op save wrote nothing but announced „Änderungen gespeichert").
  redirect(`/rounds/${roundId}/applications/${applicationId}?updated=${changedCount > 0 ? "1" : "0"}`);
}
