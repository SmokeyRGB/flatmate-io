import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Wrapped in (select ...): Supabase's RLS-performance guidance — otherwise Postgres re-evaluates
// current_setting() per row instead of once per query (F0 precedent, casting/audit schema.ts).
const HOUSEHOLD_MATCH = sql`household_id = (select current_setting('app.household_id', true)::uuid)`;
// Household/HouseholdSettings are keyed BY household_id (or id, for Household itself) — the
// tenant anchor is the row's own primary key here, not a separate column.
const IS_OWN_HOUSEHOLD = sql`id = (select current_setting('app.household_id', true)::uuid)`;
const IS_OWN_HOUSEHOLD_SETTINGS = sql`household_id = (select current_setting('app.household_id', true)::uuid)`;

// Roles are only NAMES for fixed sets of stored permissions (design D3; human decisions
// 2026-09-28 and 2026-09-29: "The terms 'household' or 'moderator' should simply map to
// permissions; they shouldn't be a separate workaround for permissions / Backdoor for ignoring
// permissions."). A membership stores the union of the sets of the roles it occupies, and every
// permission check reads only that stored list, never a role. domain/identity.md §2.1 calls the
// sets „vorbelegt"; storing them is the literal reading of that word.
//
// role-permissions (F3 change 2b, design D1/D2): ONE declaration holds every permission, one per
// row of the Rechtematrix (03-PRD.md §4.0.1), with the roles that may hold it at all. The role
// sets and every holder CHECK below are derived from it, so moving a permission to another role
// is one edit here plus one migration, never a change to a check. The CHECKs are built from these
// constants (array literals via sql.raw, never bound parameters: drizzle-kit would write `$1`
// into the migration), so a constant and its constraint cannot drift.
//
// "household_admin" and "moderator" are role values; "resident" means `is_resident`, an attribute
// (a moderator who also lives there holds both sets).
type Holder = "household_admin" | "moderator" | "resident";

// `checkFrom: "contract"`: the holder rule is enforced by the database only from the contract
// migration (design D2, "Expand/contract"): old-code tests on other branches still grant these
// three to plain members on the shared dev database. Deleted by the contract migration.
export const PERMISSIONS = {
  // „Abstimmungsverfahren ändern" (household ✅, moderator ⬜); renames manage_settings.
  manage_voting_procedure: { holders: ["household_admin", "moderator"] },
  // „Room anlegen · Verfügbarkeit ändern"
  manage_rooms: { holders: ["household_admin", "moderator"], checkFrom: "contract" },
  // „Beitrittscode erzeugen / löschen"
  manage_join_codes: { holders: ["household_admin", "moderator"] },
  // „ResidentProfile anlegen" (moderator ✅ since 2026-10-01)
  create_resident_profile: { holders: ["household_admin", "moderator"] },
  // „Moderator ernennen / zurückstufen" (moderator ✅ since 2026-10-01)
  appoint_moderator: { holders: ["household_admin", "moderator"] },
  // „Mitglied entfernen / auf moved_out setzen" (+ Reaktivierung)
  manage_members: { holders: ["household_admin", "moderator"] },
  // „Datenauskunft erzeugen"
  export_subject_access: { holders: ["household_admin", "moderator"] },
  // the O-16 box, domain/identity.md §2.1: the household account only
  issue_password_reset_link: { holders: ["household_admin"] },
  // „CastingRound anlegen / schließen / wiedereröffnen"; renames close_round
  manage_rounds: { holders: ["moderator"] },
  // „RoundParticipation hinzufügen / entfernen"
  manage_round_participation: { holders: ["moderator"] },
  // „Application anlegen"
  create_application: { holders: ["moderator"], checkFrom: "contract" },
  // „Application.status ändern (vorwärts)"
  change_application_state: { holders: ["moderator"], checkFrom: "contract" },
  // „Application.status zurücknehmen" (drizzle/0027)
  reverse_application_state: { holders: ["moderator"] },
  // „Vote abgeben / ändern": the resident set's first permission ("resident" = is_resident)
  vote: { holders: ["resident"] },
} as const satisfies Record<string, { holders: readonly Holder[]; checkFrom?: "contract" }>;

export type PermissionName = keyof typeof PERMISSIONS;

