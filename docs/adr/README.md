# Architecture Decision Records — Index

> **Status:** V1.0 · 2026-09-09 · Samuel Zink (@SmokeyRGB)
> **Quelle:** aufgeteilt aus `../05-ADRs.md` (Stand V0.8), das seither **eingefroren** ist.
> **Gepflegt wird hier.** Änderungen an einem Record gehen in seine Einzeldatei, nie in die
> Sammeldatei.

---

## Die fünfzehn Records

| # | Entscheidung | Status |
|---|---|---|
| [0001](0001-modularer-monolith-bounded-contexts.md) | Modularer Monolith mit sechs Bounded Contexts — Grenzen als **Import**grenzen, per Lint erzwungen | ✅ Bestätigt |
| [0002](0002-explizite-zustandsmaschine.md) | Explizite Zustandsmaschine statt Boolean-Flags — ungültige Zustände existieren nicht | ✅ Bestätigt |
| [0003](0003-append-only-ereignis-log.md) | Append-only Ereignis-Log, **kein** volles Event-Sourcing | 🔶 Vorschlag |
| [0004](0004-autorisierung-policy-und-rls.md) | Autorisierung **zweifach**: Policy-Objekte **und** Postgres RLS | ✅ Bestätigt |
| [0005](0005-solver-ortools-cp-sat-kindprozess.md) | Solver via `ortools` (CP-SAT) als lokaler Kindprozess | 🔶 Vorschlag |
| [0006](0006-stack-nextjs-postgres-drizzle.md) | Stack: Next.js/TypeScript, Postgres, Drizzle, Supabase (EU) mit Supabase Auth | ✅ Bestätigt |
| [0007](0007-passwort-primaer-passkey-optional.md) | Passwort primär, Passkey optional | 🔶 Vorschlag |
| [0008](0008-vierstufige-skala-favoriten-budget.md) | Vierstufige Skala mit nachgelagertem Favoriten-Budget | ✅ Bestätigt |
| [0009](0009-kanalneutralitaet.md) | Kanalneutralität als Architekturregel, nicht als Feature | 🔶 Vorschlag |
| [0010](0010-datenbestandsverzeichnis-ci-gate.md) | Datenbestandsverzeichnis als CI-Gate | ✅ Bestätigt |
| [0011](0011-pwa-statt-native-app.md) | PWA statt native App | 🔶 Vorschlag |
| [0012](0012-deutsch-dokumente-englisch-code.md) | Deutsch in Dokumenten, Englisch im Code | ✅ Bestätigt |
| [0013](0013-zwei-account-typen-feste-identitaet.md) | Zwei Account-Typen, eine feste Identität je Sitzung — der Wechsel verlangt Abmelden und neue Anmeldung | ✅ Bestätigt |
| [0014](0014-haushalts-account-sieht-runden-ohne-bewerbungsdaten.md) | Der Haushalts-Account sieht Runden in Identität und Lebenszyklus, aber nichts aus `Application` — auch keine Zahlen | ✅ Bestätigt |
| [0015](0015-styling-tailwind-shadcn.md) | Styling: Tailwind CSS + shadcn/ui (Radix-Primitives) | ✅ Bestätigt |

**10 bestätigt · 5 Vorschlag · 0 angenommen.**

---

## Die drei Statuswerte

```
Vorschlag — anfechtbar  →  Bestätigt — verbindlich für v0.1  →  Angenommen
      (Planung)             (vor der ersten Zeile Code)         (umgesetzt UND überprüft)
```

| Status | Was er bedeutet |
|---|---|
| **`Vorschlag — anfechtbar`** | Festgehalten samt Begründung, aber **nicht** verbindlich. Darf ohne Weiteres gekippt werden |
| **`Bestätigt — verbindlich für v0.1`** | Der Autor hat den Record erneut gelesen, akzeptiert seine Folgen wie geschrieben und widerspricht ihm nicht ohne einen ablösenden ADR. Behauptet **keine** Überprüfung im Code |
| **`Angenommen`** | Im Code **umgesetzt und überprüft**. Derzeit kein Record |
| **`Verworfen — ersetzt durch ADR-0xx`** | Widerlegt. Wird **nicht gelöscht** — die Begründung, warum etwas *nicht* gemacht wurde, ist der wertvollste Teil eines ADR-Bestands |

### Warum die sieben bestätigt wurden

