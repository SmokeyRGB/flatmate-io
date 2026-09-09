> **Quelle:** `../04-Domaenenmodell.md` §2.1 (Stand V0.4, eingefroren 2026-09-09)
> **Kontext:** `identity`
> **Schema-Autorität:** Diese Datei. Weicht ein Bezeichner anderswo ab, gilt der hier.

### 2.1 Kontext `identity`

#### `Account` — der Zugang

Ein Login. **Nicht** identisch mit „Person" und nicht identisch mit „bewohnender Person": ein
Account kann sowohl den Verwaltungskontext des Haushalts als auch ein Bewohner-Profil bedienen und
zwischen beiden wechseln.

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `email` | `text?` | 🟠 | **Pflicht beim Haushalts-Admin-Account** (der erste, bei der Registrierung angelegte Account, `Membership.is_resident = false`) — eindeutig, dort als **gemeinsam genutzte Adresse** empfohlen (Hinweis im Registrierungsformular), damit das Eigentum am Zugang beim Auszug nicht mitwandert. **Nullable bei Resident-Accounts** (`Membership.is_resident = true`, angelegt beim Beitritt per Code): nicht mehr Pflichtfeld im Beitrittsformular, nach dem Onboarding optional nachpflegbar — Voraussetzung dafür, dass `web_push` als bevorzugter Kanal tragfähig ist (§2.5). Nicht zu verwechseln mit `Household.contact_email` oben, das davon unberührt bleibt |
| `password_hash` | `text` | 🟠 | Argon2id. Passwort ist die **primäre und universelle** Methode (P-2, ADR-007) |
| `email_verified_at` | `timestamptz?` | 🟠 | Verifikation ist **nachgelagert** und blockiert die erste Abstimmung nicht — aber Voraussetzung für jeden Benachrichtigungsversand und für Mailinhalte mit Beratungsbezug |
| `passkey_enabled` | `bool` | ⚙️ | optionaler Komfort-Aufsatz, jederzeit abschaltbar (ADR-007) |
| `locale` | `text` | ⚙️ | v1 nur `de` |
| `last_seen_at` | `timestamptz?` | 🟠 | speist „was ist passiert, während ich weg war" |
| `created_at` | `timestamptz` | ⚙️ | |
| `deleted_at` | `timestamptz?` | ⚙️ | Soft-Delete; harte Löschung über das Löschkonzept |

