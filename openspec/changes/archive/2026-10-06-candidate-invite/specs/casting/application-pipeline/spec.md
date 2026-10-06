## ADDED Requirements

### Requirement: In v0.1 `screened` is passed through, never chosen

No control SHALL offer to move an application to `screened` on its own. The invitation passes
through `screened` inside one transaction (spec `casting/invitation`), so in v0.1 an application
normally goes from `new` straight to `invited`. Applications already in `screened` SHALL still be
listed under „Gesichtet" and SHALL still be invitable. The declared transitions into and out of
`screened` and their rules SHALL stay unchanged, so the repository keeps every declared way back
(P-4). The plain state change into `invited` SHALL stay executable as before. The example text that
must accompany an invitation (spec `casting/invitation`) is a duty of the invitation's screens, not
of the plain state change. In v0.1 no screen offers the plain state change. Sources: human decision 2026-10-06 (walkthrough of change 1), `docs/review-log.md`
„`screened` ist in v0.1 verdeckt".

#### Scenario: No screening control
- **WHEN** a moderator looks at the round's applications or at an application's detail
- **THEN** no control offers „Gesichtet" or a move to `screened`

#### Scenario: A leftover screened application
- **WHEN** a round holds an application in `screened`
- **THEN** it is listed under „Gesichtet", and inviting it succeeds
