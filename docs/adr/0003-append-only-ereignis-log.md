> **Status:** Vorschlag — anfechtbar
> **Quelle:** `../05-ADRs.md` §ADR-003 (Stand V0.8, eingefroren 2026-09-09)
> **Nummer:** ADR-003 — dauerhaft. Nummern werden nie neu vergeben.

## ADR-003 — Append-only Ereignis-Log, kein volles Event-Sourcing

### Kontext

Fünf Anforderungen zeigen alle auf dieselbe Lösung:

1. **Aktivitäts-Feed** — „Jonas hat Lea eingeladen".
2. **Benachrichtigungs-Fan-out** — wer muss was erfahren.
3. **„Was ist passiert, während ich weg war"** — Schmerzpunkt 8 der Ursprungsspezifikation und einer
   der Hauptgründe, warum die Beteiligung heute einbricht.
4. **Undo** und die Nachvollziehbarkeit von Rückwärtsübergängen (P-4).
5. **Rechenschaftspflicht** — wer hat wann welche personenbezogenen Daten angelegt, geändert,
   exportiert, gelöscht.

Alle fünf brauchen eine verlässliche, geordnete Ereignisfolge. Keine davon braucht, dass der
**Zustand** aus Ereignissen rekonstruiert wird.

### Betrachtete Optionen

| Option | Vorteil | Nachteil | Bewertung |
|---|---|---|---|
| **Append-only Log *neben* den normalen Tabellen** ✅ | Deckt alle fünf Anforderungen. Normale Abfragen bleiben normale Abfragen. Additiv einführbar und additiv erweiterbar | Zwei Schreibvorgänge pro Aktion; Log und Zustand können theoretisch auseinanderlaufen | **Gewählt** |
| Volles Event-Sourcing (Ereignisse sind die Wahrheit) | perfekte Historie, Zeitreisen, keine Zustandsdrift | Jede Leseabfrage braucht Projektionen; Migrationen alter Ereignisformate sind dauerhafte Last; deutlich schwerer zu debuggen. **Und: Löschpflichten sind in einem unveränderlichen Log grundsätzlich schwierig** | Verworfen — der Aufwand zahlt Vorteile, die dieses Produkt nicht braucht |
| Datenbank-Audit-Trigger | fast kostenlos, lückenlos auf Zeilenebene | Protokolliert Spaltenänderungen, keine **fachlichen** Ereignisse. „Jonas hat Lea eingeladen" lässt sich aus einem `UPDATE`-Diff nicht ehrlich formulieren; der handelnde Kontext (Profil vs. Verwaltung) fehlt | Verworfen als Ersatz, brauchbar als Ergänzung |
| Nur `updated_at`/`updated_by` auf den Tabellen | minimal | Keine Historie, kein Feed, kein Undo | Verworfen |

### Entscheidung

Eine `ActivityEvent`-Tabelle, **append-only**: kein `UPDATE`, kein `DELETE` außer durch das
Löschkonzept. Felder in `04-Domaenenmodell.md` §2.5. Jedes Ereignis speichert **Account *und*
handelndes Profil** — dadurch sagt der Feed ehrlich „Verwaltung hat Lea eingeladen", wenn im
Verwaltungskontext gehandelt wurde, statt einen Namen zu erfinden.

Der Zustand bleibt in den Fachtabellen. Das Log ist **Ergänzung, nicht Quelle**.

Zwei Regeln, die im Domänenmodell hergeleitet werden und hier als Entscheidung stehen:

- **Payloads von Beratungsereignissen enthalten nur Referenzen und Zähler, keine Werte.** Ein
  `vote.cast` mit `{value: "no"}` im Payload macht das Log zum bequemen Umweg um V-1.
- **Das Log ist von der Löschautomatik nicht ausgenommen.** Payload-Felder mit personenbezogenem
  Inhalt werden zum Fristende **redigiert** (Struktur bleibt, Inhalt wird `null`), damit die
  Rechenschaftskette erhalten bleibt, ohne die Speicherbegrenzung nach Art. 5 Abs. 1 lit. e zu
  verletzen.

