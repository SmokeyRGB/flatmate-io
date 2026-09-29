"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import {
  APPLICATION_LIMITS,
  classifyContact,
  MAX_CONTACTS,
  type ApplicationInputField,
} from "@/modules/casting/application-input";
import { noticeCategories } from "@/modules/casting/application-notice";
import { de } from "@/ui/strings";
import { SubmitButton } from "@/ui/submit-button";
import { ThirdPartyNotice } from "../third-party-notice";
import { captureApplicationAction, type CaptureErrorCode, type CaptureFormState } from "./actions";
import {
  carriedFields,
  clashingContactIndex,
  contactFields,
  decideSubmit,
  stepBack,
  stepForField,
  type CaptureStep,
} from "./capture-steps";

const t = de.applications.capture;
const e = de.applications.errors;
const FORM_ID = "capture-application-form";
const initialState: CaptureFormState = { status: "idle" };

// Code points, like Postgres char_length (assumption A5). Deliberately NOT a `maxLength`
// attribute: that counts UTF-16 units and would disagree with the database on emoji.
const count = (s: string) => [...s].length;

interface AttrRow {
  key: number;
  label: string;
  value: string;
}

// What the form shows under a field: a refusal's code and the field it named. Never a value.
interface ShownError {
  code: CaptureErrorCode;
  field?: ApplicationInputField;
}

