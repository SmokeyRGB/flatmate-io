"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { de } from "@/ui/strings";

const t = de.members.joinCode;

// design.md Decision 6 / 09-Design-System.md line 84: the stacked pair — a full-width solid
// primary "copy the whole thing" action on top, a quieter secondary "copy just the short value"
// beneath. `navigator.clipboard` needs a client component; the surrounding page stays a server
// component (task 3.4). The second button is not a lesser convenience — it is the channel FR-2.27
// needs for hand entry (P-1 Kanalneutralität).
export function JoinCodeCopyButtons({ code, url }: { code: string; url: string }) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  async function copy(value: string, which: "link" | "code") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied((current) => (current === which ? null : current)), 2000);
    } catch {
      // ponytail: clipboard access can be denied by the browser (permissions, insecure context);
      // the code/URL are already visible in plain text right above these buttons, so there is
      // always a fallback — no error state is worth surfacing here.
    }
  }

  return (
    <div className="copy-button-pair">
      <button type="button" onClick={() => copy(url, "link")} className="btn btn-primary">
        {copied === "link" ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied === "link" ? t.copiedFullLink : t.copyFullLink}
      </button>
      <button type="button" onClick={() => copy(code, "code")} className="btn btn-secondary">
        {copied === "code" ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied === "code" ? t.copiedCodeOnly : t.copyCodeOnly}
      </button>
    </div>
  );
}
