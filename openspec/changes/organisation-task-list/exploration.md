# Exploration notes (2026-10-12)

Three Sonnet persona agents walked the live app on a worktree dev server (port 3001) against throwaway synthetic households on flatmate-io-dev: Brigitte (household account, fresh WG), Horst (moderator, before the first round), Mehmet (moderator taking over mid-round, real clicks, mobile). Each got only a persona, goals and guardrails.


## P1 Brigitte — household account, fresh WG (clarity 2/5, appeal 3/5)
- O1 only offers "Tritt deiner WG selbst bei / Jetzt beitreten" (founding link). Opposite of her goal; jargon (Gründungslink, Moderator:in) unexplained; she was afraid to press it.
- O1 never changes after room + 3 profiles added -> no progress, no "what next".
- Zimmer/Mitglieder/Einstellungen are tiny underlined links under the card; avatar menu hidden behind name.
- No discoverable way to delegate the search (make Alex moderator) — only the founder link "Nur für dich".
- Members: profile and invite are 2 disconnected steps; invite code shown twice; link far down in list; new profiles in odd order (Jonas, Alex, Mia).
- Rooms: "Geplant/Offen" dropdown + separate "Status ändern" unclear (does Offen notify / start the search?); red "Entfernen" next to harmless actions; no confirmation on create.
- Red alarm callout for "share link only directly" reads like an error.
- Bug?: invite link shown as https://localhost:3001/join/… while app is http.

## P2 Horst — moderator, pre-round (O1 clarity 4/5 empty, 2/5 once round exists)
- B1 moderation card: "1 Sache wartet auf dich" + "Noch läuft nichts…" contradictory; later "Alles erledigt – gut gemacht" while "2 Bewerbungen warten auf deine Stimme" above (that's voting, not moderation — but reads contradictory).
- O1 empty state (featured card "Neue Runde eröffnen") excellent.
- After opening the round: guidance gone. Grey "AKTUELLE RUNDE" card doesn't look tappable; most prominent link "Weitere Runde eröffnen" is irrelevant and risky.
- O1 never reflects captured applications; "Bewerbung erfassen" reachable only via round page via the grey card.
- /rounds/new: unclear what opening triggers (messages?); title required?
- Capture: pasted message not parsed -> retype (out of scope: P-5 / no AI deciding; parsing is "structuring", possible later); Speichern→Weiter label flips with third-party checkbox; Art.14 step unclear who sends; "WG WG Gartenstraße" doubled; raw "[Link]" + dev-ish note shown.
- Detail: "Einladen" side effects unstated -> fear.
- Phone bottom bar has no Organisation entry; avatar menu language switch next to Abmelden (misclick flipped language).
- Caveat: Horst submitted some forms via JS (pane hidden); "Runde eröffnen" real click did nothing twice — unverified, recheck.

## P3 Mehmet — moderator taking over mid-round, real clicks, mobile (O1 clarity 2/5, appeal 3/5)
- O1 = round name + "Offen" + 4 underlined links. No counts, no stage, no next step, no vote progress. Card tap is the only way to the people.
- Round page gives headcounts (Neu · 6, Eingeladen · 1) but no rating progress.
- B1 "MODERATION – Alles erledigt – gut gemacht" next to open work -> distrust. B1 count stale vs screening "1 von 2" (Aylin added in between — expected, not a bug).
- No "ready to decide" signal anywhere; Rangliste good (top-2 highlight) but tie at 87 unexplained, "Einladen" side effect unstated. Einladen right under the name on detail page.
- Capture fine via "Bewerbung erfassen" + toast "Bewerbung gespeichert"; retype annoyance again.
- After last vote: dropped on Rangliste without confirmation.
- Sign-in: remembered WG-Kennung prefilled, typing appends -> "Diese WG-Kennung sieht ungültig aus." (sign-in screen, out of scope -> separate task)
- Desktop: content pushed right/cut off in small pane (check at real width).

## Design research (summary)
- GOV.UK "Complete multiple tasks" task list: verb-named tasks, tiny status vocabulary, rows that cannot start yet are grey and unlinked; use for multi-session work.
- One next-best action: a single dominant CTA derived from state (also Shopify Polaris setup guide).
- NN/g empty states: show status, teach through the empty state, give a direct path to the task.
- Laws of UX goal-gradient: visible progress markers; real counts, never percentages or invented urgency.
- NN/g lower-literacy findings: single column, short verb-first labels, icon plus text, primary action above the fold at 375 px.
- Anti-patterns: explanatory paragraphs and tooltips as the teaching mechanism, red for non-errors, linked rows that cannot start, icon-only buttons, wizards that lock the user in.

## Human decisions (2026-10-12)
- Scope: O1 plus B1's moderation bridge; other screens' findings spawned as separate tasks.
- Vote status: aggregate counts by application state only, no per-resident progress.
- Step bar: only steps v0.1 can carry out (up to invited).
- Agents may sign in with made-up seeded credentials; throwaway households, not the Demo-WG.

## After (2026-10-13, re-walk on the implemented change, fresh households, pane hidden → no visual ratings)

| Persona | Before (O1 clarity) | After | Remaining O1 gap |
|---|---|---|---|
| Brigitte, household | 2 | 4 → 4 → 2 | invite_flatmates ignores issued invitations ("Noch niemand ist beigetreten" after 3 invites, no hint to share links); "Jemanden bestimmen" dead-ends before anyone joined |
| Horst, moderator pre-round | 4 → 2 | 4 → 5 → 2 | in the voting phase the primary is still „Bewerbung erfassen", the real next step (vote) only on Start; „Schritt 4 von 4 · Suche läuft" before any round |
| Mehmet, moderator mid-round | 2 | 3 → 3 | step bar says „Abstimmung: erledigt / Eingeladen: aktuell" (§3.1 furthest-advanced) while 6 still await votes → contradicts Start; „in Sichtung" vs „Abstimmung" vocabulary |

Also seen: members hint „Erzeuge anschließend … eine Einladung" outdated, „Einladung erzeugen" shown beside an existing invitation (confirmed in code); progress aria labels „aktuell/folgt" unnatural. Outside this change (unchanged, parked/F4/F5): capture prefill, „Einladen" preview, screening-pass help/completion. Direct-URL loads hanging on „Wird geladen …" and missed clicks are attributed to the hidden browser pane (sign-in re-tested by hand: works).