Sie tragen v0.1 (`02-SRD.md` §5.4 legt S-15, S-31, S-36 und S-37 dorthin, weil sie sich nicht
nachrüsten lassen). Wird einer später gekippt, ist **nicht ein Absatz** zu ändern, sondern
**gebauter Code**. Deshalb trägt jeder der sieben am Ende einen **Bestätigungsvermerk** mit drei
Zeilen: seine Aufgabebedingung, was ein späterer Widerspruch **kostet**, und den Weg zu
`Angenommen`.

Die Kostenzeile ist der Punkt der Übung. Für ADR-004 lautet sie *„jede Abfrage im System"*, für
ADR-002 *„eine Migration von Boolean-Flags zu Zuständen"*, für ADR-006 *„praktisch die gesamte
Codebasis"*. Eine Bestätigung, die diesen Preis nicht nennt, ist eine Formalie.

Die fünf übrigen dürfen offen bleiben — sie tragen v0.1 nicht. ADR-005 (Solver) ist mit
S-19/S-20 ohnehin nach v1.1 gewandert.

**ADR-013 und ADR-014 sind bestätigt, ohne zu den sieben zu gehören.** Die sieben sind eine feste
Menge: die Records, die v0.1 *tragen*. Diese beiden tragen v0.1 nicht, sie **ändern** es — ADR-013
fasst **S-02** neu, ADR-014 präzisiert **S-50**. Als `Vorschlag` wären beide wertlos: dann stünde
eine bestätigte Scope-Zeile in zwei Lesarten nebeneinander, und die Dateien in `../domain/` und
`../screens/` müssten beide gleichzeitig beschreiben. Ein Record, aus dem Streichungen in elf
Dateien folgen, ist entweder verbindlich oder er wird nicht geschrieben.

Beide tragen ihren Preis deshalb **in der Kostenzeile**, nicht in einer Umkehrbarkeitsspalte — siehe
die Anmerkung zu Aufteilungsregel 3 unten.

### ⚠️ ADR-006 trägt eine Zwangsbedingung aus ADR-005

Die Hostingumgebung **muss** einen lokalen Python-Kindprozess mit Zeitlimit und fixem Seed
ausführen können. Eine Umgebung ohne langlebige Prozesse — serverless, Edge — ist damit
ausgeschlossen, **auch wenn der Solver erst in v1.1 gebaut wird**. Wer diese Bedingung beim
Aufsetzen übergeht, verliert ADR-005, ohne es zu bemerken. Das stand vor dem 2026-09-09 nirgends.

---

## Die drei Aufteilungsregeln

Aus `../05-ADRs.md` übernommen und hier gültig:

1. **Nummern bleiben.** ADR-005 heißt dauerhaft `0005-…`. Eine Nummer wird nie neu vergeben.
   Verweise aus `../03-PRD.md`, `../domain/`, `../06-Compliance-Anhang.md` und `../GUARDRAILS.md`
   treffen sonst ins Leere.
2. **Der Status wird je Datei gepflegt** — nicht in der Sammeldatei.
3. **`../05-ADRs.md` bleibt bestehen** als eingefrorene Momentaufnahme und wird **nicht** mit
   diesen Dateien synchronisiert.

Eine Folge von Regel 3, die beim ersten neuen Record sichtbar wird: **die Spalte „Umkehrbarkeit"
(🟢/🟡/🔴) steht nur in der eingefrorenen Sammeldatei und deckt ADR-001 bis ADR-012 ab.** Sie wird
hier nicht nachgebaut — eine zweite gepflegte Kopie derselben Angabe ist genau die Drift, gegen die
Regel 3 existiert. Ab ADR-013 trägt jeder Record seine Umkehrbarkeit dort, wo sie ohnehin genauer
steht: in der **Aufgabebedingung** und in der **Kostenzeile** des Bestätigungsvermerks. Ein Symbol
sagt „schwer"; die Kostenzeile sagt, *was* schwer ist.

Durchgesetzt statt versprochen: `tools/check-refs.ts` Regel 5 prüft, dass jede zitierte
`ADR-NNN` auf **genau eine** Datei hier auflöst — eine in einer Spezifikation zitierte Nummer
ohne Record dahinter fällt damit auf, und ebenso ein Record, der versehentlich in zwei Dateien
zerfällt. Regel 4 prüft die Sammeldatei per Inhalts-Hash (zeilenendungsunabhängig). **G-N3** in `../GUARDRAILS.md` verbietet
Commits gegen Anwendungscode, solange ein v0.1-tragender Record auf `Vorschlag` steht.
