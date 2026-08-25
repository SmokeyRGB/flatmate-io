ROLE:
You are a senior AI software engineer tasked with building Flatmate.io, a consolidated casting platform for shared apartments. You operate under strict domain-driven design principles and work within a modular monolith architecture.

GOAL:
Implement Flatmate.io as a production-ready web application that consolidates a fragmented 13-step roommate casting process into a single state-based workflow, enabling shared apartments (5+ residents) to make collective hiring decisions with participation rates exceeding 80%.

PROJECT IDEA:
Flatmate.io transforms roommate casting from scattered WhatsApp/Doodle/Portal chaos into a unified platform. It models the entire process as an explicit state machine (new → screened → invited → scheduled → interviewed → offer_made → moved_in), with card-based screening, ranked results, availability-based scheduling, casting notes for absentees, and a second voting round with veto mechanics.

TARGET USERS:
Primary: WGs and housing projects with 5+ residents conducting casting 3–6 times annually.

CORE FEATURES:
- Household onboarding with role-based access (Household Account, Moderator, Resident, Former Resident)
- Multi-channel application intake (form + paste parser, no forced app registration)
- 4-level card-screening (No / Maybe / Good / Must-Have) with hidden results until voting closes
- Ranked results with visible quorum; candidates under quorum in separate "Waiting for Votes" section
- Availability grid with explainable feasibility layer and constraint solver
- Casting notes 
- Second-round voting with configurable Veto
- Activity feed answering "what happened while I was away?"
- Retention automation (180-day default, 14-day warning before deletion)
- Data export per application (GDPR Art. 28 support)
- Installable PWA (mobile-first, no App Store)
- In-app + email notifications

TECH STACK:
- Frontend + Backend: Next.js (App Router, Server Components), TypeScript
- Database: PostgreSQL 16+ with Row-Level-Security (mandatory for privacy enforcement)
- ORM: Drizzle (low-level SQL visibility for RLS debugging)
- Solver: OR-Tools CP-SAT as local subprocess (Python adapter)
- Deployment: Docker image, EU-hosted with Data Processing Agreement, self-hosted auth
- Architecture: Modular monolith, 6 Bounded Contexts (identity, casting, deliberation, scheduling, notifications, audit), Domain Events between contexts, no cross-context joins
- Core domain logic: Pure functions (voting math, ranking, state machine, time-window parsing) testable without database

CONSTRAINTS:
**5 Non-Negotiable Design Principles:**
- P-1 (Channel Neutrality): Every info enterable via UI (e.g. applicant-link) must also be manualable by hand; no forced app registration for applicants
- P-2 (Device Neutrality): No resident excluded by their device; password is universal auth method
- P-3 (Legitimacy > Optimality): All rankings and scheduling proposals must be explainable (no black-box formulas)
- P-4 (Reversibility): Every pipeline state is backward-reachable and audited; no irreversible state
- P-5 (No AI in Decisions): Zero AI-driven ratings, rankings, or recommendations over people; only structured text processing allowed

**27 Framework Decisions** (E-01…E-27):
- Sightability Invariant (E-12): No one reads assessments about themselves—ever, enforced at policy + RLS layers
- Voting Scale (E-07): 0/1/3/5 (weighted non-linearly), scored as mean on 0–100, weights visible in UI
- Quorum (E-10): Candidates below quorum separated into "Waiting for Votes"; quorum is display, not blocker
- Moved-Out Logic (E-14): Exited residents lose access immediately; their votes count in closed rounds, excluded from open-round quorum
- Retention (E-18): 180 days post-round-close, 14-day warning, household can shorten (30/90/180) but not extend indefinitely
- State Machine (E-20): Explicit state table with audited backward transitions; normal cases (applicant declines post-offer, room assigned mid-round) fully supported
- Activity Log (E-21): Append-only event log storing both Account and acting Profile (for attribution: "Admin invited Lea" vs. "Lea invited herself")
- Availability (E-16): Hybrid token-link (no account required) + manual window entry + freetext parser ("Di 16–19", "only evenings")
- Scheduling (E-17): Feasibility layer (no-solver fallback) + explainable solver (CP-SAT) with per-constraint relaxation on failure ("No solution: Lea can only Di 16–19, only 2/7 available then")

EXPECTED OUTPUT:
1. **Complete codebase** (Next.js monolith with TypeScript) ready for deployment
2. **Data schema** with Row-Level-Security policies enforcing all visibility rules (V-1…V-4)
3. **Domain core** as pure functions: voting aggregation, ranking, state transitions, time-window parsing, solver adapter
4. **UI screens** (v1 complete set): Onboarding, Casting Round, Application Intake, Screening Loop, Ranking, Availability Grid, Scheduling, Casting Notes, Round 2 + Veto, Calendar, Activity Feed, Settings
5. **GUARDRAILS.md** — protected tests for: sightability invariant, quorum math, state transitions, RLS policies
6. **data-inventory.yml** — machine-readable data catalog (field, purpose, legal basis, retention, category); CI gate enforces it
7. **Deployment package** (Docker image) with Postgres, solver, and self-hosted auth
8. **Compliance artefacts** (prepared, not fully executed): Data Processing Agreement clauses, Art. 30 register, deletion automation

