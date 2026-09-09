> **Quelle:** `../04-Domaenenmodell.md` §0, §1, §2 und §11 (Stand V0.4, eingefroren 2026-09-09)
> **Schema-Autorität:** die Dateien in diesem Ordner. Weicht ein Bezeichner anderswo ab, gilt der hier.

# Domänenmodell — Lesehinweise, Landkarte, Aufteilung

## 0. Lesehinweise

### 0.1 Sprachregelung

Erläuterungstext **deutsch**, alle Bezeichner — Entitäten, Felder, Zustände, Enum-Werte, Funktionen
— **englisch**, weil der Code später englisch entsteht (siehe ADR-012). `Household` heißt im UI
in v1 durchgängig **„WG"**; das Label ist Präsentation, nicht Domäne.

### 0.2 Typnotation

Absichtlich datenbanknah, aber nicht Drizzle-spezifisch — das Domänenmodell soll auch dann noch
lesbar sein, wenn der Datenzugriff getauscht wird.

| Notation | Bedeutung |
|---|---|
| `uuid` | Primär- und Fremdschlüssel |
| `text`, `int`, `bool`, `numeric` | Skalare |
| `timestamptz`, `date`, `time` | Zeitpunkte immer mit Zone, Kalendertage ohne |
| `enum(a, b, c)` | geschlossene Wertemenge, im Code als Union-Typ |
| `jsonb` | offene Struktur; nur dort, wo Felder nutzerdefiniert oder Payload sind |
| `uuid[]`, `text[]` | Feld mit Mehrfachwert |
| Suffix `?` | nullable / optional |
| Kursiv im Feldnamen | **abgeleitet, nicht gespeichert** (berechnete Projektion) |

### 0.3 Datenschutz-Klassen

Jedes Feld trägt eine Klasse. Sie ist die Brücke zum `data-inventory.yml` (ADR-010) und zum
Compliance-Anhang: **jedes mit 🔴, 🟠 oder ⚫ markierte Feld braucht dort eine Zeile** mit Zweck,
Rechtsgrundlage, Kategorie und Frist. §9 listet sie noch einmal geschlossen auf.

| Klasse | Bedeutung | Folge |
|:--:|---|---|
| 🔴 | personenbezogen, **Bewerbende** — Dritte, die die App nicht nutzen und sie nicht gewählt haben | Aufbewahrungsfrist, Auskunftsexport, Löschautomatik |
| 🟠 | personenbezogen, **Bewohnende / Account** — Nutzende mit eigenem Zugang | Betroffenenrechte, Auth-Härtung |
| ⚫ | personenbezogen **und Beratungsinhalt über eine Person** — Stimmen, Vetos, Notizen, Aggregate | zusätzlich Selbst-Redaktion **V-1**, strengste Klasse |
| ⚙️ | nicht personenbezogen (technisch, Konfiguration, Zeitraster) | keine Inventarzeile nötig |

> ⚫ ist keine Alternative zu 🔴/🟠, sondern eine Verschärfung: ein ⚫-Feld ist immer auch
> personenbezogen. Der Unterschied ist, dass es zusätzlich **vor der betroffenen Person selbst**
> verborgen werden muss — das ist der schwierigste Teil des Produkts (§5).

### 0.4 Was dieses Dokument nicht enthält

Keine Indizes, keine Migrationen, keine API-Verträge, keine Screen-Zuordnung. Die
Aufwandsschätzung steht in `02-SRD.md`, der Stack in ADR-006, die Rechtsanalyse der markierten
Felder in `06-Compliance-Anhang.md`.

---

## 1. Landkarte