// A role set is the ✅ column of the matrix. `satisfies` makes an undeclared name a compile error;
// tests/unit/identity/permission-declarations.test.ts refuses an entry its role may not hold.
export const ROLE_SETS = {
  household: [
    "manage_voting_procedure",
    "manage_rooms",
    "manage_join_codes",
    "create_resident_profile",
    "appoint_moderator",
    "manage_members",
    "export_subject_access",
    "issue_password_reset_link",
  ],
  moderator: [
    "manage_rooms",
    "manage_join_codes",
    "create_resident_profile",
    "appoint_moderator",
    "manage_members",
    "export_subject_access",
    "manage_rounds",
    "manage_round_participation",
    "create_application",
    "change_application_state",
    "reverse_application_state",
  ],
  resident: ["vote"],
} as const satisfies Record<string, readonly PermissionName[]>;

// Replaced names: a rename has one target, a split several. The migration that introduces an entry
// carries each holder over to every target its role may hold; the contract migration strips the
// old name and deletes the entry. No check may name a key (permission-declarations test).
export const REPLACED_PERMISSIONS = {
  close_round: ["manage_rounds"],
  manage_settings: ["manage_voting_procedure"],
} as const satisfies Record<string, readonly PermissionName[]>;
// Retired: kept on stored rows for branches without this change; carried over by 0029, stripped
// by the contract migration. Grants nothing.
export const RETIRED_PERMISSIONS: readonly string[] = Object.keys(REPLACED_PERMISSIONS);

// The household account: the administering membership (role = household_admin, never a profile).
export const HOUSEHOLD_PERMISSIONS = ROLE_SETS.household;
// resident: a live membership with is_resident.
export const RESIDENT_PERMISSIONS = ROLE_SETS.resident;
// moderator: role = moderator.
export const MODERATOR_PERMISSIONS = ROLE_SETS.moderator;

// The permissions whose holders are exactly `roles` and whose holder rule the database already
// enforces (entries with `checkFrom` wait for the contract migration). The only grouping logic.
// Not exported: data-inventory.ts refuses a schema.ts that exports a function; the groups below are
// the exports.
function permissionsHeldOnlyBy(roles: readonly Holder[]): PermissionName[] {
  return (Object.keys(PERMISSIONS) as PermissionName[]).filter((name) => {
    const entry: { holders: readonly Holder[]; checkFrom?: "contract" } = PERMISSIONS[name];
    return (
      entry.checkFrom === undefined &&
      entry.holders.length === roles.length &&
      roles.every((r) => entry.holders.includes(r))
    );
  });
}
// Permissions that only the moderator's set may contain (03-PRD.md §4.0.1 ❌, not ⬜), enforced by
// membership_moderator_only_permissions (drizzle/0027, widened by drizzle/0029).
export const MODERATOR_ONLY_PERMISSIONS = permissionsHeldOnlyBy(["moderator"]);
// Held by the household account only (O-16 box): membership_household_only_permissions.
export const HOUSEHOLD_ONLY_PERMISSIONS = permissionsHeldOnlyBy(["household_admin"]);
// Held by the household account or a moderator, never a plain member:
// membership_administration_permissions.
export const ADMINISTRATION_PERMISSIONS = permissionsHeldOnlyBy(["household_admin", "moderator"]);
// Held only by a resident membership (is_resident): membership_resident_only_permissions.
export const RESIDENT_ONLY_PERMISSIONS = permissionsHeldOnlyBy(["resident"]);

// --- Expand/contract (design D2). Each constant below is deleted by the contract migration, and no
// permission check reads any of them. They are the old sets frozen, and the bounds 0029 enforces
// meanwhile. ---
export const HOUSEHOLD_PERMISSIONS_AT_0024 = ["manage_rooms", "manage_settings"] as const;
export const MODERATOR_PERMISSIONS_AT_0027 = [
  "manage_rooms",
  "close_round",
  "create_application",
  "change_application_state",
  "reverse_application_state",
] as const;
export const MODERATOR_ONLY_PERMISSIONS_AT_0027 = ["reverse_application_state"] as const;
export const RESIDENT_PERMISSIONS_AT_0024: readonly string[] = [];
const intersection = (a: readonly string[], b: readonly string[]) => a.filter((x) => b.includes(x));
// Old ∩ new = manage_rooms.
export const HOUSEHOLD_FLOOR_UNTIL_CONTRACT = intersection(HOUSEHOLD_PERMISSIONS_AT_0024, HOUSEHOLD_PERMISSIONS);
// The eight + the retired manage_settings that old-code registration and every backfilled
// household row still carry.
export const HOUSEHOLD_CEILING_UNTIL_CONTRACT = [
  ...HOUSEHOLD_PERMISSIONS,
  ...intersection(RETIRED_PERMISSIONS, HOUSEHOLD_PERMISSIONS_AT_0024),
];
// Old ∩ new = the four.
export const MODERATOR_FLOOR_UNTIL_CONTRACT = intersection(MODERATOR_PERMISSIONS_AT_0027, MODERATOR_PERMISSIONS);

