# 05 — Architecture Decision Records: Flatmate.io

### ADR-001 bis ADR-012 · Entscheidungen, Optionen, Konsequenzen

> **Version:** V0.5 — *Änderung ggü. V0.4: **ADR-011** — die Zusicherungen des Stimmen-Puffers von
> vier auf **sechs** ergänzt (Leeren beim **Profilwechsel**, **idempotente** Wiedereinspielung), damit
> der Record deckungsgleich mit G-B7 und G-D11 in `GUARDRAILS.md` ist. Ohne die beiden würde der ADR
> vier Zusicherungen dokumentieren, während die CI sechs erzwingt.*
>
> *Ggü. V0.3: **ADR-011** um die **einzige Ausnahme** von der
> Service-Worker-Bedingung erweitert — ein Offline-Puffer für abgegebene Stimmen, begründet als **noch
> nicht abgeschlossene Transaktion** und nicht als „eigenes Datum", mit vier erzwungenen Zusicherungen
> als Preis (harte Höchstlebensdauer, keine Anzeigedaten, Verwerfen statt Wiederholen, Leeren bei
> Sitzungsentzug).*
>
> *Ggü. V0.2: **ADR-011** um die Bedingung erweitert, dass der Service
> Worker ausschließlich die App-Hülle cacht und niemals Bewerber- oder Beratungsdaten — sonst
> unterläuft die PWA das Löschkonzept, weil kein serverseitiger Löschjob einen Gerätecache erreicht.
> **ADR-008** um die Art.-22-Einordnung aus `06-Compliance-Anhang.md` ergänzt (verneint: menschliches
> Urteil als Eingabe, Arithmetik statt Profiling).*
>
> *Ggü. V0.1: Querprüfung gegen `06-Compliance-Anhang.md` eingearbeitet. **ADR-003** um die Payload-
> und Redaktionsregel als ausgewiesene Konsequenz erweitert (Konflikt append-only ↔ Art. 17).
> **ADR-004** um `Session.acting_profile_id` als Herkunft des Sitzungskontexts ergänzt. **ADR-007** um
> die nun modellierte `PasskeyCredential`-Entität. **ADR-010** um die Konsumentenseite erweitert: die
> Redaktionsliste wird aus `data-inventory.yml` **generiert**, nicht gepflegt.*
> **Datum:** 2026-08-19
> **Autor:** Samuel Zink (@SmokeyRGB)
> **Vorgänger:** `00-Session-Brief.md` · `02-SRD.md` (lösungsneutral) · `04-Domaenenmodell.md`
> **Nachfolger:** `06-Compliance-Anhang.md` · `GUARDRAILS.md` · später `docs/adr/` im Implementierungs-Repo

---

> # ⚠️ Jeder Record trägt `Status: Vorschlag — anfechtbar`.
>
> Dieses Dokument ist **kein Beschlussprotokoll.** Es ist der erste Einstiegspunkt für die
> Projektplanung und definiert **keine finalen Constraints** — dafür ist es zu früh. Kein Record hier
> ist „accepted" im klassischen ADR-Sinn; keiner ist ohne Widerspruch umzusetzen.
>
> Der Wert liegt darin, dass das Besprochene **mit seiner Begründung** festgehalten ist. Deshalb ist
> jeder Record so geschrieben, dass er angegriffen werden kann: die verworfenen Optionen stehen mit
> Namen da, die Konsequenzen auch dann, wenn sie unangenehm sind, und jeder Record endet mit der
> Bedingung, unter der man die Entscheidung aufgibt.
>
> **Was eine sinnvolle Reaktion ist:** eine Liste der Records, deren Begründung nicht trägt. **Was
> keine ist:** Zustimmung.

---

## Lesehinweise

**Sprachregelung.** Erläuterungstext deutsch, alle Bezeichner englisch (das ist selbst ADR-012).

**Aufbau jedes Records.** Kontext → betrachtete Optionen → Entscheidung → Konsequenzen → Status. Die
Konsequenzen enthalten ausdrücklich auch die unangenehmen; ein Record ohne Kosten ist ein Record, der
seine Alternativen nicht ernst genommen hat.

**Nummerierung ist Kontrakt.** ADR-001 bis ADR-012 werden aus `03-PRD.md`,
`06-Compliance-Anhang.md` und `GUARDRAILS.md` referenziert, die parallel entstehen. Wer umsortiert,
bricht diese Verweise.

**Referenzierte Prinzipien** (aus `00-Session-Brief.md`, namentlich und unverändert):

| | Prinzip |
|---|---|
| **P-1** | **Kanalneutralität** — jede Information, die über einen Link hereinkommen kann, muss auch von Hand einpflegbar sein; kein Feature setzt einen Link voraus |
| **P-2** | **Geräteneutralität** — kein Bewohnender darf durch sein Gerät ausgeschlossen werden |
| **P-3** | **Legitimität vor Optimalität** — Ranglisten und Terminvorschläge müssen erklärbar sein; keine versteckten Formeln, keine nichtdeterministischen Verfahren |
| **P-4** | **Reversibilität** — jeder Pipeline-Zustand ist rückwärts erreichbar und auditiert |
| **P-5** | **Keine KI in wohnungsbezogenen Entscheidungen** — zulässig ist ausschließlich strukturierende Textverarbeitung |

## Übersicht

