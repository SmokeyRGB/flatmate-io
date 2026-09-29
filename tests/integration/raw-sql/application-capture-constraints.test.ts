import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext, type SessionContext } from "@/db/session-context";
import { createAndOpenRound, createRoom } from "@/modules/casting/repository";
import { cleanupAll, createTestModerator, registerTestHousehold, type TestHousehold } from "../../helpers/identity";

// Task 6.9 / 6.9a: the database's own rules for `application`, as `app_runtime` in a RESIDENT
// session (so RLS passes and only the constraints decide), with raw SQL that bypasses the
// repository and its parser entirely (G-C7). Every case asserts the SQLSTATE and the constraint (or
// column) name, never just "an error": a refusal reached by the wrong path looks identical
// otherwise (CLAUDE.md, "Tests that can fail").
//
// Postgres checks an INSERT in this order: BEFORE ROW triggers (the round-pairing trigger), then
// the RLS WITH CHECK, then NOT NULL, then the CHECK constraints. So every row below that is meant to
// hit a NOT NULL or a CHECK carries a real round of its own household, or the trigger's 23503
// would arrive first.
const households: TestHousehold[] = [];

afterEach(async () => {
  await cleanupAll(...households.map((h) => h.cleanup()));
  households.length = 0;
});

interface Fixture {
  hh: TestHousehold;
  resident: SessionContext;
  accountId: string;
  profileId: string;
  roundId: string;
}

async function fixture(): Promise<Fixture> {
  const hh = await registerTestHousehold();
  households.push(hh);
  const moderator = await createTestModerator(hh);
  const room = await createRoom(hh.context, "Room A", { accountId: hh.accountId, profileId: null });
  const round = await createAndOpenRound(moderator.context, "Round", [room.id], {
    accountId: moderator.accountId,
    profileId: moderator.profileId,
  });
  return {
    hh,
    resident: moderator.context,
    accountId: moderator.accountId,
    profileId: moderator.profileId,
    roundId: round.id,
  };
}

type PgError = { code?: string; constraint_name?: string; column_name?: string };

function pgErrorOf(caught: unknown): PgError {
  const err = caught as PgError & { cause?: PgError };
  return err.code ? err : (err.cause ?? err);
}

type Column =
  | "household_id"
  | "round_id"
  | "state"
  | "applicant_name"
  | "source"
  | "collected_from"
  | "created_by_account_id"
  | "created_by_profile_id"
  | "age"
  | "contact_email"
  | "contact_phone"
  | "contact_other"
  | "message_raw"
  | "attributes";

// Builds `INSERT INTO application (...) VALUES (...)` from a column map, so a case can OMIT a
// column (to hit a NOT NULL) or override one (to hit a CHECK). Values are bound parameters, cast
// where the column's type needs it.
function insertStatement(f: Fixture, overrides: Partial<Record<Column, SQL | null>>, omit: Column[] = []) {
  const values: Record<Column, SQL | null> = {
    household_id: sql`${f.hh.householdId}::uuid`,
    round_id: sql`${f.roundId}::uuid`,
    state: sql`'new'::application_state`,
    applicant_name: sql`${"Testbewerbung Roh"}`,
    source: sql`'manual_form'::application_source`,
    collected_from: sql`'data_subject'::application_collected_from`,
    created_by_account_id: sql`${f.accountId}::uuid`,
    created_by_profile_id: sql`${f.profileId}::uuid`,
    age: null,
    contact_email: null,
    contact_phone: null,
    contact_other: null,
    message_raw: null,
    attributes: null,
    ...overrides,
  };
  const columns = (Object.keys(values) as Column[]).filter((c) => values[c] !== null && !omit.includes(c));
  return sql`INSERT INTO application (${sql.join(columns.map((c) => sql.raw(c)), sql`, `)})
             VALUES (${sql.join(columns.map((c) => values[c] as SQL), sql`, `)})
             RETURNING id`;
}

async function expectRefusal(
  f: Fixture,
  statement: SQL,
  expected: { code: string; constraint?: string | RegExp; column?: string },
) {
  let caught: unknown;
  try {
    await withSessionContext(f.resident, (tx) => tx.execute(statement));
  } catch (err) {
    caught = err;
  }
  expect(caught, "the statement should have been refused").toBeInstanceOf(Error);
  const pg = pgErrorOf(caught);
  expect(pg.code).toBe(expected.code);
  if (typeof expected.constraint === "string") expect(pg.constraint_name).toBe(expected.constraint);
  if (expected.constraint instanceof RegExp) expect(pg.constraint_name).toMatch(expected.constraint);
  if (expected.column) expect(pg.column_name).toBe(expected.column);
}

