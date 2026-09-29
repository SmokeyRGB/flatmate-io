// The single key→text table for v0.1 (German). Every user-facing string in the application is
// resolved from here — no component, server action or test holds a user-facing literal.
// docs/screens/rahmenwerk.md §8.6 (the "Übersetzungstabelle", U-24) is the authority wherever it
// has an entry, cited per entry below; everywhere else this is new copy for this change
// (openspec/changes/german-ui-vocabulary, Assumption 1). See design.md Decisions 1–3 for why this
// is a plain `as const` object rather than a `t()` accessor, and Decision 2 for why interpolated
// entries are functions rather than a template-substitution helper.
export const de = {
  common: {
    // src/ui/password-input.tsx: the eye toggle beside every password field.
    showPassword: "Passwort anzeigen",
    hidePassword: "Passwort verbergen",
    // src/ui/success-toast.tsx: closes the success notice.
    close: "Schließen",
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
    // loading-feedback design.md D8: SubmitButton's status-region text, announced only while a
    // form is submitting (src/ui/submit-button.tsx).
    pending: "Wird gesendet …",
    // loading-feedback design.md D8: the skeleton container's visually hidden label
    // (src/ui/skeletons.tsx, every new loading.tsx).
    loading: "Wird geladen …",
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
    // Application states (data-model.md "Application", eleven states): the words of §8.6
    // (ergänzt 2026-09-28, F3-Vorprüfung), verbatim. They describe where the PROCESS stands, never
    // the person (C-10). tests/unit/casting/application-state-words.test.ts keeps the keys equal to
    // the enum's values.
    application: {
      new: "Neu",
      screened: "Gesichtet",
      invited: "Eingeladen",
      scheduled: "Termin steht",
      interviewed: "Kennengelernt",
      offer_made: "Zusage erteilt",
      moved_in: "Eingezogen",
      rejected_by_household: "Abgesagt (von uns)",
      declined_by_applicant: "Abgesagt (von der Person)",
      withdrawn: "Zurückgezogen",
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
      // resident-settings (human decision 2026-09-24, walkthrough): a resident with an email signs
      // in on the resident tab, switching between the name fields and the email field. The
      // household tab still accepts a resident's address, but no longer advertises it.
      residentUseEmail: "Mit E-Mail-Adresse anmelden",
      residentUseName: "Mit Name anmelden",
      // Copilot review round 2 (PR #23), auth.ts redeemPasswordReset's `reset_done_sign_in_failed`
      // (phase 3): the reset itself already succeeded (password set in phase 2, prior sessions
      // revoked in phase 1, link spent) — only the immediate sign-in afterwards failed, so this is
      // a note beside the ordinary form, not an error. Recreated exactly as in commit a95bbb9.
      passwordResetNote: "Dein neues Passwort ist gesetzt. Melde dich damit an.",
      // auth-provider-deadline design.md D8/D10 (draft, awaiting human confirmation):
      // redeemPasswordReset's `reset_outcome_unknown` — neither phase 2's write nor any check of
      // it (nor phase 3's own sign-in) could be confirmed either way.
      passwordResetUnknownNote:
        "Dein neues Passwort ist möglicherweise schon gesetzt. Versuche, dich damit anzumelden. " +
        "Klappt das nicht, bitte die Verwaltung um einen neuen Link.",
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
        // auth-provider-deadline design.md D10 (draft, awaiting human confirmation): the identity
        // provider's answer never arrived — never shown as "invalid credentials" (identity/sign-in).
        providerUnavailable: "Die Anmeldung ist gerade nicht möglich. Bitte versuche es gleich noch einmal.",
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
      // D13 (application-capture): the household account and any session without close_round is
      // not offered the way to open a round; runs of the round are the moderation's (S-50/U-20).
      noRoundYetHeading: "Noch keine Runde",
      noRoundYetBody: "Casting-Runden eröffnet die Moderation der WG.",
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
      // resident-settings design.md Decision 8 (O16, identity/password-reset): the row action for
      // a profile whose account has no email yet — household sessions only.
      issueResetLink: "Passwort-Link erstellen",
      // E-03/K-18 ("Nicht als Sicherheitsgrenze darstellen"): states plainly what the link can do,
      // shown once a reset link is issued — never framed as protection.
      // Walkthrough fix 2026-09-24: a reset link is not an invitation, so it gets its own heading
      // instead of issuedForProfileHeading.
      resetLinkIssuedHeading: "Ausgestellter Passwort-Link für dieses Profil:",
      resetLinkIssuedCaution: "Wer diesen Link öffnet, kann das Passwort dieser Person setzen.",
      // The link-history label for a reset row, replacing the invitation label (design.md
      // Decision 8: "Passwort-Link für <Name>" instead of an invitation).
      resetLinkForName: (displayName: string) => `Passwort-Link für ${displayName}`,
      // review fix (PR #23 finding): getResidentList (PR #18 decision) hides a removed profile's
      // name entirely (O16 never shows who a removed person was) — so a reset link whose target
      // was later removed cannot look the name up in profileNameById. Never fall back to showing
      // the name some other way (that would contradict #18); this neutral label names no one.
      resetLinkForRemovedPerson: "Passwort-Link für eine entfernte Person",
      errors: {
        // identity/repository.ts's ResidentProfileNotEligibleForResetError — one throw site, one
        // message, mapped by class (same convention as members.errors.nameMismatch).
        notEligibleForReset:
          "Für dieses Profil kann kein Passwort-Link erstellt werden — es ist entweder nicht " +
          "aktiv, oder hat bereits eine E-Mail-Adresse hinterlegt.",
      },
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
    // new-room-dialog.tsx: the header button opens the dialog; the dialog's own submit creates.
    addSubmit: "Neues Zimmer",
    create: {
      heading: "Neues Zimmer",
      labelField: "Bezeichnung",
      labelPlaceholder: "z. B. Zimmer 3",
      submit: "Zimmer anlegen",
      submitPending: "Wird angelegt…",
      labelRequired: "Gib eine Bezeichnung für das Zimmer ein.",
      genericFailure: "Das Zimmer konnte nicht angelegt werden. Versuche es erneut.",
    },
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
      participantsHeading: "Teilnehmende Mitbewohner:innen",
      // F3 change 2: shown only to a session holding create_application, for an open round.
      captureApplication: "Bewerbung erfassen",
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
  // F3 change 2 (application-capture): screen O3 (capture), the application detail shell (O5's
  // first cut) and the Art. 14 notice. Labels follow 03-PRD.md §4.1.3 and rahmenwerk.md §8.6
  // verbatim where they have an entry; the notice text is 06-Compliance-Anhang.md §4.5 "Variante
  // Dritterhebung", reproduced verbatim except for its placeholders. NO label may contain an
  // Art.-9 stem (scripts/lint/data-inventory.ts ART9_BLOCKLIST; `herkunft` is one, so the
  // collection-source label is never „Herkunft der Angaben"); tests/unit/casting/capture-page.test.ts
  // checks every rendered label token by token.
  applications: {
    capture: {
      heading: "Bewerbung erfassen",
      backToRound: "Zur Runde",
      // The three steps (design D6): Nachricht, Angaben, Hinweis.
      messageIntro: "Füge die Nachricht der Person ein, falls du sie hast. Den Rest tippst du im nächsten Schritt.",
      next: "Weiter",
      back: "Zurück",
      nameLabel: "Name",
      ageLabel: "Alter",
      // One contact input, sorted by a fixed rule (design D15). The line under each input says
      // where that contact will be stored.
      contactLabel: "Kontakt",
      contactLabelMore: "Weiterer Kontakt",
      contactPlaceholder: "E-Mail, Telefonnummer oder eine andere Kennung",
      addContact: "+ weiteren Kontakt",
      // Not „Entfernen": §8.6 reserves that word for removing a member (U-27).
      removeContact: "Kontakt weglassen",
      contactStoredAs: {
        email: "Wird als E-Mail-Adresse gespeichert",
        phone: "Wird als Telefonnummer gespeichert",
        other: "Wird als sonstiger Kontakt gespeichert",
      },
      // Names the input that clashes with an earlier one of the same kind.
      contactKindTaken: {
        email: "Es kann nur eine E-Mail-Adresse gespeichert werden.",
        phone: "Es kann nur eine Telefonnummer gespeichert werden.",
        other: "Es kann nur ein sonstiger Kontakt gespeichert werden.",
      },
      messageLabel: "Nachricht der Person",
      // Counted in Unicode code points, like the database (assumption A5).
      counter: (used: number, max: number) => `${used} von ${max} Zeichen`,
      limitNear: (max: number) => `Höchstens ${max} Zeichen`,
      attributesLegend: "Weitere Angaben",
      openAttributes: "+ Weitere Angaben",
      attributeLabelLabel: "Bezeichnung",
      attributeValueLabel: "Angabe",
      addAttribute: "Weitere Angabe hinzufügen",
      removeAttribute: "Entfernen",
      // rahmenwerk.md §8.6 / 03-PRD.md §4.1.3, verbatim.
      collectedFromStatement: "Angaben von der bewerbenden Person",
      collectedFromCheckbox:
        "Die Angaben stammen nicht von der Person selbst (z. B. jemand hat sie euch empfohlen)",
      save: "Speichern",
      savePending: "Wird gespeichert…",
    },
    // The three non-form states of O3 (the fourth, loading, is loading.tsx).
    states: {
      noOpenRound:
        "Bewerbungen werden nur in einer offenen Runde erfasst. Diese Runde ist gerade nicht offen.",
      // O3 „Keine Berechtigung": why, and who can help.
      permissionDenied:
        "Bewerbungen erfasst die Moderation der WG oder wer das Recht dazu hat. Wende dich an die Moderation, wenn eine Bewerbung erfasst werden soll.",
      // rahmenwerk.md §8.6, verbatim.
      householdAccount:
        "Das WG-Konto verwaltet die WG — Bewerbungen und Abstimmung bleiben bei den Bewohner:innen.",
      detailPermissionDenied:
        "Diese Seite ist für die Moderation der WG. Wende dich an sie, wenn du etwas zu einer Bewerbung wissen möchtest.",
    },
    // O4, the round's list of applications (F3 change 3, design D2).
    list: {
      heading: "Bewerbungen",
      empty: "Noch keine Bewerbung erfasst",
      // The group heading: the §8.6 state word and the number of applications in it.
      groupLabel: (word: string, count: number) => `${word} · ${count}`,
      age: (years: number) => `${years} Jahre`,
      // Joins the age and the stored contacts on the muted line of a row.
      summarySeparator: " · ",
      loadError: "Die Bewerbungen konnten gerade nicht geladen werden. Lade die Seite neu.",
    },
    // O5's correction form (F3 change 3, design D5).
    edit: {
      heading: "Bewerbung bearbeiten",
      save: "Änderungen speichern",
      savePending: "Wird gespeichert…",
      updated: "Änderungen gespeichert",
      // A correction saved without any change writes nothing (FR-3.22), so it says so.
      unchanged: "Keine Änderungen",
      editLink: "Bearbeiten",
      // Shown to a member without create_application; the action refuses anyway.
      permissionDenied: "Bewerbungen bearbeitet die Moderation der WG.",
      // Refused as stale: someone corrected the application after the form was loaded (D4 c2).
      stale: "Die Bewerbung wurde inzwischen geändert. Lade die Seite neu, um die aktuelle Fassung zu sehen.",
    },
    // Only a code and at most a field name ever reach the form, never a typed value (D4). One
    // text per code; the field is named by the field-level text below where it helps.
    errors: {
      name_required: "Bitte gib einen Namen an.",
      too_long: "Eine Angabe ist zu lang.",
      invalid_age: "Das Alter muss eine ganze Zahl von 0 bis 150 sein.",
      too_many_attributes: "Es sind höchstens 10 weitere Angaben möglich.",
      invalid_attribute:
        "Jede weitere Angabe braucht eine Bezeichnung (bis 60 Zeichen) und eine Angabe (bis 500 Zeichen).",
      invalid_characters: "Ein Feld enthält ein Zeichen, das nicht gespeichert werden kann.",
      collected_from_required: "Bitte gib an, woher die Angaben stammen.",
      // Shown beside the contact inputs; the input that clashes gets contactKindTaken above.
      contact_kind_taken: "Es sind höchstens drei Kontakte möglich, je einer als E-Mail, Telefon und sonstiger Kontakt.",
      round_not_found: "Diese Runde gibt es nicht mehr.",
      round_not_open:
        "Die Runde ist nicht mehr offen, deshalb wurde nichts gespeichert. Deine Eingaben stehen noch im Formular.",
      permission_denied: "Du hast keine Berechtigung, Bewerbungen zu erfassen.",
      profile_required: "Bewerbungen können nur Bewohner:innen erfassen.",
      save_failed: "Die Bewerbung konnte nicht gespeichert werden. Deine Eingaben stehen noch im Formular.",
      // Only the correction form can return these two.
      not_found: "Diese Bewerbung gibt es nicht mehr.",
      stale: "Die Bewerbung wurde inzwischen geändert. Lade die Seite neu, um die aktuelle Fassung zu sehen.",
    },
    saved: "Bewerbung gespeichert",
    viewSaved: "Bewerbung ansehen",
    // The Art. 14 duty and text. `{Datum}` is one month after capture, on the Berlin calendar (A2).
    notice: {
      // Two quiet lines (design D6): this one, then deadlineLine. Together they state both
      // deadlines of FR-3.11, the first message and the one-month date.
      informLine: "Die Person muss erfahren, dass ihr ihre Angaben gespeichert habt.",
      // 06-Compliance-Anhang.md §4.5, verbatim apart from its placeholders.
      deadlineLine: (name: string, date: string) =>
        `Am besten gleich mit deiner ersten Nachricht an ${name} schicken – spätestens bis ${date}.`,
      deadlineNameFallback: "die Person",
      deadlinePassed: (date: string) =>
        `Die Monatsfrist ist schon verstrichen (${date}). Informiert die Person so bald wie möglich.`,
      textLabel: "Textbaustein zum Kopieren",
      showExample: "Beispieltext anzeigen",
      hideExample: "Beispieltext ausblenden",
      understood: "Verstanden",
      copy: "Text kopieren",
      copied: "Text kopiert",
      regenerate: "Text neu erzeugen",
      // A1: the [Link] stays a literal placeholder; say plainly that there is nothing to link to yet.
      linkHint: "[Link] bleibt stehen, weil es noch keine Datenschutzseite gibt.",
      nameFallback: "{Name}",
      // Category words for {Kategorien}, in the fixed order of noticeCategories().
      categories: {
        name: "Name",
        age: "Alter",
        email: "E-Mail-Adresse",
        phone: "Telefonnummer",
        other: "weiterer Kontakt",
        message: "deine Nachricht",
        attributes: "weitere Angaben",
      },
      // 06-Compliance-Anhang.md §4.5 „Stufe 1" (the Art. 13 text for an application collected from
      // the applicant), verbatim, including its fixed „(Name, Kontakt, deine Nachricht)" (A1: only
      // the Art. 14 variant generates its categories, because Art. 14(1)(d) requires them). The
      // bold markers of the source are formatting, not words, and are not part of the copied text.
      applicantText:
        `Kurz zum Datenschutz: Deine Angaben (Name, Kontakt, deine Nachricht) speichern wir als WG, ` +
        `um die Zimmervergabe zu organisieren. Wir notieren dazu auch unsere Eindrücke aus dem ` +
        `Kennenlernen. Spätestens 180 Tage nach Abschluss löschen wir alles wieder. Du kannst ` +
        `jederzeit erfahren, was wir gespeichert haben — auch die Notizen —, es berichtigen oder löschen ` +
        `lassen. Melde dich einfach hier. Details: [Link]`,
      showApplicantNotice: "Datenschutz-Hinweis anzeigen",
      hideApplicantNotice: "Datenschutz-Hinweis ausblenden",
      // „Warum steht das hier?" (D3). AWAITING THE HUMAN'S WORDING: the draft below states the
      // household's responsibility in three sentences. Nothing depends on it.
      whyToggle: "Warum steht das hier?",
      why:
        "Ihr als WG speichert die Angaben und entscheidet, was damit passiert. Deshalb seid ihr dafür " +
        "verantwortlich, die Person darüber zu informieren. Flatmate.io schlägt euch nur einen Text " +
        "vor und verschickt nichts selbst.",
      // 06-Compliance-Anhang.md §4.5 „Stufe 1, Variante Dritterhebung", verbatim except {Name},
      // {Haushaltsname} and {Kategorien}.
      thirdPartyText: (v: { name: string; household: string; categories: string }) =>
        `Hey ${v.name}, kurze Info von der WG ${v.household}: Deine Bewerbung (${v.categories}) haben wir ` +
        `über eine andere Person bekommen und für unsere Zimmersuche gespeichert. Spätestens 180 Tage ` +
        `nach Ende der Suche löschen wir alles wieder. Wenn du nicht dabei sein möchtest oder wissen ` +
        `willst, was wir über dich gespeichert haben, sag einfach Bescheid – dann löschen wir es sofort. ` +
        `Mehr dazu: [Link]`,
    },
    detail: {
      heading: "Bewerbung",
      backToRound: "Zur Runde",
      capturedNotice: "Diese Bewerbung wurde erfasst.",
      viaSomeoneElse: "Über jemand anderen",
      fromApplicant: "Von der bewerbenden Person",
      ageLabel: "Alter",
      emailLabel: "E-Mail",
      phoneLabel: "Telefon",
      otherContactLabel: "Anderer Kontakt",
      messageLabel: "Nachricht der Person",
      attributesLabel: "Weitere Angaben",
      sourceLabel: "Wie die Angaben zu uns kamen",
      empty: "—",
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
    // identity/password-reset (O-16, screens/A-zugang.md A3 bound shape): a third screen shape,
    // shown when purpose = 'password_reset'. Same greeting as an ordinary bound link — the person
    // is asked only for a new password (spec: "SHALL NOT ask for a name or an email").
    reset: {
      heading: (displayName: string) => `Hi ${displayName}!`,
      // Walkthrough fix 2026-09-24: the join chip ("Du trittst … bei") is wrong here, since the
      // person already belongs. FR-2.9 only needs the household named.
      householdChip: (householdName: string) => `Neues Passwort für ${householdName}`,
      newPasswordLabel: "Neues Passwort",
      submit: "Passwort setzen",
      submitPending: "Wird gesetzt…",
    },
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
      // resident-settings design.md Decision 3: the provider's duplicate-email refusal — names no
      // account, household or person (proposal Assumption 2), same wording style as E1's own.
      emailTaken: "Diese E-Mail-Adresse kann nicht verwendet werden.",
      // review fix: joinHousehold now validates the optional email itself (normalizeEmail/
      // isWellFormedEmail) — same wording style as account.email.errors.invalidEmail (E1's own).
      invalidEmail: "Das sieht nicht nach einer gültigen E-Mail-Adresse aus.",
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
      // Copilot review round 2 (PR #23): redeemPasswordReset's phase 2 (the provider password
      // write) failed AFTER phase 1 already committed — the link is spent and every prior session
      // is dead, but the password itself never changed. Distinct from genericFailure, which
      // promises the invitation is unconsumed — that would be false here.
      resetIncomplete:
        "Der Link ist jetzt verbraucht, aber dein neues Passwort konnte nicht gesetzt werden. Bitte die Verwaltung um einen neuen Link.",
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
  // resident-settings (E1): the resident's own settings screen — email, password, sign-out.
  account: {
    heading: "Einstellungen",
    backToStart: "Zurück zu Start",
    noPermissionBody: "Diese Seite ist für Bewohner:innen. Deine Einstellungen findest du hier:",
    noPermissionLink: "Einstellungen",
    email: {
      heading: "E-Mail",
      currentLabel: "Deine hinterlegte Adresse",
      // FR-2.17/E1 ("nie als Sperre formuliert"): framed as a way back in, never a requirement.
      pitch: "Trage eine E-Mail-Adresse nach, um dir einen Weg zurück zu sichern, falls du dein Passwort vergisst.",
      // EC-2.6/O-16 (corrected 2026-09-24): stated plainly while the gap exists, not hidden.
      noRecoveryNotice:
        "Ohne eigene E-Mail-Adresse kannst du ein vergessenes Passwort nicht selbst zurücksetzen — " +
        "nur die Verwaltung kann dir dann per Link weiterhelfen.",
      fieldLabel: "E-Mail-Adresse",
      submit: "Speichern",
      submitPending: "Wird gespeichert…",
      saved: "Gespeichert.",
      errors: {
        missingEmail: "E-Mail-Adresse ist erforderlich.",
        invalidEmail: "Das sieht nicht nach einer gültigen E-Mail-Adresse aus.",
        emailTaken: "Diese E-Mail-Adresse kann nicht verwendet werden.",
        notAResident: "Nur Bewohner:innen können ihre E-Mail-Adresse ändern.",
        // Copilot review round 4 (PR #23): the session this request came in on has been ended
        // (e.g. by a password reset) — the honest remedy is signing in again, not a retry.
        sessionEnded: "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.",
        genericFailure: "Das hat nicht geklappt. Bitte versuche es erneut.",
        // Copilot review round 3 (PR #23): the provider write succeeded but the commit that should
        // have followed it failed, and the best-effort repair (auth.ts changeResidentEmail's own
        // comment) also failed — distinct from genericFailure, which would wrongly imply nothing
        // happened at all.
        changeIncomplete:
          "Die Änderung wurde möglicherweise nur teilweise übernommen. Bitte versuche es erneut.",
        // auth-provider-deadline design.md D10 (draft, awaiting human confirmation): the identity
        // provider's answer never arrived and could not be resolved — nothing was changed.
        providerUnavailable:
          "Das ist gerade nicht möglich. Es wurde nichts geändert – bitte versuche es gleich noch einmal.",
      },
    },
    password: {
      heading: "Passwort ändern",
      currentLabel: "Aktuelles Passwort",
      newLabel: "Neues Passwort",
      requirement: (minLength: number) => `Mindestens ${minLength} Zeichen.`,
      submit: "Passwort ändern",
      submitPending: "Wird geändert…",
      saved: "Passwort geändert. Andere Sitzungen wurden abgemeldet.",
      errors: {
        missingFields: "Aktuelles und neues Passwort sind erforderlich.",
        passwordTooShort: (minLength: number) => `Das neue Passwort muss mindestens ${minLength} Zeichen haben.`,
        wrongCurrentPassword: "Das aktuelle Passwort ist nicht richtig.",
        notAResident: "Nur Bewohner:innen können ihr Passwort ändern.",
        // Copilot review round 4 (PR #23): see email.errors.sessionEnded above — same situation,
        // changeResidentPassword's own new session check.
        sessionEnded: "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.",
        genericFailure: "Das hat nicht geklappt. Bitte versuche es erneut.",
        // Copilot review round 3 (PR #23): see email.errors.changeIncomplete above — same
        // situation, changeResidentPassword's own compensating transaction also failed.
        changeIncomplete:
          "Die Änderung wurde möglicherweise nur teilweise übernommen. Bitte versuche es erneut.",
        // auth-provider-deadline design.md D10 (draft, awaiting human confirmation).
        providerUnavailable:
          "Das ist gerade nicht möglich. Es wurde nichts geändert – bitte versuche es gleich noch einmal.",
        // D7's SAFE DIRECTION (pre-mortem findings 3/4): an unanswered write may still apply later,
        // after this lock releases — every other session already ended as a precaution, whatever
        // is found afterwards.
        unchangedSessionsEnded:
          "Dein Passwort wurde nicht geändert – bitte versuche es gleich noch einmal. " +
          "Deine anderen Anmeldungen wurden vorsichtshalber beendet.",
        uncertainSessionsEnded:
          "Ob dein neues Passwort übernommen wurde, ließ sich nicht feststellen. Deine anderen " +
          "Anmeldungen wurden vorsichtshalber beendet. Ändere es am besten gleich noch einmal – als " +
          "aktuelles Passwort gilt das alte oder das neue.",
      },
    },
    signOut: {
      heading: "Abmelden",
    },
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