### Konsequenzen

**Positiv**

- Fünf Anforderungen aus einer Quelle, ohne Umbau der Lesepfade.
- `correlation_id` bündelt Ereignisse einer Aktion — ein Solver-Lauf, der zwölf Termine legt, ist
  eine Feed-Zeile, nicht zwölf.
- `reverses_event_id` macht Rückwärtsübergänge im Feed sichtbar und Undo implementierbar.

**Negativ**

- **Zwei Schreibvorgänge pro Aktion.** Sie müssen in derselben Transaktion liegen, sonst driftet das
  Log. Ein Agent, der eine Statusänderung „schnell" direkt schreibt, umgeht das Log lautlos — daher
  I-2 („kein Zustandswechsel ohne Ereignis") als geschützter Test.
- **Das Log wächst monoton** und enthält die heikelsten Referenzen. Ohne die Redaktionsregel wird es
  zum Datenschutz-Leck mit Ansage.
- „Append-only" ist eine Konvention, keine DB-Eigenschaft. Ohne Berechtigungstrennung (kein
  `UPDATE`-Recht für die App-Rolle) ist es nur ein Vorsatz.

**Die entscheidende Konsequenz, ausdrücklich als Architekturentscheidung und nicht als Modellnotiz**
(in V0.2 herausgezogen, nachdem die Querprüfung sie unabhängig zweimal gefunden hat):

> **„Append-only" und Art. 17 stehen im Konflikt, und der Konflikt wird nach *einer* Seite aufgelöst.**
>
> Ein unveränderliches Log, das personenbezogene Inhalte trägt, verletzt die Speicherbegrenzung nach
> Art. 5 Abs. 1 lit. e. Ein Log, das gelöscht wird, verliert die Rechenschaftskette. Beides ist
> unbrauchbar. Die Auflösung ist **Redaktion statt Löschung**, in zwei Teilen:
>
> 1. **Payloads von Beratungsereignissen enthalten nur Referenzen und Zähler, keine Werte.** Ein
>    `vote.cast` mit `{value: "no"}` im Payload macht das Log zum bequemen Umweg um **V-1** — die
>    Selbst-Redaktion würde in der Anwendung greifen und im Feed lecken. Wer den Wert braucht, fragt
>    `deliberation` über den Query-Port und passiert damit die Policy.
> 2. **🔴/⚫-Payload-Felder werden zum Fristende redigiert:** Struktur bleibt, Inhalt wird `null`. Das
>    Ereignis „am 3.9. wurde eine Stimme abgegeben" überlebt, der Inhalt nicht.
>
> Das ist keine Verfeinerung von ADR-003, sondern eine **Bedingung** dafür: ohne diese Regel ist das
> Ereignis-Log ein Datenschutz-Leck mit Ansage, und ADR-003 wäre nicht vertretbar.
>
> **Für `GUARDRAILS.md` als prüfbare Zusicherung, nicht als Prosa:** **„kein Freitext in
> `ActivityEvent.payload`"** — ein Test, der die Payload-Schemata gegen eine Positivliste erlaubter
> Schlüssel prüft, plus ein Lint, der Freitextfelder in Payload-Konstruktoren verbietet. Ohne diese
> Regel steht die Auflösung nur in einem Dokument, und dann ist sie in sechs Wochen weg.

> Diese Fassung ist gegenüber `06-Compliance-Anhang.md` §5.6 **maßgeblich** — der Compliance-Anhang
> richtet sich danach, nicht umgekehrt. Grund: die Regel deckt zusätzlich die V-1-Umgehung ab, die eine
> rein löschfristbezogene Formulierung nicht sieht. Der Rest bleibt offener Punkt **O-5** in
> `04-Domaenenmodell.md`.

> **Das gibt man auf, wenn** die Zustandsdrift zwischen Log und Tabellen praktisch auftritt oder
> Zeitreisen zur Anforderung werden. Dann ist volles Event-Sourcing für einen einzelnen Kontext
> (am ehesten `deliberation`) der nächste Schritt — nicht für alle sechs.

**Status: Vorschlag — anfechtbar**
