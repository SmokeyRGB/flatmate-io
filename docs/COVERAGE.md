# COVERAGE — v0.1 scope lines and the requirements that own them

> **Status:** V1.0 · 2026-09-09 · Samuel Zink (@SmokeyRGB)
> **Band:** `v0.1` — the vertical slice: application → screening → vote → result
> **Source of truth:** `02-SRD.md` §5.4 for the cut, §5.3 for the scope lines themselves
> **Language:** English, following the Exercise 10 precedent for implementation-facing documents

---

## 1. Why this file exists

The v0.1 cut was written down in three places — `02-SRD.md` §5.4, `03-PRD.md` §7.1, and the MVP
Backlog README — and they disagreed with each other on more than one line (see §4 below). On top
of that, simply listing a scope line in a packet's header turned out not to be the same thing as
actually building a requirement for it. Two gaps of that kind were open when this table was
started, and writing it is what surfaced them:

- **S-05** was named in `F1-requirements.md`'s header but had no requirement behind it — it
  appeared only as a `Source:` citation inside a Constraint. `FR-1.25`–`FR-1.30` and
  `AC-1.20`–`AC-1.23` now implement it.
- **S-15, S-27, S-36 and S-37** were each cited as a `Source:` inside some other packet's
  Constraints list and never written as their own testable requirements. `F0-requirements.md`
  now owns all four — and building this table showed that S-15 and S-27 initially had functional
  requirements with no acceptance criterion above them, which `AC-0.10` and `AC-0.11` closed.

Both are recorded rather than quietly fixed, because the reason they were missed is more useful
than the fix: a scope line listed in a header looks covered. This file is the check that turns
"did we cover everything?" from a feeling into something you read row by row.

## 2. The 25 v0.1 scope lines

Order follows `02-SRD.md` §5.4's v0.1 row exactly, group by group.

