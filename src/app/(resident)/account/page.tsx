import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { de } from "@/ui/strings";

const t = de.account;

// Screen E1 (`screens/E-einstellungen.md`), placeholder in this change — its v0.1 content (adding
// or changing an email per FR-2.17, changing the password) is change 5. This is the resident's
// OWN settings, reachable from the avatar menu only — distinct from O20, the household settings
// screen, which this page never shows or links to.
export default function AccountPage() {
  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <Link href="/dashboard" className="back-link">
        <ArrowLeft className="size-4" /> {t.backToStart}
      </Link>
      <h1 className="font-serif text-2xl font-semibold">{t.heading}</h1>
      <p className="text-sm text-muted-foreground">{t.placeholderBody}</p>
    </div>
  );
}
