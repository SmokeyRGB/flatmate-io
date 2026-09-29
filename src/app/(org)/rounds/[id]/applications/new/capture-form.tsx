"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import { APPLICATION_LIMITS } from "@/modules/casting/application-input";
import { noticeCategories } from "@/modules/casting/application-notice";
import { de } from "@/ui/strings";
import { SubmitButton } from "@/ui/submit-button";
import { ThirdPartyNotice } from "../third-party-notice";
import { captureApplicationAction, type CaptureFormState } from "./actions";

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

// Screen O3. The form's values live in CLIENT STATE (controlled inputs) and the form submits
// through onSubmit + startTransition, not through the <form action> prop: React 19 resets a form
// after an action, and keeping the typed values after a refusal would otherwise mean echoing them
// through the action's state (which `next dev` logs in full, and which spec forbids). The action
// returns only { status, code, field? } (design D6, pre-mortem 17).
//
// The Art. 14 notice and the submit button sit OUTSIDE the <form> element (the button is tied to
// it by the `form` attribute), so the notice's editable <textarea> can never be posted (Compliance
// §4.5 rule 4).
export function CaptureForm({
  roundId,
  household,
  dateLabel,
}: {
  roundId: string;
  household: string;
  dateLabel: string;
}) {
  const [state, formAction] = useActionState(captureApplicationAction, initialState);
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [other, setOther] = useState("");
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<AttrRow[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [thirdParty, setThirdParty] = useState(false);
  const [blankName, setBlankName] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    // The server stays authoritative; this only spares a round trip for the one required field.
    if (name.trim() === "") {
      setBlankName(true);
      return;
    }
    setBlankName(false);
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  const messageUsed = count(message);
  const messageNear = messageUsed >= APPLICATION_LIMITS.messageRaw * 0.9;
  const near = (value: string, max: number) => count(value) >= max * 0.9;

  // The client's own check is newer than any server answer: it runs on this submit, the server's
  // state belongs to the previous one (code review).
  const errorCode = blankName ? "name_required" : state.status === "error" ? state.code : null;
  const errorField = blankName ? "applicantName" : state.status === "error" ? state.field : undefined;

  const categories = noticeCategories({
    applicantName: name,
    age,
    contactEmail: email,
    contactPhone: phone,
    contactOther: other,
    messageRaw: message,
    attributes: rows,
  });

  return (
    <div className="space-y-6">
      <form id={FORM_ID} onSubmit={onSubmit} className="card space-y-4" noValidate>
        <input type="hidden" name="roundId" value={roundId} />

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
          {near(name, APPLICATION_LIMITS.applicantName) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t.limitNear(APPLICATION_LIMITS.applicantName)}
            </p>
          )}
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
        </div>

        <div>
          <label htmlFor="contactEmail" className="field-label">
            {t.emailLabel}
          </label>
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            autoComplete="off"
            className="field-input"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
          />
          {near(email, APPLICATION_LIMITS.contactEmail) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t.limitNear(APPLICATION_LIMITS.contactEmail)}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="contactPhone" className="field-label">
            {t.phoneLabel}
          </label>
          <input
            id="contactPhone"
            name="contactPhone"
            type="tel"
            autoComplete="off"
            className="field-input"
            value={phone}
            onChange={(ev) => setPhone(ev.target.value)}
          />
          {near(phone, APPLICATION_LIMITS.contactPhone) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t.limitNear(APPLICATION_LIMITS.contactPhone)}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="contactOther" className="field-label">
            {t.otherContactLabel}
          </label>
          <input
            id="contactOther"
            name="contactOther"
            autoComplete="off"
            className="field-input"
            value={other}
            onChange={(ev) => setOther(ev.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">{t.otherContactHint}</p>
          {near(other, APPLICATION_LIMITS.contactOther) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t.limitNear(APPLICATION_LIMITS.contactOther)}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="messageRaw" className="field-label">
            {t.messageLabel}
          </label>
          <textarea
            id="messageRaw"
            name="messageRaw"
            rows={6}
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
        </div>

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

        {/* The collection source (S-38): a written statement plus one unticked checkbox. The value
            the form submits is explicit in BOTH cases (FR-3.9), carried by the hidden input. */}
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
          <input type="hidden" name="collectedFrom" value={thirdParty ? "third_party" : "data_subject"} />
        </div>
      </form>

      {/* Outside the <form>: the edited text is never posted. */}
      {thirdParty && (
        <ThirdPartyNotice
          applicantName={name}
          household={household}
          categories={categories}
          dateLabel={dateLabel}
          deadlinePassed={false}
        />
      )}

      {errorCode && (
        <p role="alert" className="field-error">
          {e[errorCode]}
          {errorField ? ` ${e.fieldPrefix(e.fields[errorField])}` : ""}
        </p>
      )}

      <SubmitButton
        form={FORM_ID}
        className="btn btn-primary"
        pending={isPending}
        pendingLabel={t.submitPending}
      >
        {t.submit}
      </SubmitButton>
    </div>
  );
}
