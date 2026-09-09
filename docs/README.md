# Flatmate.io — Spezifikation

> **Status:** V1.0 · 2026-09-09 · Samuel Zink (@SmokeyRGB)
> **Was das hier ist:** die Übergabegrenze. **`docs/` und `tools/` zusammen kopiert sind alles,
> was eine Implementierung braucht** — und nichts darüber hinaus. `tools/` gehört dazu, weil
> dieser Ordner die beiden Prüfskripte an 18 Stellen zitiert; ohne sie sind die Zusicherungen
> hier Behauptungen. Regel 7 von `tools/check-refs.sh` erzwingt den Rest: kein Verweis aus
> `docs/` führt nach `coursework/`, `archive/`, `research/` oder `process/`.
> **Sprachregelung:** Begründungsdokumente deutsch, implementierungsnahe Dokumente englisch
> (ADR-012 samt benannter Ausnahme).

---

## 1. Wo fange ich an?

**Nicht bei `03-PRD.md`.** Das PRD hat 1700 Zeilen; der Ordner insgesamt liegt bei ~270 000
Token und passt in kein Kontextfenster. Wer eine Aufgabe umsetzt, liest **nicht die Kette,
sondern das Paket für seinen Schnitt.**

| Ich will … | Ich lese |
|---|---|
| …verstehen, **was gebaut wird** | `backlog/README.md` — der v0.1-Schnitt in fünf Features |
| …**eine Aufgabe umsetzen** | genau ein Paket aus `backlog/requirements/` — `F0` bis `F5`. Das Paket ist absichtlich selbsttragend |
| …wissen, **was ich nicht kaputt machen darf** | `MINIMAL-GATE.md` (neun Gates, kurz) und `GUARDRAILS.md` (vollständig) |
| …wissen, **wo eine Regel wirklich steht** | `SPEC-INDEX.md` — eine Zeile je Thema, eine maßgebliche Fundstelle |
| …prüfen, **ob etwas vergessen wurde** | `COVERAGE.md` — jede v0.1-Scope-Zeile mit ihren Anforderungs-IDs |
| …wissen, **was noch offen ist** | `review-log.md`, Abschnitt *Offene-Punkte-Register* — der **einzige** Ort für Status |
| …**verstehen, warum** etwas so entschieden ist | `01`–`08`, `adr/`, `06-Compliance-Anhang.md` |

**Die wichtigste Zeile dieses Dokuments:** *Lies das Paket für deinen Schnitt, nicht das PRD.*

---

## 2. Vorrangordnung

Bei Widerspruch gilt das **obere** Dokument. Diese Reihenfolge beschreibt, wie die Dokumente sich
tatsächlich verhalten — nicht, was einzelne Köpfe über sich behaupten.

| # | Dokument | Wofür es maßgeblich ist |
|:-:|---|---|
| **1** | `GUARDRAILS.md` | **Harte Sperre.** Eine Verletzung bricht die Aufgabe ab, nicht die Diskussion. Enthält die eigene Eskalationsregel |
| **2** | `02-SRD.md` | Scope, Prinzipien **P-1…P-5**, Erfolgskriterien, und in **§5.4 der Phasenschnitt**. §5.4 ist die einzige Stelle, an der eine `S`-Zeile einer Stufe zugeordnet wird |
| **3** | `03-PRD.md` | Nutzerflüsse, Akzeptanzkriterien, Score- und Quorum-Rechnung. Jeder Unterabschnitt von §4/§6 trägt eine `Band:`-Zeile |
| **4** | `06-Compliance-Anhang.md` | Bindend für alles, was personenbezogene Daten berührt |
| **5** | `07-Screen-Inventar.md` · `08-UX-Entscheidungen.md` | Die UI-Schicht. **Sie darf `02`, `03` und `04` korrigieren** — das ist U-7, und die drei werden dann nachgezogen, nicht umgekehrt |
| **6** | `domain/` · `adr/` | Schema und Architektur. Sieben ADRs sind `Bestätigt — verbindlich für v0.1`; fünf stehen weiter auf `Vorschlag — anfechtbar` und sind verhandelbar |
| **7** | `00-Session-Brief.md` | **Nur historisch.** Verliert gegen jedes spätere Dokument — die Kette hat ihn beim Verfügbarkeits-Link ausdrücklich überstimmt (`02-SRD.md` §11 O-08) |

