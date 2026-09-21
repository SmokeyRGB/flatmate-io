# Design

## Context

See `proposal.md` — Why. Two constraints shape everything below, and they pull against each other:

> **eine Schlüssel→Text-Tabelle sein, kein Text inline im Code** […] **Kein Mehrsprachigkeitssystem
> in v0.1 bauen**, nur nicht die spätere Erweiterung durch inline-Strings verbauen.

So: a real indirection, built with as little machinery as possible. Anything that looks like an
i18n framework is too much; anything that leaves literals in components is too little.

The current state is 20 `.tsx` files with inline English, seven `actions.ts` files returning English
error strings, and — discovered while keying those errors — domain error classes that carry several
distinct user-facing meanings under one type.

## Goals / Non-Goals

**Goals**

- A missing or misspelled key fails `tsc`, not the page.
- Interpolated text is type-checked for arity and type, not assembled by string concatenation.
- The error path stops showing a resident text written for a developer, and stops leaking whether
  a display name exists.
- Nothing here requires a library, a config file, or a build step.

**Non-Goals**

- No second locale, no locale negotiation, no `Accept-Language`, no locale switcher. ADR-006 says
  not to build one. The table's shape is the whole of the preparation.
- No pluralization engine. German plural rules where needed are written out per string.
- No date/number formatting layer. Nothing currently formats either for display.
- No new screen states. G-N6's four mandatory states are a separate obligation; this change
  translates the states that exist.
- No change to a domain error's `message`. It stays English and keeps going to the log.

## Decisions

### 1 · The table is a nested `as const` object, accessed by property — no `t()` function

```
src/ui/strings/de.ts     the table
src/ui/strings/index.ts  re-export + the shared types
```

```ts
// de.ts
export const de = {
  members: {
    title: "Mitglieder",
    inviteLink: { heading: "Einladungslink", delete: "Löschen" },
  },
} as const;
```

Used as `de.members.inviteLink.delete` — a plain property read.

**Why not a `t("members.inviteLink.delete")` accessor**, which is the shape everyone expects? Because
the dotted string has to be made type-safe again with template-literal key types, which is more
machinery than the accessor saves, and because a property read is *already* checked: a typo is a
compile error with a suggestion, and "find all uses of this string" is a rename in the editor. The
requirement is that a missing key fails the build; TypeScript does that for free here and needs a
recursive `KeyPath<T>` type to do it through a `t()`.

**Alternative considered: JSON files plus a codegen'd type.** Rejected — a build step and a
generated artifact for one locale, and JSON cannot hold the interpolated forms of Decision 2.

**Alternative considered: `next-intl` / `react-i18next`.** Rejected on ADR-006's own words: a
multi-language system is explicitly out of scope for v0.1, and adopting one is a decision the ADR
defers rather than a detail this change may settle.

### 2 · Interpolated strings are functions, so arity is checked

```ts
quorum: (cast: number, needed: number) => `${cast} von ${needed} Stimmen reichen`,
```

Calling it with the wrong count or the wrong type is a compile error; a placeholder-substitution
helper would catch neither. This also keeps §8.6's worked examples usable verbatim — that entry is
written there as *„3 von 6 Stimmen reichen"*, a sentence with two numbers in it, not a template.

### 3 · Keys are English, values are German

`de.members.inviteLink.delete`, never `de.mitglieder.einladungslink.loeschen`. ADR-012 puts
implementation-facing identifiers in English, and a key is an identifier. A German key would make
the table itself need translating the day a second locale arrives — the exact trap the table exists
to avoid.

### 4 · Errors carry a code; actions map the code; the message stays for the log

The blocker: `SignInError` is thrown with six different texts and `ClaimError` with three, so
`err instanceof SignInError → one key` would flatten six conditions into one, and matching on
`err.message` would make user-facing text depend on a string written for a developer.

```ts
export type SignInErrorCode =
  | "missing_fields" | "invalid_credentials" | "no_household" | "no_membership";

export class SignInError extends Error {
  constructor(message: string, readonly code: SignInErrorCode) { super(message); }
}
```

