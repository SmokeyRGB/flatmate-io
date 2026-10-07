import { getStrings } from "@/ui/strings/request";
import { SignInForm } from "./sign-in-form";

// Copilot review round 2 (PR #23): auth.ts's redeemPasswordReset can throw
// reset_done_sign_in_failed from phase 3 (the password is already set — phases 1 and 2 already
// committed — but the immediate sign-in with it failed) — the reset action redirects here with a
// note, same pattern as /dashboard's own ?note=already_member
// (src/app/(resident)/dashboard/page.tsx). Recreated exactly as in commit a95bbb9.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ note?: string }>;
}) {
  const { note } = await searchParams;
  const t = await getStrings();
  return (
    <>
      {note === "password_reset" && (
        <div role="note" className="callout callout-info">
          {t.auth.signIn.passwordResetNote}
        </div>
      )}
      {note === "password_reset_unknown" && (
        <div role="note" className="callout callout-info">
          {t.auth.signIn.passwordResetUnknownNote}
        </div>
      )}
      <SignInForm />
    </>
  );
}