// Screen O3, in three quiet steps on one route (design D6): the message, the details, and the
// notice only for a third-party source. Every value lives in CLIENT STATE (controlled inputs) until
// the final click; nothing is kept in the URL, in storage or on the server, and a reload starts
// over. The steps that are not on screen travel as hidden inputs (capture-steps.ts), so one <form>
// spans all three.
//
// The form submits through onSubmit + startTransition, not through the <form action> prop: React 19
// resets a form after an action, and keeping the typed values after a refusal would otherwise mean
// echoing them through the action's state (which `next dev` logs in full, and which spec forbids).
// The action returns only { status, code, field? } (design D6, pre-mortem 17).
//
// The Art. 14 notice sits OUTSIDE the <form> element (its „Verstanden" button is tied to the form
// by the `form` attribute), so the notice's editable <textarea> can never be posted (Compliance
// §4.5 rule 4).
export function CaptureForm({
  roundId,
  household,
  dateLabel,
  initial,
}: {
  roundId: string;
  household: string;
  dateLabel: string;
  // Only for the render tests, which cannot press a button: start on another step, with the box
  // ticked, or with some further-details rows.
  initial?: { step?: CaptureStep; thirdParty?: boolean; extraRows?: number };
}) {
  const [state, formAction] = useActionState(captureApplicationAction, initialState);
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState<CaptureStep>(initial?.step ?? 1);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [contacts, setContacts] = useState<string[]>([""]);
  const [rows, setRows] = useState<AttrRow[]>(
    Array.from({ length: initial?.extraRows ?? 0 }, (_, i) => ({ key: i + 1, label: "", value: "" })),
  );
  const [nextKey, setNextKey] = useState((initial?.extraRows ?? 0) + 1);
  const [thirdParty, setThirdParty] = useState(initial?.thirdParty ?? false);
  const [shown, setShown] = useState<ShownError | null>(null);
  const [seenState, setSeenState] = useState(state);

  // A new answer from the server: show it, and go to the step that holds the named field. Done
  // while rendering (React's "adjust state when a value changes"), not in an effect. The client's
  // own check is newer than any server answer and replaces it on the next submit.
  if (state !== seenState) {
    setSeenState(state);
    if (state.status === "error") {
      setShown({ code: state.code, field: state.field });
      const target = stepForField(state.field);
      if (target !== null) setStep(target);
    }
  }

  const values = { message, name, age, contacts, attributes: rows };

  function goTo(next: CaptureStep) {
    setShown(null);
    setStep(next);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    const decision = decideSubmit(step, { thirdParty, name });
    if (decision.kind === "go") return goTo(decision.step);
    if (decision.kind === "blank_name") {
      // The server stays authoritative; this only spares a round trip for the one required field.
      setShown({ code: "name_required", field: "applicantName" });
      return;
    }
    setShown(null);
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  const messageUsed = count(message);
  const messageNear = messageUsed >= APPLICATION_LIMITS.messageRaw * 0.9;
  const nameNear = count(name) >= APPLICATION_LIMITS.applicantName * 0.9;

  const clashIndex = shown?.code === "contact_kind_taken" ? clashingContactIndex(contacts) : null;
  // The error beside one field. A refusal that names no field (a closed round, no permission) is
  // shown once, under the step's buttons.
  const fieldError = (field: ApplicationInputField) =>
    shown?.field === field && !(field === "contact" && clashIndex !== null) ? (
      <p role="alert" className="field-error">
        {e[shown.code]}
      </p>
    ) : null;
  const generalError = shown && shown.field === undefined ? (
    <p role="alert" className="field-error">
      {e[shown.code]}
    </p>
  ) : null;

  const categories = noticeCategories({
    applicantName: name,
    age,
    ...contactFields(contacts),
    messageRaw: message,
    attributes: rows,
  });

  const updateContact = (i: number, value: string) =>
    setContacts((cs) => cs.map((c, j) => (j === i ? value : c)));

  return (
    <div className="space-y-4">
      <form
        id={FORM_ID}
        onSubmit={onSubmit}
        className={step === 3 ? undefined : "card space-y-4"}
        noValidate
      >
        <input type="hidden" name="roundId" value={roundId} />
        {/* The collection source (S-38, FR-3.9): explicit in BOTH cases, carried by this input. */}
        <input type="hidden" name="collectedFrom" value={thirdParty ? "third_party" : "data_subject"} />
        {carriedFields(step, values).map((field, i) => (
          <input key={`${field.name}-${i}`} type="hidden" name={field.name} value={field.value} />
        ))}

        {step === 1 && (
          <>
            <p className="text-sm text-muted-foreground">{t.messageIntro}</p>
            <div>
              <label htmlFor="message" className="field-label">
                {t.messageLabel}
              </label>
              <textarea
                id="message"
                name="message"
                rows={8}
                className="field-input"
                value={message}
                onChange={(ev) => setMessage(ev.target.value)}
              />
              <p
                className={`mt-1 text-xs ${messageNear ? "font-medium text-foreground" : "text-muted-foreground"}`}
                aria-live="polite"
              >
                {t.counter(messageUsed, APPLICATION_LIMITS.messageRaw)}
              </p>
              {fieldError("messageRaw")}
            </div>
            {generalError}
            <div className="flex justify-end">
              <button type="button" className="btn btn-primary" onClick={() => goTo(2)}>
                {t.next}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <label htmlFor="applicantName" className="field-label">
                {t.nameLabel}
              </label>
              <input
                id="applicantName"
                name="applicantName"
                required
                autoComplete="off"
                className="field-input"
                value={name}
                onChange={(ev) => setName(ev.target.value)}
              />
              {nameNear && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.limitNear(APPLICATION_LIMITS.applicantName)}
                </p>
              )}
              {fieldError("applicantName")}
            </div>

            <div>
              <label htmlFor="age" className="field-label">
                {t.ageLabel}
              </label>
              <input
                id="age"
                name="age"
                inputMode="numeric"
                autoComplete="off"
                className="field-input"
                value={age}
                onChange={(ev) => setAge(ev.target.value)}
              />
              {fieldError("age")}
            </div>

            <div className="space-y-2">
              {contacts.map((value, i) => (
                <div key={i}>
                  <label htmlFor={`contact-${i}`} className={i === 0 ? "field-label" : "sr-only"}>
                    {i === 0 ? t.contactLabel : t.contactLabelMore}
                  </label>
                  <input
                    id={`contact-${i}`}
                    name="contact"
                    autoComplete="off"
                    placeholder={i === 0 ? t.contactPlaceholder : undefined}
                    className="field-input"
                    value={value}
                    onChange={(ev) => updateContact(i, ev.target.value)}
                  />
                  {clashIndex === i ? (
                    <p role="alert" className="field-error">
                      {t.contactKindTaken[classifyContact(value)]}
                    </p>
                  ) : (
                    value.trim() !== "" && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t.contactStoredAs[classifyContact(value)]}
                      </p>
                    )
                  )}
                </div>
              ))}
              {fieldError("contact")}
              {contacts.length < MAX_CONTACTS && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setContacts((cs) => [...cs, ""])}
                >
                  {t.addContact}
                </button>
              )}
            </div>

            {rows.length === 0 ? (
              <div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setRows([{ key: nextKey, label: "", value: "" }]);
                    setNextKey((k) => k + 1);
                  }}
                >
                  {t.openAttributes}
                </button>
                {fieldError("attributes")}
              </div>
            ) : (
              <fieldset className="space-y-3">
                <legend className="field-label">{t.attributesLegend}</legend>
                {rows.map((row, i) => (
                  <div key={row.key} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                    <div>
                      <label htmlFor={`attrLabel-${row.key}`} className="sr-only">
                        {t.attributeLabelLabel}
                      </label>
                      <input
                        id={`attrLabel-${row.key}`}
                        name="attrLabel"
                        autoComplete="off"
                        placeholder={t.attributeLabelLabel}
                        className="field-input"
                        value={row.label}
                        onChange={(ev) =>
                          setRows((rs) => rs.map((r, j) => (j === i ? { ...r, label: ev.target.value } : r)))
                        }
                      />
                    </div>
                    <div>
                      <label htmlFor={`attrValue-${row.key}`} className="sr-only">
                        {t.attributeValueLabel}
                      </label>
                      <input
                        id={`attrValue-${row.key}`}
                        name="attrValue"
                        autoComplete="off"
                        placeholder={t.attributeValueLabel}
                        className="field-input"
                        value={row.value}
                        onChange={(ev) =>
                          setRows((rs) => rs.map((r, j) => (j === i ? { ...r, value: ev.target.value } : r)))
                        }
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                    >
                      {t.removeAttribute}
                    </button>
                  </div>
                ))}
                {fieldError("attributes")}
                {rows.length < APPLICATION_LIMITS.attributesMax && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setRows((rs) => [...rs, { key: nextKey, label: "", value: "" }]);
                      setNextKey((k) => k + 1);
                    }}
                  >
                    {t.addAttribute}
                  </button>
                )}
              </fieldset>
            )}

            {/* The collection source (S-38): a written statement plus one unticked checkbox. */}
            <div className="space-y-2">
              <p className="text-sm">{t.collectedFromStatement}</p>
              <label className="flex items-start gap-2 text-sm" htmlFor="collectedFromThirdParty">
                <input
                  id="collectedFromThirdParty"
                  type="checkbox"
                  className="mt-1 accent-primary"
                  checked={thirdParty}
                  onChange={(ev) => setThirdParty(ev.target.checked)}
                />
                {t.collectedFromCheckbox}
              </label>
              {fieldError("collectedFrom")}
            </div>

            {generalError}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => goTo(stepBack(2))}>
                {t.back}
              </button>
              {thirdParty ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    const decision = decideSubmit(2, { thirdParty, name });
                    if (decision.kind === "go") goTo(decision.step);
                    else setShown({ code: "name_required", field: "applicantName" });
                  }}
                >
                  {t.next}
                </button>
              ) : (
                <SubmitButton className="btn btn-primary" pending={isPending} pendingLabel={t.savePending}>
                  {t.save}
                </SubmitButton>
              )}
            </div>
          </>
        )}
      </form>

      {/* Outside the <form>: the edited text is never posted. „Verstanden" saves. */}
      {step === 3 && (
        <>
          <ThirdPartyNotice
            applicantName={name}
            household={household}
            categories={categories}
            dateLabel={dateLabel}
            deadlinePassed={false}
            understood={{ formId: FORM_ID, pending: isPending }}
          />
          {generalError}
          <button type="button" className="btn btn-secondary" onClick={() => goTo(stepBack(3))}>
            {t.back}
          </button>
        </>
      )}
    </div>
  );
}
