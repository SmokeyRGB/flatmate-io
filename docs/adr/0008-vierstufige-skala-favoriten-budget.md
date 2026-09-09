> **Status:** Bestätigt — verbindlich für v0.1
> **Quelle:** `../05-ADRs.md` §ADR-008 (Stand V0.8, eingefroren 2026-09-09)
> **Nummer:** ADR-008 — dauerhaft. Nummern werden nie neu vergeben.

## ADR-008 — Vierstufige Skala mit nachgelagertem Favoriten-Budget

### Kontext

Dies ist die Kernfunktion: **wie stimmt eine WG über Bewerbende ab, sodass das Ergebnis als legitim
empfunden wird?** Nicht „sodass es mathematisch optimal ist" — Legitimität ist das Produkt (P-3).

Die Ausgangsspezifikation schlug zwei Varianten vor: Ja/Nein für den MVP, oder 0–10 Punkte mit einem
Punkte-Budget, das sich an der Zimmerzahl orientiert. Der Verfasser hatte bereits das entscheidende
Problem benannt: **Menschen sind unterschiedlich begeisterungsfähig.** Manche geben nur 0 oder 10,
manche bleiben im Mittelfeld. Ein Punktesystem misst dann Temperament, nicht Zustimmung.

Zwei weitere Randbedingungen aus dem Kontext:

- **Gremiengröße 5–10.** Das ist zu klein für Statistik und zu groß für ein Gespräch. Genau in dieser
  Größe sind Gleichstände häufig, nicht selten.
- **Die Beteiligung bröckelt schon beim ersten Durchlauf.** Jeder zusätzliche Arbeitsschritt kostet
  Stimmen, und fehlende Stimmen kosten Legitimität.

### Betrachtete Optionen

