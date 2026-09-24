import { de } from "@/ui/strings";
import { SignInForm } from "./sign-in-form";

// review fix: auth.ts's redeemPasswordReset can now throw reset_done_sign_in_failed AFTER its own
// transaction has already committed (password set, sessions revoked, link spent) — the reset
// action redirects here with a note, same pattern as /dashboard's own ?note=already_member
// (src/app/(resident)/dashboard/page.tsx).
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ note?: string }>;
}) {
  const { note } = await searchParams;
  return (
    <>
      {note === "password_reset" && (
        <div role="note" className="callout callout-info">
          {de.auth.signIn.passwordResetNote}
        </div>
      )}
      <SignInForm />
    </>
  );
}
