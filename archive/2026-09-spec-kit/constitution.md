<!--
Sync Impact Report
==================
Version change: 1.0.0 → 1.1.0
Modified principles: II (Precedence order) — added rank 6, `09-Design-System.md` (visual tokens
  only, below the UI layer 07/08, above domain/adr); renumbered old ranks 6-7 to 7-8. Source
  change: docs/README.md §2 gained the same row, by human decision, since 09-Design-System.md
  was previously findable only via the ID registry (§3/§4), not the precedence table.
Added sections: none
Removed sections: none
Templates requiring follow-up: none (plan/spec/tasks/checklist templates don't enumerate
  precedence ranks by number, so the renumbering doesn't touch them).
Deferred TODOs: none.
-->

<!--
Sync Impact Report
==================
Version change: [none, template] → 1.0.0 (initial ratification)
Modified principles: n/a (first version)
Added sections:
  - Core Principles I–X (all sourced from docs/GUARDRAILS.md, docs/README.md, ADR-012,
    tools/check-refs.sh; none invented)
  - Minimal-Gate (Nine Gates)
  - Spec-Maintenance Policy
  - Governance
Removed sections: none (template placeholders replaced, no generic boilerplate retained)
Templates requiring follow-up: plan-template.md, spec-template.md, tasks-template.md,
  checklist-template.md — reviewed for conflicts with these principles; no changes required,
  since none of them assert content that this constitution overrides (they are process
  scaffolding, not sources of domain or governance truth).
Deferred TODOs: none.
-->

# Flatmate.io Spec-Kit Constitution

## Core Principles

### I. GUARDRAILS.md is the hard floor

`docs/GUARDRAILS.md` governs every automated or semi-automated code change to Flatmate.io.
Its guiding principle: *"Jede Regel ist so weit wie möglich maschinell durchsetzbar — als
Lint-Regel, CI-Check oder Test, nicht als Prosa-Appell. Ein Appell an ein Sprachmodell, etwas
nicht zu tun, ist keine Sicherheitsmaßnahme; er ist eine Bitte."*

When a task appears solvable only by violating a guardrail, that is a finding about the task or
about the rule — never a reason to route around it:

> *"Eine Guardrail wird nicht umgangen, sondern gemeldet. Wenn eine Aufgabe nur unter Verletzung
> einer Regel lösbar scheint, ist das ein Befund über die Aufgabe oder über die Regel — nicht
> über die Regel als Hindernis. Der Agent bricht ab, beschreibt den Konflikt und wartet auf eine
> menschliche Entscheidung. Das gilt insbesondere für G-C (Autorisierung), G-D (geschützte
> Tests) und G-L (KI-Grenze); dort ist Umgehung unter keinen Umständen zulässig."*

**G-C** (Autorisierung und Sichtbarkeit), **G-D** (Geschützte Tests), and **G-L** (Die
KI-Grenze / P-5) — all in `docs/GUARDRAILS.md` — are a hard floor. Spec-kit MUST NOT emit code
that violates them, weaken or delete a protected test (marked `[GUARDED]`, tracked in
`test/guarded.manifest.json`), or disable a check. Disabling a rule is itself a change requiring
human approval (G-G3) — it is never a task spec-kit performs on its own judgment.

### II. Precedence order

Where documents conflict, `docs/README.md` §2 fixes which one wins — highest first:

1. `GUARDRAILS.md` — harte Sperre; a violation aborts the task, not the discussion.
2. `02-SRD.md` — scope, principles P-1…P-5, and (§5.4) the only place a scope line is mapped
   to a delivery phase.
3. `03-PRD.md` — user flows, acceptance criteria, score and quorum computation.
4. `06-Compliance-Anhang.md` — binding for everything that touches personal data.
5. `07-Screen-Inventar.md` / `08-UX-Entscheidungen.md` — the UI layer; per U-7 it may correct
   `02`, `03`, and `04`, and those are then updated to match, never the reverse.
6. `09-Design-System.md` — visual tokens: color palette, typography, spacing, shapes, and
   component patterns, derived from the `prototype/` clickthrough (design reference only —
   `prototype/`'s code must never be copied into an implementation). Binds only the visual
   implementation, never scope, flows, or requirements; on conflict with `07`/`08` the UX
   decision wins and `09` is updated to match, never the reverse.
7. `domain/` · `adr/` — schema and architecture.
8. `00-Session-Brief.md` — historical only; loses to every later document.

### III. The five principles (P-1…P-5)

Defined authoritatively in `docs/README.md` §3.1 and cited by name throughout the chain
(GUARDRAILS.md, the ADRs, the PRD, the requirement packets):

- **P-1 Kanalneutralität** — jede Information, die über einen Link hereinkommen kann, muss auch
  von Hand einpflegbar sein; kein Feature setzt einen Link voraus.
- **P-2 Geräteneutralität** — kein Bewohnender darf durch sein Gerät ausgeschlossen werden.
- **P-3 Legitimität vor Optimalität** — Ranglisten und Terminvorschläge müssen erklärbar sein;
  keine versteckten Formeln, keine nichtdeterministischen Verfahren.
- **P-4 Reversibilität** — jeder Pipeline-Zustand ist rückwärts erreichbar und auditiert.
- **P-5 Keine KI in wohnungsbezogenen Entscheidungen** — zulässig ist ausschließlich
  strukturierende Textverarbeitung.

### IV. docs/ is authoritative until a human changes it

A file under `specs/` MUST NOT silently redefine or override anything in `docs/`. Where a
spec's needs and `docs/` genuinely conflict, that is a finding to report under the challenge
protocol (Principle X) — stop, describe the conflict, wait for a decision — never something to
resolve unilaterally inside the spec.

### V. Cite, don't restate

`docs/README.md` §3 is a formal ID register: every ID family (`S-*`, `E-*`, `P-1…P-5`, `ADR-*`,
`V-1…V-4`, `G-*`, `U-*`, `O-*`/`P-O-*`, screen IDs, `FR-n.m`/`AC-n.m`, `H-*`) has exactly one
**maßgeblich** (authoritative) file; everything else is **erläuternd** (explanatory), and a
contradiction there is a bug in the citing file, not in the source — per `docs/SPEC-INDEX.md`'s
closing principle: *"Widerspricht eine erläuternde Stelle der maßgeblichen, ist die erläuternde
falsch."*

Any requirement or decision ID referenced in a spec, plan, or task file MUST link to its
maßgeblich source per `docs/SPEC-INDEX.md` and quote it. Writing the rule out again in new prose
is a defect, not a convenience. If `SPEC-INDEX.md` has no row for the topic, add the row first —
never restate instead.

### VI. Frozen files and line-number discipline

`04-Domaenenmodell.md`, `05-ADRs.md`, and `07-Screen-Inventar.md` are frozen and hash-checked
against `tools/frozen.sha256` (`tools/check-refs.sh` Rule 4). Line-number references into living
documents are forbidden; they are permitted only into these three frozen files (Rule 3). The
frozen files and `tools/frozen.sha256` MUST NOT be edited without an explicit human decision
recorded in the same commit.

### VII. The handover gate — docs/ never points into specs/

`tools/check-refs.sh` Rule 7 keeps `docs/` (together with `tools/`) a complete, self-contained
handover package: nothing inside `docs/` may point outside it. This already covered
`coursework/`, `archive/`, `research/`, and `process/`; the scan scope now extends the same rule
to `specs/`. A citation may run `specs/ → docs/`, never `docs/ → specs/`.

### VIII. Language

Per `docs/adr/0012-deutsch-dokumente-englisch-code.md`: reasoning documents are German;
entities, fields, states, enum values, functions, tables, commit messages, and code comments are
English. Everything under `specs/` is English, following the same **named exception** ADR-012
already grants to `docs/backlog/**`, `docs/COVERAGE.md`, and `tools/**` — implementation-facing
documents. German reasoning documents are never translated when cited: quote them verbatim in
German, in quotation marks, exactly as ADR-012 already does for `docs/backlog/**`.

### IX. Stack is fixed, tooling is open

*"Werkzeugnamen sind Vorschläge, sofern sie nicht aus einem ADR stammen … Ändert sich das
Werkzeug, bleibt die Regel — es ist dann ein anderer Mechanismus einzutragen, nicht die Regel zu
streichen."* (`docs/GUARDRAILS.md`)

ADR-006 (Next.js/TypeScript, Postgres, Drizzle, Supabase EU with Supabase Auth) and ADR-001 (six
bounded contexts: `identity`, `casting`, `deliberation`, `scheduling`, `audit`, `notifications`)
are `Bestätigt — verbindlich für v0.1` — treat as given, build on them. The four tools named in
`tools/README.md` (Vitest, dependency-cruiser, gitleaks, license-checker-rseidelsohn) are a
recorded, reasoned proposal, open to counter-proposal, PROVIDED the rule each one enforces
survives under a named replacement mechanism.

### X. The challenge protocol — challenge is expected, silent override is forbidden

This constitution's own rules are themselves subject to challenge. Spec-kit is expected to
report critical errors, contradictions, and risks it finds in `docs/` — that is useful output,
not insubordination. It states the problem, the options, the implications of each, and the cost
of changing course, then waits. It never acts on its own conclusion and never touches the hard
floor (Principle I).

Three tiers:

| Tier | What it covers | What spec-kit may do |
|---|---|---|
| **Hard floor** | G-C, G-D, G-L | May write a reasoned objection. MUST NOT violate them, weaken/delete a protected test, or disable a check unilaterally. |
| **Confirmed** | The 9 ADRs marked `Bestätigt — verbindlich für v0.1` (0001, 0002, 0004, 0006, 0008, 0010, 0012, 0013, 0014) and the precedence order in `docs/README.md` §2 | May challenge with rationale; the decision stands until a human confirms the change. Strongest argument: show the ADR's own **Aufgabebedingung** ("das gibt man auf, wenn …") is now met. |
| **Explicitly open** | The 5 ADRs marked `Vorschlag — anfechtbar` (0003, 0005, 0007, 0009, 0011) plus concrete tool choices (Principle IX) | Challenge is invited, not merely tolerated — still routed the same way, still never changed unilaterally. |

**How a challenge is filed.** Same shape as the repo's own ADRs: *Kontext · Betrachtete
Optionen* (each with Vorteil/Nachteil/Bewertung) *· Entscheidung · Konsequenzen* (Positiv and
Negativ) *· Aufgabebedingung ·* what a later reversal would cost. The question and its rationale
go in the relevant Fachdokument or a new proposed ADR.

**Where the status goes.** Only in `docs/review-log.md` §Offene-Punkte-Register: *"Dies ist der
einzige Ort, an dem der Status eines offenen Punkts steht."* No other file gets a status field
for an open question.

**Numbers are permanent.** A new ADR takes the next free number; a refuted record is set to
`Verworfen — ersetzt durch …`, never deleted, never renumbered — *"Nummern bleiben. Eine Nummer
wird nie neu vergeben"* (`docs/README.md` §3.1).

## Minimal-Gate (Nine Gates)

`docs/MINIMAL-GATE.md` extracts nine gates required before the corresponding feature exists;
`GUARDRAILS.md` remains maßgeblich if the two ever diverge — this section is a summary, not a
second source of truth:

1. Secret-scanning active; `.gitignore` covers `.env*` (G-A1, G-A2).
2. TypeScript `strict`; lint against `any` and `eslint-disable` (G-C4, G-J2).
3. CODEOWNERS on configuration, workflows, `GUARDRAILS.md`, `data-inventory.yml`,
   `test/guarded.manifest.json`, the migrations directory, and the solver adapter (G-G3, G-D,
   G-E1, G-K1).
4. `data-inventory.yml` with schema reconciliation as a mandatory gate — before the first table
   (G-F1).
5. RLS positive-test across every table with `household_id` — before the first table (G-C2,
   G-C5).
6. `test/guarded.manifest.json` with the fifteen G-D invariants, initially failing; the
   visibility invariants each tested twice, via policy and via raw SQL (G-C7).
7. Session context settable only through one transaction helper function; `SET` without `LOCAL`
   lint-blocked — before the first policy (G-C8).
8. Import-boundary lint enforcing the six bounded contexts (G-I1).
9. Lockfile installation, license check, and version check (G-H2–G-H4).

## Spec-Maintenance Policy

A spec, once implemented, is a **frozen record, superseded by a new ADR** — never a living or
bidirectionally-updated contract. This is the only choice consistent with `docs/README.md` §3.1
(*"Nummern bleiben. Eine Nummer wird nie neu vergeben"*) and the existing convention that a
refuted record becomes `Verworfen — ersetzt durch …` rather than being edited in place or
deleted.

## Governance

This constitution supersedes ad-hoc spec-kit defaults but never supersedes `docs/` — see
Principle IV; on conflict, `docs/README.md` §2 (Principle II) decides. Amending this
constitution itself is a confirmed-tier change: it requires a human decision, following the same
challenge protocol (Principle X) as any other confirmed-tier ADR. Complexity introduced under
`specs/` must be justified against the requirement packet it implements
(`docs/backlog/requirements/F0`…`F5`); use `docs/MINIMAL-GATE.md` and `docs/GUARDRAILS.md` for
enforcement detail this constitution only summarizes.

**Version**: 1.1.0 | **Ratified**: 2026-09-16 | **Last Amended**: 2026-09-17
