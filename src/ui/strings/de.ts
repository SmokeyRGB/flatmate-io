// The single key→text table for v0.1 (German). Every user-facing string in the application is
// resolved from here — no component, server action or test holds a user-facing literal.
// docs/screens/rahmenwerk.md §8.6 (the "Übersetzungstabelle", U-24) is the authority wherever it
// has an entry, cited per entry below; everywhere else this is new copy for this change
// (openspec/changes/german-ui-vocabulary, Assumption 1). See design.md Decisions 1–3 for why this
// is a plain `as const` object rather than a `t()` accessor, and Decision 2 for why interpolated
// entries are functions rather than a template-substitution helper.
export const de = {
  common: {
    save: "Speichern",
    saving: "Wird gespeichert…",
    cancel: "Abbrechen",
    add: "Hinzufügen",
    edit: "Bearbeiten",
    rename: "Umbenennen",
    reactivate: "Reaktivieren",
    signOut: "Abmelden",
    // §8.6: "Hartes Entfernen (U-27)" → „Entfernen" — the permanent, confirmation-gated removal.
    // Reused verbatim for the room-removal action too; §8.6 itself notes reuse of a term across
    // list contexts is fine when the context disambiguates it.
    remove: "Entfernen",
    // §8.6: "`join_code` ungültig machen (O16)" → „Löschen" — never a synonym.
    delete: "Löschen",
  },
  nav: {
    // The organisation hub screen is titled "Organisation" (matches the shared vocabulary already
    // used in screens/O-organisation.md and the prototype's own back-link pattern); every
    // sub-screen's back link points there under the same label.
    organisation: "Organisation",
    // start-screen: the resident frame's bottom bar / header nav (rahmenwerk.md §4.1) and every
    // back-link that now points at B1 instead of O1.
    start: "Start",
    casting: "Casting",
    whoLivesHere: "Wer hier wohnt",
    members: "Mitglieder",
    toOrganisation: "Zur Organisation",
    accountSettings: "Einstellungen",
    // The menu trigger's accessible name carries the identity (AC-1.6), not just the action;
    // <details> exposes its own expanded/collapsed state, so the label does not say "öffnen".
    menuFor: (displayName: string) => `Menü für ${displayName}`,
    mainNavigation: "Hauptnavigation",
  },
  status: {
    // Room states (data-model.md "Room", six states, FR-1.10) are read by a resident whenever a
    // room list or badge renders — not covered by §8.6, so written for this change.
    room: {
      planned: "Geplant",
      open: "Offen",
      promised: "Zugesagt",
      occupied: "Belegt",
      on_hold: "Pausiert",
      not_available: "Nicht verfügbar",
    },
    // CastingRound states (data-model.md "CastingRound", five states, FR-1.13) — same reasoning.
    round: {
      draft: "Entwurf",
      open: "Offen",
      paused: "Pausiert",
      closed: "Geschlossen",
      archived: "Archiviert",
    },
    // §8.6: "`moved_out` (weich)" → „Ausgezogen" — the reversible removal tier's status label.
    // Kept distinguishable from common.remove ("Entfernen", the permanent tier) per U-27.
    movedOut: "Ausgezogen",
  },
  auth: {
    signIn: {
      heading: "Anmelden",
      tabHousehold: "Haushalt",
      tabResident: "Bewohner:in",
      emailLabel: "E-Mail",
      householdLabel: "Haushalt",
      householdPlaceholder: "wird nach dem Beitritt auf diesem Gerät gemerkt",
      nameLabel: "Dein Name",
      passwordLabel: "Passwort",
      submit: "Anmelden",
      submitPending: "Wird angemeldet…",
      // join-screen (FR-2.27, A1 "Ohne Anmeldung erreichbar"): the two ways in that are not
      // sign-in itself, offered as links beneath the card — `.btn-link` (design.md Decision 8).
      foundHousehold: "WG gründen",
      enterJoinCode: "Beitrittscode eingeben",
    },
    register: {
      heading: "WG gründen",
      emailVisibleNotice: "Diese E-Mail-Adresse ist für alle sichtbar, die deiner WG beitreten.",
      emailLabel: "E-Mail",
      passwordLabel: "Passwort",
      // design.md Decision 6: a second step of the same form, revealed client-side, one submit —
      // not a second route. Step 1 keeps A1's exact two fields (email, password); step 2 asks for
      // the household name, with an example rather than an empty box (its whole job is to be
      // recognised by somebody opening a join link).
      next: "Weiter",
      back: "Zurück",
      householdNameHeading: "Wie soll dein Haushalt heißen?",
      householdNameLabel: "Haushaltsname",
      householdNamePlaceholder: "z. B. WG Hauptstraße 12",
      submit: "WG gründen",
      submitPending: "WG wird gegründet…",
    },
    // Decision 4/6: a domain error class is not one message, and a third-party or unexpected
    // failure never shows its own wording. These are the resolved texts an action's exhaustive
    // `switch (err.code)` maps to; the class's own `message` stays English, for the log only.
    errors: {
      register: {
        // auth.ts:36 — also used directly by register/actions.ts's own pre-submit field check, so
        // the same copy appears whether the field check fires client-side-early or server-side.
        missingEmail: "E-Mail-Adresse ist erforderlich.",
        missingPassword: "Passwort ist erforderlich.", // auth.ts:37
        // join-by-link (FR-2.9/AC-2.1): registerHousehold's third required field — a whitespace-only
        // name is refused with this same text (auth.ts trims before checking).
        missingName: "Haushaltsname ist erforderlich.",
        signupFailed: "Registrierung ist fehlgeschlagen. Bitte versuche es erneut.", // auth.ts:51
      },
      signIn: {
        missingFields: "Haushalt und Name sind erforderlich.", // auth.ts:320
        invalidHousehold: "Diese Haushalts-ID sieht ungültig aus.", // auth.ts:326
        // auth.ts:349 ("No such resident in this household") and auth.ts:358 ("Invalid
        // credentials") converge on this single text — design.md Decision 5 / proposal.md
        // Assumption 6: telling the two apart would let an unauthenticated visitor learn whether
        // a display name exists in the household.
        invalidCredentials: "Diese Anmeldedaten sind ungültig.",
        noHousehold: "Dieses Konto ist keinem Haushalt zugeordnet.", // auth.ts:366
        noMembership: "Für dieses Konto besteht keine Mitgliedschaft.", // auth.ts:372
      },
      // Decision 6: a third-party (Supabase Auth) or genuinely unanticipated failure past the
      // point a domain error could describe it. The real message still reaches the log.
      genericSignInFailure: "Die Anmeldung ist fehlgeschlagen. Bitte versuche es erneut.",
    },
  },
  org: {
    signedInAsPrefix: "Angemeldet als",
    // AC-1.6: the interface states which identity a session is acting as. identity/repository.ts's
    // getIdentityLabel returns structured data, not a display string, so the German composition
    // lives here rather than as an English literal in the repository layer.
    identityHousehold: (householdName: string) => `${householdName} (Verwaltung)`,
    identityHouseholdFallback: "Haushaltsverwaltung",
    identityResidentFallback: "Bewohner:in",
    dashboard: {
      heading: "Organisation",
      activeRoundEyebrow: "Aktuelle Runde",
      asNextEyebrow: "Als nächstes",
      openFirstRoundHeading: "Eröffne deine erste Casting-Runde",
      openFirstRoundBody: "Noch läuft nichts — eröffne eine Runde, sobald du Zimmer zum Besetzen hast.",
      openNewRound: "Neue Runde eröffnen",
      openAnotherRound: "Weitere Runde eröffnen",
      otherRoundsHeading: "Weitere Runden",
      roomsLink: "Zimmer",
      membersLink: "Mitglieder",
      settingsLink: "Einstellungen",
      whoLivesHereLink: "Wer hier wohnt",
    },
  },
  members: {
    heading: "Mitglieder",
    accessDeniedBody: "Diese Liste ist für Verwaltung und Moderation.",
    accessDeniedLinkPrefix: "Wenn du sehen willst, wer hier wohnt, nutze",
    addResidentPlaceholder: "Anzeigename",
    addResidentSubmit: "Bewohner:in hinzufügen",
    // join-by-link design.md Decision 13: `/claim` is gone — a prepared profile is claimed only
    // through a link bound to it (task 12.8's per-profile "Einladung erzeugen" action, rendered
    // below in this same list once the profile exists).
    addResidentHelperInviteNote: "Erzeuge anschließend unten in der Liste eine Einladung für diese Person.",
    noOneJoinedYet: "Noch niemand ist beigetreten — teile deinen Einladungslink, um die erste Person einzuladen.",
    // join-code-protections (O-18, 2026-09-21): O16 now lists several issued links rather than
    // one rotating code — screens/O-organisation.md O16, in the order warning / create form /
    // list. §8.6 fixes „Einladungslink" and „Löschen" (reused from `common.delete` below, never a
    // synonym); everything else here is new copy for this change.
    joinCode: {
      heading: "Einladungslinks",
      // S-49/FR-2.2: sits beside the links, visible without interaction — never presented as
      // security (C-2.5), just social visibility.
      warning:
        "Teile diesen Link nur direkt mit deinen Mitbewohnenden — niemals öffentlich. Wer ihn hat, kann mitstimmen.",
      create: {
        validDaysLabel: "Gültig für (Tage)",
        maxUsesLabel: "Höchstens nutzbar",
        // O-15's default of 1 explained in plain text, not just applied silently.
        maxUsesHelper:
          "Standard: ein Link für eine Person. Erhöhe das nur, wenn mehrere denselben Link nutzen sollen.",
        submit: "Neuen Link erzeugen",
      },
      usageCount: (uses: number, maxUses: number) => `${uses} von ${maxUses} genutzt`,
      validUntil: (date: string) => `Gültig bis ${date}`,
      expiredOn: (date: string) => `Abgelaufen am ${date}`,
      usedUp: "Aufgebraucht",
      deletedOn: (date: string) => `Gelöscht am ${date}`,
      // AC-2.26 (join-by-link): each link names who joined through it — live and dead alike.
      joinedNames: (names: string[]) => `Beigetreten: ${names.join(", ")}`,
      joinedNoneYet: "Noch niemand über diesen Link beigetreten.",
      // O-15: "mit einem Tippen verlängerbar" — one action, not a date field.
      extend: "+7 Tage",
      copyFullLink: "Link kopieren",
      // FR-2.27: the channel for hand entry (P-1 Kanalneutralität) — not a lesser convenience.
      copyCodeOnly: "Nur den Code kopieren",
      copiedFullLink: "Link kopiert",
      copiedCodeOnly: "Code kopiert",
      deleteAriaLabel: (code: string) => `Link ${code} löschen`,
      deleteDialog: {
        heading: "Link löschen?",
        consequence:
          "Der Link wird sofort ungültig. Bereits über ihn beigetretene Personen bleiben Mitglied.",
      },
      empty: "Noch kein Link erzeugt.",
      // join-by-link design.md Decision 13 / task 12.8: an invitation bound to one prepared
      // profile — issued beside that profile's own row, not from the general create form above
      // (which always issues a neutral link).
      issueForProfile: "Einladung für dieses Profil erzeugen",
      issuedForProfileHeading: "Ausgestellte Einladung für dieses Profil:",
      // design.md Decision 9 (human decision, 2026-09-22; revised 2026-09-23): shown beside
      // "Löschen" on a LIVE link a removed member joined through — not merely "not yet deleted"
      // (the first version also flagged a used-up or expired link, which can never again be
      // used; caught in the 8.3 walkthrough). Names no one (they're already hidden from the
      // resident list), and is deliberately not framed as a security boundary (C-2.5): the link
      // still works until deleted, this only makes that visible. The wording itself ("kann sie
      // ihn erneut verwenden") still reads correctly for a live link — that is exactly what
      // "live" means.
      removedJoinerCaution:
        "Über diesen Link ist eine inzwischen entfernte Person beigetreten. Solange du ihn nicht " +
        "löschst, kann sie ihn erneut verwenden.",
      // design.md Decision 9 (revised 2026-09-23): the <summary> of O16's collapsed dead-links
      // section (expired, used up or deleted) — states the count so the section is informative
      // even collapsed.
      deadLinksSummary: (n: number) => `Nicht mehr nutzbare Links (${n})`,
    },
    moderationBadge: "Moderation",
    makeModerator: "Zur Moderation ernennen",
    makeMember: "Zum Mitglied machen",
    // Verb form of the §8.6 status label (status.movedOut = „Ausgezogen") — this is the action
    // that sets it, not the status display.
    markMovedOut: "Ausgezogen markieren",
    remove: {
      // §8.6: "Hartes Entfernen (U-27)" → „Entfernen".
      buttonLabel: "Entfernen",
      ariaLabel: (displayName: string) => `${displayName} entfernen`,
      dialogHeading: (displayName: string) => `${displayName} entfernen?`,
      consequence: "Der Zugang wird sofort entzogen. Das kann nicht rückgängig gemacht werden.",
      caution:
        'Nutze das nur für jemanden, der über den Einladungslink beigetreten ist, aber ' +
        'tatsächlich nicht hier wohnt. Für einen echten Auszug nutze stattdessen „Ausgezogen" — ' +
        'das behält die Historie und lässt sich mit „Reaktivieren" rückgängig machen.',
      confirmLabel: (displayName: string) => `„${displayName}" eingeben, um zu bestätigen`,
      submit: "Entfernen",
      submitPending: "Wird entfernt…",
      cancel: "Abbrechen",
    },
    errors: {
      // identity/repository.ts's DisplayNameConfirmationMismatchError — one throw site, one
      // message, mapped by class (design.md Decision 4's rejected-alternative case; task 2.3).
      nameMismatch: "Der eingegebene Name stimmt nicht mit dem Mitglied überein.",
      genericRemoveFailure:
        "Dieses Mitglied konnte nicht entfernt werden — die Daten haben sich möglicherweise " +
        "geändert. Aktualisiere die Seite und versuche es erneut.",
    },
  },
  rooms: {
    heading: "Zimmer",
    addPlaceholder: "Zimmerbezeichnung",
    addSubmit: "Neues Zimmer",
    changeState: "Status ändern",
    remove: "Entfernen",
  },
  rounds: {
    new: {
      heading: "Casting-Runde eröffnen",
      permissionDenied: "Du hast keine Berechtigung, eine Casting-Runde zu eröffnen.",
      titleLabel: "Rundentitel",
      titlePlaceholder: "z. B. Nachbesetzung Herbst",
      roomsLegend: "Zimmer dieser Runde",
      noRoomsYet: "Noch keine Zimmer — lege zuerst eins auf der Zimmer-Seite an.",
      submit: "Runde eröffnen",
      submitPending: "Wird eröffnet…",
    },
    detail: {
      procedureChangedNotice: "Eine Abstimmungsregel wurde geändert, während diese Runde offen war.",
      participantsHeading: "Teilnehmende",
    },
    errors: {
      // casting/repository.ts's RoundOpenPreconditionError — not enumerated in tasks.md's error
      // list, but its message reaches this same form (rounds/new/actions.ts) exactly like the
      // classes tasks.md does name, including a raw round id in one branch. Given the same code
      // discriminant treatment as design.md Decision 4 — see the implementation report.
      noRoomsSelected: "Diese Runde hat noch keine ausgewählten Zimmer.",
      roomsUnavailable: "Alle Zimmer dieser Runde sind bereits belegt oder nicht verfügbar.",
      noEligibleResidents: "Es gibt keine stimmberechtigten Bewohner:innen für diese Runde.",
      genericPreconditionFailure: "Diese Runde kann derzeit nicht eröffnet werden.",
      // identity/repository.ts's PermissionDeniedError — left uncoded (task 2.3: every call site
      // resolves to the same "not allowed" outcome for the user, see the implementation report),
      // mapped by class to one generic text rather than the raw `Missing permission: …` message.
      permissionDenied: "Du hast keine Berechtigung für diese Aktion.",
    },
  },
  settings: {
    heading: "Haushaltseinstellungen",
    accessDeniedBody: "Diese Seite ist nur für die Verwaltung.",
    lockedWhileRoundOpen: (roundTitle: string) =>
      `Solange „${roundTitle}" läuft, bleiben diese Einstellungen unverändert. Schließe die ` +
      `Runde, um sie hier zu ändern.`,
    quorumShareLabel: "Quorum-Anteil",
    save: "Speichern",
    savePending: "Wird gespeichert…",
    errors: {
      // casting/repository.ts's ProcedureLockedError reaches this form via a generic `err
      // instanceof Error` catch (settings/actions.ts) — not one of design.md Decision 4's coded
      // classes, and its own message carries a raw round id and field names. Left uncoded (like
      // PermissionDeniedError above), mapped to one generic text instead; see the implementation
      // report for why this contradicts design.md's stated premise that no screen displays it.
      genericSaveFailure: "Diese Änderung konnte nicht gespeichert werden.",
    },
  },
  // join-by-link (FR-2.9–FR-2.28): the /join/[code] route. Functional and plain in this change
  // (proposal Assumption 6 — screen A3's four mandatory states and dressing are change 3's work);
  // the invalid-link message and the "stay signed in" checkbox label are already-decided copy,
  // quoted verbatim from `screens/A-zugang.md` A3 rather than invented here.
  join: {
    // join-screen design.md Decision 8: the NEUTRAL heading is now its own short sentence — the
    // household name moves into the household chip beneath it (`householdChip` below), which is
    // shared visually with the bound heading's greeting.
    heading: () => "Du bist eingeladen",
    // `screens/A-zugang.md` A3: "Du trittst *WG Hauptstraße 12* bei" — FR-2.9/AC-2.1's household
    // name shown before any field is requested. Now the `.context-chip`'s own text, shown beneath
    // either heading (design.md Decision 8).
    householdChip: (householdName: string) => `Du trittst ${householdName} bei`,
    // join-by-link design.md Decision 13, revised by join-screen design.md Decision 8: a BOUND
    // link's heading is now just the greeting — the invitation itself is the shared household chip
    // above, so the two are never duplicated in one sentence as the old single-string version did.
    boundHeading: (displayName: string) => `Hi ${displayName}!`,
    nameLabel: "Name",
    passwordLabel: "Passwort",
    // FR-2.10a/AC-2.20: the requirement is stated, not discovered by failing once.
    passwordRequirement: (minLength: number) => `Mindestens ${minLength} Zeichen.`,
    emailLabel: "E-Mail (freiwillig)",
    // FR-2.11/C-2.2: a visibly optional, emptily-submittable field — one line of reason, never a
    // request. Matches domain/identity.md §2.1's own rationale for asking at all (self-recovery).
    emailHelper:
      "Optional. Mit einer E-Mail-Adresse kannst du dein Passwort später selbst zurücksetzen.",
    // `screens/A-zugang.md` A3: "Auf diesem Gerät angemeldet bleiben" — pre-selected, clearable
    // (FR-2.12/EC-2.10).
    rememberMeLabel: "Auf diesem Gerät angemeldet bleiben",
    submit: "Beitreten",
    submitPending: "Wird beigetreten…",
    // join-screen design.md Decision 8/10: offered beside the invalid-link refusal, both when the
    // page itself shows it and when a submit produces it (Decision 10's shared component).
    handEntryWayBack: "Beitrittscode von Hand eingeben",
    // join-screen design.md Decision 7/10: the Keine-Berechtigung sign-out — ends only the
    // visitor's own session and returns to this same invitation (`signOutAndReturnAction`).
    signOutAndReturn: "Abmelden",
    errors: {
      // `screens/A-zugang.md` A3, corrected 2026-09-21 against FR-2.8: one message for all four
      // causes (expired, used up, deleted, never existed), naming none of them, plus the way back.
      // join-screen: unchanged text — only the surrounding hand-entry link is new (task 1.1).
      invalidLink: "Dieser Einladungslink ist nicht gültig. Frag in der WG nach einem aktuellen Link.",
      // proposal.md Assumption 3: distinguishable from the invalid-link message — a rate-limited
      // refusal is not a statement about any link (FR-2.8 is about the three link-refusal
      // reasons, not about this).
      rateLimited: "Von hier kamen zuletzt zu viele Versuche. Bitte versuche es in Kürze erneut.",
      missingFields: "Name und Passwort sind erforderlich.",
      passwordTooShort: (minLength: number) => `Das Passwort muss mindestens ${minLength} Zeichen haben.`,
      // AC-2.17/EC-2.11: inline, with a way forward — never a dead end. A fixed sentence, never the
      // typed name (PR #20 review): this text is returned in the action state, which next dev's
      // server-function log prints on the next submit, and the name already stands in its own
      // field right above it (join-screen design.md Decision 4).
      nameTaken: "Dieser Name ist in dieser WG bereits vergeben. Wähle einen anderen.",
      // EC-2.5/A-2.4: deliberately NOT the invalid-link message — the link is fine.
      otherHousehold:
        "Du bist bei einem anderen Haushalt angemeldet. Melde dich ab, um diesem Haushalt beizutreten.",
      // join-screen design.md Decision 5, corrected in PR #20 review: promises only what the join
      // transaction guarantees. The redemption is spent only by a join that completes
      // (identity/join), so the invitation is still good. "Nothing was created" was not
      // guaranteed: the Supabase Auth user is created outside that transaction and removed only
      // best-effort (auth.ts joinHousehold).
      genericFailure:
        "Der Beitritt hat nicht geklappt. Deine Einladung ist dadurch nicht verbraucht — versuch es einfach noch einmal.",
    },
    // EC-2.4: rendered on the dashboard (task 8.5) when the join redirect carries the note —
    // "taken to Start with a note", the temporary /dashboard landing target (proposal Assumption 4).
    alreadyMemberNote: "Du bist bereits Mitglied dieses Haushalts.",
    // Review fix (§12): A3's refusal states and its Laden skeleton have no visible heading or text of
    // their own, so these give assistive tech one, rendered visually hidden (`sr-only`).
    refusalHeading: "Einladung",
    loading: "Einladung wird geladen…",
    // join-screen design.md Decision 1/3: `/join`'s own manual-entry screen (FR-2.27, US-2.15).
    joinByCode: {
      heading: "Beitrittscode eingeben",
      // Assumption 1: "Leer" read as "arriving on the join path with no code" — the sentence
      // naming what normally appears here, plus the one sensible action (§6).
      emptyBody: "Hier steht normalerweise eine Einladung. Tippe deinen Beitrittscode ein, um weiterzumachen.",
      codeLabel: "Beitrittscode",
      // The example SHAPE only, never a real code (task 2.2) — `UAMPN-QACVZ`'s own alphabet, but
      // not a code that has ever been issued.
      // U+2011 (non-breaking hyphen) and U+00A0 keep "z. B." and the example on one line. It is only
      // the example shape, never a real code, so normalizeJoinCode never has to fold either.
      codeFormatHint: "Zwei Gruppen zu je fünf Zeichen, z. B. ABCDE‑FGHJK.",
      submit: "Weiter",
      submitPending: "Wird geprüft…",
      // Review fix (rahmenwerk.md §12, „Nie Farbe allein"): the refusal says in its own words that
      // this is not a code, instead of the helper sentence merely turning red.
      codeInvalid: "Das ist kein gültiger Beitrittscode.",
    },
    // join-screen design.md Decision 5: the `error.tsx` boundary — generic on purpose (never the
    // failure's own text or the code, G-A5), covering a failed page load, submit or sign-out alike.
    unexpectedError: {
      heading: "Das hat gerade nicht geklappt.",
      body: "Nichts ist verloren gegangen — du kannst es einfach noch einmal versuchen.",
      retry: "Erneut versuchen",
    },
  },
  whoLivesHere: {
    heading: "Wer hier wohnt",
    strangerNotice: "Erkennst du jemanden auf dieser Liste nicht wieder, sag es einer moderierenden Person — außerhalb der App.",
  },
  // start-screen (FR-2.20–2.24, `rahmenwerk.md` §2–§3): B1, the resident's Start screen.
  start: {
    // rahmenwerk.md §4.1: "Moin {Name}", household name muted beneath (design.md Decision 10).
    greeting: (displayName: string) => `Moin ${displayName}`,
    eyebrowAsNext: "ALS NÄCHSTES",
    // T-5: how many applications await the viewer's vote, and where the task leads.
    // rahmenwerk.md §8.6 binds this wording (`Notification.type = vote_pending` → „{N} Bewerbungen
    // warten auf deine Stimme") — the same fact, so the same words on Start as in a notification.
    voteTaskHeading: (count: number) =>
      count === 1 ? "1 Bewerbung wartet auf deine Stimme" : `${count} Bewerbungen warten auf deine Stimme`,
    voteTaskButton: "Jetzt sichten",
    reasonDated: (dateLabel: string) => `Stimme ab bis ${dateLabel}.`,
    reasonOverdue: "Die Frist ist abgelaufen — deine Stimme zählt trotzdem noch.",
    reasonUndated: (roundTitle: string) => `In der Runde „${roundTitle}" wird gerade abgestimmt.`,
    andNMore: (n: number) => `und ${n} weitere`,
    // rahmenwerk.md §3.1's phase labels — the round's standing, shown when nothing is open.
    phase: {
      waiting_for_applications: "Warten auf Bewerbungen",
      voting_round_1: "Abstimmung Runde 1",
      scheduling: "Terminfindung",
      voting_round_2: "Abstimmung Runde 2",
      offer: "Zusage läuft",
    },
    // design.md Decision 6: the four display buckets beneath the phase, non-zero only.
    distribution: {
      in_screening: (n: number) => `${n} in Sichtung`,
      in_scheduling: (n: number) => `${n} im Termin`,
      interviewed: (n: number) => `${n} gecastet`,
      in_offer: (n: number) => `${n} in Zusage`,
    },
    noRoundSentence: "Gerade läuft keine Runde.",
    runningWithoutYouSentence: "Eine Runde läuft, aber (noch) ohne dich.",
    // U-5, `rahmenwerk.md` §2.3: the moderation bridge — visually distinct from the resident's own
    // task list, never mixed into it.
    bridge: {
      eyebrow: "MODERATION",
      headingSingular: "1 Sache wartet auf dich",
      headingPlural: (n: number) => `${n} Sachen warten auf dich`,
      body: "Ein Zimmer ist bereit für eine neue Runde.",
      allDone: "Alles erledigt – gut gemacht",
      button: "Zur Organisation →",
    },
  },
  // start-screen: the Casting tab (placeholder until F4/F5) and its screening step placeholder.
  casting: {
    placeholderHeading: "Casting",
    placeholderBody: "Wird in F4 & F5 gebaut.",
    backToStart: "Zurück zu Start",
  },
  screening: {
    placeholderHeading: "Sichten",
    placeholderBody: (count: number) =>
      count === 1
        ? "1 Bewerbung wartet auf deine Stimme. Das Sichten selbst wird in F4 gebaut."
        : `${count} Bewerbungen warten auf deine Stimme. Das Sichten selbst wird in F4 gebaut.`,
    backToStart: "Zurück zu Start",
  },
  // start-screen: E1, the resident's own settings — a placeholder until change 5 fills it.
  account: {
    heading: "Einstellungen",
    placeholderBody: "E-Mail-Adresse hinzufügen und Passwort ändern folgen im nächsten Schritt.",
    backToStart: "Zurück zu Start",
  },
  // start-screen: the shared error boundary for every `(resident)` screen — same reasoning as
  // `de.join.unexpectedError` (generic on purpose, G-A5: never the failure's own text).
  resident: {
    unexpectedError: {
      heading: "Das hat gerade nicht geklappt.",
      body: "Nichts ist verloren gegangen — du kannst es einfach noch einmal versuchen.",
      retry: "Erneut versuchen",
    },
  },
  document: {
    description: "Das Tool, mit dem die WG entscheidet.",
  },
} as const;
