# tooling/data-inventory Specification

## Purpose
The build gate that keeps `data-inventory.yml` (ADR-010, S-37) a complete and current declaration of
every database column: its privacy category, and for personal data its purpose, legal basis and
retention. It also refuses structured fields for Art.-9 categories (G-F3).

## Requirements

### Requirement: Every declared column is in the inventory

`npm run verify` SHALL fail when any column of any table declared in a module's `schema.ts` has no
entry in `data-inventory.yml`. It SHALL fail whether or not the column holds personal data: a
column that holds none is declared ⚙️, and there is no silent default. Source: FR-0.6, AC-0.4,
`docs/GUARDRAILS.md` G-F1 (*„Eine dritte Möglichkeit gibt es nicht — es gibt keinen stillen
Default."*).

#### Scenario: A new column without an entry
- **WHEN** a column is added to a table in a `schema.ts` and `data-inventory.yml` has no entry
  for it
- **THEN** `npm run verify` fails, and the message names the table and the column

#### Scenario: A new table without an entry
- **WHEN** a table is added to a `schema.ts` and `data-inventory.yml` has no entry for it
- **THEN** `npm run verify` fails, and the message names the table

#### Scenario: A table the gate cannot see
- **WHEN** a table is defined outside a module's `schema.ts` (in `src/` or `scripts/`, by any
  Drizzle table builder, including an aliased import), or inside a `schema.ts` without being
  exported
- **THEN** `npm run verify` fails, and the message names the file

### Requirement: The inventory declares nothing that does not exist

`npm run verify` SHALL fail when `data-inventory.yml` declares a table or a column that no
`schema.ts` declares, so that a dropped column cannot stay in the Art.-30 record. Source: ADR-010
(*„Zwei Wahrheiten (Schema und YAML) müssen synchron bleiben"*).

#### Scenario: A column dropped from the schema but kept in the inventory
- **WHEN** a column is removed from a `schema.ts` and its entry stays in `data-inventory.yml`
- **THEN** `npm run verify` fails, and the message names the table and the column as stale

### Requirement: Each entry carries a valid category and, for personal data, its full declaration

Each column entry SHALL carry exactly one category from 🔴, 🟠, ⚫ and ⚙️ (FR-0.8). An entry
categorised 🔴, 🟠 or ⚫ SHALL carry a non-empty `purpose`, `legal_basis` and `retention` (FR-0.5).
A ⚙️ entry MAY carry any of these three. An entry SHALL carry no key outside `category`, `purpose`,
`legal_basis` and `retention`. Each table SHALL declare the
bounded context whose `schema.ts` defines it (G-F1: *„Zweck, Rechtsgrundlage, Frist, Kategorie und
Kontext"*). `npm run verify` SHALL fail on any violation.

#### Scenario: Personal data without a legal basis
- **WHEN** an entry is categorised 🔴 and has no `legal_basis`
- **THEN** `npm run verify` fails, and the message names the table, the column and the missing key

#### Scenario: An unknown category
- **WHEN** an entry has a category other than the four
- **THEN** `npm run verify` fails, and the message lists the four allowed values

#### Scenario: A misspelt key
- **WHEN** an entry carries a key other than `category`, `purpose`, `legal_basis` or `retention`
- **THEN** `npm run verify` fails, and the message names the key

#### Scenario: The wrong bounded context
- **WHEN** a table's declared context differs from the module directory of the `schema.ts` that
  defines it
- **THEN** `npm run verify` fails, and the message names both the declared and the actual context

#### Scenario: A non-personal column needs no legal basis
- **WHEN** an entry is categorised ⚙️ and carries only `category`
- **THEN** the gate accepts it

#### Scenario: A non-personal column may explain itself
- **WHEN** an entry is categorised ⚙️ and also carries `purpose`, `legal_basis` or `retention`
- **THEN** the gate accepts it

### Requirement: No table or column is named for an Art.-9 category

`npm run verify` SHALL fail when a table or column name contains a term from the Art.-9 blocklist.
The list covers `docs/GUARDRAILS.md` G-F3's terms (*„`nationality`, `religion`, `health`,
`disability`, `ethnicity`, `marital_status`, `sexual_orientation`, `political`, `union`"*), their
English derivatives and plurals, and their German equivalents. A name is split into words at
underscores and at camelCase boundaries. A term matches when a word **starts with** it (so plurals
and German compounds such as `gesundheitsdaten` match); each multi-word term has a single-word stem
of its own. A term appearing inside a word but not at its start does not match. The
check runs over every name the gate knows: `schema.ts` tables and columns, inventory keys, and the
migrated database's tables and columns. There is no exemption marker: an exemption would be a human
decision under G-G3. The blocklist SHALL be exported for reuse by UI-level checks. Source: G-F3,
FR-3.5, AC-3.12 (schema half).

#### Scenario: A blocklisted column
- **WHEN** a `schema.ts` declares a column named `health_notes`, `religion` or `trade_union`
- **THEN** `npm run verify` fails, and the message names the column and the term it matched

#### Scenario: A German column name or compound
- **WHEN** a `schema.ts` declares a column named `konfession`, `gesundheit_info` or
  `gesundheitsdaten`
- **THEN** `npm run verify` fails

#### Scenario: A camelCase or plural name
- **WHEN** a column's SQL name is `healthNotes` or `religions`
- **THEN** `npm run verify` fails

#### Scenario: A term inside a word, not at its start
- **WHEN** a name contains a blocklisted term only in the middle of a word (for example `reunion_at`)
- **THEN** the blocklist does not match it

### Requirement: The migrated database declares nothing the inventory does not

The test suite SHALL fail when the database it runs against has a table or a column in the
`public` schema that `data-inventory.yml` does not declare. This covers a column added by a
hand-written migration without a `schema.ts` change. The check runs in one direction only: a
declared column that the database lacks is the static gate's concern, because a database may lag
behind the branch. Views are not tables and are not checked. The failure is strict on a database
built from the repository alone (CI's `verify` job, a local stack). On the shared hosted development
database, which other branches' migrations can move ahead of this branch, the test SHALL report the
same findings as a warning without failing. CI's `verify` job then enforces them on every pull
request. Source: ADR-010 (*„der Check vergleicht das eingeführte Schema gegen die Datei"*).

#### Scenario: A column added only by SQL
- **WHEN** a database built from the repository alone has a column in `public` that
  `data-inventory.yml` does not declare
- **THEN** the test fails, and the message names the table and the column

#### Scenario: The shared database is ahead of the branch
- **WHEN** the suite runs against the hosted development database and it holds a column that this
  branch's `data-inventory.yml` does not declare
- **THEN** the test passes and prints a warning naming the table and the column, saying the branch
  may be behind the database's migrations

#### Scenario: CI's fresh database
- **WHEN** the suite runs against CI's database built from `drizzle/` alone
- **THEN** every table and column that database holds in `public` is declared
