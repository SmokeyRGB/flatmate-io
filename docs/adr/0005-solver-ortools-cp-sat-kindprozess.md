> **Status:** Vorschlag — anfechtbar
> **Quelle:** `../05-ADRs.md` §ADR-005 (Stand V0.8, eingefroren 2026-09-09)
> **Nummer:** ADR-005 — dauerhaft. Nummern werden nie neu vergeben.

## ADR-005 — Solver via offiziellem `ortools` (CP-SAT) als lokaler Kindprozess

### Kontext

Die Terminfindung ist der Schritt, an dem der heutige Prozess am sichtbarsten scheitert (Schritt 6
der 13 Ist-Schritte: „Wann könnten die Bewerber und wann kann wer aus der WG"). Zu lösen ist:

Mehrere Bewerbende, jede mit eigenen Zeitfenstern. Mehrere Bewohnende, jede mit eigenen
Zeitfenstern. Dazu Haushalts-Präferenzen: „erst ab 18:00", „max. N Castings pro Tag", „parallel
erlaubt / nicht erlaubt", „mindestens X Bewohnende pro Casting", Mindestpuffer zwischen Terminen,
„Person X muss dabei sein".

**Das ist keine 1:1-Zuordnung.** Die Zuweisungen sind **gekoppelt**: ob Lea am Dienstag um 17:00
kann, hängt davon ab, wohin Jonas gelegt wurde (max. N pro Tag, Puffer, Exklusivität), und die
Bewertung eines Slots hängt davon ab, wie viele Bewohnende dann können. Genau diese Kopplung ist der
Grund, warum die naheliegende Bibliothek nicht reicht.

Zusätzliche harte Randbedingung aus **P-3**: das Ergebnis muss **erklärbar** und **deterministisch**
sein. Zwei Klicks auf „Vorschlag berechnen" müssen denselben Vorschlag liefern. Ein Verfahren, das
gute Lösungen findet, aber nicht sagen kann warum, ist hier disqualifiziert — unabhängig von seiner
Qualität.

Und eine, die leicht übersehen wird: **die Eingabedaten sind personenbezogen** (Zeitfenster von
Bewerbenden und Bewohnenden). Ein Solver-Dienst außerhalb der EU oder bei einem Dritten wäre eine
Auftragsverarbeitung mehr, mit AVV, TOM-Prüfung und Eintrag ins Verzeichnis.

### Betrachtete Optionen

| Option | Was es ist | Warum verworfen bzw. gewählt |
|---|---|---|
| `munkres-js` (Hungarian, O(n³)) | JS-Implementierung der ungarischen Methode für **bipartite 1:1-Zuordnung** | **Reicht grundsätzlich nicht.** Die ungarische Methode löst „ordne n Aufgaben n Personen zu, minimiere Kosten". Sie kann **keine Bedingungen über mehrere Zuweisungen hinweg** ausdrücken: „max. N pro Tag" ist eine Aussage über eine Gruppe von Zuweisungen, „Mindestpuffer" eine über zwei benachbarte, „mindestens X Bewohnende" eine über eine Nebenmenge. Das ist keine Frage der Implementierung, sondern der Ausdrucksstärke des Modells. **Bleibt aber nützlich** für die Feasibility-Schicht, wo tatsächlich nur pro Person geprüft wird |
| `or-tools-wasm` | Community-Rekompilierung von OR-Tools nach WebAssembly | **Nicht von Google gepflegt.** Google unterstützt OR-Tools offiziell für **C++, Python, Java und .NET** — nicht für JavaScript oder WASM. Damit hängt die Kernfunktion des Produkts an einer nicht offiziell unterstützten Rekompilierung: bei einem Sicherheitsproblem oder einem Bruch gibt es keinen Pfad zurück in den Upstream. Für eine Funktion, deren Determinismus zugesagt wird, ist das die schlechtere Wahl als eine zweite Sprache im Image |
| **Offizielles `ortools`-Python-Paket (CP-SAT)** ✅ | Google first-party, dieselbe CP-SAT-Engine wie C++ | **Gewählt.** Drückt gekoppelte Zuweisungen direkt aus, ist gepflegt, dokumentiert, deterministisch konfigurierbar |
| Timefold Solver (Apache 2.0, Team des ursprünglichen OptaPlanner) | JVM-Constraint-Solver, hat eine *Recommended Fit API* — inhaltlich genau die gesuchte Funktion | Verworfen wegen **zweiter Laufzeit** (JVM neben Node) und **eigener DSL**, die gelernt und gepflegt werden muss. Die fachliche Passung ist gut; die Betriebskosten für ein Solo-Projekt sind höher als bei einem Python-Kindprozess |
| `timetabling-solver` (genetisch) | npm-Paket, genetischer Algorithmus für Stundenpläne | **Ausdrücklich ausgeschlossen.** Genetische Verfahren sind **nichtdeterministisch** und liefern keine Begründung — sie verstoßen direkt gegen **P-3**. Zwei Läufe, zwei Vorschläge, keine Erklärung: damit ist das Werkzeug im Kern dieses Produkts unbrauchbar, egal wie gut die Lösungen sind |
| Eigener Backtracking-Solver in TypeScript | keine neue Abhängigkeit, keine zweite Sprache | Verworfen: gekoppelte Constraints korrekt **und** performant **und** mit Unlösbarkeitsdiagnose selbst zu bauen, ist Wochen Arbeit für ein gelöstes Problem — und der Erklärbarkeitsteil wäre erst der Anfang |
| CP-SAT als Netzwerkdienst (eigener Container, HTTP) | saubere Sprachgrenze, unabhängig skalierbar | Verworfen für v1: zweites Deployable, Netzwerk-Fehlerbehandlung, und personenbezogene Daten überqueren eine Prozessgrenze mehr. Bleibt der natürliche nächste Schritt, wenn die Last es verlangt — der Solver-Port macht ihn billig |

### Entscheidung

**Offizielles `ortools` (Python, CP-SAT) als lokaler Kindprozess von Node**, JSON über
stdin/stdout. Ein Deployable, kein Netzwerk-Hop, die Daten verlassen den Host nicht.

Der Solver liegt hinter einem **Solver-Port** (Schnittstelle im Domänenkern, Adapter außen), damit
er austauschbar bleibt — gegen einen Netzwerkdienst, gegen Timefold, gegen eine eigene Heuristik.

**Der Solver kennt keine Rangfolge.** Eingabe sind ausschließlich Zeitfenster, Slots und
Haushalts-Präferenzen (`04-Domaenenmodell.md` §4).

**Determinismus ist Konfiguration, nicht Hoffnung** — fünf Bedingungen, alle notwendig:

| # | Bedingung | Begründung |
|---|---|---|
| 1 | fester `random_seed` | ohne ihn ist CP-SAT nicht reproduzierbar |
| 2 | **genau ein Solver-Worker** (`num_search_workers = 1`) | **CP-SAT ist multi-threaded nicht reproduzierbar** — bei mehreren Workern entscheidet der Wettlauf, welche gleichwertige Lösung gewinnt |
| 3 | stabile Eingabereihenfolge (Sortierung nach `id` vor dem Modellaufbau) | sonst variiert die Modellstruktur mit der Zeilenreihenfolge der Datenbank |
| 4 | nur ganzzahlige Gewichte | Gleitkomma erzeugt plattformabhängige Rundung und damit unterschiedliche Optima |
| 5 | kein Wanduhr-Limit als Abbruchkriterium | ein Zeitlimit macht das Ergebnis von der Maschinenlast abhängig |

**Erklärbarkeit ist Pflicht-Feature, nicht Beigabe** (P-3), und wird **außerhalb** des Solvers
gerechnet: die verletzten Soft-Terme werden von der puren Kostenfunktion nachgerechnet
(„Di 17:00 — 5/7 können"), bei Unlösbarkeit werden harte Constraints in **fest dokumentierter
Reihenfolge** einzeln relaxiert, bis eine Lösung entsteht („keine Lösung: Lea kann nur Di 16–19, dort
können nur 2 von 7"). Modell in `04-Domaenenmodell.md` §8.4.

Und die Feasibility-Schicht — das Ausgrauen nicht buchbarer Slots je Bewerbende — läuft **ohne
Solver**: reine Pro-Person-Prüfung, wird für Raster und Heatmap ohnehin gebraucht, funktioniert also
auch dann, wenn der Solver ausfällt.

### Konsequenzen

**Positiv**

- Gekoppelte Constraints sind direkt ausdrückbar, ohne Eigenbau.
- First-party gepflegte Engine mit dokumentierten Determinismus-Parametern.
- Personenbezogene Daten verlassen den Host nicht — kein zusätzlicher AVV, kein Verzeichniseintrag.
- Der Port hält den Weg zum Netzwerkdienst offen, ohne ihn jetzt zu bezahlen.

**Negativ — vollständig und ohne Beschönigung**

- **Docker-Image wächst um ~150 MB.** Python-Laufzeit plus `ortools` im Image einer
  TypeScript-Anwendung. Für ein Non-Profit-Hosting spürbar bei Build- und Deploy-Zeiten.
- **Prozessstart kostet 200–500 ms** pro Solver-Aufruf. Die UI muss das als Ladezustand zeigen; ein
  „Vorschlag berechnen"-Knopf, der eine halbe Sekunde nichts tut, wirkt kaputt.
- **Zwei Sprachen im Repo.** Ein AI-Agent, der TypeScript-Konventionen kennt, schreibt schlechteres
  Python — und der Solver-Adapter ist genau die Stelle, an der ein Fehler schwer auffällt, weil das
  Ergebnis „plausibel aussieht". Der Adapter ist klein zu halten und streng zu validieren.
- **Ein Worker ist langsamer als mehrere.** Determinismus wird mit Rechenzeit bezahlt. Bei realen
  Größen (bis ~20 Bewerbende, ~200 Slots) ist das unproblematisch; bei größeren Läufen wird die
  Grenze zuerst hier spürbar.
- **`num_search_workers = 1` und der feste Seed sind unsichtbare Einstellungen mit sichtbarer
  Wirkung.** Wer sie „für Performance" ändert, zerstört den Determinismus, ohne dass ein Test
  fehlschlägt — es funktioniert weiter, nur nicht reproduzierbar. Deshalb steht
  „Solver-Determinismus nicht für Performance ändern" in `GUARDRAILS.md`, und deshalb braucht es
  einen Test, der denselben Lauf zweimal ausführt und identische Ausgabe verlangt.
- **Die Unlösbarkeitsdiagnose bedeutet mehrere Solver-Läufe** (einer pro relaxiertem Constraint).
  Genau im ungünstigsten Fall — es gibt keine Lösung — ist die Antwort am langsamsten.
- **Ein Kindprozess braucht echtes Prozess-Handling:** Timeout, Kill, Zombie-Vermeidung,
  Speicherbegrenzung, sauberes Verhalten bei ungültigem JSON. Das ist keine Zeile Code, sondern ein
  kleiner Baustein mit eigenen Tests.

> **Offene Messung.** Die Grenzwerte des Solvers — Bewerbende × Slots × Bewohnende, ab denen die
> Rechenzeit unzumutbar wird — sind auf der Zielhardware zu messen und **hier** einzutragen,
> bevor S-19 ausgeliefert wird. Bisher als offener Punkt geführt (`02-SRD.md` O-06,
> `03-PRD.md` P-O-06); der Solver liegt in v1.1, die Messung damit ebenfalls.

> **Bewusst offen gehalten.** Der Solver-Port darf eine zusätzliche Gewichtung je Bewerbung
> nicht ausschließen — etwa eine Priorisierung der Terminfindung nach dem Abstimmungsergebnis
> (`04-Domaenenmodell.md` O-8). Ob das den Ablauf verkompliziert und was es die Laufzeit kostet,
> ist offen; die Schnittstelle soll die Frage nicht vorentscheiden.

> **Das gibt man auf, wenn** entweder die Imagegröße im gewählten Hosting zum Problem wird (dann
> Netzwerkdienst statt Kindprozess — der Port macht es billig) oder sich zeigt, dass Haushalte den
> Vorschlagsknopf nie benutzen, weil sie ihre Termine ohnehin von Hand legen. Im zweiten Fall wäre
> die **Feasibility-Schicht allein** das Feature — und der Solver fällt ersatzlos weg. Das ist ein
> ernstzunehmendes Szenario und der Grund, warum die Feasibility-Schicht ausdrücklich nicht als
> Solver-Vorprodukt gebaut wird.

### Quellen

Alle abgerufen am 2026-08-19.

- OR-Tools CP-SAT, offizielle Dokumentation (Google, first-party):
  https://developers.google.com/optimization/cp/cp_solver
- CP-SAT Primer — Determinismus, Worker, Modellierung:
  https://d-krupke.github.io/cpsat-primer/01_installation.html
- `or-tools-wasm` — Community-Rekompilierung, **nicht** von Google gepflegt:
  https://github.com/Axelwickm/or-tools-wasm
- Timefold Solver (Apache 2.0, Nachfolger von OptaPlanner): https://solver.timefold.ai/
- `munkres-js` — Hungarian, für die Feasibility-Ebene ausreichend, für gekoppelte Constraints nicht:
  https://www.npmjs.com/package/munkres-js
- `timetabling-solver` — genetisch, **ausdrücklich ausgeschlossen**, nichtdeterministisch:
  https://www.npmjs.com/package/timetabling-solver

**Status: Vorschlag — anfechtbar**