> **Warum der Session-Brief zuletzt steht.** Sechs Dokumentenköpfe nannten ihn bis 2026-09-09
> „verbindliche Quelle". Er ist vom 2026-08-19; die Kette steht bei V0.5/V0.6, und zwei
> Dokumente stellen fest, dass er *„in sich inkonsistent"* ist. Ein Dokument, das die
> Spezifikation bereits überstimmt hat, kann nicht der Stichentscheid sein.

---

## 3. ID-Register

Jede ID-Familie hat **genau eine** maßgebliche Datei. Steht eine Nummer woanders, ist das ein
Zitat, keine Definition.

| Familie | Bereich | Maßgebliche Datei |
|---|---|---|
| `S-01` … `S-51` | Scope-Zeilen | `02-SRD.md` §5.3 · Stufenzuordnung in §5.4 |
| `E-01` … `E-27` | Belegkette, Ist-Prozess | `01-Problem-Framing.md` |
| `P-1` … `P-5` | Prinzipien | `02-SRD.md` |
| `ADR-001` … `ADR-012` | Architekturentscheidungen | `adr/00NN-*.md` · `05-ADRs.md` ist eingefroren |
| `V-1` … `V-4` | Invarianten | `domain/invarianten.md` |
| `G-A` … `G-N` | Guardrails | `GUARDRAILS.md` |
| `U-1` … `U-26` | UX-Entscheidungen | `08-UX-Entscheidungen.md` |
| `O-*` · `P-O-*` · `Q-*` · `AW-*` | offene Punkte | Frage im Fachdokument, **Status nur** in `review-log.md` §Register |
| `A1`–`A4` `B1`–`B4` `C1`–`C8` `D1`–`D4` `E1` `O1`–`O20` | 41 Bildschirme | `screens/` · `07-Screen-Inventar.md` ist eingefroren |
| `FR-n.m` `AC-n.m` `C-n.m` `EC-n.m` | Anforderungen je Paket | `backlog/requirements/Fn-requirements.md` |
| `H-D*` `H-F*` `H-V*` | Produkthypothesen | `HYPOTHESES.md` |

**Nummern bleiben.** Eine Nummer wird **nie** neu vergeben — auch nicht nach einem Widerruf.
Ein widerlegter Record wird nicht gelöscht, sondern auf `Verworfen — ersetzt durch …` gesetzt.
Diese Regel stammt aus `05-ADRs.md` und gilt für **alle** Familien oben.

### ⚠️ Drei Stolperstellen im Nummernraum

| Verwechslungsgefahr | Auflösung |
|---|---|
| `O-06` (SRD) vs. `O-6` (Domänenmodell) | **Zwei verschiedene Nummernräume.** SRD zählt null-gefüllt `O-01`…`O-08`, das Domänenmodell `O-1`…`O-16`. Acht IDs unterscheiden sich nur durch eine Null. Ein Verweis **nennt immer die Datei mit** |
| `EP-D` (Epic) vs. `D1`–`D4` (Bildschirme) | Verschiedene, **nicht deckungsgleiche** Mengen. Epic D ist die Terminfindung, Bildschirmgruppe D ist der Casting-Tab. Deshalb heißen die Epics `EP-A`…`EP-E` |
| `C-1` (Inhaltsregel) vs. `C1` (Bildschirm) | Unterscheiden sich nur durch einen Bindestrich. Inhaltsregeln stehen in `03-PRD.md` §4.6.1, Bildschirme in `screens/C-beteiligung.md` |

---

## 4. Was in diesem Ordner liegt

