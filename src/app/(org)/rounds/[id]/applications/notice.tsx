"use client";

import { Check, CircleHelp, Copy } from "lucide-react";
import { useId, useState } from "react";
import type { NoticeCategory } from "@/modules/casting/application-notice";
import { de } from "@/ui/strings";
import { SubmitButton } from "@/ui/submit-button";

const t = de.applications.notice;

// The privacy notices of an application (Compliance §4.5, FR-3.11-3.13, FR-3.23, S-16). These
// pieces share this file:
//   - ThirdPartyNotice: the Art. 14 notice for a third-party collection, a callout because a duty
//     exists there. Shared by O3's last step (before saving) and the application detail (afterwards).
//   - ApplicantNotice: the Art. 13 text for an application collected from the applicant. Collapsed
//     and quiet, a row and not a callout, because nothing is due (FR-3.23).
//   - WhyButton + WhyText: the round (?) „Warum steht das hier?" in a notice's button row (its
//     `why` prop), and two or three sentences on the household's responsibility, opened in place,
//     no link.
// Both notices share NoticeTextPanel, the editable text with its copy button.
//
// Rules that hold for all of them (change 2's design D6, unchanged):
// - The text is a SUGGESTION: pre-filled, editable, one copy button. While untouched it follows
//   the current fields (seeded); once edited it no longer changes under the moderator's hands, and
//   "Text neu erzeugen" re-seeds it.
// - The <textarea> has NO name and is rendered OUTSIDE any <form> (the caller's job): the edited
//   text is never posted to the server (Compliance §4.5 rule 4).
// - NO send, share or mailto control exists anywhere here: the household informs the person by a
//   channel of its own (S-16). The app only helps. Nothing is required, tracked or reminded, and
//   nothing about the application depends on whether a notice was opened or copied (AC-3.20).

// The editable text with its copy and regenerate buttons and the `[Link]` hint. It is the inner
// block ThirdPartyNotice always had, moved out unchanged. Controlled: the owner keeps the edited
// text, so closing and reopening the notice does not lose an edit.
export function NoticeTextPanel({
  panelId,
  text,
  edited,
  onChange,
  onRegenerate,
}: {
  panelId: string;
  text: string;
  edited: boolean;
  onChange: (text: string) => void;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);

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

  return (
    <div id={panelId} className="space-y-2">
      <label htmlFor={`${panelId}-text`} className="field-label">
        {t.textLabel}
      </label>
      <textarea
        id={`${panelId}-text`}
        rows={8}
        className="field-input"
        value={text}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="text-xs text-muted-foreground">{t.linkHint}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="btn btn-secondary">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? t.copied : t.copy}
        </button>
        {edited && (
          <button type="button" onClick={onRegenerate} className="btn btn-secondary">
            {t.regenerate}
          </button>
        )}
      </div>
    </div>
  );
}

// „Warum steht das hier?": a round (?) in the notice's own button row, and the two or three
// sentences it opens in place, below. The notice that shows it owns the open state, so the (?)
// sits beside the button it explains instead of on a line of its own (human walkthrough,
// 2026-09-29). The question is the button's hover text AND its accessible name, and a tap opens
// the explanation: nothing depends on hovering (rahmenwerk.md §4.1.0, touch devices).
function WhyButton({ open, controls, onToggle }: { open: boolean; controls: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex rounded-full p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
      aria-label={t.whyToggle}
      title={t.whyToggle}
      aria-expanded={open}
      aria-controls={open ? controls : undefined}
      onClick={onToggle}
    >
      <CircleHelp className="size-5" aria-hidden="true" />
    </button>
  );
}

function WhyText({ id }: { id: string }) {
  return (
    <p id={id} className="text-sm">
      {t.why}
    </p>
  );
}

// Art. 14 notice for a third-party collection (Compliance §4.5 "Variante Dritterhebung"). The
// duty is real here, so it stays a callout. Deliberately quiet (design D6 of change 2, the human's
// review of 2026-09-29): the neutral info style, two lines, and the example text behind a button.
//
// - The two lines together state both deadlines: the person must learn of it, and the Compliance
//   line names the first message and the one-month date. A passed date says so in the same
//   neutral line (EC-3.5).
// - `understood`, when given, renders „Verstanden" as a submit button tied to the caller's form by
//   its id (the notice itself sits outside that form). The detail page passes none: nothing is
//   pending there.
// - `why`, which the detail passes and O3 does not, adds the round (?) „Warum steht das hier?"
//   to the button row, and its explanation below.
export function ThirdPartyNotice({
  applicantName,
  household,
  categories,
  dateLabel,
  deadlinePassed,
  understood,
  why,
  defaultOpen = false,
  defaultWhyOpen = false,
}: {
  applicantName: string;
  household: string;
  categories: NoticeCategory[];
  dateLabel: string;
  deadlinePassed: boolean;
  understood?: { formId: string; pending: boolean };
  why?: true;
  // Only for the render tests, which cannot press the toggles: start with the example text, or
  // the explanation, open.
  defaultOpen?: boolean;
  defaultWhyOpen?: boolean;
}) {
  const name = applicantName.trim();
  const seed = t.thirdPartyText({
    name: name === "" ? t.nameFallback : name,
    household,
    categories: categories.map((c) => t.categories[c]).join(", "),
  });
  const [open, setOpen] = useState(defaultOpen);
  const [whyOpen, setWhyOpen] = useState(defaultWhyOpen);
  const [edited, setEdited] = useState<string | null>(null);
  const panelId = useId();
  const whyId = useId();

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

      <div className="flex flex-wrap items-center gap-2">
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
        {why && <WhyButton open={whyOpen} controls={whyId} onToggle={() => setWhyOpen((o) => !o)} />}
      </div>
      {why && whyOpen && <WhyText id={whyId} />}

      {open && (
        <NoticeTextPanel
          panelId={panelId}
          text={edited ?? seed}
          edited={edited !== null}
          onChange={setEdited}
          onRegenerate={() => setEdited(null)}
        />
      )}

    </div>
  );
}

// Art. 13 notice for an application collected from the applicant (Compliance §4.5 Stufe 1,
// verbatim, A1). Collapsed by default, one secondary button. It is NOT a callout: nothing is due,
// so it sits as a quiet row under the facts. Its text is the fixed Stufe 1 text, editable before
// copying like the other variant.
export function ApplicantNotice({
  why,
  defaultOpen = false,
  defaultWhyOpen = false,
}: {
  // The detail passes it: the round (?) „Warum steht das hier?" beside the button.
  why?: true;
  // Only for the render tests, which cannot press the toggles.
  defaultOpen?: boolean;
  defaultWhyOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [whyOpen, setWhyOpen] = useState(defaultWhyOpen);
  const [edited, setEdited] = useState<string | null>(null);
  const panelId = useId();
  const whyId = useId();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? t.hideApplicantNotice : t.showApplicantNotice}
        </button>
        {why && <WhyButton open={whyOpen} controls={whyId} onToggle={() => setWhyOpen((o) => !o)} />}
      </div>
      {why && whyOpen && <WhyText id={whyId} />}
      {open && (
        <NoticeTextPanel
          panelId={panelId}
          text={edited ?? t.applicantText}
          edited={edited !== null}
          onChange={setEdited}
          onRegenerate={() => setEdited(null)}
        />
      )}
    </div>
  );
}
