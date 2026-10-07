import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { claimResidentProfile, joinHousehold, registerHousehold } from "@/modules/identity/auth";
import { createResidentProfile, issueJoinCode } from "@/modules/identity/repository";
import { account } from "@/modules/identity/schema";
import type { Locale } from "@/ui/strings/locales";
import {
  cleanupAll,
  cleanupHousehold,
  deleteTestAccount,
  registerTestHousehold,
  testEmail,
  type TestHousehold,
} from "../../helpers/identity";

// language-switch D6: an account starts in the language its creating screen was displayed in, on
// all three paths that insert one. Real dev database; every household and Auth user is removed in
// afterEach.

const PASSWORD = "test-password-not-real-1234";

let hh: TestHousehold | undefined;
const accountIds: string[] = [];
const directHouseholds: Array<{ context: SessionContext; householdId: string }> = [];

afterEach(async () => {
  await cleanupAll(
    ...accountIds.map(deleteTestAccount),
    ...directHouseholds.map((h) => cleanupHousehold(h.context, h.householdId)),
    hh?.cleanup(),
  );
  accountIds.length = 0;
  directHouseholds.length = 0;
  hh = undefined;
});

async function localeOf(context: SessionContext, accountId: string): Promise<string | undefined> {
  const [row] = await withSessionContext(context, (tx) =>
    tx.select({ locale: account.locale }).from(account).where(eq(account.id, accountId)),
  );
  return row?.locale;
}

async function registerDirect(locale: Locale) {
  const { household, context } = await registerHousehold(testEmail(), PASSWORD, "WG", locale);
  accountIds.push(context.accountId);
  directHouseholds.push({ context, householdId: household.id });
  return context;
}

describe("An account starts in the language it was created in (language-switch D6)", () => {
  it("joinHousehold(…, 'en') stores en", async () => {
    hh = await registerTestHousehold();
    const link = await issueJoinCode(hh.context, hh.accountId, { validDays: 7, maxUses: 1 });
    const joined = await joinHousehold(link.code, { displayName: "LocaleJoin", password: PASSWORD }, "en");
    accountIds.push(joined.context.accountId);

    expect(await localeOf(hh.context, joined.context.accountId)).toBe("en");
  });

  it("registerHousehold(…, 'de') stores de, and registerHousehold(…, 'en') stores en", async () => {
    const german = await registerDirect("de");
    const english = await registerDirect("en");

    expect(await localeOf(german, german.accountId)).toBe("de");
    expect(await localeOf(english, english.accountId)).toBe("en");
  });

  it("claimResidentProfile(…, 'en') stores en", async () => {
    hh = await registerTestHousehold();
    const profile = await createResidentProfile(hh.context, "LocaleClaim", {
      accountId: hh.accountId,
      profileId: null,
    });
    const { accountId } = await claimResidentProfile(hh.context, profile.id, PASSWORD, "en");
    accountIds.push(accountId);

    expect(await localeOf(hh.context, accountId)).toBe("en");
  });
});
