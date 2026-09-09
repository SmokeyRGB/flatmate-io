> **Status:** Bestätigt — verbindlich für v0.1
> **Quelle:** `../05-ADRs.md` §ADR-002 (Stand V0.8, eingefroren 2026-09-09)
> **Nummer:** ADR-002 — dauerhaft. Nummern werden nie neu vergeben.

## ADR-002 — Explizite Zustandsmaschine statt Boolean-Flags

### Kontext

Die Casting-Pipeline hat sieben Hauptzustände und vier Seitenzustände. Der naive Weg — und der, den
der ursprüngliche Entwurf implizit nahm — ist eine Handvoll Flags: `is_invited`, `is_scheduled`,
`is_interviewed`, `has_offer`, `moved_in`, `is_rejected`, `is_archived`.

Sieben Booleans haben 128 Kombinationen, von denen elf gültig sind. Die anderen 117 entstehen
irgendwann — durch einen Rückwärtsübergang, einen Doppelklick, einen Agenten, der ein Flag setzt und
das komplementäre vergisst. Danach ist nicht mehr entscheidbar, in welchem Zustand die Bewerbung
*eigentlich* ist, und jede Abfrage bekommt eine andere Antwort.

Verschärfend: **P-4 verlangt ausdrücklich Rückwärtsübergänge.** „Neue Mitbewohnerin" ist nicht in
Stein gemeißelt; Zusagen platzen. Genau bei Rückwegen laufen Flag-Kombinationen auseinander.

### Betrachtete Optionen

| Option | Vorteil | Nachteil | Bewertung |
|---|---|---|---|
| **Ein `state`-Feld plus deklarative Übergangstabelle** ✅ | Ungültige Zustände existieren nicht. Übergänge sind Daten und damit ohne Datenbank testbar. Jeder Rückweg ist eine Zeile, kein Sonderfall. Ein nicht deklarierter Übergang wirft | Ein Statuswechsel muss durch die Tabelle — bequeme Direktzuweisungen entfallen | **Gewählt** |
| Boolean-Flags | schnell hingeschrieben, einfache Abfragen | 117 ungültige Kombinationen; Rückwege korrumpieren den Datensatz still | Verworfen |
| Zustand aus dem Ereignis-Log ableiten (Event-Sourcing) | perfekte Historie, kein Zustandsfeld zu pflegen | Jede Leseabfrage braucht eine Projektion; Debugging deutlich schwerer; siehe ADR-003 | Verworfen für v1 |
| Workflow-Engine (Temporal, XState-Server o. ä.) | mächtig, visualisierbar | Zweite Laufzeit bzw. schwergewichtige Abhängigkeit für elf Zustände | Verworfen — Missverhältnis |

### Entscheidung

Ein `state`-Feld pro Maschine, **drei Maschinen**: `Application` (elf Zustände), `CastingRound`
(fünf), `Room` (sechs). Alle Übergänge in **einer** deklarativen Tabelle je Maschine, mit den Spalten
*von* → *nach* → *wer darf* → *was protokolliert wird*. Vollständige Definition in
`04-Domaenenmodell.md` §3.

Vier Regeln gelten für jeden Übergang:

1. Was nicht in der Tabelle steht, ist **nicht möglich** — ein nicht deklarierter Übergang ist ein
   Fehler, kein Sonderfall.
2. Jeder Übergang erzeugt genau ein `ActivityEvent` mit Account, handelndem Profil, Vor- und
   Nachzustand.
3. **Rückwärtsübergänge sind deklariert, erlaubt und auditiert** (P-4); sie tragen
   `reverses_event_id`.
4. Rückwege sind im Feed **als solche erkennbar**, nicht still korrigiert.

`Appointment` und `Vote` bekommen bewusst **keine** eigene Maschine — Begründung in
`04-Domaenenmodell.md` §3.4.

### Konsequenzen

**Positiv**

- Der Zustandsraum ist geschlossen und dokumentiert. „Kann eine Bewerbung von X nach Y?" ist eine
  Tabellenabfrage, keine Codearchäologie.
- Die Übergangstabelle ist eine pure Datenstruktur → testbar ohne Migration, überprüfbar durch
  Lesen.
- Die Berechtigungsspalte macht Autorisierung **pro Übergang** explizit, statt sie in
  Controller-Bedingungen zu verstreuen.

**Negativ**

- **Jeder neue Übergang ist eine Codeänderung** samt Migration des Enums. Das ist gewollt, aber es
  bremst spontane Prozessanpassungen.
- **Drei Maschinen mit Kopplungsinvarianten** (I-8 bis I-10 in `04-Domaenenmodell.md`): `Room` und
  `Application` müssen konsistent bleiben. Diese Invarianten sind der teuerste Teil des Modells und
  brauchen eigene Tests.
- **Der Rückweg `moved_in → offer_made` ist heikel:** er darf `became_resident_id` **nicht**
  zurücknehmen, sonst schaltet er V-1 lautlos ab. Das ist eine Regel, die man beim schnellen Lesen
  falsch implementiert — und die deshalb als geschützter Test in `GUARDRAILS.md` gehört.
- Elf Zustände sind für die UI viel. Ohne gute Verdichtung wirkt die Pipeline bürokratischer als der
  WhatsApp-Status-quo, den sie ersetzen soll.

> **Das gibt man auf, wenn** sich die Prozessphasen als haushaltsspezifisch erweisen (jede WG castet
> anders). Dann wird die Übergangstabelle zu **Konfiguration** statt Code — ein deutlich größerer
> Umbau, aber derselbe Grundgedanke.

**Status: Bestätigt — verbindlich für v0.1**

> **Bestätigt am 2026-09-09** (Samuel Zink) — verbindlich für v0.1.
> · **Aufgabebedingung:** Das gibt man auf, wenn sich die Prozessphasen als haushaltsspezifisch
> erweisen (jede WG castet anders).
> · **Was ein späterer Widerspruch kostet:** Eine Migration von Boolean-Flags zu Zuständen, auf einem
> Datenbestand, der die Zustände schon führt
> · Status wechselt auf `Angenommen`, sobald im Code umgesetzt und überprüft.
