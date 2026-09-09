> **Status:** Bestätigt — verbindlich für v0.1
> **Quelle:** `../05-ADRs.md` §ADR-010 (Stand V0.8, eingefroren 2026-09-09)
> **Nummer:** ADR-010 — dauerhaft. Nummern werden nie neu vergeben.

## ADR-010 — Datenbestandsverzeichnis als CI-Gate

### Kontext

Die Rollenverteilung ist geklärt: **der Haushalt ist Verantwortlicher** für die Bewerberdaten,
**Flatmate.io ist Auftragsverarbeiter** (und zusätzlich Verantwortlicher für die eigenen
Plattform- und Accountdaten). Daraus folgen Click-Through-AVV, TOM-Liste, ein Verzeichnis nach
Art. 30 und ein Löschkonzept.

Das Domänenmodell zählt **52 personenbezogene Felder in 16 von 20 Entitäten**
(`04-Domaenenmodell.md` §9). Jedes braucht Zweck, Rechtsgrundlage, Kategorie und Frist.

Der reale Fehlermodus ist nicht das Erstellen dieses Verzeichnisses, sondern sein **Veralten**: In
sechs Wochen fügt ein Agent `applicant_notes_internal` hinzu, weil es fachlich sinnvoll ist. Das
Verzeichnis erfährt davon nichts. Ab diesem Moment ist das Art.-30-Verzeichnis falsch und die
Löschautomatik lückenhaft — und **niemand merkt es**, weil nichts fehlschlägt.

### Betrachtete Optionen

| Option | Vorteil | Nachteil | Bewertung |
|---|---|---|---|
| **Maschinenlesbare `data-inventory.yml` + CI-Check gegen das Schema** ✅ | Eine nicht deklarierte personenbezogene Spalte **bricht den Build**. Dient gleichzeitig als Art.-30-Verzeichnis und als Quelle der Löschautomatik | Pflegeaufwand bei jeder Migration; Klassifizierung braucht eine menschliche Entscheidung | **Gewählt** |
| Verzeichnis als Textdokument | schnell erstellt, gut lesbar | Veraltet ab der ersten Migration; nicht prüfbar | Verworfen |
| Klassifizierung als Code-Annotation am Schema | nah am Code, schwer zu vergessen | Nicht als Dokument für eine Behörde oder einen AVV verwendbar | Verworfen als Alleinlösung — als **Ergänzung** sinnvoll |
| Automatische Erkennung (Heuristik über Spaltennamen) | kein Pflegeaufwand | Falsch in beide Richtungen; die Entscheidung „ist das personenbezogen" ist rechtlich, nicht syntaktisch | Verworfen |

### Entscheidung

Eine **maschinenlesbare `data-inventory.yml`**: jedes personenbezogene Feld deklariert **Zweck,
Rechtsgrundlage, Aufbewahrung, Kategorie**. Ein **CI-Check bricht bei jeder nicht deklarierten
Spalte** — der Check vergleicht das eingeführte Schema gegen die Datei, nicht umgekehrt.

Die Datei erfüllt **drei** Zwecke zugleich, und das ist ihr eigentlicher Wert:

1. **Art.-30-Verzeichnis** — Grundlage für den Compliance-Anhang.
2. **Quelle der Löschautomatik** — Fristen stehen nicht doppelt im Code.
3. **Klassifizierung für V-1** — welche Felder ⚫ (Beratungsinhalt) sind und damit der
   Selbst-Redaktion unterliegen.

Die Klassen sind dieselben wie im Domänenmodell (§0.3): 🔴 Bewerbende · 🟠 Bewohnende/Account ·
⚫ Beratungsinhalt · ⚙️ nicht personenbezogen. Auch ⚙️ muss **explizit** deklariert werden — sonst
wird „nicht deklariert" zu „unauffällig", und der Check verliert seinen Sinn.

**Ergänzt in V0.2 — die Konsumentenseite, und sie ist der eigentliche Hebel.** Bis hierhin ist die
Datei ein **Gate**: sie verhindert, dass eine Spalte undeklariert bleibt. Das ist wenig, wenn die
Deklaration danach nichts bewirkt. Deshalb ist sie zusätzlich **Quelle**: vier Verbraucher werden aus
ihr **generiert**, nicht parallel gepflegt.

