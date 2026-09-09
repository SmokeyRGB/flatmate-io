> **Quelle:** `../04-Domaenenmodell.md` §2.4 (Stand V0.4, eingefroren 2026-09-09)
> **Kontext:** `scheduling`
> **Schema-Autorität:** Diese Datei. Weicht ein Bezeichner anderswo ab, gilt der hier.

### 2.4 Kontext `scheduling`

#### `AvailabilityWindow` — ein Zeitfenster

**Eine** Entität für Bewohnende und Bewerbende, weil das Kostenmodell beide gleich behandelt.
Kanalneutral (P-1): Rasterklick, Freitext-Parser, Token-Link und manuelle Eingabe erzeugen
denselben Datensatz.

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `household_id` · `round_id` | `uuid` · `uuid?` | ⚙️ | |
| `subject_kind` | `enum(resident, applicant)` | ⚙️ | |
| `resident_profile_id` | `uuid?` | 🟠 | gesetzt bei `subject_kind = resident` |
| `application_id` | `uuid?` | 🔴 | gesetzt bei `subject_kind = applicant` |
| `polarity` | `enum(can, cannot)` | ⚙️ | „kann" und „kann nicht" sind **beide** explizit — ein fehlendes Fenster heißt „unbekannt", nicht „kann nicht" |
| `starts_at` · `ends_at` | `timestamptz` | ⚙️ | |
| `source` | `enum(grid, text_parse, token_link, manual)` | ⚙️ | |
| `raw_input` | `text?` | 🔴 | der Freitext, aus dem geparst wurde („Di 16–19", „dienstags ab 16", „nur abends") — bleibt erhalten, damit ein Fehlparse nachvollziehbar ist |
| `confirmed_by_profile_id` | `uuid?` | ⚙️ | **Parser-Vorschläge sind immer bestätigungspflichtig, nie stillschweigend** (P-3) |
| `created_at` | `timestamptz` | ⚙️ | |

> **Der Token-Link ist bewusst minimal.** Eine Seite, ein Zeitraster, kein Konto, keine weiteren
> Daten, und er trägt den Art.-13-Hinweis. Er ist ein **Komfortpfad**, kein Voraussetzungspfad:
> jede Angabe muss auch von Hand einpflegbar sein (P-1). Bewerbende werden nie in die App gezwungen.

#### `AvailabilityToken` — der Zugang zur Bewerberseite

**Neu in V0.2** (Querprüfung). `AvailabilityWindow.source = token_link` verwies auf einen Token, den
das Modell nirgends geführt hat.

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `token_hash` | `text` | ⚙️ | **nur der Hash.** Der Klartext existiert genau einmal — im Link, den der Haushalt verschickt |
| `application_id` | `uuid` | 🔴 | der Token identifiziert eine bewerbende Person, ist also personenbeziehbar |
| `round_id` | `uuid` | ⚙️ | |
| `expires_at` | `timestamptz` | ⚙️ | **kurze Lebensdauer** — Vorschlag 14 Tage |
| `used_at` | `timestamptz?` | ⚙️ | erste Nutzung; der Token bleibt danach bis `expires_at` gültig, damit Korrekturen möglich sind |
| `created_by_profile_id` | `uuid?` | 🟠 | `null` = im Verwaltungskontext erzeugt |
| `revoked_at` | `timestamptz?` | ⚙️ | |

> **Das ist die zweite unauthentifizierte Fläche des Produkts** — die erste ist die Anmeldeseite. Sie
> ist gefährlicher, als sie aussieht, weil hinter dem Token ein personenbezogener Datensatz steht,
> ohne dass jemand ein Passwort eingibt. Drei Konsequenzen:
>
> 1. **Nicht erratbare Tokens** (kryptografisch zufällig, ausreichend lang) und nur der Hash in der
>    Datenbank. Ein Token ist ein Passwortäquivalent mit Ablaufdatum.
> 2. **Kurze Lebensdauer**, und `revoked_at`, damit ein falsch verschickter Link entwertet werden kann.
> 3. Die Seite dahinter zeigt **ausschließlich** das Zeitraster und den Art.-13-Hinweis — **keine**
>    Bewerbungsdaten, **keinen** Namen, **keine** anderen Bewerbenden, und selbstverständlich nichts
>    aus `deliberation`. Wer den Link abfängt, sieht ein leeres Raster.

> ⚠️ Offener Punkt (O-11) — **eine Inkonsistenz im Session-Brief, in der Querprüfung aufgelöst.**
> Der Entscheidungsteil des Briefs führt den Verfügbarkeits-Link als v1-Bestandteil („hybrid"), die
> Phasentabelle stellt ihn nach v1.1.
>
> **Auflösung, damit unter beiden Lesarten keine Migration nötig wird: `AvailabilityToken` wird in v1
> modelliert, die bewerberseitige Seite bleibt v1.1.** Das Modell kostet eine Tabelle, das Vorziehen
> der Seite kostet dann nur noch UI. Ob sie nach v1 vorgezogen wird, entscheidet der Nutzer.
>
> Bis dahin trägt die **vollwertige manuelle Eingabe** den Pfad allein — was ohnehin die Bedingung
> aus P-1 ist und nicht ein Rückfall.

#### `Slot` — ein Platz im Raster

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `round_id` | `uuid` | ⚙️ | |
| `starts_at` · `ends_at` | `timestamptz` | ⚙️ | |
| `capacity` | `int` | ⚙️ | `1`, außer parallele Castings sind erlaubt |
| `is_blocked` | `bool` | ⚙️ | manuell gesperrt |
| `origin` | `enum(grid, solver, manual)` | ⚙️ | |
| *`available_resident_count`* | *abgeleitet* | ⚙️ | Heatmap „4/7 können" — reine Aggregation über `AvailabilityWindow` |

#### `Appointment` — der Casting-Termin

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `round_id` · `application_id` · `slot_id` | `uuid` | ⚙️ | |
| `status` | `enum(proposed, confirmed, cancelled, completed, no_show)` | ⚙️ | **keine eigene Zustandsmaschine** — die Prozesswahrheit liegt in `Application.state`; siehe §3.4 |
| `location` | `text?` | ⚙️ | |
| `expected_attendee_profile_ids` | `uuid[]` | 🟠 | wer teilnehmen wollte |
| `confirmed_by_profile_id` | `uuid?` | ⚙️ | moderierende Person bestätigt — **nie der Solver** |
| `solver_run_id` | `uuid?` | ⚙️ | Rückverweis auf den Lauf, aus dem der Vorschlag stammt |
| `explanation` | `jsonb?` | ⚙️ | verletzte Soft-Terme im Klartext, z. B. `[{term: "resident_coverage", detail: "5/7 können"}]` — Erklärbarkeit ist Pflicht (P-3, §8.4) |
| `created_at` · `cancelled_at` | `timestamptz` · `timestamptz?` | ⚙️ | |

> **O-7 — entschieden** (§10.2): `expected_attendee_profile_ids` als Array bleibt für die reine
> Teilnahme-*Absicht* stehen. Für Anwesenheit und Notizstatus gibt es jetzt die eigene
> Verknüpfungstabelle **`AppointmentAttendance`** (§2.2, bewusst im `casting`-Kontext, weil sie die
> CastingNote-Erinnerung speist, nicht die Terminverwaltung) — Feldtabelle und Begründung dort.
