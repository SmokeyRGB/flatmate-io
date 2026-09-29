## Why

F3 is the first feature where applicant data enters the system, and the `application` table
cannot hold any yet: it has no name, no contact, no message and no collection source, and nothing
can create a row. `docs/backlog/requirements/F3-requirements.md` §1 (V1.1) scopes it as *"A
moderator types an application into a form, records where the data came from, and sees all
applications of the round grouped by state."* This change is the first half of that sentence: the
record, the capture form (screen O3), and the Art. 14 duty at the moment of capture. It is change 2
of the F3 plan and runs alone, because its migration adds NOT NULL columns under every other
branch's tests on the shared dev database.

## What Changes

- **Schema (migration `0023`)**: the applicant columns of `domain/casting.md` §2.2
  (`applicant_name`, `age`, `contact_email`, `contact_phone`, `contact_other`, `message_raw`,
  `attributes`) and the two axes of S-38 (`source`, `collected_from`, two new enum types), with **no
  default** on either axis (C-3.2, AC-3.7). `round_id` becomes NOT NULL (A-3.4, C-3.11). The length
  limits of C-3.14 become CHECK constraints. A trigger (not `SECURITY DEFINER`) refuses any row
  whose `round_id` names no round of the row's own household, for every writer. Retention and
  change 6's V-2 policy both read through that pairing. **BREAKING** for every test and script that inserts an
  `application` row directly. All of them move to one synthetic fixture helper (G-B1).
- **Schema (migration `0024`)**, membership role integrity:
  - A CHECK that a `household_admin` membership never carries a resident profile. The
    administering account holds every permission implicitly, so this has to be enforced now.
  - A CHECK that a `moderator` membership holds the moderator's permissions, with a backfill of
    the existing moderators before it.
- **Permissions (human decision 2026-09-28)**: a moderator is **defined by holding the
  permissions**, not by a role shortcut in the check. Appointing a moderator stores
  `manage_rooms`, `close_round`, `create_application` and `change_application_state` on the
  membership, and demotion removes them. The household account works the same way: registration stores its set (`manage_rooms`, `manage_settings`), and it has no implicit "every permission" any more. **BREAKING:** the household account can no longer create, open or close a round, as `03-PRD.md` §4.0.1 (S-50/U-20) always said. Until now it could, through the old shortcut, and the demo seed and ~17 test files relied on that. Every permission check reads only the stored list (FR-3.1,
  FR-3.24; `domain/identity.md` §2.1 „vorbelegt"). Actions no resident may ever do (delete,
  reverse) stay role checks.
- **Repository**: `captureApplication` (FR-3.1–3.10, FR-3.6, FR-3.7). It refuses a profile-less
  session first, checks `create_application` inside its own transaction against a share-locked
  membership row, requires the round to be `open` under a share lock (EC-3.9), sets `state = 'new'`
  and `source = 'manual_form'` itself, stores `collected_from` exactly as submitted, and writes
  `application.created`. `getOrganisationApplication` is the guarded read behind the post-save page.
- **UI**: O3 at `/rounds/[id]/applications/new`, with its four states (G-N6). When the
  third-party checkbox is ticked, the duty, both deadlines, the one-month date and the editable
  Art. 14 text (Compliance §4.5, *Variante Dritterhebung*) appear **before saving**, with a copy
  button and no send action (FR-3.11–3.13, AC-3.8, AC-3.10). The round page gains the „Bewerbung
  erfassen" entry for permission holders. After saving: `data_subject` returns to the round page
  with a toast, and `third_party` opens the application detail with the text (O3, R-3.2). That
  page is the first cut of O5's shell, which change 3 extends.
- **Data inventory**: every new column is declared in `data-inventory.yml` (C-3.13; change 1's gate
  enforces it).
- **Demo seed**: `seed:demo` gains synthetic applications, so O4 (change 3) and F4 can be walked
  by hand.

**Not in this change** (F3 plan, changes 3–6): the pipeline list O4, editing, the optional Art. 13
notice on every application, the `transitionApplication` guard, deletion and the `deleted_at`
drop, O1, and V-2.

## Capabilities

