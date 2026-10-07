import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { claimResidentProfile } from "@/modules/identity/auth";
import { createResidentProfile, setOwnLocale, SetOwnLocaleError } from "@/modules/identity/repository";
import { account } from "@/modules/identity/schema";
import type { Locale } from "@/ui/strings/locales";
import { cleanupAll, deleteTestAccount, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

// language-switch D5: setOwnLocale changes the caller's own account and nobody else's, and the
// database CHECK `account_locale_check` (drizzle/0036) refuses any other value on every path.
// Real dev database; the household (and the Auth users claimed in it) are removed in afterEach.

let hh: TestHousehold | undefined;

afterEach(async () => {
  await cleanupAll(hh?.cleanup());
  hh = undefined;
});

const PASSWORD = "test-password-not-real-1234";

async function localeOf(context: SessionContext, accountId: string): Promise<string | undefined> {
  const [row] = await withSessionContext(context, (tx) =>
    tx.select({ locale: account.locale }).from(account).where(eq(account.id, accountId)),
  );
  return row?.locale;
}

async function newResident(h: TestHousehold, name: string): Promise<SessionContext> {
  const actor = { accountId: h.accountId, profileId: null };
  const profile = await createResidentProfile(h.context, name, actor);
  const { accountId } = await claimResidentProfile(h.context, profile.id, PASSWORD, "de");
  const original = h.cleanup;
  h.cleanup = async () => {
    await original();
    await deleteTestAccount(accountId);
  };
  return { accountId, householdId: h.householdId, profileId: profile.id };
}

describe("setOwnLocale (language-switch D5)", () => {
  it("(a) a resident sets en; a housemate and the household account stay de", async () => {
    hh = await registerTestHousehold();
    const resident = await newResident(hh, "LocaleA1");
    const housemate = await newResident(hh, "LocaleA2");

    await setOwnLocale(resident, "en");

    expect(await localeOf(hh.context, resident.accountId)).toBe("en");
    expect(await localeOf(hh.context, housemate.accountId)).toBe("de");
    expect(await localeOf(hh.context, hh.accountId)).toBe("de");
  });

  it("(b) a value outside the two languages is refused with invalid_locale and changes nothing", async () => {
    hh = await registerTestHousehold();
    const resident = await newResident(hh, "LocaleB");

    let caught: unknown;
    try {
      await setOwnLocale(resident, "fr" as Locale);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SetOwnLocaleError);
    expect((caught as SetOwnLocaleError).code).toBe("invalid_locale");
    expect(await localeOf(hh.context, resident.accountId)).toBe("de");
  });

  it("(c) raw SQL as app_runtime setting 'fr' is refused by account_locale_check; 'en' is accepted", async () => {
    hh = await registerTestHousehold();
    const ctx = hh.context;

    // Positive control: the same statement with a valid value succeeds, so the refusal below is the
    // constraint's, not RLS or a malformed statement.
    await withSessionContext(ctx, (tx) =>
      tx.execute(sql`UPDATE account SET locale = 'en' WHERE id = ${ctx.accountId}::uuid`),
    );
    expect(await localeOf(ctx, ctx.accountId)).toBe("en");

    let caught: unknown;
    try {
      await withSessionContext(ctx, (tx) =>
        tx.execute(sql`UPDATE account SET locale = 'fr' WHERE id = ${ctx.accountId}::uuid`),
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const err = caught as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } };
    const pg = err.code ? err : (err.cause ?? err);
    expect(pg.code).toBe("23514");
    expect(pg.constraint_name).toBe("account_locale_check");
    expect(await localeOf(ctx, ctx.accountId)).toBe("en");
  });

  it("(d) the household-account session sets its own account only", async () => {
    hh = await registerTestHousehold();
    const resident = await newResident(hh, "LocaleD");

    await setOwnLocale(hh.context, "en");

    expect(await localeOf(hh.context, hh.accountId)).toBe("en");
    expect(await localeOf(hh.context, resident.accountId)).toBe("de");
  });
});
