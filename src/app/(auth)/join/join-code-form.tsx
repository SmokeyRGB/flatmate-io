"use client";

import { useActionState, useState } from "react";
import { de } from "@/ui/strings";
import { enterJoinCodeAction, type JoinCodeFormState } from "./actions";

const initialState: JoinCodeFormState = { error: null };
const t = de.join.joinByCode;

// design.md Decision 4, applied to this one-field form: `draft` is the browser's own copy of what
// was typed, filled by the form's `action` wrapper BEFORE the useActionState dispatch, in the same
// transition. React 19 resets a form's uncontrolled fields after every action that does not throw
// (constraint 1) — rendering the input's `defaultValue` from `draft` means that reset restores what
// was just typed instead of emptying it, without the server ever sending the raw input back
// (design.md constraint 5: the previous state is what next dev's action log prints next).
//
// G-A5/Decision 1: POST only — no `method="get"`, no `next/form`, which would turn the field into a
// query string.
export function JoinCodeForm() {
  const [draft, setDraft] = useState("");
  const [state, formAction, pending] = useActionState(enterJoinCodeAction, initialState);

  return (
    <form
      action={(formData: FormData) => {
        setDraft(String(formData.get("code") ?? ""));
        formAction(formData);
      }}
      className="card space-y-4"
      noValidate
    >
      <div>
        <label htmlFor="code" className="field-label">
          {t.codeLabel}
        </label>
        <input
          id="code"
          name="code"
          type="text"
          defaultValue={draft}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={state.error ? true : undefined}
          aria-describedby="code-hint"
          className="field-input"
        />
        {/* FR-2.10a's spirit: the shape is stated before any rejection, not discovered by one, and
            it stays visible afterwards. A refusal adds its own sentence (never the hint merely
            turned red — rahmenwerk.md §12, „Nie Farbe allein") and is announced (role="alert"). */}
        {state.error && (
          <p className="field-error" role="alert">
            {state.error}
          </p>
        )}
        <p id="code-hint" className="field-helper">
          {t.codeFormatHint}
        </p>
      </div>

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? t.submitPending : t.submit}
      </button>
    </form>
  );
}
