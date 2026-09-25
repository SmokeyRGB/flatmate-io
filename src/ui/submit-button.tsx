"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { de } from "@/ui/strings";

type SubmitButtonProps = {
  children: ReactNode;
  icon?: ReactNode;
  pendingLabel?: ReactNode;
  className: string;
  disabled?: boolean;
} & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "disabled" | "children" | "className" | "onClick"
>;

// loading-feedback design.md D1: the ONE submit button every form in src/app/ uses. Reads
// useFormStatus() (react-dom), so it works both inside a plain server-component form (the hook
// reads the nearest ancestor <form>) and inside a form whose `action` wraps useActionState's
// dispatch (JoinForm et al.) — it never needs to know which kind of form it's in.
//
// Pending state is aria-disabled + aria-busy + a click guard, NOT the real `disabled` attribute:
// disabling the focused button drops keyboard focus, and remove-member-form's confirm button sits
// inside a modal <dialog> that stays open on a refusal (task 3.2). A caller-supplied `disabled`
// (the type-to-confirm gate) still sets a REAL `disabled` — that button isn't focused-and-
// submitting, it's simply not allowed yet.
//
// No layout change idle vs. pending: `.submit-stack` is a one-cell CSS grid holding both layers
// (idle: icon + children; pending: spinner + pendingLabel ?? children) — only `visibility`
// toggles (globals.css), so the button's width is always the larger layer's width, and there is no
// reserved spinner slot at idle.
export function SubmitButton({
  children,
  icon,
  pendingLabel,
  className,
  disabled,
  ...rest
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const disabledNotPending = Boolean(disabled) && !pending;

  return (
    <>
      <button
        type="submit"
        className={className}
        aria-disabled={pending || disabled ? "true" : undefined}
        aria-busy={pending ? "true" : undefined}
        disabled={disabledNotPending ? true : undefined}
        onClick={(event) => {
          if (pending) event.preventDefault();
        }}
        {...rest}
      >
        <span className="submit-stack">
          <span className="submit-stack-idle">
            {icon}
            {children}
          </span>
          <span className="submit-stack-pending">
            <span className="spinner" aria-hidden="true" />
            {pendingLabel ?? children}
          </span>
        </span>
      </button>
      {/* Always rendered, next to the button (never inside it — ARIA treats a button's children
          as presentational, so a live region inside it isn't reliably announced), and a live
          region must exist before its text changes. */}
      <span role="status" className="sr-only">
        {pending ? de.common.pending : ""}
      </span>
    </>
  );
}