The action then switches on `err.code` — exhaustively, because the union makes a missed case a
compile error. `message` is untouched: it is developer-facing, it reaches the log, and it is the
thing that makes a stack trace worth reading.

**This is the part of the change that is not a translation**, and it is confined to the classes
whose messages currently reach a form. `PayloadValidationError` and the transition errors keep
their present shape; nothing displays them.

**Alternative considered: give every error class a code.** Rejected as scope — a class whose message
never reaches a screen has nothing to discriminate for.

### 5 · Two sign-in conditions converge on one key

`"No such resident in this household"` and `"Invalid credentials"` become the single code
`invalid_credentials`. Today the pair tells an unauthenticated visitor whether a display name exists
in a household — the disclosure F2's FR-2.8 refuses to make about join links, on the same
reasoning, one screen earlier.

This is the one user-visible behaviour change here, so it is also `proposal.md` Assumption 6 and is
called out for review rather than folded in. Reverting it is one extra code and one extra key.

### 6 · A third-party or unexpected failure gets a generic key, never its own message

`sessionErr.message` from Supabase Auth cannot be translated — the wording is not ours and can
change under us. `catch (err)` on an unanticipated error is worse: it may carry an identifier or a
table name. Both map to one general key, and the original goes to the log.

### 7 · `lang="de"` on the document

`src/app/layout.tsx` declares `lang="en"`. German content under an English language declaration
makes a screen reader pronounce it with English phonemes — unusable, and §12 is where this change's
accessibility duties sit. Changed with the content, not after it. `metadata.description` is
translated; `metadata.title` stays "Flatmate.io", a product name.

### 8 · The one coupled test asserts through the table

`tests/unit/casting/new-round-page-permission-guard.test.ts:44` asserts
`toContain("don&#x27;t have permission")`. It will assert against `de.…` — never a German literal
pasted into the test, which would just relocate the coupling and silently pass if the table changed
underneath it.

### 9 · Where the table lives, and why not in a module

`src/ui/strings/`, outside `src/modules/`. ADR-001's bounded contexts are domain contexts; UI text
belongs to none of them, and putting it in `identity` would make `casting` import `identity` to
render a heading. It is a leaf with no dependencies, which is why a shared location does not
recreate the coupling the module boundary exists to prevent. It touches no database client, so
G-C1 is not in play.

## Risks / Trade-offs

**A mechanical sweep quietly changes copy** → The translation is not one-to-one; several English
strings are terse in a way German is not. Mitigated by doing it screen by screen against the
prototype screenshots, and by the fact that every string lands in one reviewable file rather than
scattered across 20.

**§8.6 does not cover most of what needs writing** → Named in `proposal.md` Assumption 1. §8.6 wins
where it speaks; elsewhere this change is authorship, and the reviewer should read the table as
copy, not as a diff.

**The error-code work could sprawl** → Bounded by Decision 4: only classes whose messages reach a
form. If a class turns out to need more than four or five codes, that is a signal the class is doing
two jobs — worth reporting, not worth solving here.

**A `de.…` read in a client component ships the whole table to the browser** → It is static text
measured in kilobytes and already destined for the page. Worth remembering if the table ever grows
per-locale; not worth splitting now.

**Conflict with F2's screens** → This change touches every `.tsx` file, so it must merge before F2's
changes 1–4 rather than alongside them. That is why it is change 0 and why nothing else runs in
parallel with it.

## Migration Plan

Not a data migration — a code migration, done screen by screen so review stays possible:

1. Create the table and its types with the shared strings (navigation, buttons, the four states).
2. `(auth)` screens and their actions, including the error codes for `RegistrationError`,
   `ClaimError`, `SignInError`.
3. `(org)` screens and their actions.
4. `layout.tsx`: `lang`, `metadata.description`.
5. The coupled test.
6. Grep for surviving literals — the check that the sweep was complete.

**Rollback** is `git revert`; nothing persists outside the source tree.

## Open Questions

None that can be deferred. The one decision a reviewer may want to reverse — the sign-in
convergence, Decision 5 — is called out in `proposal.md` Assumption 6 and is cheap to undo before
apply, expensive after.
