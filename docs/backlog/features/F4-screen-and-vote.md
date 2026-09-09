# F4 — Screen the applications card by card, four ratings

> **Band:** `v0.1` · **Scope lines:** S-09, S-10
> **Screens:** **C1 Screening pass ⚡** — the most frequent action in the whole product

---

## MVP backlog item

**Feature:** Go through every open application in one sitting, giving each one of four ratings,
with the weights shown before you use them.

**User problem:** Voting happens in a group chat, so it is neither fast nor independent. The
people who stay on top of the conversation end up deciding, and the effort of forming an opinion
on twenty applications scattered through a chat log is enough that most residents stop trying.

**Expected outcome:** A resident gets through all open applications in one sitting and knows what
their vote meant. From opening the app to the first vote in under a minute.

**Description:** One card per open application, one rating per card, four options: **No · Rather
not · Like · Must have**, worth 0 · 1 · 3 · 5. The weights are disclosed in the interface before
they are used. A vote can be changed while the round is open. Nobody is ever asked to vote on
their own application.

---

## Epic readiness

**What problem are we solving?** Forming and recording an opinion costs more effort than most
residents will spend, so the decision defaults to whoever is most online.

**For whom?** Every eligible resident — especially the one who would answer a poll but not read
back through a chat.

**What changes if we succeed?** The core metric moves: >80 % of eligible residents casting at
least one vote (**E-24**). The second-order metric — median votes per application — shows whether
participation spreads evenly or dies after the first three cards.

**What are we *not* doing?** No swipe gestures as the *only* input, and no batch rating (S-09
out-of-scope). No 5- or 10-point scale: people cluster in the middle and stop differentiating,
which is the whole reason the scale is four. No separate favourites round — "Must have" carries
that signal. No points-budget voting procedure (that is a v1.1 option). No second pass yet.

---

## Activities → Steps → User stories

### Activity 1 — Work through the deck

**Steps:** open from the Start CTA → card → rate → next card → done

- As a resident, I want to **go through the open applications card by card in one sitting**, so
  that screening is one task and not twenty.
- As a resident, I want to **pick one of four ratings for each applicant** — No, Rather not,
  Like, Must have — so that rating is a single tap and not an essay.
- As a resident, I want to **see what each rating is worth before I use it**, so that I am not
  guessing at the arithmetic my vote feeds into.
- As a resident, I want to **see "nothing is waiting for you" when I am done**, so that finishing
  is legible as finishing.

### Activity 2 — Change your mind

**Steps:** return to a card → change the rating → it counts

- As a resident, I want to **change my vote while the round is still open**, so that a first
  impression is not binding.

### Activity 3 — Not be put in an impossible position

**Steps:** the deck is built → your own application is not in it

- As a resident, I want to **never be asked to vote on my own application**, so that the product
  does not hand me a decision about myself.
- As a resident, I want to **pick up new arrivals next time rather than have the deck shift
  under me**, so that the pass I started is the pass I finish.

---

## What the implementation must get right

**The scale, exactly.** Non-linear on purpose, because the decision boundary sits between *Rather
not* and *Like*:

| Rating (UI, English) | German label | Weight |
|---|---|---|
| No | Nein | **0** |
| Rather not | Eher nicht | **1** |
| Like | Finde gut | **3** |
| Must have | Unbedingt | **5** |

The weights come from `round.settings_snapshot.scale_weights` (see F1) and are **disclosed in the
UI** — that disclosure is **P-3**, not decoration.

**`Vote` uniqueness:** one row per `(application_id, resident_profile_id, stage)`. Round 1 is
`stage = invite`. Round 2 (`stage = offer`) reuses the same table and is v0.2.

**Revisability is part of S-10**, not a follow-up feature: *"revidierbar innerhalb derselben
`Vote.stage`, solange die `CastingRound` `open` ist"*. Withdrawal is `withdrawn_at`, not a delete.

**"Must have" is the favourite signal.** There is no separate favourites-picking round after
screening (**E-07**). The short second pass at budget overrun (S-11/S-47) is a different
thing — it re-rates the same cards in the same card pattern — and it is v0.2.

**Self-redaction applies here first.** The deck must exclude any `Application` whose
`became_resident_id` is the viewing profile — enforced in the policy layer **and** in row-level
security (**S-31**, **S-36**), not by filtering in the client.

**New applications mid-pass** do not enter the deck you are already working through
(`P-O-05`, closed). They appear in the next pass.

**After the last card, never an empty screen.** In the slice the last card leads to the ranking
(F5). In v0.2 it may lead to the second pass first.

---

## Risks

| Risk | Consequence | Handling |
|------|-------------|----------|
| The pass is long enough that residents abandon it midway | Participation concentrates on the first few cards, which the "median votes per application" metric will show | Progress is visible, order is stable, and partial passes count — every saved `Vote` stands on its own |
| Weights are shown but the score is computed differently | **P-3** breaks, and with it the legitimacy the whole ranking depends on | One source: the snapshot. F5's `score()` reads the same values the UI displayed |
| Client-side filtering of one's own application | The row is still fetched, so the invariant is one bug away from leaking — and it fails silently | Enforce server-side, twice, and test through raw SQL (**G-C7**) |
| Someone changes a vote after seeing the result | Anchoring, which is exactly what hidden results exist to prevent | Legitimate and allowed: results are only revealed after your own vote (F5), so the anchor is your own opinion |
