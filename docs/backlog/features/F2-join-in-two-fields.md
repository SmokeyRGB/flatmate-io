# F2 — Join in two fields, and land on the one thing to do next

> **Band:** `v0.1` · **Scope lines:** S-03, S-49, S-50, S-48
> **Screens:** **A3 Join by code ⚡** · **B1 Start ⚡** · O16 Members (where the link is shared)

---

## MVP backlog item

**Feature:** Join a household from one shared link with a name and a password, and land directly
on the single thing that is waiting for you.

**User problem:** Joining the process is more effort than opening WhatsApp. Every extra
step — an email, a verification, an app install, a notification permission — is a place to lose
someone who was only mildly willing in the first place. And the people who do get in then face a
screen that does not tell them what to do.

**Expected outcome:** From clicking the link to casting the first vote in under a minute, on
whatever device the resident already owns. Participation stops being gated by onboarding.

**Description:** One join code for the whole household, shared as a link. Registration asks for
name and password only — no email required. After joining, the resident lands on a Start screen
showing exactly one primary action with the reason beside it. The link is the only remaining
access control, so it carries an expiry, a usage cap and a warning where it is copied.

---

## Epic readiness

**What problem are we solving?** Onboarding friction is the first place participation dies, and
participation is the product.

**For whom?** The resident who did not post the ad, does not want to organise anything, and would
answer a WhatsApp poll but not fill in a form.

**What changes if we succeed?** The core metric becomes reachable: >80 % of eligible residents
casting at least one vote (**E-24**). The observation metric "activated residents per household"
separates *"onboarding is broken"* from *"voting is unattractive"* — two failures that would
otherwise look identical.

**What are we *not* doing?** No per-person invitations. No magic-link login (rejected: not
device-bound). No SMS verification. No mandatory email field. No multi-step verification, and no
app-install or notification prompt anywhere in the join path. No passkey offered during
registration — it exists only afterwards, as an optional and revocable add-on.

---

## Activities → Steps → User stories

### Activity 1 — Share the link

**Steps:** open the members page → copy the link → read the warning

- As a moderator, I want to **copy one join link for the whole household**, so that I am not
  managing, sending and chasing one code per person.
- As a moderator, I want a **warning where I copy the link** — *"share this only directly with
  your flatmates; whoever has it can vote"* — so that I understand what I am handing out.
- As a moderator, I want the link to **expire** and to have a **usage cap**, so that a link
  forwarded once does not stay open forever.

### Activity 2 — Join

**Steps:** open the link → see which household → enter name and password → in

- As a resident, I want to **see which household I am joining before I confirm**, so that I know
  the link was not a mistake.
- As a resident, I want to **join with just a name and a password**, so that joining is not
  harder than opening WhatsApp.
- As a resident, I want to **get to my first vote without an email address**, so that nothing
  blocks me before I have done anything useful.
- As a resident, I want to **not be asked to install anything before my first vote**, so that
  the first thing the product does is not ask me for something.
- As a resident, I want to **stay signed in on this device**, so that I do not log in again every
  time a round moves.

### Activity 3 — Land on something actionable

**Steps:** arrive on Start → see one action → act

- As a resident, I want to **see one screen that tells me what to do next**, so that I do not
  have to work out what the group needs from me.
- As a resident, I want to **see exactly one main action, not a list I have to sort myself**, so
  that there is no decision before the decision.
- As a resident, I want to **see "5 of 7 have voted"**, so that I know whether the group is
  waiting on me.
- As a resident, I want to **see where the round stands rather than a blank screen** when nothing
  is open, so that the product does not look broken when I am simply done.

---

## What the implementation must get right

**Only two required fields.** `name` and `password`. `Account.email` is **optional** for resident
accounts and can be added later in settings. The pitch for adding it leads with *"restore access
if you lose your password"* — not with notification convenience.

**Nothing else in the join path.** `03-PRD.md` §4.1.1 carries this as an acceptance criterion:
neither the PWA install banner nor the resident email prompt appears in the join form, nor on any
screen between joining and the first `Vote`. (`02-SRD.md` S-45 was reworded to match; the PRD
reading is the one with the criterion behind it.)

**`ResidentProfile.display_name`** is unique per household among non-`moved_out` profiles and
doubles as the login handle. Two residents called Jonas need disambiguating at join time, not
later.

**Email verification is deferred and never blocks voting.** Two limits still hold: no
deliberation-related content by email before verification, and no notification delivery to
unverified addresses.

**S-49 — the link is the only access control left.** Since S-03 dropped the mandatory email and
**U-22** removed the resident-visible member list and the right to remove members, nothing else
guards entry. `join_code_expires_at` (7 days suggested), `join_code_max_uses` (pre-filled with
the number of residents still missing) and the share-page warning are therefore
*"Voraussetzung, nicht Verbesserung"*. Existing rotation (**G-A5**) stays; this adds to it.

**Never log the join code** and never put it in a query string (**G-A5**).

**S-48 — exactly one precedence rule.** Tasks with a real due date first, sorted by that date;
tasks without one after them in a fixed order. In the slice only one task type is open (the
vote), so the rule falls back to its fixed order — implement it anyway, because the fallback is
what v0.2 extends. The PWA banner is **never** part of this sorting.

---

## Open question this feature will hit

**P-O-08 — how long does "stay signed in" last?** Still open in `03-PRD.md` §8. It needs an
answer before this ships, because the checkbox is pre-checked. A defensible default: a long-lived
session bound to the device with server-side revocation on `moved_out`, since **S-32** requires
access to end the day someone moves out.

---

## Risks

| Risk | Consequence | Handling |
|------|-------------|----------|
| A resident joins, votes once, and cannot get back in after clearing cookies | Looks like data loss, kills trust, and the household reverts to WhatsApp | Offer the email **after** the first vote, framed as password recovery. Accept that some residents will be single-session in the slice |
| The join link is forwarded outside the flat | Someone outside the household votes, and the denominator is wrong | Expiry plus usage cap plus the warning. This is social, not technical, protection — and the docs are explicit that it must never be presented as hardening |
| Start screen shows nothing on a quiet day | Reads as broken | Empty state shows the round's standing, never a blank surface |
| Two residents pick the same display name | Votes become unattributable in the feed and the member list | Uniqueness per household enforced at join, with a clear inline error |
