# F5 — A ranking you can check, hidden until you have voted

> **Band:** `v0.1` · **Scope lines:** S-12, S-13, S-14, S-16, S-31
> **Screens:** **D1 Ranking — "waiting for votes" ⚡** · D2 Candidate detail · D3 My own application

---

## MVP backlog item

**Feature:** Turn the group's votes into a ranking nobody can dispute — revealed to each resident
only after they have voted themselves, and always showing its own arithmetic.

**User problem:** Votes counted by hand in a group chat are disputable, and seeing the group's
opinion before forming your own bends it. Anchoring and bandwagon effects are well documented,
and in a flatshare they mean the loudest early opinion decides. Meanwhile a candidate with one
enthusiastic vote can look like the front-runner.

**Expected outcome:** A ranking the household trusts, produced from independent votes, that can
be recomputed by anyone who asks how. Candidates without enough votes are visibly waiting rather
than silently winning.

**Description:** A score as the mean of vote weights on a 0–100 scale, sortable. Results — score,
distribution, vote count and rank position — stay hidden until the viewing resident has voted on
that candidate in the current stage. Candidates below quorum sit in their own *"waiting for
votes"* section with no rank and no score. Marking someone `invited` produces a ready copy-paste
text including the data-protection notice; the application never sends anything itself. Your own
application shows you only its factual part, with an honest note explaining why.

---

## Epic readiness

**What problem are we solving?** Hand-counted votes are disputable, and open voting is not
independent voting.

**For whom?** The whole household — and specifically the resident who does not want to be in the
deciding position but keeps ending up there.

**What changes if we succeed?** Two of the three assumptions presented at the check-in become
testable: that hidden results increase independent voting, and that a ranking with disclosed
arithmetic is accepted as legitimate (**P-3**).

**What are we *not* doing?** No weighted votes per person, no delegation, no abstention as its own
level (S-12 out-of-scope). No quorum as a hard block on a state transition, and no high threshold
that leaves the ranking empty for the first few days (S-13 out-of-scope). No permanently anonymous
voting and no permanently hidden results (S-14 out-of-scope). No sending by the application, no
portal batch contact, no AI-worded replies (S-16 out-of-scope). **No AI ranking, scoring,
recommendation or best-fit suggestion, ever** (**P-5**).

---

## Activities → Steps → User stories

### Activity 1 — See the ranking, once you have earned it

**Steps:** finish your pass → the ranking reveals → read it

- As a resident, I want to **see a candidate's score only after I have voted on that candidate**,
  so that the group's opinion does not become my anchor.
- As a resident, I want to **see the ranking sorted**, so that the group's collective view is
  legible at a glance.
- As a resident, I want to **see how the score is worked out, not just the number**, so that I can
  check it rather than trust it.

### Activity 2 — Know what the ranking does not yet say

**Steps:** look below the ranking → see who is still waiting

- As a resident, I want to **see candidates with too few votes in a separate "waiting for votes"
  section**, so that a single enthusiastic vote does not look like a front-runner.
- As a resident, I want to **see how the four ratings split for one candidate**, so that "62" is
  not the only thing I know about a person.

### Activity 3 — Act on the top of the ranking

**Steps:** mark as invited → copy the text → send it yourself

- As a moderator, I want to **mark a candidate as invited**, so that the state of the process is
  recorded where everyone can see it.
- As a moderator, I want a **ready text including the data-protection notice** to paste into
  whichever channel the applicant used, so that the household's information duty is dischargeable
  in practice.
- As a moderator, I want to **see every candidate's current stage in one place**, so that nobody
  is forgotten between states.

### Activity 4 — Not read the group's opinion about yourself

**Steps:** open your own application → see the factual part → read why

- As a resident, I want to **never read a vote that was written about me**, so that moving in does
  not start with reading the group's deliberation about me.
- As a resident, I want to **see only the factual part of my own application, with an honest note
  why**, so that the gap is explained rather than looking like a bug.

---

## What the implementation must get right

### The formulas, verbatim from `04-Domaenenmodell.md`

**Score (§8.1)** — the single most misimplemented function in the chain:

```text
WEIGHTS = { no: 0, rather_not: 1, good: 3, definitely: 5 }   // default, deliberately non-linear

function score(application, stage, round) -> int | NO_SCORE
    weights = round.settings_snapshot.scale_weights     // NOT the current settings
    votes   = score_votes(application, stage)           // former members included
    if |votes| = 0:
        return NO_SCORE                                 // no score, not 0 — not the same thing
    mean = ( Σ_{v ∈ votes} weights[v.value] ) / |votes|
    return round_half_up( mean / max(weights.values) × 100 )   // 0…100
```