| Verbraucher | Was generiert wird |
|---|---|
| **Log-Redaktion** | die Liste der Payload-Felder, die zum Fristende `null` werden (ADR-003) |
| **Fehler-Tracker-Filter** | welche Feldnamen aus Stacktraces, Breadcrumbs und Request-Bodies zu entfernen sind, bevor sie den Host verlassen |
| **Auskunftsexport** | welche Felder in „Datenauskunft erzeugen" gehören (Art. 15, Unterstützungspflicht) |
| **Löschung** | welche Felder die Aufbewahrungsautomatik anfasst und mit welcher Frist |

Der Gewinn ist eine Eigenschaft, die man sonst nicht bekommt: **eine neue Freitextspalte erweitert
automatisch alle vier.** Wer `applicant_notes_internal` hinzufügt und als 🔴 deklariert, hat damit im
selben Schritt Log-Redaktion, Tracker-Filter, Auskunftsexport und Löschfrist mit abgedeckt — statt an
vier Stellen daran zu denken. Das ist der Unterschied zwischen einer Regel, die hält, und vier
Listen, die auseinanderlaufen.

### Konsequenzen

**Positiv**

- Der wahrscheinlichste Compliance-Fehler bei AI-gestützter Arbeit — eine neue Spalte ohne
  Klassifizierung — wird **mechanisch** verhindert, nicht durch Aufmerksamkeit.
- Fristen stehen an genau einer Stelle: keine Drift zwischen Compliance-Anhang und Code.
- Beim Anlegen eines Feldes muss die Frage „welche Rechtsgrundlage?" **beantwortet** werden. Der
  Zwang ist der Punkt.
- **Eine Deklaration wirkt sofort an vier Stellen** — Log-Redaktion, Fehler-Tracker-Filter,
  Auskunftsexport, Löschung — statt vier Listen zu erzeugen, die auseinanderlaufen.

**Negativ**

- **Der Check nervt genau dann, wenn man in Eile ist** — und wird dann übersprungen. Ohne die
  `GUARDRAILS.md`-Regel „neue personenbezogene Spalte muss im Datenbestandsverzeichnis stehen" plus
  „Tests nie schwächen, um CI grün zu bekommen" ist er wirkungslos.
- **Die Klassifizierung ist eine rechtliche Entscheidung**, die der Check nicht treffen kann. Er
  prüft **Vollständigkeit, nicht Richtigkeit.** Ein Feld als ⚙️ zu deklarieren, das eigentlich 🔴
  ist, bricht nichts — und ist der eigentliche Restrisiko-Pfad.
- **Die Konsumentenseite bündelt das Risiko.** Vier Verbraucher aus einer Quelle heißt: **ein Fehler
  in der Generierung wirkt an vier Stellen gleichzeitig** — eine falsch als ⚙️ deklarierte Spalte
  fehlt dann nicht nur im Verzeichnis, sondern auch in Log-Redaktion, Tracker-Filter, Auskunftsexport
  und Löschung. Das ist der Preis dafür, dass eine richtige Deklaration überall wirkt, und er ist
  bewusst bezahlt: vier auseinandergelaufene Listen sind schlechter als eine überprüfbare.
- **`jsonb`-Felder sind der blinde Fleck.** `Application.attributes` ist eine Spalte, kann aber
  beliebige personenbezogene Schlüssel enthalten. Der Check sieht die Spalte, nicht ihren Inhalt.
  Gegenmittel: solche Felder als 🔴 **pauschal** deklarieren und den erlaubten Schlüsselraum
  validieren.
- Zwei Wahrheiten (Schema und YAML) müssen synchron bleiben. Der Check ist genau die Maßnahme dagegen
  — aber er ist selbst Code, der falsch sein kann.

> **Das gibt man auf, wenn** sich zeigt, dass die Datei nur noch mechanisch mit `⚙️` gefüllt wird, um
> den Build grün zu bekommen. Dann ist sie ein Ritual, und ein Ritual ist schlechter als keine Regel,
> weil es Sicherheit vortäuscht.

**Status: Bestätigt — verbindlich für v0.1**

> **Bestätigt am 2026-09-09** (Samuel Zink) — verbindlich für v0.1.
> · **Aufgabebedingung:** Das gibt man auf, wenn sich zeigt, dass die Datei nur noch mechanisch mit
> `⚙️` gefüllt wird, um den Build grün zu bekommen.
> · **Was ein späterer Widerspruch kostet:** Ein Schema, das längst nicht deklarierte Spalten
> enthält. `04-Domaenenmodell.md` §9 ist genau daran dreimal verrutscht
> · Status wechselt auf `Angenommen`, sobald im Code umgesetzt und überprüft.

---
