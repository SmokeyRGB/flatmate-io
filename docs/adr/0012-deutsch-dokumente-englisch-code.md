> **Status:** Bestätigt — verbindlich für v0.1
> **Quelle:** `../05-ADRs.md` §ADR-012 (Stand V0.8, eingefroren 2026-09-09)
> **Nummer:** ADR-012 — dauerhaft. Nummern werden nie neu vergeben.

## ADR-012 — Deutsch in Dokumenten, Englisch im Code

### Kontext

Der Autor arbeitet auf Deutsch und denkt die Domäne auf Deutsch — „WG", „Casting", „Zusage",
„Bewerbende". Der Code entsteht englisch, wie üblich. Die Domäne enthält Begriffe, für die es keine
saubere englische Entsprechung gibt: eine deutsche **WG** ist nicht ein *flatshare*, ein
**WG-Casting** ist kein *interview*, und ein **Wohnprojekt** ist gar nichts auf Englisch.

Die Gefahr ist nicht die Sprachwahl, sondern die **Vermischung**: `applicantBewertung`,
`hasZusage`, `castingRunde` — Bezeichner, die in beiden Sprachen falsch sind und die niemand
verlässlich errät. Bei AI-gestützter Implementierung wird das schnell zum Selbstläufer, weil ein
Agent den vorhandenen Stil fortschreibt, egal wie inkonsistent er ist.

### Betrachtete Optionen

