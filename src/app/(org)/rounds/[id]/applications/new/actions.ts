"use server";

import { redirect } from "next/navigation";
import { ApplicationInputError, type ApplicationInputField } from "@/modules/casting/application-input";
import {
  ApplicationCaptureError,
  ApplicationWriteError,
  captureApplication,
  ProfileRequiredError,
} from "@/modules/casting/repository";
import { PermissionDeniedError } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";

export type CaptureErrorCode =
  | ApplicationInputError["code"]
  | ApplicationCaptureError["code"]
  | "permission_denied"
  | "profile_required"
  | "save_failed";

// D4 / spec "a refusal never echoes what was typed": the ONLY thing that comes back is a refusal
// code and at most a field name. No message, no value, no error object. `next dev` logs a server
// action's previous state in full (F2 lesson), so anything put here would reach a log.
export type CaptureFormState =
  | { status: "idle" }
  | { status: "error"; code: CaptureErrorCode; field?: ApplicationInputField };

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

// Screen O3. Maps FormData to the raw input and calls the repository, which decides everything
// (permission, round state, parsing, the write). Every error is mapped to a code by CLASS, never by
// message. This function never logs an error object: where the precedent writes `console.error(err)`
// (rounds/new/actions.ts), a database refusal here would put the typed values into the log through
// Drizzle's "params:" (design D4). It logs at most { code, sqlState, constraint }.
export async function captureApplicationAction(
  _prevState: CaptureFormState,
  formData: FormData,
): Promise<CaptureFormState> {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  const roundId = text(formData, "roundId");
  const labels = formData.getAll("attrLabel").map((v) => (typeof v === "string" ? v : ""));
  const values = formData.getAll("attrValue").map((v) => (typeof v === "string" ? v : ""));
  const attributes = labels.map((label, i) => ({ label, value: values[i] ?? "" }));

  let createdId: string;
  try {
    const created = await captureApplication(current.context, {
      roundId,
      applicantName: text(formData, "applicantName"),
      age: text(formData, "age"),
      contacts: formData.getAll("contact").map((v) => (typeof v === "string" ? v : "")),
      messageRaw: text(formData, "message"),
      attributes,
      collectedFrom: text(formData, "collectedFrom"),
    });
    createdId = created.id;
  } catch (err) {
    if (err instanceof PermissionDeniedError) return { status: "error", code: "permission_denied" };
    if (err instanceof ProfileRequiredError) return { status: "error", code: "profile_required" };
    if (err instanceof ApplicationCaptureError) return { status: "error", code: err.code };
    if (err instanceof ApplicationInputError) return { status: "error", code: err.code, field: err.field };
    if (err instanceof ApplicationWriteError) {
      console.error({ code: err.code, sqlState: err.sqlState, constraint: err.constraint });
      return { status: "error", code: "save_failed" };
    }
    // Anything else: no message, no object. The class name (e.g. NestedSessionContextError, a
    // timeout) carries no typed value and is what makes the failure findable.
    console.error({ code: "unexpected", name: err instanceof Error ? err.name : typeof err });
    return { status: "error", code: "save_failed" };
  }

  // redirect() works by throwing, so it stays OUTSIDE the try/catch above (design D6). The round id
  // is a uuid by now (the repository refused anything else). Both sources land on the round: the
  // third-party notice was already shown in the form's last step, and the application's detail
  // keeps it for later (FR-3.12, "afterwards"). The new id (a uuid the database made, never a typed
  // value) rides along so the toast can link to the detail (Copilot, PR #39).
  redirect(`/rounds/${roundId}?saved=${createdId}`);
}
