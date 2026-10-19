# Flatmate.io — Process Report for the Final Check-in

*Prepared 2026-10-14 from 133 Claude Code sessions (2026-08-18 → 2026-10-14), 35 memory notes, the F2–F5 plan files, 67 PRs and the repo itself. Nine Haiku agents did the reading (7 session chunks, 1 memory/plans, 1 repo/git/n8n/RAG); everything below was cross-checked against their reports. Items I could not verify are marked **[verify]** and collected in §9.*

---

## 1. The one-sentence story

> **Fast AI moved the bottleneck from typing code to deciding, specifying and verifying. What worked was making every loop smaller, and keeping the guardrails tight.**

Suggested talk title: **"Smaller loops, tighter guardrails."**
Alternative if you prefer a sharper hook: **"The leak moved."** (After PR #18, defects stopped coming from the code-writing agent and started coming from the *plan*: about 10 defects were written into `design.md`/`tasks.md` rather than into code.)

Every story in §3 is an instance of one of two moves:

| Make it smaller | …but keep it tight |
|---|---|
| Ship a thin vertical slice, not every feature deep | 9 guardrail lints + hazard log + `npm run verify` on every push |
| Change-sized OpenSpec specs instead of a 90-file spec chain | Frozen files, precedence order, ID registry |
| CI on a disposable DB (6m17s → ~4 min) | Local runs still hit the real hosted DB |
| Fresh session per change; plan file as memory | "Fix the class", not the instance |
| Haiku for the cheap step (40× cheaper) | A human walks the UI before every merge |

---

## 2. Timeline (for the Journey section)

| Dates (2026) | Phase | What happened | Evidence |
|---|---|---|---|
| Aug 18–24 | **Spec chain** | A plan chat + 3 sub-chats ("Generiere noch nichts, warte auf Instruktionen") produce 9 documents, **8,798 lines** in one day. First commit Aug 24. | batch01, `git log` |
| Aug 25 – Sep 9 | **Spec hardening** | 41-screen inventory, 21 hypotheses, story map, 5-agent audit (29 findings), F1–F5 requirement packages. Largest single session: 769 assistant turns / ~24 h. | batch01 |
| Sep 10–15 | **Decisions + prototype** | Supabase Auth adopted; ADR-013 (separate household-scoped logins) after a "talking past each other" identity debate; Lovable prototype; Playwright persona tests; Viktor's user test. | batch02, `coursework/prototype-test-viktor.md` |
| Sep 16–17 | **First code (spec-kit)** | F0 substrate + F1 casting rounds. First CI run green in 47 s *against the live DB*. | batch02/03 |
| **Sep 18** | **Pivot** | Wants to delete `src/` and restart because `check-refs.sh` takes forever and spec-kit "generates A LOT of specs". Measured first → the cost was Git Bash forking, not the specs. Kept `src/`, ported checkers to TS (3m10s → 0.9 s), **replaced spec-kit with OpenSpec** (PR #8). | memory `project_toolchain_migration`, batch03 |
| Sep 21–26 | **F2 join-by-link, hardening** | PR #23: 27 reviews, 5 Copilot rounds, 22 issues. Hazard rules begin to be written down. CI decision: local on hosted dev, GitHub CI on a runner DB (change 7). | batch04, repo agent |
| Sep 27–30 | **F3 capture + pitch pivot** | Weekly token budget ~50% spent → F3 paused after change 3, **F4 pulled ahead for the pitch**. | f4 plan |
| Oct 1–7 | **Audit, roles, F5** | Audit finds two authorization models = "a critical error" → change 2b *"roles are permission sets"*. F5: ranking, invite, candidate detail. DE/EN switch. | batch05/06 |
| Oct 9–14 | **AI features + polish** | n8n applicant parser (Oct 9), flatmate-rag (Oct 12), O1 dashboard, vote withdrawal (#64), candidate-revise (browsing cut). | batch07 |

**Hard numbers** (see §6 for confidence): 558 commits · 67 PRs (63 merged, 4 closed probes) · 29 archived OpenSpec changes · 37 migrations · ~1,600+ tests (1,783 on the last push) · 21 routes · 4 modules · peak week W40 = 146 commits.

---

## 3. Evidence for your themes

### (a) Cutting scope / the slice before depth / perfectionism
*Honest note: there is no single "I'm a perfectionist" moment in the logs. The evidence is behavioural, which makes the talk more credible than a confession would.*

- **Over-planning, visibly.** F3 plan ≈ 1,260 lines, F5 ≈ 950, F4 ≈ 620; F5 change 1 needed 15 questions (Q-1…Q-15) + 7 follow-ups *before any code*. The pr-review-lessons plan is 336 lines and one section lists what *not* to add. The v0.1 spec cut 41 screens down to ~15.
- **The cuts, with dates:**
  - 09-24 "what happened while I was away" feed → v0.2; the bell dropped ("a bell with nothing behind it would be a dead control").
  - 09-30 **F4 before F3** for the pitch; "merge is not on the pitch path".
  - 10-02 "Love it. Screening Pass is therefore merged and done for now." — the first end-to-end slice (capture → screen → vote).
  - 10-02 DB-break group 9 dropped ("Creating 11 test branches seems like a lot to me").
  - 10-06 *"Since we have at least a simple vertical slice (even though very rudimentary) now it is the time to pick up tasks & cleanup."*
  - 10-12 *"I do not want 5 worktrees that I have to merge later."*
  - 10-13 card browsing cut after testing it: *"nothing to burn tokens on right now"*; progress ring dropped ("does not look right").
  - Never built: solver, scheduling, notifications module, veto, PWA (all gated on H-D1).
- **Counter-evidence of the shift:** shipped CI at 230 s after the 180 s bar was dropped; merged #64 with no Copilot round; accepted known minor bugs.

### (b) Implementation hazards log
- Mechanism (this is the diagram): **incident → memory note → CLAUDE.md / `.claude/rules/` → pre-mortem prompt + `openspec/config.yaml` rules → lint**. 35 memory notes, 4 rules files, 9 hand-written guardrail lints.
- Prompt that started it (09-24): *"What did you miss? How can we avoid these mistakes in the future? Think of countermeasures. Then fix."* and (10-06) *"analyze what you did wrong (adapt implementation-hazards.md if needed)"*.
- **Best stories:**
  - **PR #23** — 27 reviews, 5 Copilot rounds, 22 issues, all clustered at one boundary (Postgres ↔ Supabase Auth). Round 1 fixed the reset flow; the sibling password/email flows came back in round 3 → rule "fix the class" and *"Writing a lesson down is not applying it."*
  - **PR #56** — founding-link CHECK pinned purpose but not `max_uses` → rule "a stored value that grants a privilege needs its whole write boundary in the DB".
  - **"The leak moved"** — F1 era: ~17 applier omissions. OpenSpec era: ~10 defects in design, 4 in tasks, 3 in planner review. The fix: a **separate Sonnet pre-mortem** (11–23 findings per change). *"I ran the pre-mortem myself, against my own design, and it missed them."*
  - Things tests could not see; a human found them: settings without authorization (150265d), orphaned join codes after a green suite (29792fa), hard removal that wasn't final.
- Lint list for an appendix slide: import-boundary · session-context · rls-coverage · data-inventory · definer-coverage · migration-shape · guarded-tests · pending-feedback · role-reads.

### (c) CI against the live DB vs. the full gate only locally
This is the most data-rich story in the whole history.

| Date | Event |
|---|---|
| 09-16/17 | Tests against the live DB find a real bug (own over-strict RLS policy blocked the retention update). CI via GitHub secret: **47 s, green**. |
| 09-18 | CI verify **350 s vs 47 s local, 17 timeouts**; tests orphaned households + Auth users in the shared dev DB (cleanup was in `finally`; a timed-out test never reached it). Fix: teardown in `afterEach` + sweep net + separate dev project. |
| 09-23 | ~12 min per PR: *"Do I have to wait 12 min for every Pull Request now?"* |
| 09-25 | Samuel's argument for keeping real-DB testing: *"…won't catch errors and architectural mistakes that would surface when testing it with the live database. Also, the Database is in the EU (Ireland), as am I."* **Decision: local + husky pre-push stay on hosted dev; GitHub CI moves to a disposable Supabase stack in the runner** (change 7). |
| 09-26/27 | Pre-committed go/no-go bar (180 s) measured on a draft PR; image-cache and 4-worker experiments tried and **reverted**. Bar relaxed on seeing data: *"3 min 50 is still better than 6 min 20."* Median of 3 runs: **242 s** vs 6m17s (≈36% faster). |
| 10-05/07 | Shared dev DB bites back: round participations wiped, Demo-WG deleted twice, `verify-hosted` red on main (688 s run, Auth timeouts), a 1-of-1,783 flaky failure. Lesson: owner SQL goes through the Supabase SQL editor (`DATABASE_URL` is `app_runtime`; RLS matches zero rows and reports success). |

Candidate framing: **"Local for truth, runner for speed — and a shared database is one accidental DELETE away."** Careful: the 1-of-1,783 failure is *suspected* dev-DB flakiness, unconfirmed.

### (d) Detailed specs vs. being too rigid
- **For specs:** 9 docs in a day; precedence order; ID registry; frozen files + `check-refs` (~120 cross-refs); spec sweeps at the start of each of F3/F4/F5 found 24, 20 and 28 findings → *"packets predate decisions"*.
- **Against rigidity:**
  - 09-18 spec-kit → OpenSpec (see timeline), the decision made on measured cost.
  - 09-18 FR-2.18: spec and PRD said joiners land on screening; the user's own usability test overruled both → dashboard.
  - 09-21 spec said "no maximum" and "always a maximum" for invite links: one sentence, two readings, and the text becomes the tests.
  - 09-28 *"I feel like some specs define things that should be architecturally not possible in the first place."*
  - 10-07 **"The example line built the wrong bar."** A spec example listed ratings strongest-first; the Sonnet applier built the vote bar exactly like that. User: *"Nein on the right is unintuitive."* → Claude: *"The mistake came from my spec."* **The agent copies your examples literally.**
  - 10-07 reflection (55d9): *"Next time I would refactor the specs, not freezing them as legacy… the AI still references it regularly and takes it as reference for decisions."*
  - Specs approved, then design changed mid-apply (D4, resident-frame, progress bar) → spec + design.md updated in the same change.
  - Humans override the spec *in writing*: F5 Q-6, Q-9; S-04 reopened for role permissions.

### (e) Tokens, context, models, sub-agents
- **Model roles (rule since 09-21, restated 09-22, 09-29, 10-06):** *Opus plans · Sonnet applies · Sonnet pre-mortems and /simplify · Haiku for cheap Q&A and visual walkthroughs.* *"If the active model is Opus 5 you should ALWAYS use a Sonnet 5 subagent for /opsx:apply."*
- **Budget as scheduler:** ~50% weekly budget by 09-30 → F3 paused, pitch-first. 2% left during 2b walkthrough (10-03): *"open the PR first, I'll do the walkthrough myself."* 76% by 10-07 → two review refactors skipped. Sonnet sub-agents died on session limits four times (09-22, 09-23, 09-24, 09-25) and again 10-06 (*"i hit my 5 hour token limit in the process - continue"*). On 09-24 Claude claimed Sonnet was blocked until Sep 28; the usage view showed 4%.
- **Context as designed artifact:** plan files "written to survive a /clear" with a *"Fresh session — start here"* block; one change per session; trust git over the file. First big session needed compaction (1.3 M output tokens in one session, 12d0f15f).
- **Sub-agents:** six parallel agents fixing six Copilot findings, six commits (09-18); Haiku explorers for Miro Ex.19; honest self-correction: asked whether sub-agents reduced main-context use, the answer was *"Yes, but I didn't measure it."*
- **Cross-model review (09-03):** *"Since I find mistake after mistake, I want to run a correction pass in another conversation using a different model."*
- **Offloading:** 12 audit work packages run in Cursor to save Claude tokens.
- **Scale (approximate, see §6):** ~35 M output tokens, ~9.7 B cache-read tokens across ~130 sessions.

### (f) Themes you did not list but the logs show strongly
1. **"Fixed" is not "verified".** 09-17 mobile buttons: *"bug is not fixed"* → *"didnt work"* → Claude: *"I trusted CSS/static reasoning alone and was wrong."* Also: glare animation reported "visible", user sees nothing; screenshot run that never showed the vote CTA; a broken `git merge-tree` read as "0 conflicts"; stale PR status. Pattern → the human walkthrough is a gate, and "plan the walkthrough before code review".
2. **Humans catch what tests can't:** UI copy (*"'Eingeladen' implies 4 out of 4"*, "not a real valid German sentence"), duplicate buttons (*"What is the difference between 'weiter' and 'überspringen'? It both does the same."*), the role model.
3. **Repetition → memory.** Role model explained three times in two days → *"I do not want to clarify this topic again"* → memory note. (This is the single best "memory works" demo.)
4. **Tool default vs project rule:** harness reminder says add `Co-Authored-By`; CLAUDE.md forbids it. Nine commits rewritten with filter-branch, tree hash preserved. A governance anecdote about *who wins when two instruction sources conflict*.
5. **Parallel sessions:** 3–4 Claude sessions at once; plan drift between them (*"So the plan has drifted, which should be corrected"*); duplicate sessions with identical start timestamps; worktrees ("one, not five"); never junction `node_modules` into a worktree (a worktree removal once deleted the target's contents).
6. **Learning mode:** *"Explain everything you do to me so that I can learn."* / *"…in a way that I (a junior developer) can understand."* Explanations became a deliverable.
7. **Claude overclaims about its own environment:** "no Supabase MCP" (there was one), Mistral key assumed, Sonnet limit date, "I checked Vercel's docs".
8. **Compliance first:** *"data protection and compliance are not something you can simply add after the fact."* Privacy text deliberately removed from invite messages (*"overly pushy… it is the responsibility of the household, not me."*). n8n execution saving off.
9. **Measure before rewriting** — the 09-18 restart that wasn't (3m10s → 0.9 s).
10. **Accidental data loss twice on shared dev** (see (c)).

---

## 4. Hypothesis section: a scorecard, with honest evidence tiers

*Updated after your feedback (2026-10-14): you did not test with real applicants because of GDPR and the still-open DB-security and application-management trade-offs (F3 change 6, F5 change 5). That reason is now on the slide. The slide is a scorecard of several hypotheses, not a single bet.*

### The one distinction that matters
Most of the "no instructions needed" evidence is an **AI persona run**, not a human test:

| Test | Who actually used it | Where |
|---|---|---|
| "The First-Time Voter" (persona "Mika"), 2026-09-15 | **An AI agent** driving Playwright at 390×844 on the Lovable prototype | `coursework/exercise-12/screenshots-3/usability-test-notes.md` |
| "The Organizer" (persona "Lea") | **An AI agent**, same method | `…/screenshots-moderator-1/usability-test-notes.md` |
| Prototype test by "Viktor" | **A human** (tested the prototype, Resident + Orga view) | `coursework/prototype-test-viktor.md` |
| **"Testkarte #1", tester "Arne"** (pasted by you 2026-10-14) | **A human**, invite link → end of voting on the Lovable prototype, with a success criterion set in advance (*"I'm right if onboarding, registration → first vote, takes under 3 minutes"* → **worked**). Stuck: the last screen, *"Where/how can I change my votes?"*; expected: the vote scale was not fully intuitive, he did not understand it represents all votes. | your paste (not in the repo yet: save it as `coursework/prototype-test-arne.md`) |
| **Friends**, informally, "from time to time" | **Humans**; feedback went into the next changes | your statement; no notes in the repo [verify which changes] |
| A "tester" who "switched the language by a misclick" (Oct 12) | **A persona** (confirmed by you), not a human | `openspec/changes/organisation-task-list/proposal.md` |
| Your own phone tests (Android Brave; swipe iterations) | **You** | sessions 09-24, 10-02 |

So the **human tests are Viktor's, "Arne"'s and your friends'**. Presenting the persona runs as user tests would be the one thing a sharp question can break. The slide tags each claim `PERSONA RUN` / `HUMAN TEST` / `MEASURED` / `UNTESTED`.

### The scorecard (what S2 shows)
| # | Claim | Evidence | Result |
|---|---|---|---|
| 1 | A first-timer can join and vote in **under 3 minutes**, no instructions | persona run: one sitting, 2 required fields, 1 tap per card, no tour needed · Arne: onboarding < 3 min, **criterion set in advance, met**, no visible frustration · Viktor: **stuck** because the password rule was never shown (joining failed) | ✓ supported on the prototype (human test found a blocker; became a spec correction, commits 01e2b24, 405cc5e; **fixed: the real app now shows the password requirements**, confirmed by you) |
| 2 | One clear next action beats a dashboard | persona: "the strongest moment in the flow" · human: clicked the notification centre first, not screening | ✓ supported, refined: bell dropped from v0.1 on 09-24 ("a bell with nothing behind it would be a dead control"; the link to the tester's note is plausible, not proven) |
| 3 | One card, one tap per applicant is fast | persona run: auto-advance, progress dots, no confirm step · your Android swipe tests (3 fix rounds, PR #49) | ✓ supported |
| 3b | The vote scale explains itself | Arne: did not understand that the scale/bar represents everyone's votes · Arne and the persona run both: "where can I change my vote?" | ◐ partly. **Confirmed by you:** the "how do I change my vote?" feedback (both testers + persona) led to the **revise** feature (F5 change 4, *change or withdraw your own rating on the candidate card*, commit cde55dc). Viktor's notes also asked to see who voted how, which led to the **household setting to make vote authorship visible** (`reveal_vote_authorship`, candidate detail, F5 change 3) |
| 4 | Hidden ranking motivates voting, no crowd-nudging | persona noted no spoilers while screening; motivation itself untested | ? untested (built as a *setting* so it can be measured) |
| 5 | >80 % of a WG really vote (H-D1) | no real casting yet | ? untested, with the stated reason |
| 6 | Spec volume is what slows the loop | `check-refs.sh` 3m10s; 2m12s was Git Bash forking; ported to TS: 0.9 s | ✗ refuted by measurement (the tool change to OpenSpec still helped; the *cause* was different) |
| 7 | Tests against the real DB catch what mocks hide | own over-strict RLS policy found on day one; `SET LOCAL` under the pooler confirmed live (G-D10) | ✓ measured. Cost: shared dev DB flakiness, 2 accidental data wipes |

Other findings the human tests produced (good for Q&A): "8 of 8 voted" screen says nothing; "Status: Seen" is jargon; ranking banner still shown after you voted; ex-residents must not be able to read; the "Contact" button is useless; "Einladen" only changed status (didn't open the invite screen); the persona run also found the stale count bug ("6 waiting" vs 7 cards) and the "no recovery path" on a spent invite link (→ US-2.15, typing a code by hand).

### The gate
HYPOTHESES.md (V1.0, 2026-09-09) lists **21 unbelegte** hypotheses and blocks solver, calendar, veto, notifications and PWA ("between a third and half of the v1 effort") until the prototype test reports. Those five stayed unbuilt. Participation (H-D1) is the thesis itself; honest status: **open**.

### Why "no real casting yet" is a strength, not an excuse
You can say it in one breath: *"Real applicant data is personal data in a sensitive area (housing). I'd rather ship synthetic-only and close the DB-security trade-offs first than test with data the app can't yet protect to my own standard."* It also links the hypotheses slide to the AI stance (S10).


---

### Feedback → change (best story for S5)
| Feedback | Source | Shipped change |
|---|---|---|
| "Where can I change my votes?" | tester 2, Viktor (set aside as "for now"), persona run | revise: change/withdraw your own rating on the candidate card (F5 change 4) |
| "Show who voted how / who has voted" | Viktor | household setting for visible vote authorship (`reveal_vote_authorship`) |
| Hidden password rule blocked joining | Viktor | password requirements shown |
| Notification centre grabbed attention on first join | Viktor | no bell in v0.1 (dropped 09-24; link plausible, not proven) |

## 5. AI features in the product

### n8n applicant-parse workflow (built Oct 9, status: prototype)
- **Job:** paste an applicant's free text (or screenshot) → structured fields (name, age, contacts, attributes) for the capture form to prefill. **A human confirms every field.** Principle P-5: AI structures text, never judges.
- **Shape (16 nodes):** Webhook → Validate input → (400 on invalid) → has image? → text path or image path (Extract chain + `claude-sonnet-5` + structured parser) → **Guard & normalize (deterministic code, no AI)** → Respond 200; errors → 502 = "fall back to manual entry" (P-1).
- **Guard (`scripts/n8n/guard.js`):** `messageRaw` is verbatim input, never a rewrite; name/contact/attribute dropped unless the source backs them; age integer 0–150; only the five contract keys leave. **13 unit tests, 4 fixtures** (incl. a prompt-injection case). I did not run them **[verify before demo]**.
- **Pivot:** assistant picked Mistral → *"I do not have a Mistral API key in the scope of this bootcamp. Only OpenAI and Anthropic."* → Anthropic default, OpenAI variant generated by `build-workflow.ts`.
- **Verification so far:** n8n Cloud on 2026-10-09 with synthetic text only. Not yet tested: OpenAI variant, production webhook with header auth, 400 branch. Real applicant text is blocked until EU processing + DPA + training-off (G-L2/G-B4).
- **Gaps to be honest about:** `scripts/n8n/` and `tests/unit/n8n/` are **untracked** in git and not wired into `src/`. Commit them before presenting.

### flatmate-rag (Exercise 18, separate repo)
LanceDB (local), OpenAI `text-embedding-3-small`, 90 docs → 1,284 chunks (~589 k tokens), **two tiers** (living docs first, historical only when no clear answer; Samuel's design), **no LLM reranking** (*"it circumvents the whole purpose of comparing a RAG against Claude/AI retrieval"*), 20-question golden set, retrieval **hit@5 12/13 (0.92), MRR 0.76–0.83**. Answer step: **Haiku 5.5 18/19 at $0.015 vs Opus 5.5 18/19 at $0.66 (~40×)**; Haiku first scored 17/19 because *Claude's* citation parser missed `[1, EC-5.1]` — *"That was my bug, not Haiku's."* Checks are automatic structure checks, not answer-correctness.

### Service bot
The two `Module 4` folders are workshop repos, not your product. **I found no completed service bot [verify]** — if you did the optional task, I need to know what and where (§10, Q2).

---

## 6. Numbers sheet

| Fact | Value | Confidence |
|---|---|---|
| Span | Aug 18 → Oct 14 2026 (first commit Aug 24; first product code Sep 16) | high |
| Commits / authors | 558 on HEAD / 1 human | high |
| PRs | 67 (63 merged, #28–31 closed probes) | high |
| Peak week | W40: 146 commits | high |
| OpenSpec changes archived | 29 | high |
| Migrations | 37 (0000–0036) | high |
| Tests | ~1,600 cases (line-start grep); 1,783 on the last push | medium |
| Routes / modules | 21 pages / 4 modules | high |
| Docs | 90 files, ≈2.0 MB, 16 ADRs, 21 hypotheses | high |
| Guardrail lints | 9 + 1 vitest-side check | high |
| Memory notes | 35 (+ index) | high |
| Sessions analysed | 133 | high |
| Output tokens, all sessions | ≈35 M (8.6+3.5+4.8+5.1+5.5+4.4+3.4) | **low–medium**: sums of headers; forked/duplicate sessions inflate it |
| Cache-read tokens | ≈9.7 B | low–medium, same caveat |
| Human prompts | >1,000 (≈1,180 incl. slash-command/limit-resume noise) | medium |
| Model use (main thread) | Opus 5/5.5 for planning, Sonnet 5/5.5 for implementation; Haiku only occasional | medium (sub-agent models not in headers) |
| Largest PRs | #4 F1 (+22,211 / 230 files) · #1 spec-kit (+17,210) · #39 capture (+15,340) · #23 (+12,739) | high |
| Copilot rounds | #4 five · #23 five (22 issues) · #17 three · most others one | high |
| CI | 6m17s → median 242 s (3 runs) | high |
| Spec-sweep findings at start of F3/F4/F5 | 24 / 20 / 28 | medium |
| Pre-mortem findings per change | 11–23 | medium |
| RAG | 18/19 vs 18/19; $0.015 vs $0.658; hit@5 12/13 | medium–high |

Chart idea: **output tokens per week** stacked Opus vs Sonnet would show the model split visually. I did not compute per-week values; ask for them if you want that chart.

---

## 7. Quote bank (verbatim; German translated)

Use at most one per slide, short.

- *"Writing a lesson down is not applying it."* — memory `feedback_fix_the_class`
- *"the leak moved"* — pr-review-lessons plan §1
- *"I ran the pre-mortem myself, against my own design, and it missed them."* — memory `feedback_premortem_before_apply`
- *"I feel like implementation time explodes since check-refs.sh checks every spec reference, and speckit generates A LOT of specs."* — 09-18
- *"The mistake came from my spec: its example text listed the ratings strongest first, and the applier built the bar that way."* — Claude, 10-07
- *"I think 3 min 50 is still better than 6 min 20."* — 09-26
- *"I feel like some specs define things that should be architecturally not possible in the first place."* — 09-28
- *"there obviously has been an early misunderstanding which has carried itself through till F4. This is not only code smell, it is a critical error."* — 10-01
- *"I do not want to clarify this topic again."* — 09-29
- *"Think these permissions really through."* — 10-01
- *"bug is not fixed." → "didnt work"* — 09-17
- *"I trusted CSS/static reasoning alone and was wrong."* — Claude, 09-17
- *"Since we have at least a simple vertical slice (even though very rudimentary) now it is the time to pick up tasks & cleanup."* — 10-06
- *"nothing to burn tokens on right now."* — 10-13 (card browsing cut)
- *"I do not want 5 worktrees that I have to merge later."* — 10-12
- *"That was my bug, not Haiku's."* — Claude, 10-12
- *"Yes, but I didn't measure it."* — Claude on sub-agents saving context, 10-09
- *"zweifach erzwungen heißt nicht identisch zweimal"* — "enforced twice does not mean identical twice" (hazards doc, ADR-004)
- *"Sorry, etwas ist schiefgelaufen."* — "Sorry, something went wrong." (the apologetic UI tone you set)
- *"Die Gegenprüfung lief über Begriffssuche, nicht über Bedeutung."* — "The cross-check ran on term search, not on meaning." (08-19)

---

## 8. Mapping to the Final Check-in Guide

The guide's fixed split is 1 / 1 / 3 / 2 / 2 / 1 = 10 min, **not a range**. The suggested 14-slide deck lands at ≈9:45 with buffer; the design brief has the per-slide timing.

| Guide part | Min | Your material | Slides |
|---|---|---|---|
| 1 Idea recap | 1 | WhatsApp pain, who, the loop | S1 |
| 2 Hypothesis | 1 | H-D1, prototype test, honest outcome | S2 |
| 3 Journey | 3 | timeline · slice vs perfectionism · specs: detailed vs rigid · CI live DB vs runner | S3–S6 |
| 4 AI learnings | 2 | the loop & model roles · hazards log · tokens/context | S7–S9 |
| 5 AI features | 2 | AI stance (postponed on purpose) + n8n as screenshots · RAG Haiku vs Opus · optional n8n slide | S10, S11, S10b (optional) |
| 6 Vision | 1 | pilot, v0.2, parser to production, solver | S12 |
| Q&A | 5 | takeaways held on screen + appendix slides A1–A4 | S13 + A |

The guide asks for: **no repeat of earlier check-ins**, **visuals not feature lists**, **honesty about trade-offs**, English, notes-not-script. **Check-in 2 (Oct 8) overlap, which I have now read:** it already covered the near-restart on Sep 18 (3 min → 0.9 s, listed as backup facts), frozen/legacy specs the AI kept obeying, hazard files instead of fixing single instances, "one thin slice in week 1 next time", the 531-commit / 146k-words-of-docs numbers, and the closing line *"Rigour was cheap with AI. Scope discipline was the hard part."* The deck therefore treats those as **follow-through** ("last time I said X; here is what happened since"), and spends its new material on: the persona-vs-human test distinction, the leak moving into the plan, the example-line bug, CI decision with numbers, token budget as scheduler, Haiku vs Opus, and the deliberate AI stance. Check-in 1 (Sep 7) planned the clickable prototype "to identify at what point participation is hindered", which is the thread S2 now closes.

---

## 9. Verify before you present

1. **PR #67 status** — memory says open; `gh pr list` says merged 2026-10-13. Check `gh pr view 67`.
2. **CLAUDE.md is stale** — says `deliberation` isn't built; it is (F4/F5). Don't screenshot that paragraph.
3. **n8n files are untracked** (`git status` shows `??`). Commit them, and run `tests/unit/n8n/guard.test.ts` once.
4. **Optional service bot** — nothing found. See §10 Q2.
5. **Token totals** are sums of per-session headers across forked sessions; present as "roughly 35 M output tokens" or drop the number.
6. **Test count** is a grep approximation; 1,783 is from the last push log.
7. **Quote screenshots** (`research/quotes/Quote 1–3.png`, real WhatsApp messages, names blurred): confirm blur holds on a projector before using; consider retyping the quotes instead.
8. **Viktor** — a named tester in a public artifact: check he's fine with it, or write "a flatmate tester".
9. **Claims that came from Claude's own text** (Vercel docs check, gitleaks action deprecated) are unverified; I left them out.
10. **The 1-of-1,783 flaky failure** is suspected shared-dev-DB, unconfirmed; say "suspected".
11. **Sessions 2b4b/d310, 40548/bc79, 203b/6c14, 60d1/f6d5** share identical start times (forks). Counts in §6 may double-count them.

---

## 10. Decisions: resolved 2026-10-14, plus what is still open

**Resolved (from your answers):**
1. **Hypothesis slide:** scorecard of several hypotheses, product *and* process; H-D1 is one row marked untested with the GDPR/trade-off reason. ✔
2. **Service bot:** not built; not part of the deck. ✔
3. **Names and data:** anonymise but use what exists: real WhatsApp quote crops (anonymised) and the tester notes ("a tester", not a name). ✔
4. **n8n:** screenshots only, no live demo; one core slide that frames the AI stance (S10), one **optional** skippable slide (S10b); AI deliberately postponed in a sensitive housing context. ✔

**Resolved on 2026-10-14 (second round):**
- Through-line: **"Smaller loops, tighter guardrails"**. ✔
- The Oct 12 "tester" was a persona, so Viktor is the only human test; the deck says so. ✔
- Password-requirements fix shipped. ✔
- Check-in overlap is a soft guideline: the guide itself asks for a recap of app and audience; the requirement is a *different focus* (process and learnings, not an extended product demo). ✔

---

## 11. Likely Q&A (5 min) and where the answer lives

| Question | Short answer | Source |
|---|---|---|
| Why Supabase, why no foreign keys? | EU data residency, Auth built-in; no FKs ⇒ every join carries its own `household_id` predicate and RLS is the isolation layer | ADR-006/013, hazards doc |
| Why change spec tools mid-project? | Measured: the cost was Git Bash forking; spec-kit's volume was the real drag; OpenSpec change-sized specs | §3(d) |
| How do you trust AI-written code? | You don't: pre-mortem agent, diff review reading deleted lines, 9 lints, verify gate, human walkthrough, `/code-review high`, Copilot | §3(b) |
| What did the AI get wrong most? | Overclaiming "fixed/verified", reading examples literally, plausible permission shortcuts, German UI copy | §3(f) |
| Why Opus plans and Sonnet applies? | Planning errors are expensive, applying is mechanical; budget; Sonnet sub-agents can be killed by limits | §3(e) |
| Is the n8n workflow in production? | No. Synthetic data only; blocked by DPA/EU processing; human confirms every field | §5 |
| Biggest regret? | Examples in specs; the first role model; shared dev DB for destructive work | §3 |
| Next step? | A real WG pilot to test H-D1 | S12 |
