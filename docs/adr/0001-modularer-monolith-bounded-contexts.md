> **Status:** Bestätigt — verbindlich für v0.1
> **Quelle:** `../05-ADRs.md` §ADR-001 (Stand V0.8, eingefroren 2026-09-09)
> **Nummer:** ADR-001 — dauerhaft. Nummern werden nie neu vergeben.

## ADR-001 — Modularer Monolith mit Bounded Contexts

### Kontext

Flatmate.io ist ein Solo-Projekt mit AI-gestützter Implementierung, gedacht für Haushalte mit 5–10
Personen, die das Tool in Schüben von zwei bis drei Wochen nutzen. Die Last ist minimal, die
Domäne dagegen ungewöhnlich verwinkelt: Identität, Casting-Pipeline, Beratung, Terminplanung,
Benachrichtigungen und Protokollierung haben jeweils eigene Regeln und eigene
Sichtbarkeitsanforderungen.

Der Druck geht damit **nicht** in Richtung Skalierung, sondern in Richtung **Verständlichkeit unter
Vergessen**: ein AI-Agent, der in sechs Wochen an `deliberation` arbeitet, hat den Kontext von
`scheduling` nicht mehr — und wird ohne Grenze fröhlich hineingreifen.

### Betrachtete Optionen

| Option | Vorteil | Nachteil | Bewertung |
|---|---|---|---|
| **Modularer Monolith mit Bounded Contexts** ✅ | Ein Deployable, eine Migrationskette, gemeinsame Typen. Grenzen als Importregeln maschinell prüfbar. Kontext lässt sich pro Modul erschließen, ohne das Ganze zu lesen | Grenzen sind konventionell, nicht physisch — sie halten nur, solange der Lint-Check läuft | **Gewählt** |
| Microservices je Kontext | Physische Grenzen, unabhängige Deployments | Sechs Deployables, sechs Datenbanken oder verteilte Transaktionen, Netzwerk-Fehlerbehandlung überall. Für eine Last von ~zehn gleichzeitigen Nutzenden absurd | Verworfen — löst ein Problem, das nicht existiert, und schafft fünf, die es nicht gäbe |
| Schichten ohne Kontextschnitt (klassisch `controllers/services/models`) | Vertraut, keine neuen Regeln | Der Schnitt verläuft quer zur Domäne: alle sechs Fachbereiche liegen in derselben `services/`-Halde. Genau der Zustand, in dem ein Agent nicht mehr weiß, was er nicht anfassen darf | Verworfen |
| Monolith ohne Struktur, später schneiden | schnellster Start | „Später schneiden" passiert nie. Und die Sichtbarkeitsregeln (V-1 bis V-4) sind quer über alle Kontexte verstreut — nachträglich nicht auffindbar | Verworfen |

### Entscheidung

Ein Deployable, sechs Bounded Contexts: `identity` · `casting` · `deliberation` · `scheduling` ·
`notifications` · `audit`. Kommunikation zwischen Kontexten über **Domain-Events** und
**Query-Ports** mit DTOs. **Keine Cross-Context-Joins.** Die erlaubten Abhängigkeitsrichtungen sind
in `04-Domaenenmodell.md` §4 als Tabelle festgehalten und werden per **Import-Boundary-Lint**
erzwungen.

Zusätzlich: ein **reiner Domänenkern** ohne Datenbankzugriff (Zustandsübergänge, Voting-Mathematik,
Ranking, Termin-Kostenmodell, Zeitfenster-Parser) — siehe `04-Domaenenmodell.md` §6.

### Konsequenzen

**Positiv**

- Eine Kontextgrenze kann später zu einer Prozessgrenze werden, ohne die Fachlogik anzufassen.
- Der Lint-Check ist eine **überprüfbare** Architekturaussage, kein Diagramm an der Wand — und damit
  eine Regel, die auch ein Agent nicht versehentlich verletzt.
- Der pure Kern macht die strittigen Teile (Score, Rangfolge, Kosten) ohne Infrastruktur testbar und
  damit widerlegbar.

**Negativ, und ehrlich benannt**

- **Query-Ports kosten zusätzliche Roundtrips.** Was ein `JOIN` in einer Abfrage erledigt, sind hier
  zwei Aufrufe. Bei dieser Datenmenge irrelevant, aber es ist echter Mehrcode.
- **Die Grenze hält nur, solange der Lint-Check läuft.** Eine einzelne
  `// eslint-disable-next-line boundaries/element-types` reißt sie ein. Deshalb steht „Kontextgrenzen
  nicht per Ausnahme aufweichen" in `GUARDRAILS.md` — die Regel ist so stark wie ihre Durchsetzung.
- **Die RLS-Policies verletzen die Grenze notwendigerweise** (eine Policy auf `votes` liest
  `applications` und `memberships`). Dokumentierte Ausnahme, siehe `04-Domaenenmodell.md` §4 — aber
  eine echte Kopplung, die bei einer späteren Aufspaltung zuerst wehtut.
- **Sechs Kontexte für ein Solo-Projekt sind Overhead.** Wer nur die v1 baut und dann aufhört, hat
  diese Struktur umsonst bezahlt.

> **Das gibt man auf, wenn** sich zeigt, dass die Kontextgrenzen im Alltag nur Reibung erzeugen und
> nie Nutzen — konkret: wenn über Monate jede Funktion drei Kontexte anfasst. Dann sind die Grenzen
> falsch gezogen, nicht das Prinzip.

**Status: Bestätigt — verbindlich für v0.1**

> **Bestätigt am 2026-09-09** (Samuel Zink) — verbindlich für v0.1.
> · **Aufgabebedingung:** Das gibt man auf, wenn sich zeigt, dass die Kontextgrenzen im Alltag nur
> Reibung erzeugen und nie Nutzen — konkret: wenn über Monate jede Funktion drei Kontexte anfasst.
> · **Was ein späterer Widerspruch kostet:** Jede Importgrenze neu ziehen — sechs Kontextordner, die
> dependency-cruiser-Konfiguration und jeder Aufruf, der heute eine Grenze respektiert
> · Status wechselt auf `Angenommen`, sobald im Code umgesetzt und überprüft.
