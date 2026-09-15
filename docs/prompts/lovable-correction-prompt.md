> **What this is.** A copy-paste correction prompt for Lovable, listing what the Flatmate.io
> prototype does differently from the spec in `docs/`. It comes out of full testing passes
> (resident, moderator and adversarial personas, plus two further usability-test sessions in
> `coursework/exercise-12/`) against the live prototype. This prompt only lists *what* to
> change; if a fix needs a design decision this doesn't cover, follow `docs/` over this file.
>
> **Status:** V1.2 · 2026-09-15 · Samuel Zink (@SmokeyRGB) — round 2 added below. That second
> pass also confirmed several round-1 items are now fixed: the real invite-link join flow shows
> the household name up front, asks for only name + password + optional email (with a one-line
> explanation of what skipping email costs you), and the "Warten auf Stimmen" section is now
> properly split from the ranked list with names shown. Nothing further needed on those. Three
> open questions round 2 originally left undecided have since been resolved and folded into
> round 2 directly: a "well done" message on finishing a voting pass is now item 5; not
> advertising vote-editing during the pass, and not flagging thin applications, are both now
> recorded as firm decisions (in `screens/C-beteiligung.md` and `03-PRD.md` content rule C-10
> respectively) rather than open questions.

---

## Round 1 — prompt to paste into Lovable

```
I tested the current Flatmate.io prototype against the spec in the linked repo and found a
list of things that need fixing. Please work through these in order — the first group is
access-control and data-safety issues, which matter most; the rest is grouped by area.

1) ACCESS CONTROL — FIX FIRST

- The household login (the "WG-Konto" account — administers the flat, doesn't live there)
  can currently reach the screening and ranking screens, and the server sends it full round
  data (settings, quorum, weights, room list) in its API responses. This account must never
  be able to read casting-round content or vote, and that must be enforced server-side, not
  just hidden in the UI. Compare: a former-resident account correctly gets `round: null` back
  from the server today — the household account should get the same kind of refusal.
- Right now every account — plain residents, the household account, everyone — sees the same
  four navigation tabs: Zuhause, Sehen, Rangliste, Organisation. Cut this to two tabs for
  residents: "Start" and "Casting" (Sehen + Rangliste can live together under Casting).
  "Organisation" should not be a persistent tab at all — move it into an account/profile menu,
  and only show it there for accounts that actually have moderator or admin rights.
- The household account's row in the member list is labeled "Stimmberechtigt" (voting
  eligible) — the same label a real resident gets. It should say something that makes clear
  this account cannot vote.
- Two separate accounts can currently register with the exact identical display name (tested:
  registered the same name twice, both succeeded). Reject a join attempt if the name is
  already taken by an active member.
- Name matching for that uniqueness check must ignore leading/trailing spaces and letter case
  — right now registering " JONAS " (spaces, all caps) succeeds even though a resident named
  "Jonas" already exists, which lets someone impersonate a real flatmate. Trim and
  case-normalize before comparing.

2) SIGN-UP AND LOGIN

- There is currently no way to register a brand-new household — only an existing demo
  household can be logged into or joined. Add a real "create a new household" flow: email +
  password, with a notice that the email will be shared with future household admins, shown
  before the form is submitted.
- The generic /auth "Einsteigen" tab (not a real invite link) has an E-Mail field that is
  actually required (submitting it blank throws a browser validation error) — it must be
  genuinely optional there too, matching the real invite-link join form.
- Add a "stay signed in on this device" checkbox to the generic /auth join form, pre-checked
  by default, matching the real invite-link join form.
- There's a "Kurzinfo (optional)" bio field on the generic /auth join form that isn't part of
  the intended design. It's harmless since it's genuinely optional, but remove it unless
  there's a reason to keep it.

3) SCREENING / VOTING (the "Sehen" pass — the single most-used screen in the app)

- The four rating buttons can't be used from the keyboard at all right now — confirmed a
  button can hold real keyboard focus, but arrow keys, number keys, Enter and Space all do
  nothing; only mouse clicks work. Make the rating buttons keyboard-operable: arrow keys or
  number keys to move between the four options, Enter to confirm.
- After rating the last card in a pass, the "Weiter" button currently does nothing — it should
  take the resident straight to the ranking screen.
- If someone navigates straight to the screening screen after they've already rated
  everything, it silently reopens card 1 for editing instead of saying there's nothing left to
  do. (The home screen already gets this message right — "Nichts wartet mehr auf dich — alles
  gesehen." — reuse that same message here.)

4) RANKING SCREEN

- Ranking cards currently aren't clickable in some places — make every card open a detail view
  with the candidate's rating breakdown and current status.

5) ORGANISER / MODERATOR SCREENS ("Organisation")

- The Organisation screen currently shows everything at once — the whole round card, the
  entire member list, and the entire application pipeline, all expanded on one page. Change it
  to a task list: one primary action at the top with a reason it's first, up to three more
  items below, and everything else collapsed behind a "show more" — not a control panel.
- There is no screen for managing rooms — rooms currently only show up as plain text inside
  the round card and inside the "create round" dialog (a third room, "Zimmer 1", is only
  visible in that dialog and nowhere else). Add a dedicated Rooms screen: list with status,
  and the ability to create/edit a room.
- There is no settings screen for the voting rules (rating weights, quorum share, hidden-
  results toggle, favourite budget) — add one. And while any round is open, changing these
  values from that screen must be refused, with a message naming the open round as the reason.
- The member list is missing join date and contact info for each member, and there's no way to
  reactivate someone who's marked "ausgezogen" (moved out) — a member in that state currently
  has zero action buttons. Add both.
- Add a join-code/invite-link feature to the members screen: a share action that shows, all
  together, (a) a warning like "Teile diesen Link nur direkt mit deinen Mitbewohnenden —
  niemals öffentlich. Wer ihn hat, kann mitstimmen.", (b) an expiry date (default ~7 days,
  extendable with one tap), (c) a usage-cap on how many times it can be used. The code itself
  must never appear in a URL query string.
- Marking an application "invited" ("Einladen") currently changes its status instantly with no
  confirmation and produces no message afterward. It should show a confirmation step (like the
  other status changes already do) and, on confirming, generate a ready-to-copy invitation
  message that includes the data-protection notice — no send button, just text to copy.
- There is currently no way to delete an application at all — checked every status (new, seen,
  invited, withdrawn, archived) and none of them offer a delete action; "archiviert" is a
  complete dead end. Add a delete action, available at any status, that requires a confirmation
  naming the applicant being deleted.
- Closing a round ("Voting schließen") currently applies instantly with no confirmation, and
  the "Runde öffnen" (reopen) button that appears afterward is permanently disabled — there is
  no way back once a round is closed. Add a confirmation step before closing, and make the
  reopen button actually work.
- Status-change confirmations are inconsistent — most transitions ask "are you sure" before
  applying, but "Einladen" and "Voting schließen" don't. Make this consistent: any status
  change or round-state change should ask for confirmation the same way.

6) SMALLER FIXES

- The "Stimmen insgesamt" (total votes) number on the resident home screen currently shows
  only the signed-in person's own vote count, not the household's real total. Fix the
  calculation so it counts every vote cast in the round, not just the viewer's.
- Add a participant list: tapping something like "5 von 7 haben abgestimmt" should open a
  simple screen listing just the names of people taking part in this round — no actions, and
  it should not show who has or hasn't voted yet.
- A former resident's ranking screen currently shows two contradictory lines at once ("no
  active round" and "results hidden until you vote"). Show only the one that actually applies.
- When creating a round with no rooms selected, the "Eröffnen" button just stays disabled with
  no explanation. Add a message naming what's missing (e.g. "Wähle mindestens ein Zimmer").

Please confirm you've understood each section before making changes, and flag anything above
that conflicts with something else already in the linked repo — the repo is the source of
truth if the two disagree.
```

