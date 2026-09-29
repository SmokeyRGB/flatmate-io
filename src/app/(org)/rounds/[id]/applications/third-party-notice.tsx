"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import type { NoticeCategory } from "@/modules/casting/application-notice";
import { de } from "@/ui/strings";

const t = de.applications.notice;

// Art. 14 notice for a third-party collection (Compliance §4.5 "Variante Dritterhebung", FR-3.11-
// 3.13, S-16). Shared by O3 (before saving) and the application detail (after saving).
//
// - The duty line names both deadlines and the date; a passed date says so plainly (EC-3.5).
// - The text is a SUGGESTION: pre-filled, editable, one copy button. While untouched it follows
//   the current fields (seeded); once edited it no longer changes under the moderator's hands, and
//   "Text neu erzeugen" re-seeds it.
// - The <textarea> has NO name and is rendered OUTSIDE any <form> (the caller's job): the edited
//   text is never posted to the server (Compliance §4.5 rule 4).
// - NO send, share or mailto control exists anywhere here: the household informs the person by a
//   channel of its own (S-16). The app only helps.
export function ThirdPartyNotice({
  applicantName,
  household,
  categories,
  dateLabel,
  deadlinePassed,
}: {
  applicantName: string;
  household: string;
  categories: NoticeCategory[];
  dateLabel: string;
  deadlinePassed: boolean;
}) {
  const name = applicantName.trim();
  const seed = t.thirdPartyText({
    name: name === "" ? t.nameFallback : name,
    household,
    categories: categories.map((c) => t.categories[c]).join(", "),
  });
  const [edited, setEdited] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
    <section className="callout callout-caution flex-col items-stretch gap-3" aria-labelledby="third-party-notice-heading">
      <h2 id="third-party-notice-heading" className="text-base font-medium">
        {t.heading}
      </h2>
      <p className="text-sm">{t.dutyLine}</p>
      <p className="text-sm font-medium">
        {deadlinePassed
          ? t.deadlinePassed(dateLabel)
          : t.deadlineLine(name === "" ? t.deadlineNameFallback : name, dateLabel)}
      </p>

      <div>
        <label htmlFor="third-party-notice-text" className="field-label">
          {t.textLabel}
        </label>
        <textarea
          id="third-party-notice-text"
          rows={8}
          className="field-input"
          value={text}
          onChange={(event) => setEdited(event.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">{t.editHint}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t.linkHint}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="btn btn-primary">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? t.copied : t.copy}
        </button>
        {edited !== null && (
          <button type="button" onClick={() => setEdited(null)} className="btn btn-secondary">
            {t.regenerate}
          </button>
        )}
      </div>
    </section>
  );
}
