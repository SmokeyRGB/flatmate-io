"use client";

import { useStrings } from "@/ui/strings/provider";

// language-switch D9: the visually hidden status line every loading.tsx carries
// (loading-feedback design.md D8), as a client component. An `await getStrings()` in a Suspense
// fallback would make the fallback wait on the session query it exists to hide, so the text
// is read from the provider the root layout already put in context instead.
export function LoadingStatus({ variant = "common" }: { variant?: "common" | "join" }) {
  const t = useStrings();
  return (
    <p role="status" className="sr-only">
      {variant === "join" ? t.join.loading : t.common.loading}
    </p>
  );
}
