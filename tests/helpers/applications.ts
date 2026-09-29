import { sql } from "drizzle-orm";
import type { withSessionContext } from "@/db/session-context";
import { application, castingRound } from "@/modules/casting/schema";
import { uuid } from "./uuid";

// Design D8 (application-capture): after drizzle/0023 an `application` row needs a name, both
// axes of S-38 and a real round of its own household (the pairing trigger,
// application_round_same_household). Every test that inserts a row directly goes through this
// file, so the next NOT NULL column is one edit, not seven. G-B1: synthetic data only.

type Tx = Parameters<Parameters<typeof withSessionContext>[1]>[0];

type CastingRoundStatus = typeof castingRound.$inferInsert.status;

// Inserts a casting_round straight into the table, for tests that need a round without going
// through openRound's preconditions (an eligible resident, a room, ...). The transaction's session
// context must be the round's own household. Returns the round id.
export async function insertTestRound(
  tx: Tx,
  householdId: string,
  status: CastingRoundStatus = "open",
): Promise<string> {
  const [row] = await tx
    .insert(castingRound)
    .values({
      householdId,
      title: `Testrunde ${uuid().slice(0, 8)}`,
      status,
      openedAt: status === "draft" ? null : new Date(),
    })
    .returning({ id: castingRound.id });
  return row.id;
}

export interface SyntheticApplicationBase {
  householdId: string;
  roundId: string;
  createdByAccountId: string;
  createdByProfileId: string;
}

// A full insert value for `application`: the four ids are required (they are what each test
// scopes on), everything else is a synthetic default and can be overridden. Contact data is null
// unless a test asks for it; use syntheticContacts() then, so an address is always @example.test.
export function syntheticApplication(
  base: SyntheticApplicationBase,
  overrides: Partial<typeof application.$inferInsert> = {},
): typeof application.$inferInsert {
  return {
    state: "new",
    applicantName: `Testbewerbung ${uuid().slice(0, 8)}`,
    age: null,
    contactEmail: null,
    contactPhone: null,
    contactOther: null,
    messageRaw: null,
    attributes: null,
    source: "manual_form",
    collectedFrom: "data_subject",
    ...base,
    ...overrides,
  };
}

// G-B1: fixed synthetic contact data (reserved example TLD, the 030 23125 fictional number range).
export function syntheticContacts() {
  return {
    contactEmail: `bewerbung-${uuid().slice(0, 8)}@example.test`,
    contactPhone: "+49 30 23125 0100",
  };
}

// For raw-SQL tests, which stay raw SQL rather than being rewritten through Drizzle: the column
// list and a values fragment for every NOT NULL column. `state` and the two axes are explicit.
export const APPLICATION_INSERT_COLUMNS_SQL = sql.raw(
  "household_id, round_id, state, applicant_name, source, collected_from, created_by_account_id, created_by_profile_id",
);

export function applicationInsertValuesSql(v: {
  householdId: string;
  roundId: string;
  state?: string;
  applicantName?: string;
  accountId: string;
  profileId: string;
}) {
  return sql`(${v.householdId}::uuid, ${v.roundId}::uuid, ${v.state ?? "new"}::application_state,
    ${v.applicantName ?? `Testbewerbung ${uuid().slice(0, 8)}`}, 'manual_form'::application_source,
    'data_subject'::application_collected_from, ${v.accountId}::uuid, ${v.profileId}::uuid)`;
}