SUCCESS CRITERIA:
1. **Participation > 80%**: Minimum 80% of eligible residents vote in ≥1 complete round
2. **Visibility Invariant Unbroken**: Zero incidents of an applicant reading assessments about themselves
3. **Zero Forced App Usage**: All applicant data enterable by hand; no applicant forced to register
4. **State Machine Holds**: All 13 original process steps executed within app without reverting to WhatsApp
5. **Scheduling Transparency**: Every proposed appointment includes quorum count ("Di 17:00 — 5/7 can") and failure reasons ("No solution: Lea only Di 16–19, only 2/7 available")
6. **Retention Automated**: Deletion warnings, exports, and purges execute on schedule without manual intervention
7. **CI Gate Active**: Every schema change checked against data-inventory.yml; undeclared PII rejected
8. **Performance**: Load time < 2s (PWA installed), <3s (cold load), handles 60 concurrent residents
9. **Deployment**: One docker-compose up, EU-hosted, fully functional within 15 min

## 1. Explainability & Feasibility

**Before responding, verify that:**

1. **All 8 expected outputs exist** as concrete files, not placeholders:
   - Complete Next.js/TypeScript codebase (App Router, Server Components, Drizzle)
   - Schema + Row-Level-Security policies
   - Pure domain core (voting math, ranking, state machine, time-window parser, solver adapter)
   - All 13 v1 UI screens (Onboarding, Casting Round, Application Intake, Screening Loop, Ranking, Availability Grid, Scheduling, Casting Notes, Round 2 + Veto, Calendar, Activity Feed, Settings)
   - Compliance artefacts (DPA clauses, Art. 30 register, deletion automation)
2. **All 20 entities** from `04-Domaenenmodell.md` exist with contract names: `Account`, `Household`, `Membership`, `ResidentProfile`, `Room`, `CastingRound`, `RoundParticipation`, `Application`, `Vote`, `Veto`, `CastingNote`, `AvailabilityWindow`, `Slot`, `Appointment`, `ActivityEvent`, `Notification`, plus `Session`, `PasskeyCredential`, `AvailabilityToken`, `HouseholdSettings`.
3. **The 11 `Application` states**, 5 `CastingRound` states, and 6 `Room` states are implemented as **declarative transition tables** (ADR-002) — not scattered if-statements, not boolean flags.
4. **RLS is two-layered** on every table with `household_id`: RLS enabled **+ `FORCE ROW LEVEL SECURITY`**, app role is **not** table owner, session contact via `SET LOCAL` only within a transaction (G-C8). An app that owns its tables or uses `SET` without `LOCAL` fails.
5. **`V-1` (Self-Redaction) is enforced twice**: once via the policy layer and once as **raw SQL** on the same tables (G-C7: `…via_policy` and `…via_raw_sql` in `test/guarded.manifest.json`). Both must render empty for a self-subject, regardless of round status or re-opened rounds.
6. **`V-2` (round visibility)**, **`V-3` (moved_out access removal)**, and the quorum denominator/numerator math follow §5.3 exactly: moved-out votes remain in the score, but are *excluded from the numerator and denominator* in open rounds; closed rounds use `quorum_denominator_frozen`.
7. **All 13 steps of the process** can complete **end-to-end with zero applicant interaction** (P-1: manual input path produces the same domain object as token/link/parser paths — G-M3). E.g., the full path from `new` → `moved_in` runs via the test suite without any token-link.

If you discover **blind / non-implemented items**, enter them into a `KNOWN-LIMITATIONS.md` and in the `Completeness & Feasibility` table with status `NOT-IMPLEMENTED`.

---
## 2. Protected tests & defensive-barrier
**Verify that:**

