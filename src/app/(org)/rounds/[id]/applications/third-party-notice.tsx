"use client";

import { Check, Copy } from "lucide-react";
import { useId, useState } from "react";
import type { NoticeCategory } from "@/modules/casting/application-notice";
import { de } from "@/ui/strings";
import { SubmitButton } from "@/ui/submit-button";

const t = de.applications.notice;

// Art. 14 notice for a third-party collection (Compliance §4.5 "Variante Dritterhebung", FR-3.11-
// 3.13, S-16). Shared by O3's last step (before saving) and the application detail (afterwards).
// Deliberately quiet (design D6, the human's review of 2026-09-29): the neutral info style, two
// lines, and the example text behind a button.
//
// - The two lines together state both deadlines: the person must learn of it, and the Compliance
//   line names the first message and the one-month date. A passed date says so in the same
//   neutral line (EC-3.5).
// - The text is a SUGGESTION: pre-filled, editable, one copy button. While untouched it follows
//   the current fields (seeded); once edited it no longer changes under the moderator's hands, and
//   "Text neu erzeugen" re-seeds it.
// - The <textarea> has NO name and is rendered OUTSIDE any <form> (the caller's job): the edited
//   text is never posted to the server (Compliance §4.5 rule 4).
// - `understood`, when given, renders „Verstanden" as a submit button tied to the caller's form by
//   its id (the notice itself sits outside that form). The detail page passes none: nothing is
//   pending there.
// - NO send, share or mailto control exists anywhere here: the household informs the person by a
//   channel of its own (S-16). The app only helps.
export function ThirdPartyNotice({
  applicantName,
  household,
  categories,
  dateLabel,
  deadlinePassed,
  understood,
  defaultOpen = false,
}: {
  applicantName: string;
  household: string;
  categories: NoticeCategory[];
  dateLabel: string;
  deadlinePassed: boolean;
  understood?: { formId: string; pending: boolean };
  // Only for the render tests, which cannot press the toggle: start with the example text open.
  defaultOpen?: boolean;
}) {
  const name = applicantName.trim();
  const seed = t.thirdPartyText({
    name: name === "" ? t.nameFallback : name,
    household,
    categories: categories.map((c) => t.categories[c]).join(", "),
  });
  const [open, setOpen] = useState(defaultOpen);
  const [edited, setEdited] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const panelId = useId();
  const text = edited ?? seed;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied (permissions, insecure context). The text is visible in
      // the box right here, so there is always a fallback; no error state is worth showing.
    }
  }

  // .callout is a one-line flex row (icon + text); this notice is a stacked block, so it is turned
  // into a column (walkthrough finding: the paragraphs sat side by side and scrolled sideways).
  return (
    <div className="callout callout-info flex-col items-stretch gap-3">
      <p className="text-sm">{t.informLine}</p>
      <p className="text-sm">
        {deadlinePassed
          ? t.deadlinePassed(dateLabel)
          : t.deadlineLine(name === "" ? t.deadlineNameFallback : name, dateLabel)}
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? t.hideExample : t.showExample}
        </button>
        {understood && (
          <SubmitButton form={understood.formId} className="btn btn-primary" pending={understood.pending}>
            {t.understood}
          </SubmitButton>
        )}
      </div>

      {open && (
        <div id={panelId} className="space-y-2">
          <label htmlFor={`${panelId}-text`} className="field-label">
            {t.textLabel}
          </label>
          <textarea
            id={`${panelId}-text`}
            rows={8}
            className="field-input"
            value={text}
            onChange={(event) => setEdited(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t.linkHint}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copy} className="btn btn-secondary">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? t.copied : t.copy}
            </button>
            {edited !== null && (
              <button type="button" onClick={() => setEdited(null)} className="btn btn-secondary">
                {t.regenerate}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