| Scope line | What it is | Packet | Owning requirements | Status |
|---|---|---|---|---|
| **S-31** | Visibility invariant over `Application.became_resident_id`, enforced twice (policy layer + row-level security) | F5 | FR-5.29–FR-5.32; AC-5.24–AC-5.27 | ✅ |
| **S-36** | Authorization enforced twice: central policy objects **and** Postgres row-level security | F0 | FR-0.1–FR-0.4; AC-0.5, AC-0.6, AC-0.7 | ✅ |
| **S-15** | Full 11-state `Application` transition table; backward transitions permitted and audited | F0 | FR-0.9–FR-0.12; AC-0.10 | ✅¹ |
| **S-37** | Machine-readable `data-inventory.yml`, enforced as a CI build gate | F0 | FR-0.5–FR-0.8; AC-0.4 | ✅ |
| **S-01** | `Household` registration (email + password); the household account administers and never votes | F1 | FR-1.1, FR-1.2, FR-1.7; AC-1.1, AC-1.2, AC-1.5 | ✅ |
| **S-02** | `ResidentProfile` creation and context switching between administration and resident | F1 | FR-1.3–FR-1.6; AC-1.3, AC-1.4, AC-1.6 | ✅ |
| **S-03** | One join code/link for the whole household; one-step registration with only name + password required | F2 | FR-2.1, FR-2.9–FR-2.19; AC-2.1–AC-2.6, AC-2.17 | ✅ |
| **S-04** | `Membership` with orthogonal `is_resident` / `role` plus individually grantable permissions | F1 | FR-1.8; AC-1.5, AC-1.20, AC-1.21 (create-applicant permission itself is exercised by AC-3.5 in F3) | ✅ |
| **S-05** | Two lists with different rights: participant list (names only, all residents) and resident list (administration full, moderator read-only, others not at all); only two of the four original duplicate-protection mechanisms survive | F1 | **Half A:** FR-1.19, AC-1.18 · **Half B:** FR-1.25–FR-1.30, AC-1.20–AC-1.23 · dependency in **C-1.10** | ✅² |
| **S-49** | Join code gets an expiry, a usage cap, and a share-page warning | F2 | FR-2.1–FR-2.8; AC-2.7, AC-2.8, AC-2.9, AC-2.18 | ✅ |
| **S-50** | An account without an active `ResidentProfile` reaches household administration only | F1 | FR-1.23, FR-1.24; AC-1.16, AC-1.17 | ✅ |
| **S-06** | `CastingRound` with multiple `Room`s, its own state machine, and a `RoundParticipation` snapshot at opening | F1 | FR-1.12–FR-1.17; AC-1.8, AC-1.9, AC-1.10, AC-1.11 | ✅ |
| **S-07** | `Room` as its own entity with its own status | F1 | FR-1.9–FR-1.11; AC-1.7 | ✅ |
| **S-08** (Formularhälfte) | `Application` capture through the manual form only — name required, everything else optional | F3 | FR-3.1–FR-3.7; AC-3.1–AC-3.5, AC-3.12 | ✅ |
| **S-38** | Two-axis capture: technical intake path plus collection source (`data_subject` / `third_party`) | F3 | FR-3.8–FR-3.13; AC-3.6–AC-3.11 | ✅ |
| **S-09** | Card-by-card screening pass over every open application of the round | F4 | FR-4.1–FR-4.7; AC-4.1–AC-4.6 | ✅ |
| **S-10** | Round-1 vote: four-level scale (0/1/3/5), weights disclosed, revisable while the round is open | F4 | FR-4.8–FR-4.16; AC-4.7–AC-4.15 | ✅ |
| **S-12** | Ranking: score as a 0–100 mean, sortable; detail view with the stacked four-rating distribution | F5 | FR-5.1–FR-5.5, FR-5.11–FR-5.14; AC-5.1–AC-5.6, AC-5.11–AC-5.14 | ✅ |
| **S-13** | Quorum display and separation; quorum is display only, never a lock | F5 | FR-5.6–FR-5.10; AC-5.7–AC-5.10 | ✅ |
| **S-14** | Hidden results until the viewer's own vote (default on) | F5 | FR-5.15–FR-5.19; AC-5.15–AC-5.19 | ✅ |
| **S-48** | Exactly one precedence rule decides which pending resident task is shown first | F2 | FR-2.20–FR-2.25; AC-2.12–AC-2.16 | ✅ |
| **S-16** | Copy-paste text on marking a candidate `invited`, as an aid for the household — never sent by the app | F5 | FR-5.24–FR-5.28; AC-5.21–AC-5.23 | ✅ |
| **S-27** (append-only log only) | `ActivityEvent` feed, append-only, every event naming the account **and** the acting profile | F0 | FR-0.13–FR-0.15; AC-0.11 | ✅¹ |
| **S-35** | Rule lock: changing the voting procedure while a round is open is blocked and logged | F1 | FR-1.21, FR-1.22; AC-1.13–AC-1.15 | ✅ |
| **S-33** (manual deletion only) | Manual deletion of a **single** `Application`, available at any time. Deleting a whole round is **not** in v0.1 — `02-SRD.md` §5.4 carves out only "die Handlöschung", and no packet specifies it | F3 | FR-3.17–FR-3.20; AC-3.15–AC-3.18 | ✅ |

**¹ S-15 and S-27 — gap found here, then closed in the packet.** `F0-requirements.md` §4 states
that its nine `AC-0.x` entries are, in order, the nine items of `GUARDRAILS.md`'s "Minimal-Gate
für den ersten Commit". None of those nine tests the state machine's own transition rules or the
audit log's immutability — the gate is about infrastructure being in place, not about these two
behaving. Building this table surfaced that: S-15 and S-27 had functional requirements with no
acceptance criterion above them. **`AC-0.10` and `AC-0.11` were added to close it**, so every
functional requirement in `F0` §3 now has one.

**² S-05 — the link is real but not machine-derivable.** `FR-1.25`–`FR-1.30` and
`AC-1.20`–`AC-1.23` implement S-05's administration resident list, and `FR-1.19`/`AC-1.18`
already implemented its participant list. But **none of them names S-05**, because the packets'
convention is that only Constraints carry a `Source:` line. So a tool cannot follow a scope line
to its requirements by reading the requirements — only the packet header's `Scope lines:` list
and this table record the connection. That is why `tools/done-check.sh` cross-checks the ids
named here against the packet they are attributed to: the mapping lives in one place, and a drift
between it and the packet fails the build rather than going unnoticed.

## 3. Feature 0 — the five substrate lines

| Scope line | What it is | Packet | Owning requirements |
|---|---|---|---|
| **S-36** | Authorization enforced twice | F0 | FR-0.1–FR-0.4 |
| **S-31** | Self-redaction visibility invariant | F5 | FR-5.29–FR-5.32 |
| **S-15** | Complete `Application` transition table | F0 | FR-0.9–FR-0.12; AC-0.10 |
| **S-37** | `data-inventory.yml` as a CI gate | F0 | FR-0.5–FR-0.8 |
| **S-27** | Append-only `ActivityEvent` log (log only) | F0 | FR-0.13–FR-0.15; AC-0.11 |