| Option | Vorteil | Nachteil | Bewertung |
|---|---|---|---|
| **Vier Stufen (Nein · Eher nicht · Finde gut · Unbedingt) mit nachgelagertem Favoriten-Budget** ✅ | Genug Auflösung gegen Gleichstände, wenig genug für schnelle Entscheidung. „Unbedingt" ist zugleich das Favoriten-Signal. Budget wirkt erst, wenn es nötig ist | Vier Stufen brauchen Erklärung; die Gewichte müssen offengelegt werden | **Gewählt** |
| Binär (Ja/Nein) | einfachste Bedienung, kein Erklärungsbedarf | **Zwei Probleme, beide praktisch.** (1) Bei 5–8 Bewohnenden entstehen massenhaft Gleichstände: „5 Ja" gegen „5 Ja" ist keine Rangfolge. (2) „Mir eigentlich egal" muss zu einem Ja oder Nein werden — die Skala **erzwingt eine Aussage, die die Person nicht hat**, und verzerrt genau da, wo es weh tut | Verworfen |
| 0–10 Punkte mit Gesamtbudget | feinste Auflösung, Knappheit eingebaut | Misst Temperament statt Zustimmung; Kalibrierung ist Arbeit; belohnt taktisches Rechnen. Für v1.1 als **Option** vorgesehen, nicht als Standard | Verworfen für v1 |
| Fünf Stufen mit Mitte („neutral") | vertraut (Likert) | Die Mitte ist ein Fluchtpunkt: bei unangenehmen Entscheidungen wählen viele „neutral", und die Rangfolge verflacht. Vier Stufen **ohne** Mitte erzwingen eine Richtung, ohne eine Stärke zu erzwingen | Verworfen |
| Sternebewertung 1–5 | bekannt | Bringt die Verzerrungen von Punkteskalen mit, ohne deren Auflösung zu nutzen | Verworfen |

### Entscheidung — und die fünf Begründungen, die nicht offensichtlich sind

**Vier Stufen: Nein · Eher nicht · Finde gut · Unbedingt.** Gewichte **0 · 1 · 3 · 5**,
nicht-linear, **in der UI offengelegt**. Score = **Mittelwert**, auf 0–100 skaliert. Favoriten-Budget
`ceil(offene Zimmer × 1,5)`, wirksam **erst nach** dem Screening. Rechenmodell vollständig in
`04-Domaenenmodell.md` §8.1–§8.3.

**1 — Warum vier Stufen und nicht binär.** Zwei getrennte Gründe, beide erfahrungsbasiert:
Gleichstände bei 5–8 Bewohnenden sind der **Normalfall**, nicht der Ausnahmefall — eine binäre Skala
produziert Ranglisten, in denen die halbe Bewerbermenge auf demselben Platz steht. Und „mir egal"
wird bei binärer Wahl zu einem **falschen Ja oder Nein**: die Person hat keine Meinung, muss aber
eine behaupten. Vier Stufen geben ihr „Eher nicht" und „Finde gut" — schwache Aussagen, die als
schwach gezählt werden.

**2 — Warum „Unbedingt" das Favoriten-Signal *ist*.** Die naheliegende Alternative wäre ein zweiter
Durchlauf: erst alle bewerten, dann Favoriten markieren. Das ist ein zusätzlicher Arbeitsschritt in
einem Prozess, dessen größtes Problem bröckelnde Beteiligung ist — er würde in der Praxis nicht
stattfinden, und die WG stünde ohne Favoritensignal da. Die vierte Stufe erledigt beides in einem
Durchgang. **Der gesparte Durchlauf ist der eigentliche Gewinn der vierten Stufe**, nicht die
feinere Auflösung.

**3 — Warum das Budget erst *nach* dem Screening greift.** Ein Budget während der Vergabe hemmt: man
kennt das Feld noch nicht und spart „Unbedingt" für später auf — für Bewerbungen, die dann
vielleicht nie kommen. Die ersten Karten werden dadurch **systematisch schlechter** bewertet als die
letzten. Das ist ein Reihenfolgeeffekt, den niemand bemerkt, der aber das ganze Ranking verzieht.
Nachgelagert kennt man das Feld und entscheidet **vergleichend**: nach der letzten Karte erscheint,
**nur wenn das Budget überschritten ist**, ein Feinschliff-Screen mit den eigenen
„Unbedingt"-Kandidaten nebeneinander, jede Karte direkt herabstufbar. Wer im Budget bleibt, sieht
diesen Screen nie und erfährt vom Budget nichts.

**4 — Warum Knappheit besser normalisiert als eine Punkteskala.** Beide lösen dasselbe Problem
(unterschiedliche Begeisterungsfähigkeit), aber auf verschiedene Weise. Eine Punkteskala verlangt
**Kalibrierung**: „ist diese Person mir 7 oder 8 Punkte wert?" — eine Frage, die niemand ehrlich
beantworten kann und die taktisches Rechnen belohnt. Knappheit verlangt eine **Auswahl**: „welche
dieser Personen bekommen meine wenigen Unbedingt-Stimmen?" — eine Frage, die Menschen zuverlässig
beantworten. Gleiche Normalisierungswirkung, keine Rechenaufgabe.

**5 — Warum keine z-Score-Normalisierung.** Sie wäre statistisch **besser**: pro abstimmender Person
normalisiert, würde sie unterschiedliche Skalennutzung sauber ausgleichen. Verworfen, weil der Score
dann nicht mehr aus den abgegebenen Stimmen ablesbar ist. Wenn eine Bewerbung mit drei mal
„Unbedingt" hinter einer mit drei mal „Finde gut" landet, weil eine der abstimmenden Personen
generell großzügig bewertet, ist die Rangliste **richtiger und gleichzeitig nicht mehr vermittelbar**.
**P-3 sagt: Legitimität vor Optimalität.** Das Ranking muss legitim *wirken*, nicht nur fair *sein* —
denn seine Aufgabe ist, dass sieben Menschen eine gemeinsame Entscheidung akzeptieren.

**Ergänzend, aus derselben Logik:**

- **Die Asymmetrie „ein starkes Nein wiegt mehr" ist nicht in die Gewichte kodiert.** Dafür ist das
  **Veto** in Runde 2 zuständig — ein eigener Sprechakt mit Begründungspflicht, Budget und
  Phasengrenze. Eine Skala kann das nicht leisten, ohne intransparent zu werden.
- **Nicht-lineare Gewichte (0 · 1 · 3 · 5)**, weil die Entscheidungsgrenze zwischen „Eher nicht" und
  „Finde gut" liegt — dort ist der größte Sprung. Eine lineare Skala würde behaupten, alle Übergänge
  seien gleich viel wert.
- **Mittelwert statt Summe**, weil die Summe Aufmerksamkeit belohnt statt Zustimmung. Die Abdeckung
  wird separat durch das **Quorum** ausgedrückt und ist damit sichtbar statt eingerechnet.
- **Regel-Sperre:** Änderungen am Verfahren während einer laufenden Runde sind **blockiert**, und die
  Runde rechnet nach ihrem `settings_snapshot`. Ein Verfahrenswechsel mitten in einer Abstimmung
  zerstört die Legitimität des Ergebnisses vollständig.

### Konsequenzen

**Positiv**

- Ein Durchlauf statt zwei — direkt auf die Kernmetrik gerichtet.
- Score und Gewichte sind mit Papier nachrechenbar (P-3).
- Die Einzelansicht mit gestapeltem Vier-Farben-Balken macht sichtbar, was ein Score verbirgt: 60 aus
  „drei mal Unbedingt, drei mal Nein" ist etwas völlig anderes als 60 aus „sechs mal Finde gut" — und
  eine polarisierte WG erkennt ihre Polarisierung.
- **Rechtlich ist es zusätzlich die harmlosere Bauform** (Einordnung aus `06-Compliance-Anhang.md`,
  ergänzt in V0.3): Art. 22 wurde für die faktisch stark determinierende Rangliste geprüft und
  **verneint**. Begründung: die Eingabe ist **menschliches Urteil**, kein abgeleitetes Merkmal, und der
  Score ist **Arithmetik über abgegebene Stimmen**, kein Profiling. Das ist exakt die Grenze, die P-5
  zieht — und es dreht die Begründung dieses Records um eine Ebene: die offengelegte vierstufige Skala
  ist nicht nur legitimer *empfunden* als eine verborgene Formel, sie ist auch die Bauform, die
  gar nicht erst in den Anwendungsbereich einer automatisierten Einzelentscheidung gerät. Eine
  z-Score-Normalisierung (oben verworfen) hätte diese Klarheit geschwächt, weil sie eine Rechenschicht
  zwischen Urteil und Ergebnis geschoben hätte.

**Negativ**

- **Vier Stufen brauchen Erklärung.** Der erste Kontakt ist eine Lernaufgabe; die Gewichte müssen
  sichtbar sein, was die Oberfläche belastet.
- **Der Feinschliff-Screen kann als Bestrafung erlebt werden** („ich habe zu viele gut gefunden und
  muss jetzt jemanden herabstufen"). Er erscheint nur bei Überschreitung — aber genau dann trifft er
  die engagiertesten Personen.
- **Der Mittelwert ist bei wenigen Stimmen instabil.** Zwei Stimmen ergeben einen Score, der wie ein
  Urteil aussieht. Das Quorum entschärft es, indem solche Bewerbungen gar nicht in der Rangliste
  erscheinen — verlagert das Problem also, statt es zu lösen.
- **Die Gewichte 0 · 1 · 3 · 5 sind eine Behauptung.** Sie sind plausibel begründet, aber nicht
  empirisch belegt. Sie sind einstellbar; damit ist die Behauptung wenigstens sichtbar und
  korrigierbar.
- **Verzicht auf statistische Korrektur ist ein bewusster Genauigkeitsverlust.** Wer P-3 anders
  gewichtet, kommt hier zu einer anderen Entscheidung — und das ist ein legitimer Angriff auf diesen
  Record.

> **Das gibt man auf, wenn** Haushalte in der Praxis über Gleichstände klagen (dann Punkte-Variante
> aus v1.1 als Standard) oder wenn der Feinschliff-Screen systematisch abgebrochen wird (dann Budget
> zur reinen Anzeige ohne Aufforderung).

**Status: Bestätigt — verbindlich für v0.1**

> **Bestätigt am 2026-09-09** (Samuel Zink) — verbindlich für v0.1.
> · **Aufgabebedingung:** Das gibt man auf, wenn Haushalte in der Praxis über Gleichstände klagen
> (dann Punkte-Variante aus v1.1 als Standard) oder wenn der Feinschliff-Screen systematisch
> abgebrochen wird (dann Budget zur reinen Anzeige ohne Aufforderung).
> · **Was ein späterer Widerspruch kostet:** Das `Vote`-Schema, die Score-Funktion, die Rangliste —
> und jede bereits abgegebene Stimme wird uninterpretierbar, weil ihre Skala sich geändert hat
> · Status wechselt auf `Angenommen`, sobald im Code umgesetzt und überprüft.
