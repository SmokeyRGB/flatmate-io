"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { de } from "@/ui/strings";

// A password field with a show/hide toggle (human request, 2026-09-24, resident-settings
// walkthrough): a new password is typed once, with no confirmation field, so a typo would lock the
// person out. Hidden by default, and revealed only while the person asks for it. Deliberately
// uncontrolled, like the plain <input> it replaces, so each form's reset-after-action behaviour
// (React 19) is unchanged, and no typed value ever enters component or action state.
export function PasswordInput({
  id,
  name,
  required,
  autoComplete,
}: {
  id: string;
  name: string;
  required?: boolean;
  autoComplete?: "current-password" | "new-password";
}) {
  const [visible, setVisible] = useState(false);
  const label = visible ? de.common.hidePassword : de.common.showPassword;

  return (
    <div className="password-field">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        required={required}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="field-input"
      />
      <button
        type="button"
        className="password-toggle"
        aria-label={label}
        aria-pressed={visible}
        aria-controls={id}
        title={label}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
