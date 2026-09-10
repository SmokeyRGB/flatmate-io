# SPEC-INDEX — ein Thema, eine maßgebliche Fundstelle

> **Status:** V1.0 · 2026-09-09 · Samuel Zink (@SmokeyRGB)
> **Wofür:** Wer eine Regel sucht, findet sie an mehreren Stellen — und weiß nicht, welche gilt.
> Diese Tabelle entscheidet das. **Eine Zeile je Thema, eine maßgebliche Datei.** Alles andere zum
> selben Thema ist Erläuterung und darf der maßgeblichen Fundstelle nicht widersprechen.
> **Bei Widerspruch** gilt zusätzlich die Vorrangordnung in `README.md` §2.

---

## Warum es diese Datei gibt

Die **Sichtbarkeitsinvariante** — die Regel, die dieses Produkt von einer WhatsApp-Gruppe
unterscheidet — ist an **vier** Stellen ausformuliert: `03-PRD.md` §4.2.5,
`domain/invarianten.md` §5, `screens/rahmenwerk.md` §11 und `GUARDRAILS.md` G-C. Alle vier sind
heute richtig.

Das ist genau die gefährliche Lage. Wer nach der Regel greift, trifft **eine** der vier und hat
keinen Hinweis darauf, dass es drei weitere gibt. Sind sie auseinandergelaufen, wird die
getroffene Fassung implementiert — und niemand merkt, dass eine Wahl stattgefunden hat.

Dieselbe Verteilung gilt für Aufbewahrung (drei Stellen), Zustandsmaschine (drei), Quorum (drei).
Diese Tabelle macht aus „irgendwo steht es" ein „hier gilt es".

---

## Die Tabelle

**Maßgeblich** = hier wird die Regel definiert und hier wird sie geändert.
**Erläuternd** = hier wird sie zitiert oder angewandt; ein Widerspruch ist ein Fehler *dort*.