// Literal SQL for a text[] value: 'ARRAY[...]::text[]', or '{}'::text[] when empty. Values are
// single-quote-escaped. Never a bound parameter (see above).
function permissionArrayLiteral(values: readonly string[]) {
  if (values.length === 0) return sql.raw(`'{}'::text[]`);
  return sql.raw(`ARRAY[${values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ")}]::text[]`);
}

// data-model.md "ResidentProfile" — four states (transitions.ts). `removed` is U-27's hard tier:
// final, no transition leads out of it (drizzle/0017's trigger enforces that in the database too).
export const residentProfileStatusEnum = pgEnum("resident_profile_status", [
  "prepared",
  "active",
  "moved_out",
  "removed",
]);

// data-model.md "Membership" — orthogonal to is_resident (C-1.3); no hierarchy.
export const membershipRoleEnum = pgEnum("membership_role", [
  "household_admin",
  "moderator",
  "member",
]);

// resident-settings design.md Decision 4: every join link now carries a purpose. `join` is every
// link this table has ever held; `password_reset` is the new administration-issued, single-use
// link bound to an ACTIVE profile whose account has no email (identity/password-reset). Default
// 'join' on the column below makes every existing row a joining link without a backfill.
export const joinCodePurposeEnum = pgEnum("join_code_purpose", ["join", "password_reset"]);

// data-model.md "Account". `household_id` is a deliberate denormalization not in
// docs/domain/identity.md's field list — added under the same documented pattern
// docs/domain/casting.md already uses for Application.household_id ("redundant zur Runde, aber
// Anker der RLS-Policy (ADR-004)"), required by G-C5 ("jede personenbezogene Tabelle führt
// household_id NOT NULL") and satisfiable without a chicken-and-egg problem because the household
// is always known at account-creation time in both the registration flow (created together) and
// the join flow (F2, the code identifies the household up front).
export const account = pgTable(
  "account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(),
    // Required + unique for the household-admin account (FR-1.1); nullable for a resident
    // account, which starts out on a derived, non-deliverable address (research.md §2) and may
    // later gain a real one — added at join or in the resident's own settings
    // (identity/account-settings) — at which point it REPLACES the derived address at the
    // provider (resident-settings design.md Decision 1/2) and becomes usable for email sign-in
    // (identity/sign-in). Uniqueness is enforced at the Supabase Auth layer (the actual sign-in
    // identifier), not duplicated here as a DB constraint — this column is a local cache of what
    // Auth already guarantees unique.
    email: text("email"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    // Copilot review round 5 (PR #23), FIX 1: a credentials generation stamped in the DATABASE
    // clock, not a JS Date — signIn compares against this using a database-clock read taken before
    // its own signInWithPassword call, so a password change/reset that commits between that read
    // and signIn's later membership lock is still caught (see auth.ts's signIn and
    // repository.ts's readDatabaseClock). Nullable, no default: an account that has never changed
    // its password (registration/join's initial one) has no generation to compare against yet, and
    // signIn's check (`password_changed_at IS NOT NULL AND password_changed_at >= <clock read>`)
    // is false for every such account unconditionally.
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
    locale: text("locale").notNull().default("de"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("account_household_id_idx").on(t.householdId),
    pgPolicy("account_household_isolation", {
      as: "permissive",
      for: "all",
      using: HOUSEHOLD_MATCH,
      withCheck: HOUSEHOLD_MATCH,
    }),
  ],
);

// data-model.md "Session". `household_id` denormalized for the same reason as Account's.
export const session = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    accountId: uuid("account_id").notNull(),
    // Set once at sign-in, never written again (ADR-013/FR-1.6). G-D14(b) requires rejection even
    // via raw SQL, so this is enforced by a BEFORE UPDATE trigger
    // (drizzle/0006_session_acting_profile_id_immutable.sql), not application discipline alone —
    // the same reasoning ADR-004 already applies to authorization generally: a rule that only
    // holds when the application code is right is not the rule G-C7/G-D14 ask for.
    actingProfileId: uuid("acting_profile_id"),
    rememberMe: boolean("remember_me").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("session_household_id_idx").on(t.householdId),
    index("session_account_id_idx").on(t.accountId),
    pgPolicy("session_household_isolation", {
      as: "permissive",
      for: "all",
      using: HOUSEHOLD_MATCH,
      withCheck: HOUSEHOLD_MATCH,
    }),
  ],
);

