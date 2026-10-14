# Design: organisation-task-list

## Context

O1 (`src/app/(org)/organization/page.tsx`) today shows a round card, a featured first-round card or
founding-link card, and underlined links. Its organisation tasks come from
`casting.listOrganisationTasks`. That function returns `[]` without `manage_rounds`, and otherwise
knows two kinds, `open_first_round` and `open_round_for_room`. B1's moderation bridge
(`src/app/(resident)/dashboard/`) counts the same list, and its empty text is `allDone` („Alles
erledigt – gut gemacht").

Persona walkthroughs (2026-10-12, notes in `exploration.md`) found that O1 gives no next step once
anything exists, never reflects progress, and offers the household account only the founding link.

Constraints:
- **Module boundary.** `.dependency-cruiser.cjs` rule `no-cross-module-schema-or-repository`, and
  `deliberation` already imports `casting/repository`. So casting cannot call `deliberation`.
- **Visibility.** G-D15 / ADR-014.
- **Roles.** No role comparison (`role-reads.ts`).
- **Parallel work.** F4 change 2 / F5 change 4 own `src/modules/deliberation/`; this change only
  calls its exports.
- **Connection pool.** One connection per call chain, never a nested `withSessionContext`.

## Goals / Non-Goals

**Goals**
- O1 always shows the one most useful next organisation step, with a reason and a direct action.
- O1 shows where the round stands at a glance, for every organisation user.
- The household account gets a working setup path: room → flatmates → someone runs the search.
- B1's bridge and O1 read one task list.
- The screen is understandable without explanatory paragraphs. A heading is a verb, the reason is
  one line, and every action is a button with an icon.

**Non-Goals**
- No changes to the ranking, „Einladen" or the screening pass. Those belong to `deliberation` and
  F4/F5.
- No Organisation entry in the bottom bar (`rahmenwerk.md` §4.1).
- No appointing a moderator before the person has joined (parked).
- No prefill of capture fields from a pasted message (P-5 question, parked in the F3 plan).
- No phase-deadline task (`rahmenwerk.md` §3.2): nothing sets `phase_deadline_at` in v0.1.
- No per-resident vote progress (human decision 2026-10-12: aggregate counts only).
- No steps after "invited" (human decision 2026-10-12).
- No migration, table, permission or index.

## Decisions

### D1 — Each task kind is gated in its own module's read; an app-level loader composes them

Three reads produce tasks. Each decides its own permission against the caller's live membership.

| Read | Module | Task kinds |
|---|---|---|
| `listOrganisationTasks(context)` (extended) | casting | `add_room` (`manage_rooms`), `open_first_round`, `open_round_for_room` (`manage_rounds`), plus `rankingRoundIds`: the open rounds for which an invite check is due (`manage_rounds`) |
| `listHouseholdSetupTasks(context)` (new) | identity | `invite_flatmates` (`manage_join_codes`), `appoint_search_lead` (`appoint_moderator`, carrying the live founding path when the caller may read it) |
| `getRanking(context, roundId)` (existing, unchanged) | deliberation | the facts for `invite_candidates`, read only for the `rankingRoundIds` casting returned |

`src/app/(org)/organisation-tasks.ts` exports `loadOrganisationTasks(context)`. O1 and B1 both call
it. It runs the casting and identity reads, then the ranking reads for the returned round ids
**sequentially**, never inside another read's transaction. It passes the results to one pure
function, `orderOrganisationTasks`, in `task-precedence.ts`.

- **Why not one repository function?** Casting would have to import `deliberation` (cycle, depcruise)
  and query identity tables (boundary).
- **Why not compute in the page?** Authorization would then live in the page. Here every decision
  stays in a repository read, and the loader only combines already-authorized results.
- **Why a new identity read instead of reusing `getResidentList`?** That read returns rows and names.
  The task needs two booleans, gated by two permissions.
- **Clean code.** One new file (the loader), justified because two pages need the same composition
  (DRY). It has no abstraction beyond one function.

`listOrganisationTasks` changes:
- The early `return []` without `manage_rounds` becomes per-kind checks from one membership read.
- No room at all now gives `add_room`, and `open_first_round` is not offered. The new-round form
  would refuse with `no_rooms_selected`, so the old task was a dead end.
- A caller without a resident profile gets `rankingRoundIds: []`.

`invite_candidates` is open for a round when that round's `getRanking` returns `kind: "board"` and
`decided.scored.some(r => r.leading)`. That is a highlighted row still being decided, so the
ranking's own highlight rule (Q-15) decides, and nothing is recomputed. Any other `kind` gives no
task. `getRanking` throws for a profile-less caller, which the empty `rankingRoundIds` already
avoids.

### D2 — Order: one fixed rank map, the same algorithm as `orderTasks`

`orderOrganisationTasks` sorts by a fixed rank: add_room 1, invite_flatmates 2, appoint_search_lead
3, open_first_round 4, open_round_for_room 5, invite_candidates 6. Ties are broken by a stable key
(room or round id). No organisation task has a due date in v0.1, so the "dated first" half of
`orderTasks` does not apply.

The shared tie-break comparator in `task-precedence.ts` is reused, not copied. The rank map lives
beside `UNDATED_RANK`, so both rules sit in one file (P-3, deterministic).

### D3 — Round overview: existing reads only

O1's round area reads `listRoundsForSession` for title, status and the round list, which the
household account may read (ADR-014). For a caller with a resident profile it also reads
`getStartOverview` for standings (`stateCounts`). That read already refuses a profile-less session
(G-D15), so the page cannot leak by forgetting a check.

The step bar maps `phaseOf(stateCounts)`:

| `phaseOf` result | Current step |
|---|---|
| `waiting_for_applications` | "waiting for applications" |
| `voting_round_1` | "voting" |
| `scheduling` and later | "invited" (clamped, no later step shown) |

The household account has no `stateCounts`, so it shows only "round opened" plus status.

A moderator without a resident profile (non-resident moderator) also gets no counts. This is a
known v0.1 limit, consistent with ranking requiring `vote`.

### D4 — Layout: "one sentence, one button" with section tiles (human choice 2026-10-13)

Four variants were prototyped with the app's own tokens and components (A: like Start; B: round
panel; C: route; D: one sentence, one button). The human chose **D, with A's section tiles**.