describe("[G-C7 raw SQL] application: NOT NULL columns and CHECK limits (drizzle/0023)", () => {
  it("a valid full row is accepted", async () => {
    const f = await fixture();
    const rows = await withSessionContext(f.resident, (tx) =>
      tx.execute<{ id: string }>(
        insertStatement(f, {
          age: sql`33`,
          contact_email: sql`${"roh@example.test"}`,
          contact_phone: sql`${"+49 30 23125 0100"}`,
          contact_other: sql`${"Portal: roh"}`,
          message_raw: sql`${"Hallo"}`,
          attributes: sql`${JSON.stringify([{ label: "Beruf", value: "Tischler" }])}::jsonb`,
        }),
      ),
    );
    expect(rows).toHaveLength(1);
  });

  it("no collected_from, no source and no round_id are each refused with 23502 (there is no default)", async () => {
    const f = await fixture();
    await expectRefusal(f, insertStatement(f, {}, ["collected_from"]), { code: "23502", column: "collected_from" });
    await expectRefusal(f, insertStatement(f, {}, ["source"]), { code: "23502", column: "source" });
    // The trigger's NULL guard lets the missing round reach NOT NULL, instead of refusing it itself.
    await expectRefusal(f, insertStatement(f, {}, ["round_id"]), { code: "23502", column: "round_id" });
    await expectRefusal(f, insertStatement(f, {}, ["applicant_name"]), { code: "23502", column: "applicant_name" });
  });

  it("a name of only a tab and a newline is refused by application_applicant_name_not_blank", async () => {
    const f = await fixture();
    await expectRefusal(f, insertStatement(f, { applicant_name: sql`${"\t\n"}` }), {
      code: "23514",
      constraint: "application_applicant_name_not_blank",
    });
  });

  it("a whitespace-only name and a 201-code-point name are refused by the name CHECKs", async () => {
    const f = await fixture();
    // btrim of three spaces is empty, so the length CHECK fails; the not_blank CHECK fails too, and
    // which one Postgres reports first is an implementation detail, so either is accepted here.
    await expectRefusal(f, insertStatement(f, { applicant_name: sql`${"   "}` }), {
      code: "23514",
      constraint: /^application_applicant_name_(length|not_blank)$/,
    });
    await expectRefusal(f, insertStatement(f, { applicant_name: sql`${"a".repeat(201)}` }), {
      code: "23514",
      constraint: "application_applicant_name_length",
    });
  });

  it("a 255-character email and a 4001-character message are refused", async () => {
    const f = await fixture();
    await expectRefusal(f, insertStatement(f, { contact_email: sql`${"e".repeat(255)}` }), {
      code: "23514",
      constraint: "application_contact_email_length",
    });
    await expectRefusal(f, insertStatement(f, { message_raw: sql`${"m".repeat(4001)}` }), {
      code: "23514",
      constraint: "application_message_raw_length",
    });
    await expectRefusal(f, insertStatement(f, { contact_phone: sql`${"1".repeat(51)}` }), {
      code: "23514",
      constraint: "application_contact_phone_length",
    });
    await expectRefusal(f, insertStatement(f, { contact_other: sql`${"o".repeat(201)}` }), {
      code: "23514",
      constraint: "application_contact_other_length",
    });
  });

  it("age 151 and age -1 are refused", async () => {
    const f = await fixture();
    await expectRefusal(f, insertStatement(f, { age: sql`151` }), { code: "23514", constraint: "application_age_range" });
    await expectRefusal(f, insertStatement(f, { age: sql`-1` }), { code: "23514", constraint: "application_age_range" });
  });

  it("attributes that are not a list of 1 to 10 entries are refused: an object, an empty list, an 11-element list", async () => {
    const f = await fixture();
    const eleven = JSON.stringify(Array.from({ length: 11 }, (_, i) => ({ label: `l${i}`, value: `v${i}` })));
    await expectRefusal(f, insertStatement(f, { attributes: sql`'{}'::jsonb` }), {
      code: "23514",
      constraint: "application_attributes_shape",
    });
    await expectRefusal(f, insertStatement(f, { attributes: sql`'[]'::jsonb` }), {
      code: "23514",
      constraint: "application_attributes_shape",
    });
    await expectRefusal(f, insertStatement(f, { attributes: sql`${eleven}::jsonb` }), {
      code: "23514",
      constraint: "application_attributes_shape",
    });
  });

  // Deliberate break (ARGUED, not executed — design D11: DATABASE_URL is app_runtime, which cannot
  // drop a constraint or a default, and a drop on the shared dev database would take an ACCESS
  // EXCLUSIVE lock). With 0023's NOT NULLs and CHECKs absent — or with a DEFAULT added to
  // collected_from or source — every statement above that is meant to be refused succeeds, so
  // `caught` is undefined and each `toBeInstanceOf(Error)` fails because no error was thrown. That
  // is exactly what the pre-0023 table allowed, and what "there is no default" (AC-3.7) forbids.
});

describe("[G-C7 raw SQL] application.round_id must name a round of the same household (drizzle/0023, D12)", () => {
  it("a row pointing at another household's round, or at no round at all, is refused by the pairing trigger; an own round is accepted; an UPDATE cannot move a row away", async () => {
    const a = await fixture();
    const b = await fixture();

    const trigger = { code: "23503", constraint: "application_round_same_household" } as const;
    // Another household's real round.
    await expectRefusal(a, insertStatement(a, { round_id: sql`${b.roundId}::uuid` }), trigger);
    // A random uuid: no round at all.
    await expectRefusal(a, insertStatement(a, { round_id: sql`${randomUUID()}::uuid` }), trigger);

    // Its own round: accepted.
    const inserted = await withSessionContext(a.resident, (tx) => tx.execute<{ id: string }>(insertStatement(a, {})));
    expect(inserted).toHaveLength(1);

    // An UPDATE moving an existing row to the other household's round fails the same way.
    await expectRefusal(
      a,
      sql`UPDATE application SET round_id = ${b.roundId}::uuid WHERE id = ${inserted[0].id}::uuid`,
      trigger,
    );
  });

  // Deliberate break (ARGUED, not executed — design D11). With the trigger absent, the first two
  // INSERTs succeed: there is no foreign key, RLS's WITH CHECK looks at household_id only, and the
  // round is never looked at. The SQLSTATE assertion is what proves the refusal comes from the
  // trigger (23503, its own constraint name) and not from RLS (42501) or a NOT NULL (23502).
});
