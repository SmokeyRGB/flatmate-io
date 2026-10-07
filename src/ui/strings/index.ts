// design.md Decision 1: no `t()` accessor — `de.members.inviteLink.delete` is a plain, type-safe
// property read. This file re-exports the tables and the shared type they satisfy; the tables
// live in `de.ts` and `en.ts` (the only files whose diffs are reviewed as copy).
//
// language-switch design D1: `Strings` is the widened shape of `de`. `en.ts` ends in
// `as const satisfies Strings`, so a missing key, an extra key or a different parameter list fails
// `tsc`. `de.ts` keeps its bare `as const`: a `satisfies` against a type derived from its own
// `typeof` would be circular, and it is the reference anyway.
import { de } from "./de";
import { en } from "./en";
import type { Locale } from "./locales";

export type Strings = StringsOf<typeof de>;

type StringsOf<T> = T extends (...args: infer A) => string
  ? (...args: A) => string
  : T extends string
    ? string
    : { -readonly [K in keyof T]: StringsOf<T[K]> };

export const tables: Record<Locale, Strings> = { de, en };

// The table of one language, synchronously: for a caller that already knows the locale.
export const stringsFor = (locale: Locale): Strings => tables[locale];

export { de };
export type De = typeof de;
