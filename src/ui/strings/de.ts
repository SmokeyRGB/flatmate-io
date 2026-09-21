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
      notClaimedYet: "Noch keinen Zugang?",
      claimLink: "Profil einrichten",
      submit: "Anmelden",
      submitPending: "Wird angemeldet…",
    },
    register: {
      heading: "WG gründen",
      emailVisibleNotice: "Diese E-Mail-Adresse ist für alle sichtbar, die deiner WG beitreten.",
      emailLabel: "E-Mail",
      passwordLabel: "Passwort",
      submit: "WG gründen",
      submitPending: "WG wird gegründet…",
    },
    claim: {
      heading: "Profil einrichten",
      description:
        "Frag die Person, die eure WG registriert hat, nach der Haushalts-ID und dem Namen, den " +
        "sie für dich angelegt hat. Leg hier dein eigenes Passwort fest.",
      householdLabel: "Haushalt",
      nameLabel: "Dein Name",
      passwordLabel: "Passwort wählen",
      submit: "Profil einrichten",
      submitPending: "Profil wird eingerichtet…",
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
        signupFailed: "Registrierung ist fehlgeschlagen. Bitte versuche es erneut.", // auth.ts:51
      },
      claim: {
        householdRequired: "Haushalt, Name und Passwort sind alle erforderlich.",
        invalidHousehold: "Diese Haushalts-ID sieht ungültig aus.",
        noProfileWaiting: "Für diesen Namen wartet in diesem Haushalt kein Profil auf die Einrichtung.",
        notFound: "Dieses Profil konnte nicht gefunden werden.", // auth.ts:185 — never the raw id
        alreadyClaimed: "Dieses Profil wurde bereits übernommen oder ist nicht mehr verfügbar.", // auth.ts:187
        signupFailed: "Einrichtung ist fehlgeschlagen. Bitte versuche es erneut.", // auth.ts:198
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
    // Split around the two monospaced fragments (household id, "/claim") so the component can
    // keep their styling — see the implementation report for why this isn't one interpolated
    // sentence like design.md Decision 2's `quorum` example.
    addResidentHelperHouseholdIdPrefix: "Eure Haushalts-ID:",
    addResidentHelperClaimNote: "Mit dem gewählten Namen legt die Person ihr eigenes Passwort fest, unter",
    noOneJoinedYet: "Noch niemand ist beigetreten — teile deinen Einladungslink, um die erste Person einzuladen.",
    // §8.6: `join_code` → „Einladungslink" / „Beitrittscode".
    joinCodeEyebrow: "Einladungslink",
    rotateJoinCode: "Einladungslink erneuern",
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
  whoLivesHere: {
    heading: "Wer hier wohnt",
    householdAccountNotice:
      'Diese Ansicht ist für Bewohner:innen. Die Verwaltung sieht die vollständige ' +
      'Mitgliederliste unter „Mitglieder".',
    strangerNotice: "Erkennst du jemanden auf dieser Liste nicht wieder, sag es einer moderierenden Person — außerhalb der App.",
  },
  document: {
    description: "Das Tool, mit dem die WG entscheidet.",
  },
} as const;
