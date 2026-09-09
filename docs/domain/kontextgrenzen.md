> **Quelle:** `../04-Domaenenmodell.md` §4 und §6 (Stand V0.4, eingefroren 2026-09-09)
> **Schema-Autorität:** Diese Datei. Weicht ein Bezeichner anderswo ab, gilt der hier.

## 4. Bounded Contexts

Sechs Kontexte in **einem** Deployable (modularer Monolith, ADR-001). Die Grenzen sind keine
Netzwerkgrenzen, sondern Importgrenzen — durchgesetzt per Lint, nicht per Absprache.

| Kontext | Besitzt | Darf importieren aus | Darf **nicht** |
|---|---|---|---|
| `identity` | `Account`, `Household`, `HouseholdSettings`, `ResidentProfile`, `Membership` | — | nichts; `identity` ist die Wurzel und kennt kein Casting |
| `casting` | `Room`, `CastingRound`, `RoundParticipation`, `Application` | `identity` | `deliberation`, `scheduling`, `notifications` |
| `deliberation` | `Vote`, `Veto`, `CastingNote`, Ranking-Funktionen | `casting`, `identity` | `scheduling`, `notifications` |
| `scheduling` | `AvailabilityWindow`, `Slot`, `Appointment`, Solver-Port | `casting`, `identity` | **`deliberation`** — siehe Kasten |
| `audit` | `ActivityEvent` | — | alles; `audit` **empfängt** nur |
| `notifications` | `Notification` | `audit`, plus veröffentlichte Query-Ports aller Kontexte | direkter Tabellenzugriff auf `deliberation` oder `casting` |

```text
                     ┌──────────┐
                     │ identity │  ◀── Wurzel, kennt niemanden
                     └────▲─────┘
                          │
                     ┌────┴─────┐
                     │ casting  │
                     └──▲────▲──┘
                        │    │
          ┌─────────────┘    └─────────────┐
   ┌──────┴───────┐                 ┌──────┴──────┐
   │ deliberation │   ✗ keine Kante │ scheduling  │
   └──────┬───────┘  ◀────────────▶ └──────┬──────┘
          │  Domain-Events                 │
          └──────────────┬─────────────────┘
                         ▼
                    ┌─────────┐         ┌───────────────┐
                    │  audit  │ ──────▶ │ notifications │
                    └─────────┘         └───────────────┘
```

**Zwei harte Regeln:**

1. **Keine Cross-Context-Joins.** Ein SQL-Statement fasst nie Tabellen zweier Kontexte an. Lesen
   über die Grenze geht über einen **Query-Port**, der ein DTO liefert — kein ORM-Objekt, keine
   Relation. Der Preis ist ein zweiter Roundtrip; der Gegenwert ist, dass eine Kontextgrenze
   nachträglich zu einer Prozessgrenze werden kann, ohne dass die Fachlogik es merkt.
2. **`audit` und `notifications` schreiben nie in Fachtabellen.** Sie sind Senken.

> **Warum `scheduling` nicht in `deliberation` schauen darf — die interessanteste Kante des Modells.**
>
> Die Versuchung ist groß: „lade die bestbewerteten Bewerbenden zuerst ein", „gib der
> höchstgerankten Person den bequemsten Slot". Technisch trivial, fachlich ein Bruch.
>
> Erstens ist es eine **Sichtbarkeitslücke**: der Terminvorschlag würde die Rangfolge implizit
> preisgeben — auch gegenüber Personen, die noch nicht abgestimmt haben (V-4) oder für die V-1
> greift. Zweitens verletzt es **P-3**: ein Terminvorschlag, der sich aus einer Bewertung ableitet,
> ist nicht mehr aus dem Kalender erklärbar. Drittens ist es genau die Sorte Kopplung, die man in
> zwei Jahren nicht mehr rückbaut.
>
> Der Solver kennt deshalb ausschließlich Zeitfenster, Slots und Haushalts-Präferenzen. Rangfolge
> ist **kein** Eingabewert.
>
> ⚠️ Offener Punkt (O-8) — falls das später doch gewollt ist, gehört es als **explizite, abschaltbare
> Haushaltseinstellung** ins Modell und in den Compliance-Anhang, nicht als stille Solver-Gewichtung.

**Eine dokumentierte Ausnahme:** Die RLS-Policies in §5.5 referenzieren notwendigerweise Tabellen
mehrerer Kontexte (eine Policy auf `votes` muss `applications` und `memberships` lesen). Das ist
kein Bruch von Regel 1, weil Policies in Migrationen leben und nicht im Anwendungscode — aber es ist
eine echte Kopplung, die bei einer späteren Kontextaufspaltung zuerst wehtut. Der Lint-Check
schließt das Migrationsverzeichnis deshalb bewusst aus, und dieser Satz ist der Grund, damit
niemand ihn später für einen Fehler hält.

---

## 6. Reiner Domänenkern

Fünf Dinge sind **pure Funktionen ohne Datenbankzugriff** — Eingabe rein, Ergebnis raus, kein
`await`, kein Repository, keine Uhr:

| Baustein | Signatur (skizziert) | Warum pur |
|---|---|---|
| Zustandsübergänge | `transition(state, event, ctx) → state \| Error` | Die Übergangstabelle ist eine Datenstruktur. Sie zu testen darf keine Migration brauchen |
| Voting-Mathematik | `score(votes, weights) → 0…100` | Der Score ist das Legitimitätsversprechen (P-3). Er muss in einem Testfall mit sechs Zeilen nachrechenbar sein |
| Rangfolge | `rank(applications, votes, vetoes, settings) → Ranking` | Tie-Breaker sind nur überprüfbar, wenn man sie ohne Datenbank durchspielen kann |
| Termin-Kostenmodell | `cost(assignment, windows, prefs) → int` | Muss **unabhängig vom Solver** nachrechenbar sein — genau das ist die Erklärbarkeitsanforderung (§8.4) |
| Zeitfenster-Parser | `parse("Di 16–19", ref_date) → AvailabilityWindow[]` | Regelbasiert, kein Modell (P-5). Testbar als Tabelle aus Eingabe und Erwartung |

Die Uhr ist dabei ein Eingabewert, kein Seiteneffekt: jede Funktion, die „jetzt" braucht, bekommt
es übergeben. Sonst sind Fristenlogik und Terminvorschläge nicht reproduzierbar testbar.

> **Der Nutzen ist nicht Eleganz, sondern Angreifbarkeit.** Alle fünf Bausteine sind Stellen, an
> denen dieses Dokument bewusst Vorschläge macht, die falsch sein können. Als pure Funktionen kann
> man sie widerlegen, ohne die Anwendung zu starten — und ersetzen, ohne sie umzubauen.

---
