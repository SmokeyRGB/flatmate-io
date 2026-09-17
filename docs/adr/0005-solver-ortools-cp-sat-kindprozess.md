> **Status:** Bestätigt — verbindlich für v0.1
> **Quelle:** `../05-ADRs.md` §ADR-005 (Stand V0.8, eingefroren 2026-09-09)
> **Nummer:** ADR-005 — dauerhaft. Nummern werden nie neu vergeben.
> **Abweichung von der Quelle:** Seit 2026-09-16 weicht dieser Record im Betriebsmodus von der
> eingefrorenen Fassung in `../05-ADRs.md` ab. Die eingefrorene Fassung bleibt als historischer
> Stand stehen; **maßgeblich ist diese Datei.**

## ADR-005 — Solver via offiziellem `ortools` (CP-SAT) als eigener Dienst

> ### Änderung 2026-09-16 — Betriebsmodus wechselt von lokalem Kindprozess zu Netzwerkdienst
>
> Die ursprüngliche Festlegung lautete *lokaler Kindprozess von Node, JSON über stdin/stdout, ein
> Deployable*. Sie wird ersetzt durch: **derselbe offizielle `ortools`-Python-Prozess, aber als
> eigener Dienst** (AWS Lambda, Container-Image, Region `eu-central-1`), erreichbar über denselben
> Solver-Port, jetzt per HTTPS statt stdin/stdout.
>
> **Der Anlass ist nicht die Aufgabebedingung dieses Records**, sondern die von **ADR-006**: der
> Wunsch, die Anwendung auf einem kostenlosen Serverless-Hosting (Vercel) zu betreiben, den ADR-006
> bisher ausdrücklich ausgeschlossen hatte — mit exakt der Begründung, dass ein Kindprozess eine
> langlebige Laufzeitumgebung braucht. Diese Entscheidung löst genau diese Abhängigkeit auf: Der
> Solver bleibt ein Kindprozess, aber **nicht mehr im selben Prozessraum wie die App** — der
> Solver-Port (Kontext/Kernentscheidung unten) macht diesen Wechsel billig, weil er dafür gebaut
> wurde.
>
> **Was sich NICHT ändert:** die Wahl des Solvers (offizielles `ortools`, CP-SAT), die fünf
> Determinismus-Bedingungen (unten, unverändert gültig — sie sind eine Eigenschaft der
> Solver-Konfiguration, nicht des Betriebsorts), die Erklärbarkeitspflicht aus P-3, und die Aussage,
> dass der Solver keine Rangfolge kennt.
>
> **Was sich ändert, zusätzlich zum Betriebsmodus:** AWS wird ein **neuer** Unterauftragsverarbeiter
> — anders als bei ADR-006s Auth-Entscheidung (die Supabase, einen bereits gelisteten Anbieter,
> lediglich eine zweite Rolle gab), kommt hier ein Name neu in die Liste. Nach **G-B4** ist das kein
> Nebensatz: *„Neue ausgehende Netzwerkziele erfordern einen Eintrag in der
> Unterauftragsverarbeiter-Liste."* Diese Entscheidung ist ohne eine AVV mit AWS und einen Eintrag
> in `06-Compliance-Anhang.md` §4 nicht abgeschlossen — siehe Konsequenzen und `review-log.md`.

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
| **CP-SAT als Netzwerkdienst (eigener Container, HTTP)** ✅ *(seit 2026-09-16)* | saubere Sprachgrenze, unabhängig skalierbar, macht die App-Schicht serverless-fähig | **Gewählt**, ausgelöst durch ADR-006s Wunsch nach kostenlosem Serverless-Hosting für die App. War bis 2026-09-16 zugunsten des lokalen Kindprozesses zurückgestellt — genau der hier vollzogene Wechsel war als „natürlicher nächster Schritt, wenn die Last es verlangt" bereits vorgesehen; ausgelöst hat ihn am Ende eine Hosting-Präferenz, nicht Last. Kostet ein zweites Deployable, Netzwerk-Fehlerbehandlung, eine Prozessgrenze mehr für personenbezogene Daten (Zeitfenster) und einen neuen Unterauftragsverarbeiter (G-B4) |

### Entscheidung

