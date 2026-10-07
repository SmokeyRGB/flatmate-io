import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StringsProvider } from "@/ui/strings/provider";
import type { Locale } from "@/ui/strings/locales";

// language-switch D10: renders a client component inside the provider, German by default (the
// language existing tests assert through `de.*`). There is deliberately no provider-free path.
export function renderWithStrings(element: ReactElement, locale: Locale = "de"): string {
  return renderToStaticMarkup(<StringsProvider locale={locale}>{element}</StringsProvider>);
}