| Thema | Maßgeblich | Erläuternd |
|---|---|---|
| **Was in v0.1 liegt** | **`02-SRD.md` §5.4** — die einzige Stelle, an der eine `S`-Zeile einer Stufe zugeordnet wird | `03-PRD.md` §4/§6 `Band:`-Zeilen (Feingranularität) · `03-PRD.md` §7.1 (nur Vorführbarkeit) · `backlog/roadmap.md` · `backlog/README.md` · `COVERAGE.md` |
| **Sichtbarkeitsinvariante** (niemand liest, was über ihn geschrieben wurde) | **`domain/invarianten.md`** — `V-1`…`V-4` als Prädikate, samt RLS-Policies | `03-PRD.md` §4.2.5 · `screens/rahmenwerk.md` §11 · `GUARDRAILS.md` G-C, G-D · `backlog/requirements/F5-requirements.md` |
| **Autorisierung** (doppelt: Policy-Objekte **und** RLS) | **`adr/0004-*.md`** | `domain/invarianten.md` §5.5 · `GUARDRAILS.md` G-C · `backlog/requirements/F0-requirements.md` FR-0.1–0.4 |
| **Zustandsmaschine `Application`** (elf Zustände) | **`03-PRD.md` §4.2.1** — die Übergangstabelle | `domain/casting.md` §3 · `adr/0002-*.md` · `F0-requirements.md` FR-0.9–0.12, AC-0.10 |
| **Aufbewahrung und Löschung** | **`06-Compliance-Anhang.md` §5** — Fristen und Rechtsgrundlage | `03-PRD.md` §4.2.6 · `domain/aufbewahrung.md` §7 · `GUARDRAILS.md` G-E · `adr/0003-*.md` (Tombstones) |
| **Score und Rangliste** | **`domain/rechenmodelle.md` §8** — der Pseudocode | `03-PRD.md` §4.2.3 · `adr/0008-*.md` (vierstufige Skala) · `F5-requirements.md` |
| **Quorum** | **`03-PRD.md` §4.2.4** — Schwelle `0.5`, Anzeige statt Sperre | `domain/rechenmodelle.md` · `02-SRD.md` §11 (O-01, geschlossen) · `F5-requirements.md` |
| **Vierstufige Skala und Favoriten-Budget** | **`adr/0008-*.md`** | `03-PRD.md` §4.1.4 · `screens/C-beteiligung.md` (C1) · `F4-requirements.md` |
| **Solver** (CP-SAT, Kindprozess) | **`adr/0005-*.md`** | `03-PRD.md` §4.1.8 · `domain/scheduling.md` · `02-SRD.md` §11 (O-06, Messung offen). **Liegt in v1.1** |
| **Anmeldung und Sitzung** | **`adr/0007-*.md`** (Passwort primär, Passkey optional) | `domain/identity.md` · `04-Domaenenmodell.md` §10.2 (O-12, O-13, O-16) · `F2-requirements.md` |
| **Einladungslink** (`join_code`) | **`02-SRD.md` §5.3** bei **S-49** — Ablauf, Nutzungsgrenze, Warnhinweis | `domain/identity.md` · `04-Domaenenmodell.md` §10.2 (O-15) · `08-UX-Entscheidungen.md` U-12 · `F2-requirements.md` |
| **Zwei Listen, zwei Rechtelagen** | **`08-UX-Entscheidungen.md` U-22** | `02-SRD.md` §5.3 bei S-05 · `screens/O-organisation.md` (O16) · `F1-requirements.md` FR-1.19, FR-1.25–1.30 |
| **Benachrichtigungen und Kanäle** | **`adr/0009-*.md`** (Kanalneutralität als Architekturregel) | `03-PRD.md` §4.1.12 · `domain/audit-und-notifications.md`. **Liegt in v0.2** |
| **Append-only-Protokoll** | **`adr/0003-*.md`** | `domain/audit-und-notifications.md` · `GUARDRAILS.md` G-D7, G-D8 · `F0-requirements.md` FR-0.13–0.15, AC-0.11 |
| **Datenbestandsverzeichnis als CI-Gate** | **`adr/0010-*.md`** | `domain/personenbezogene-felder.md` §9 · `GUARDRAILS.md` G-F · `F0-requirements.md` FR-0.5–0.8 |
| **Datenschutzklassen** 🔴🟠⚫⚙️ | **`domain/README.md`** §0.3 | `domain/personenbezogene-felder.md` §9 · `06-Compliance-Anhang.md` §6 |
| **Kontextgrenzen** (sechs Bounded Contexts) | **`domain/kontextgrenzen.md`** §4 | `adr/0001-*.md` · `GUARDRAILS.md` G-I · `tools/README.md` (dependency-cruiser) |
| **Inhaltsregeln für Freitext** `C-1`…`C-10` | **`03-PRD.md` §4.6.1** | `08-UX-Entscheidungen.md` U-17 · `06-Compliance-Anhang.md` §8 |
| **PWA statt native App** | **`adr/0011-*.md`** | `GUARDRAILS.md` G-B6, G-B7 (Stimmpuffer) · `03-PRD.md` §6.2. **Liegt in v0.2** |
| **Sprache** (Dokumente deutsch, Bezeichner englisch) | **`adr/0012-*.md`** — samt benannter Ausnahme für `backlog/` | UI-Vokabular nach U-24: ⚠️ **die Übersetzungstabelle fehlt** — zweimal als „§8.6" zitiert, nie geschrieben. Offener Punkt **O-G** im Register |
| **Backup und Wiederherstellung** | **`GUARDRAILS.md` §Implementierungspflichten** | — (vorher **nirgends**; siehe unten) |
| **Rollen und Verantwortlichkeit (DSGVO)** | **`06-Compliance-Anhang.md` §1** | `02-SRD.md` · `Q-1`…`Q-4`, launch-blockierend |
| **Status offener Punkte** | **`review-log.md` §Offene-Punkte-Register** — es entscheidet, **ob** ein Punkt offen ist | Eine **geschlossene** Zeile behält ihren Auflösungstext im Fachdokument, durchgestrichen — das ist beabsichtigt (G-N5 samt seiner Durchsetzungsgrenze) |
| **Prinzipien** `P-1`…`P-5` | **`README.md` §3.1** — nach der Aufteilung war die Tabelle nur noch im eingefrorenen `05-ADRs.md` | überall namentlich zitiert: `GUARDRAILS.md`, `adr/`, `03-PRD.md`, `backlog/` |
| **Werkzeugwahl** | **`tools/README.md`** samt Begründung je Werkzeug | `GUARDRAILS.md` §Minimal-Gate · `MINIMAL-GATE.md` |

