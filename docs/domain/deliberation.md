> **Quelle:** `../04-Domaenenmodell.md` §2.3 (Stand V0.4, eingefroren 2026-09-09)
> **Kontext:** `deliberation`
> **Schema-Autorität:** Diese Datei. Weicht ein Bezeichner anderswo ab, gilt der hier.

### 2.3 Kontext `deliberation`

Alles in diesem Kontext ist ⚫ — Beratungsinhalt über eine Person.

#### `Vote` — eine Stimme

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `round_id` · `application_id` | `uuid` · `uuid` | ⚙️ | |
| `resident_profile_id` | `uuid` | ⚫ | wer gestimmt hat |
| `stage` | `enum(invite, offer)` | ⚙️ | Runde 1 (Einladen) und Runde 2 (Zusage) nutzen **dieselbe** Skala und dieselbe Tabelle |
| `value` | `enum(no, rather_not, good, definitely)` | ⚫ | vierstufig (ADR-008) |
| `created_at` · `updated_at` | `timestamptz` | ⚙️ | Stimmen sind während des Screenings **frei revidierbar** |
| `withdrawn_at` | `timestamptz?` | ⚙️ | zurückgezogene Stimmen zählen nicht, bleiben aber im Protokoll |
| *`weight`* | *abgeleitet* | ⚙️ | `settings_snapshot.scale_weights[value]` — nie gespeichert, damit Gewichtsänderungen nachvollziehbar bleiben |
| *`cast_by_former_member`* | *abgeleitet* | ⚙️ | `profile.status == moved_out` — speist die Kennzeichnung „ehemaliges Mitglied" |

Eindeutigkeit: `(application_id, resident_profile_id, stage)`.

#### `Veto` — der Einspruch

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `round_id` · `application_id` | `uuid` · `uuid` | ⚙️ | |
| `resident_profile_id` | `uuid` | ⚫ | **auch bei anonymem Veto gespeichert** — für Budgetzählung und Missbrauchsprüfung; die Anzeige verbirgt es, die Datenhaltung nicht |
| `reason` | `text?` | ⚫ | Pflicht, wenn `veto_requires_reason` |
| `is_anonymous` | `bool` | ⚙️ | nur wählbar, wenn `veto_anonymous_allowed` |
| `stage` | `enum(offer)` | ⚙️ | v1: Veto nur in Runde 2 |
| `created_at` | `timestamptz` | ⚙️ | |
| `withdrawn_at` | `timestamptz?` | ⚙️ | |
| `locked_at` | `timestamptz?` | ⚙️ | Vetos werden an der Phasengrenze gesperrt — **kein Veto nach `offer_made`** |

> **Anonymitäts-Ehrlichkeit als Anforderung, nicht als Einstellung.** In einer Fünfer-WG ist ein
> anonymes Veto mit Begründungspflicht nicht anonym — der Schreibstil verrät die Person. Die UI
> **muss** das an der Stelle sagen, an der die Einstellung gesetzt wird. Default ist deshalb Veto
> mit Begründung **und** Zuordnung: die ehrlichere Variante.

#### `CastingNote` — die Notiz zum Casting

Der rechtlich heikelste Inhalt im ganzen Produkt (siehe `06-Compliance-Anhang.md`, „Küchentisch vs.
System"): dieselben Sätze, die in einer WhatsApp-Gruppe unter die Haushaltsausnahme fielen, sind
hier auskunftspflichtige personenbezogene Daten.

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `application_id` | `uuid` | ⚙️ | |
| `appointment_id` | `uuid?` | ⚙️ | wenn die Notiz zu einem konkreten Termin gehört |
| `author_profile_id` | `uuid` | ⚫ | |
| `author_account_id` | `uuid` | ⚙️ | Ereignis speichert Account **und** handelndes Profil |
| `prompt_key` | `text?` | ⚙️ | bei strukturierten Notiz-Prompts, z. B. `fit_shared_spaces`, `open_questions` |
| `body` | `text` | ⚫ | Freitext. UI zeigt dauerhaft den Hinweis **„schreib so, als könnte die Person es lesen"** |
| `created_at` · `updated_at` | `timestamptz` | ⚙️ | |
| `retention_until` | `date` | ⚙️ | 180 Tage nach Rundenabschluss |
| `deleted_at` | `timestamptz?` | ⚙️ | |
