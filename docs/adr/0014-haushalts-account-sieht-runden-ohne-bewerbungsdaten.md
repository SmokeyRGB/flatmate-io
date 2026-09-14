> **Status:** Bestätigt — verbindlich für v0.1
> **Quelle:** keine — wie ADR-013 ohne Vorlage in der eingefrorenen `../05-ADRs.md` (Aufteilungsregel 3: sie wird nicht nachgetragen).
> **Nummer:** ADR-014 — dauerhaft. Nummern werden nie neu vergeben.

## ADR-014 — Der Haushalts-Account sieht Runden, aber nichts aus Bewerbungen

### Kontext

**S-50**/**U-20** haben dem Haushalts-Account den Casting-Zugriff genommen. Die Scope-Zeile sagt
wörtlich: `CastingRound`, `Application`, `Slot`, `Appointment` und `CastingNote` setzen ein
`ResidentProfile` voraus. Das war der größte Einzeleingriff jener Version, und sein Ziel war
**Zurechenbarkeit**: Jede Casting-Handlung trägt seither einen Namen statt eines anonymen
„Verwaltung".

**Drei bereits beschlossene Verwaltungsrechte widersprechen dieser Zeile — nicht ihrem Ziel, sondern
ihrem Wortlaut:**

1. **Bildschirm O17 „Aufbewahrung"** verwaltet „Aufbewahrungsfristen **abgeschlossener Runden**" und
   ist ausdrücklich „für ein Konto ohne `ResidentProfile` erreichbar" (`../screens/O-organisation.md`).
   Eine Frist lässt sich nicht verwalten, ohne die Runde zu sehen, an der sie hängt.
2. **S-35** verbietet Änderungen am Abstimmungsverfahren „nicht während laufender Runde". Wer das
   durchsetzen will, muss erkennen können, dass eine Runde läuft.
3. **`Room` → `not_available`** heißt „das Zimmer fällt aus der **laufenden Runde**, die Runde läuft
   weiter" — und das Recht dafür liegt bei `manage_rooms`, vorbelegt auch bei der Verwaltung.

Dazu kommt: `../domain/invarianten.md` §5.2 lässt den Haushalts-Account Runden **bereits** sehen.
Das Prädikat und die Scope-Zeile widersprechen sich seit S-50, und der Widerspruch ist nie
aufgefallen, weil beide Seiten getrennt gepflegt wurden.

**Wer S-50 wörtlich umsetzt, kann O17 nicht bauen.** Das ist kein Randfall, sondern eine Pflicht des
Verantwortlichen nach Art. 5 — die Aufbewahrung ist eine von genau zwei Ausnahmen, die S-50 selbst
bei der Verwaltung belässt.

**Die Gegenkraft, die jede Lösung aushalten muss.** Der Haushalts-Account hat seit ADR-013 kein
eigenes `ResidentProfile`. Damit ist seine `redaction_subjects()`-Menge **leer**, und **V-1 greift
für ihn nicht**. Solange er gar nichts aus dem Casting sieht, ist das folgenlos. Sobald er Zahlen
sieht, ist es das nicht mehr: Das Passwort des Haushalts-Accounts ist bewusst geteilt (ADR-007), und
`../domain/invarianten.md` §5.1 führt Aggregate ausdrücklich als V-1-geschützt — „ein Aggregat über
zwei Stimmen ist keine Anonymisierung". Eine eingezogene Person könnte sich also über den geteilten
Zugang Kennzahlen zur **eigenen** Bewerbung ansehen.

### Betrachtete Optionen

| Option | Vorteil | Nachteil | Bewertung |
|---|---|---|---|
| **S-50 präzisieren: Runde sichtbar, Bewerbungsabgeleitetes unsichtbar** ✅ | Löst den Widerspruch dort, wo er entstanden ist — im Wortlaut, nicht im Prädikat. O17 wird baubar, S-35 durchsetzbar, `not_available` schlüssig. Das Ziel von S-50 bleibt unangetastet: Sichtbarkeit ist keine Handlungsfähigkeit, jede Casting-Handlung trägt weiterhin einen Namen | Die Grenze muss **erzwungen** werden, nicht angenommen. Aggregate sind die Falle: Sie sehen harmlos aus und sind es nicht. Eine Zahl mehr im Bildschirm, und V-1 ist über den geteilten Zugang umgangen | **Gewählt** |
| S-50 wörtlich lassen, Aufbewahrung an die Moderation geben | Die bestätigte Scope-Zeile bliebe unverändert, und die Moderation sieht ohnehin alles — keine neue Sichtbarkeit, keine neue Grenze, kein neuer geschützter Test | **Verschiebt eine Pflicht des Verantwortlichen an eine Rolle, die sie nicht trägt.** Die Aufbewahrung steht bei der Verwaltung, weil sie eine Art.-5-Pflicht ist und nicht, weil es bequem war; `../06-Compliance-Anhang.md` führt sie als benannte Ausnahme. Und sie hinge damit daran, dass überhaupt eine moderierende Person existiert — genau der Fall, für den es den Wiederherstellungspfad gibt | Verworfen |
| Dem Haushalts-Account ein `ResidentProfile` geben, damit V-1 greift | Löst die Aggregat-Frage elegant: mit Profil ist die Redaktionsmenge nicht mehr leer | **Widerspricht ADR-013 unmittelbar**, und zwar in dessen Kernsatz: Der Haushalts-Account legt Profile an, besetzt sie aber nie. Außerdem bekäme die Verwaltung damit Stimmrecht — S-01 fällt | Verworfen |
| S-50 ganz zurücknehmen, volle Rundensicht für die Verwaltung | Am einfachsten zu bauen und zu erklären; kein Grenzfall, keine Sonderregel | Nimmt den größten Einzeleingriff der V0.6 zurück und mit ihm die Zurechenbarkeit. Ein anonymer „Verwaltung"-Zugriff auf Beratungsinhalte ist genau das, was S-50 abgeschafft hat — und über den geteilten Zugang wäre V-1 vollständig umgehbar | Verworfen |

### Entscheidung

**Der Haushalts-Account sieht, dass eine Runde existiert und in welchem Zustand sie ist. Er sieht
nichts, was aus `Application` abgeleitet ist — auch keine Zahlen.**

| Sichtbar | Unsichtbar |
|---|---|
| Existenz der Runde, `title`, `status`, `room_ids` | Jede **Zahl** aus Bewerbungen: Bewerbungszahl, abgegebene Stimmen, Beteiligung („5 von 7") |
| `opened_at`, `closed_at`, `phase_deadline_at` | Score, Rangliste, Stimmungsbild, Quorum-Anzeige |
| `retention_until`, `retention_extensions`, `retention_warned_at` | Identität Bewerbender, `CastingNote`, `Vote`, `Veto`, `Slot`, `Appointment` |

**Die Regel in einem Satz:** Rundenidentität und Lebenszyklus ja, alles aus `Application`
Abgeleitete nein — **einschließlich Aggregaten.**

**S-50 wird entsprechend neu gefasst**, nicht gestrichen: `CastingRound` verlässt die Liste „setzt
ein `ResidentProfile` voraus", die übrigen vier Entitäten bleiben darin. Die Nummer bleibt.

**`../domain/invarianten.md` §5.2 behält sein Prädikat.** `can_see_round` war nie falsch — es fehlte
die Aussage darüber, was innerhalb einer sichtbaren Runde **nicht** sichtbar ist. Diese Aussage wird
ergänzt, das Prädikat nicht geändert.

**Erzwungen statt zugesichert:** Die Grenze bekommt einen geschützten Test (**G-D15**). Ohne ihn ist
dieser Record die Einladung, „nur die Bewerbungszahl" doch anzuzeigen — und genau diese eine Zahl
reicht, um V-1 über den geteilten Zugang auszuhebeln.

**Bewusst akzeptiert: `CastingRound.title` bleibt sichtbar.** Es ist das einzige Freitextfeld in der
sichtbaren Hälfte, und „Nachbesetzung für Leas Zimmer" ist eine denkbare Eingabe. Die Alternative —
Runden nur über Datum und Zimmer zu benennen — macht O17 schlechter bedienbar, und der Titel ist die
einzige Angabe, an der eine Person die Runde wiedererkennt, deren Frist sie verlängern soll. Der
Titel gehört damit in den Textkatalog aus P-O-04: Die Oberfläche soll beim Anlegen einer Runde zu
einer sachlichen Benennung anleiten.

### Konsequenzen

**Positiv**

- **O17 wird baubar, und die Aufbewahrungspflicht bleibt, wo sie hingehört.** Eine Art.-5-Pflicht
  hängt nicht mehr daran, dass gerade jemand moderiert.
- **S-35 wird durchsetzbar** statt nur formuliert: „nicht während laufender Runde" ist prüfbar,
  wenn die Verwaltung eine laufende Runde erkennen kann.
- **Prädikat und Scope-Zeile stimmen wieder überein.** Der Widerspruch zwischen
  `invarianten.md` §5.2 und S-50 war seit V0.6 unbemerkt — er ist jetzt aufgelöst, und zwar zugunsten
  der Seite, die bereits stimmte.
- **Das Ziel von S-50 bleibt unberührt.** Sichtbarkeit ist keine Handlungsfähigkeit: Die
  Rechtematrix bleibt unverändert, jede Casting-Handlung trägt weiterhin einen Namen.

**Negativ, und das sind reale Kosten**

- **Eine Grenze mitten durch einen Bildschirm ist teurer als eine Grenze um ihn herum.** „Diese
  Entität ist tabu" prüft man einmal; „diese Entität ja, aber keine Zahl daraus" muss bei **jeder**
  neuen Anzeige erneut geprüft werden. Das ist der Preis dieser Option, und er fällt dauerhaft an.
- **Aggregate sehen harmlos aus.** Die wahrscheinlichste Verletzung ist gut gemeint: eine
  Bewerbungszahl neben dem Rundentitel, damit die Liste nützlicher wird. G-D15 ist deshalb nicht
  Verzierung, sondern die tragende Hälfte dieser Entscheidung.
- **V-1 greift für den Haushalts-Account weiterhin nicht**, und dieser Record ändert das nicht — er
  arbeitet um die leere Redaktionsmenge herum, statt sie zu füllen. Das ist vertretbar, solange die
  Grenze hält; fällt sie, fällt V-1 über den geteilten Zugang mit.
- **`CastingRound.title` ist eine bewusst offengelassene Lücke** (siehe oben). Sie ist klein, aber
  sie ist da, und sie hängt an Nutzertexten statt an einem Mechanismus.

> **Das gibt man auf, wenn** sich zeigt, dass ein Verwaltungsbildschirm ohne eine Kennzahl aus
> Bewerbungen nicht bedienbar ist. Die Antwort ist dann **nicht**, die Grenze zu verschieben,
> sondern den Bildschirm auf die Moderationsfläche zu verlegen — dort greift V-1, weil dort ein
> Profil handelt. Die Entscheidung ist „die Verwaltung sieht keine Bewerbungsdaten", nicht „die
> Verwaltung sieht wenig davon".

**Status: Bestätigt — verbindlich für v0.1**

> **Bestätigt am 2026-09-14** (Samuel Zink) — verbindlich für v0.1.
> · **Aufgabebedingung:** Das gibt man auf, wenn ein Verwaltungsbildschirm ohne Bewerbungskennzahl
> unbedienbar ist — dann wandert der Bildschirm auf die Moderationsfläche, nicht die Grenze.
> · **Was ein späterer Widerspruch kostet:** Bei einer Rücknahme **zur engen Fassung** hin: O17 und
> die Durchsetzung von S-35 fallen weg, und die Aufbewahrungspflicht braucht einen neuen Träger. Bei
> einer Aufweichung **zur weiten Fassung** hin: V-1 ist über den geteilten Haushaltszugang
> umgangen — nicht durch einen Fehler, sondern durch Entwurf, und rückwirkend für jede Runde, die
> in der Zwischenzeit gelaufen ist. Die zweite Richtung ist die teurere, und sie sieht beim
> Einbauen harmlos aus.
> · Status wechselt auf `Angenommen`, sobald im Code umgesetzt und überprüft.