Four of the five substrate lines are owned by `F0`. The fifth, **S-31**, is deliberately carried
by `F5` instead — `F0-requirements.md` §1 calls it out explicitly as "a related but distinct
scope line, already carried as a constraint in `F1-requirements.md`" (it is, in fact, `F5` that
owns it with functional requirements; F1 only cites it as a constraint). Recording the split here
means nobody later writes a second, partial copy of the self-redaction rule inside `F0`.

## 4. Band corrections applied in sprint-v0.1

| Scope line | Was | Should be | Where it was wrong | Verified |
|---|---|---|---|---|
| `S-39` | v0.1 | **v0.2** | the MVP index's F3 row and `03-PRD.md` §7.1 — S-39 belongs to the paste parser, not the form | ✅ Fixed. `02-SRD.md` §5.4, `03-PRD.md` §7.1 (which now carries no scope column at all) and `backlog/requirements/F3-requirements.md` are all correct, and `backlog/README.md`'s F3 row now reads "S-08 (form half), S-38, S-33 (manual-delete half)" — S-39 is gone from it and the manual-delete half it had omitted is present. `backlog/stubs/EP-B-2-paste-parser.md` carries S-39 in v0.2. |
| `S-44` | v0.1 | **v0.2** | `03-PRD.md` §7.1 — §5.4 has a dedicated paragraph explaining why it is v0.2 | ✅ Fixed. `03-PRD.md` §7.1 carries no scope column any more; no current v0.1 listing anywhere names S-44. |
| `S-33` | wholly v0.2 | **split** | `03-PRD.md` §7.1 omitted the manual-delete half from v0.1 | ✅ Fixed. `02-SRD.md` §5.4 already places the manual-delete half in v0.1, and `F3-requirements.md` builds it (FR-3.17–FR-3.20). |
| `S-50` | F2 | **F1** | MVP README's row; the F1 packet claims it, the F2 packet dropped it | ✅ Fixed. `F1-requirements.md`'s header lists S-50; `F2-requirements.md`'s does not. The MVP README's rows agree. |
| `S-10` | v0.2 (board) | **v0.1** | the board roadmap's lane; §5.4 says revisability is fully in v0.1 | ✅ Fixed. `backlog/roadmap.md`'s "change my vote while the round is still open" story sits under the `### v0.1 – Now` heading, not `### v0.2 – Next`. |
| `S-38` | v1.x (board) | **v0.1** | `backlog/roadmap.md`'s v1.x lane carried "be told about the one-month notice duty when the data came from a third party". That story is S-38, which §5.4 places in v0.1 — and `F3-requirements.md` already builds it: `US-3.5` is the story verbatim, implemented by `FR-3.11`, `FR-3.12`, `AC-3.8` and `AC-3.9` | ✅ Fixed. Moved into the v0.1 lane; lane row total unchanged at 94. Found during final verification, after the other five — the sixth drift, and the second one pointing the *wrong way* (a built feature listed as not yet built) |

All six corrections are confirmed in the files. The `S-39` row was the last to close: the MVP
index still listed it under F3 after `02-SRD.md`, `03-PRD.md` and the F3 packet had already been
corrected, which is exactly the shape of drift this table exists to catch — a fix applied to
three of four places looks finished from any one of them.

## 5. What is deliberately not in v0.1

`02-SRD.md` §5.4 is the one place that lists what belongs to v0.2, v1.1, v1.2 and v2 — copying
that list here would create a second copy that can drift, which is exactly the defect this file
exists to prevent. For finer-grained detail than the phase cut gives, `03-PRD.md` §4 and §6 carry
a per-subsection `Band:` marker, so any single requirement's release band can be checked at that
level too.

## 6. Keeping this true

Two checks enforce this file rather than trusting it:

- **`tools/done-check.sh` section 6** asserts that all 25 v0.1 scope lines appear in this file,
  that every one resolves to a packet and an `FR-`/`AC-` id, and that no row is marked `gap`.
- **`GUARDRAILS.md` G-N2** asserts that every packet requirement cites a scope line that actually
  exists in `02-SRD.md` §5.3 — the reverse direction of this file's own check, so a stale or
  invented citation cannot creep back in from the other side.
