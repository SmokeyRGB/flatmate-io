"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { setOwnLocale } from "@/modules/identity/repository";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { isLocale } from "@/ui/strings/locales";
import { LOCALE_COOKIE } from "@/ui/strings/request";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// language-switch D8: the one action behind both toggles (the profile menu and the pre-account
// screens). The value is checked first. The device's cookie is set next, in every case, so the
// sign-in screen remembers the last choice and the device switches whatever happens after. A
// session, when there is one, then stores the choice on its OWN account (setOwnLocale takes the
// context from the session, never from the request). That write is best effort: a refusal or a
// database error is logged and the action still completes, so the person is never left with a
// toggle that threw. The account keeps its old language until the next successful switch. Nothing
// is stored before this runs, so nothing is stored for a visitor who never chooses.
export async function switchLanguage(formData: FormData): Promise<void> {
  const locale = formData.get("locale");
  if (!isLocale(locale)) return;

  (await cookies()).set(LOCALE_COOKIE, locale, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });

  const current = await getCurrentSession();
  if (current) {
    try {
      await setOwnLocale(current.context, locale);
    } catch (error) {
      console.error("switchLanguage: could not store the language on the account", error);
    }
  }

  // A soft navigation does not re-render the root layout, which holds <html lang> and the provider.
  revalidatePath("/", "layout");
}