### New Capabilities
- `casting/application-capture`: capturing an application against an open round. Covers who may
  capture, the one required field, the stored shape including both axes, the length limits, the
  Art. 14 duty and text at capture, the audit event, the post-save landing and the guarded detail
  read behind it.

### Modified Capabilities
- `identity/permissions`: "household", "resident" and "moderator" are only names for fixed
  permission sets. A membership stores the union of its roles' sets: occupying a role (registration,
  joining, appointment) grants its set, and losing it (demotion, moving out, removal) revokes it. No
  check reads a role. Appointment grants the moderator's permissions and demotion removes them. Checks read
  only the stored list, and the database refuses a moderator without them. Actions no resident may
  ever do stay role checks. A `household_admin` membership may never act as a resident profile.
  Also a docs correction: `domain/identity.md` §2.1's abandonment condition counts defaults
  ("a fifth…"), and it now keys on the matrix instead.

## Impact

- **Guardrails touched.**
  - **G-C** (authorization): the new mutator and the new read. Tested through the repository,
    the server action and raw SQL (G-C7).
  - **G-D15**: the new functions refuse a profile-less session first (obligation (a)). The
    RESTRICTIVE policy from `drizzle/0018` stays the second line.
  - **G-D3/G-D7/G-D8/G-D15** guarded test files change their **setup only**, because their direct
    inserts break on the new NOT NULL columns. No assertion changes, and each diff is shown to the
    human (G-G1).
  - **G-D7**: the new event's payload carries enum values only.
  - **G-F1/G-F3**: inventory entries, and AC-3.12's render test over O3's inputs.
  - **G-L/P-5**: not touched, since no AI is involved.
  - **G-G3**: no check is disabled.
- **Code**:
  - `src/modules/casting/{schema,repository}.ts`, plus a new pure helper for the notice
    (categories, one-month date).
  - `src/modules/identity/{schema,repository}.ts`: `MODERATOR_PERMISSIONS`, both CHECKs, `setMemberRole`, and a
    transaction-scoped permission check.
  - `src/modules/audit/repository.ts`: the allowlist.
  - `src/app/(org)/rounds/[id]/**`, `src/ui/strings/de.ts`.
  - `drizzle/0023_*`, `drizzle/0024_*` and their snapshots, `data-inventory.yml`,
    `scripts/seed-demo-household.ts`.
- **Tests**: a new `tests/helpers/applications.ts`, 7 existing files migrated to it, and new
  policy, raw-sql and unit tests. The authorization matrix classifies `captureApplication`, and
  `getOrganisationApplication` counts as a read.
- **Dev database**: `0023` is applied to `flatmate-io-dev` only once the code that writes the new
  columns is ready. Until this merges, `main`'s own tests fail against dev, so merge promptly.
  0 `application` rows on dev (checked 2026-09-28), so NOT NULL applies cleanly. No `SECURITY
  DEFINER` and no `DROP COLUMN`, so there is no expected harness hand-off.

## Assumptions

- **A1.** The Art. 14 text's `[Link]` stays a literal placeholder (human decision Q-4). Beside it,
  the UI says plainly that there is no privacy page to link to yet (Compliance §4.5: *„Die App
  weist darauf hin, statt einen toten Link zu erzeugen."*).
- **A2.** "One month after capture" is a calendar month, clamped to the month's last day (31 Jan →
  28/29 Feb), and shown as a Europe/Berlin date. Before saving it counts from "now". After saving
  it counts from `created_at`.
- **A3.** Email, phone and other contact are length-checked only, with no format validation beyond
  the browser's `type="email"` hint. The spec names no format rule, and a moderator may record
  what they were given.
- **A4.** Empty optional fields are stored as `NULL`, never `''`. An empty attribute list is `NULL`,
  never `[]`, so each absence has one representation.
- **A5.** Lengths count Unicode code points (Postgres `char_length`), in the browser counter as
  well as on the server. A UTF-16 `maxLength` would disagree with the database on emoji.
- **A6.** The post-save detail page is visible to anyone who holds `create_application` or
  `change_application_state` (Q-11: F3's own reads are permission-gated, stricter than V-2).
  Change 3 reuses the rule for the pipeline.