1. **`test/guarded.manifest.json` exists** and lists **all 10 invariant IDs with `[GUARDED]` marker** in each test description (G-D).
2. **Two valid test items exist** for G-D1, G-D2, G-D3, G-D4 (or G-D1 needs 2), — minimum ✓: `via_policy` + `via_raw_sql` (G-C7).
3. **RLS-positive test** (G-C2): iterates all tables with `household_id`, verifies `ENABLE + FORCE` and at least one policy. A new table without RLS → build fails.
4. **No `skip`/`only`/`.todo`** inside `[GUARDED]` blocked tests (CI enforced).
5. **The immutable access** test: `became_resident_id` is **never** set to `null`, and the backward transition `moved_in → offer_made` is tested this way (G-D9).
6. **Data-inventory gate** (G-F1/G-F3): a diff of the schema vs `data-inventory.yml` yields zero — every new PII column is declared `purpose` / `legal_basis` / `retention` / `category` (=&#x1f534;,&#x1f7e0;,⚫,⚙️) and the context, confirm the gate actually **fails** (intentionally) if a non-declared column is added, and no Art.9 category fields exist (G-F3).
7. **Redaction to list tests**: logging is structured; the redaction list is **generated** from `data-inventory.yml` (G-B3). No customer PII from `message_raw`, `Vote.value`,... in logs; the invitation code `join_code` is never in queries or access logs (G-A5/G-B3).
8. **Notification fan-out is visible via G-D5**: a notification containing deliberation artifacts about the recipient themselves is not silently delivered (G-C6).
9. **Export (G-D6)**: contains all required fields incl. `Veto.reason`, but **no** list of who voted/noted.

If a required test is missing, an assertion has been weakened, or a `[GUARDED]` test has been removed — **the response FAILS regardless of the amount of work**.

---

## 3. Domain math & consistency

**Verify on paper that:**

1. `score(votes, weights)` = `round_half_up(mean(weight[value]) / max(weight) × 100)` with value 100 (0/1/3/5) — can be hand-recomputed from the output. `NO_SCORE` and `0` are leaks (score 0 from a rejected person must not equal "no votes").
2. `rank(…)` tie-breaker order exactly §8.3: veto-block box (1, block > below-all) → score desc → `count/value 'definitely'` desc → `count 'no'` asc → `count incl votes` desc → `created_at` → `id`. No extra derived tie-breaker.
3. `quorum` = `ceil(quorum_share × denominator)`, candidates below → pending "Waiting for Votes" section; not in the ranking.
4. `Veto`: one veto **block** (0/1), NOT score deduction or deletion; `locked_at` on `offer_made` (I-6).
5. Solved runs: uses CP-SAT, **fixed seed + exactly 1 worker** (G-K1), stable input order, integers only, no system-clock limit — repeat same test case 10 times → identical output (G-K1 protected test).
6. State machine (G-D4 / G-D2): every transition → exactly **one** `ActivityEvent` containing `actor_account_id` AND `actor_profile_id`; each state change/backward transition **audited**.
7. The storage-auto **180d** (default), 14d warning, 3 actions (extend(reason, audit)/delete/archive): the export is generated persistently from `retention_until`.

---

## 4. The response FAILS if:

** Fails -> product fails, they must be handled before you respond:**

1. Visibility breach: **V-1** is brute-forceable on ANY path (policy layer, RLS, raw SQL, notification, event log, aggregate/rank projection, thread output). → Fail.
2. The 10 guarded tests / G-D list is absent, incomplete or `skip`-marked; the policy+SQL pair is incomplete. → Fail.
3. The tables with personal data are not protected by RLS (or `FORCE` fits, or `SET LOCAL` outside transaction, or app-role poisoned). → Fail.
4. `.gitignore` isn't as accepting `.env*` (except `.env.example`) or a secret scanning is absent in CI. → Fail (G-A1/A2).
5. `data-inventory.yml` is empty/not-synced to schema (or PII fields missing `legal_basis`). → Fail (G-F1).
6. Quorum math: moved-out still counts in the numerator/denominator; or a candidate with quorum at the end of the „Waiting" list. → Fail.
7. `BECHREIDT`: Fixed seed uses 1 worker, we see different solution on 2 runs or solver inputs are persisted (G-K4). → Fail.
8. E-08 (favorites-have > 1.5× rooms) blocks screening or changes hidden during an open round (I-7 → blocked). → Fail.
9. `visibility` — rankings/schedules have no explanation of the form „Di 17:00 — 5/7 können" or failed: „Lea: Di only 16-19" → explained. → Fail.
10. The `.env.example`: no secrets; `docker-image` restarts reproduce; verification went through manual tests (through app / in logs) instead of faithful `docker-compose up`. → Fail.

---

## 5. The response SUCCEEDS if:

1. At least the **entire success measurement**: `docker-compose up` + schema runs in one shot on a clean tree (documented, actually executed, output includes 1 line of logs).
2. The full guarded set becomes **green** (manually check output with a PASS marker, not just visually complete).
3. The `data-inventory.yml` gate **actually fails** when a column is added without declaring it — and still succeeds after declaring. (If CI does not exist, provide the `npm test`/`pnpm` output that would catch that.)
4. Every visibility invariant from `V-1`..`V-4` is tested **twice**, with both parts (that shows in the test log with `via_policy` + `via_raw_sql`).
5. The full pipeline is **executed without any applicant an account/registration or token-link** (P-1) and the test suite contains this demo.
6. The test suite contains: `moved_in` — forward transition — back `moved_in → offer_made` → V-1 STILL LOCKED (`became_resident_id` enacts) — passing.
7. `re the state machine`: only (transition from the declarative table) is allowed; not allowed → Error from the runtime. Good.)
8. Proving in addition: merge reasons/instructions are not omitted (agent states how each was satisfied).
