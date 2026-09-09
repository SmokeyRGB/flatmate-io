> **Quelle:** `../04-Domaenenmodell.md` §9 (Stand V0.4, eingefroren 2026-09-09)
> **Schema-Autorität:** Diese Datei. Weicht ein Bezeichner anderswo ab, gilt der hier.

## 9. Anhang — personenbezogene Felder (Querprüfungsliste)

**Zweck dieser Liste:** Sie ist die Übergabe an `06-Compliance-Anhang.md` und an
`data-inventory.yml` (ADR-010). **Jede Zeile hier braucht dort eine Zeile** mit Zweck,
Rechtsgrundlage, Datenkategorie und Löschfrist. Fehlt eine, bricht der CI-Check.

Sortiert nach Klasse, weil die Klasse den Aufwand bestimmt.

> **Die Zahlen in den folgenden Überschriften sind nachrichtlich, nicht maßgeblich.**
> Maßgeblich ist `data-inventory.yml` (ADR-010) und der CI-Check darüber. Grund: Diese Liste ist
> **dreimal** verrutscht — die Kästen unten dokumentieren es selbst —, und jede Korrektur per Hand
> erzeugt die nächste Abweichung. Wer eine belastbare Feldzahl braucht, zählt sie aus der
> Inventardatei; wer eine Spalte hinzufügt, deklariert sie dort, und der Build erzwingt den Rest.
> Die Klassenzuordnung hier bleibt fachlich verbindlich — nur die Summen sind es nicht.

### 9.1 Klasse ⚫ — personenbezogen **und** Beratungsinhalt (11 Felder)

Strengste Klasse: unterliegt zusätzlich **V-1** und ist im Auskunftsexport enthalten.

| Entität | Feld | Betroffene Person | Bemerkung |
|---|---|---|---|
| `Application` | `decision_note` | Bewerbende | vorläufige Beschlüsse der WG |
| `Application` | `rejection_reason` | Bewerbende | |
| `Vote` | `resident_profile_id` | Abstimmende | *wer* gestimmt hat, ist Beratungsinhalt über beide Seiten |
| `Vote` | `value` | Bewerbende | die Bewertung selbst |
| `Veto` | `resident_profile_id` | Einlegende | auch bei anonymem Veto gespeichert; Anzeige verbirgt, Datenhaltung nicht |
| `Veto` | `reason` | Bewerbende | Freitext, häufig wertend |
| `CastingNote` | `author_profile_id` | Schreibende | Art. 15 Abs. 4 schützt die **Identität**, nicht den Inhalt |
| `CastingNote` | `body` | Bewerbende | **der rechtlich heikelste Inhalt des Produkts** |
| `AppointmentAttendance` | `note_written` | Bewerbende | **neu, bisher fehlend** — dieselbe Beratungs-Sensibilität wie `CastingNote.author_profile_id` (§2.2) |
| `ActivityEvent` | `payload` (Beratungsereignisse) | beide | Vorschlag: nur Referenzen, keine Werte — §2.5 |
| `Notification` | `payload` (Beratungsereignisse) | beide | dito |

### 9.2 Klasse 🔴 — personenbezogen, Bewerbende (15 Felder)

Dritte, die das Produkt nicht gewählt haben. **180-Tage-Frist, Löschautomatik, Auskunftsexport.**

| Entität | Feld | Bemerkung |
|---|---|---|
| `Application` | `applicant_name` | einziges Pflichtfeld |
| `Application` | `age` | |
| `Application` | `contact_email` | |
| `Application` | `contact_phone` | |
| `Application` | `contact_other` | Portal-Handle, Messenger-Name |
| `Application` | `message_raw` | **enthält unvermeidlich Art.-9-Kategorien** → keine KI-Bewertung (P-5) |
| `Application` | `attributes` (`jsonb`) | freie Zusatzangaben; **keine einladenden Strukturfelder** für Art. 9 |
| `Application` | `planned_move_in_on` | |
| `Application` | `subject_access_exported_at` | Nachweis der Unterstützungspflicht nach Art. 28 Abs. 3 lit. e |
| `Application` | `subject_statement` | Gegendarstellung der betroffenen Person (Art. 16). **Nicht ⚫**: eigene Aussage über sich selbst, unterliegt daher **nicht** V-1. **Frist geerbt, Löschung atomar** (V0.3) |
| `Room` | `promised_to_application_id` | Verknüpfung, personenbeziehbar |
| `AvailabilityWindow` | `application_id`, `raw_input` | `raw_input` ist der Originalfreitext („Di 16–19", „nur abends") |
| `AvailabilityToken` | `application_id` | **neu in V0.2** — der Token identifiziert eine bewerbende Person |
| `ApplicationInviteToken` | `application_id` | **neu, bisher fehlend** — analog zu `AvailabilityToken.application_id`: der Token identifiziert eine bewerbende Person (§2.1) |

