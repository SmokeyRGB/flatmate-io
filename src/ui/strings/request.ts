import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { getRenderSession } from "@/modules/identity/session-cookie";
import { preferredLocale } from "./accept-language";
import { isLocale, type Locale } from "./locales";
import { stringsFor, tables, type Strings } from "./index";

// language-switch D2/D8: the cookie the pre-account toggle sets, and the one name for it.
export const LOCALE_COOKIE = "flatmate_locale";

// The language when there is no live session: the device's remembered choice, else the browser's
// preference, else German. Memoised per render, like getRequestLocale.
export const getDeviceLocale = cache(async (): Promise<Locale> => {
  const remembered = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(remembered)) return remembered;

  return preferredLocale((await headers()).get("accept-language"));
});

// For a server action that has already resolved its own session: the language is that session's
// account language, or the device's when there is none. It saves resolving the session a second
// time just for the language. Call it before any withSessionContext, like getStrings.
export async function getLocaleFor(session: { locale: Locale } | null): Promise<Locale> {
  return session ? session.locale : getDeviceLocale();
}

export async function getStringsFor(session: { locale: Locale } | null): Promise<Strings> {
  return stringsFor(await getLocaleFor(session));
}

// Which language this request is shown in, decided once per render (React `cache`): a live
// session's account, else the device's remembered choice, else the browser's preference, else
// German. A server component or action calls it BEFORE any withSessionContext and never inside a
// transaction callback: it may resolve the session, which opens its own (D2). A failed session
// lookup (the database is down) must not take the pre-account pages down with it, so it falls back
// to the device's language and is logged, never rethrown.
export const getRequestLocale = cache(async (): Promise<Locale> => {
  try {
    const session = await getRenderSession();
    if (session) return session.locale;
  } catch (error) {
    console.error("getRequestLocale: the session lookup failed, falling back to the device language", error);
  }
  return getDeviceLocale();
});

export const getStrings = cache(async (): Promise<Strings> => tables[await getRequestLocale()]);