```text
                            ┌──────────────────────────────────────┐
      identity              │  Account ──owns──▶ Household         │
                            │   │  │                  │            │
                            │   │  ├─▶ Session        │            │
                            │   │  └─▶ PasskeyCredential           │
                            │   │                HouseholdSettings │
                            │   ▼                     │            │
                            │  Membership ◀───────────┘            │
                            │     │  (is_resident, role, perms)    │
                            │     ▼                                │
                            │  ResidentProfile                     │
                            └──────┬───────────────────────────────┘
                                   │ referenziert (nie join über Grenze)
      casting              ┌───────▼──────────────────────────────┐
                           │  CastingRound ──has──▶ Room          │
                           │     │  │                             │
                           │     │  └──▶ RoundParticipation ──▶ ResidentProfile
                           │     ▼                                │
                           │  Application  ──became_resident_id──▶ ResidentProfile
                           └───┬───────────────────────┬──────────┘
                               │                       │
      deliberation  ┌──────────▼─────────┐   scheduling ▼────────────────────┐
                    │  Vote              │   │  AvailabilityWindow           │
                    │  Veto              │   │  AvailabilityToken            │
                    │  CastingNote       │   │  Slot ──▶ Appointment         │
                    │  ⟨Ranking, pure⟩   │   │        (Solver-Port)          │
                    │                    │   │  ⟨Kostenmodell, pure⟩         │
                    └──────────┬─────────┘   └───────────┬───────────────────┘
                               │  Domain-Events          │
      audit                    ▼─────────────────────────▼
                            ┌──────────────────────────────────────┐
                            │  ActivityEvent  (append-only)        │
                            └──────────────┬───────────────────────┘
      notifications                        ▼
                            ┌──────────────────────────────────────┐
                            │  Notification  (Fan-out, gefiltert)  │
                            └──────────────────────────────────────┘
```

Zwei Dinge sind an dieser Karte wichtiger als die Kästen:

1. **`Application.became_resident_id` ist der einzige Pfeil, der aus `casting` zurück in
   `identity` zeigt** — und er trägt die gesamte Selbst-Redaktion (§5.1). Er ist damit das
   sensibelste Feld des Modells.
2. **`Notification` hängt hinter `ActivityEvent`, nicht neben den Fachkontexten.** Der Fan-out
   liest Ereignisse und fragt sichtbarkeitsgefilterte Projektionen ab; er greift nie direkt in
   `deliberation`. Sonst wäre der Benachrichtigungspfad der bequemste Weg, die
   Sichtbarkeitsregeln zu umgehen — historisch das häufigste Leck in solchen Systemen.

---

---

## 2. Entitäten

Die **17 Namen** aus dem Bezeichner-Kontrakt sind verbindlich (siehe Statusbanner).

**Sechs weitere Entitäten liegen außerhalb des ursprünglichen Kontrakts.** Drei aus der
Querprüfung mit `06-Compliance-Anhang.md` in V0.2: `Session`, `PasskeyCredential`,
`AvailabilityToken` — technisch notwendig, weil der Compliance-Anhang Aussagen darauf stützt, die
im Modell kein Gegenstück hatten. Drei weitere aus dem Spec-Update vom 02.09.2026: `ApplicationInviteToken`,
`AppointmentAttendance`, `PushSubscription` (§2.1, §2.2, §2.5). Für keine der sechs gilt der
Namensschutz aus dem Statusbanner: ihre Namen dürfen beim Aufsetzen des Auth-, Casting- bzw.
Scheduling-Moduls noch geändert werden, ohne dass Verweise brechen.

Reihenfolge nach Bounded Context.

---

## Aufteilung dieses Ordners

`../04-Domaenenmodell.md` ist eingefroren. Gepflegt wird hier.