### 9.3 Klasse 🟠 — personenbezogen, Bewohnende und Accounts (33 Felder)

Nutzende mit eigenem Zugang. Betroffenenrechte gelten, aber **keine** automatische Löschfrist —
Nutzende löschen selbst.

| Entität | Feld | Bemerkung |
|---|---|---|
| `Account` | `email` | Login-Identität; beim Haushalts-Account bewusst eine **gemeinsam genutzte** Adresse |
| `Account` | `password_hash` | Argon2id |
| `Account` | `email_verified_at` | Voraussetzung für Versand |
| `Account` | `last_seen_at` | speist „was ist passiert, während ich weg war" |
| `Household` | `contact_email` | **neu in V0.3** — nach außen genannte Kontaktangabe für Art. 13 Abs. 1 lit. a. **Nicht** `Account.email`; **keine Postanschrift** (`06` §4.6) |
| `Household` | `privacy_notice_published_by_account_id` | **neu in V0.3** — wer die Datenschutzseite des Haushalts veröffentlicht hat. Die übrigen drei `privacy_notice_*`-Felder sind ⚙️ |
| `Session` | `token_hash`, `account_id`, `acting_profile_id`, `user_agent` | § 25 Abs. 2 Nr. 2 TDDDG einwilligungsfrei. `acting_profile_id` ist die technische Heimat des Profilwechsels (V0.2) und, seit U-21, der geschützte Test gegen Rechteausweitung |
| `PasskeyCredential` | `account_id`, `credential_id`, `public_key`, `label`, `created_at`, `last_used_at` | **neu in V0.2** — optionaler Aufsatz (ADR-007), löschbar ohne Zugangsverlust |
| `Membership` | `role`, `permissions` | **in V0.2 von ⚙️ auf 🟠 umklassifiziert** — „X ist Moderator" ist eine Information über eine identifizierte Person (Art. 4 Nr. 1). Keine automatische Frist, aber **auf Auskunftsverlangen offenzulegen** |
| `ResidentProfile` | `display_name` | Anzeigename im Feed, **seit O-12 zusätzlich Anmeldekennung** — eindeutig pro Haushalt (§2.1) |
| `ResidentProfile` | `moved_in_on`, `moved_out_on` | Wohnsituation; `moved_out_on` löst V-3 aus **und beendet seit V0.4 auch aktive `Session`s** (§2.1) |
| `Application` | `became_resident_id` | **Verknüpfung Bewerbung ↔ Person.** Technisch ein Schlüssel, faktisch die Aussage „diese Person ist eingezogen" — und der Träger von V-1 |
| `Room` | `current_resident_profile_id` | wer aktuell darin wohnt |
| `AppointmentAttendance` | `resident_profile_id`, `attended` | **neu, bisher fehlend.** `attended` seit V0.4 umgedreht (U-23): entsteht mit `true`, von der betroffenen Person selbst und von der Moderation änderbar (§2.2) |
| `AvailabilityWindow` | `resident_profile_id` | Verfügbarkeit ist ein Verhaltensdatum |
| `Appointment` | `expected_attendee_profile_ids` | wer teilnehmen wollte |
| `AvailabilityToken` | `created_by_profile_id` | **neu in V0.2**; `null` = im Verwaltungskontext erzeugt |
| `PushSubscription` | `account_id`, `endpoint`, `keys` | **neu, bisher fehlend** — geräte- und accountbezogen wie `PasskeyCredential` (§2.5) |
| `ActivityEvent` | `actor_account_id`, `actor_profile_id` | Handelnde; `null` = im Verwaltungskontext gehandelt |

