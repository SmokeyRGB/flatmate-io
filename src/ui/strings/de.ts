// The single key→text table for v0.1 (German). Every user-facing string in the application is
// resolved from here — no component, server action or test holds a user-facing literal.
// docs/screens/rahmenwerk.md §8.6 (the "Übersetzungstabelle", U-24) is the authority wherever it
// has an entry, cited per entry below; everywhere else this is new copy for this change
// (openspec/changes/german-ui-vocabulary, Assumption 1). See design.md Decisions 1–3 for why this
// is a plain `as const` object rather than a `t()` accessor, and Decision 2 for why interpolated
// entries are functions rather than a template-substitution helper.
// "1 Stimme" / "n Stimmen": the one place the singular is decided.
const votesLabel = (n: number) => (n === 1 ? "1 Stimme" : `${n} Stimmen`);

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
    // The menu row back to Start from the organisation surface, mirroring "Zur Organisation".
    toDashboard: "Zum Dashboard",
    // Accessible name of the product mark, which links to Start on every signed-in screen.
    homeLink: "flatmate.io, zur Startseite",
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
      // household-sign-in-code D7: the household is named by its sign-in code, "WG-Kennung"
      // (UI label "WG", domain/identity.md §2.1). Prefilled from the device while the resident
      // keeps "angemeldet bleiben" (identity/device-memory).
      householdLabel: "WG-Kennung",
      householdPlaceholder: "z. B. ABCD-EFGH-JKLM",
      // "(?)" beside the field: a resident only sees the Kennung in their own settings (account
      // page), so someone signing in on a new device has to ask a flatmate.
      householdHelpToggle: "(?)",
      householdHelpToggleLabel: "Was ist die WG-Kennung?",
      householdHelpHeading: "Deine WG-Kennung",
      householdHelpBody:
        "Frag eine Mitbewohnerin oder einen Mitbewohner danach. Wer schon angemeldet ist, findet die Kennung unter Einstellungen.",
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
      // auth-provider-deadline D8/D10: redeemPasswordReset's `reset_outcome_unknown` — neither
      // phase 2's write nor any check of it (nor phase 3's own sign-in) could be confirmed either
      // way. Wording by the human, 2026-10-06: where something failed, the text apologises, and it
      // stays personal rather than corporate.
      passwordResetUnknownNote:
        "Sorry, da ist etwas schiefgelaufen: Ob dein neues Passwort gespeichert wurde, lässt sich " +
        "gerade nicht feststellen. Versuch dich damit anzumelden. " +
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
        missingFields: "Haushalt und Name sind erforderlich.", // signIn, resident branch
        invalidHousehold: "Diese WG-Kennung sieht ungültig aus.", // signInResidentByHouseholdCode / signIn
        // signIn's "No such resident in this household" and "Invalid credentials" converge on this single text — design.md Decision 5 / proposal.md
        // Assumption 6: telling the two apart would let an unauthenticated visitor learn whether
        // a display name exists in the household.
        invalidCredentials: "Diese Anmeldedaten sind ungültig.",
        noHousehold: "Dieses Konto ist keinem Haushalt zugeordnet.", // auth.ts:366
        noMembership: "Für dieses Konto besteht keine Mitgliedschaft.", // auth.ts:372
        // auth-provider-deadline D10: the identity provider's answer never arrived — never shown as
        // "invalid credentials" (identity/sign-in). Wording by the human, 2026-10-06: apologetic
        // and personal.
        providerUnavailable: "Sorry, die Anmeldung klappt gerade nicht. Versuch es gleich noch einmal.",
        // household-sign-in-code D5 (03-PRD §6.5): says to wait, never that the credentials were
        // wrong. Drafted for this change; the wording awaits the human's review.
        tooManyAttempts: "Es gab zu viele Anmeldeversuche. Bitte warte einige Minuten und versuche es dann erneut.",
      },
      // Decision 6: a third-party (Supabase Auth) or genuinely unanticipated failure past the
      // point a domain error could describe it. The real message still reaches the log.
      genericSignInFailure: "Die Anmeldung ist fehlgeschlagen. Bitte versuche es erneut.",
    },
  },
  org: {
    // AC-1.6: the interface states which identity a session is acting as. identity/repository.ts's
    // getIdentityLabel returns structured data, not a display string, so the German composition
    // lives here rather than as an English literal in the repository layer.
    identityHousehold: (householdName: string) => `${householdName} (Verwaltung)`,
    identityHouseholdFallback: "Haushaltsverwaltung",
    identityResidentFallback: "Bewohner:in",
    // role-permissions design D9: the one message every organisation page shows a caller whose
    // stored permissions grant no organisation action (a plain resident, or a moderator demoted
    // since the page was last loaded), with the way back to Start.
    accessDenied: {
      heading: "Organisation",
      body: "Dieser Bereich ist für Verwaltung und Moderation.",
    },
    dashboard: {
      heading: "Organisation",
      activeRoundEyebrow: "Aktuelle Runde",
      asNextEyebrow: "Als nächstes",
      openFirstRoundHeading: "Eröffne deine erste Casting-Runde",
      openFirstRoundBody: "Noch läuft nichts — eröffne eine Runde, sobald du Zimmer zum Besetzen hast.",
      openNewRound: "Neue Runde eröffnen",
      openAnotherRound: "Weitere Runde eröffnen",
      // D13 (application-capture): the household account and any session without manage_rounds is
      // not offered the way to open a round; runs of the round are the moderation's (S-50/U-20).
      noRoundYetHeading: "Noch keine Runde",
      noRoundYetBody: "Casting-Runden eröffnet die Moderation der WG.",
      // founding-link-moderator D4 (2026-10-06): drafts for the human to confirm. Shown to the
      // household account while the founding link is still unused.
      foundingJoinHeading: "Tritt deiner WG selbst bei",
      foundingJoinBody:
        "Über deinen Gründungslink wirst du Bewohner:in und Moderator:in. Nur für dich — gib ihn nicht weiter.",
      foundingJoinButton: "Jetzt beitreten",
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
      // founding-link-moderator D4 (2026-10-06): drafts for the human to confirm. The founder's own
      // link, while it can still be used: not to be passed on, since joining through it makes the
      // joiner moderator.
      foundingLinkLabel: "Dein Gründungslink",
      foundingLinkHint: "Nur für dich. Wer darüber beitritt, wird Moderator:in.",
      // R3 (Copilot round, PR #56): the same row for a moderator, who also sees this screen and is
      // not the founder. Caller-neutral drafts, for the human to confirm.
      foundingLinkLabelNeutral: "Gründungslink",
      foundingLinkHintNeutral:
        "Gedacht für die Person, die die WG angelegt hat. Wer darüber beitritt, wird Moderator:in.",
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
      resetLinkNotNeeded: "Hat eine E-Mail-Adresse hinterlegt, ein Passwort-Link ist nicht nötig.",
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
    // A prepared profile (never claimed, no account) is deleted from the household record.
    deletePrepared: "Profil löschen",
    // Removal of a prepared profile is terminal (prepared -> removed), so it asks first, like a link.
    deletePreparedDialog: {
      heading: "Profil löschen?",
      consequence: (displayName: string) =>
        `Das Profil von ${displayName} wird gelöscht. Noch nicht verwendete Einladungen für dieses Profil werden mitgelöscht. Das kann nicht rückgängig gemacht werden.`,
    },
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
      // The notice is rendered in three parts so the middle one can be the link to the rooms page.
      noRoomsYetBefore: "Noch keine Zimmer — lege zuerst eins auf der ",
      noRoomsYetLink: "Zimmer-Seite",
      noRoomsYetAfter: " an.",
      submit: "Runde eröffnen",
      submitPending: "Wird eröffnet…",
    },
    detail: {
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
      // Step 1 of the correction: the message is already there (capture's intro asks to paste it).
      messageIntro: "Hier steht die Nachricht der Person, so wie sie gespeichert ist. Die übrigen Angaben kommen im nächsten Schritt.",
      // Shown to a member without create_application; the action refuses anyway.
      permissionDenied: "Bewerbungen bearbeitet die Moderation der WG.",
      // Refused as stale: someone corrected the application after the form was loaded (D4 c).
      stale: "Die Bewerbung wurde inzwischen geändert. Lade die Seite neu, um die aktuelle Fassung zu sehen.",
      // The refusals whose capture wording names capturing („erfassen"): in the correction form
      // they name correcting instead (Copilot, PR #41). Every other code reads the same in both.
      errors: {
        permission_denied: "Du hast keine Berechtigung, Bewerbungen zu bearbeiten.",
        profile_required: "Bewerbungen können nur Bewohner:innen bearbeiten.",
      },
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
      // The notice's own short title. Distinct from the applicant notice's toggle („Datenschutz-Hinweis
      // anzeigen"), which the detail page shows beside it. Human decision 2026-10-05.
      thirdPartyNoticeTitle: "Die Person informieren",
      // Two quiet lines under the title (design D6): this one, then deadlineLine. Together they state
      // both deadlines of FR-3.11, the first message and the one-month date.
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
    accessDeniedBody: "Das Abstimmungsverfahren legt die Verwaltung fest.",
    // household-sign-in-code D7 (O20): the code the administration passes on.
    signInCode: {
      heading: "WG-Kennung",
      hint: "Bewohner:innen brauchen diese WG-Kennung, um sich mit ihrem Namen anzumelden.",
    },
    // FR-1.21 (relaxed 2026-10-05): editable while a round runs; the round keeps its own copy.
    appliesToNextRound: (roundTitle: string) =>
      `Änderungen gelten für Runden, die du danach eröffnest. „${roundTitle}" läuft weiter ` +
      `mit den Regeln, mit denen sie eröffnet wurde.`,
    quorumShareLabel: "Quorum-Anteil",
    // F5 candidate-detail D7 (human, 2026-10-07): the label is fixed; the hint names the anchoring
    // trade-off (screens/O-organisation.md, Abstimmungsverfahren).
    revealVoteAuthorshipLabel: "Stimmen-Urheberschaft zeigen",
    revealVoteAuthorshipHint:
      "Dann seht ihr in der Einzelansicht einer Bewerbung, wer wie abgestimmt hat. Das kann spätere Stimmen beeinflussen, weil sich viele an anderen orientieren.",
    save: "Speichern",
    savePending: "Wird gespeichert…",
    saved: "Gespeichert.",
    errors: {
      // settings/actions.ts maps any thrown Error (e.g. PermissionDeniedError, whose message
      // carries a raw permission slug) to this one generic text instead of passing it through.
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
    // founding-link-moderator D3 (2026-10-06): DRAFT for the human to confirm. Shown to the
    // household account opening its own founding link.
    foundingJoinNote:
      "Du wirst dabei als Verwaltung abgemeldet und bist danach als Bewohner:in und Moderator:in angemeldet.",
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
    strangerNotice: "Erkennst du jemanden auf dieser Liste nicht wieder, gib sofort einer moderierenden Person Bescheid.",
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
    voteTaskButton: "Jetzt abstimmen",
    reasonDated: (dateLabel: string) => `Stimme ab bis ${dateLabel}.`,
    reasonOverdue: "Die Frist ist abgelaufen — deine Stimme zählt trotzdem noch.",
    reasonUndated: (roundTitle: string) => `In der Runde „${roundTitle}" wird gerade abgestimmt.`,
    andNMore: (n: number) => `und ${n} weitere`,
    // Start names no single phase (human decision 2026-10-06); this is the one label it still uses.
    waitingForApplications: "Warten auf Bewerbungen",
    // The neutral heading when the standing is neither waiting nor fully rated.
    standingHeading: "So steht die Runde",
    // design.md Decision 6: the four display buckets beneath the phase, non-zero only.
    distribution: {
      in_screening: (n: number) => `Für ${n} Bewerber:innen wird noch abgestimmt`,
      in_scheduling: (n: number) => `${n} schon eingeladen`,
      interviewed: (n: number) => `${n} gecastet`,
      in_offer: (n: number) => `${n} zugesagt`,
    },
    // B1's acknowledgement after the last open application is rated (human decision 2026-10-06;
    // the exact wording stays open, P-O-04).
    allRated: "Stark gemacht — du hast für alle Bewerbungen gevotet!",
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
  // F4 change 1 (screening-pass): the Casting tab is the D1 shell until F5 builds the ranking. No
  // evaluative text (C-4.11), no scores, and nothing about revising (C1 decision 2026-09-15).
  // F5 change 1: screen D1, the scoreboard. Copy about the PROCESS, never about a person (C-10,
  // AC-5.28), and no "Gewinner". Every number named here maps to a real threshold of the round.
  casting: {
    rankingHeading: "Rangliste",
    backToStart: "Zurück zu Start",
    votes: votesLabel,
    scoreOf: (n: number) => `aus ${votesLabel(n)}`,
    ringLabel: (score: number, n: number) => `${score} von 100 Punkten, aus ${votesLabel(n)}`,
    unscored: (needed: number, n: number) =>
      `Noch kein Score — für ein faires Bild braucht es mindestens ${votesLabel(needed)} (bisher ${n}).`,
    hidden: "Verdeckt — du hast hier nicht abgestimmt",
    // The three groups of the board (design D10, human decision 2026-10-06).
    scoredHeading: "Score",
    invitedHeading: "Eingeladen",
    hiddenHeading: "Verdeckt",
    // Under the round's title, so the highlight explains itself (human walkthrough 2026-10-06).
    // N is the round's open rooms, the same N that decides how many rows are highlighted.
    openRooms: (n: number) =>
      n === 0
        ? "Kein Zimmer frei in dieser Runde"
        : n === 1
          ? "1 Zimmer frei — der höchste Score ist hervorgehoben"
          : `${n} Zimmer frei — die ${n} höchsten Scores sind hervorgehoben`,
    leadingLabel: (n: number) =>
      n === 1 ? "Unter dem höchsten Score — 1 Zimmer frei" : `Unter den ${n} höchsten Scores — ${n} Zimmer frei`,
    rulesToggle: "(?)",
    rulesToggleLabel: "So entsteht die Rangliste",
    rulesHeading: "So wird der Score berechnet",
    formula:
      "Der Score ist der Mittelwert der Punkte aller Stimmen, geteilt durch die höchste Stufe, mal 100; x,5 wird aufgerundet.",
    quorumRule: (needed: number, denominator: number) => `Für die Berechnung des Scores reichen ${needed} von ${denominator} möglichen Stimmen`,
    empty: (title: string | null) =>
      title === null
        ? "Gerade läuft keine Runde, an der du teilnimmst."
        : `In „${title}“ gibt es noch nichts zu sehen.`,
    refusal: {
      notEligible: "Diese Runde kannst du gerade nicht einsehen.",
      rulesInvalid: "Die Regeln dieser Runde lassen sich gerade nicht lesen. Bitte melde dich bei der Verwaltung.",
      notAvailable: (statusLabel: string) => `Die Rangliste dieser Runde ist gerade nicht verfügbar (Stand: ${statusLabel}).`,
    },
    // F5 candidate-detail D9 (human decision 2026-10-07): the group of applications out of the
    // running, collapsed. It says neither that the person is finished nor anything judging (C-10).
    closedHeading: "Ausgeblendet",
    closedCount: (n: number) => `(${n})`,
    // F5 candidate-detail, screen D2 (the candidate's card).
    detail: {
      back: "Zurück zur Rangliste",
      close: "Schließen",
      closeLabel: "Karte schließen",
      sheetTitle: "Details zur Bewerbung",
      // One part of the distribution's text equivalent: „2× Unbedingt".
      distributionPart: (n: number, ratingLabel: string) => `${n}× ${ratingLabel}`,
      distributionLabel: (text: string) => `Verteilung der Stimmen: ${text}`,
      participation: (n: number, denominator: number) => `${n} von ${denominator} haben abgestimmt`,
      formerNote: (x: number) =>
        x === 1
          ? "1 Stimme entfernt, weil sie von ehemaligen Bewohnenden stammt"
          : `${x} Stimmen entfernt, weil sie von ehemaligen Bewohnenden stammen`,
      needed: (stillNeeded: number, needed: number) =>
        `Noch ${votesLabel(stillNeeded)} nötig — für ein faires Bild braucht es mindestens ${votesLabel(needed)}.`,
      hiddenExplanation: "Das Ergebnis siehst du, sobald du selbst abgestimmt hast.",
      hiddenAction: "Jetzt abstimmen",
      votersHeading: "Haben abgestimmt",
      authorshipHeading: "Wer wie abgestimmt hat",
      nobody: "niemand",
      notFound: "Sorry, diese Bewerbung finde ich hier nicht.",
      arithmeticToggleLabel: "So entsteht der Score",
      arithmeticHeading: "So wurde dieser Score berechnet",
      roundedUp: "(x,5 aufgerundet)",
    },
  },
  // F4 change 1: screen C1, the screening pass. The four labels are the settled German ones
  // (Nein · Eher nicht · Finde gut · Unbedingt); how the weights are phrased is P-O-04 and stays
  // reword-able here. The buttons carry no numbers (human decision Q-3, 2026-09-30); the weights
  // sit behind the "(?)" pop-over.
  screening: {
    ratings: {
      no: "Nein",
      rather_not: "Eher nicht",
      good: "Finde gut",
      definitely: "Unbedingt",
    },
    // The visually hidden companion to the check glyph on the selected rating, so the selected
    // level is never told by colour alone (FR-4.19).
    selected: "gewählt",
    favouriteNote: "(für deinen Favoriten)",
    progress: (n: number, total: number) => `${n} von ${total}`,
    progressLabel: "Fortschritt beim Sichten",
    ratingGroupLabel: "Deine Bewertung",
    weightsToggle: "(?)",
    weightsToggleLabel: "Punkte der Stufen anzeigen",
    weightsHeading: "Punkte der Stufen",
    weightsSentence: (rather: string, good: string) => `Der große Sprung liegt zwischen ${rather} und ${good}.`,
    points: (n: number) => (n === 1 ? "1 Punkt" : `${n} Punkte`),
    ageYears: (n: number) => `${n} Jahre`,
    empty: "Nichts wartet auf dich",
    emptyBody: "Du hast alles bewertet, was gerade ansteht.",
    refusal: {
      roundNotOpen: (statusLabel: string) =>
        `Diese Runde ist gerade nicht offen (Stand: ${statusLabel}). Stimmen sind jetzt nicht möglich, deine bisherigen bleiben.`,
      // The same refusal when the round's state could not be read (code review, 2026-10-02).
      roundNotOpenUnknown:
        "Diese Runde ist gerade nicht offen. Stimmen sind jetzt nicht möglich, deine bisherigen bleiben.",
      notEligible: "Du kannst in dieser Runde gerade nicht abstimmen.",
      rulesInvalid: "Die Regeln dieser Runde lassen sich gerade nicht lesen. Bitte melde dich bei der Verwaltung.",
      voteFailed: "Das hat nicht geklappt — nichts ist verloren. Nochmal?",
    },
    back: "Zurück",
    backAria: "Zurück zur vorherigen Bewerbung",
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
        // auth-provider-deadline D10: the identity provider's answer never arrived and could not
        // be resolved — nothing was changed. Wording by the human, 2026-10-06: apologetic and
        // personal.
        providerUnavailable:
          "Sorry, das hat gerade nicht geklappt. Deine E-Mail-Adresse wurde nicht geändert – versuch es gleich noch einmal.",
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
        // auth-provider-deadline D10: the current password could not be checked — nothing was
        // changed. Wording by the human, 2026-10-06: apologetic and personal.
        providerUnavailable:
          "Sorry, das hat gerade nicht geklappt. Dein Passwort wurde nicht geändert – versuch es gleich noch einmal.",
        // D7's SAFE DIRECTION (pre-mortem findings 3/4): an unanswered write may still apply later,
        // after this lock releases — every other session already ended as a precaution, whatever
        // is found afterwards. The texts say so as "überall sonst abgemeldet", not "Sitzungen".
        unchangedSessionsEnded:
          "Sorry, das hat nicht geklappt – dein Passwort ist unverändert. " +
          "Zur Sicherheit wurdest du überall sonst abgemeldet. Versuch es gleich noch einmal.",
        uncertainSessionsEnded:
          "Sorry, da ist etwas schiefgelaufen: Ob dein neues Passwort gespeichert wurde, lässt sich " +
          "gerade nicht feststellen. Zur Sicherheit wurdest du überall sonst abgemeldet. Probier beim " +
          "nächsten Anmelden erst das neue Passwort, dann das alte – und ändere es danach am besten " +
          "noch einmal.",
      },
    },
    signOut: {
      heading: "Abmelden",
    },
    // household-sign-in-code D7 (E1): "WG" is the UI label (domain/identity.md §2.1).
    household: {
      heading: "Deine WG",
      hint: "Mit dieser WG-Kennung und deinem Namen meldest du dich an.",
    },
  },
  // F5 candidate-invite (design D4, Open Questions): „Einladen" on the scoreboard's rows and on the
  // organisation's application detail. FIRST DRAFT of the copy (proposal A-4), for the human to edit
  // after the walkthrough. The text panel is `applications.notice.*`, reused by reference.
  invite: {
    open: "Einladen",
    openLabel: (name: string) => `${name} einladen`,
    heading: (name: string) => `${name} einladen`,
    intro:
      "Hier ist ein Vorschlag für deine Nachricht. Du kannst ihn ändern und kopieren — Flatmate verschickt nichts.",
    // The whole example text: the greeting and the invitation. No privacy notice (human decision 2026-10-06).
    text: (v: { name: string }) =>
      `Hey ${v.name}, wir würden dich gern kennenlernen! Wann hättest du in den nächsten Tagen Zeit für ein Treffen bei uns?`,
    confirm: "Eingeladen!",
    confirmHint: "Erst klicken, wenn du die Nachricht verschickt hast.",
    // One calm sentence per action code (feedback_german_ui_error_tone: apologise, du-tone).
    refusal: {
      not_found: "Sorry, diese Bewerbung gibt es hier nicht mehr. Lade die Seite bitte neu.",
      not_invitable: "Sorry, diese Bewerbung lässt sich gerade nicht einladen. Lade die Seite bitte neu.",
      not_allowed: "Sorry, du darfst hier nicht einladen.",
      no_session: "Sorry, du bist nicht mehr angemeldet. Melde dich bitte neu an.",
      failed: "Sorry, das hat gerade nicht geklappt. Versuch es bitte noch einmal.",
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
  // language-switch D8/A2: each language is named in its own language in BOTH tables, so a person
  // who cannot read the current one still finds theirs. `toggleLabel` is the control's accessible
  // name; the visible text is the endonym of the language the toggle switches TO.
  language: {
    names: { de: "Deutsch", en: "English" },
    toggleLabel: "Sprache wechseln",
  },
  document: {
    description: "Das Tool, mit dem die WG entscheidet.",
  },
} as const;
