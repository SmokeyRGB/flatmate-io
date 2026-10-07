"use client";

import { Languages } from "lucide-react";
import { SubmitButton } from "@/ui/submit-button";
import { LOCALES } from "@/ui/strings/locales";
import { useLocale, useStrings } from "@/ui/strings/provider";
import { switchLanguage } from "./language-actions";

// language-switch D8: offers the OTHER language by its own name ("Deutsch" / "English"), so a
// visitor who cannot read the current language still finds theirs. A form with a hidden `locale`
// and the shared SubmitButton (pending feedback); it works without script like every other form.
export function LanguageToggle({ className }: { className: string }) {
  const s = useStrings();
  const locale = useLocale();
  const target = LOCALES.find((l) => l !== locale) ?? locale;
  const name = s.language.names[target];

  return (
    <form action={switchLanguage}>
      <input type="hidden" name="locale" value={target} />
      <SubmitButton
        className={className}
        icon={<Languages className="size-4" aria-hidden="true" />}
        lang={target}
        aria-label={`${s.language.toggleLabel}: ${name}`}
      >
        {name}
      </SubmitButton>
    </form>
  );
}
