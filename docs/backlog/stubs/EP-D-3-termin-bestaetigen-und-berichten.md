# EP-D.3 — Lock the date, then inform the ones who were not there how it went · stub

> **Status:** stub · V0.1 · 2026-09-09
> **Band:** `v0.2`
> **Scope lines:** S-21 (confirmation), S-51, S-22, S-46
> **Epic:** EP-D — Organize In-Person Casting
> **Not yet detailed.** This is a placeholder so the goal is visible and its scope lines are
> traceable. A full requirements packet gets written at the start of the band that carries it.

## What this goal is

*Goal: the people who could not attend can participate as if they had been there.* The stories ask
for confirming one slot as the appointment for everyone, confirming it even when not everyone has
reacted, being reminded after the casting to write a few sentences for the others, reading those
notes despite having missed the appointment, and seeing "no notes yet" instead of an empty field.

## Scope lines it carries

| Line | What it is | Band | Note |
|---|---|---|---|
| S-21 | Moderator confirms the `Appointment` from the slot reactions | `v0.2` | Confirmation half only — the resident slot-reaction half belongs to the previous goal |
| S-51 | `AppointmentAttendance` starts as "attended" for every expected attendee at confirmation; a person may self-cancel shortly before; moderation corrects it only as the exception afterwards | `v0.2` | Adds a field/event to the domain model that does not exist there yet |
| S-22 | `CastingNote`s with structured prompts instead of an empty box, plus a visible "write as if the person could read it" notice | `v0.2` | — |
| S-46 | Reminder notification to attendees at the `scheduled → interviewed` transition, asking for a few sentences; suppressed for a recipient whose view of that `Application` is self-redacted | `v0.2` | — |

## What already exists in v0.1

Nothing. Per `docs/backlog/roadmap.md`'s own lane count, EP-D has zero rows in v0.1.

## Before this is detailed

- This band depends on v0.1 shipping first — `02-SRD.md` §5.4 lists v0.1 as v0.2's dependency.
- S-51 names its own precondition: the attendance field/event it needs does not exist in
  `04-Domaenenmodell.md` yet and has to be added there before this can be built.
- S-46 depends on the self-redaction invariant (S-31, already v0.1) to decide who the reminder is
  suppressed for — that check must run correctly before the reminder logic is written.
