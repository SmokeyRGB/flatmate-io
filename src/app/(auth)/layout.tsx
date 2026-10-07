import { LanguageToggle } from "@/app/_frame/language-toggle";

// join-screen design.md Decision 8: the shared shell for every (auth) route — sign-in, register
// and join alike — a centred column with the brand mark above the content. "flatmate.io" is the
// PRODUCT NAME here, not user-facing copy (ADR-012: implementation-facing, not a de.ts entry).
// language-switch D8: the language toggle sits between the mark and the content, so a visitor without
// an account can switch.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md space-y-6 p-6">
      <div className="flex justify-center">
        <span className="inline-flex items-center rounded-full bg-primary px-4 py-1.5 font-serif text-sm font-semibold text-primary-foreground">
          flatmate.io
        </span>
      </div>
      <div className="flex justify-center">
        <LanguageToggle className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm text-muted-foreground hover:bg-secondary" />
      </div>
      {children}
    </div>
  );
}