---

## Drei Themen, bei denen das „maßgeblich" eine Entscheidung war

**Sichtbarkeit → `domain/invarianten.md`, nicht das PRD.** Das PRD beschreibt die Invariante in
Prosa; das Domänenmodell schreibt sie als **Prädikat** samt RLS-Policy. Implementiert wird das
Prädikat, also gilt das Prädikat. Das PRD beschreibt, wie sie sich für Nutzende anfühlt — auch
wichtig, aber nicht das, wogegen getestet wird.

**Aufbewahrung → `06-Compliance-Anhang.md`, nicht das Domänenmodell.** Die Frist ist eine
Rechtsfrage, keine Schemafrage. Das Domänenmodell trägt die Felder, der Compliance-Anhang trägt
die Begründung — und wenn eine Frist fällt, fällt sie aus rechtlichen Gründen. `Q-5` steht dort
offen.

**Zustandsmaschine → `03-PRD.md` §4.2.1, nicht das Domänenmodell.** Ausnahmsweise: die
Übergangstabelle ist dort vollständig ausgeschrieben und das Domänenmodell verweist darauf.
Wandert die Tabelle später nach `domain/casting.md`, wird **diese Zeile** geändert — nicht
stillschweigend eine zweite Kopie angelegt.

---

## Ein Thema hatte vorher gar keine Fundstelle

**Backup und Wiederherstellung.** Bis 2026-09-09 stand dazu **nichts** — und darin lag ein
echter Defekt, kein Dokumentationsloch:

S-33 erlaubt, die Aufbewahrungsfrist auf **30 Tage** zu verkürzen. Nichts begrenzte die
Aufbewahrung von **Backups**, und nichts verlangte, dass eine Wiederherstellung den Löschlauf
nachholt. Ein länger gehaltenes Backup überlebt damit die kürzeste zulässige Frist — und ein
Restore holt Bewerberdaten zurück, die rechtmäßig gelöscht waren. **Ohne Fehlermeldung, ohne
Spur.**

Festgelegt: RPO 24 h · RTO 8 h · **Backup-Aufbewahrung höchstens 30 Tage** · jeder Restore lässt
den Löschlauf durchlaufen, **bevor** die Anwendung Verkehr annimmt. Beide Hälften sind nötig; die
Deckelung allein genügt nicht.

---

## Diese Datei pflegen

- **Ein neues Thema** bekommt eine Zeile, sobald es an einer *zweiten* Stelle beschrieben wird.
  Solange es nur einen Ort hat, braucht es keinen Eintrag.
- **Verschiebt sich eine maßgebliche Fundstelle**, wird hier geändert — nicht am anderen Ende eine
  Kopie angelegt. Eine Kopie ist die Fehlerklasse, gegen die diese Datei geschrieben ist:
  `04-Domaenenmodell.md` §9 ist ihr dreimal zum Opfer gefallen, `03-PRD.md` §7.1 einmal.
- **Widerspricht eine erläuternde Stelle der maßgeblichen**, ist die erläuternde falsch. Das ist
  keine Formalie, sondern der einzige Grund, aus dem diese Tabelle etwas nützt.