**Summe: 59 Felder** (11 ⚫ · 15 🔴 · 33 🟠) in **19 der 23 Entitäten.**

Ohne Inventarzeile: `HouseholdSettings`, `CastingRound`, `RoundParticipation`, `Slot` — sie enthalten
Konfiguration, Zeitraster und Verknüpfungen, aber keine Aussage über eine Person. **`Household` ist in
V0.3 aus dieser Liste herausgefallen**, weil `contact_email` und
`privacy_notice_published_by_account_id` hinzugekommen sind.

> **Korrektur gegenüber V0.3 — derselbe Fehler, den dieser Kasten schon zweimal dokumentiert hat.**
> Das Spec-Update vom 02.09.2026 hat `ApplicationInviteToken`, `AppointmentAttendance` und
> `PushSubscription` ins Modell aufgenommen (§2.1, §2.2, §2.5), aber diese Querprüfungsliste nie
> nachgezogen — sieben Feldzeilen fehlten, bis heute unbemerkt, weil die Zeilensumme selbst keine
> Prüfung auslöst. Zuwachs auf **59** (von **52**): `AppointmentAttendance.note_written` (⚫),
> `ApplicationInviteToken.application_id` (🔴), `AppointmentAttendance.{resident_profile_id,
> attended}` und `PushSubscription.{account_id, endpoint, keys}` (🟠, 5 Felder). Entitäten-Nenner von
> 20 auf **23**, weil dieselben drei Entitäten dort nie gezählt wurden (§2, „Sechs weitere Entitäten").
>
> **Korrektur gegenüber V0.1:** dort stand „33 Felder in 11 der 17 Entitäten". Die Zahl war falsch
> gezählt — die richtige Summe für V0.1 wäre **35** gewesen (10 ⚫ · 12 🔴 · 13 🟠). Der Zuwachs auf
> 50 in V0.2 kam aus `Session`, `PasskeyCredential`, `AvailabilityToken`,
> `Application.subject_statement` und der Umklassifizierung von `Membership.role`/`.permissions`; die
> zwei weiteren in V0.3 aus `Household`. **Maßgeblich sind die Tabellen, nicht die Summe** — genau
> deshalb ist das Datenbestandsverzeichnis ein CI-Gate (ADR-010) und nicht eine Zahl in einem Dokument.
> Dass dieses Dokument seine eigene Summe jetzt zum dritten Mal nachziehen musste, ist das beste
> Argument dafür — und ein Argument für den Mechanismus, den `Session-Sprint-Log.md` §4 für
> `GUARDRAILS.md` vorschlägt (Versionszeilen- und Nummern-Prüfung als Build-Gate).

> **Die beiden Grenzfälle aus V0.1 sind entschieden** (Querprüfung mit `06-Compliance-Anhang.md`):
>
> 1. **`Membership.role` / `.permissions`: 🟠, nicht ⚙️** — **gegen** den Vorschlag von V0.1.
>    Art. 4 Nr. 1 DSGVO ist weit; „X ist Moderator" ist eine Information über eine identifizierte
>    Person. Inventarzeile ja, keine automatische Frist, auf Auskunftsverlangen offenzulegen. Es
>    kostet eine Zeile, und sie auszulassen wäre falsch gewesen.
> 2. **`Household.join_code`: ⚙️, TOM-Liste statt Art.-30-Verzeichnis** — Vorschlag von V0.1
>    angenommen. Der Code identifiziert einen Haushalt, keine Person. Dazu seit V0.4 **fünf
>    Auflagen** (rotierbar, niemals in einem Log inklusive Zugriffslog, niemals in einem
>    Query-String, dazu neu Ablauf und Nutzungsgrenze, S-49) — ausgeführt in §2.1 und als
>    überprüfbare Regel an `GUARDRAILS.md` gemeldet. `join_code_expires_at`,
>    `join_code_max_uses` und `join_code_uses` bleiben aus demselben Grund ⚙️: sie identifizieren
>    den Code, nicht eine Person.

---
