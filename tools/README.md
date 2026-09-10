# tools/ — what these are and why they exist

Two shell scripts that check the specification documents, plus a note on the four tools chosen
for the *implementation* repo. Nothing here is installed as a dependency and nothing here runs
automatically yet — these are scripts you run by hand, in Git Bash.

---

## Why any of this exists

`review-log.md` §Durchgang 3 records the same defect three times in a row: a version line that
was supposed to be carried forward, wasn't. Its conclusion is the reason this folder exists:

> *„die Regel ‚Versionszeile mitziehen' ist genau die Sorte Zusicherung, die ohne Mechanismus
> nicht hält"*

A rule nobody checks is a rule that quietly stops being true. Everything in this folder turns a
rule that was written down into a rule that fails loudly.

---

## `check-refs.sh` — do the cross-references still point at something real?

```bash
bash tools/check-refs.sh
```

The specification is eight documents that cite each other roughly 120 times, by filename and by
ID (`S-31`, `ADR-004`, `U-22`, `V-1`). When a file moves or a section is renumbered, those
citations silently rot — they still *look* fine, they just point somewhere else now. This script
finds them.

Seven rules. Each exists because that specific failure has already happened at least once here.

| Rule | What it checks | Why |
|---|---|---|
| **1** | Every markdown link — the `[text](…)` form — resolves to a file that exists | Two file moves on 2026-09-09 broke ~33 references at once and nobody noticed |
| **2** | Every filename in backticks — `` `02-SRD.md` `` — exists somewhere in the project | This is the repo's normal way of citing a document. It is resolved *by filename only*, which is exactly why moving a group of files together is safe: the citation keeps working. Rule 2 is what proves that |
| **3** | A reference carrying a line number is only allowed into the three **frozen** files | A line number into a living document is a time bomb. Insert one paragraph above it and it points at the wrong sentence — with no error, ever. When this rule was first run it found **15** such references, and **five were already wrong**: one cited „§4.1.5" while its line number had drifted into §4.1.3, and one cited an open point that had moved 339 lines away. The rule caught its own reason for existing |
| **4** | The three frozen files have not been edited — checked by hashing their **content**, with carriage returns stripped first, so the same hash holds on a Windows CRLF checkout and a Linux/CI LF checkout alike. A raw byte hash would only ever match on the machine that generated it, leaving this rule permanently red in CI — and the first person to hit that would disable it, which removes the whole mechanism | Splitting a big document leaves two copies that both look authoritative. The hash is what stops someone editing the wrong one. Changing a frozen file on purpose means updating its hash in the same commit — which makes the intent visible in review instead of invisible |
| **5** | Every `ADR-NNN` mentioned anywhere has exactly one record file | Catches an ADR written into a spec with no record behind it, and a record accidentally split in two |
| **6** | Every `U-n` and `S-nn` used anywhere is actually defined where the ID register says | The `U-` decisions were cited 144 times while living in a file outside the repo. This rule makes that impossible to repeat |
| **7** | **The handover gate.** Nothing inside `docs/` may point outside `docs/` | `docs/` is the folder that gets copied to the implementation repo. If anything in it reaches outside, the copy arrives broken. This is the one rule that proves the handover actually works |

Useful flags:

```bash
bash tools/check-refs.sh --only 3        # run a single rule
bash tools/check-refs.sh --quiet         # counts only, no detail
bash tools/check-refs.sh --scope docs    # the handover dry run: check docs/ in isolation
```

Exit code is non-zero if anything failed, so it works as a gate.

**Deliberately not checked:** anything under `archive/` or `docs/_logs/`. Those are historical
records. Their references were accurate on the day they were written, and rewriting a historical
document to satisfy a linter would falsify it. `archive/README.md` carries a path-translation
table instead.

---

## `done-check.sh` — is sprint-v0.1 actually finished?

```bash
bash tools/done-check.sh
```

`check-refs.sh` asks *"is the tree consistent?"*. This one asks *"is the work done?"* — five
conditions that must all hold before this branch merges into `main`. It is written to fail today
and pass at the end; that is the point of writing it first.

The five conditions are listed in the script itself, each with the reason it is there.

---

## The four tools for the implementation repo

**None of these are installed yet** — the implementation repo does not exist. This is the
recorded decision, so `GUARDRAILS.md` no longer says "TBD". Each one exists to enforce a rule
that is already written; none was chosen for its own sake.

| Tool | What it does, plainly | Which rule it enforces, and why this tool |
|---|---|---|
| **Vitest** | Runs the automated tests | **G-C7** demands the visibility invariant be tested *twice*: once through the application's own permission layer, and once by talking straight to the database, bypassing the app. `GUARDRAILS.md` says that without the second test, ADR-004 is *„eine Illusion"* — because the app could be filtering correctly while the database would happily hand the data to anyone who asked it directly. Vitest can run both halves in one suite, and it is the natural test runner for the ADR-006 stack (Next.js/TypeScript) |
| **dependency-cruiser** | Checks which parts of the code are allowed to import which other parts, and fails the build if something imports across a forbidden line | ADR-001 splits the system into six areas (`identity`, `casting`, `deliberation`, `scheduling`, `audit`, `notifications`) and says the boundaries are *„durchgesetzt per Lint, nicht per Absprache"* — enforced by a tool, not by remembering. All six rules fit in one config file here, and there is a single command (`--validate`) for CI. The ESLint alternative would scatter the same rules across per-folder settings, where they are easy to weaken by accident |
| **gitleaks** | Scans the code — and the entire git history — for things that look like passwords, API keys or tokens | **G-A1** wants this check in two places: as a hook before a commit is created (so the secret never enters history) and again in CI (so a bypassed hook is still caught). gitleaks is a standalone program, so the same binary does both. A test-runner plugin could only do the second |
| **license-checker-rseidelsohn** | Lists the licenses of every dependency and fails if one is not on an approved list | **G-H2** needs *deny by default*: only licenses on an explicit allowlist pass, and anything unrecognised fails. Most similar tools work the other way round — they block a list of known-bad licenses and wave everything else through, which means a new dependency with a strange license slips in silently. This one takes the allowlist directly |

**The allowlist** (repo is private for now, so the project's own license is deferred):

```
MIT · ISC · BSD-2-Clause · BSD-3-Clause · Apache-2.0 · 0BSD · Unlicense · CC0-1.0 · Python-2.0
```

Blocked without an explicit written decision: `GPL-*`, `AGPL-*`, `LGPL-*`, `SSPL`, `BUSL`,
`CC-BY-NC-*`, and anything reported as `UNKNOWN`.

**One thing that turned out to be a non-issue.** `GUARDRAILS.md` **G-H2** worried whether the solver's
Apache-2.0 dependencies are compatible with the project's own licensing. They are, and the reason
is architectural: ADR-005 runs the solver (`ortools`) as a **separate program**, talking to it
over standard input and output. Nothing links it into our code, so no derivative work is created
— and Apache-2.0 is permissive in any case. The only real obligation is including its NOTICE
file. That clause can close without a lawyer.
