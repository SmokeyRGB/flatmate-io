import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { isWellFormedHouseholdSignInCode } from "@/modules/identity/repository";
import { cleanupAll, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

// household-sign-in-code design D1/D2: drizzle/0032's column default is the only generator; the
// CHECK and the unique index are what keep a stray writer honest (G-C7: raw SQL as app_runtime).
let hh: TestHousehold | undefined;
const rawHouseholdIds: string[] = [];

afterEach(async () => {
  const raw = rawHouseholdIds.splice(0).map((id) =>
    withSessionContext({ accountId: randomUUID(), householdId: id, profileId: null }, (tx) =>
      tx.execute(sql`DELETE FROM household WHERE id = ${id}::uuid`),
    ),
  );
  await cleanupAll(hh?.cleanup(), ...raw);
  hh = undefined;
});

type PgError = { code?: string; constraint_name?: string };

function pgErrorOf(caught: unknown): PgError {
  const err = caught as PgError & { cause?: PgError };
  return err.code ? err : (err.cause ?? err);
}

// Inserts a household row as app_runtime under its own context. `code` undefined = name no code.
async function rawInsertHousehold(code?: string): Promise<{ id: string; code: string }> {
  const id = randomUUID();
  rawHouseholdIds.push(id);
  const rows = await withSessionContext({ accountId: randomUUID(), householdId: id, profileId: null }, (tx) =>
    code === undefined
      ? tx.execute<{ sign_in_code: string }>(
          sql`INSERT INTO household (id, name, owner_account_id, contact_email)
              VALUES (${id}::uuid, 'WG', ${randomUUID()}::uuid, 'sic-test@example.test')
              RETURNING sign_in_code`,
        )
      : tx.execute<{ sign_in_code: string }>(
          sql`INSERT INTO household (id, name, owner_account_id, contact_email, sign_in_code)
              VALUES (${id}::uuid, 'WG', ${randomUUID()}::uuid, 'sic-test@example.test', ${code})
              RETURNING sign_in_code`,
        ),
  );
  return { id, code: rows[0].sign_in_code };
}

// A well-formed code that a random run will not already hold (the alphabet excludes I/O/0/1).
function freshCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const group = () =>
    Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `${group()}-${group()}-${group()}`;
}

describe("household.sign_in_code (drizzle/0032)", () => {
  it("(a) a registered household and a raw insert naming no code both get a well-formed code", async () => {
    hh = await registerTestHousehold();
    const registered = await withSessionContext(hh.context, (tx) =>
      tx.execute<{ sign_in_code: string }>(sql`SELECT sign_in_code FROM household WHERE id = ${hh!.householdId}::uuid`),
    );
    expect(isWellFormedHouseholdSignInCode(registered[0].sign_in_code)).toBe(true);

    const raw = await rawInsertHousehold();
    expect(isWellFormedHouseholdSignInCode(raw.code)).toBe(true);
    expect(raw.code).not.toBe(registered[0].sign_in_code);
  });

  it("(b) a raw INSERT with a malformed code fails with the CHECK constraint's name", async () => {
    let caught: unknown;
    try {
      await rawInsertHousehold("abc");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const pg = pgErrorOf(caught);
    expect(pg.code).toBe("23514");
    expect(pg.constraint_name).toBe("household_sign_in_code_shape");
  });

  it("(c) a raw INSERT reusing another household's code fails with the unique index's name", async () => {
    const first = await rawInsertHousehold(freshCode());
    let caught: unknown;
    try {
      await rawInsertHousehold(first.code); // well-formed, so only the unique index can refuse it
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const pg = pgErrorOf(caught);
    expect(pg.code).toBe("23505");
    expect(pg.constraint_name).toBe("household_sign_in_code_key");
  });

  it("(d) positive control: a fresh well-formed unused code inserts", async () => {
    const code = freshCode();
    const row = await rawInsertHousehold(code);
    expect(row.code).toBe(code);
  });

  // The TypeScript judge and the LIVE constraint are two definitions of one shape; the unit test
  // only compares the TS regex with the constant. This runs the live constraint's own pattern
  // through Postgres and asserts each verdict equals isWellFormedHouseholdSignInCode.
  it("(e) the live CHECK pattern agrees with isWellFormedHouseholdSignInCode on every candidate", async () => {
    const defs = await withSessionContext(
      { accountId: randomUUID(), householdId: randomUUID(), profileId: null },
      (tx) =>
        tx.execute<{ def: string }>(sql`
          SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conname = 'household_sign_in_code_shape' AND conrelid = 'public.household'::regclass
        `),
    );
    expect(defs).toHaveLength(1);
    const pattern = /~ '([^']+)'/.exec(defs[0].def)?.[1];
    expect(pattern, defs[0].def).toBeDefined();

    // Hand-picked shapes, plus every printable ASCII character swapped into the first position and
    // into a separator position, which pins the alphabet down character by character.
    const candidates = new Set([
      "ABCD-EFGH-JKLM",
      "ABCD-EFGH-JKL",
      "ABCD-EFGH-JKLMN",
      "ABCDE-FGHJK",
      "abcd-efgh-jklm",
      "ABC0-EFGH-JKLM",
      "ABCDEFGHJKLM",
      "3f2b8c1e-5d4a-4f6b-9c7d-1e2f3a4b5c6d",
      "ABCD-EFGH-JKLM\n",
      "",
    ]);
    for (let c = 0x20; c < 0x7f; c++) {
      const ch = String.fromCharCode(c);
      candidates.add(`${ch}BCD-EFGH-JKLM`);
      candidates.add(`ABCD${ch}EFGH-JKLM`);
    }

    for (const candidate of candidates) {
      const rows = await withSessionContext(
        { accountId: randomUUID(), householdId: randomUUID(), profileId: null },
        (tx) => tx.execute<{ ok: boolean }>(sql`SELECT ${candidate}::text ~ ${pattern}::text AS ok`),
      );
      expect(rows[0].ok, JSON.stringify(candidate)).toBe(isWellFormedHouseholdSignInCode(candidate));
    }
  });
});
