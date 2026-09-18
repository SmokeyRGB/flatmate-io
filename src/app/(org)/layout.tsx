import { redirect } from "next/navigation";
import { getIdentityLabel } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { signOutAction } from "./sign-out-action";

// AC-1.6: every organisation-side screen states the signed-in identity; no control here changes
// it in place — signing out and back in (ADR-013) is the only way.
export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  const identityLabel = await getIdentityLabel(current.context);

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <span className="text-sm">
          Signed in as <strong>{identityLabel}</strong>
        </span>
        <form action={signOutAction}>
          <button type="submit" className="btn-link">
            Sign out
          </button>
        </form>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
