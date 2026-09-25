"use client";

import { CircleCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { de } from "@/ui/strings";

const AUTO_DISMISS_MS = 5000;

// A short success notice (human request, 2026-09-24, resident-settings walkthrough): an inline
// line beneath a form was too easy to miss. `docs/09-Design-System.md` "Feedback states": a success
// moment may slide in gently, with a reduced-motion fallback, in the celebratory tint, never moving
// a fixed control. So it overlays the page and pushes nothing aside.
//
// `trigger` is the action state of the submission that succeeded, or null. Each successful submit
// yields a new state object, so the same message shows again on a second save. Whether it is open
// is derived from `trigger` rather than set inside an effect. Only the timer and the close button
// write state, and they record which trigger was dismissed.
export function SuccessToast({ message, trigger }: { message: string; trigger: object | null }) {
  const [dismissed, setDismissed] = useState<object | null>(null);
  const open = trigger !== null && trigger !== dismissed;

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setDismissed(trigger), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [open, trigger]);

  // role="status" stays mounted, so screen readers announce the message when it appears.
  return (
    <div role="status" aria-live="polite" className="toast-region">
      {open && (
        <div className="toast">
          <CircleCheck className="size-5 shrink-0 text-primary" aria-hidden />
          <p className="flex-1">{message}</p>
          <button
            type="button"
            className="toast-close"
            aria-label={de.common.close}
            onClick={() => setDismissed(trigger)}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