| Option | Vorteil | Nachteil | Bewertung |
|---|---|---|---|
| **Dokumente deutsch, alle Bezeichner englisch** ✅ | Denken in der Muttersprache, Code in der Konvention. Klare Grenze, an der man sieht, wenn sie verletzt wird | Braucht ein **Glossar**, sonst driften Übersetzungen („Zusage" → `offer` oder `acceptance`?) | **Gewählt** |
| Alles englisch | eine Sprache, keine Grenze zu pflegen | Die Anforderungsarbeit verliert Präzision. „WG-Casting" englisch zu beschreiben, erzeugt Ungenauigkeit an genau der Stelle, an der es auf Genauigkeit ankommt | Verworfen |
| Alles deutsch, inklusive Code | maximale Domänennähe | Bricht mit jeder Bibliothekskonvention; unlesbar für externe Beitragende; AI-Agenten produzieren dabei zuverlässig Mischformen | Verworfen |
| Deutsche Domänenbegriffe im Code, Rest englisch | „Unübersetzbares" bleibt präzise | Der Grenzfall wird zur Regel; jede neue Entität löst eine Debatte aus | Verworfen |

### Entscheidung

Erläuterungstext, Begründungen und alle Dokumente **deutsch**. Entitäten, Felder, Zustände,
Enum-Werte, Funktionen, Tabellen, Commit-Nachrichten, Codekommentare **englisch**.

`Household` heißt im UI in v1 durchgängig **„WG"** — das ist **Präsentation, nicht Domäne**. Die
Übersetzung lebt in der UI-Schicht, nicht im Modell.

**Ein Glossar ist Teil der Entscheidung, nicht optional.** Ohne verbindliche Zuordnung driftet die
Übersetzung, und dann heißt dasselbe Ding an drei Stellen anders:

| Deutsch | Englisch (Kontrakt) |
|---|---|
| WG / Haushalt / Wohnprojekt | `Household` |
| Bewohner-Profil | `ResidentProfile` |
| Mitgliedschaft | `Membership` |
| Zimmer | `Room` |
| Castingrunde | `CastingRound` |
| Rundenteilnahme | `RoundParticipation` |
| Bewerbung | `Application` |
| Stimme | `Vote` |
| Veto / Einspruch | `Veto` |
| Casting-Notiz | `CastingNote` |
| Zeitfenster / Verfügbarkeit | `AvailabilityWindow` |
| Slot / Zeitplatz | `Slot` |
| Termin | `Appointment` |
| Ereignis (Feed) | `ActivityEvent` |
| Benachrichtigung | `Notification` |
| Einladen (Runde 1) | `stage = invite` |
| Zusage (Runde 2) | `stage = offer` |
| Zusage erteilt | `offer_made` |
| Eingezogen | `moved_in` |
| Ausgezogen | `moved_out` |

### Konsequenzen

**Positiv**

- Anforderungsarbeit bleibt präzise, Code bleibt konventionell.
- Das Glossar ist eine überprüfbare Liste: ein deutscher Bezeichner im Code ist eindeutig ein Fehler,
  kein Geschmacksfall.
- Ein Projekt, das später Beitragende bekommt, ist im Code sofort lesbar.

**Negativ**

- **Doppelte Begriffspflege.** Jeder neue Begriff braucht eine Glossarzeile, sonst driftet er.
- **Mischformen sind der wahrscheinlichste Verstoß**, besonders bei AI-generiertem Code, der
  deutschsprachige Prompts fortschreibt. Prüfbar per Lint (Bezeichner gegen eine deutsche Wortliste)
  — mit Restunsicherheit.
- **Die deutschen Dokumente sind für externe Beitragende eine Hürde.** Bewusst akzeptiert: das
  Projekt ist zuerst für seinen Autor gedacht.
- **Fehlermeldungen und UI-Texte sind ein Zwischenfall.** Vorschlag: technische Meldungen englisch,
  nutzersichtbare Texte deutsch über eine Übersetzungsschicht — auch wenn v1 nur `de` kennt, weil
  sonst deutsche Zeichenketten im Code landen und die Grenze verwischen.

**Ausnahme, benannt statt geduldet: die Requirements-Pakete sind englisch.**
`docs/backlog/` — die Pakete `F0` bis `F5`, die Feature-Kurzfassungen, die Roadmap und der
MVP-Index — ist durchgängig **englisch**, entstanden im Rahmen einer englischsprachigen
Workshop-Übung. Diese Ausnahme wird hier festgeschrieben, weil sie sonst als Drift gelesen wird
und irgendwer sie „korrigiert":

- **Regel:** Begründungsdokumente deutsch (`00`–`08`, `GUARDRAILS.md`, `06-Compliance-Anhang.md`,
  `review-log.md`), **implementierungsnahe Dokumente englisch** (`docs/backlog/**`,
  `docs/COVERAGE.md`, `tools/**`).
- **Warum die Naht klein ist:** Alle Bezeichner sind ohnehin englisch. Ein Paket besteht fast
  ausschließlich aus Bezeichnern, Zuständen und prüfbaren Sätzen darüber — die deutsche Prosa,
  die dieser Record schützt, trägt dort kaum Gewicht.
- **Was trotzdem deutsch bleibt:** wörtliche Zitate aus der Kette stehen in Anführungszeichen
  auf Deutsch, statt paraphrasiert zu werden. Die Pakete sind damit streng genommen zweisprachig,
  und das ist beabsichtigt: eine Zusicherung soll im Wortlaut ihrer Quelle zitierbar bleiben.
- **UI-Sprache ist unberührt.** Sichtbarer Text bleibt deutsch (E-02, U-24); dafür gilt die
  Übersetzungstabelle in `07-Screen-Inventar.md` §8.6.

> **Das gibt man auf, wenn** das Projekt Beitragende gewinnt, die kein Deutsch lesen. Dann werden die
> Dokumente zweisprachig — der Code ist es bereits.

**Status: Bestätigt — verbindlich für v0.1**

> **Bestätigt am 2026-09-09** (Samuel Zink) — verbindlich für v0.1.
> · **Aufgabebedingung:** Das gibt man auf, wenn das Projekt Beitragende gewinnt, die kein Deutsch
> lesen.
> · **Was ein späterer Widerspruch kostet:** Entweder jeden Bezeichner umbenennen oder jedes Dokument
> neu übersetzen
> · Status wechselt auf `Angenommen`, sobald im Code umgesetzt und überprüft.

---
