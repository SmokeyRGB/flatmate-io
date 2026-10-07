// The single key→text table for v0.1 (English). Every user-facing string in the application is
// resolved from here — no component, server action or test holds a user-facing literal.
// docs/screens/rahmenwerk.md §8.6 (the "Übersetzungstabelle", U-24) is the authority wherever it
// has an entry, cited per entry below; everywhere else this is new copy for this change
// (openspec/changes/german-ui-vocabulary, Assumption 1). See design.md Decisions 1–3 for why this
// is a plain `as const` object rather than a `t()` accessor, and Decision 2 for why interpolated
// entries are functions rather than a template-substitution helper.
import type { Strings } from "./index";

// "1 vote" / "n votes": the one place the singular is decided.
const votesLabel = (n: number) => (n === 1 ? "1 vote" : `${n} votes`);

export const en = {
  common: {
    // src/ui/password-input.tsx: the eye toggle beside every password field.
    showPassword: "Show password",
    hidePassword: "Hide password",
    // src/ui/success-toast.tsx: closes the success notice.
    close: "Close",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    add: "Add",
    edit: "Edit",
    rename: "Rename",
    reactivate: "Reactivate",
    signOut: "Sign out",
    // §8.6: "Hartes Entfernen (U-27)" → „Entfernen" — the permanent, confirmation-gated removal.
    // Reused verbatim for the room-removal action too; §8.6 itself notes reuse of a term across
    // list contexts is fine when the context disambiguates it.
    remove: "Remove",
    // §8.6: "`join_code` ungültig machen (O16)" → „Löschen" — never a synonym.
    delete: "Delete",
    // loading-feedback design.md D8: SubmitButton's status-region text, announced only while a
    // form is submitting (src/ui/submit-button.tsx).
    pending: "Submitting …",
    // loading-feedback design.md D8: the skeleton container's visually hidden label
    // (src/ui/skeletons.tsx, every new loading.tsx).
    loading: "Loading …",
  },
  nav: {
    // The organisation hub screen is titled "Organisation" (matches the shared vocabulary already
    // used in screens/O-organisation.md and the prototype's own back-link pattern); every
    // sub-screen's back link points there under the same label.
    organisation: "Organisation",
    // start-screen: the resident frame's bottom bar / header nav (rahmenwerk.md §4.1) and every
    // back-link that now points at B1 instead of O1.
    start: "Home",
    // The menu row back to Start from the organisation surface, mirroring "Zur Organisation".
    toDashboard: "To the dashboard",
    // Accessible name of the product mark, which links to Start on every signed-in screen.
    homeLink: "flatmate.io, to the home page",
    casting: "Casting",
    whoLivesHere: "Who lives here",
    members: "Members",
    toOrganisation: "To organisation",
    accountSettings: "Settings",
    // The menu trigger's accessible name carries the identity (AC-1.6), not just the action;
    // <details> exposes its own expanded/collapsed state, so the label does not say "öffnen".
    menuFor: (displayName: string) => `Menu for ${displayName}`,
    mainNavigation: "Main navigation",
  },
  status: {
    // Room states (data-model.md "Room", six states, FR-1.10) are read by a resident whenever a
    // room list or badge renders — not covered by §8.6, so written for this change.
    room: {
      planned: "Planned",
      open: "Open",
      promised: "Promised",
      occupied: "Occupied",
      on_hold: "Paused",
      not_available: "Not available",
    },
    // CastingRound states (data-model.md "CastingRound", five states, FR-1.13) — same reasoning.
    round: {
      draft: "Draft",
      open: "Open",
      paused: "Paused",
      closed: "Closed",
      archived: "Archived",
    },
    // Application states (data-model.md "Application", eleven states): the words of §8.6
    // (ergänzt 2026-09-28, F3-Vorprüfung), verbatim. They describe where the PROCESS stands, never
    // the person (C-10). tests/unit/casting/application-state-words.test.ts keeps the keys equal to
    // the enum's values.
    application: {
      new: "New",
      screened: "Screened",
      invited: "Invited",
      scheduled: "Scheduled",
      interviewed: "Met",
      offer_made: "Offer made",
      moved_in: "Moved in",
      rejected_by_household: "Declined by household",
      declined_by_applicant: "Declined by applicant",
      withdrawn: "Withdrawn",
      archived: "Archived",
    },
    // §8.6: "`moved_out` (weich)" → „Ausgezogen" — the reversible removal tier's status label.
    // Kept distinguishable from common.remove ("Entfernen", the permanent tier) per U-27.
    movedOut: "Moved out",
  },
  auth: {
    signIn: {
      heading: "Sign in",
      tabHousehold: "Household",
      tabResident: "Resident",
      emailLabel: "Email",
      // household-sign-in-code D7: the household is named by its sign-in code, "WG-Kennung"
      // (UI label "WG", domain/identity.md §2.1). Prefilled from the device while the resident
      // keeps "angemeldet bleiben" (identity/device-memory).
      householdLabel: "Household code",
      householdPlaceholder: "e.g. ABCD-EFGH-JKLM",
      // "(?)" beside the field: a resident only sees the Kennung in their own settings (account
      // page), so someone signing in on a new device has to ask a flatmate.
      householdHelpToggle: "(?)",
      householdHelpToggleLabel: "What is the household code?",
      householdHelpHeading: "Your household code",
      householdHelpBody:
        "Ask a flatmate for it. Anyone already signed in can find the code under Settings.",
      nameLabel: "Your name",
      passwordLabel: "Password",
      submit: "Sign in",
      submitPending: "Signing in…",
      // join-screen (FR-2.27, A1 "Ohne Anmeldung erreichbar"): the two ways in that are not
      // sign-in itself, offered as links beneath the card — `.btn-link` (design.md Decision 8).
      foundHousehold: "Create household",
      enterJoinCode: "Enter join code",
      // resident-settings (human decision 2026-09-24, walkthrough): a resident with an email signs
      // in on the resident tab, switching between the name fields and the email field. The
      // household tab still accepts a resident's address, but no longer advertises it.
      residentUseEmail: "Sign in with email address",
      residentUseName: "Sign in with name",
      // Copilot review round 2 (PR #23), auth.ts redeemPasswordReset's `reset_done_sign_in_failed`
      // (phase 3): the reset itself already succeeded (password set in phase 2, prior sessions
      // revoked in phase 1, link spent) — only the immediate sign-in afterwards failed, so this is
      // a note beside the ordinary form, not an error. Recreated exactly as in commit a95bbb9.
      passwordResetNote: "Your new password is set. Sign in with it.",
      // auth-provider-deadline D8/D10: redeemPasswordReset's `reset_outcome_unknown` — neither
      // phase 2's write nor any check of it (nor phase 3's own sign-in) could be confirmed either
      // way. Wording by the human, 2026-10-06: where something failed, the text apologises, and it
      // stays personal rather than corporate.
      passwordResetUnknownNote:
        "Sorry, something went wrong: It is currently not possible to tell whether your new password was saved. " +
        "Try signing in with it. If that does not work, please ask the administration for a new link.",
    },
    register: {
      heading: "Create household",
      emailVisibleNotice: "This email address is visible to everyone who joins your household.",
      emailLabel: "Email",
      passwordLabel: "Password",
      // design.md Decision 6: a second step of the same form, revealed client-side, one submit —
      // not a second route. Step 1 keeps A1's exact two fields (email, password); step 2 asks for
      // the household name, with an example rather than an empty box (its whole job is to be
      // recognised by somebody opening a join link).
      next: "Next",
      back: "Back",
      householdNameHeading: "What should your household be called?",
      householdNameLabel: "Household name",
      householdNamePlaceholder: "e.g. Hauptstraße 12",
      submit: "Create household",
      submitPending: "Creating household…",
    },
    // Decision 4/6: a domain error class is not one message, and a third-party or unexpected
    // failure never shows its own wording. These are the resolved texts an action's exhaustive
    // `switch (err.code)` maps to; the class's own `message` stays English, for the log only.
    errors: {
      register: {
        // auth.ts:36 — also used directly by register/actions.ts's own pre-submit field check, so
        // the same copy appears whether the field check fires client-side-early or server-side.
        missingEmail: "Email address is required.",
        missingPassword: "Password is required.", // auth.ts:37
        // join-by-link (FR-2.9/AC-2.1): registerHousehold's third required field — a whitespace-only
        // name is refused with this same text (auth.ts trims before checking).
        missingName: "Household name is required.",
        signupFailed: "Registration failed. Please try again.", // auth.ts:51
      },
      signIn: {
        missingFields: "Household and name are required.", // signIn, resident branch
        invalidHousehold: "This household code looks invalid.", // signInResidentByHouseholdCode / signIn
        // signIn's "No such resident in this household" and "Invalid credentials" converge on this single text — design.md Decision 5 / proposal.md
        // Assumption 6: telling the two apart would let an unauthenticated visitor learn whether
        // a display name exists in the household.
        invalidCredentials: "These credentials are invalid.",
        noHousehold: "This account is not associated with a household.", // auth.ts:366
        noMembership: "This account has no membership.", // auth.ts:372
        // auth-provider-deadline D10: the identity provider's answer never arrived — never shown as
        // "invalid credentials" (identity/sign-in). Wording by the human, 2026-10-06: apologetic
        // and personal.
        providerUnavailable: "Sorry, sign-in is not working right now. Please try again in a moment.",
        // household-sign-in-code D5 (03-PRD §6.5): says to wait, never that the credentials were
        // wrong. Drafted for this change; the wording awaits the human's review.
        tooManyAttempts: "There have been too many sign-in attempts. Please wait a few minutes and try again.",
      },
      // Decision 6: a third-party (Supabase Auth) or genuinely unanticipated failure past the
      // point a domain error could describe it. The real message still reaches the log.
      genericSignInFailure: "Sign-in failed. Please try again.",
    },
  },
  org: {
    // AC-1.6: the interface states which identity a session is acting as. identity/repository.ts's
    // getIdentityLabel returns structured data, not a display string, so the German composition
    // lives here rather than as an English literal in the repository layer.
    identityHousehold: (householdName: string) => `${householdName} (Administration)`,
    identityHouseholdFallback: "Household administration",
    identityResidentFallback: "Resident",
    // role-permissions design D9: the one message every organisation page shows a caller whose
    // stored permissions grant no organisation action (a plain resident, or a moderator demoted
    // since the page was last loaded), with the way back to Start.
    accessDenied: {
      heading: "Organisation",
      body: "This area is for administration and moderation.",
    },
    dashboard: {
      heading: "Organisation",
      activeRoundEyebrow: "Current round",
      asNextEyebrow: "Up next",
      openFirstRoundHeading: "Open your first casting round",
      openFirstRoundBody: "Nothing is running yet — open a round when you have rooms to fill.",
      openNewRound: "Open new round",
      openAnotherRound: "Open another round",
      // D13 (application-capture): the household account and any session without manage_rounds is
      // not offered the way to open a round; runs of the round are the moderation's (S-50/U-20).
      noRoundYetHeading: "No round yet",
      noRoundYetBody: "The household's moderators open casting rounds.",
      // founding-link-moderator D4 (2026-10-06): drafts for the human to confirm. Shown to the
      // household account while the founding link is still unused.
      foundingJoinHeading: "Join your household yourself",
      foundingJoinBody:
        "Your founding link makes you a resident and moderator. It is for you only — do not share it.",
      foundingJoinButton: "Join now",
      otherRoundsHeading: "Other rounds",
      roomsLink: "Rooms",
      membersLink: "Members",
      settingsLink: "Settings",
      whoLivesHereLink: "Who lives here",
    },
  },
  members: {
    heading: "Members",
    accessDeniedBody: "This list is for administration and moderation.",
    accessDeniedLinkPrefix: "If you want to see who lives here, use",
    addResidentPlaceholder: "Display name",
    addResidentSubmit: "Add resident",
    // join-by-link design.md Decision 13: `/claim` is gone — a prepared profile is claimed only
    // through a link bound to it (task 12.8's per-profile "Einladung erzeugen" action, rendered
    // below in this same list once the profile exists).
    addResidentHelperInviteNote: "Then create an invitation for this person below in the list.",
    noOneJoinedYet: "No one has joined yet — share your invitation link to invite the first person.",
    // join-code-protections (O-18, 2026-09-21): O16 now lists several issued links rather than
    // one rotating code — screens/O-organisation.md O16, in the order warning / create form /
    // list. §8.6 fixes „Einladungslink" and „Löschen" (reused from `common.delete` below, never a
    // synonym); everything else here is new copy for this change.
    joinCode: {
      heading: "Invitation links",
      // founding-link-moderator D4 (2026-10-06): drafts for the human to confirm. The founder's own
      // link, while it can still be used: not to be passed on, since joining through it makes the
      // joiner moderator.
      foundingLinkLabel: "Your founding link",
      foundingLinkHint: "For you only. Anyone who joins through it becomes a moderator.",
      // R3 (Copilot round, PR #56): the same row for a moderator, who also sees this screen and is
      // not the founder. Caller-neutral drafts, for the human to confirm.
      foundingLinkLabelNeutral: "Founding link",
      foundingLinkHintNeutral:
        "For the person who created the household. Anyone who joins through it becomes a moderator.",
      // S-49/FR-2.2: sits beside the links, visible without interaction — never presented as
      // security (C-2.5), just social visibility.
      warning:
        "Share this link directly with your flatmates only — never publicly. Anyone who has it can vote.",
      create: {
        validDaysLabel: "Valid for (days)",
        maxUsesLabel: "Maximum uses",
        // O-15's default of 1 explained in plain text, not just applied silently.
        maxUsesHelper:
          "Default: one link for one person. Increase this only if several people should use the same link.",
        submit: "Create new link",
      },
      usageCount: (uses: number, maxUses: number) => `${uses} of ${maxUses} used`,
      validUntil: (date: string) => `Valid until ${date}`,
      expiredOn: (date: string) => `Expired on ${date}`,
      usedUp: "Used up",
      deletedOn: (date: string) => `Deleted on ${date}`,
      // AC-2.26 (join-by-link): each link names who joined through it — live and dead alike.
      joinedNames: (names: string[]) => `Joined: ${names.join(", ")}`,
      joinedNoneYet: "No one has joined through this link yet.",
      // O-15: "mit einem Tippen verlängerbar" — one action, not a date field.
      extend: "+7 days",
      copyFullLink: "Copy link",
      // FR-2.27: the channel for hand entry (P-1 Kanalneutralität) — not a lesser convenience.
      copyCodeOnly: "Copy code only",
      copiedFullLink: "Link copied",
      copiedCodeOnly: "Code copied",
      deleteAriaLabel: (code: string) => `Delete link ${code}`,
      deleteDialog: {
        heading: "Delete link?",
        consequence:
          "The link becomes invalid immediately. People who already joined through it remain members.",
      },
      empty: "No link created yet.",
      // join-by-link design.md Decision 13 / task 12.8: an invitation bound to one prepared
      // profile — issued beside that profile's own row, not from the general create form above
      // (which always issues a neutral link).
      issueForProfile: "Create invitation for this profile",
      issuedForProfileHeading: "Issued invitation for this profile:",
      // design.md Decision 9 (human decision, 2026-09-22; revised 2026-09-23): shown beside
      // "Löschen" on a LIVE link a removed member joined through — not merely "not yet deleted"
      // (the first version also flagged a used-up or expired link, which can never again be
      // used; caught in the 8.3 walkthrough). Names no one (they're already hidden from the
      // resident list), and is deliberately not framed as a security boundary (C-2.5): the link
      // still works until deleted, this only makes that visible. The wording itself ("kann sie
      // ihn erneut verwenden") still reads correctly for a live link — that is exactly what
      // "live" means.
      removedJoinerCaution:
        "A person who has since been removed joined through this link. As long as you do not " +
        "delete it, they can use it again.",
      // design.md Decision 9 (revised 2026-09-23): the <summary> of O16's collapsed dead-links
      // section (expired, used up or deleted) — states the count so the section is informative
      // even collapsed.
      deadLinksSummary: (n: number) => `No longer usable links (${n})`,
      // resident-settings design.md Decision 8 (O16, identity/password-reset): the row action for
      // a profile whose account has no email yet — household sessions only.
      issueResetLink: "Create password link",
      // E-03/K-18 ("Nicht als Sicherheitsgrenze darstellen"): states plainly what the link can do,
      // shown once a reset link is issued — never framed as protection.
      // Walkthrough fix 2026-09-24: a reset link is not an invitation, so it gets its own heading
      // instead of issuedForProfileHeading.
      resetLinkNotNeeded: "An email address is on file, so a password link is not needed.",
      resetLinkIssuedHeading: "Issued password link for this profile:",
      resetLinkIssuedCaution: "Anyone who opens this link can set this person’s password.",
      // The link-history label for a reset row, replacing the invitation label (design.md
      // Decision 8: "Passwort-Link für <Name>" instead of an invitation).
      resetLinkForName: (displayName: string) => `Password link for ${displayName}`,
      // review fix (PR #23 finding): getResidentList (PR #18 decision) hides a removed profile's
      // name entirely (O16 never shows who a removed person was) — so a reset link whose target
      // was later removed cannot look the name up in profileNameById. Never fall back to showing
      // the name some other way (that would contradict #18); this neutral label names no one.
      resetLinkForRemovedPerson: "Password link for a removed person",
      errors: {
        // identity/repository.ts's ResidentProfileNotEligibleForResetError — one throw site, one
        // message, mapped by class (same convention as members.errors.nameMismatch).
        notEligibleForReset:
          "A password link cannot be created for this profile — it is either not " +
          "active, or already has an email address on file.",
      },
    },
    moderationBadge: "Moderation",
    makeModerator: "Make moderator",
    makeMember: "Make member",
    // Verb form of the §8.6 status label (status.movedOut = „Ausgezogen") — this is the action
    // that sets it, not the status display.
    markMovedOut: "Mark as moved out",
    // A prepared profile (never claimed, no account) is deleted from the household record.
    deletePrepared: "Delete profile",
    // Removal of a prepared profile is terminal (prepared -> removed), so it asks first, like a link.
    deletePreparedDialog: {
      heading: "Delete profile?",
      consequence: (displayName: string) =>
        `The profile for ${displayName} will be deleted. Unused invitations for this profile will also be deleted. This cannot be undone.`,
    },
    remove: {
      // §8.6: "Hartes Entfernen (U-27)" → „Entfernen".
      buttonLabel: "Remove",
      ariaLabel: (displayName: string) => `Remove ${displayName}`,
      dialogHeading: (displayName: string) => `Remove ${displayName}?`,
      consequence: "Access is revoked immediately. This cannot be undone.",
      caution:
        'Use this only for someone who joined through the invitation link but ' +
        'does not actually live here. For a real move-out, use “Moved out” instead — ' +
        'this preserves the history and can be reversed with “Reactivate”.',
      confirmLabel: (displayName: string) => `Enter “${displayName}” to confirm`,
      submit: "Remove",
      submitPending: "Removing…",
      cancel: "Cancel",
    },
    errors: {
      // identity/repository.ts's DisplayNameConfirmationMismatchError — one throw site, one
      // message, mapped by class (design.md Decision 4's rejected-alternative case; task 2.3).
      nameMismatch: "The entered name does not match the member.",
      genericRemoveFailure:
        "This member could not be removed — the data may have " +
        "changed. Refresh the page and try again.",
    },
  },
  rooms: {
    heading: "Rooms",
    // new-room-dialog.tsx: the header button opens the dialog; the dialog's own submit creates.
    addSubmit: "New room",
    create: {
      heading: "New room",
      labelField: "Name",
      labelPlaceholder: "e.g. Room 3",
      submit: "Create room",
      submitPending: "Creating…",
      labelRequired: "Enter a name for the room.",
      genericFailure: "The room could not be created. Please try again.",
    },
    changeState: "Change status",
    remove: "Remove",
  },
  rounds: {
    new: {
      heading: "Open casting round",
      permissionDenied: "You do not have permission to open a casting round.",
      titleLabel: "Round title",
      titlePlaceholder: "e.g. Autumn replacement",
      roomsLegend: "Rooms in this round",
      // The notice is rendered in three parts so the middle one can be the link to the rooms page.
      noRoomsYetBefore: "No rooms yet — create one first on the ",
      noRoomsYetLink: "Rooms page",
      noRoomsYetAfter: " an.",
      submit: "Open round",
      submitPending: "Opening…",
    },
    detail: {
      participantsHeading: "Participating residents",
      // F3 change 2: shown only to a session holding create_application, for an open round.
      captureApplication: "Capture application",
    },
    errors: {
      // casting/repository.ts's RoundOpenPreconditionError — not enumerated in tasks.md's error
      // list, but its message reaches this same form (rounds/new/actions.ts) exactly like the
      // classes tasks.md does name, including a raw round id in one branch. Given the same code
      // discriminant treatment as design.md Decision 4 — see the implementation report.
      noRoomsSelected: "This round has no selected rooms yet.",
      roomsUnavailable: "All rooms in this round are already occupied or unavailable.",
      noEligibleResidents: "There are no eligible residents to vote in this round.",
      genericPreconditionFailure: "This round cannot be opened right now.",
      // identity/repository.ts's PermissionDeniedError — left uncoded (task 2.3: every call site
      // resolves to the same "not allowed" outcome for the user, see the implementation report),
      // mapped by class to one generic text rather than the raw `Missing permission: …` message.
      permissionDenied: "You do not have permission for this action.",
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
      heading: "Capture application",
      backToRound: "To round",
      // The three steps (design D6): Nachricht, Angaben, Hinweis.
      messageIntro: "Paste the person’s message if you have it. Enter the rest in the next step.",
      next: "Next",
      back: "Back",
      nameLabel: "Name",
      ageLabel: "Age",
      // One contact input, sorted by a fixed rule (design D15). The line under each input says
      // where that contact will be stored.
      contactLabel: "Contact",
      contactLabelMore: "Additional contact",
      contactPlaceholder: "Email, phone number, or another identifier",
      addContact: "+ additional contact",
      // Not „Entfernen": §8.6 reserves that word for removing a member (U-27).
      removeContact: "Omit contact",
      contactStoredAs: {
        email: "Will be stored as an email address",
        phone: "Will be stored as a phone number",
        other: "Will be stored as another type of contact",
      },
      // Names the input that clashes with an earlier one of the same kind.
      contactKindTaken: {
        email: "Only one email address can be stored.",
        phone: "Only one phone number can be stored.",
        other: "Only one other contact can be stored.",
      },
      messageLabel: "Person’s message",
      // Counted in Unicode code points, like the database (assumption A5).
      counter: (used: number, max: number) => `${used} of ${max} characters`,
      limitNear: (max: number) => `At most ${max} characters`,
      attributesLegend: "Additional information",
      openAttributes: "+ Additional information",
      attributeLabelLabel: "Label",
      attributeValueLabel: "Value",
      addAttribute: "Add additional information",
      removeAttribute: "Remove",
      // rahmenwerk.md §8.6 / 03-PRD.md §4.1.3, verbatim.
      collectedFromStatement: "Information provided by the applicant",
      collectedFromCheckbox:
        "The information did not come from the person themselves (e.g. someone recommended them to you)",
      save: "Save",
      savePending: "Saving…",
    },
    // The three non-form states of O3 (the fourth, loading, is loading.tsx).
    states: {
      noOpenRound:
        "Applications can only be captured in an open round. This round is currently not open.",
      // O3 „Keine Berechtigung": why, and who can help.
      permissionDenied:
        "Applications are captured by the household's moderators or someone with permission to do so. Contact them if an application needs to be captured.",
      // rahmenwerk.md §8.6, verbatim.
      householdAccount:
        "The household account manages the household — applications and voting remain with the residents.",
      detailPermissionDenied:
        "This page is for the household's moderators. Contact them if you want to know something about an application.",
    },
    // O4, the round's list of applications (F3 change 3, design D2).
    list: {
      heading: "Applications",
      empty: "No application captured yet",
      // The group heading: the §8.6 state word and the number of applications in it.
      groupLabel: (word: string, count: number) => `${word} · ${count}`,
      age: (years: number) => `${years} years`,
      // Joins the age and the stored contacts on the muted line of a row.
      summarySeparator: " · ",
      loadError: "The applications could not be loaded. Reload the page.",
    },
    // O5's correction form (F3 change 3, design D5).
    edit: {
      heading: "Edit application",
      save: "Save changes",
      savePending: "Saving…",
      updated: "Changes saved",
      // A correction saved without any change writes nothing (FR-3.22), so it says so.
      unchanged: "No changes",
      editLink: "Edit",
      // Step 1 of the correction: the message is already there (capture's intro asks to paste it).
      messageIntro: "Here is the person’s message as it is stored. Enter the remaining information in the next step.",
      // Shown to a member without create_application; the action refuses anyway.
      permissionDenied: "Applications are edited by the household's moderators.",
      // Refused as stale: someone corrected the application after the form was loaded (D4 c).
      stale: "The application has changed since then. Reload the page to see the current version.",
      // The refusals whose capture wording names capturing („erfassen"): in the correction form
      // they name correcting instead (Copilot, PR #41). Every other code reads the same in both.
      errors: {
        permission_denied: "You do not have permission to edit applications.",
        profile_required: "Only residents can edit applications.",
      },
    },
    // Only a code and at most a field name ever reach the form, never a typed value (D4). One
    // text per code; the field is named by the field-level text below where it helps.
    errors: {
      name_required: "Please enter a name.",
      too_long: "An item is too long.",
      invalid_age: "Age must be an integer from 0 to 150.",
      too_many_attributes: "At most 10 additional items are allowed.",
      invalid_attribute:
        "Each additional item needs a name (up to 60 characters) and a value (up to 500 characters).",
      invalid_characters: "A field contains a character that cannot be stored.",
      collected_from_required: "Please specify where the information came from.",
      // Shown beside the contact inputs; the input that clashes gets contactKindTaken above.
      contact_kind_taken: "At most three contacts are allowed: one email, one phone, and one other contact.",
      round_not_found: "This round no longer exists.",
      round_not_open:
        "The round is no longer open, so nothing was saved. Your input is still in the form.",
      permission_denied: "You do not have permission to capture applications.",
      profile_required: "Only residents can capture applications.",
      save_failed: "The application could not be saved. Your input is still in the form.",
      // Only the correction form can return these two.
      not_found: "This application no longer exists.",
      stale: "The application has changed since then. Reload the page to see the current version.",
    },
    saved: "Application saved",
    viewSaved: "View application",
    // The Art. 14 duty and text. `{Datum}` is one month after capture, on the Berlin calendar (A2).
    notice: {
      // The notice's own short title. Distinct from the applicant notice's toggle („Datenschutz-Hinweis
      // anzeigen"), which the detail page shows beside it. Human decision 2026-10-05.
      thirdPartyNoticeTitle: "Inform the person",
      // Two quiet lines under the title (design D6): this one, then deadlineLine. Together they state
      // both deadlines of FR-3.11, the first message and the one-month date.
      informLine: "The person must be told that you have stored their information.",
      // 06-Compliance-Anhang.md §4.5, verbatim apart from its placeholders.
      deadlineLine: (name: string, date: string) =>
        `Ideally send this with your first message to ${name} — no later than ${date}.`,
      deadlineNameFallback: "the person",
      deadlinePassed: (date: string) =>
        `The one-month deadline has already passed (${date}). Inform the person as soon as possible.`,
      textLabel: "Text to copy",
      showExample: "Show example text",
      hideExample: "Hide example text",
      understood: "Got it",
      copy: "Copy text",
      copied: "Text copied",
      regenerate: "Generate text again",
      // A1: the [Link] stays a literal placeholder; say plainly that there is nothing to link to yet.
      linkHint: "[Link] remains because there is no privacy page yet.",
      nameFallback: "{Name}",
      // Category words for {Kategorien}, in the fixed order of noticeCategories().
      categories: {
        name: "Name",
        age: "Age",
        email: "Email address",
        phone: "Phone number",
        other: "additional contact",
        message: "your message",
        attributes: "additional information",
      },
      // 06-Compliance-Anhang.md §4.5 „Stufe 1" (the Art. 13 text for an application collected from
      // the applicant), verbatim, including its fixed „(Name, Kontakt, deine Nachricht)" (A1: only
      // the Art. 14 variant generates its categories, because Art. 14(1)(d) requires them). The
      // bold markers of the source are formatting, not words, and are not part of the copied text.
      applicantText:
        `Privacy at a glance: We store your information (name, contact, your message) as a household to organise room allocation. ` +
        `We also record our impressions from meeting you. No later than 180 days after the process ends, we delete everything again. ` +
        `You can always ask what we have stored — including notes — and have it corrected or deleted. Just contact us here. Details: [Link]`,
      showApplicantNotice: "Show privacy notice",
      hideApplicantNotice: "Hide privacy notice",
      // „Warum steht das hier?" (D3). AWAITING THE HUMAN'S WORDING: the draft below states the
      // household's responsibility in three sentences. Nothing depends on it.
      whyToggle: "Why is this here?",
      why:
        "As a household, you store the information and decide what happens to it. That is why you are responsible for informing the person. " +
        "Flatmate.io only suggests a text and does not send anything itself.",
      // 06-Compliance-Anhang.md §4.5 „Stufe 1, Variante Dritterhebung", verbatim except {Name},
      // {Haushaltsname} and {Kategorien}.
      thirdPartyText: (v: { name: string; household: string; categories: string }) =>
        `Hey ${v.name}, a quick note from ${v.household}: We received your application (${v.categories}) through someone else and stored it for our room search. ` +
        `No later than 180 days after the search ends, we delete everything again. If you do not want to be included or want to know what we have stored about you, ` +
        `just let us know — we will delete it immediately. More info: [Link]`,
    },
    detail: {
      heading: "Application",
      backToRound: "To round",
      capturedNotice: "This application was captured.",
      viaSomeoneElse: "Through someone else",
      fromApplicant: "From the applicant",
      ageLabel: "Age",
      emailLabel: "Email",
      phoneLabel: "Phone",
      otherContactLabel: "Other contact",
      messageLabel: "Person’s message",
      attributesLabel: "Additional information",
      sourceLabel: "How the information reached us",
      empty: "—",
    },
  },
  settings: {
    heading: "Household settings",
    accessDeniedBody: "The administration sets the voting procedure.",
    // household-sign-in-code D7 (O20): the code the administration passes on.
    signInCode: {
      heading: "Household code",
      hint: "Residents need this household code to sign in with their name.",
    },
    // FR-1.21 (relaxed 2026-10-05): editable while a round runs; the round keeps its own copy.
    appliesToNextRound: (roundTitle: string) =>
      `Changes apply to rounds you open afterwards. “${roundTitle}” continues ` +
      `with the rules it was opened with.`,
    quorumShareLabel: "Quorum share",
    // F5 candidate-detail D7 (human, 2026-10-07): the label is fixed; the hint names the anchoring
    // trade-off (screens/O-organisation.md, Abstimmungsverfahren).
    revealVoteAuthorshipLabel: "Show vote authorship",
    revealVoteAuthorshipHint:
      "Everyone will then see who voted how on an application's detail. This can influence later votes, because many people follow others.",
    save: "Save",
    savePending: "Saving…",
    saved: "Saved.",
    errors: {
      // settings/actions.ts maps any thrown Error (e.g. PermissionDeniedError, whose message
      // carries a raw permission slug) to this one generic text instead of passing it through.
      genericSaveFailure: "This change could not be saved.",
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
    heading: () => "You are invited",
    // `screens/A-zugang.md` A3: "Du trittst *WG Hauptstraße 12* bei" — FR-2.9/AC-2.1's household
    // name shown before any field is requested. Now the `.context-chip`'s own text, shown beneath
    // either heading (design.md Decision 8).
    householdChip: (householdName: string) => `You are joining ${householdName}`,
    // join-by-link design.md Decision 13, revised by join-screen design.md Decision 8: a BOUND
    // link's heading is now just the greeting — the invitation itself is the shared household chip
    // above, so the two are never duplicated in one sentence as the old single-string version did.
    boundHeading: (displayName: string) => `Hi ${displayName}!`,
    // founding-link-moderator D3 (2026-10-06): DRAFT for the human to confirm. Shown to the
    // household account opening its own founding link.
    foundingJoinNote:
      "You will be signed out of the administration account and then signed in as a resident and moderator.",
    // identity/password-reset (O-16, screens/A-zugang.md A3 bound shape): a third screen shape,
    // shown when purpose = 'password_reset'. Same greeting as an ordinary bound link — the person
    // is asked only for a new password (spec: "SHALL NOT ask for a name or an email").
    reset: {
      heading: (displayName: string) => `Hi ${displayName}!`,
      // Walkthrough fix 2026-09-24: the join chip ("Du trittst … bei") is wrong here, since the
      // person already belongs. FR-2.9 only needs the household named.
      householdChip: (householdName: string) => `New password for ${householdName}`,
      newPasswordLabel: "New password",
      submit: "Set password",
      submitPending: "Setting…",
    },
    nameLabel: "Name",
    passwordLabel: "Password",
    // FR-2.10a/AC-2.20: the requirement is stated, not discovered by failing once.
    passwordRequirement: (minLength: number) => `At least ${minLength} characters.`,
    emailLabel: "Email (optional)",
    // FR-2.11/C-2.2: a visibly optional, emptily-submittable field — one line of reason, never a
    // request. Matches domain/identity.md §2.1's own rationale for asking at all (self-recovery).
    emailHelper:
      "Optional. With an email address, you can reset your password yourself later.",
    // `screens/A-zugang.md` A3: "Auf diesem Gerät angemeldet bleiben" — pre-selected, clearable
    // (FR-2.12/EC-2.10).
    rememberMeLabel: "Stay signed in on this device",
    submit: "Join",
    submitPending: "Joining…",
    // join-screen design.md Decision 8/10: offered beside the invalid-link refusal, both when the
    // page itself shows it and when a submit produces it (Decision 10's shared component).
    handEntryWayBack: "Enter join code manually",
    // join-screen design.md Decision 7/10: the Keine-Berechtigung sign-out — ends only the
    // visitor's own session and returns to this same invitation (`signOutAndReturnAction`).
    signOutAndReturn: "Sign out",
    errors: {
      // `screens/A-zugang.md` A3, corrected 2026-09-21 against FR-2.8: one message for all four
      // causes (expired, used up, deleted, never existed), naming none of them, plus the way back.
      // join-screen: unchanged text — only the surrounding hand-entry link is new (task 1.1).
      invalidLink: "This invitation link is not valid. Ask your household for a current link.",
      // proposal.md Assumption 3: distinguishable from the invalid-link message — a rate-limited
      // refusal is not a statement about any link (FR-2.8 is about the three link-refusal
      // reasons, not about this).
      rateLimited: "There have been too many attempts from here recently. Please try again shortly.",
      missingFields: "name and password are required.",
      passwordTooShort: (minLength: number) => `Password must be at least ${minLength} characters.`,
      // AC-2.17/EC-2.11: inline, with a way forward — never a dead end. A fixed sentence, never the
      // typed name (PR #20 review): this text is returned in the action state, which next dev's
      // server-function log prints on the next submit, and the name already stands in its own
      // field right above it (join-screen design.md Decision 4).
      nameTaken: "This name is already taken in this household. Choose another.",
      // resident-settings design.md Decision 3: the provider's duplicate-email refusal — names no
      // account, household or person (proposal Assumption 2), same wording style as E1's own.
      emailTaken: "This email address cannot be used.",
      // review fix: joinHousehold now validates the optional email itself (normalizeEmail/
      // isWellFormedEmail) — same wording style as account.email.errors.invalidEmail (E1's own).
      invalidEmail: "That does not look like a valid email address.",
      // EC-2.5/A-2.4: deliberately NOT the invalid-link message — the link is fine.
      otherHousehold:
        "You are signed in to another household. Sign out to join this household.",
      // join-screen design.md Decision 5, corrected in PR #20 review: promises only what the join
      // transaction guarantees. The redemption is spent only by a join that completes
      // (identity/join), so the invitation is still good. "Nothing was created" was not
      // guaranteed: the Supabase Auth user is created outside that transaction and removed only
      // best-effort (auth.ts joinHousehold).
      genericFailure:
        "Joining failed. Your invitation was not consumed, so please try again.",
      // Copilot review round 2 (PR #23): redeemPasswordReset's phase 2 (the provider password
      // write) failed AFTER phase 1 already committed — the link is spent and every prior session
      // is dead, but the password itself never changed. Distinct from genericFailure, which
      // promises the invitation is unconsumed — that would be false here.
      resetIncomplete:
        "The link has now been used, but your new password could not be set. Please ask the administration for a new link.",
    },
    // EC-2.4: rendered on the dashboard (task 8.5) when the join redirect carries the note —
    // "taken to Start with a note", the temporary /dashboard landing target (proposal Assumption 4).
    alreadyMemberNote: "You are already a member of this household.",
    // Review fix (§12): A3's refusal states and its Laden skeleton have no visible heading or text of
    // their own, so these give assistive tech one, rendered visually hidden (`sr-only`).
    refusalHeading: "Invitation",
    loading: "Loading invitation…",
    // join-screen design.md Decision 1/3: `/join`'s own manual-entry screen (FR-2.27, US-2.15).
    joinByCode: {
      heading: "Enter join code",
      // Assumption 1: "Leer" read as "arriving on the join path with no code" — the sentence
      // naming what normally appears here, plus the one sensible action (§6).
      emptyBody: "An invitation would normally appear here. Enter your join code to continue.",
      codeLabel: "Join code",
      // The example SHAPE only, never a real code (task 2.2) — `UAMPN-QACVZ`'s own alphabet, but
      // not a code that has ever been issued.
      // U+2011 (non-breaking hyphen) and U+00A0 keep "z. B." and the example on one line. It is only
      // the example shape, never a real code, so normalizeJoinCode never has to fold either.
      codeFormatHint: "Two groups of five characters each, e.g. ABCDE‑FGHJK.",
      submit: "Next",
      submitPending: "Checking…",
      // Review fix (rahmenwerk.md §12, „Nie Farbe allein"): the refusal says in its own words that
      // this is not a code, instead of the helper sentence merely turning red.
      codeInvalid: "This is not a valid join code.",
    },
    // join-screen design.md Decision 5: the `error.tsx` boundary — generic on purpose (never the
    // failure's own text or the code, G-A5), covering a failed page load, submit or sign-out alike.
    unexpectedError: {
      heading: "That did not work just now.",
      body: "Nothing was lost — you can simply try again.",
      retry: "Try again",
    },
  },
  whoLivesHere: {
    heading: "Who lives here",
    strangerNotice: "If you do not recognise someone on this list, tell a moderator immediately.",
  },
  // start-screen (FR-2.20–2.24, `rahmenwerk.md` §2–§3): B1, the resident's Start screen.
  start: {
    // rahmenwerk.md §4.1: "Moin {Name}", household name muted beneath (design.md Decision 10).
    greeting: (displayName: string) => `Hi ${displayName}`,
    eyebrowAsNext: "UP NEXT",
    // T-5: how many applications await the viewer's vote, and where the task leads.
    // rahmenwerk.md §8.6 binds this wording (`Notification.type = vote_pending` → „{N} Bewerbungen
    // warten auf deine Stimme") — the same fact, so the same words on Start as in a notification.
    voteTaskHeading: (count: number) =>
      count === 1 ? "1 application is waiting for your vote" : `${count} applications are waiting for your vote`,
    voteTaskButton: "Vote now",
    reasonDated: (dateLabel: string) => `Vote by ${dateLabel}.`,
    reasonOverdue: "The deadline has passed — your vote still counts.",
    reasonUndated: (roundTitle: string) => `Voting is currently taking place in “${roundTitle}”.`,
    andNMore: (n: number) => `and ${n} more`,
    // Start names no single phase (human decision 2026-10-06); this is the one label it still uses.
    waitingForApplications: "Waiting for applications",
    // The neutral heading when the standing is neither waiting nor fully rated.
    standingHeading: "Round status",
    // design.md Decision 6: the four display buckets beneath the phase, non-zero only.
    distribution: {
      in_screening: (n: number) => `${n} applicants are still being voted on`,
      in_scheduling: (n: number) => `${n} already invited`,
      interviewed: (n: number) => `${n} cast`,
      in_offer: (n: number) => `${n} accepted`,
    },
    // B1's acknowledgement after the last open application is rated (human decision 2026-10-06;
    // the exact wording stays open, P-O-04).
    allRated: "Great job — you voted on all applications!",
    noRoundSentence: "No round is currently running.",
    runningWithoutYouSentence: "A round is running, but (not yet) without you.",
    // U-5, `rahmenwerk.md` §2.3: the moderation bridge — visually distinct from the resident's own
    // task list, never mixed into it.
    bridge: {
      eyebrow: "MODERATION",
      headingSingular: "1 thing is waiting for you",
      headingPlural: (n: number) => `${n} things are waiting for you`,
      body: "A room is ready for a new round.",
      allDone: "All done – well done",
      button: "To organisation →",
    },
  },
  // F4 change 1 (screening-pass): the Casting tab is the D1 shell until F5 builds the ranking. No
  // evaluative text (C-4.11), no scores, and nothing about revising (C1 decision 2026-09-15).
  // F5 change 1: screen D1, the scoreboard. Copy about the PROCESS, never about a person (C-10,
  // AC-5.28), and no "Gewinner". Every number named here maps to a real threshold of the round.
  casting: {
    rankingHeading: "Ranking",
    backToStart: "Back to home",
    votes: votesLabel,
    scoreOf: (n: number) => `out of ${votesLabel(n)}`,
    ringLabel: (score: number, n: number) => `${score} out of 100 points, from ${votesLabel(n)}`,
    unscored: (needed: number, n: number) =>
      `No score yet — a fair picture requires at least ${votesLabel(needed)} (currently ${n}).`,
    hidden: "Hidden — you did not vote here",
    // The three groups of the board (design D10, human decision 2026-10-06).
    scoredHeading: "Score",
    invitedHeading: "Invited",
    hiddenHeading: "Hidden",
    // Under the round's title, so the highlight explains itself (human walkthrough 2026-10-06).
    // N is the round's open rooms, the same N that decides how many rows are highlighted.
    openRooms: (n: number) =>
      n === 0
        ? "No room available in this round"
        : n === 1
          ? "1 room available — the highest score is highlighted"
          : `${n} rooms available — the top ${n} scores are highlighted`,
    leadingLabel: (n: number) =>
      n === 1 ? "Below the highest score — 1 room available" : `Among the top ${n} scores — ${n} rooms available`,
    rulesToggle: "(?)",
    rulesToggleLabel: "How the ranking is created",
    rulesHeading: "How the score is calculated",
    formula:
      "The score is the average of the points from all votes, divided by the highest level, multiplied by 100; x.5 is rounded up.",
    quorumRule: (needed: number, denominator: number) => `${needed} of ${denominator} possible votes are sufficient to calculate the score`,
    empty: (title: string | null) =>
      title === null
        ? "No round you participate in is currently running."
        : `There is nothing to see in “${title}” yet.`,
    refusal: {
      notEligible: "You cannot view this round right now.",
      rulesInvalid: "The rules for this round cannot currently be read. Please contact the administration.",
      notAvailable: (statusLabel: string) => `The ranking for this round is currently unavailable (status: ${statusLabel}).`,
    },
    // F5 candidate-detail D9 (human decision 2026-10-07): the group of applications out of the
    // running, collapsed. It says neither that the person is finished nor anything judging (C-10).
    closedHeading: "Hidden away",
    closedCount: (n: number) => `(${n})`,
    // F5 candidate-detail, screen D2 (the candidate's card).
    detail: {
      back: "Back to the ranking",
      close: "Close",
      closeLabel: "Close card",
      sheetTitle: "Application details",
      // One part of the distribution's text equivalent: "2× Definitely".
      distributionPart: (n: number, ratingLabel: string) => `${n}× ${ratingLabel}`,
      distributionLabel: (text: string) => `Distribution of votes: ${text}`,
      participation: (n: number, denominator: number) => `${n} of ${denominator} have voted`,
      formerNote: (x: number) =>
        x === 1
          ? "1 vote removed because it came from a former resident"
          : `${x} votes removed because they came from former residents`,
      needed: (stillNeeded: number, needed: number) =>
        `${votesLabel(stillNeeded)} still needed — a fair picture requires at least ${votesLabel(needed)}.`,
      hiddenExplanation: "You will see the result once you have voted yourself.",
      hiddenAction: "Vote now",
      votersHeading: "Have voted",
      authorshipHeading: "Who voted how",
      nobody: "nobody",
      notFound: "Sorry, I cannot find this application here.",
      arithmeticToggleLabel: "How the score is created",
      arithmeticHeading: "How this score was calculated",
      roundedUp: "(x.5 rounded up)",
    },
  },
  // F4 change 1: screen C1, the screening pass. The four labels are the settled German ones
  // (Nein · Eher nicht · Finde gut · Unbedingt); how the weights are phrased is P-O-04 and stays
  // reword-able here. The buttons carry no numbers (human decision Q-3, 2026-09-30); the weights
  // sit behind the "(?)" pop-over.
  screening: {
    ratings: {
      no: "No",
      rather_not: "Rather not",
      good: "Like it",
      definitely: "Definitely",
    },
    // The visually hidden companion to the check glyph on the selected rating, so the selected
    // level is never told by colour alone (FR-4.19).
    selected: "selected",
    favouriteNote: "(for your favourite)",
    progress: (n: number, total: number) => `${n} of ${total}`,
    progressLabel: "Screening progress",
    ratingGroupLabel: "Your rating",
    weightsToggle: "(?)",
    weightsToggleLabel: "Show points for each level",
    weightsHeading: "Points for each level",
    weightsSentence: (rather: string, good: string) => `The big jump is between ${rather} and ${good}.`,
    points: (n: number) => (n === 1 ? "1 point" : `${n} points`),
    ageYears: (n: number) => `${n} years`,
    empty: "Nothing is waiting for you",
    emptyBody: "You have rated everything currently pending.",
    refusal: {
      roundNotOpen: (statusLabel: string) =>
        `This round is currently not open (status: ${statusLabel}). Voting is not possible now; your previous votes remain.`,
      // The same refusal when the round's state could not be read (code review, 2026-10-02).
      roundNotOpenUnknown:
        "This round is currently not open. Voting is not possible now; your previous votes remain.",
      notEligible: "You cannot vote in this round right now.",
      rulesInvalid: "The rules for this round cannot currently be read. Please contact the administration.",
      voteFailed: "That did not work — nothing was lost. Try again?",
    },
    back: "Back",
    backAria: "Back to previous application",
    backToStart: "Back to home",
  },
  // resident-settings (E1): the resident's own settings screen — email, password, sign-out.
  account: {
    heading: "Settings",
    backToStart: "Back to home",
    noPermissionBody: "This page is for residents. You can find your settings here:",
    noPermissionLink: "Settings",
    email: {
      heading: "Email",
      currentLabel: "Your saved address",
      // FR-2.17/E1 ("nie als Sperre formuliert"): framed as a way back in, never a requirement.
      pitch: "Add an email address to give yourself a way back in if you forget your password.",
      // EC-2.6/O-16 (corrected 2026-09-24): stated plainly while the gap exists, not hidden.
      noRecoveryNotice:
        "Without your own email address, you cannot reset a forgotten password yourself — " +
        "only the administration can help you via a link.",
      fieldLabel: "Email address",
      submit: "Save",
      submitPending: "Saving…",
      saved: "Saved.",
      errors: {
        missingEmail: "Email address is required.",
        invalidEmail: "That does not look like a valid email address.",
        emailTaken: "This email address cannot be used.",
        notAResident: "Only residents can change their email address.",
        // Copilot review round 4 (PR #23): the session this request came in on has been ended
        // (e.g. by a password reset) — the honest remedy is signing in again, not a retry.
        sessionEnded: "Your session has expired. Please sign in again.",
        genericFailure: "That did not work. Please try again.",
        // Copilot review round 3 (PR #23): the provider write succeeded but the commit that should
        // have followed it failed, and the best-effort repair (auth.ts changeResidentEmail's own
        // comment) also failed — distinct from genericFailure, which would wrongly imply nothing
        // happened at all.
        changeIncomplete:
          "The change may only have been partially applied. Please try again.",
        // auth-provider-deadline D10: the identity provider's answer never arrived and could not
        // be resolved — nothing was changed. Wording by the human, 2026-10-06: apologetic and
        // personal.
        providerUnavailable:
          "Sorry, that did not work just now. Your email address was not changed — please try again in a moment.",
      },
    },
    password: {
      heading: "Change password",
      currentLabel: "Current password",
      newLabel: "New password",
      requirement: (minLength: number) => `At least ${minLength} characters.`,
      submit: "Change password",
      submitPending: "Changing…",
      saved: "Password changed. Other sessions have been signed out.",
      errors: {
        missingFields: "Current and new passwords are required.",
        passwordTooShort: (minLength: number) => `The new password must be at least ${minLength} characters.`,
        wrongCurrentPassword: "The current password is incorrect.",
        notAResident: "Only residents can change their password.",
        // Copilot review round 4 (PR #23): see email.errors.sessionEnded above — same situation,
        // changeResidentPassword's own new session check.
        sessionEnded: "Your session has expired. Please sign in again.",
        genericFailure: "That did not work. Please try again.",
        // Copilot review round 3 (PR #23): see email.errors.changeIncomplete above — same
        // situation, changeResidentPassword's own compensating transaction also failed.
        changeIncomplete:
          "The change may only have been partially applied. Please try again.",
        // auth-provider-deadline D10: the current password could not be checked — nothing was
        // changed. Wording by the human, 2026-10-06: apologetic and personal.
        providerUnavailable:
          "Sorry, that did not work just now. Your password was not changed — please try again in a moment.",
        // D7's SAFE DIRECTION (pre-mortem findings 3/4): an unanswered write may still apply later,
        // after this lock releases — every other session already ended as a precaution, whatever
        // is found afterwards. The texts say so as "überall sonst abgemeldet", not "Sitzungen".
        unchangedSessionsEnded:
          "Sorry, that did not work — your password is unchanged. " +
          "For your security, you have been signed out everywhere else. Please try again in a moment.",
        uncertainSessionsEnded:
          "Sorry, something went wrong: It is currently not possible to tell whether your new password was saved. " +
          "For your security, you have been signed out everywhere else. When you sign in next, try the new password first, then the old one — and then change it again afterwards.",
      },
    },
    signOut: {
      heading: "Sign out",
    },
    // household-sign-in-code D7 (E1): "WG" is the UI label (domain/identity.md §2.1).
    household: {
      heading: "Your household",
      hint: "Sign in with this household code and your name.",
    },
  },
  // F5 candidate-invite (design D4, Open Questions): „Einladen" on the scoreboard's rows and on the
  // organisation's application detail. FIRST DRAFT of the copy (proposal A-4), for the human to edit
  // after the walkthrough. The text panel is `applications.notice.*`, reused by reference.
  invite: {
    open: "Invite",
    openLabel: (name: string) => `Invite ${name}`,
    heading: (name: string) => `Invite ${name}`,
    intro:
      "Here is a suggested message. You can edit and copy it — Flatmate does not send anything.",
    // The whole example text: the greeting and the invitation. No privacy notice (human decision 2026-10-06).
    text: (v: { name: string }) =>
      `Hey ${v.name}, we’d love to meet you! When would you have time in the next few days to meet us?`,
    confirm: "Invited!",
    confirmHint: "Click only after you have sent the message.",
    // One calm sentence per action code (feedback_german_ui_error_tone: apologise, du-tone).
    refusal: {
      not_found: "Sorry, this application no longer exists here. Please reload the page.",
      not_invitable: "Sorry, this application cannot be invited right now. Please reload the page.",
      not_allowed: "Sorry, you are not allowed to invite here.",
      no_session: "Sorry, you are no longer signed in. Please sign in again.",
      failed: "Sorry, that did not work just now. Please try again.",
    },
  },
  // start-screen: the shared error boundary for every `(resident)` screen — same reasoning as
  // `de.join.unexpectedError` (generic on purpose, G-A5: never the failure's own text).
  resident: {
    unexpectedError: {
      heading: "That did not work just now.",
      body: "Nothing was lost — you can simply try again.",
      retry: "Try again",
    },
  },
  // language-switch D8/A2: each language is named in its own language in BOTH tables, so a person
  // who cannot read the current one still finds theirs. `toggleLabel` is the control's accessible
  // name; the visible text is the endonym of the language the toggle switches TO.
  language: {
    names: { de: "Deutsch", en: "English" },
    toggleLabel: "Change language",
  },
  document: {
    description: "The tool your household uses to make decisions.",
  },
} as const satisfies Strings;