| Pfad | Inhalt |
|---|---|
| `00-Session-Brief.md` | Entscheidungsprotokoll der Anforderungs-Session, **historisch** |
| `01-Problem-Framing.md` | Problem, Nutzende, Belegkette `E-01`…`E-27` |
| `02-SRD.md` | Scope, Prinzipien, Metriken, **Phasenschnitt §5.4** |
| `03-PRD.md` | Funktionsspezifikation, Akzeptanzkriterien, Rechenmodelle |
| `04-Domaenenmodell.md` | ❄️ eingefroren — gepflegt in `domain/` |
| `05-ADRs.md` | ❄️ eingefroren — gepflegt in `adr/` |
| `06-Compliance-Anhang.md` | Rechtsanalyse, Datenkategorien, Betroffenenrechte, **Q-1…Q-14** |
| `07-Screen-Inventar.md` | ❄️ eingefroren — gepflegt in `screens/` |
| `08-UX-Entscheidungen.md` | `U-1`…`U-26` |
| `GUARDRAILS.md` | `G-A`…`G-N`, Durchsetzungsstand, Teststrategie, Implementierungspflichten |
| `MINIMAL-GATE.md` | die neun Gates vor der ersten Zeile Code |
| `SPEC-INDEX.md` | ein Thema, eine maßgebliche Fundstelle |
| `COVERAGE.md` | jede v0.1-Scope-Zeile → Paket → `FR-`/`AC-`-IDs |
| `HYPOTHESES.md` | 21 unbelegte Annahmen, mit ihrer Prüfsperre |
| `review-log.md` | drei Prüfdurchgänge **und das Offene-Punkte-Register** |
| `adr/` · `domain/` · `screens/` | die gepflegten Einzeldateien |
| `backlog/` | Requirements-Pakete, Feature-Kurzfassungen, Roadmap · **englisch** |
| `anhaenge/` | Compliance- und Risiko-Anhänge |
| `prompts/` | Einstiegs-Prompt für die Implementierung |
| `_logs/` | Aufgabenprotokolle; Ergebnisse sind längst in der Kette. Historisch |

### ❄️ Die drei eingefrorenen Sammeldateien

`04`, `05` und `07` sind Momentaufnahmen und werden **nicht** mehr geändert. Der Grund ist nicht
Ordnungsliebe: rund 100 Verweise im Repo tragen eine **Zeilennummer**, davon 19 in diese drei
Dateien. Eine Zeilennummer in eine *lebende* Datei zeigt nach dem nächsten eingefügten Absatz auf
den falschen Satz — lautlos. In eine eingefrorene Datei zeigt sie dauerhaft richtig.

Deshalb: `tools/check-refs.sh` Regel 3 erlaubt `:LINE`-Verweise **ausschließlich** hierher, Regel
4 prüft die drei Dateien per Hash. Eine gewollte Änderung heißt, den Hash im selben Commit
mitzuführen — das macht die Absicht im Review sichtbar statt unsichtbar.

---

## 5. Der Schnitt v0.1

**Ein vertikaler Schnitt: Bewerbung → Screening → Stimme → Ergebnis.** Ein erster lauffähiger
Prototyp, um den UX-Fluss zu prüfen. Läuft auf **synthetischen Daten**.

**Nicht darin:** Terminfindung, Heatmap, Solver, Runde 2, Veto, Zusage, Benachrichtigungen, PWA,
Aktivitäts-Feed-Oberfläche, Paste-Parser. Alles davon liegt in v0.2 oder später —
**maßgeblich `02-SRD.md` §5.4, und nur dort.**

25 Scope-Zeilen, sechs Pakete (`F0`–`F5`), 4 von 41 Bildschirmen sind Kernbildschirme und alle
vier liegen im Schnitt.

> **Was v0.1 nicht darf:** auf echte Bewerberdaten zeigen. Dafür fehlen vier Dinge aus dem Gate in
> v0.2 (Klick-AVV, Art.-13-Seite je Haushalt, Löschautomatik S-33, Auskunftsexport S-34) — und die
> Rechtsfragen **Q-1 bis Q-4** sind launch-blockierend. Sie blockieren **nicht** das Bauen gegen
> synthetische Daten.

---

## 6. Prüfen

```bash
bash tools/check-refs.sh     # sind die Querverweise noch heil?  (7 Regeln)
bash tools/done-check.sh     # ist sprint-v0.1 fertig?           (6 Abschnitte)
```

Beide erklären sich selbst; `tools/README.md` sagt in einfacher Sprache, warum jede Regel
existiert. Jede von ihnen schließt eine Fehlerklasse, die dieses Projekt **schon einmal
produziert hat** — das ist der Maßstab, den `review-log.md` selbst für ADR-010 gesetzt hat:

> *„die Regel ‚Versionszeile mitziehen' ist genau die Sorte Zusicherung, die ohne Mechanismus
> nicht hält"*
