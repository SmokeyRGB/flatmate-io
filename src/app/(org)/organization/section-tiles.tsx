import { DoorOpen, Settings, Users } from "lucide-react";
import Link from "next/link";
import { LinkPendingHint } from "@/ui/link-pending-hint";
import type { Strings } from "@/ui/strings";

// organisation-task-list D4 point 7: the sections the caller may use, as always-visible tiles. Each
// flag comes from `getNavigationAccess` (stored permissions), the same read as the profile menu.
// Fix round F7: no "who lives here" tile, the profile menu carries it; the members tile is the
// administration screen and is named so.
export function SectionTiles({
  access,
  s,
}: {
  access: { rooms: boolean; membersList: boolean; settings: boolean };
  s: Strings;
}) {
  const t = s.org.dashboard;
  const tiles = [
    access.rooms && { href: "/rooms", label: t.roomsLink, icon: <DoorOpen className="size-5" /> },
    access.membersList && { href: "/members", label: t.membersLink, icon: <Users className="size-5" /> },
    access.settings && { href: "/settings", label: t.settingsLink, icon: <Settings className="size-5" /> },
  ].filter((x) => x !== false);
  if (tiles.length === 0) return null;
  // As many columns as tiles, so two tiles never leave an empty third cell.
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
      {tiles.map((tile) => (
        <Link key={tile.href} href={tile.href} className="card org-tile transition hover:shadow-none">
          <span>{tile.icon}</span>
          <span>{tile.label}</span>
          <LinkPendingHint />
        </Link>
      ))}
    </div>
  );
}