Two traps, both worth a protected test:

1. **`NO_SCORE` is not `0`.** A candidate nobody has voted on is not a candidate everyone
   rejected. The docs say it outright: *"kein Score, keine 0 — das ist nicht dasselbe"*.
2. **Read the snapshot, not live settings.** Otherwise changing a weight silently rewrites every
   historical score.

**Quorum (§8.3)** — `quorum_share` default `0.5`, meaning **at least half**, not more than half:

```text
function quorum_reached(application, stage, round) -> bool
    quorum_numerator(application, stage)
      >= ceil( settings.quorum_share × quorum_denominator(round) )
```

7 eligible voters ⇒ 4. 6 eligible voters ⇒ exactly 3. **Quorum is display, never a block** — no
state transition is prevented by it.

**Ranking and tie-break (§8.3)** — seven keys, ascending:

```text
( veto_penalty(a, stage),                  // 1. vetoed block sinks
  − score(a, stage, round),                // 2. score descending
  − count_value(a, stage, 'definitely'),   // 3. more "Must have" wins
    count_value(a, stage, 'no'),           // 4. fewer "No" wins
  − |score_votes(a, stage)|,               // 5. broader vote base wins
    a.created_at,                          // 6. who applied first
    a.id )                                 // 7. pure determinism anchor
```

In v0.1 `veto_penalty` is always `0` — `Veto` only exists at `stage = offer`, which is v0.2. Keep
the key in the tuple so the sort does not change shape later.

### Hidden results

`hide_results_until_voted` (S-14), **default on**. Until the viewing profile has cast a vote on
that candidate **in the current `Vote.stage`**, four things stay hidden: the score, the vote
distribution, the vote count, and the rank position. **Enforced server-side** — never merely
hidden in the client, and never leaked through an aggregate endpoint.

### Self-redaction (S-31)

Any deliberation artifact whose `Application.became_resident_id` equals the viewing profile is
**permanently invisible** to that profile, across every channel: API, feed, exports. In v0.1 that
means `Vote`s, the aggregate and the rank position; `Veto` and `CastingNote` arrive in v0.2.
Doubly enforced (policy objects **and** row-level security), and tested through both (**G-C7**).
Screen **D3** is the honest surface for it: your own card shows the factual profile plus a note
saying why the rest is missing.

### The invite text (S-16)

A **copy-paste aid for the household**, including the data-protection notice. The application
never sends. `03-PRD.md` §3 and `02-SRD.md` §5.3 both keep *"Versand durch die Anwendung"* on the
permanent out-of-scope list.

### A wording rule that applies to this screen more than any other

**C-10** — interface text may be promotional **about the process**, never evaluative **about a
person**. Allowed: *"Everyone has voted — you can decide who to invite"*, *"Lea got the most
points"*. Never: *"3 promising candidates"*, *"Lea is a good fit for you"*, *"We recommend Lea"*.
Any statement about several candidates must map to a threshold that actually exists
(`quorum_share`, favourite budget, veto budget, round deadline) and be recomputable by tapping it.

---

## Deferred detail worth knowing

**S-32 (votes from former members)** is v0.2, and its UI marker *"1 Stimme von einem ehemaligen
Mitglied"* comes with it. The semantics are subtle and asymmetric, so implement the branch now
even though it is inert in the slice: a former member's vote **stays in the score** but drops out
of **both numerator and denominator** of the participation and quorum displays. In v0.1 nobody
moves out, so the branch never fires — but building `score_votes()` without it means rewriting the
function later.

---

## Risks

| Risk | Consequence | Handling |
|------|-------------|----------|
| `NO_SCORE` rendered as `0` | An unvoted candidate appears unanimously rejected, and the household acts on it | Distinct type at the boundary, not a nullable int rendered with a default. Protected test |
| Hidden results enforced only in the UI | The score is one network tab away, and the product's central assumption is silently void | Server-side gate on every read path, including aggregates |
| Quorum treated as a block | The ranking stays empty in the first days, which demotivates exactly the participation it depends on — the documented reason 2/3 was rejected | Display only. Transitions stay available throughout |
| Self-redaction leaks through the aggregate | The affected person reads the group's opinion about them, which is worse than the original bug | **V-4** covers the aggregate rule in the policy layer specifically because the row rules do not |
| The ranking is read as advice about people | Drifts toward the AI-judgement line **P-5** exists to hold | **C-10**, plus tap-to-recompute on every number |
