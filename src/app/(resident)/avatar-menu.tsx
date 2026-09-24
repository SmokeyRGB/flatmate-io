"use client";

import { Home, LogOut, Settings, User, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { de } from "@/ui/strings";
import { menuItems, type MenuItem } from "./menu-items";

const ICONS = { Users, Home } as const;

// start-screen design.md Decision 10 (revised in pre-mortem): a <details>/<summary> whose panel is
// `position: absolute`, right-aligned below the trigger — a drop-down over the page, never pushing
// content, and correct without any script at all (opens/closes on click, keyboard- and
// screen-reader-correct). This small client wrapper only adds the convenience of closing on an
// outside click, on Esc (returning focus to the trigger) and on navigation — losing it loses only
// the convenience, never a destination (P-2). Deliberately NOT the `popover` attribute: it needs
// Baseline-2024 browsers, and its fallback cannot work because a `popovertarget` trigger is a
// `<button>` and cannot also be the `href="#…"` a `:target` fallback needs (design.md Decision 10).
export function AvatarMenu({
  displayName,
  householdName,
  access,
  signOutAction,
}: {
  displayName: string;
  householdName: string;
  access: { organisation: boolean; membersList: boolean };
  signOutAction: (formData: FormData) => void | Promise<void>;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const items: MenuItem[] = menuItems(access);
  const pathname = usePathname();

  // Closes on navigation — the layout stays mounted across route changes, so the <details> would
  // otherwise stay open after following one of its own links.
  useEffect(() => {
    if (detailsRef.current) detailsRef.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;

    function close() {
      if (details) details.open = false;
    }

    function handlePointerDown(event: PointerEvent) {
      if (details && details.open && !details.contains(event.target as Node)) {
        close();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && details?.open) {
        close();
        const summary = details.querySelector("summary");
        (summary as HTMLElement | null)?.focus();
      }
    }

    // pointerdown, not mousedown: iOS Safari fires no mouse event for a tap on a non-interactive
    // element, so an outside tap would never close the menu on an iPhone (review finding).
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <details ref={detailsRef} className="avatar-menu">
      <summary aria-label={de.nav.menuFor(displayName)}>
        <User className="size-4" />
        {displayName}
      </summary>
      <div className="avatar-menu-panel">
        <div className="avatar-menu-header">
          <p>{displayName}</p>
          <p>{householdName}</p>
        </div>
        <div className="avatar-menu-divider" />
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          return (
            <Link key={item.key} href={item.href} className="avatar-menu-item">
              <Icon className="size-4" /> {item.label}
            </Link>
          );
        })}
        <div className="avatar-menu-divider" />
        <Link href="/account" className="avatar-menu-item">
          <Settings className="size-4" /> {de.nav.accountSettings}
        </Link>
        <form action={signOutAction}>
          <button type="submit" className="avatar-menu-item">
            <LogOut className="size-4" /> {de.common.signOut}
          </button>
        </form>
      </div>
    </details>
  );
}
