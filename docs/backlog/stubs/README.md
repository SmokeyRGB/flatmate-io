# Backlog stubs — index

Eleven stubs, one per epic goal that is **not** in release band `v0.1`. `docs/backlog/roadmap.md`
lists all 15 epic goals with their release lane but contains no `S-` scope-line references — the
only artefact that once mapped board vocabulary to scope lines was an appendix in a story map that
is now archived. So the v0.1 goals have their scope lines recorded in `docs/COVERAGE.md`, and
these stubs restore the same mapping for everything after it.

| File | Epic | Goal | Band | Scope lines |
|---|---|---|---|---|
| [EP-A-2-was-ist-als-naechstes.md](EP-A-2-was-ist-als-naechstes.md) | EP-A | What is next, and who is waiting on me | `v0.2` | S-44, S-29 |
| [EP-A-3-was-passierte-in-meiner-abwesenheit.md](EP-A-3-was-passierte-in-meiner-abwesenheit.md) | EP-A | What happened while I was away | `v0.2` | S-27 (interface), S-28 |
| [EP-B-2-paste-parser.md](EP-B-2-paste-parser.md) | EP-B | Paste it or type it, same card either way (parser half) | `v0.2` | S-08 (parser half), S-39, S-40 |
| [EP-B-3-datenherkunft-rest.md](EP-B-3-datenherkunft-rest.md) | EP-B | Know where the data came from (remainder) | `v0.2` gate, partly `v1.1` | S-33 (automation half), S-34, S-41 (data model half) |
| [EP-C-2-zweiter-durchlauf.md](EP-C-2-zweiter-durchlauf.md) | EP-C | Too many "must haves" get a second pass | `v0.2` | S-11, S-47 |
| [EP-D-1-verfuegbarkeit-erfassen.md](EP-D-1-verfuegbarkeit-erfassen.md) | EP-D | "Tuesdays from 16:00" becomes a real time window | `v0.2`, token page `v1.1` | S-17 |
| [EP-D-2-heatmap-und-vorschlag.md](EP-D-2-heatmap-und-vorschlag.md) | EP-D | "Tue 17:00 — 5 of 7 can make it" | `v0.2`, solver `v1.1` | S-18, S-21 (slot reactions), S-19 + S-20 |
| [EP-D-3-termin-bestaetigen-und-berichten.md](EP-D-3-termin-bestaetigen-und-berichten.md) | EP-D | Lock the date, then inform the ones who were not there how it went | `v0.2` | S-21 (confirmation), S-51, S-22, S-46 |
| [EP-E-1-runde-zwei-und-veto.md](EP-E-1-runde-zwei-und-veto.md) | EP-E | Round two, with a veto that ranks instead of deletes | `v0.2` | S-23, S-24 |
| [EP-E-2-zusage-und-einzug.md](EP-E-2-zusage-und-einzug.md) | EP-E | Make the offer, and survive a no after a yes | `v0.2`, calendar `v1.1` | S-25, S-42, S-16 (already v0.1), S-26 |
| [EP-E-3-zu-und-abgaenge.md](EP-E-3-zu-und-abgaenge.md) | EP-E | People come and go, the round does not leak | `v0.2` | S-32, S-42, S-30 + S-45 |

## Why stubs exist

So no goal is invisible. `docs/backlog/roadmap.md` places every one of these goals in `v0.2` or
later, but without a scope-line trail there was no way to check that placement against
`02-SRD.md` §5.4, or to notice when a goal's stories are already partly built elsewhere. Being
undetailed is fine — every one of these is a placeholder, not a packet. Being untraceable is not.

## What they are not

These are not requirements. Nothing in this folder is buildable, and nothing here has been
reviewed against the domain model, the screen inventory or `GUARDRAILS.md`. `docs/COVERAGE.md` is
the `v0.1` counterpart to this index, and unlike these stubs, it **is** checked — by
`tools/done-check.sh` section 6 and by `GUARDRAILS.md` G-N2.

---

## `Band:` is a product stage, not a sprint

Every stub here carries a **`Band:`** field — `v0.2`, sometimes `v1.1`. That is a **release
band** from `../../02-SRD.md` §5.4: it says *which product stage this goal belongs to*. It is
**not** a sprint number and does not say when anyone will work on it.

The two are offset, and this is where the arithmetic goes wrong:

- `sprint-v0.1` (finished 2026-09-09) was the **planning** sprint for band `v0.1`. No code.
- Band `v0.1` — the vertical slice application → screening → vote → result — is **not built yet**.
- So the next sprint continues on band **`v0.1`**. Band `v0.2` starts once `v0.1` stands.

A stub reading `Band: v0.2` therefore means *"this belongs to the product stage after the
vertical slice"* — not *"this is next up"*. The full explanation is in `../../README.md` §3,
under **Sprintnummer ≠ Bandnummer**.
