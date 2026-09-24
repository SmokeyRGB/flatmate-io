import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { JOIN_PASSWORD_MIN_LENGTH } from "@/modules/identity/auth";
import { getOwnAccountEmail } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { de } from "@/ui/strings";
import { signOutAction } from "../../(org)/sign-out-action";
import { EmailForm } from "./email-form";
import { PasswordForm } from "./password-form";

const t = de.account;

// Screen E1 (`screens/E-einstellungen.md`), replacing change 4's placeholder. Three sections:
// email (FR-2.17), password (FR-2.10a), sign-out. No push section (S-28/S-45 are v0.2) and no
// passkey (ADR-007 needs a confirmed email, which v0.1 cannot produce).
export default async function AccountPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/sign-in");

  // design.md Decision 8: Keine-Berechtigung fallback for a household session reaching this
  // route directly — the `(resident)` layout already redirects one away to its own landing before
  // any child renders, so this is the stated (not merely assumed) fallback, never the primary
  // enforcement point. changeResidentEmail/changeResidentPassword/getOwnAccountEmail each refuse a
  // household session on their own regardless.
  if (current.context.profileId === null) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6">
        <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>
        <p className="text-sm text-muted-foreground">
          {t.noPermissionBody}{" "}
          <a href="/settings" className="btn-link">
            {t.noPermissionLink}
          </a>
          .
        </p>
      </div>
    );
  }

  const email = await getOwnAccountEmail(current.context);

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <Link href="/dashboard" className="back-link">
        <ArrowLeft className="size-4" /> {t.backToStart}
      </Link>
      <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>

      <section className="card space-y-3">
        <h2 className="font-serif text-lg font-semibold">{t.email.heading}</h2>
        {email ? (
          <p className="text-sm text-muted-foreground">
            {t.email.currentLabel}: {email}
          </p>
        ) : (
          <>
            {/* FR-2.17/E1 ("nie als Sperre formuliert"): the pitch is recovery, never a
                requirement, plus the EC-2.6 sentence stating plainly what the gap costs. */}
            <p className="text-sm text-muted-foreground">{t.email.pitch}</p>
            <p className="text-sm text-muted-foreground">{t.email.noRecoveryNotice}</p>
          </>
        )}
        <EmailForm currentEmail={email} />
      </section>

      <section className="card space-y-3">
        <h2 className="font-serif text-lg font-semibold">{t.password.heading}</h2>
        <PasswordForm passwordMinLength={JOIN_PASSWORD_MIN_LENGTH} />
      </section>

      <section className="card space-y-3">
        <h2 className="font-serif text-lg font-semibold">{t.signOut.heading}</h2>
        <form action={signOutAction}>
          <button type="submit" className="btn btn-secondary w-full">
            {de.common.signOut}
          </button>
        </form>
      </section>
    </div>
  );
}
