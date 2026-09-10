# Handover — sprint-v0.1

> **Status:** V1.0 · 2026-09-09 · Samuel Zink (@SmokeyRGB)
> **Branch:** `dev/flatmate-sprint-v0.1` → `main`
> **Was übergeben wird:** `docs/` **und** `tools/`, zusammen kopiert.
> **Was nicht mitgeht:** `coursework/`, `archive/`, `research/`, `process/`.

---

## 1. Prüfstand

| Prüfung | Ergebnis |
|---|---|
| `tools/check-refs.sh` (7 Regeln) | **0 Funde** — Ausgangsbasis waren 18 |
| `tools/done-check.sh` (6 Abschnitte, 17 Zusicherungen) | **17 von 17** |
| Übergabe-Probe: `docs/` + `tools/` isoliert kopiert und dort geprüft | **0 Funde**, Hash-Sperre verifiziert |

Die Probe ist der eigentliche Test: der Ordner wurde in ein leeres Verzeichnis kopiert und dort
allein geprüft. Nichts verweist hinaus.

---

## 2. Was der Umbau am Token-Problem geändert hat — und was nicht

**Ehrlich zuerst: `docs/` ist jetzt größer, nicht kleiner.** Rund 543 000 Token statt 267 000,
weil neben jeder aufgeteilten Datei die **eingefrorene Sammeldatei** stehen bleibt — 5 309 Zeilen,
die niemand liest, aber die den Herkunftsnachweis jeder aufgeteilten Datei tragen und die
Versionsgeschichte halten, die nirgends sonst steht. (Zeilennummern-Verweise sind heute nur noch
**zwei** — vor dem Sprint fünfzehn, davon fünf schon falsch. Der Nutzen liegt inzwischen weniger
in den zwei Verweisen als in Regel 3, die **neue** verhindert.)

Die Gesamtgröße war nie das Problem. Das Problem war, **wie viel man laden muss, um eine Aufgabe
zu erledigen.** Und das hat sich geändert:

| | vorher | jetzt |
|---|---|---|
| größte Datei, die man für eine Aufgabe öffnet | 2 333 Zeilen (`04-Domaenenmodell.md`) | ~460 (`screens/O-organisation.md`) |
| typischer Arbeitssatz: ein Paket + sein Kontext + das Gate + der Index | die halbe Kette | **799 Zeilen** |
| „wo gilt diese Regel?" | vier Fundstellen, keine Rangfolge | eine Zeile in `SPEC-INDEX.md` |

Der Satz, der das trägt, steht in `docs/README.md`: **„Lies das Paket für deinen Schnitt, nicht
das PRD."**

---

## 3. Was geparkt ist, und woran es hängt

### Braucht eine Kanzlei — blockiert **nicht** die Implementierung

| Punkt | Fällig |
|---|---|
| `Q-1`…`Q-4` in `docs/06-Compliance-Anhang.md` §13 | **vor dem ersten echten Haushalt.** v0.1 läuft auf synthetischen Daten; die vier blockieren den Datenübergang, nicht das Bauen |
| `Q-5`…`Q-15` | mit demselben Auftrag. Begleitschreiben: `COMPLIANCE-QUESTIONS.md` in diesem Ordner |
| `Q-13` (Vermieter-Stufe) | **aufgeschoben** hinter Hypothese `H-V5` — erst prüfen, wenn die Stufe überhaupt für tragfähig gehalten wird |

### Braucht eine Erhebung, kein Dokument

| Punkt | Fällig |
|---|---|
| `02-SRD.md` **O-07** — Baseline | **Zeitkritisch.** Die rückblickende Hälfte (Nachrichtenzahl, Tage bis zur Entscheidung, Zahl der Antwortenden) ist **heute noch** aus den Chatverläufen rekonstruierbar und wird mit jedem Monat schwerer. Die vorausschauende Hälfte wandert zu den Prototypen |
| 21 Hypothesen in `docs/HYPOTHESES.md` | An den Prototypen. **Sie tragen eine Bausperre** über Solver, Kalender, Veto, Benachrichtigungen und PWA — „zwischen einem Drittel und der Hälfte des v1-Aufwands". Auslöser wurde von der entfallenden Concierge-Runde auf die Prototypen umgehängt; ohne das hätte die Sperre lautlos aufgehört zu gelten |

### Bleibt offen, weil es offen bleiben soll