> **Womit meldet sich ein Resident-Account ohne E-Mail an — entschieden (O-D → O-12, §10.2).**
> `email` ist nullable, aber eine Anmeldekennung fehlte bis hierher. **`(Household, `display_name`) +
> Passwort.** Beim Anmeldeformular wird zuerst der Haushalt gewählt (typischerweise bereits durch das
> Gerät bekannt, siehe „angemeldet bleiben" bei `Session`), danach der eigene Anzeigename und das
> Passwort — kein zweites Feld, keine zweite Kennung.
>
> **Voraussetzung ist eine Eindeutigkeit, die es bisher nicht gab:** `ResidentProfile.display_name`
> muss innerhalb eines Haushalts unter den nicht ausgezogenen Profilen (`status != moved_out`)
> eindeutig sein — sonst ist die Anmeldung nicht auflösbar. Bisher war `display_name` reine
> Feed-Beschriftung ohne Eindeutigkeitsanspruch; mit dieser Entscheidung wird daraus eine Invariante.
> Kollidiert ein neuer Beitritt mit einem bestehenden Namen, verlangt das Beitrittsformular eine
> Unterscheidung (z. B. „Lea" → „Lea K.") — dieselbe Lösung, die Messenger-Apps für denselben Fall
> verwenden.
>
> **Was das für den Haushalts-Account nicht ändert:** Er bleibt bei `email` + Passwort (Pflichtfeld,
> siehe oben) — die neue Anmeldekennung betrifft ausschließlich Resident-Accounts ohne `email`.

> **Passwort-Reset ohne E-Mail — ein bewusster Tauschhandel, kein Versehen (O-16, §10.2; vormals
> Plan-O-A).** Ohne
> `email` gibt es **keine Wiederherstellung durch die Person selbst**. Auflösung: Die Verwaltung
> (`Membership.is_resident = false`, `manage_members`) kann das Passwort eines `ResidentProfile`
> zurücksetzen — und verschafft sich damit Zugang zu diesem Profil, einschließlich seiner Stimmen.
> Das ist der Preis dafür, dass ein Beitritt ohne E-Mail überhaupt möglich ist **und** ein
> vergessenes Passwort nicht zum dauerhaften Verlust des Profils führt.
>
> **Nicht als Härtung darstellen** — dieselbe Regel wie beim Verwaltungskontext selbst (§2.1,
> Kasten „Klarstellung"): E-03 hält fest, dass die Trennung Verwaltung/Bewohner keine
> Sicherheitsgrenze ist, und ein Passwort-Reset-Recht der Verwaltung ändert daran nichts.
>
> **Die Lücke schließt sich selbst**, sobald eine Person eine eigene `email` hinterlegt: ab diesem
> Moment läuft die Wiederherstellung über diese Adresse, und die Verwaltung kann das Passwort nicht
> mehr zurücksetzen. Das ist das eigentliche Argument dafür, die E-Mail später zu erfragen — nicht
> Benachrichtigungs-Komfort.
>
> **Solange die Lücke besteht, bleibt sie sichtbar:** jeder administrative Reset erzeugt einen
> `ActivityEvent` im Feed aller Bewohnenden (`account.password_reset_by_admin`) und beendet **alle**
> aktiven `Session`s des betroffenen Profils (§2.1, `Session.revoked_at`) — keine stille
> Zugriffsübernahme.

#### `Session` — die angemeldete Sitzung

**Neu in V0.2** (Querprüfung). Login-Sessions sind personenbezogen und nach **§ 25 Abs. 2 Nr. 2
TDDDG einwilligungsfrei**, weil sie zur Erbringung des Dienstes unbedingt erforderlich sind — genau
darauf stützt sich `06-Compliance-Anhang.md` §10.1. Das Modell muss sie deshalb führen, statt sie
dem Auth-Modul zu überlassen.

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `token_hash` | `text` | 🟠 | **nur der Hash.** Ein Session-Token im Klartext in der Datenbank ist ein Passwortäquivalent |
| `account_id` | `uuid` | 🟠 | |
| `acting_profile_id` | `uuid?` | 🟠 | **hier lebt der Profilwechsel** — und **hier lebt die handelnde Identität** eines Requests: jede Policy-Prüfung liest dieses Feld, nie ein anderes. `null` = Verwaltungskontext, gesetzt = Bewohnerkontext |
| `remember_me` | `bool` | ⚙️ | Default `true` (K-9/S-03 — beim Erstbeitritt vorbelegt). Steuert nur die `expires_at`-Dauer, siehe unten |
| `expires_at` | `timestamptz` | ⚙️ | **`remember_me = false`:** kurze Sitzung (Vorschlag 12 h). **`remember_me = true`:** lange Sitzung (Vorschlag **90 Tage**, gleitend verlängert bei Aktivität) — Auflösung O-13, damit „auf diesem Gerät angemeldet bleiben" (§10 des Plans) ein Feld hat, nicht nur eine Checkbox in der UI |
| `user_agent` | `text?` | 🟠 | zur Wiedererkennung eigener Geräte in einer Sitzungsliste |
| `created_at` | `timestamptz` | ⚙️ | |
| `revoked_at` | `timestamptz?` | ⚙️ | **drei Auslöser, nicht einer:** „überall abmelden" nach einem Passwortwechsel (das gilt weiterhin) · Passwort-Reset durch die Verwaltung (§2.1, Kasten „Passwort-Reset") · `ResidentProfile.moved_out_on` wird gesetzt — eine ausgezogene Person behält sonst eine bereits lange Sitzung trotz V-3 |

> **`acting_profile_id` ist die technische Heimat von V-1.** Der Sitzungskontext aus §5 — `account_id`
> plus `profile_id` — wird aus dieser Zeile gefüllt und pro Request per `SET LOCAL` an Postgres
> übergeben (ADR-004). Und weil die Selbst-Redaktion am **Account** hängt und nicht am aktiven Profil,
> ist ein Wechsel von `acting_profile_id` **kein** Weg an V-1 vorbei: `redaction_subjects()` sammelt
> alle Profile des Accounts, unabhängig davon, welches gerade gesetzt ist.
>
> Daraus folgt eine harte Regel für den Auth-Baustein: `acting_profile_id` darf nur auf ein Profil
> zeigen, für das eine gültige `Membership` desselben Accounts existiert. Ohne diese Prüfung wäre der
> Profilwechsel eine Rechteausweitung.
>
> **Und, weil die Verwechslung naheliegt (U-21): `acting_profile_id = null` verleiht nichts.** Eine
> frühere Formulierung dieses Plans las sich so, als würde `null` Verwaltungsrechte *verleihen* — das
> ist falsch und wurde korrigiert. `acting_profile_id = null` heißt ausschließlich „für diese Sitzung
> ist kein Bewohnerprofil aktiv". Sämtliche Rechte kommen aus `Membership.role`
> (`household_admin`/`moderator`/`member`) und `Membership.permissions`, nie aus dem Sitzungsfeld.
> Ein Konto mit `role = member` bekommt durch `acting_profile_id = null` nichts dazu — es verliert
> nur seine Stimmidentität.
>
> Für `GUARDRAILS.md` als geschützter Test, kein Kommentar: **„Welche Abschnitte der
> Organisationsfläche ein Konto sieht, entscheidet ausschließlich `Membership.role`/`.permissions`.
> Ein Konto ohne `household_admin` sieht den Abschnitt ‚Haushalt' auch dann nicht, wenn
> `acting_profile_id` `null` ist."**

#### `PasskeyCredential` — der optionale Passkey

**Neu in V0.2** — löst den offenen Punkt O-6 auf. ADR-007 hängt daran: Passkey ist ein **optionaler
Aufsatz nach der Registrierung**, jederzeit abschaltbar, nie Voraussetzung (P-2).

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `account_id` | `uuid` | 🟠 | mehrere Credentials pro Account sind erlaubt (Handy **und** Rechner) |
| `credential_id` | `text` | 🟠 | vom Authenticator vergeben, eindeutig |
| `public_key` | `text` | 🟠 | öffentlicher Schlüssel — kein Geheimnis, aber accountbezogen |
| `sign_count` | `int` | ⚙️ | Klonschutz; muss monoton steigen |
| `label` | `text?` | 🟠 | von der Person gesetzt („iPhone", „Laptop") |
| `created_at` · `last_used_at` | `timestamptz` · `timestamptz?` | 🟠 | |

> **Löschen eines Passkeys darf nie den Zugang entziehen.** Das Passwort bleibt die universelle
> Methode; `Account.passkey_enabled` ist eine Anzeige, keine Bedingung. Wer den letzten Passkey
> entfernt, ist weiter angemeldet und kann sich weiter anmelden — sonst kippt ADR-007 vom
> „optionalen Aufsatz" in eine Abhängigkeit und verletzt P-2.

#### `Household` — der Haushalt

Neutral gegenüber WG, Wohnprojekt, Haus und Vermieter-Objekt. UI-Label in v1 durchgängig „WG".

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `name` | `text` | ⚙️ | frei, z. B. „Hausprojekt Nordstadt" |
| `owner_account_id` | `uuid` | ⚙️ | der Account, der registriert hat. **Keine Sicherheitsgrenze** (Klarstellung unten), nur Zuordnung |
| `contact_email` | `text` | 🟠 | **die nach außen genannte Kontaktangabe** für Art. 13 Abs. 1 lit. a. **Bewusst nicht dasselbe Feld wie `Account.email`**, auch wenn beide dieselbe Adresse enthalten können — siehe Kasten |
| `privacy_notice_state` | `enum(draft, published)` | ⚙️ | Zustand der haushaltseigenen Datenschutzseite. Default `draft` |
| `privacy_notice_version` | `int` | ⚙️ | jede Veröffentlichung erhöht die Version; frühere Fassungen bleiben nachweisbar |
| `privacy_notice_published_at` | `timestamptz?` | ⚙️ | |
| `privacy_notice_published_by_account_id` | `uuid?` | 🟠 | **wer veröffentlicht hat** — die Erklärung wird im Namen des Verantwortlichen abgegeben, also braucht sie einen Urheber |
| `join_code` | `text` | ⚙️ | **ein Code für den ganzen Haushalt**, nicht pro Person. Fünf Auflagen, siehe Kasten unten |
| `join_code_rotated_at` | `timestamptz?` | ⚙️ | |
| `join_code_expires_at` | `timestamptz?` | ⚙️ | **Neu (S-49).** Vorschlag `join_code_rotated_at + 7 Tage`, mit einem Tippen verlängerbar (O-15). Abgelaufen ⇒ Code lehnt jeden Beitritt ab, unabhängig von `join_code_max_uses` |
| `join_code_max_uses` | `int?` | ⚙️ | **Neu (S-49).** `null` = unbegrenzt (Default für Bestandshaushalte bei Migration). Für neue Haushalte vorbelegt mit der Zahl der noch fehlenden Bewohnenden (O-15) |
| `join_code_uses` | `int` | ⚙️ | **Neu (S-49).** Zähler, hochgesetzt bei jedem erfolgreichen Beitritt über diesen Code. Setzt sich bei Rotation zurück, weil ein rotierter Code ohnehin ein neuer Wert ist |
| `entity_label` | `enum(wg, wohnprojekt, haus, objekt)` | ⚙️ | in v1 fest `wg`, später pro Objekt wählbar |
| `entity_label` | `enum(wg, wohnprojekt, haus, objekt)` | ⚙️ | in v1 fest `wg`, später pro Objekt wählbar |
| `created_at` | `timestamptz` | ⚙️ | |
| `deleted_at` | `timestamptz?` | ⚙️ | |

> **Klarstellung, die im Modell sichtbar bleiben muss.** Jede bewohnende Person kann sich
> theoretisch im Haushalts-Account anmelden, wenn E-Mail und Passwort bekannt sind. Die Trennung
> zwischen Verwaltungs- und Bewohnerkontext dient **ausschließlich der Klarheit** — nur Bewohnende
> stimmen ab, um Verwirrung zu vermeiden. Sie ist **keine Härtung** und darf in keinem Dokument als
> solche dargestellt werden.
>
> Konsequenz für §5.1, und sie ist nicht kosmetisch: die Selbst-Redaktion muss am **Account**
> hängen, nicht nur am gerade aktiven Profil. Sonst wäre der Profilwechsel der einfachste Weg, die
> Invariante zu umgehen.

> **`contact_email` ist nicht `Account.email` — auch wenn beide dieselbe Adresse enthalten.**
>
> `Account.email` ist die **Anmeldeadresse**. `Household.contact_email` ist die **nach außen genannte
> Kontaktangabe**, die im Datenschutzhinweis an Bewerbende steht (Art. 13 Abs. 1 lit. a). Sie fallen
> in der Praxis meist zusammen und trotzdem sind es zwei Dinge: die Anmeldeadresse zu ändern darf den
> veröffentlichten Datenschutzhinweis nicht still umschreiben, und umgekehrt darf eine öffentlich
> genannte Kontaktadresse nicht implizit ein Login sein.
>
> **Und ausdrücklich keine Postanschrift** (entschieden in `06-Compliance-Anhang.md` §4.6): eine
> WG-E-Mail ist die verhältnismäßige Kontaktangabe. Eine WG, die Bewerbenden ihre Postanschrift
> offenlegt, erzeugt ein Datenschutzproblem **für die Bewohnenden selbst** — man würde eine Pflicht
> gegenüber Bewerbenden mit einem Risiko für Bewohnende bezahlen. Das Modell führt deshalb kein
> Adressfeld, und das ist eine Entscheidung, keine Lücke.

> **Die vier `privacy_notice_*`-Felder: Flatmate.io erzeugt, der Verantwortliche veröffentlicht.**
>
> Die tragende Regel dahinter ist eine Rollenregel, nicht eine Komfortfrage: **als
> Auftragsverarbeiter darf man eine rechtliche Erklärung im Namen eines Dritten vorbereiten, aber
> nicht abgeben.** Flatmate.io kann die Datenschutzseite eines Haushalts vollständig generieren — den
> Schritt „das gilt jetzt für uns" muss der Haushalt als Verantwortlicher selbst tun.
>
> `06-Compliance-Anhang.md` setzt das über einen Typ **`PublishedPrivacyNotice`** durch, der **nur aus
> einem freigegebenen Datensatz konstruierbar** ist (Guardrail G-C9): ein `draft` passt nicht in den
> Typ und ist damit nicht auslieferbar.
>
> **Warum diese Bauform besser ist als die naheliegende.** Die naheliegende Variante wäre eine Prüfung
> in der Route: „wenn `privacy_notice_state != 'published'`, dann 404". Die kann man vergessen — an
> einer neuen Route, in einem Export, in der Vorschau. Ein Typ, den man ohne Freigabe nicht bauen
> kann, lässt sich nicht vergessen, weil der Compiler die Stelle findet. Dieselbe Logik wie bei
> ADR-004: der wahrscheinlichste Fehler ist eine vergessene Prüfung, also gehört die Absicherung in
> eine Schicht, die man nicht übergehen kann.
>
> `privacy_notice_version` ist dabei kein Zierrat: der Nachweis, **welche Fassung** einer bewerbenden
> Person zu einem Zeitpunkt gezeigt wurde, ist genau das, was im Streitfall zählt.

> **`join_code`: fünf Auflagen, keine Empfehlungen** (drei entschieden in der Querprüfung, O-9
> Grenzfall 2; zwei neu, S-49). Der Code identifiziert einen **Haushalt, keine Person** — deshalb ⚙️
> und keine Zeile im Art.-30-Verzeichnis. Er gehört stattdessen in die **TOM-Liste**, denn wer ihn
> hat, kommt an Beratungsinhalte. Daraus folgt:
>
> 1. **Rotierbar** durch die organisierende Person. Rotation **entwertet ausstehende Einladungen** —
>    das ist der ganze Zweck.
> 2. **Niemals in einem Log**, auch nicht im Zugriffslog. Der Einladungslink trägt den Code im
>    **Pfad**, also braucht genau diese Route **Pfad-Redaktion** im Zugriffslog.
> 3. **Niemals in einem Query-String.**
> 4. **Ablauf** (`join_code_expires_at`). **Neu und keine Zugabe:** Seit `Account.email` bei
>    Resident-Accounts nullable ist und die E-Mail-Pflicht im Beitrittsformular entfällt (S-03), gibt
>    es **keine zweite Zugangskontrolle** mehr — weder E-Mail-Verifikation noch ein zweiter Faktor.
>    Der Code trägt die gesamte Absicherung allein, und ein Code ohne Ablauf ist dann ein
>    Passwortäquivalent ohne Verfallsdatum.
> 5. **Nutzungsgrenze** (`join_code_max_uses`/`join_code_uses`). Derselbe Grund wie 4: ohne Grenze
>    kann derselbe Code beliebig oft eingelöst werden, auch nachdem alle erwarteten Bewohnenden
>    bereits beigetreten sind.
>
> Punkt 2 ist die unbequemste: „nicht ins Anwendungslog schreiben" ist trivial, „das Zugriffslog des
> Webservers für eine Route redigieren" ist eine Konfigurationsaufgabe, die man vergisst. Sie gehört
> als überprüfbare Regel in `GUARDRAILS.md`, nicht als Hinweis.
>
> **Was Punkt 4/5 ausdrücklich nicht ersetzen** (G-A5 bleibt gültig, siehe Plan „Nicht angefasst"):
> sie **ergänzen** die Rotation, sie **ersetzen** sie nicht — eine organisierende Person, die einen
> falsch verschickten Link sofort entwerten will, rotiert weiterhin, statt auf den Ablauf zu warten.

#### `HouseholdSettings` — Verfahrensregeln des Haushalts

1:1 zum `Household`. Bewusst **eine** Entität statt verstreuter Flags: das Abstimmungsverfahren ist
ein zusammenhängender Vertrag, dessen Änderung während einer laufenden Runde gesperrt bzw. laut
protokolliert wird (Regel-Sperre, §3.2).

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `household_id` | `uuid` | ⚙️ | PK und FK |
| **Abstimmung** | | | |
| `scale_weights` | `jsonb` | ⚙️ | Default `{no: 0, rather_not: 1, good: 3, definitely: 5}` — **in der UI offengelegt** (P-3) |
| `favorite_budget_enabled` | `bool` | ⚙️ | Default `true` |
| `favorite_budget_factor` | `numeric` | ⚙️ | Default `1.5`; Budget `= ceil(open_rooms × factor)` |
| `hide_results_until_voted` | `bool` | ⚙️ | Default `true` (Anker- und Bandwagon-Effekt, V-4) |
| `quorum_share` | `numeric` | ⚙️ | **Default `0.5`** (entschieden, §8.3): mindestens die Hälfte der stimmberechtigten Teilnehmenden, bevor eine Bewerbung in der Rangliste erscheint |
| **Veto** | | | |
| `veto_budget_per_round` | `int` | ⚙️ | Default `1` |
| `veto_requires_reason` | `bool` | ⚙️ | Default `true` |
| `veto_anonymous_allowed` | `bool` | ⚙️ | **Opt-in**, Default `false` |
| **Termine** | | | |
| `appointment_duration_minutes` | `int` | ⚙️ | Default `45` |
| `earliest_time_of_day` | `time` | ⚙️ | z. B. „erst ab 18:00" |
| `latest_time_of_day` | `time` | ⚙️ | |
| `max_appointments_per_day` | `int?` | ⚙️ | harter Constraint H3 |
| `parallel_appointments_allowed` | `bool` | ⚙️ | Default `false`, siehe H2 |
| `max_parallel_appointments` | `int` | ⚙️ | nur wirksam, wenn parallel erlaubt |
| `min_buffer_minutes` | `int` | ⚙️ | Mindestpuffer zwischen Terminen, H4 |
| `min_residents_per_appointment` | `int` | ⚙️ | H6 |
| **Aufbewahrung** | | | |
| `retention_days` | `enum(30, 90, 180)` | ⚙️ | Default `180`. Der Haushalt kann **kürzen, nicht verlängern** |
| `retention_warning_days` | `int` | ⚙️ | Default `14` — keine stille Löschung |
| **Benachrichtigungen** | | | |
| `notification_event_mask` | `jsonb` | ⚙️ | Haushalts-Ebene; die persönliche Ebene liegt am `Membership` |
| `digest_mode` | `enum(digest, immediate)` | ⚙️ | Default `digest` |
| `digest_schedule` | `text` | ⚙️ | z. B. `daily_19h` |
| **Notizen** | | | |
| `note_prompts_enabled` | `bool` | ⚙️ | strukturierte Prompts statt leerem Kasten — Risikominderung zu Art. 15 |
| `updated_at` · `updated_by_account_id` | `timestamptz` · `uuid` | ⚙️ | jede Änderung erzeugt ein `ActivityEvent` |

#### `ResidentProfile` — die handelnde Person im Haushalt

Die Einheit, die **abstimmt, Notizen schreibt und Termine zusagt.** Alle Beratungsartefakte zeigen
auf ein `ResidentProfile`, nie auf einen `Account` — weil der Account den Kontext wechseln kann,
Stimmen aber einer Person zurechenbar bleiben müssen.

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `household_id` | `uuid` | ⚙️ | |
| `display_name` | `text` | 🟠 | Anzeigename im Feed („Jonas hat Lea eingeladen"). **Seit O-12 (§2.1) zusätzlich die Anmeldekennung** für Resident-Accounts ohne E-Mail — deshalb **eindeutig pro Haushalt unter `status != moved_out`**, nicht mehr nur Beschriftung |
| `status` | `enum(prepared, active, moved_out)` | ⚙️ | `prepared` = vom Haushalts-Account angelegt, noch von keinem Account übernommen |
| `moved_in_on` | `date?` | 🟠 | |
| `moved_out_on` | `date?` | 🟠 | setzt `status = moved_out` → **sofortiger Zugriffsentzug** (V-3) |
| `room_id` | `uuid?` | ⚙️ | aktuell bewohntes Zimmer |
| `created_at` | `timestamptz` | ⚙️ | |

**Warum `prepared` ein eigener Zustand ist:** Der Haushalts-Account kann ein Bewohner-Profil
anlegen, es direkt zum Moderator ernennen und danach nie wieder in den Bewohnerkontext wechseln.
Ohne `prepared` müsste man aus „Profil ohne verknüpften Account" implizit schließen — genau die Art
impliziten Zustands, die ADR-002 abschaffen will.

#### `Membership` — Zugang, Rolle, Rechte

Verbindet `Account` × `Household`. **Orthogonale Attribute statt Rollenhierarchie:** `is_resident`
und `role` sind unabhängig, weil sonst zwei Fälle in eine Hierarchie gepresst werden müssten, in
die sie nicht passen — der Vermieter-Fall (Objekt ohne eigenes Bewohner-Profil) und der Normalfall
„bewohnende Person ist zugleich Moderator".

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `household_id` | `uuid` | ⚙️ | |
| `account_id` | `uuid` | ⚙️ | |
| `resident_profile_id` | `uuid?` | ⚙️ | gesetzt, wenn dieser Account als Bewohner-Profil handeln darf; `null` = reiner Verwaltungskontext |
| `is_resident` | `bool` | ⚙️ | **Stimmberechtigung.** Der Haushalts-Account hat `false` und **kann nicht abstimmen** |
| `role` | `enum(household_admin, moderator, member)` | 🟠 | orthogonal zu `is_resident`. **In V0.2 von ⚙️ auf 🟠 umklassifiziert** — siehe Kasten |
| `permissions` | `text[]` | 🟠 | **einzeln vergebbar**, Werte siehe unten. Ebenfalls 🟠 |
| `notification_event_mask` | `jsonb?` | ⚙️ | persönliche Ebene; überschreibt die Haushalts-Ebene |
| `joined_via_code` | `text?` | ⚙️ | welcher `join_code` verwendet wurde — speist den Feed |
| `joined_at` | `timestamptz` | ⚙️ | Beitritte erscheinen im Aktivitäts-Feed (struktureller Duplikatsschutz). Zweiter Zweck: ein von `became_resident_id` unabhängiges Kriterium für moderierende Sichtbarkeit, z. B. Zugriff auf die Rundenhistorie zu Auditzwecken |
| `revoked_at` | `timestamptz?` | ⚙️ | **Korrigiert (U-22):** nicht mehr „jedes Mitglied kann entfernen" — das galt für den durch E-06 vorausgesetzten strukturellen Schutz, der mit der getrennten Bewohnerliste entfällt (§10.2). Setzbar nur über `manage_members`; die genaue Rechteabstufung zwischen Verwaltung und Moderator ist Sache der Rechtematrix in `03-PRD.md` |

Vergebbare Werte in `permissions` (Vorschlag, erweiterbar):
`create_application` · `change_application_state` · `close_round` · `confirm_appointment` ·
`manage_settings` · `manage_members` · `extend_retention` · `delete_data` ·
`export_subject_access`.

> **`role` und `permissions` sind 🟠, nicht ⚙️** — entschieden in der Querprüfung gegen
> `06-Compliance-Anhang.md` (O-9 Grenzfall 1), **gegen** den ursprünglichen Vorschlag dieses
> Dokuments. Begründung: Art. 4 Nr. 1 DSGVO ist weit, und „X ist Moderator" ist eine Information
> **über eine identifizierte Person**, nicht bloß Konfiguration. Folge: Zeile im
> Datenbestandsverzeichnis, **keine** automatische Frist, aber **auf Auskunftsverlangen
> offenzulegen.** Es kostet eine Zeile, und sie auszulassen wäre falsch gewesen.

> **Zwei Statusfelder mit Absicht — jetzt entschieden (O-4), ohne `residency_period`.**
>
> Die Arbeitsteilung ist bewusst und beide Seiten sind nötig:
>
> - `ResidentProfile.moved_in_on` / `.moved_out_on` (plus `status`) tragen die **Wohn-Tatsachen**.
> - `Membership.role` / `.permissions` / `.revoked_at` tragen den **Zugang**.
>
> Eine ausgezogene Person hat einen **beendeten Wohnzeitraum** *und* **entzogenen Zugang** — das sind
> zwei verschiedene Aussagen, und eine davon aus der anderen abzuleiten würde die jeweils andere
> unaussprechbar machen. V-3 hängt deshalb weiter **am Profilstatus** und nicht am Zugang: die
> Sichtbarkeit folgt der Wohnsituation, nicht der Rechteverwaltung.
>
> Verworfen wurde die Alternative, die Wohnsituation aus einer `residency_period`-Tabelle abzuleiten.
> Für v1 genügt **eine** Periode pro Profil, und eine Tabelle für eine Zeile ist Aufwand ohne
> Gegenwert.
>
> **Das gibt man auf, wenn** Aus- und Wiedereinzug modelliert werden muss — in Wohnprojekten kommt
> das vor (jemand zieht für ein Jahr weg und kommt zurück). Dann ist `residency_period` der
> **v2-Aufstiegspfad**, und die beiden Datumsfelder werden zu abgeleiteten Werten über der jüngsten
> Periode. Der Umbau ist überschaubar, solange V-3 weiter gegen den Profilstatus prüft und nicht
> gegen die Datumsfelder direkt — das ist die Bedingung, unter der dieser Aufstiegspfad billig bleibt.

#### `ApplicationInviteToken` — der Link „diese Bewerbung wird jetzt Bewohner:in"

**Neu in diesem Update.** Der Mechanismus stand bisher nur als Vorschlag in
`Product-Audit-Hypotheses.md` §H-F5 (S-42). Er erweitert diesen Vorschlag um die dort offen
gelassene Frage, was passiert, wenn eine **bereits registrierte** Person auf den Link klickt —
siehe Kasten.

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `application_id` | `uuid` | 🔴 | die Bewerbung, die eingelöst werden soll. Reiner Fremdschlüssel zum Nachschlagen, kein Join über die Kontextgrenze (wie z. B. `Notification.event_id`) — der Token identifiziert eine bewerbende Person, ist also personenbeziehbar |
| `token_hash` | `text` | ⚙️ | **nur der Hash** — dasselbe Muster wie bei `Session.token_hash` und `AvailabilityToken.token_hash`: ein Klartext-Token in der Datenbank ist ein Passwortäquivalent |
| `expires_at` | `timestamptz` | ⚙️ | kurze Lebensdauer, analog `AvailabilityToken` |
| `used_at` | `timestamptz?` | ⚙️ | erste Einlösung |
| `revoked_at` | `timestamptz?` | ⚙️ | |

> „Ein Invite-Token wird nur verarbeitet, wenn `Session.account_id` noch kein `ResidentProfile` in
> diesem Haushalt hat — sonst Fehler (‚Du bist bereits als Bewohner:in registriert'), kein Merge,
> keine Überschreibung von `became_resident_id`."
>
> Das ist die **Prozess-Ebene zu I-3** (§3.1): `became_resident_id` ist nach dem Setzen technisch
> unveränderlich, aber I-3 verhindert nur das stille Überschreiben, nicht den Versuch selbst. Ohne
> eine explizite Prüfung bliebe offen, was beim Klick passiert — stillschweigendes Nichtstun wäre
> verwirrend, ein Merge zweier Profile wäre eine eigene, riskante Entscheidung. Der erklärte Fehler
> ist deshalb die einzige Antwort, die mit I-3 konsistent bleibt.
>
> Für `GUARDRAILS.md`: der Satz oben ist ein geschützter Test, kein Kommentar.
