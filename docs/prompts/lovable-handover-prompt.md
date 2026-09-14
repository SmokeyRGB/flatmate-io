> **What this is.** A copy-paste handover prompt for Lovable, to kick off the first clickable
> prototype of Flatmate.io. It is deliberately short — Lovable is meant to pull the rest of its
> context from the linked repo folder, not from this file. If something here and the repo
> disagree, the repo wins.
>
> **Status:** V1.0 · 2026-09-14 · Samuel Zink (@SmokeyRGB)

---

## Prompt to paste into Lovable

```
I'm building Flatmate.io — a web app that replaces the chaotic WhatsApp-plus-Doodle process
shared flats (WGs) and housing projects use to cast and vote on new roommates.

THE PROBLEM

In shared flats with 5+ residents, people move out and in several times a year. Finding a new
roommate today is a 13-step process spread across a listing portal, a WhatsApp group, a
scheduling tool, and notes on the fridge. Two things break as a result:
- All the organizing work sticks to one person: whoever posted the listing. They copy
  applications into the chat, manually count reactions to figure out who's a yes, chase people
  for availability, and write every message.
- Everyone else's participation collapses, not because they don't care, but because keeping up
  is inconvenient: after a few days away from the chat, you can't find the application anymore,
  don't know if a vote already happened, and say nothing rather than something wrong. A handful
  of people who happened to be online end up deciding who moves in with everyone else.
Two extra failure modes a chat can't fix: someone who just moved in still sits in the group
where they were discussed and judged two weeks earlier — and someone who moved out keeps
reading along.

WHO IT'S FOR

Primary target: shared flats and housing projects with 5+ residents (WGs), where this happens
multiple times a year. Five user types matter:
- Household account — the admin login for the flat (email + password). Manages the account,
  does NOT vote.
- Moderator — a resident who's been given rights to run the round (create it, change
  application status, close voting).
- Resident — a normal flatmate. Votes, sees the ranking, writes casting notes.
- Former resident — moved out. Loses access immediately; their past votes stay on record but
  no longer count toward quorum.
- Applicant — someone applying for a room. Never has an account and is never forced to create
  one — every piece of information about them can always be entered by hand.

CORE IDENTITY — five non-negotiable design principles

1. Channel-neutral — anything that could arrive as a link must also be enterable by hand.
   No feature may require an applicant to use the app.
2. Device-neutral — nobody is excluded because of the phone or browser they own. Mobile-first,
   password as the universal login method.
3. Legitimacy over optimality — rankings and suggestions must be explainable in plain terms.
   No hidden scoring, no black-box logic.
4. Reversible — every state a room or application is in can be walked back, and that's logged,
   not treated as an error case.
5. No AI judgment of people — never use AI to rate, rank, recommend, or decide about an
   applicant. This is a hard line, not a style preference.

WHAT THIS FIRST PROTOTYPE SHOULD DO

This is a UX prototype to test the core flow, running on made-up/seed data — not a production
build. It should let a small team click through one full loop:

1. Open a casting round for specific rooms in the flat.
2. Join the round in two fields (name + a couple of basics) and immediately see "the one thing
   to do next" — no email verification, no install step, no friction before the first vote.
3. Capture an application by hand (a simple form: name, age, contact, free-text message) and
   have it show up for everyone in the flat.
4. Screen applications one at a time, card by card, with a four-point scale: No / Rather not /
   Good fit / Absolutely — this is the main interaction of the whole app, it should feel fast
   (a few taps) and satisfying.
5. Show a ranking screen where results stay hidden until you've cast your own vote (a real
   setting, defaulting to on), candidates without enough votes yet are shown separately under
   "waiting for votes" instead of being ranked, and the ranking itself is a plain average score,
   never a black box.

Keep the four screens that matter most polished: the resident home screen ("what's due right
now"), the screening/voting screen, the ranking screen, and the organizer dashboard for setting
up a round. Everything else can be minimal.

OUT OF SCOPE for this prototype (do not build these yet)

Scheduling/availability grids, appointment booking, a second voting round with veto, offers and
move-in, real notifications or push, an installable PWA, real authentication hardening or
row-level security, retention/deletion automation, GDPR export tooling, and any AI-based text
parsing. All of that is real for the product but not for this click-through.

LANGUAGE

The documents in the repo are German (this is a German-market product); please write all
user-facing UI text in German. "Household" is always labeled "WG" in the interface. Code,
component names and variables can stay in English.

REPO FOR FULL CONTEXT

The full planning and specification trail lives here — use it as the source of truth for
anything this prompt simplifies or leaves out:
https://github.com/SmokeyRGB/dl-school-repo/tree/dev/flatmate-plan-sprint-v0.2/Ideas/Flatmate.io/docs

Inside that folder, if you want more depth before or while building, in this order:
- README.md — how the whole doc set is organized, read this first
- 01-Problem-Framing.md — the problem and user groups in full
- backlog/README.md — the exact prototype-sized feature cut (features F1–F5) this prompt is
  based on
- backlog/requirements/F1..F5-requirements.md — one file per feature, each self-contained
- screens/B-start.md, C-beteiligung.md, D-casting-tab.md, O-organisation.md — the four core
  screens named above, described in detail

Please start by proposing a short plan (screens + main data model) based on this prompt, and
check it against backlog/README.md before generating code.
```