**Offizielles `ortools` (Python, CP-SAT) als eigener Dienst** — ein Container-Image mit demselben
Solver-Prozess, betrieben auf **AWS Lambda, Region `eu-central-1` (Frankfurt)**, erreicht über
HTTPS statt über stdin/stdout eines lokalen Kindprozesses. Die Daten (Zeitfenster, Slots,
Haushalts-Präferenzen) verlassen damit den App-Host, bleiben aber in der EU und bei einem Anbieter,
mit dem eine AVV abzuschließen ist (siehe Konsequenzen).

Der Solver liegt hinter einem **Solver-Port** (Schnittstelle im Domänenkern, Adapter außen) — genau
diese Abstraktion hat den Wechsel von Kindprozess zu Netzwerkdienst billig gemacht und hält ihn
weiterhin austauschbar: gegen einen anderen Netzwerkdienst, gegen Timefold, gegen eine eigene
Heuristik, oder zurück zu einem lokalen Kindprozess, sollte sich die Hosting-Lage wieder ändern.

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

> **Bedingung 5 und das Lambda-Zeitlimit sind zwei verschiedene Dinge.** Bedingung 5 verbietet, dass
> die **Suche selbst** nach Wanduhrzeit abbricht — CP-SAT muss anhand seiner eigenen, deterministischen
> Abbruchkriterien fertig werden. AWS Lambda erzwingt zusätzlich ein **hartes Infrastruktur-Limit**
> von 15 Minuten pro Aufruf — eine Betriebsgrenze, kein Abbruchkriterium für die Suche. Bei den in
> diesem Record genannten Größenordnungen (bis ~20 Bewerbende, ~200 Slots, 200–500 ms Laufzeit) liegt
> das Infrastruktur-Limit so weit über der tatsächlichen Laufzeit, dass es nicht greift. Sollte es
> jemals relevant werden, ist das ein Signal, die „Offene Messung" unten vorzuziehen — nicht, die
> Determinismus-Bedingung aufzuweichen.

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
- **Die App selbst trägt keine Python-Laufzeit mehr.** Das App-Image enthält kein `ortools`; nur
  der Solver-Dienst tut das. Das macht ADR-006s Wunsch nach kostenlosem Serverless-App-Hosting
  (Vercel) überhaupt erst möglich — der ursprüngliche Ausschlussgrund entfällt.
  Der Solver bleibt trotzdem ein Kindprozess — nur nicht mehr im selben Prozessraum wie die App.
- Der Port hält den Weg **zurück** zu einem lokalen Kindprozess offen, sollte AWS Lambda sich als
  teurer, langsamer oder komplizierter erweisen als angenommen.

**Negativ — vollständig und ohne Beschönigung**

- **Personenbezogene Daten (Zeitfenster von Bewerbenden und Bewohnenden) verlassen jetzt den
  App-Host.** AWS wird ein **neuer** Unterauftragsverarbeiter — anders als bei ADR-006s
  Auth-Entscheidung, die einen bereits gelisteten Anbieter nur eine zweite Rolle gab. Nach **G-B4**
  erfordert das einen Eintrag in `06-Compliance-Anhang.md` §4 und eine AVV mit AWS, bevor der Dienst
  live geht — nicht danach. Siehe `review-log.md` für den offenen Punkt.
- **Solver-Aufruf kostet jetzt einen Netzwerk-Hop zusätzlich zu den 200–500 ms Prozessstart.**
  Latenz und Fehlerbilder eines HTTP-Aufrufs (Timeout, DNS, TLS-Handshake, ein kalter
  Lambda-Container) kommen zur bisherigen Schätzung hinzu und sind **nicht** in den 200–500 ms
  enthalten — insbesondere ein kalter Start eines Python-Container-Images auf Lambda kann davon
  ein Vielfaches sein. Vor S-19s Auslieferung zu messen (siehe „Offene Messung" unten, jetzt um
  diesen Punkt erweitert), nicht anzunehmen.
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
- **Die Unlösbarkeitsdiagnose bedeutet mehrere Solver-Läufe** (einer pro relaxiertem Constraint) —
  jetzt mehrere Netzwerk-Hops statt mehrerer lokaler Aufrufe. Genau im ungünstigsten Fall — es gibt
  keine Lösung — ist die Antwort am langsamsten.