| # | Entscheidung | Wirkt vor allem auf | Umkehrbarkeit |
|---|---|---|---|
| [ADR-001](#adr-001--modularer-monolith-mit-bounded-contexts) | Modularer Monolith mit Bounded Contexts | Codestruktur | 🟢 leicht |
| [ADR-002](#adr-002--explizite-zustandsmaschine-statt-boolean-flags) | Explizite Zustandsmaschine statt Boolean-Flags | Domänenkern, Datenmodell | 🟡 mittel |
| [ADR-003](#adr-003--append-only-ereignis-log-kein-volles-event-sourcing) | Append-only Ereignis-Log, kein Event-Sourcing | Feed, Undo, Rechenschaft | 🟢 leicht (additiv) |
| [ADR-004](#adr-004--autorisierung-zweifach-erzwungen-policy-objekte-und-postgres-rls) | Autorisierung zweifach erzwungen: Policy-Objekte **und** Postgres RLS | Sicherheit, jede Abfrage | 🔴 schwer |
| [ADR-005](#adr-005--solver-via-offiziellem-ortools-cp-sat-als-lokaler-kindprozess) | Solver via offiziellem `ortools` (CP-SAT) als lokaler Kindprozess | Terminfindung, Deployment | 🟡 mittel (Port) |
| [ADR-006](#adr-006--stack-nextjstypescript-postgres-drizzle-eu-hosting-self-hosted-auth) | Stack: Next.js/TypeScript, Postgres, Drizzle, EU-Hosting, self-hosted Auth | alles | 🔴 schwer |
| [ADR-007](#adr-007--passwort-primär-passkey-optional) | Passwort primär, Passkey optional | Onboarding, P-2 | 🟢 leicht |
| [ADR-008](#adr-008--vierstufige-skala-mit-nachgelagertem-favoriten-budget) | Vierstufige Skala mit nachgelagertem Favoriten-Budget | Kernfunktion, Legitimität | 🟡 mittel |
| [ADR-009](#adr-009--kanalneutralität-als-architekturregel-nicht-als-feature) | Kanalneutralität als Architekturregel | jeder Erfassungspfad | 🔴 schwer |
| [ADR-010](#adr-010--datenbestandsverzeichnis-als-ci-gate) | Datenbestandsverzeichnis als CI-Gate | Compliance, jede Migration | 🟢 leicht |
| [ADR-011](#adr-011--pwa-statt-native-app) | PWA statt native App | Auslieferung, P-2 | 🟡 mittel |
| [ADR-012](#adr-012--deutsch-in-dokumenten-englisch-im-code) | Deutsch in Dokumenten, Englisch im Code | Lesbarkeit, Beitragende | 🟡 mittel |

---

## ADR-001 — Modularer Monolith mit Bounded Contexts

### Kontext

Flatmate.io ist ein Solo-Projekt mit AI-gestützter Implementierung, gedacht für Haushalte mit 5–10
Personen, die das Tool in Schüben von zwei bis drei Wochen nutzen. Die Last ist minimal, die
Domäne dagegen ungewöhnlich verwinkelt: Identität, Casting-Pipeline, Beratung, Terminplanung,
Benachrichtigungen und Protokollierung haben jeweils eigene Regeln und eigene
Sichtbarkeitsanforderungen.

Der Druck geht damit **nicht** in Richtung Skalierung, sondern in Richtung **Verständlichkeit unter
Vergessen**: ein AI-Agent, der in sechs Wochen an `deliberation` arbeitet, hat den Kontext von
`scheduling` nicht mehr — und wird ohne Grenze fröhlich hineingreifen.

### Betrachtete Optionen

| Option | Vorteil | Nachteil | Bewertung |
|---|---|---|---|
| **Modularer Monolith mit Bounded Contexts** ✅ | Ein Deployable, eine Migrationskette, gemeinsame Typen. Grenzen als Importregeln maschinell prüfbar. Kontext lässt sich pro Modul erschließen, ohne das Ganze zu lesen | Grenzen sind konventionell, nicht physisch — sie halten nur, solange der Lint-Check läuft | **Gewählt** |
| Microservices je Kontext | Physische Grenzen, unabhängige Deployments | Sechs Deployables, sechs Datenbanken oder verteilte Transaktionen, Netzwerk-Fehlerbehandlung überall. Für eine Last von ~zehn gleichzeitigen Nutzenden absurd | Verworfen — löst ein Problem, das nicht existiert, und schafft fünf, die es nicht gäbe |
| Schichten ohne Kontextschnitt (klassisch `controllers/services/models`) | Vertraut, keine neuen Regeln | Der Schnitt verläuft quer zur Domäne: alle sechs Fachbereiche liegen in derselben `services/`-Halde. Genau der Zustand, in dem ein Agent nicht mehr weiß, was er nicht anfassen darf | Verworfen |
| Monolith ohne Struktur, später schneiden | schnellster Start | „Später schneiden" passiert nie. Und die Sichtbarkeitsregeln (V-1 bis V-4) sind quer über alle Kontexte verstreut — nachträglich nicht auffindbar | Verworfen |

### Entscheidung

Ein Deployable, sechs Bounded Contexts: `identity` · `casting` · `deliberation` · `scheduling` ·
`notifications` · `audit`. Kommunikation zwischen Kontexten über **Domain-Events** und
**Query-Ports** mit DTOs. **Keine Cross-Context-Joins.** Die erlaubten Abhängigkeitsrichtungen sind
in `04-Domaenenmodell.md` §4 als Tabelle festgehalten und werden per **Import-Boundary-Lint**
erzwungen.

Zusätzlich: ein **reiner Domänenkern** ohne Datenbankzugriff (Zustandsübergänge, Voting-Mathematik,
Ranking, Termin-Kostenmodell, Zeitfenster-Parser) — siehe `04-Domaenenmodell.md` §6.

### Konsequenzen

**Positiv**

- Eine Kontextgrenze kann später zu einer Prozessgrenze werden, ohne die Fachlogik anzufassen.
- Der Lint-Check ist eine **überprüfbare** Architekturaussage, kein Diagramm an der Wand — und damit
  eine Regel, die auch ein Agent nicht versehentlich verletzt.
- Der pure Kern macht die strittigen Teile (Score, Rangfolge, Kosten) ohne Infrastruktur testbar und
  damit widerlegbar.

**Negativ, und ehrlich benannt**

- **Query-Ports kosten zusätzliche Roundtrips.** Was ein `JOIN` in einer Abfrage erledigt, sind hier
  zwei Aufrufe. Bei dieser Datenmenge irrelevant, aber es ist echter Mehrcode.
- **Die Grenze hält nur, solange der Lint-Check läuft.** Eine einzelne
  `// eslint-disable-next-line boundaries/element-types` reißt sie ein. Deshalb steht „Kontextgrenzen
  nicht per Ausnahme aufweichen" in `GUARDRAILS.md` — die Regel ist so stark wie ihre Durchsetzung.
- **Die RLS-Policies verletzen die Grenze notwendigerweise** (eine Policy auf `votes` liest
  `applications` und `memberships`). Dokumentierte Ausnahme, siehe `04-Domaenenmodell.md` §4 — aber
  eine echte Kopplung, die bei einer späteren Aufspaltung zuerst wehtut.
- **Sechs Kontexte für ein Solo-Projekt sind Overhead.** Wer nur die v1 baut und dann aufhört, hat
  diese Struktur umsonst bezahlt.

> **Das gibt man auf, wenn** sich zeigt, dass die Kontextgrenzen im Alltag nur Reibung erzeugen und
> nie Nutzen — konkret: wenn über Monate jede Funktion drei Kontexte anfasst. Dann sind die Grenzen
> falsch gezogen, nicht das Prinzip.

**Status: Vorschlag — anfechtbar**

---

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

**Status: Vorschlag — anfechtbar**

---

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

---

## ADR-004 — Autorisierung zweifach erzwungen: Policy-Objekte **und** Postgres RLS

### Kontext

Die Sichtbarkeitsregeln V-1 bis V-4 (`04-Domaenenmodell.md` §5) sind **das Produkt**, nicht eine
Sicherheitsmaßnahme daneben. Ein Leck bedeutet konkret: eine eingezogene Person liest, wie über sie
abgestimmt und was über sie notiert wurde. Das ist nicht ein Bug mit Datenschutzfolge — das ist der
Vertrauensbruch, der das Produkt beendet.

Der entscheidende Kontextfaktor ist aber ein anderer, und er ist der Grund, warum dieser Record
überhaupt existiert: **Flatmate.io wird AI-gestützt implementiert.**

Damit verschiebt sich das wahrscheinlichste Fehlerbild. Nicht ein raffinierter Angriff von außen,
sondern **eine vergessene Zeile**:

```ts
// Was der Agent schreibt, wenn er den Kontext der Sichtbarkeitsregeln verloren hat:
const votes = await db.select().from(votesTable).where(eq(votesTable.applicationId, id))

// Was richtig gewesen wäre:
const votes = await policy.forSession(session).readVotes(applicationId)
```

Beide Zeilen kompilieren. Beide liefern in der Entwicklungsdatenbank plausible Ergebnisse. Beide
kommen durch ein Code-Review, wenn niemand genau an diese Regel denkt. Die erste liefert einer Person
die Stimmen über sie selbst.

Dieser Fehlermodus ist bei AI-gestützter Implementierung **systematisch**, nicht zufällig: ein Agent
arbeitet mit begrenztem Kontext, sieht in der Regel eine Datei, kennt das Schema, und die naheliegende
Abfrage ist immer die ungeschützte. Er handelt nicht böswillig — er weiß in diesem Moment nichts von
V-1.

### Betrachtete Optionen

| Option | Vorteil | Nachteil | Bewertung |
|---|---|---|---|
| **Policy-Objekte in der Anwendung *und* Postgres Row-Level-Security** ✅ | Der wahrscheinlichste Fehler — vergessener Filter — wird von der Datenbank abgefangen. Die App-Schicht liefert verständliche Fehler und trägt die Aggregatregeln, RLS trägt die Zeilenregeln | Zwei Implementierungen derselben Regel, die auseinanderlaufen können. Debugging von RLS ist unangenehm: leere Ergebnismenge statt Fehlermeldung | **Gewählt** |
| Nur Policy-Objekte in der Anwendung | Eine Wahrheit, gut testbar, gute Fehlermeldungen | Schützt **nur**, wenn sie benutzt wird. Genau das ist die Annahme, die bei AI-Implementierung nicht hält | Verworfen — verlässt sich auf Disziplin, die der wahrscheinlichste Fehlerfall gerade nicht hat |
| Nur RLS | Kein Umweg möglich, wirkt auch bei direktem SQL und in der Konsole | Aggregatregeln (V-4) sind zeilenweise nicht ausdrückbar; Fehler äußern sich als „keine Daten"; komplexe Prädikate in SQL sind schwer zu lesen und zu testen | Verworfen als Alleinlösung |
| Views mit eingebauter Filterung | einfacher als RLS | Umgehbar durch Abfrage der Basistabelle — und genau die wird ein Agent finden | Verworfen |
| Code-Review und Konventionen | kein technischer Aufwand | Verlässt sich auf Aufmerksamkeit bei einem Fehler, der unauffällig aussieht | Verworfen als Alleinlösung, unverzichtbar als Ergänzung |

### Entscheidung

Zwei Zäune, mit **klarer Arbeitsteilung** — und die Arbeitsteilung ist der eigentliche Inhalt dieser
Entscheidung:

| Zaun | Trägt | Nicht |
|---|---|---|
| **Postgres RLS** (`ENABLE` + `FORCE ROW LEVEL SECURITY`) | **V-1** (Selbst-Redaktion), **V-2** (Rundensichtbarkeit), **V-3** (Entzug bei `moved_out`) — alles Zeilenregeln | V-4 |
| **Policy-Objekte** in der Anwendung | alle vier Regeln, inklusive **V-4** (Ergebnisse verdeckt bis zur eigenen Stimmabgabe) und aller Aggregate | — |

**Warum V-4 ausdrücklich *nicht* in RLS gehört** — die wichtigste Feinheit dieses Records:
„Ergebnis verdeckt" heißt „Aggregat verbergen", nicht „Zeilen verbergen". Eine RLS-Policy, die dem
Aufrufer die Stimmen versteckt, verfälscht ihm auch den Mittelwert. Das Ergebnis wäre ein Score, der
je nach betrachtender Person anders ausfällt — der schlimmstmögliche Fehler in einem Produkt, dessen
Versprechen Legitimität ist (P-3).

**„Zweifach erzwungen" heißt also nicht „identisch zweimal".** Es heißt: der wahrscheinlichste
Fehlermodus wird von der Schicht abgefangen, die man nicht vergessen kann.

Sitzungskontext pro Request über `SET LOCAL app.account_id / app.profile_id / app.household_id`;
Policy-Skizzen in `04-Domaenenmodell.md` §5.5.

**Woher der Kontext kommt** (ergänzt in V0.2, seit `Session` modelliert ist): `app.account_id` und
`app.profile_id` werden aus `Session.account_id` und `Session.acting_profile_id` gefüllt.
`acting_profile_id = null` bedeutet Verwaltungskontext. Daraus folgen zwei Prüfungen, die nicht
optional sind:

1. `Session.acting_profile_id` darf **nur** auf ein Profil zeigen, für das eine gültige `Membership`
   **desselben Accounts** existiert. Ohne diese Prüfung ist der Profilwechsel eine Rechteausweitung.
2. Der Wechsel des aktiven Profils ist **kein** Weg an V-1 vorbei, weil `app_redaction_subjects()`
   alle Profile des **Accounts** sammelt — unabhängig davon, welches gerade gesetzt ist. Genau das ist
   der Grund, warum die Selbst-Redaktion am Account hängt und nicht am Profil.

### Konsequenzen

**Positiv**

- **Der wahrscheinlichste AI-Fehler wird strukturell abgefangen.** Vergisst ein Agent
  `WHERE household_id = …`, liefert die Datenbank trotzdem nichts. Das ist Verteidigung in der Tiefe
  gegen genau den Fehler, der hier statistisch zu erwarten ist.
- Der Schutz gilt auch für Pfade, die niemand vorhergesehen hat: Datenexport, Migrationsskripte,
  ein manueller `psql`-Zugriff mit der App-Rolle, ein neuer Endpunkt, den ein Agent hinzufügt.
- **`FORCE ROW LEVEL SECURITY`** bewirkt, dass die Policies auch für den Tabelleneigentümer gelten —
  sonst wäre die App-Rolle typischerweise ausgenommen und der ganze Zaun wirkungslos.

**Negativ, und das sind reale Kosten**

- **Zwei Implementierungen derselben Regel können auseinanderlaufen.** Gegenmittel: die geschützten
  Tests zu V-1 bis V-3 laufen **zweimal** — einmal gegen die Policy-Schicht, einmal als rohe
  SQL-Abfrage unter gesetztem Sitzungskontext. Nur wenn beide Wege dasselbe liefern, ist die Regel
  erfüllt. Ohne diesen doppelten Test ist ADR-004 eine Illusion.
- **RLS-Fehler äußern sich als leere Ergebnismenge, nicht als Fehlermeldung.** Das kostet
  Entwicklungszeit und produziert „warum ist die Liste leer"-Sitzungen. Gegenmittel: eine
  Diagnosefunktion, die den aktuellen Sitzungskontext ausgibt.
- **Connection Pooling ist eine echte Fallgrube.** `SET LOCAL` gilt nur innerhalb der Transaktion.
  Wer den Kontext außerhalb einer Transaktion setzt, vererbt ihn an den nächsten Request — und das
  wäre ein Leck *durch* die Sicherheitsmaßnahme. Muss als Test abgesichert werden.
- **Die Policies koppeln Kontexte** (eine Policy auf `votes` liest `applications` und `memberships`).
  Dokumentierte Ausnahme zu ADR-001.
- **Performance:** jede Abfrage wertet Unterabfragen aus. Bei dieser Datenmenge irrelevant, aber die
  Policies brauchen passende Indizes, sonst wird es bei 500 Bewerbungen spürbar.
- **RLS niemals abschalten** — auch nicht „kurz zum Debuggen", auch nicht in Tests. Deshalb steht
  „RLS nie deaktivieren" in `GUARDRAILS.md`. Ein Testlauf ohne RLS beweist nichts.

> **Das gibt man auf, wenn** — eigentlich nicht. Dies ist der Record, dessen Umkehrung am teuersten
> ist: RLS nachträglich einzuführen bedeutet, jede bestehende Abfrage neu zu prüfen. Wenn er fallen
> soll, dann jetzt und nicht später. Das sagt umgekehrt: er sollte jetzt hart angegriffen werden.

**Status: Vorschlag — anfechtbar**

---

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

---

## ADR-006 — Stack: Next.js/TypeScript, Postgres, Drizzle, EU-Hosting, self-hosted Auth

### Kontext

Solo-Projekt, AI-gestützte Implementierung, Non-Profit ohne Budget für bezahlte Dienste, Nutzung in
Schüben, mobile-first. Die Daten sind personenbezogen und teils besonders sensibel (Art.-9-Risiko in
Freitextbewerbungen). `02-SRD.md` bleibt bewusst lösungsneutral — diese Entscheidung liegt hier.

Zwei Anforderungen wirken direkt auf den Stack: **RLS** (ADR-004) verlangt eine Datenbank, die es
kann, und ein Datenzugriff, der Sitzungsvariablen setzen kann. **Der Solver-Kindprozess** (ADR-005)
verlangt eine Laufzeit, die Kindprozesse starten darf — was viele Serverless-Umgebungen ausschließt.

### Betrachtete Optionen

| Ebene | Empfehlung | Begründung | Verworfene Alternative |
|---|---|---|---|
| **Sprache** | TypeScript durchgängig (Ausnahme: Solver-Adapter in Python) | Ein Typsystem für Schema, API und UI. Für AI-gestützte Arbeit ist ein durchgehendes Typsystem das billigste Korrektiv gegen falsche Annahmen | Python-Backend: sinnvoll, wenn die Solver-Pipeline zentral wäre — sie ist ein Knopf unter vielen |
| **Frontend + Backend** | **Next.js (App Router)**, Server Actions und Route Handlers | Ein Deployment-Artefakt, eine Codebasis, gemeinsame Typen. Server Components halten Autorisierung und Sichtbarkeitsfilterung serverseitig — bei V-1 bis V-4 ein Sicherheitsgewinn, nicht nur Bequemlichkeit | Getrenntes SPA + eigenes API-Backend: sauberere Schichtung, doppelte Infrastruktur, doppelte Typpflege |
| **Datenbank** | **PostgreSQL 16+** | **Row-Level-Security ist die Bedingung, unter der ADR-004 überhaupt existiert.** Dazu `jsonb` für `attributes` und Payloads, Bereichstypen und Ausschluss-Constraints für Zeitfenster und Slot-Exklusivität | MySQL/SQLite: kein RLS → ADR-004 fällt. Damit ist die Wahl keine Vorliebe, sondern Folge |
| **Datenzugriff** | **Drizzle ORM** | Nah an SQL — bei RLS entscheidend, weil man sehen muss, welches Statement wirklich läuft. Typsichere Migrationen, kein verstecktes Verhalten, `SET LOCAL` unkompliziert | Prisma: bequemer, aber mehr Magie zwischen Code und Statement. Genau die Magie, die bei RLS-Debugging und bei AI-generiertem Code teuer wird |
| **Authentifizierung** | **self-hosted, Credentials-Provider, Argon2id**, Sessions in der Datenbank | Kein externer Dienst, keine Nutzerdaten bei Dritten, kein AVV mehr. Passwort ist die primäre Methode (ADR-007) | Clerk/Auth0: bequem, aber Identitätsdaten außer Haus und ein AVV mehr für ein Non-Profit. Für ein Produkt, dessen Kern Vertrauen ist, das falsche Signal |
| **Hosting** | **EU-Region**, Anbieter mit AVV, Postgres im selben Verbund | Der Haushalt ist Verantwortlicher, Flatmate.io Auftragsverarbeiter — die Kette muss lückenlos in der EU liegen | Nicht-EU-Hosting: Drittlandtransfer mit Zusatzaufwand, den ein Non-Profit nicht tragen will |
| **Auslieferung** | Docker-Image (App + Python-Solver), Postgres daneben | Ein Artefakt, reproduzierbar, Rücknahme über das vorherige Image | Serverless: **schließt den Solver-Kindprozess aus** (ADR-005) und macht dauerhafte Verbindungen mit `SET LOCAL` unangenehm |

### Entscheidung

Wie oben. Zwei Punkte sind keine Vorlieben, sondern **Folgen anderer Records** und daher nicht
einzeln verhandelbar, ohne diese mitzuverhandeln:

- **Postgres** folgt aus ADR-004 (ohne RLS kein zweiter Zaun).
- **Kein Serverless** folgt aus ADR-005 (ohne Kindprozess kein lokaler Solver).

### Konsequenzen

**Positiv**

- Eine Codebasis, ein Typsystem, ein Deployable, eine Migrationskette.
- Autorisierung serverseitig, ohne Client-Vertrauen.
- Keine personenbezogenen Daten bei Dritten außer beim Hoster.

**Negativ**

- **Self-hosted Auth heißt selbst verantwortlich**: Passwort-Zurücksetzen, Ratenbegrenzung,
  Sitzungsinvalidierung, Argon2id-Parameter, Brute-Force-Schutz. Alles gelöste Probleme, aber
  Arbeit — und Stellen, an denen ein AI-Agent plausibel aussehende Fehler baut.
- **Next.js ist ein bewegliches Ziel.** App Router, Server Actions und Caching-Verhalten haben sich
  wiederholt geändert. Ein Projekt mit langem Atem zahlt Migrationsaufwand. Gegenmittel:
  Fachlogik im puren Kern, damit ein Framework-Wechsel die Domäne nicht anfasst.
- **Kein Serverless heißt Betriebskosten** — ein laufender Container statt Skalierung auf Null. Bei
  einem spendenfinanzierten Projekt eine dauerhafte Position.
- **Drizzle ist weniger verbreitet als Prisma**, also weniger Trainingsmaterial für AI-Agenten und
  mehr falsch geratene API-Aufrufe. Deshalb die `GUARDRAILS.md`-Regel „keine Bibliotheks-API ohne
  Verifikation gegen die installierte Version".
- **Ein Image mit Node *und* Python** ist größer, langsamer gebaut und hat zwei
  Sicherheitsaktualisierungsketten.

> **Das gibt man auf, wenn** die Betriebskosten das Spendenmodell übersteigen (dann: Solver als
> separater, bedarfsgestarteter Dienst und die App serverless — aber erst, wenn ADR-005 entsprechend
> angepasst ist) oder wenn self-hosted Auth mehr Zeit kostet als die gesamte Casting-Pipeline.

**Status: Vorschlag — anfechtbar**

---

## ADR-007 — Passwort primär, Passkey optional

### Kontext

**P-2 Geräteneutralität:** kein Bewohnender darf durch sein Gerät ausgeschlossen werden. Die
Nutzungsrealität ist unbequem konkret — fünf bis zehn Personen, die das Tool in der Regel als
Haushalt **informell gewählt haben**: eine organisierende Person schlägt es vor, der Rest stimmt
vorher zumindest stillschweigend zu. Dass eine organisierende Person über den Kopf der WG hinweg
entscheidet, ist die Ausnahme, nicht die Regel — an der Geräterealität ändert das nichts: Geräte
von neu bis sehr alt, und eine Motivation, die beim ersten Hindernis endet. Die Kernmetrik ist die
**Beteiligungsquote**; jede Registrierungshürde greift sie direkt an.

Gleichzeitig existiert ein echtes Problem: **Duplikatsschutz.** Wer zweimal abstimmt, verzerrt das
Ergebnis. Die naheliegende technische Lösung — Geräte-Fingerprinting — ist nach **§ 25 TDDDG
einwilligungspflichtig** und damit praktisch unbrauchbar: eine Einwilligungsabfrage vor der ersten
Abstimmung kostet mehr Beteiligung als das Duplikat schadet.

### Betrachtete Optionen

| Option | Vorteil | Nachteil | Bewertung |
|---|---|---|---|
| **Passwort primär, Passkey optional nach der Registrierung** ✅ | Funktioniert auf jedem Gerät, in jedem Browser, auch geteilt. Ein Schritt zur Registrierung. Passkey als Komfort für die, die es haben | Passwörter sind das schwächere Verfahren; Zurücksetzen-Fluss nötig | **Gewählt** |
| Passkey primär | phishing-resistent, kein Passwort | Setzt Gerät, Browser und Betriebssystem mit Unterstützung voraus. **Verstößt gegen P-2** — genau die Person mit dem alten Gerät fällt heraus | Verworfen |
| **Magic Link** (E-Mail-Link statt Passwort) | keine Passwörter | **Verworfen in der Session, mit gutem Grund:** nicht gerätegebunden und muss abgespeichert werden. Wer den Link auf dem Rechner öffnet, aber am Handy abstimmen will, hat ein Problem; jede neue Anmeldung braucht Zugriff aufs Postfach. Als *einzige* Methode eine dauerhafte Reibungsquelle |
| Nur Beitrittscode ohne Konto | niedrigste Hürde überhaupt | Kein Duplikatsschutz, keine persönlichen Benachrichtigungen, keine Zuordnung von Stimmen — und V-1 wäre nicht durchsetzbar, weil es kein Subjekt gibt | Verworfen |
| Geräte-Fingerprinting als Duplikatsschutz | technisch wirksam | **§ 25 TDDDG:** einwilligungspflichtig. Eine Einwilligungsabfrage vor der ersten Abstimmung kostet mehr, als sie schützt | Verworfen |

### Entscheidung

**Ein-Schritt-Registrierung für Bewohnende, Passwort als primäre und universelle Methode.** Passkey
ist ein **optionaler Aufsatz nach der Registrierung**, jederzeit abschaltbar — nie Voraussetzung.

Seit V0.2 ist das im Modell verankert: **`PasskeyCredential`** (`04-Domaenenmodell.md` §2.1) mit
mehreren Credentials pro Account. Die dazu gehörende harte Regel: **das Löschen des letzten Passkeys
entzieht nie den Zugang.** `Account.passkey_enabled` ist eine Anzeige, keine Bedingung — sonst kippt
dieser Record vom „optionalen Aufsatz" in eine Abhängigkeit und verletzt P-2, also genau das, was er
schützen soll.

**E-Mail-Verifikation ist nachgelagert und blockiert die erste Abstimmung nicht.** Zwei Grenzen
gelten trotzdem: keine Inhalte mit Beratungsbezug per Mail vor der Verifikation, und keine
Benachrichtigungszustellung an unverifizierte Adressen.

**Ein Beitrittscode für den ganzen Haushalt**, nicht pro Person. Begründung: Codes pro Person müssen
verwaltet, verschickt und nachverfolgt werden — Organisationsarbeit, die das Produkt gerade abschaffen
will.

**Duplikatsschutz strukturell statt technisch** — vier Maßnahmen, die zusammen mehr wirken als ein
Fingerprint:

1. Die **Bewohnerliste ist für alle sichtbar** — ein Doppelkonto steht namentlich darin.
2. **Beitritte erscheinen im Aktivitäts-Feed** — niemand tritt unbemerkt bei.
3. Die **Quorum-Anzeige läuft gegen die Bewohnerzahl** („5 von 7") — ein Doppelkonto verschiebt den
   Nenner sichtbar.
4. **Jedes Mitglied kann entfernen.**

### Konsequenzen

**Positiv**

- Niemand fällt wegen seines Geräts heraus (P-2).
- Eine Hürde weniger im Onboarding — direkt auf die Kernmetrik gerichtet.
- Kein Einwilligungsbanner, kein Drittanbieter, keine zusätzliche Auftragsverarbeitung.
- Der strukturelle Duplikatsschutz ist **sozial** wirksam, nicht technisch — in einer WG mit sieben
  Personen, die sich kennen, ist das der stärkere Mechanismus.

**Negativ**

- **Passwörter bringen ihren ganzen Rattenschwanz mit:** Zurücksetzen per Mail, Ratenbegrenzung,
  Argon2id-Parameter, Sitzungsinvalidierung, Brute-Force-Schutz. Selbst zu bauen und selbst zu
  verantworten (ADR-006).
- **Der Haushalts-Account ist ein geteiltes Passwort.** Das ist bewusst so und ausdrücklich **keine
  Sicherheitsgrenze** — es muss in Dokumenten und UI so dargestellt werden und darf nirgends als
  Härtung erscheinen. Die praktische Folge steht in ADR-004: die Selbst-Redaktion hängt am
  **Account** und nicht nur am aktiven Profil, weil der Profilwechsel sonst der Umweg wäre.
- **Duplikate sind technisch möglich.** Wer mit zwei E-Mail-Adressen beitritt, stimmt zweimal ab. Der
  Schutz ist Sichtbarkeit, nicht Verhinderung. Das ist eine bewusst akzeptierte Restlücke, kein
  Versehen — und sie gehört in `02-SRD.md` §7 als Risiko, nicht in eine Fußnote.
- **Unverifizierte Adressen erzeugen einen Sonderfall** in Benachrichtigung und Fristenwarnung:
  eine Löschvorwarnung, die niemand erreicht, darf nicht zur stillen Löschung führen
  (`04-Domaenenmodell.md` §7).

> **Das gibt man auf, wenn** Passkeys in der Zielgruppe faktisch universell werden. Dann tauschen die
> beiden Rollen — Passkey primär, Passwort als Rückfall. Die Reihenfolge ist die Entscheidung, nicht
> die Technik.

**Status: Vorschlag — anfechtbar**

---

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

**Status: Vorschlag — anfechtbar**

---

## ADR-009 — Kanalneutralität als Architekturregel, nicht als Feature

### Kontext

Der reale Wettbewerber ist **WhatsApp plus Sprachnachricht**, nicht ein anderes Produkt. Bewerbungen
treffen über Portale, Messenger, E-Mail und Mundpropaganda ein. Verfügbarkeiten kommen als
„dienstags ab 16" in einer Chatnachricht.

Der einzige direkte Wettbewerber im Terminteil — `besichtigungstermine.com`, kostenlos, DE, wirbt
explizit mit „WG-Casting" — **ist auf seinen Link angewiesen**: die bewerbende Person muss ihn
öffnen und dort Slots wählen. Wer nicht klickt, existiert im System nicht.

Das ist die Differenzierung, und sie ist keine Marketingaussage, sondern eine Architekturregel: **wer
einen Link voraussetzt, verliert die Hälfte der Bewerbenden** — und damit die Vollständigkeit, die
den Prozess erst zusammenführt.

### Betrachtete Optionen

| Option | Vorteil | Nachteil | Bewertung |
|---|---|---|---|
| **Kanalneutralität als Invariante: jeder Erfassungspfad erzeugt dasselbe Domänenobjekt** ✅ | Kein Feature bricht, wenn Bewerbende nicht mitspielen. Manuelle Eingabe ist gleichwertig, nicht Notlösung | Jeder Pfad braucht eine vollwertige manuelle Variante — mehr UI, mehr Tests | **Gewählt** |
| Link-first mit manueller Eingabe als Rückfall | weniger Arbeit | „Rückfall" wird in der Praxis zum Hauptweg und ist dann der schlechter gebaute. Genau die Falle, in der der Wettbewerb sitzt | Verworfen |
| Nur manuelle Eingabe | einfachste Umsetzung | Verschenkt echte Erleichterung dort, wo Bewerbende gern mitmachen | Verworfen |
| Portal-Anbindung als Primärpfad (WG-Gesucht) | maximale Automatisierung | **Keine offizielle öffentliche API** — nur inoffizielle Login-Clients und Scraper. Rechtlich und betrieblich unhaltbar als Fundament | Verworfen; nutzerinitiierte Browser-Extension frühestens v1.2 |

### Entscheidung

**P-1 wird eine Architekturregel:** Jede Information, die über einen Link hereinkommen kann, muss
auch von Hand einpflegbar sein, und **alle Erfassungspfade erzeugen dasselbe Domänenobjekt.** Kein
Feature darf einen Link voraussetzen. Bewerbende werden nie in die App gezwungen.

Konkret im Modell:

- `Application.source ∈ {manual_form, paste_parser, availability_link, portal_import}` — **ein**
  Objekt, vier Herkünfte. Alles danach (Screening, Voting, Ranking, Termine) kennt den Unterschied
  nicht.
- `AvailabilityWindow.source ∈ {grid, text_parse, token_link, manual}` — dasselbe für
  Verfügbarkeiten.
- **v1-Erfassung:** manuelles Formular **plus** Paste-Parser (Nachricht einfügen, **regelbasierte**
  Heuristik extrahiert Name, Alter, Kontakt, Text, **Mensch bestätigt**). Kanalunabhängig, null
  Rechtsrisiko, kein Modell (P-5).
- **Verfügbarkeiten hybrid:** schmaler Token-Link zu *einer* Seite mit Zeitraster (kein Konto, keine
  weiteren Daten, trägt den Art.-13-Hinweis) **plus** vollwertige manuelle Eingabe strukturierter
  „kann / kann nicht"-Fenster, inklusive **Freitext→Zeitfenster-Parser** („Di 16–19", „dienstags ab
  16", „nur abends", „am 3.9. nachmittags"), regelbasiert.
- **Parser-Vorschläge sind immer bestätigungspflichtig, nie stillschweigend** (P-3). `raw_input`
  bleibt erhalten, damit ein Fehlparse nachvollziehbar ist.

### Konsequenzen

**Positiv**

- Das Produkt funktioniert vollständig, auch wenn **keine** bewerbende Person je einen Link öffnet.
- Der Unterschied zum stärksten Wettbewerber ist strukturell, nicht featurebasiert — er lässt sich
  nicht in einem Sprint kopieren.
- Kein Rechtsrisiko aus Scraping oder inoffiziellen APIs.
- Der Token-Link bleibt minimal (eine Seite, ein Raster, kein Konto) und damit datenschutzarm.

**Negativ**

- **Jeder Pfad kostet doppelte UI und doppelte Tests.** Das ist der Preis, und er fällt in v1 an,
  nicht später.
- **Der Paste-Parser wird nicht gut sein.** Regelbasierte Extraktion aus freier Prosa trifft
  vielleicht die Hälfte. Der Bestätigungsschritt macht das erträglich, aber die Erwartung muss in der
  UI gedämpft werden — sonst wirkt das Feature kaputt, obwohl es korrekt arbeitet.
- **Der Freitext→Zeitfenster-Parser hat einen langen Schwanz an Formulierungen.** „Ab nächster Woche
  eigentlich immer, außer donnerstags" ist regelbasiert nicht erfassbar. Die manuelle Eingabe muss
  deshalb **wirklich** vollwertig sein, nicht nur vorhanden.
- **KI-Parsing bleibt für v2 verlockend** — und ist der Punkt, an dem P-5 unter Druck kommt. Zwei
  Bedingungen sind vorab festzuhalten: (a) der Eingabetext bleibt personenbezogen, also EU-Verarbeitung
  und AVV mit dem Modellanbieter; (b) die Ausgabe bleibt auf **strukturierende Extraktion** begrenzt,
  **niemals Bewertung**. Nur so bleibt es unter P-5 und außerhalb Anhang III des AI Act. Für den MVP
  genügt nicht-KI-basiertes Parsing.

> **Das gibt man auf** — nicht. Dies ist der Record, der am direktesten die Produktidentität trägt.
> Fällt er, wird Flatmate.io ein besseres `besichtigungstermine.com` statt ein Werkzeug für den
> Beratungs- und Entscheidungsteil.

**Status: Vorschlag — anfechtbar**

---

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

**Status: Vorschlag — anfechtbar**

---

## ADR-011 — PWA statt native App

### Kontext

**P-2 Geräteneutralität** und die Nutzungsrealität: fünf bis zehn Personen, die das Tool in der
Regel als Haushalt informell gewählt haben — eine organisierende Person schlägt es vor, der Rest
stimmt vorher zumindest stillschweigend zu —, mobile Nutzung in Schüben von zwei bis drei Wochen,
mehrmals pro Jahr. Zwei Funktionen wollen „App-Nähe": **Benachrichtigungen** (Beteiligungsanreiz —
Kernmetrik) und ein **Icon auf dem Startbildschirm** (Wiedereinstieg ohne URL).

### Betrachtete Optionen

| Option | Vorteil | Nachteil | Bewertung |
|---|---|---|---|
| **Installierbare PWA in v1** ✅ | Kein App-Store, kein Review, kein Entwicklerkonto, keine zwei Codebasen. Installierbar auf iOS und Android. Aktualisierung ohne Nutzeraktion | Web Push auf iOS **nur** für zur Startseite hinzugefügte PWAs; keine echten Hintergrundprozesse | **Gewählt** |
| Native Apps (iOS + Android) | beste Benachrichtigungen, App-Store-Auffindbarkeit | Zwei zusätzliche Codebasen, zwei Review-Prozesse, Entwicklerkonten mit laufenden Kosten. Für ein spendenfinanziertes Solo-Projekt unverhältnismäßig — **und** eine Installationshürde für Menschen, die das Tool nicht wollten | Verworfen |
| Cross-Platform (React Native, Flutter) | eine Codebasel für beide | Trotzdem App-Stores, Reviews, Konten. Und geteilte Logik mit dem Web ist bei diesem Datenmodell mehr Versprechen als Praxis | Verworfen |
| Reine Website ohne PWA | einfachste Umsetzung | Kein Icon, kein Web Push, kein Offline-Verhalten. Verschenkt den Beteiligungsanreiz | Verworfen |

### Entscheidung

**Installierbare PWA in v1**, kein App-Store. **Web Push ist in v1 der primäre
Benachrichtigungskanal** — getragen von einer **verbindlichen Installationsführung** (SRD **S-45**):
ein sichtbarer, beharrlicher Dashboard-Hinweis, der **nach dem Beitritt** erscheint (nicht davor —
sonst würde er die Registrierungshürde wiederholen, die ADR-007 gerade abbaut) und zur Installation
auf den Startbildschirm sowie zur Aktivierung von Push anleitet.

**E-Mail ist der Fallback-Kanal**, nicht der Standardkanal: für Bewohnende, die (noch) keine PWA
installiert oder Push (noch) nicht aktiviert haben. Der **iOS-Vorbehalt bleibt unverändert
bestehen** — Web Push funktioniert dort weiterhin nur für PWAs, die zur Startseite hinzugefügt
wurden —, aber er ist jetzt keine Endstation mehr: Solange diese Installation nicht erfolgt ist,
greift der E-Mail-Fallback und überbrückt genau die Zeit bis dahin.

Damit dreht sich die Reihenfolge aus früheren Fassungen dieses Records um: **Web Push plus
verbindlicher Installationsführung ist jetzt der verlässliche Pfad, E-Mail der Fallback für die
Übergangszeit** — nicht umgekehrt. Das ist weiterhin die Konsequenz aus P-2, nur mit vertauschten
Rollen: der Kanal, der bei konsequenter Führung fast alle erreicht, trägt die Funktion; E-Mail
fängt die Lücke auf, die vor der Installation entsteht, statt sie offenzulassen.

### Konsequenzen

**Positiv**

- Eine Codebasis, eine Auslieferung, keine Store-Abhängigkeit.
- Aktualisierungen erreichen alle sofort — bei einem Produkt mit Sichtbarkeitsinvarianten ein
  Sicherheitsvorteil: eine gepatchte Lücke ist wirklich gepatcht, nicht „in Version 2.3 verfügbar".
- Kein Nutzender muss etwas installieren, um teilzunehmen.

**Negativ**

- **Der iOS-Vorbehalt ist eine echte Einschränkung**, und sie trifft die Kernmetrik: wer die PWA
  nicht zur Startseite hinzufügt, bekommt kein Push. Der Beteiligungsanreiz hängt damit auf iOS an
  einem Nutzerschritt, den viele nicht kennen — die Installationsführung (S-45) mildert das, ersetzt
  ihn aber nicht: Sie kann zur Installation anleiten, sie nicht erzwingen. Genau dafür fängt der
  **E-Mail-Fallback** die Lücke auf, statt sie offenzulassen — wer ohne installierte PWA sonst gar
  keinen asynchronen Kanal hätte, bekommt jetzt E-Mail statt nichts. Der E-Mail-Fallback muss deshalb
  **gut** sein, nicht nur vorhanden — nicht weil er der Standardkanal ist, sondern weil er für die
  Übergangszeit die einzige Brücke ist.
- **„Zur Startseite hinzufügen" ist ein erklärungsbedürftiger Schritt** — ein Onboarding-Hinweis, der
  auf jedem Gerät anders aussieht.
- **Keine Auffindbarkeit über App-Stores.** Für ein Non-Profit ohne Marketing ein realer
  Wachstumsnachteil.
- **Offline-Verhalten muss man selbst bauen** — und es fällt schmaler aus, als eine PWA könnte: die
  Bedingung unten verbietet Daten auf dem Gerät, mit **einer** benannten Ausnahme (Stimmen-Puffer).
  Offline heißt hier „die App startet und eine Stimme geht nicht verloren", nicht „die Runde ist ohne
  Netz benutzbar".

**Die entscheidende Konsequenz, ausdrücklich als Bedingung und nicht als Verfeinerung**
(ergänzt in V0.3, aufgeworfen beim Prüfen von § 25 TDDDG — im Session-Brief nicht vorhanden):

> **Eine PWA, die Daten offline vorhält, unterläuft das Löschkonzept — lautlos.**
>
> Ein Service Worker, der Bewerberdaten cacht, legt personenbezogene Daten auf die Geräte der
> Bewohnenden. Dort **erreicht sie kein serverseitiger Löschjob.** Die 180-Tage-Automatik
> (`04-Domaenenmodell.md` §7) läuft weiter grün durch, während dieselben Daten auf fünf bis zehn
> Telefonen liegenbleiben. Kein Test schlägt fehl, kein Log zeigt etwas — deshalb ist das gefährlicher
> als ein offener Fehler.
>
> **Entscheidung: der Service Worker cacht ausschließlich die App-Hülle** — Markup, Skripte, Stile,
> Icons, Manifest — **und niemals Bewerber- oder Beratungsdaten.**
>
> **Offline heißt „die App startet ohne Netz", nicht „die Daten sind ohne Netz da."** Das ist eine
> bewusste Verschlechterung des Offline-Erlebnisses gegenüber dem, was technisch möglich wäre.
>
> Ohne diese Bedingung ist ADR-011 gegen das Löschkonzept **nicht vertretbar** — sie ist deshalb Teil
> des Records und nicht ein Implementierungsdetail.
>
> **Der wahrscheinliche Fehler ist keine Entscheidung, sondern eine Konfigurationszeile:** ein
> großzügiger Runtime-Cache, der API-Antworten „für die Performance" mitnimmt. Niemand beschließt das,
> es entsteht aus einem kopierten Rezept. Für `GUARDRAILS.md` als prüfbare Zusicherung: die
> Service-Worker-Konfiguration **listet die cachebaren Pfade positiv auf** und enthält keine Regel, die
> auf API-Routen passt; ein Test prüft, dass eine API-Antwort nach dem Laden nicht im Cache liegt.
>
> Dieselbe Logik wie bei ADR-003: ein Nebenpfad, der die Hauptregel umgeht, ist kein Randfall, sondern
> der Ort, an dem die Regel zuerst bricht.

**Die einzige Ausnahme von dieser Bedingung — benannt, begrenzt und bezahlt:**

> **Ein Offline-Puffer für abgegebene Stimmen.**
>
> Er ist notwendig, nicht bequem: abgestimmt wird auf dem Sofa und in der Bahn, nicht am Schreibtisch,
> und ein verlorener Stimmabgabe-Versuch trifft unmittelbar die **Kernmetrik Beteiligungsquote**. Ohne
> eine ausdrücklich benannte Ausnahme wäre er an der Bedingung oben kommentarlos gestorben — und das
> wäre die falsche Art, eine Regel zu befolgen.
>
> **Die Begründung ist nicht die naheliegende, und der Unterschied ist wichtig.** Naheliegend wäre:
> „eine eigene Stimme betrifft kein fremdes Datum". Das ist **falsch** — ein `Vote` ist
> `application_id` plus Wert und damit eine **Beurteilung über eine dritte Person**, also ⚫, also
> genau die Datenklasse, die die Bedingung von den Geräten fernhalten soll.
>
> Die tragfähige Begründung ist eine andere: der Puffer hält eine **noch nicht abgeschlossene
> Transaktion, keine gespeicherte Kopie.** Er trägt die Nutzlast einer Handlung, die die Person selbst
> ausgelöst hat und die noch läuft. § 25 Abs. 2 Nr. 2 TDDDG deckt das **stärker** als das Caching der
> App-Hülle, nicht schwächer. Und das Löschregime bleibt unberührt, weil der Puffer den Versand nicht
> überleben **kann**.
>
> **Damit „kann nicht" eine erzwungene Eigenschaft ist und keine Erwartung, hängen sechs Zusicherungen
> daran. Sie sind der Preis der Ausnahme, nicht ihre Verzierung:**
>
> | # | Zusicherung | Warum |
> |---|---|---|
> | 1 | **Harte Höchstlebensdauer unabhängig vom Versanderfolg** (Vorschlag **7 Tage**), danach Verwerfen | **Die tragende.** Ein Gerät, das offline geht und Monate später zurückkommt, trüge sonst eine Beurteilung über eine Bewerbung, deren Daten serverseitig längst gelöscht sind — genau das Leck, das die Bedingung schließen sollte, nur durch die Hintertür |
> | 2 | **Keine Anzeigedaten im Puffer** — ausschließlich `application_id`, Wert, Rundenstufe | Sobald Name, Bewerbungstext oder Score mitwandern, ist der Puffer eine Datenkopie und die Ausnahme trägt nicht mehr |
> | 3 | **Verwerfen statt Wiederholen** bei serverseitiger Ablehnung | Eine abgelehnte Stimme (Runde geschlossen, Teilnahme entzogen, Regel-Sperre) darf nicht in einer Wiederholungsschleife auf dem Gerät weiterleben. Die Person bekommt eine Meldung, nicht der Puffer einen zweiten Versuch |
> | 4 | **Leeren bei Abmeldung und bei Sitzungsentzug** | `Session.revoked_at` und „überall abmelden" müssen das Gerät wirklich leeren — sonst ist der Entzug nur serverseitig wirksam |
> | 5 | **Leeren auch beim Profilwechsel** — nicht nur bei der Abmeldung | Der Wechsel zwischen Verwaltungs- und Bewohnerkontext ist **keine** Abmeldung: die `Session` bleibt, nur `acting_profile_id` ändert sich. Ein Puffer, der das überlebt, lässt Profil B die Stimmen von Profil A versenden. **Derselbe Fehlertyp, gegen den V-1 am Account und nicht am aktiven Profil hängt** — nur eine Schicht tiefer |
> | 6 | **Idempotente Wiedereinspielung** über einen Schlüssel `(application_id, profile_id, stage)`, nicht Anfügen | Ein Duplikat verschiebt Score **und** Quorum-Nenner. Das ist kein Zählfehler, sondern ein **falsches Datum über eine Person** — und es taucht in einer Auskunft nach Art. 15 genauso auf wie ein richtiges |
>
> **Der Profilwechsel ist damit zweimal die Stelle gewesen, an der eine Annahme bricht** — bei V-1
> (§5.1 im Domänenmodell) und hier. Das ist kein Zufall: es ist der einzige Vorgang im Produkt, der
> die handelnde Identität ändert, ohne die Sitzung zu beenden. Jede Regel, die „pro angemeldeter
> Person" gedacht ist, gehört gegen ihn geprüft.
>
> **Warum das überhaupt aufgeschrieben wird, statt es dem Implementieren zu überlassen:** eine
> unbenannte Ausnahme wird entweder **gar nicht** gebaut — dann verliert das Produkt Stimmen und
> niemand weiß warum — oder sie wird **großzügig** gebaut, weil ein Offline-Puffer ohne Anzeigedaten
> unbequem ist und die Versuchung groß, „nur den Namen" mitzunehmen. Beide Fehler entstehen aus dem
> Schweigen, nicht aus einer Entscheidung.
>
> Es bleibt bei **genau dieser einen** Ausnahme. Jede weitere ist ein neuer ADR, kein Analogieschluss.

> **Das gibt man auf, wenn** die Beteiligungsquote messbar an fehlenden Push-Benachrichtigungen
> hängt — konkret: wenn iOS-Nutzende systematisch weniger abstimmen als Android-Nutzende. Dann wird
> eine native Hülle um die PWA (nur für Push) die kleinste wirksame Antwort, nicht eine echte
> native App.

**Status: Vorschlag — anfechtbar**

---

## ADR-012 — Deutsch in Dokumenten, Englisch im Code

### Kontext

Der Autor arbeitet auf Deutsch und denkt die Domäne auf Deutsch — „WG", „Casting", „Zusage",
„Bewerbende". Der Code entsteht englisch, wie üblich. Die Domäne enthält Begriffe, für die es keine
saubere englische Entsprechung gibt: eine deutsche **WG** ist nicht ein *flatshare*, ein
**WG-Casting** ist kein *interview*, und ein **Wohnprojekt** ist gar nichts auf Englisch.

Die Gefahr ist nicht die Sprachwahl, sondern die **Vermischung**: `applicantBewertung`,
`hasZusage`, `castingRunde` — Bezeichner, die in beiden Sprachen falsch sind und die niemand
verlässlich errät. Bei AI-gestützter Implementierung wird das schnell zum Selbstläufer, weil ein
Agent den vorhandenen Stil fortschreibt, egal wie inkonsistent er ist.

### Betrachtete Optionen

| Option | Vorteil | Nachteil | Bewertung |
|---|---|---|---|
| **Dokumente deutsch, alle Bezeichner englisch** ✅ | Denken in der Muttersprache, Code in der Konvention. Klare Grenze, an der man sieht, wenn sie verletzt wird | Braucht ein **Glossar**, sonst driften Übersetzungen („Zusage" → `offer` oder `acceptance`?) | **Gewählt** |
| Alles englisch | eine Sprache, keine Grenze zu pflegen | Die Anforderungsarbeit verliert Präzision. „WG-Casting" englisch zu beschreiben, erzeugt Ungenauigkeit an genau der Stelle, an der es auf Genauigkeit ankommt | Verworfen |
| Alles deutsch, inklusive Code | maximale Domänennähe | Bricht mit jeder Bibliothekskonvention; unlesbar für externe Beitragende; AI-Agenten produzieren dabei zuverlässig Mischformen | Verworfen |
| Deutsche Domänenbegriffe im Code, Rest englisch | „Unübersetzbares" bleibt präzise | Der Grenzfall wird zur Regel; jede neue Entität löst eine Debatte aus | Verworfen |

### Entscheidung

Erläuterungstext, Begründungen und alle Dokumente **deutsch**. Entitäten, Felder, Zustände,
Enum-Werte, Funktionen, Tabellen, Commit-Nachrichten, Codekommentare **englisch**.

`Household` heißt im UI in v1 durchgängig **„WG"** — das ist **Präsentation, nicht Domäne**. Die
Übersetzung lebt in der UI-Schicht, nicht im Modell.

**Ein Glossar ist Teil der Entscheidung, nicht optional.** Ohne verbindliche Zuordnung driftet die
Übersetzung, und dann heißt dasselbe Ding an drei Stellen anders:

| Deutsch | Englisch (Kontrakt) |
|---|---|
| WG / Haushalt / Wohnprojekt | `Household` |
| Bewohner-Profil | `ResidentProfile` |
| Mitgliedschaft | `Membership` |
| Zimmer | `Room` |
| Castingrunde | `CastingRound` |
| Rundenteilnahme | `RoundParticipation` |
| Bewerbung | `Application` |
| Stimme | `Vote` |
| Veto / Einspruch | `Veto` |
| Casting-Notiz | `CastingNote` |
| Zeitfenster / Verfügbarkeit | `AvailabilityWindow` |
| Slot / Zeitplatz | `Slot` |
| Termin | `Appointment` |
| Ereignis (Feed) | `ActivityEvent` |
| Benachrichtigung | `Notification` |
| Einladen (Runde 1) | `stage = invite` |
| Zusage (Runde 2) | `stage = offer` |
| Zusage erteilt | `offer_made` |
| Eingezogen | `moved_in` |
| Ausgezogen | `moved_out` |

### Konsequenzen

**Positiv**

- Anforderungsarbeit bleibt präzise, Code bleibt konventionell.
- Das Glossar ist eine überprüfbare Liste: ein deutscher Bezeichner im Code ist eindeutig ein Fehler,
  kein Geschmacksfall.
- Ein Projekt, das später Beitragende bekommt, ist im Code sofort lesbar.

**Negativ**

- **Doppelte Begriffspflege.** Jeder neue Begriff braucht eine Glossarzeile, sonst driftet er.
- **Mischformen sind der wahrscheinlichste Verstoß**, besonders bei AI-generiertem Code, der
  deutschsprachige Prompts fortschreibt. Prüfbar per Lint (Bezeichner gegen eine deutsche Wortliste)
  — mit Restunsicherheit.
- **Die deutschen Dokumente sind für externe Beitragende eine Hürde.** Bewusst akzeptiert: das
  Projekt ist zuerst für seinen Autor gedacht.
- **Fehlermeldungen und UI-Texte sind ein Zwischenfall.** Vorschlag: technische Meldungen englisch,
  nutzersichtbare Texte deutsch über eine Übersetzungsschicht — auch wenn v1 nur `de` kennt, weil
  sonst deutsche Zeichenketten im Code landen und die Grenze verwischen.

> **Das gibt man auf, wenn** das Projekt Beitragende gewinnt, die kein Deutsch lesen. Dann werden die
> Dokumente zweisprachig — der Code ist es bereits.

**Status: Vorschlag — anfechtbar**

---

## Aufteilung beim Aufsetzen des Implementierungs-Repos

Dieses Dokument ist eine **Sammeldatei für die Planungsphase**. Beim Aufsetzen des
Implementierungs-Repos werden die Records nach **`docs/adr/`** als **Einzeldateien** aufgeteilt — ein
Record pro Datei, damit jeder eine eigene Änderungshistorie, eigene Verweise und einen eigenen
Statuswechsel bekommt:

```text
docs/adr/
  0001-modularer-monolith-bounded-contexts.md
  0002-explizite-zustandsmaschine.md
  0003-append-only-ereignis-log.md
  0004-autorisierung-policy-und-rls.md
  0005-solver-ortools-cp-sat-kindprozess.md
  0006-stack-nextjs-postgres-drizzle.md
  0007-passwort-primaer-passkey-optional.md
  0008-vierstufige-skala-favoriten-budget.md
  0009-kanalneutralitaet.md
  0010-datenbestandsverzeichnis-ci-gate.md
  0011-pwa-statt-native-app.md
  0012-deutsch-dokumente-englisch-code.md
  README.md          ← Index mit Status je Record
```

Drei Regeln für die Aufteilung, damit dabei nichts verlorengeht:

1. **Nummern bleiben.** ADR-005 bleibt `0005-…`, dauerhaft. Verweise aus `03-PRD.md`,
   `04-Domaenenmodell.md`, `06-Compliance-Anhang.md` und `GUARDRAILS.md` treffen sonst ins Leere.
2. **Der Status wird pro Datei gepflegt** und wechselt von `Vorschlag — anfechtbar` erst dann auf
   `Angenommen`, wenn der Record im Code umgesetzt **und** überprüft ist. Ein widerlegter Record wird
   **nicht gelöscht**, sondern auf `Verworfen — ersetzt durch ADR-0xx` gesetzt: die Begründung, warum
   etwas *nicht* gemacht wurde, ist der wertvollste Teil eines ADR-Bestands.
3. **Diese Datei bleibt bestehen**, als Momentaufnahme des Planungsstands vom 2026-08-19, und wird
   nicht mit den Einzeldateien synchronisiert.

---

## Verweise

| Ziel | Wofür |
|---|---|
| `00-Session-Brief.md` | verbindliches Entscheidungsprotokoll und Quellenliste |
| `02-SRD.md` | Scope, Metriken, Risiken — bewusst lösungsneutral |
| `03-PRD.md` | Nutzerflüsse und Akzeptanzkriterien |
| `04-Domaenenmodell.md` | Entitäten, Zustandsmaschinen, V-1 bis V-4, Rechenmodelle |
| `06-Compliance-Anhang.md` | Rechtsanalyse zu ADR-004, ADR-009, ADR-010 |
| `GUARDRAILS.md` | maschinell durchsetzbare Regeln zu ADR-001, ADR-004, ADR-005, ADR-010 |