// data-model.md "Household" — the tenant root. RLS keys off `id` itself, not `household_id`.
// join-code-protections (O-18): join_code/join_code_rotated_at moved off this table to the new
// JoinCodeIssuance entity below — a household issues several links now, not one rotating code
// (domain/identity.md §2.1).
export const household = pgTable(
  "household",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // "keine Sicherheitsgrenze, nur Zuordnung" (C-1.4) — the account that registered.
    ownerAccountId: uuid("owner_account_id").notNull(),
    contactEmail: text("contact_email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  () => [
    pgPolicy("household_is_own_household", {
      as: "permissive",
      for: "all",
      using: IS_OWN_HOUSEHOLD,
      withCheck: IS_OWN_HOUSEHOLD,
    }),
  ],
);

// data-model.md "HouseholdSettings" — 1:1 with Household; household_id is this table's own PK.
export const householdSettings = pgTable(
  "household_settings",
  {
    householdId: uuid("household_id").primaryKey(),
    // The four voting-procedure fields (FR-1.21). A change reaches only rounds opened afterwards: an open round keeps its settings_snapshot (FR-1.15).
    scaleWeights: jsonb("scale_weights")
      .notNull()
      .default({ no: 0, rather_not: 1, good: 3, definitely: 5 }),
    favoriteBudgetFactor: numeric("favorite_budget_factor").notNull().default("1.5"),
    hideResultsUntilVoted: boolean("hide_results_until_voted").notNull().default(true),
    quorumShare: numeric("quorum_share").notNull().default("0.5"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedByAccountId: uuid("updated_by_account_id").notNull(),
  },
  () => [
    pgPolicy("household_settings_is_own_household", {
      as: "permissive",
      for: "all",
      using: IS_OWN_HOUSEHOLD_SETTINGS,
      withCheck: IS_OWN_HOUSEHOLD_SETTINGS,
    }),
  ],
);

// data-model.md "ResidentProfile".
export const residentProfile = pgTable(
  "resident_profile",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(),
    displayName: text("display_name").notNull(),
    status: residentProfileStatusEnum("status").notNull().default("prepared"),
    movedInOn: date("moved_in_on"),
    movedOutOn: date("moved_out_on"),
    roomId: uuid("room_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("resident_profile_household_id_idx").on(t.householdId),
    // FR-1.4 (amended 2026-09-22): unique among profiles whose status is not in
    // NAME_RELEASING_STATUSES (transitions.ts) within a household — a partial unique index, not a
    // plain unique constraint, so a released name is reusable per AC-1.4. This WHERE text must list
    // exactly NAME_RELEASING_STATUSES's members (tests/unit/identity/name-releasing-statuses.test.ts);
    // SQL can't import the TS constant, so the two are kept honest by that test, not by this comment.
    uniqueIndex("resident_profile_display_name_active_idx")
      .on(t.householdId, t.displayName)
      .where(sql`status NOT IN ('moved_out', 'removed')`),
    pgPolicy("resident_profile_household_isolation", {
      as: "permissive",
      for: "all",
      using: HOUSEHOLD_MATCH,
      withCheck: HOUSEHOLD_MATCH,
    }),
  ],
);

// data-model.md "Membership" — Account × Household, orthogonal is_resident/role (C-1.3).
export const membership = pgTable(
  "membership",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(),
    accountId: uuid("account_id").notNull(),
    // Set = acts as a resident profile; null = household account (ADR-013 ties this permanently
    // to the account type).
    residentProfileId: uuid("resident_profile_id"),
    isResident: boolean("is_resident").notNull(),
    role: membershipRoleEnum("role").notNull(),
    // F1-relevant subset of FR-1.8's permission list — export/retention permissions are later
    // features' concern.
    permissions: text("permissions")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // join-code-protections: renamed from joined_via_code (text, declared since F1, never
    // written) and retyped to uuid — a reference to the JoinCodeIssuance row, not a copy of the
    // code itself (G-A5: storing the code on this row would let it leak from a second place).
    joinedViaIssuanceId: uuid("joined_via_issuance_id"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("membership_household_id_idx").on(t.householdId),
    // drizzle/0021 (Copilot review round 2, PR #23): one membership per profile and one per
    // account are invariants the reset path and signIn both rely on — the reset path picks
    // `[membershipRow]` by resident_profile_id (issuePasswordResetLink/redeemPasswordReset) and
    // signIn picks it by account_id, so a second row for either would make that pick ambiguous.
    // These UNIQUE indexes replace the plain `membership_account_id_idx` (drizzle-kit generates a
    // unique index for a unique column constraint, so the old non-unique one is redundant — a
    // unique index is usable for every plain equality lookup the old one served). The profile
    // index is partial (`WHERE resident_profile_id IS NOT NULL`) because a household account's
    // membership row always has a null one (ADR-013) and there may legitimately be many such rows
    // across different households — nothing about "one membership per profile" applies to null.
    uniqueIndex("membership_resident_profile_id_unique")
      .on(t.residentProfileId)
      .where(sql`${t.residentProfileId} IS NOT NULL`),
    uniqueIndex("membership_account_id_unique").on(t.accountId),
    // drizzle/0020 (review fix, Copilot PR #23): there are no foreign keys in this schema, so
    // nothing previously stopped a membership row from carrying `is_resident = false` alongside a
    // set `resident_profile_id`, or `is_resident = true` with a null one — a pairing that
    // resolve_join_code/claim_join_code's (drizzle/0019) resident-only joins, and
    // issuePasswordResetLink's own SQL predicate (repository.ts), both trust without re-checking.
    // This CHECK makes that pairing a database invariant instead of an assumption held only by the
    // three writers (registerHousehold, claimResidentProfile, joinHousehold in auth.ts).
    check(
      "membership_resident_pairing",
      sql`${t.isResident} = (${t.residentProfileId} IS NOT NULL)`,
    ),
    // drizzle/0024 (ADR-013: the account type is fixed; domain/identity.md §2.1). The household
    // account is the WG's administration, never a resident, so the household and the resident
    // role are never occupied by the same membership and the household set never mixes with the
    // others. Load-bearing now that the household account holds a stored set.
    check(
      "membership_admin_has_no_profile",
      sql`role <> 'household_admin' OR resident_profile_id IS NULL`,
    ),
    // drizzle/0024: a membership that disagrees with its roles would silently gain or lose rights,
    // so it is a refused write, for every writer including raw SQL. Built from the constants
    // above; a later permission needs the constant, a backfill and the CHECK in one change.
    // role-permissions / drizzle/0029 (expand, design D2): the FLOOR is the part of the new set
    // that old-code branches still write too (old ∩ new); the contract migration raises it to
    // MODERATOR_PERMISSIONS. A row short of its new values is accepted and simply denied the
    // actions they gate.
    check(
      "membership_moderator_holds_role_permissions",
      sql`revoked_at IS NOT NULL OR role <> 'moderator' OR permissions @> ${permissionArrayLiteral(MODERATOR_FLOOR_UNTIL_CONTRACT)}`,
    ),
    // drizzle/0027 (design D8), widened by drizzle/0029: a moderator-only permission (matrix ❌,
    // not ⬜) cannot be held by any other membership, so raw SQL as app_runtime cannot grant it
    // either. The contract migration adds create_application and change_application_state
    // (their `checkFrom`).
    check(
      "membership_moderator_only_permissions",
      sql`role = 'moderator' OR NOT (permissions && ${permissionArrayLiteral(MODERATOR_ONLY_PERMISSIONS)})`,
    ),
    // drizzle/0029: household-only permissions (the O-16 box) are held by the administering
    // membership alone.
    check(
      "membership_household_only_permissions",
      sql`role = 'household_admin' OR NOT (permissions && ${permissionArrayLiteral(HOUSEHOLD_ONLY_PERMISSIONS)})`,
    ),
    // drizzle/0029: the household-or-moderator permissions are never held by a plain member
    // (matrix ❌ for residents, not ⬜; human decision 2026-10-01). The contract migration adds
    // manage_rooms (its `checkFrom`).
    check(
      "membership_administration_permissions",
      sql`role IN ('household_admin', 'moderator') OR NOT (permissions && ${permissionArrayLiteral(ADMINISTRATION_PERMISSIONS)})`,
    ),
    // drizzle/0029: a resident-only permission needs the resident attribute ("resident" holder).
    check(
      "membership_resident_only_permissions",
      sql`is_resident OR NOT (permissions && ${permissionArrayLiteral(RESIDENT_ONLY_PERMISSIONS)})`,
    ),
    // The household set has a FLOOR and a CEILING until the contract migration (drizzle/0029,
    // design D2): the floor is old ∩ new (manage_rooms), the ceiling the eight plus the retired
    // manage_settings that old-code registration still writes. The contract migration makes it
    // exact again. The matrix gives the household account no individual grant (no ⬜).
    check(
      "membership_household_admin_holds_role_permissions",
      sql`revoked_at IS NOT NULL OR role <> 'household_admin' OR (permissions @> ${permissionArrayLiteral(HOUSEHOLD_FLOOR_UNTIL_CONTRACT)} AND permissions <@ ${permissionArrayLiteral(HOUSEHOLD_CEILING_UNTIL_CONTRACT)})`,
    ),
    // Unchanged by 0029: old-code claim/join stores the empty resident set, so the floor stays
    // empty until the contract migration requires RESIDENT_PERMISSIONS (`vote`).
    check(
      "membership_resident_holds_role_permissions",
      sql`revoked_at IS NOT NULL OR NOT is_resident OR permissions @> ${permissionArrayLiteral(RESIDENT_PERMISSIONS_AT_0024)}`,
    ),
    // A moved-out or removed person keeps nothing (D3): no permission, and not the moderator role.
    check(
      "membership_revoked_holds_nothing",
      sql`revoked_at IS NULL OR (cardinality(permissions) = 0 AND role <> 'moderator')`,
    ),
    pgPolicy("membership_household_isolation", {
      as: "permissive",
      for: "all",
      using: HOUSEHOLD_MATCH,
      withCheck: HOUSEHOLD_MATCH,
    }),
  ],
);

// domain/identity.md §2.1 "JoinCodeIssuance" — a single issued invite link (O-18). Replaces the
// five join_code* columns that used to live on Household: a household issues several links at
// once, each with its own expiry, cap and count. No `status` column by design (§2.1: "die drei
// Gründe sind aus den Daten ablesbar, und ein zusätzliches Feld könnte ihnen widersprechen") — a
// link is live iff deleted_at IS NULL, expires_at > now(), and uses < max_uses.
export const joinCodeIssuance = pgTable(
  "join_code_issuance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(),
    // Unique ACROSS ALL households, not per-household: resolving a presented code is the only
    // input a stranger supplies (no household_id known yet), so the code alone must be enough to
    // find at most one row (§2.1, FR-2.9).
    code: text("code").notNull(),
    // Both expiresAt and maxUses are NOT NULL, always — proposal.md Assumption 2 / spec.md "There
    // SHALL be no such thing as an unlimited link": the field admits no absent value, on any path
    // including the founding link at registration.
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // Default 1 (O-15, updated 2026-09-16). 0 is a valid, deliberate value meaning "closed"
    // (EC-2.8) — never treated as "unlimited".
    maxUses: integer("max_uses").notNull().default(1),
    // Never reset — a new link is a new row, not a rewound counter (§2.1).
    uses: integer("uses").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // 🟠 not ⚙️ (data-inventory.yml) — names the person who issued the link, unlike every other
    // column on this table.
    createdByAccountId: uuid("created_by_account_id").notNull(),
    // Set by "Löschen" on O16. Immediately invalid, stays visible in history — "entwerten" vs.
    // "vergessen" (§2.1).
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // join-by-link design.md Decision 13 (human decision, 2026-09-22): nullable — splits a link
    // into two kinds without adding a second entity. `null` is a NEUTRAL link (redeeming it
    // CREATES a new resident profile, the behaviour this table always had). Set, it BINDS the
    // link to one already-`prepared` resident profile of the SAME household (enforced by
    // issueJoinCodeTx in repository.ts, not by a DB constraint — there are no foreign keys in
    // this schema); redeeming it CLAIMS that profile instead of creating a second one. Naming a
    // profile changes nothing else about the link — its expiry, its cap, its count, its deletion
    // and its refusal all behave identically (spec.md identity/join-code "A link may name the
    // person it was issued for").
    residentProfileId: uuid("resident_profile_id"),
    // resident-settings design.md Decision 4: every link now carries a purpose. Default 'join'
    // makes every row that predates this column a joining link, unconditionally — no backfill
    // needed. A `password_reset` link is minted only by issuePasswordResetLink (repository.ts),
    // never by issueJoinCode's public, moderator-reachable options type.
    purpose: joinCodePurposeEnum("purpose").notNull().default("join"),
  },
  (t) => [
    index("join_code_issuance_household_id_idx").on(t.householdId),
    uniqueIndex("join_code_issuance_code_idx").on(t.code),
    // A password-reset link always names a profile — there is no such thing as a neutral reset
    // link, unlike a joining link, which may or may not be bound (design.md Decision 4). Holds in
    // raw SQL too: nothing but this constraint stops a corrupt or hand-written row from minting a
    // reset link naming nobody, which `resolve_join_code`/`claim_join_code` would then have to
    // refuse defensively instead of by construction.
    check(
      "join_code_issuance_reset_names_profile",
      sql`${t.purpose} = 'join' OR ${t.residentProfileId} IS NOT NULL`,
    ),
    pgPolicy("join_code_issuance_household_isolation", {
      as: "permissive",
      for: "all",
      using: HOUSEHOLD_MATCH,
      withCheck: HOUSEHOLD_MATCH,
    }),
  ],
);

