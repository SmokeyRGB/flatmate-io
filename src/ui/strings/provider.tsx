"use client";

import { createContext, useContext } from "react";
import { tables, type Strings } from "./index";
import type { Locale } from "./locales";

// language-switch D3: the root layout puts the request's table in context so every client
// component, error.tsx boundaries included, reads it with `useStrings()`. The 58 function-valued
// entries cannot cross the server -> client boundary as props, which is why this is a provider.
// The context has no default on purpose: a default German table would silently pass a missing
// provider in production, so `useStrings()` throws outside one.
type Value = { locale: Locale; strings: Strings };

const StringsContext = createContext<Value | null>(null);

export function StringsProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <StringsContext.Provider value={{ locale, strings: tables[locale] }}>{children}</StringsContext.Provider>;
}

function useValue(): Value {
  const value = useContext(StringsContext);
  if (value === null) throw new Error("useStrings() was called outside a <StringsProvider>.");
  return value;
}

export function useStrings(): Strings {
  return useValue().strings;
}

// The language itself, for rendering that depends on it beyond the tables (a decimal separator,
// a date format).
export function useLocale(): Locale {
  return useValue().locale;
}