Top to bottom, single column, mobile-first:

1. **Context line.** The household name in muted text, plus the back link to Start for residents.
2. **Status sentence.** One large serif sentence that says where things stand, using only facts the
   caller may see:
   - with a round, as a resident-profile caller: „{Runde} läuft. 7 in Sichtung, 1 eingeladen.";
   - with no application yet: „{Runde} läuft. Noch keine Bewerbung da.";
   - the household account during a round, which gets no numbers (G-D15): „{Runde} läuft.";
   - no round, setup still open: „Eure WG ist fast startklar.";
   - no round, nothing open: „Gerade läuft keine Runde.".

   This sentence is the round header (O1 rule 3: information that only informs goes in the header,
   not the task list).
3. **Progress bar.** A thin segmented bar, one segment per step: the round steps (D3) or, for the
   household account before any round, the setup steps (room · flatmates · search lead · search
   running). Done segments are full primary, the current one primary at 50%, later ones muted.
   - A visible caption under it names the current step („Schritt 3 von 4 · Abstimmung").
   - Each segment carries an accessible label.

   This satisfies the spec's step indicator without a labelled dot row.
4. **Primary action.** One full-width `btn-primary`, icon plus verb heading. The reason is one muted
   centred line beneath it, visible without interaction.
   - `appoint_search_lead` adds a full-width `btn-secondary` for its second way („Jemanden
     bestimmen"). „Selbst übernehmen" (the founding link) stays a plain `<a>` styled as the
     primary button, never prefetched.
   - With no open task, the primary is the phase action: „Bewerbung erfassen" while a round is
     open and the caller holds `create_application`. With no round and no task, there is no
     button; the sentence alone fills the space (never blank).
5. **Persistent capture.** When a round is open, the caller holds `create_application`, and the
   primary is a task other than capture: a full-width `btn-secondary` „Bewerbung erfassen".
6. **Further tasks.** Up to three row cards (icon, verb heading, reason, arrow), the B1 row pattern.
   Overflow becomes „und N weitere" as a `<details>`.
7. **Section tiles (from A).** A 3-column grid of small cards, each an icon in a round secondary chip
   above its label: rooms, members, settings for the household account; rooms, members, "who lives
   here" for a resident moderator (whatever `getNavigationAccess` grants, D1). They are always
   visible, never folded.
8. **„Mehr" (`<details>`, closed by default, not rendered at all when it would be empty).**
   - „Alle Bewerbungen" (the active round's applications, profile callers with
     `create_application`);
   - „Weitere Runde eröffnen" (`manage_rounds` only);
   - the other-rounds list;
   - the standalone founding-link offer when the link is live but `appoint_search_lead` is not
     open (`identity/join-code`).

Icons come from `lucide-react`. There are no new CSS files. `globals.css` gains at most two
component classes (`org-tile`, `org-progress`) built from existing tokens, for light and dark. The
page is server components only, with no client JS (`<details>` is native). Links show
`LinkPendingHint`. The prototype's markup (`src/app/design-preview/o1/page.tsx`, untracked) is a
visual reference for the applier and is deleted before commit; it is never imported.

### D5 — Strings (de + en twins), process wording (C-10)

Proposed German text, for confirmation in review:

| Key | de | en |
|---|---|---|
| add_room heading / reason | „Zimmer anlegen" / „Ohne Zimmer kann keine Suche starten." | "Add a room" / "A search needs a room first." |
| invite_flatmates | „Mitbewohnende einladen" / „Noch niemand ist beigetreten." | "Invite your flatmates" / "Nobody has joined yet." |
| appoint_search_lead | „Wer kümmert sich um die Suche?" / „Eine Person führt durch die Runde." · buttons „Selbst übernehmen" / „Jemanden bestimmen" | "Who runs the search?" / "One person guides the round." · "Take it on myself" / "Choose someone" |
| open_first_round | existing `openFirstRoundHeading` / body | existing |
| open_round_for_room | „Suche für {Zimmer} starten" / „Das Zimmer ist frei, aber in keiner Runde." | "Start a search for {room}" / "This room is free but in no round." |
| invite_candidates | „Zu Castings einladen" / „In „{Runde}" stehen Bewerbungen vorn — ihr könnt einladen." | "Invite to a viewing" / "Applications lead in "{round}" — you can invite." |
| steps | „Runde eröffnet" · „Bewerbungen sammeln" · „Abstimmung" · „Eingeladen" | "Round opened" · "Collecting applications" · "Voting" · "Invited" |
| setup steps | „Zimmer" · „Mitbewohnende" · „Suchleitung" · „Suche läuft" | "Room" · "Flatmates" · "Search lead" · "Search running" |
| status sentence | „{Runde} läuft." + „ {Verteilung}." / „ Noch keine Bewerbung da." · „Eure WG ist fast startklar." · „Gerade läuft keine Runde." | "{round} is running." + " {distribution}." / " No application yet." · "Your household is almost ready." · "No round is running." |
| progress caption | „Schritt {n} von {m} · {Schritt}" | "Step {n} of {m} · {step}" |
| more | „Mehr" · „Alle Bewerbungen" | "More" · "All applications" |
| bridge empty (B1) | „Gerade ist nichts zu organisieren" | "Nothing to organise right now" |

The invite reason talks about the process ("stehen vorn", the ranking's own highlight), never about a
person. UI terms follow `rahmenwerk.md` §8.6 (household, not flatshare). Outbound text is untouched.

### D6 — B1 bridge

`dashboard/page.tsx` replaces `listOrganisationTasks` with `loadOrganisationTasks` and keeps
`buildDashboardView`'s count logic. Only the `allDone` text changes (D5). The first-round body rule
is unchanged: it is used when the first task is `open_first_round`.

### D7 — Rooms: named actions, confirmed removal (folded in)

`rooms/page.tsx` replaces the `<select>` and the „Status ändern" link with one small form per target
from `f1TargetStatusesFor(r.status)`, excluding the current status. Each form posts the existing
`transitionRoomAction` with a hidden `toStatus` and uses `SubmitButton` (pending-feedback lint).

Labels (de / en):

| Transition | de | en |
|---|---|---|
| planned→open | „Als frei markieren" | "Mark as free" |
| open→on_hold | „Suche pausieren" | "Pause the search" |
| on_hold→open | „Wieder freigeben" | "Make free again" |
| →not_available | „Nicht verfügbar" | "Not available" |

Removal moves behind the members screen's existing native-`<dialog>` confirm pattern
(`remove-member-form.tsx` is the model: typed name not required, just "Zimmer „{label}" entfernen?"
plus confirm and cancel). It is placed on its own line, below the other actions. Rooms are already
ordered by `created_at, id`, so nothing changes there.

### D8 — Members: invite at creation, stable order, advice tone (folded in)

- **Invite at creation.** The create-profile server action calls `createResidentProfile`, then, if
  the caller holds `manage_join_codes`, `issueJoinCode(context, accountId, { residentProfileId,
  maxUses: 1, validDays: <the existing default> })`.
  - These are two repository calls, each its own transaction, **never nested** (one pooled
    connection per call chain).
  - Failure order is safe. If the second call fails, the profile exists and its card keeps
    offering „Einladung für dieses Profil erzeugen". The action reports the profile as created and
    logs the failure.
  - Nothing is claimed as atomic. Before calling, the action checks `manage_join_codes` through the
    permission read the page already uses (`getResidentList`'s `canManageJoinCodes` or
    equivalent). The repository's own check still refuses on its own.
  - The new card shows the issued link with the existing `JoinCodeCopyButtons`.
- **Order.** `getResidentList` gets `.orderBy(residentProfile.createdAt, residentProfile.id)`.
- **Tone.** The generic warning (`t.joinCode.warning`, FR-2.2 "visible without interaction")
  switches from `callout-caution` + `TriangleAlert` to `callout-info` + `Info`. The text is
  unchanged, and it stays visible without interaction. The other three cautions stay as they are.

### D9 — Capture: name doubling, honest button label (folded in)

- `thirdPartyText` puts the „WG " prefix only when the household name does not already start with
  „WG" (case-insensitive, word boundary). The English twin does the same with its own wording.
  Compliance §4.5's wording is otherwise untouched, so this is a rendering fix and not a text
  change.
- The step-2 submit for a third-party capture reads „Weiter zum Hinweis" / "Continue to the notice".
  Saving still happens on „Verstanden", as today. A data-subject capture keeps „Speichern".
- The "[Link]" note stays (human, 2026-10-12).

### D10 — Sign-in prefill replaced by typing (folded in)

The uncontrolled `householdCode` input gets an `onFocus` that selects its content when the value
came from the device prefill (a ref flag set by the existing effect, cleared on first input). Typing
then replaces it, and a click-to-place-caret after the first focus still works normally. No change
to storage, opt-in or the `draft` reset handling.

The "tab needed two taps" observation was in device emulation and is not reproduced here. Verify
during the walkthrough, and do not fix speculatively.

### D11 — Profile menu: sign-out set apart (folded in)

`avatar-menu.tsx`: `LanguageToggle` moves above the divider, next to the account settings link.
„Abmelden" sits alone after its own `avatar-menu-divider`. No spec change: `ui/language-choice` only
requires the language row to be in the menu.

## Risks / Trade-offs (pre-mortem)

- **R1 Pool pressure.** O1 makes about five reads, plus one ranking read per open round. The reads
  are independent `Promise.all` siblings, with no nesting (`NestedSessionContextError` guards).
  Ranking reads run after them, sequentially, so a request holds at most the sibling count of
  connections at once (B1 already runs six). → Accepted. A test asserts no nested call by passing
  through the real helpers.
- **R2 The rule change for zero rooms breaks existing tests** asserting `open_first_round` with no
  room (`tests/integration/.../organisation-tasks*`, `start-overview`). → Intended, because the spec
  changed. Each updated test cites the delta. Do not change one to pass without reading why.
- **R3 deliberation in flux.** F4 change 2 may reshape `Ranking`. We use only `kind`,
  `decided.scored[].leading` and `round.title`. → Whoever merges second runs `npm run verify` after
  merging `main`. Recorded in the plan Log.
- **R4 G-D15 leak by composition.** The loader must not call `getStartOverview` / `getRanking` for a
  profile-less session.
  - `getRanking` throws for one.
  - `getStartOverview` returns null for one.
  - `rankingRoundIds` is empty for one.
  → Three layers. Test: a household account in a household with an open round and applications gets
  no count, no `invite_candidates` and no state distribution, through the loader and through each
  read directly.
- **R5 "Search lead" read as a role check.** `appoint_search_lead` asks "does any live membership
  hold `manage_rounds`", via the stored permissions array, never `role = 'moderator'`.
  `role-reads.ts` must stay green without a marker.
- **R6 Founding link prefetch.** It stays a plain `<a>`, never `next/link`.
- **R7 Authorization matrix.** `listHouseholdSetupTasks` is a new identity export, so add it to
  `NOT_APPLICABLE_IDENTITY` ("read-only; visibility tested in organisation-task-list tests").
  Otherwise the matrix test fails, which is what it is for.
- **R8 Stale wording elsewhere.** `identity/join` still says the household account is taken to O20
  on `already_member`. The code renders the note on O1 too. → Out of scope; listed in the plan Log
  as a follow-up spec catch-up, not silently edited.
- **R9 Pending-feedback lint.** The page has no forms, so no submit button. `loading.tsx` exists; its
  skeleton is reshaped to the new layout with `@/ui/skeletons`.
- **R11 Invite-at-creation is two writers in sequence.** A concurrent second create for the same
  profile is impossible, because the profile is new. A concurrent manual "issue invitation" on the
  just-created card could produce two bound links for one profile. That is harmless: each is single
  use, and claiming one makes the profile claimed. The existing `issueJoinCode` rules decide; no new
  lock.
- **R12 Scope growth in one PR.** The folded items are independent task groups (8–11), each with its
  own test. A review can read them separately, and a group that turns out larger than D7–D11 says is
  stopped and reported, not stretched.
- **R10 Shared dev DB flakes.** Tests use random-per-run households. A failure is rerun alone
  before it is called real.

## Migration Plan

None. Code-only, deployable at any time. Rollback means reverting the commit.

## Open Questions

- Wording in D5. The human confirms or edits it in review, before apply.

## Fix round after the re-walk (2026-10-13, human-approved)

Source: `exploration.md` "After". Each item amends the decision named in brackets; the earlier text
stands where this section does not override it.

- **F1 Step states (D3).** Steps are named as actions: „Runde eröffnen" · „Bewerbungen sammeln" ·
  „Abstimmen" · „Einladungen verschicken" (human, 2026-10-13: „Eingeladen" read as "all invited").
  - **Rule.** `roundStepOf` still picks the current step from `phaseOf` (§3.1, furthest-advanced).
    A new pure helper derives each step's state from `stateCounts`, and only for a profile caller,
    since the household account has no counts:
    - "Bewerbungen sammeln" is done once any main-path application exists.
    - "Abstimmen" is **running** while any application is `new`/`screened`, otherwise done.
    - An earlier step that is still running renders as a lighter primary segment.
    - The caption appends „· {Schritt} läuft noch" for the first running earlier step: „Schritt 4
      von 4 · Einladungen verschicken · Abstimmen läuft noch".
  - **Status sentence.** The count word for `in_screening` becomes „in Abstimmung", matching the
    step and Start.
  - **Screen-reader states.** „erledigt" · „jetzt dran" · „läuft noch" · „kommt noch".
- **F2 Phase fallback (D4 point 4).** With no open task and an active round, the primary action
  follows the step:
  - collecting applications → „Bewerbung erfassen" (`create_application`);
  - voting or sending out invitations, for a profile caller → „Zum Casting" (`/casting`, which
    already routes a caller with pending votes to the screening pass, and everyone else to the
    ranking), with „Bewerbung erfassen" as the secondary button.
- **F3 Flatmate links (D1, identity read).** `listHouseholdSetupTasks` also reports whether any
  unused, unexpired, undeleted invitation exists in the household. The founding link is excluded:
  it is the founder's own link, not a flatmate invitation.
  - When `invite_flatmates` is open and such an invitation exists, the copy becomes heading
    „Einladungslinks teilen", reason „Die Links sind erstellt — schick sie an deine
    Mitbewohnenden."
  - Same members-screen target. This needs only one more `EXISTS` in the same transaction.
- **F4 Search lead (D1).** `appoint_search_lead` is produced only when it has a working way:
  - `foundingJoinPath` is non-null; or
  - a live resident membership exists that lacks `manage_rounds` (`canAppointMember: true`).

  The task carries `canAppointMember`. The page shows „Jemanden bestimmen" only when it is true.
- **F5 Setup step (D4 point 3).** The fourth setup step is „Suche starten" (an action), not „Suche
  läuft".
- **F6 Members screen (D8).**
  - `addResidentHelperInviteNote` becomes „Die Einladung wird gleich mit erstellt — teile danach den
    Link.", shown only to a caller holding `manage_join_codes`. Others keep no note.
  - „Einladung für dieses Profil erzeugen" is hidden while that profile has a live bound
    invitation (the `boundIssuance` the view already looks up, if unused and unexpired).
- **F7 People entries (human, 2026-10-13).** „Wer hier wohnt" and „Mitglieder" doubled each other
  for a moderator.
  - **Profile menu (`src/app/_frame/menu-items.ts`).** The people item is chosen by identity:
    „Wer hier wohnt" for any session with a resident profile, the members list only for the
    household account (no profile).
  - **O1 tiles.** Drop the „Wer hier wohnt" tile. Rename the members tile to „Mitgliederverwaltung"
    (en "Member administration"). The members page heading is unchanged.
  - Spec delta: `ui/resident-frame` (profile menu requirement) and `organisation/task-list`
    (sections).

## Review fixes (local /code-review high, 2026-10-13, human-approved 1–7)

- **R-1 No-counts bar.** `roundStepStates(null)` gives `[done, next, next, next]` and no caption.
  Nothing claims a current step the caller cannot see. Fix the test at
  `status-sentence.test.ts:61` to the spec scenario.
- **R-2 Active round follows the counts.** O1's `active` is the open round that
  `getStartOverview().standing` describes when there is one. Otherwise it is the first open round
  (EC-1.5 still presents exactly one). Counts and the step bar then always describe the shown
  round.
- **R-3 Invite only after one's own votes.** The loader reads `getAwaitingVoteCounts` (deliberation
  export, read-only). It calls `getRanking` only for rounds in `rankingRoundIds` whose awaiting
  count is an explicit `0`; a missing entry counts as awaiting, the same rule as Start's
  acknowledgement. So the task's `/casting?round=` link always reaches the ranking, because
  `/casting` redirects to screening only when votes await.
- **R-4 Founding offer in one click.** The standalone offer renders as its own card below the tiles,
  not inside „Mehr".
- **R-5 Household setup until a round exists.** `buildStatusHeader` gets `hasAnyRound`. With no
  active round, no open setup task and `!hasAnyRound`, the setup bar shows step 4 „Suche starten"
  as current, with the sentence „Eure WG ist fast startklar."
- **R-6 Start cost.** Covered by R-3: a moderator with pending votes triggers no ranking read.
- **R-7 Sign-in focus.** `justFocused` is set only for a pointer-initiated focus (a pointerdown flag),
  so a Tab focus never swallows a later click.

## Layout amendments after visual QA (2026-10-13, human feedback)

- **Grouping (amends D4).**
  - With an active round, the status sentence, the progress bar, the round's action ("Zu Castings
    einladen", or the phase fallback), „Bewerbung erfassen" and a new secondary button „Alle
    Bewerbungen" sit in one `panel-round` section headed „Diese Runde" (09-Design-System.md
    "Round-scope grouping panel").
  - The section tiles and the standalone founding-link offer sit under the eyebrow „Haushalt".
  - Household tasks (add room, flatmates, search lead, open a round) stay at page level above the
    panel.
  - Only one primary per page: if a household task leads, the panel's action renders as a secondary
    button.
  - „Mehr" keeps only „Weitere Runde eröffnen" and the other rounds.
- **Visual fixes.**
  - The tile grid has as many columns as tiles, and tile labels hyphenate.
  - Progress segments share one shape. Done is solid; in progress (current or still running) is
    diagonal stripes; next is the muted track. There is no ring and no opacity.
  - „Mehr" links are 44 px.
- **Split (human, 2026-10-13).** The round heading is only „{Runde} läuft."; the counts („7 in Abstimmung, 1 eingeladen." / „Noch keine Bewerbung da.") stand on their own muted line below it (`StatusHeader.detail`). The heading is text-xl (20 px).
- **Counts wording (human, 2026-10-13).** The counts line reads „{N} Bewerbungen, davon {M} eingeladen." (singular „1 Bewerbung"; en "8 applications, 1 of them invited"): the main-path total, side states not counted. Replaces „in Abstimmung".