- **Ein Netzwerkdienst braucht echtes Fehler-Handling statt Prozess-Handling:** Timeout,
  Wiederholungslogik (oder deren bewusstes Fehlen), Verhalten bei nicht erreichbarem Dienst,
  Speicherbegrenzung im Lambda-Container, sauberes Verhalten bei ungültigem JSON. Das ist keine
  Zeile Code, sondern ein kleiner Baustein mit eigenen Tests — die Art des Bausteins hat sich
  geändert, die Notwendigkeit nicht.

> **Offene Messung, jetzt zweiteilig.** (1) Die Grenzwerte des Solvers — Bewerbende × Slots ×
> Bewohnende, ab denen die reine Rechenzeit unzumutbar wird — sind auf der Zielhardware zu messen
> und **hier** einzutragen, bevor S-19 ausgeliefert wird (`02-SRD.md` O-06, `03-PRD.md` P-O-06).
> (2) **Neu seit 2026-09-16:** die zusätzliche Latenz aus Netzwerk-Hop und kaltem Lambda-Start ist
> separat zu messen — sie addiert sich zur reinen Solver-Laufzeit und kann sie bei kleinen
> Problemgrößen dominieren. Der Solver liegt in v1.1, beide Messungen damit ebenfalls.

> **Bewusst offen gehalten.** Der Solver-Port darf eine zusätzliche Gewichtung je Bewerbung
> nicht ausschließen — etwa eine Priorisierung der Terminfindung nach dem Abstimmungsergebnis
> (`04-Domaenenmodell.md` O-8). Ob das den Ablauf verkompliziert und was es die Laufzeit kostet,
> ist offen; die Schnittstelle soll die Frage nicht vorentscheiden.

> **Das gibt man auf, wenn** die Betriebskosten, die Latenz oder der AVV-/Compliance-Aufwand von
> AWS Lambda den Vorteil des kostenlosen App-Hostings übersteigen (dann zurück zu einem lokalen
> Kindprozess — der Solver-Port macht das ebenso billig wie den Weg hierher), **oder** wenn
> ADR-006s Serverless-Entscheidung selbst wieder aufgegeben wird (dann entfällt der Anlass für die
> Trennung, und ein lokaler Kindprozess ist wieder die einfachere Wahl). Unverändert gültig, aus der
> Vorfassung: **oder** wenn sich zeigt, dass Haushalte den Vorschlagsknopf nie benutzen, weil sie
> ihre Termine ohnehin von Hand legen — dann wäre die **Feasibility-Schicht allein** das Feature,
> und der Solver fiele ersatzlos weg. Das ist ein ernstzunehmendes Szenario und der Grund, warum die
> Feasibility-Schicht ausdrücklich nicht als Solver-Vorprodukt gebaut wird.

### Quellen

Ursprünglich abgerufen am 2026-08-19; um die mit „(2026-09-16)" markierten Einträge ergänzt.

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
- (2026-09-16) AWS Lambda — Kontingente (Image-Größe 10 GB, Zeitlimit 15 Minuten):
  https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html
- (2026-09-16) AWS Free Tier FAQ — Kontingente gelten kontoweit über alle Regionen, nicht auf
  bestimmte US-Regionen beschränkt (Unterschied zu Google Cloud Run):
  https://aws.amazon.com/free/free-tier-faqs/

**Status: Bestätigt — verbindlich für v0.1**

> **Bestätigt am 2026-09-16** (Samuel Zink) — verbindlich für v0.1, ausgelöst durch die
> Aufgabebedingung von **ADR-006** (kostenloses Serverless-App-Hosting) und den in dieser
> Konversation dokumentierten Vergleich von Hosting-Optionen für den Solver-Dienst.
> · **Aufgabebedingung:** siehe „Das gibt man auf, wenn" oben.
> · **Was ein späterer Widerspruch kostet:** den Solver-Adapter und dessen Tests (Anbindung an
> HTTP statt stdin/stdout), nicht aber die Solver-Konfiguration selbst (Determinismus-Bedingungen,
> Eingabeformat) — der Solver-Port ist genau dafür gebaut, diese Kosten klein zu halten.
> · Status wechselt auf `Angenommen`, sobald im Code umgesetzt, die AVV mit AWS abgeschlossen und
> beides überprüft ist.