| Punkt | Warum |
|---|---|
| `domain/offene-punkte.md` **O-8** — Rangfolge als Solver-Eingabe | Bewusst als **Entwurfsoption** geführt, nicht als Ausschluss. Zwei Fragen entscheiden es: verkompliziert es den Ablauf, und was kostet es an Laufzeit? Kein Beschluss nötig — automatisches Lösen liegt in v1.1. ADR-005 hält fest, dass der Solver-Port eine Gewichtung je Bewerbung nicht ausschließen darf |
| `03-PRD.md` **P-O-04** — Textkatalog | Sammelarbeit; ~80 % der Wortlaute existieren wörtlich. Die Rechtsfrage dahinter ist als `Q-15` ausgelagert |
| **O-G** *(neu gefunden)* | Die UI-Vokabular-Übersetzungstabelle, die U-24 verlangt, wird zweimal als „§8.6" zitiert und **existiert nicht**. Spezifikationsarbeit, kein Umbau. Fällig, bevor Oberflächentexte final werden |

### Auflagen an die Umsetzung — in `docs/GUARDRAILS.md` §Implementierungspflichten

Fünf Zeilen. Eine davon ist die einzige, die nach dem Start **lautlos** zubeißen kann:

> **Backup.** S-33 erlaubt, die Aufbewahrungsfrist auf 30 Tage zu verkürzen. Ein länger gehaltenes
> Backup überlebt damit die kürzeste zulässige Frist — und ein Restore holt Bewerberdaten zurück,
> die rechtmäßig gelöscht waren, ohne Fehlermeldung. Festgelegt: RPO 24 h · RTO 8 h ·
> **Aufbewahrung höchstens 30 Tage** · jeder Restore lässt den Löschlauf durchlaufen, **bevor** die
> Anwendung Verkehr annimmt. **Beide Hälften sind nötig**; die Deckelung allein genügt nicht.

---

## 4. Zwei Dinge, die beim Umbau gefunden wurden und Code betreffen

**ADR-006 hätte ADR-005 lautlos getötet.** Der Solver läuft als lokaler Python-Kindprozess.
Nirgends stand, dass das die Hostingwahl einschränkt — eine für v0.1 naheliegende Entscheidung
(serverless, Edge) hätte den v1.1-Solver unmöglich gemacht, ohne dass es auffällt. Die
Zwangsbedingung steht jetzt in ADR-006, **eingetragen bevor** der Record bestätigt wurde.

**Fünf von fünfzehn Verweisen mit Zeilennummer zeigten schon auf die falsche Stelle.** Nicht
„würden irgendwann brechen" — sie waren bereits falsch: einer zitierte „§4.1.5", während seine
Zeilennummer in §4.1.3 gelandet war; einer zitierte einen offenen Punkt, der 339 Zeilen entfernt
lag. Alle fünfzehn sind auf Abschnittsverweise umgestellt, und Regel 3 erlaubt Zeilennummern jetzt
nur noch in die drei eingefrorenen Dateien.

---

## 5. Wenn ein Prüfskript rot wird

Jede Regel schließt eine Fehlerklasse, die dieses Projekt **schon einmal produziert hat** — das ist
der Maßstab, den `review-log.md` selbst gesetzt hat. Wird eine rot, ist die Datei falsch, nicht die
Regel. **Zwei Ausnahmen**, beide dokumentiert:

- Eine **absichtliche** Änderung an einer eingefrorenen Sammeldatei verlangt, den Hash in
  `tools/frozen.sha256` **im selben Commit** mitzuführen. Das ist der Mechanismus, nicht ein
  Hindernis: er macht die Absicht im Review sichtbar.
- `archive/**` ist von Regel 2 ausgenommen. Die Pfade dort sind Aussagen über einen bestimmten Tag,
  keine Zeiger. `archive/README.md` enthält die Übersetzung.

---

## 6. Der erste Schritt danach

Nicht Code. **`docs/MINIMAL-GATE.md`** — die neun Gates, von denen vier nachträglich eingezogen
jede bestehende Abfrage anfassen. Drei tragen den Zusatz „vor der ersten Tabelle" bzw. „vor der
ersten Policy", und das ist wörtlich gemeint.

Das sechste Gate ist das, an dem sich entscheidet, ob die Autorisierung echt ist: die
Sichtbarkeitsinvariante wird **zweimal** geprüft — durch die Policy-Schicht und als rohes SQL, das
sie umgeht. `GUARDRAILS.md` G-C7 über das Auslassen der zweiten Prüfung:

> *„sonst ist ADR-004 eine Illusion"*
