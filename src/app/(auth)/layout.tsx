// join-screen design.md Decision 8: the shared shell for every (auth) route — sign-in, register
// and join alike — a centred column with the brand mark above the content. "flatmate.io" is the
// PRODUCT NAME here, not user-facing copy (ADR-012: implementation-facing, not a de.ts entry).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md space-y-6 p-6">
      <div className="flex justify-center">
        <span className="inline-flex items-center rounded-full bg-primary px-4 py-1.5 font-serif text-sm font-semibold text-primary-foreground">
          flatmate.io
        </span>
      </div>
      {children}
    </div>
  );
}
