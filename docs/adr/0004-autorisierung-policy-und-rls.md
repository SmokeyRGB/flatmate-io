> **Status:** Bestätigt — verbindlich für v0.1
> **Quelle:** `../05-ADRs.md` §ADR-004 (Stand V0.8, eingefroren 2026-09-09)
> **Nummer:** ADR-004 — dauerhaft. Nummern werden nie neu vergeben.

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

**Status: Bestätigt — verbindlich für v0.1**

> **Bestätigt am 2026-09-09** (Samuel Zink) — verbindlich für v0.1.
> · **Aufgabebedingung:** Das gibt man auf, wenn — eigentlich nicht. Dies ist der Record, dessen
> Umkehrung am teuersten ist: RLS nachträglich einzuführen bedeutet, jede bestehende Abfrage neu zu
> prüfen.
> · **Was ein späterer Widerspruch kostet:** **Jede Abfrage im System.** Autorisierung nachträglich
> einzuziehen heißt, jede bestehende Abfrage anzufassen — und genau das ist der Weg, auf dem eine
> vergessene Bedingung zum Datenleck wird
> · Status wechselt auf `Angenommen`, sobald im Code umgesetzt und überprüft.