// design.md Decision 3 (FR-2.28): the join route's attempt limit. Deliberately carries NO
// household_id and therefore NO pgPolicy — this is the first table in this codebase with no
// tenant to key an RLS policy on. EC-2.14 requires the limit to be on the ROUTE, not on any one
// household's links ("a guess is tested against every live link at once"); a per-household limit
// would divide by exactly the number an attacker's guess multiplies by. The table gets
// `ENABLE ROW LEVEL SECURITY` with ZERO policies instead (drizzle/0014_join_attempt.sql) — that
// denies every row to `app_runtime` directly — and exactly one `SECURITY DEFINER` function
// (`record_join_attempt`) as its only door. This is intentional, not an omission
// scripts/lint/rls-coverage.ts should flag: that lint only fires when a table declares
// household_id without a pgPolicy in the same file, and this table declares neither.
//
// task 10.10: for exactly the same reason, this table CANNOT go in
// tests/helpers/identity.ts's cleanup() CTE — that CTE deletes by household_id, which this table
// has none of, AND app_runtime (the role every test runs as) has no DELETE access to it anyway
// (RLS enabled, zero policies — see above). Tests that call recordJoinAttempt own their own
// teardown, via the Supabase service-role client (bypasses RLS as Postgres role `service_role`),
// exactly like Auth-user cleanup elsewhere in this suite — see
// tests/integration/policy/join-rate-limit.test.ts. If a future table also has no household_id,
// read this comment before assuming its exclusion from cleanup() is a bug to fix.
export const joinAttempt = pgTable(
  "join_attempt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // HMAC of the client's IP (auth.ts's joinAttemptSourceHash) — never the IP itself. 🟠 in
    // data-inventory.yml: a pseudonymised network identifier about a visitor, not a member.
    sourceHash: text("source_hash").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("join_attempt_source_hash_attempted_at_idx").on(t.sourceHash, t.attemptedAt),
    // Separate attempted_at-only index for record_join_attempt's retention prune: the
    // composite index leads on source_hash and so cannot serve `attempted_at < ...`, and the
    // prune runs on every call (drizzle/0014).
    index("join_attempt_attempted_at_idx").on(t.attemptedAt),
  ],
);