| Datei | Inhalt | Quelle |
|---|---|---|
| `identity.md` | `Account`, `Household`, `HouseholdSettings`, `ResidentProfile`, `Membership`, `Session`, `PasskeyCredential` | §2.1 |
| `casting.md` | `Room`, `CastingRound`, `RoundParticipation`, `Application`, `ApplicationInviteToken` | §2.2 |
| `deliberation.md` | `Vote`, `Veto`, `CastingNote` | §2.3 |
| `scheduling.md` | `AvailabilityWindow`, `Slot`, `Appointment`, `AppointmentAttendance`, `AvailabilityToken` | §2.4 |
| `audit-und-notifications.md` | `ActivityEvent`, `Notification`, `PushSubscription` | §2.5 |
| `zustandsmaschinen.md` | die Zustandsmaschinen von `Application`, `CastingRound`, `Room` — und warum `Appointment` und `Vote` keine haben | §3 |
| `kontextgrenzen.md` | die sechs Bounded Contexts, ihre Importregeln, das Diagramm — und der reine Domänenkern | §4, §6 |
| **`invarianten.md`** | **V-1 … V-4** als Prädikate, samt den RLS-Policies | §5 |
| `aufbewahrung.md` | Aufbewahrung, Löschung, Datenauskunft | §7 |
| `rechenmodelle.md` | Score, Favoriten-Budget, Rangfolge, Termin-Kosten, Determinismus, `phase_hint`, CTA-Sortierung, `audience_class` | §8 |
| `personenbezogene-felder.md` | Querprüfungsliste der Klassen ⚫ / 🔴 / 🟠 | §9 |
| `offene-punkte.md` | §10 samt der Warnung zu den zwei Nummernräumen | §10 |

> **Eine Regel zur Aufteilung.** Die RLS-Policies aus §5.5 verweisen absichtlich auf Tabellen
> mehrerer Kontexte — §4 führt das als dokumentierte Ausnahme. Sie stehen **ausschließlich** in
> `invarianten.md` und werden **nicht** in die Kontextdateien kopiert. Fünf driftende Kopien einer
> Ausnahme sind genau die Fehlerklasse, an der §9 dieses Dokuments dreimal gescheitert ist.

> **`V-1` bis `V-4` bleiben zusammen.** Sie werden aus `../GUARDRAILS.md`, `../03-PRD.md` und
> `../screens/` zitiert; jeder `V-`-Verweis muss auf **eine** Stelle auflösen.

> **Abweichung von der geplanten Aufteilung, benannt:** `audit` und `notifications` sollten
> getrennte Dateien werden. Das Quelldokument führt beide in **einem** Abschnitt (§2.5) — eine
> Trennung hätte einen Schnitt erfunden, den die Quelle nicht macht. Sie liegen deshalb zusammen.

---

## 11. Verweise

| Ziel | Wofür |
|---|---|
| `00-Session-Brief.md` | Entscheidungsprotokoll der Session vom 2026-08-19; Ausgangspunkt dieses Dokuments, **historisch** — bei Widerspruch gilt die Kette, nicht das Protokoll |
| `02-SRD.md` | Scope, Metriken, Risiken, Aufwand — lösungsneutral |
| `03-PRD.md` | Nutzerflüsse und Akzeptanzkriterien, insbesondere zur Sichtbarkeitsinvariante |
| `07-Screen-Inventar.md` | **neu.** Narrative Gegenstelle zu §8.6–§8.8: `phase_hint` (dort §3.1), CTA-Sortierung (dort §2.2) und die UI-Sprachregelung — dieselben Regeln in einfacher Sprache statt Pseudocode |
| `05-ADRs.md` | ADR-001 bis ADR-012 — die Architekturentscheidungen hinter diesem Modell |
| `06-Compliance-Anhang.md` | Rechtsanalyse und Art.-30-Verzeichnis zu §9 |
| `GUARDRAILS.md` | geschützte Tests zu V-1 bis V-4, I-1 bis I-10 und zum Solver-Determinismus |

---

> **Zum Schluss noch einmal der Rahmen:** Dieses Dokument ist ein **Vorschlag**. Es ist ausführlich,
> weil ein ausführlicher Vorschlag angreifbar ist und ein knapper nur autoritativ wirkt. Die
> nützlichste Reaktion darauf ist nicht Zustimmung, sondern eine Liste der Stellen, an denen die
> Begründung nicht trägt.
