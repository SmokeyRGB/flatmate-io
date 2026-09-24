import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listRooms } from "@/modules/casting/repository";
import { assertHasPermission, PermissionDeniedError } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import { RoundForm } from "./round-form";

const t = de.rounds.new;

// Screen O2.
export default async function NewRoundPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  // rounds-new-page-missing-permission-guard: this page had no authorization check at all, only
  // an authentication one — any signed-in resident could reach and see the create/open form even
  // without close_round (the permission the sibling server action already enforces). Mirrors the
  // settings page's guard-and-render-message pattern, checked before any data load.
  try {
    await assertHasPermission(current.context, current.context.accountId, "close_round");
  } catch (err) {
    if (err instanceof PermissionDeniedError) {
      return (
        <div className="mx-auto max-w-md space-y-4 p-6">
          <Link href="/organization" className="back-link">
            <ArrowLeft className="size-4" /> {de.nav.organisation}
          </Link>
          <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>
          <p className="text-sm text-muted-foreground">{t.permissionDenied}</p>
        </div>
      );
    }
    throw err;
  }

  const rooms = await listRooms(current.context);

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <Link href="/organization" className="back-link">
        <ArrowLeft className="size-4" /> {de.nav.organisation}
      </Link>
      <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>
      <RoundForm rooms={rooms.map((r) => ({ id: r.id, label: r.label }))} />
    </div>
  );
}