---

## Round 2 — prompt to paste into Lovable

> Comes out of two further usability-test sessions (`coursework/exercise-12/`): a first-time
> resident joining through a real invite link, and a moderator manually capturing an
> application. Only the items below have a matching decision already made in the linked repo —
> a few other frictions those tests surfaced are deliberately left out of this prompt (see the
> note at the end).

```
A follow-up round of fixes, from two more usability tests against the prototype. Each item
below is checked against a specific decision already made in the linked repo, cited so you can
verify it — please don't reinterpret these, just close the gap between the current behaviour
and the cited decision.

1) EXHAUSTED INVITE LINK HAS NO WAY FORWARD

When an invite link has hit its usage limit, the app currently shows "Dieser Einladungslink
ist aufgebraucht" and stops there — no next step. The spec requires every rejected join
attempt to say which of the three reasons applies (expired / used up / replaced) AND direct
the visitor to ask a flatmate for a current link (F2-requirements.md FR-2.8; the same pattern
for an expired code is spelled out in screens/A-zugang.md, screen A3: "Dieser Beitrittscode ist
abgelaufen." + a hint to ask in the household for a new one). Add that same second line to the
"used up" message — something like "Frag in der WG nach einem neuen Link."

2) DISABLED "NEUE RUNDE" BUTTON GIVES NO REASON ON TAP

The "Neue Runde" button is correctly disabled while a round is already open, but the
explanation ("Es läuft schon eine Runde — schließe sie zuerst") only shows as a hover tooltip.
On a touch device there is no hover, so tapping the disabled button gives no feedback at all.
The spec requires Organisation screens to stay operable on the phone for their core actions
(03-PRD.md §4.1.0), and requires any blocked action to show why in plain visible text rather
than just being locked (screens/rahmenwerk.md §6, the "Keine Berechtigung" state: "Erklärung
warum plus wer helfen kann, statt einer bloßen Sperre"). Make the reason permanently visible as
text next to or under the button, not a tooltip.

3) RESIDENT HOME SCREEN SHOWS THE WRONG APPLICATION COUNT

After a moderator manually captures a new application, the resident home screen's "ALS
NÄCHSTES" card still shows the old, smaller number (e.g. "6 Bewerbungen warten auf deine
Stimme") even though the actual screening deck that opens correctly has one more card ("Karte 1
von 7"). The number on the home screen and the number of cards in the deck must come from the
same query — right now they don't agree, which undermines the "one accurate source of truth"
the whole product is meant to replace WhatsApp with. Fix the home-screen count to reflect the
same open-application set FR-4.1 defines for the deck itself.

4) CAPTURING AN APPLICATION DOESN'T LAND WHERE THE CONFIRMATION SAYS IT DOES

After submitting the manual application-capture form, the toast correctly says "Bewerbung
erfasst — sie ist sofort in der Runde," but the app then returns to the Organisation screen
with the round/application section collapsed — so the moderator has to know to re-open that
section to actually see the application they just added. The spec's rule for this whole screen
is that a task leads directly to the result, never to a list you then have to go find it in
again (screens/O-organisation.md, hard rule 1). Land the moderator on the expanded round/
application list — showing the newly captured application — right after a successful submit,
instead of the collapsed default view.

5) REWARD FINISHING A VOTING PASS

Once a resident has cast their last vote in the round, the home screen ("dashboard") should
feel like a small win, not just a status update. Right now the "ALS NÄCHSTES" card, once
nothing is left to vote on, only ever shows the neutral round-standing text (e.g. "1 Bewerbung
hat genug Stimmen — Die WG hat entschieden"). Add a short, warm acknowledgement ahead of that
text specifically for this moment — something like "Stark gemacht — du hast alle Bewerbungen
bewertet!" — the exact wording is not fixed, use your judgement, just make it read as a genuine
"well done," not another task line. This only applies to the "I just finished voting on
everyone in this round" case — other empty states (e.g. no round open, no applications yet)
keep the plain round-standing text as before, with no added celebration line. This is recorded
as a decision in screens/B-start.md, screen B1.

---

Three things that came up in earlier testing are now decided — please build exactly one of
them (above, item 5) and leave the other two alone:

- **Decided: do NOT advertise, anywhere in the screening pass (C1), that a vote can be changed
  later.** The capability itself stays (votes remain editable from the candidate detail view,
  D2, same as today) — this is only about not surfacing or hinting at it during the pass
  itself. Reason: advertising it would invite residents to rush through voting just to unlock
  the ranking (results reveal per-candidate immediately after your own vote), then come back
  and adjust their votes to match what their flatmates already chose — exactly the anchoring
  effect hidden results exist to prevent. If anything in the current build hints at
  vote-editing during the pass (a badge, a footnote, a tooltip), remove it. Recorded as a
  decision in screens/C-beteiligung.md, screen C1.
- **Decided: do NOT flag thin or generic-sounding applications to voters.** No "this
  application has less detail than others" indicator, badge, or sorting cue of any kind. This
  was already implied by the existing rule that interface text may never be evaluative about a
  person (03-PRD.md content rule C-10) — this decision just closes it explicitly. No build
  needed here.

One thing is still genuinely open — please don't build anything for it yet:
- Whether the ranking's "Warten auf Stimmen" section should say "you already voted, the WG
  just hasn't reached quorum yet" for candidates the viewer has already rated, versus leaving
  it as just a vote-count-vs-needed label (today's behaviour).

Two other things that looked like gaps in testing turned out to already match a decision
already made in the repo, so please leave them as they are:
- The manual application-capture form doesn't ask which room an applicant is interested in.
  This is intentional — a room is only assigned once an offer is made (O12), not at capture
  time; applications aren't room-scoped at intake.
- The moderator's own "Zur Organisation" task sits below the resident-voting task on the home
  screen. This is intentional too — screens/rahmenwerk.md §2.3 specifies the moderation bridge
  as a single line at the *foot* of the personal task list, never promoted above it.
```
