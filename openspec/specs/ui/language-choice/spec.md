# ui/language-choice Specification

## Purpose
Lets each person choose whether the application speaks German or English to them. The choice
belongs to their account, works before any account exists, and never changes what another member
of the same WG sees.
## Requirements
### Requirement: Each account has its own language

Every account SHALL carry exactly one UI language, German or English. An account created before
this change SHALL be German. The database SHALL refuse any value other than these two, whichever
path writes it. Two accounts of the same household SHALL be able to hold different languages, and
one account's choice SHALL change nothing another account sees. This holds for every kind of
account: a resident, the household account and a non-resident moderator.

#### Scenario: Two residents, two languages
- **WHEN** one resident of a WG chooses English and another keeps German
- **THEN** the first sees every screen in English and the second in German, at the same time

#### Scenario: An existing account
- **WHEN** an account that existed before this change signs in
- **THEN** the application speaks German to it until it chooses otherwise

#### Scenario: A value outside the two languages
- **WHEN** any write, including raw SQL, sets an account's language to anything other than German
  or English
- **THEN** the database refuses it

### Requirement: A signed-in person changes their own language from the profile menu

Every signed-in person SHALL be able to switch the language from the profile menu, on the resident
and the organisation surface alike. The change SHALL apply to their own account and no other. The
account changed SHALL derive from the authenticated session, never from a value the caller
supplies. The change SHALL take effect on the next screen without signing out. Changing one's
language SHALL require no permission and grant none. Source: G-C.

#### Scenario: Switching to English
- **WHEN** a signed-in resident chooses English in the profile menu
- **THEN** the screen they are on is shown in English, and so is every later screen and every later
  session of that account

#### Scenario: The choice follows the account, not the device
- **WHEN** a person who chose English on one device signs in on another
- **THEN** the application speaks English to them there too

#### Scenario: The household account switches
- **WHEN** a household-account session or a non-resident moderator chooses English
- **THEN** their own account is set to English, and the residents' accounts are unchanged

#### Scenario: Only one's own account
- **WHEN** a language change is submitted
- **THEN** only the account of the session that submitted it changes, whatever the request carries

### Requirement: The language can be chosen before an account exists

The sign-in, register and join screens SHALL offer the same toggle to a visitor without a session.
The choice SHALL be remembered on that device only. A visitor who has not chosen SHALL be shown
English if their browser states a preference for English ahead of German, and German otherwise.
Nothing SHALL be stored on the device until the visitor actively chooses. The language names in the
toggle SHALL each be written in their own language, so a visitor who cannot read the current one
still finds theirs.

#### Scenario: An English speaker opens the join link
- **WHEN** a visitor whose browser prefers English opens a join link
- **THEN** the join screen is in English without them doing anything

#### Scenario: Choosing on the sign-in screen
- **WHEN** a visitor switches the sign-in screen to English
- **THEN** it and the other pre-account screens stay English on that device until changed

#### Scenario: The toggle is readable in either language
- **WHEN** the toggle is shown in either language
- **THEN** it offers „Deutsch" and "English", each in its own language

### Requirement: A new account starts in the language it was created in

An account created by registering a household, joining by link or claiming a prepared profile
SHALL start with the language the creating screen was displayed in.

#### Scenario: Joining in English
- **WHEN** a visitor joins a WG while the join screen is in English
- **THEN** their new account is English, and the screens after joining are English

#### Scenario: Registering in German
- **WHEN** a visitor registers a household while the register screen is in German
- **THEN** the household account is German

### Requirement: A signed-in person's account decides, not the device

While a session exists, its account's language SHALL decide what is displayed. The device's
remembered choice and the browser's preference SHALL apply only where no session exists. Signing
out SHALL NOT erase the device's remembered choice.

#### Scenario: A German account on an English device
- **WHEN** a person whose account is German signs in on a device whose toggle was set to English
- **THEN** the screens after sign-in are German

#### Scenario: After signing out
- **WHEN** a person signs out
- **THEN** the sign-in screen shows the language the device last remembered, or the browser's
  preference if it never chose one

