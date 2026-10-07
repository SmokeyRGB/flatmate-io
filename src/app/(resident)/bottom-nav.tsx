"use client";

import { CalendarCheck, Home } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStrings } from "@/ui/strings/provider";
import { LinkPendingHint } from "@/ui/link-pending-hint";

const ITEMS = [
  { href: "/dashboard", key: "start", Icon: Home },
  { href: "/casting", key: "casting", Icon: CalendarCheck },
] as const;

// start-screen design.md Decision 10/spec `ui/resident-frame`: exactly two destinations, Start and
// Casting — icon-only on mobile with `aria-label`s, header text links at `md:` (globals.css's
// `.bottom-nav`). No bell (B2 is not built, and a control with nothing behind it is dead).
export function BottomNav() {
  const s = useStrings();
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label={s.nav.mainNavigation}>
      {ITEMS.map(({ href, key, Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-label={s.nav[key]}
            aria-current={active ? "page" : undefined}
            className={`bottom-nav-item${active ? " bottom-nav-item-active" : ""}`}
          >
            <Icon className="size-5" />
            <span className="hidden md:inline">{s.nav[key]}</span>
            <LinkPendingHint />
          </Link>
        );
      })}
    </nav>
  );
}
