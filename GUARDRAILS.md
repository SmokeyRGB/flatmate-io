# GUARDRAILS — Flatmate.io

### Verbindliche Regeln für AI-Agenten, die dieses Projekt implementieren

> **Version:** V0.6
> **Datum:** 2026-08-19
> **Autor:** Samuel Zink (@SmokeyRGB)
> **Vorgänger:** `00-Session-Brief.md` (verbindliche Quelle) · `05-ADRs.md` · `06-Compliance-Anhang.md`
> **Nachfolger:** `review-log.md`
> **Gilt für:** jede automatisierte oder halbautomatisierte Code-Änderung an Flatmate.io

---

> ## Adressat und Leitprinzip
>
> **Dieses Dokument richtet sich an AI-Agenten**, die Code für Flatmate.io schreiben, sowie an die
> Menschen, die deren Ergebnisse prüfen. Es beschreibt nicht, wie man gut programmiert, sondern
> welche Fehler in diesem Projekt **teuer** sind — weil sie personenbezogene Daten, eine
> Auskunftspflicht ([`06-Compliance-Anhang.md` §2](06-Compliance-Anhang.md)) oder eine
> Architekturgrenze berühren.
>
> **Leitprinzip: Jede Regel ist so weit wie möglich maschinell durchsetzbar** — als Lint-Regel,
> CI-Check oder Test, nicht als Prosa-Appell. Ein Appell an ein Sprachmodell, etwas nicht zu tun,
> ist keine Sicherheitsmaßnahme; er ist eine Bitte. Was nur als Prosa formulierbar ist, wird
> **ausdrücklich als solche gekennzeichnet**, damit kein falscher Eindruck von Absicherung
> entsteht.

### Lesart der Regeln

Jede Regel hat eine **ID**, eine **Regel**, eine **Begründung** und einen
**Durchsetzungsmechanismus** mit Klassenkennzeichnung:

| Klasse | Bedeutung |
|---|---|
| 🟢 **automatisiert** | CI oder Lint schlägt fehl. Die Regel wirkt, ohne dass jemand hinsieht. |
| 🟡 **teilautomatisiert** | Ein Werkzeug findet Kandidaten, ein Mensch entscheidet. Wirkt nur, wenn jemand hinsieht. |
| 🔴 **nur Prosa** | Keine maschinelle Durchsetzung möglich oder bekannt. Wirkt nur, wenn sie gelesen und befolgt wird. **Diese Regeln sind die Schwachstelle dieses Dokuments.** |

**Werkzeugnamen sind Vorschläge**, sofern sie nicht aus einem ADR stammen. Der Stack liegt in
ADR-006 (Next.js/TypeScript, Postgres, Drizzle, EU-Hosting, self-hosted Auth); konkrete Linter,
Scanner und Test-Runner sind beim Repo-Aufsetzen zu entscheiden. Ändert sich das Werkzeug, bleibt
die Regel — es ist dann ein **anderer Mechanismus** einzutragen, nicht die Regel zu streichen.

### Wenn eine Regel im Weg steht

**Eine Guardrail wird nicht umgangen, sondern gemeldet.** Wenn eine Aufgabe nur unter Verletzung
einer Regel lösbar scheint, ist das ein Befund über die Aufgabe oder über die Regel — nicht über
die Regel als Hindernis. Der Agent bricht ab, beschreibt den Konflikt und wartet auf eine
menschliche Entscheidung. Das gilt insbesondere für **G-C** (Autorisierung), **G-D** (geschützte
Tests) und **G-L** (KI-Grenze); dort ist Umgehung unter keinen Umständen zulässig.

Deaktivieren einer Regel — Lint-Ausnahme, `skip`, Schwellenwert senken, Check aus der CI nehmen —
ist selbst eine Änderung, die menschliche Freigabe braucht (**G-G3**).

---

## Inhalt

| Klasse | Thema | Regeln |
|---|---|---|
| [**G-A**](#g-a--secrets-und-zugangsdaten) | Secrets und Zugangsdaten | G-A1 – G-A5 |
| [**G-B**](#g-b--personenbezogene-daten) | Personenbezogene Daten | G-B1 – G-B7 |
| [**G-C**](#g-c--autorisierung-und-sichtbarkeit) | Autorisierung und Sichtbarkeit | G-C1 – G-C9 |
| [**G-D**](#g-d--geschützte-tests) | Geschützte Tests | G-D1 – G-D13 |
| [**G-E**](#g-e--datenbank-und-migrationen) | Datenbank und Migrationen | G-E1 – G-E5 |
| [**G-F**](#g-f--datenbestandsverzeichnis) | Datenbestandsverzeichnis | G-F1 – G-F3 |
| [**G-G**](#g-g--test--und-ci-disziplin) | Test- und CI-Disziplin | G-G1 – G-G5 |
| [**G-H**](#g-h--abhängigkeiten) | Abhängigkeiten | G-H1 – G-H6 |
| [**G-I**](#g-i--kontextgrenzen) | Kontextgrenzen | G-I1 – G-I3 |
| [**G-J**](#g-j--halluzinierte-apis-und-typsicherheit) | Halluzinierte APIs und Typsicherheit | G-J1 – G-J4 |
| [**G-K**](#g-k--solver-determinismus) | Solver-Determinismus | G-K1 – G-K4 |
| [**G-L**](#g-l--die-ki-grenze-p-5) | Die KI-Grenze (P-5) | G-L1 – G-L4 |
| [**G-M**](#g-m--scope-disziplin) | Scope-Disziplin | G-M1 – G-M3 |

---

## G-A · Secrets und Zugangsdaten

### G-A1 — Kein Secret im Repository

**Regel.** Keine API-Schlüssel, Datenbank-Passwörter, Session-Signaturschlüssel, SMTP-Zugangsdaten
oder Token im Repository — auch nicht in Kommentaren, Testdaten, Fixtures, Migrationen oder
Beispielkonfigurationen.

**Begründung.** Ein einmal committetes Secret ist über die Git-Historie dauerhaft kompromittiert,
auch nach dem Entfernen. Für einen Agenten ist ein funktionierender Schlüssel im Code der bequemste
Weg, einen Test grün zu bekommen — genau deshalb ist die Regel nötig.

**Durchsetzung.** 🟢 Secret-Scanning als **Pre-Commit-Hook und CI-Gate**; der Lauf umfasst den
gesamten Diff. Zusätzlich Push-Protection auf dem Remote, falls verfügbar.
*Werkzeugvorschlag: `gitleaks` oder `trufflehog`.*

### G-A2 — Konfiguration nur über Umgebungsvariablen, Vorlage nur als `.env.example`

**Regel.** Secrets kommen ausschließlich aus der Umgebung. Im Repository liegt **nur**
`.env.example` mit **leeren oder offensichtlich unechten** Werten (`DATABASE_URL=postgres://user:password@localhost:5432/flatmate`).
`.env`, `.env.local` und Varianten stehen in `.gitignore`.

**Begründung.** Trennt Konfiguration von Code und macht G-A1 überhaupt erst durchsetzbar.

**Durchsetzung.** 🟢 CI-Check: `.env*` außer `.env.example` verletzt `.gitignore` → Build bricht.
Zusätzlich Schema-Validierung der Umgebungsvariablen beim Anwendungsstart, damit fehlende Werte
sofort und laut scheitern statt still.

### G-A3 — Keine Secrets in Logs

**Regel.** Secrets, Session-Token, `password_hash`, `token_hash` und `Household.join_code`
erscheinen niemals in Logs, Fehlermeldungen, Stack-Traces oder Debug-Ausgaben.

**Begründung.** Logs werden weitergegeben, durchsucht und aufbewahrt — sie sind der zweithäufigste
Leckageweg nach dem Repository.

**Durchsetzung.** 🟢 Zentrale Redaktionsliste im strukturierten Logger (siehe G-B3); Feldnamen aus
dieser Regel stehen fest auf der Liste. Unit-Test, der den Logger mit einem Objekt füttert, das
alle gelisteten Felder enthält, und prüft, dass keiner der Werte in der Ausgabe erscheint.

### G-A4 — Kein Secret in einen Prompt

**Regel.** Ein Agent kopiert niemals den Inhalt einer `.env`-Datei, eines Deployment-Secrets oder
einer Produktions-Verbindungszeichenfolge in einen Prompt, eine Issue-Beschreibung, einen
Commit-Text oder eine Fehlermeldung nach außen.

**Begründung.** Der Weg existiert erst, seit Agenten Code schreiben, und ist von außen unsichtbar.

**Durchsetzung.** 🔴 **Nur Prosa.** Es gibt an dieser Stelle keinen Mechanismus im Repository, der
das verhindern könnte — die Regel wirkt nur, wenn sie befolgt wird. Die einzige technische
Absicherung ist, dass Agenten **keinen Zugriff auf Produktions-Secrets** erhalten.

### G-A5 — Der Beitrittscode verlässt niemals das System

**Regel.** `Household.join_code` erscheint **niemals** in einem Log — auch nicht im Zugriffslog —
und **niemals in einem Query-String**. Der Code wandert ausschließlich im Pfad des Einladungslinks
und im Anfragekörper. Er ist durch die organisierende Person **rotierbar**; die Rotation entwertet
ausstehende Einladungen.

**Begründung.** Der Code identifiziert einen Haushalt, keine Person — er steht deshalb in der
TOM-Liste, nicht im Art.-30-Verzeichnis
([`06-Compliance-Anhang.md` §11.2](06-Compliance-Anhang.md#112-vertraulichkeit--authentifizierung)).
Er ist aber **zugangsrelevant**: Wer ihn hat, kommt an Beratungsinhalte. Ein Query-String landet in
Browserverläufen, `Referer`-Headern und Server-Logs; ein Pfad landet im Zugriffslog. Beide Wege
machen aus einem rotierbaren Geheimnis ein dauerhaft protokolliertes.

**Durchsetzung.** 🟢
- Redaktionsliste des Loggers enthält `join_code` (G-B3).
- **Pfad-Redaktion im Zugriffslog für genau die Einladungsroute** — der Pfadabschnitt mit dem Code
  wird vor dem Schreiben durch `[redacted]` ersetzt. Unit-Test dafür.
- Lint-/Test-Regel: Der Beitrittscode darf in keinem `URLSearchParams`-Aufbau und in keiner
  Query-Zeichenkette auftauchen.

---

## G-B · Personenbezogene Daten

> Diese Klasse setzt [`06-Compliance-Anhang.md`](06-Compliance-Anhang.md) in Code um. Verstöße hier
> sind keine Codequalitätsprobleme, sondern potenzielle Datenschutzverletzungen.

### G-B1 — Keine echten Personendaten in Tests, Seeds oder Fixtures

**Regel.** Testdaten, Seed-Skripte und Fixtures enthalten **ausschließlich synthetische Daten**.
Keine echten Namen, keine echten E-Mail-Adressen, keine echten Telefonnummern, keine aus echten
Bewerbungen kopierten Freitexte — auch nicht „nur zum Ausprobieren", auch nicht die eigene
Adresse, auch nicht die von Mitbewohnenden.

**Begründung.** Ein aus einer echten WhatsApp-Nachricht kopierter Bewerbungstext in einer Fixture
ist eine Verarbeitung ohne Rechtsgrundlage — dauerhaft, öffentlich und mit hoher Wahrscheinlichkeit
inklusive Art.-9-Daten
([`06-Compliance-Anhang.md` §8](06-Compliance-Anhang.md#8--art-9--besondere-kategorien-im-freitext)).

**Durchsetzung.** 🟡 **Teilautomatisiert.**
- 🟢 Feste Domänenkonvention: Test-E-Mails enden auf `@example.test`, Testtelefonnummern beginnen
  mit `+49 30 23125` (Blocknummern). CI-Check über `**/fixtures/**`, `**/seeds/**` und
  Testdateien: jede E-Mail- oder Telefonnummern-artige Zeichenkette außerhalb dieser Muster bricht
  den Build.
- 🔴 Ob ein Freitext synthetisch ist, kann kein Werkzeug entscheiden. Verpflichtend ist deshalb ein
  **zentraler Fixture-Generator** (`test/factories/`) — Testdaten werden erzeugt, nicht getippt.
  Handgeschriebene Freitexte in Fixtures sind im Review zu begründen.

### G-B2 — Keine Produktionsdaten in Entwicklungs- oder Testumgebungen

**Regel.** Kein Dump, kein Teil-Dump und keine „anonymisierte" Kopie einer Produktionsdatenbank
gelangt in eine lokale oder in eine Testumgebung.

**Begründung.** Anonymisierung von Freitext funktioniert in der Praxis nicht — die
Wiedererkennbarkeit steckt im Inhalt, nicht im Namensfeld.

**Durchsetzung.** 🟡 Kein Skript im Repository, das Produktionsdaten kopiert oder wiederherstellt;
CI-Check auf verbotene Muster in Skripten (`pg_dump` mit Produktions-Host, `pg_restore` in eine
lokale Datenbank). Organisatorisch: Produktions-Zugangsdaten sind für Agenten nicht verfügbar
(vgl. G-A4).

### G-B3 — Keine PII in Logs

**Regel.** Anwendungs- und Sicherheitsprotokolle enthalten **keine personenbezogenen Daten**.
Geloggt werden **IDs, keine Inhalte**: `application_id` statt `applicant_name`, `note_id` statt
`body`, `profile_id` statt E-Mail-Adresse.

**Begründung.** Betriebsprotokolle liegen bei Flatmate.io als eigenem Verantwortlichem
([`06-Compliance-Anhang.md` §6.5](06-Compliance-Anhang.md#65-kontexte-notifications-und-audit)),
haben eine eigene Frist und werden von der Löschautomatik des Haushalts **nicht** erfasst. Ein
Notiztext im Log überlebt die Löschung der Notiz — und unterläuft damit das gesamte Löschkonzept.

**Durchsetzung.** 🟢
1. **Strukturiertes Logging ist Pflicht.** `console.log` ist per Lint-Regel im Anwendungscode
   verboten; es gibt genau einen Logger.
2. Der Logger führt eine **Redaktionsliste** von Feldnamen (`applicant_name`, `contact_email`,
   `contact_phone`, `contact_other`, `message_raw`, `decision_note`, `rejection_reason`,
   `subject_statement`, `body`, `reason`, `email`, `location`, `raw_input`, `retention_extensions`,
   plus die Secrets aus G-A3 und den `join_code` aus G-A5). Gelistete Felder werden vor der Ausgabe
   durch `[redacted]` ersetzt.
3. **Die Redaktionsliste wird aus `data-inventory.yml` generiert** (ADR-010): Jedes Feld der
   Kategorien `FREITEXT`, `BEURTEILUNG`, `KONTAKT`, `STAMM` und `AUTH` landet automatisch darauf.
   Damit erweitert eine neue personenbezogene Spalte die Redaktion **von selbst** und kann nicht
   vergessen werden.
4. Unit-Test wie in G-A3.

### G-B4 — Keine PII an externe Dienste

**Regel.** Fehler-Tracker, Monitoring, Analyse-Dienste und Modellanbieter erhalten **keine**
personenbezogenen Daten. Fehlerberichte enthalten Stack-Trace und IDs, keine Nutzdaten. Kein
Drittanbieter-Skript im Frontend.

**Begründung.** Jeder externe Empfänger ist ein Unterauftragsverarbeiter, der in die AVV gehört und
den Haushalten offengelegt werden muss
([`06-Compliance-Anhang.md` §1.3](06-Compliance-Anhang.md#13-was-daraus-folgt)). Ein still
hinzugefügter Dienst ist ein stiller Vertragsbruch. Zusätzlich hängt an dieser Regel die
Cookie-Freiheit der Anwendung
([`06-Compliance-Anhang.md` §10.2](06-Compliance-Anhang.md#102-kein-tracking)).

**Durchsetzung.** 🟢
- Fehler-Tracker mit `beforeSend`-Filter, der über dieselbe generierte Redaktionsliste läuft wie
  der Logger (G-B3); Unit-Test dafür.
- **Content-Security-Policy** ohne externe Hosts, im CI gegen die ausgelieferte Seite geprüft.
- Neue ausgehende Netzwerkziele erfordern einen Eintrag in der Unterauftragsverarbeiter-Liste;
  CI-Check auf neue Hosts in CSP und Konfiguration (vgl. G-H1).

### G-B5 — Personenbezogene Daten nur im zuständigen Kontext

**Regel.** Ein Bounded Context liest keine personenbezogenen Felder eines anderen Kontexts direkt
aus der Datenbank. Der Austausch läuft über Domain-Events und explizite Schnittstellen
(ADR-001, G-I).

**Begründung.** Die Kontextgrenze ist zugleich die Grenze der Zweckbindung. `notifications`, das
direkt in `CastingNote` liest, ist der wahrscheinlichste Weg, wie Beratungsinhalte in einer E-Mail
an die falsche Person landen.

**Durchsetzung.** 🟢 Import-Boundary-Lint (G-I1) plus getrennte Datenbankrollen je Kontext, sofern
umsetzbar. 🟡 Review für Fälle, die der Lint nicht sieht (z. B. rohes SQL).

### G-B6 — Kein personenbezogenes Datum in den Gerätecache

**Regel.** Der Service Worker cacht **ausschließlich die App-Hülle** — Markup, Skripte, Stile,
Icons, Schriften. **Niemals API-Antworten, niemals Bewerber- oder Beratungsdaten.** Kein
Runtime-Cache mit Netzwerk-Fallback über Datenrouten, kein „Stale-While-Revalidate" auf
`/api/**`, keine Offline-Persistenz von Anwendungsdaten in IndexedDB oder Cache Storage.

**Genau eine Ausnahme:** der Offline-Puffer für abgegebene Stimmen (**G-B7**). Sie gilt für
ausgehende Transaktionsnutzlast, nicht für eingehende Daten — und für nichts sonst.

**Begründung.** Die Löschautomatik erreicht den Server, **nicht das Endgerät**. Läge eine
`Application` im Cache von fünf Bewohnenden, wäre sie nach 180 Tagen serverseitig gelöscht und auf
den Geräten weiterhin vorhanden — außerhalb der Reichweite jedes Löschjobs und ohne dass es
irgendwo auffiele. ADR-011 (PWA) würde damit das Löschkonzept aus
[`06-Compliance-Anhang.md` §5](06-Compliance-Anhang.md#5--speicherbegrenzung-und-löschkonzept)
unterlaufen, ohne dass eine der beiden Entscheidungen für sich falsch wäre.

> „Offline" heißt in Flatmate.io: **die App startet ohne Netz.** Es heißt nicht: die Daten sind ohne
> Netz da.

Der wahrscheinliche Fehler ist hier **kein Entschluss, sondern eine Konfigurationszeile** — ein
großzügig gefasster Runtime-Cache, weil das die Standardempfehlung jeder PWA-Anleitung ist. Genau
diese Sorte Fehler ist der Grund, warum die Regel maschinell durchgesetzt wird.

**Durchsetzung.** 🟢
- Die Cache-Konfiguration führt eine **Positivliste** statischer Muster; ein Eintrag, der
  `/api/**` oder eine Datenroute trifft, bricht den Build.
- Test gegen den generierten Service Worker: Eine Datenroute wird angefragt und darf **keinen**
  Cache-Eintrag hinterlassen.
- Die Konfigurationsdatei steht unter CODEOWNERS (G-G3).

### G-B7 — Der Offline-Stimmpuffer kann den Versand nicht überleben

**Regel.** Der Offline-Puffer für abgegebene Stimmen ist die **einzige** Ausnahme von G-B6. Er ist
zulässig, weil er eine **noch nicht abgeschlossene Transaktion** hält und keine gespeicherte Kopie —
und nur so lange, wie das eine **erzwungene Eigenschaft** ist. Sechs Zusicherungen, alle mechanisch
prüfbar:

| # | Zusicherung |
|---|---|
| 1 | **Höchstlebensdauer 7 Tage**, unabhängig vom Versanderfolg; danach Verwerfen und Hinweis |
| 2 | **Nur `application_id`, Wert, Rundenstufe** — keine Anzeigedaten, kein Name, keine denormalisierte Karte |
| 3 | **Verwerfen statt Wiederholen** bei serverseitiger Ablehnung; kein Bewerbername in der Fehlermeldung |
| 4 | **Leeren bei Abmeldung und Sitzungsentzug** |
| 5 | **Leeren beim Profilwechsel** — der Wechsel zwischen Verwaltungs- und Bewohnerkontext ist keine Abmeldung |
| 6 | **Idempotente Wiedereinspielung** — Schlüssel (`application_id`, `resident_profile_id`, `round_number`), Überschreiben statt Anfügen |

**Begründung.** Zusicherung 1 ist die tragende: Ohne harte Höchstlebensdauer hält ein Gerät, das
offline geht und Monate später zurückkommt, eine Beurteilung über eine Bewerbung, deren Daten
serverseitig längst gelöscht sind — dasselbe Leck, das G-B6 schließt, nur durch die Hintertür.
Zusicherung 2 hält den Puffer auf der richtigen Seite der Grenze: Sobald er speichert, *wem* die
Stimme galt, ist er eine Datenkopie.

Zusicherung 6 ist keine Formalie. Eine doppelt eingespielte Stimme verschiebt Score **und**
Quorum-Nenner, und beides sind auskunftspflichtige Beurteilungsdaten. Ein Duplikat ist damit ein
**falsches Datum über eine Person**, nicht bloß ein Zählfehler — und das verschiebt die Frage von
sauberer Arithmetik zu **Art. 5 Abs. 1 lit. d (Richtigkeit)**. Praktische Folge: Die betroffene
Person bekäme die Doppelstimme in einer Auskunft nach Art. 15 zu sehen und hätte nach **Art. 16**
einen Berichtigungsanspruch auf eine Stimme, die nie zweimal abgegeben wurde. Der Schlüssel
(`application_id`, `resident_profile_id`, `round_number`) löst das an der **Datenstruktur** statt in
der Sendelogik — deshalb ist er die richtige Bauform.

**Durchsetzung.** 🟢
- **Puffer-Nutzlast als Schema mit Positivliste** — dieselbe Mechanik wie G-D7 bei
  `ActivityEvent.payload`: Ein Eintrag mit einem nicht gelisteten Schlüssel wird abgelehnt, nicht
  gespeichert. Deckt die Zusicherungen 2 und 3.
- **Test auf die Höchstlebensdauer:** Ein Eintrag mit Zeitstempel älter als 7 Tage wird beim nächsten
  Start verworfen und nicht versendet. Deckt Zusicherung 1.
- **Test auf Abmeldung und Profilwechsel:** Nach beiden Vorgängen ist der Puffer leer. Deckt die
  Zusicherungen 4 und 5.
- **Idempotenztest:** Dieselbe Nutzlast zweimal eingespielt erzeugt **einen** `Vote` und verändert
  den Quorum-Nenner nicht. Deckt Zusicherung 6.

Die Tests zu den Zusicherungen 1, 5 und 6 sind **geschützte Tests** (G-D11) — sie sind die drei, bei
denen ein Fehler still bleibt und erst in den Daten auffällt.

---

## G-C · Autorisierung und Sichtbarkeit

> **Härteste Klasse dieses Dokuments.** ADR-004 erzwingt Autorisierung **zweifach** — zentrale
> Policy-Objekte **und** Postgres Row-Level-Security. Die Begründung stammt direkt aus dem
> AI-Kontext: Vergisst ein Agent ein `WHERE household_id = …`, liefert die Datenbank trotzdem
> nichts. Diese zweite Verteidigungslinie darf nicht durchlöchert werden.

### G-C1 — Die Policy-Schicht wird nie umgangen

**Regel.** Jeder Datenzugriff auf personenbezogene Tabellen läuft durch die zentralen
Policy-Objekte. Kein direkter Query-Aufruf aus einer Route, einem Server-Component oder einem
Job-Handler an diesen vorbei.

**Begründung.** Eine Autorisierung, die an fünf Stellen wiederholt wird, ist an fünf Stellen
vergessbar.

**Durchsetzung.** 🟢 Architektur-Lint: Der Datenbank-Client ist außerhalb der Repository- und
Policy-Schicht nicht importierbar (Modulgrenze, gleiche Mechanik wie G-I1). Verstoß = Lint-Fehler
= CI rot.

### G-C2 — Row-Level-Security wird nie deaktiviert

**Regel.** `ALTER TABLE … DISABLE ROW LEVEL SECURITY`, `FORCE`-Umgehungen, Verbindungen als
Tabelleneigentümer oder als Superuser im Anwendungspfad sind verboten. Die Anwendung verbindet sich
mit einer Rolle, für die RLS **gilt**.

**Begründung.** RLS ist die einzige Schutzschicht, die auch dann noch wirkt, wenn der
Anwendungscode falsch ist. Sie „vorübergehend" zu deaktivieren, um einen Test grün zu bekommen,
entfernt genau die Absicherung, die für AI-generierten Code eingebaut wurde.

**Durchsetzung.** 🟢
- CI-Check über alle Migrationen: Vorkommen von `DISABLE ROW LEVEL SECURITY` → Build bricht.
- **Positiv-Check:** Ein Test iteriert über alle Tabellen mit `household_id` und prüft, dass RLS
  aktiviert ist und mindestens eine Policy existiert. Eine neue Tabelle ohne RLS bricht den Build,
  ohne dass jemand daran denken muss.
- Der Anwendungsbenutzer der Datenbank ist nicht Eigentümer der Tabellen — strukturell, nicht per
  Konvention.

### G-C3 — Jede neue Query gegen personenbezogene Tabellen braucht einen Policy-Test

**Regel.** Wird eine neue Abfrage oder ein neues Repository-Verfahren gegen eine personenbezogene
Tabelle eingeführt, entsteht im selben Commit ein Test, der prüft: Zugriff aus dem **falschen**
`Household` liefert leer, Zugriff ohne Rundenteilnahme liefert leer, Zugriff des betroffenen
Profils auf eigene Beratungsartefakte liefert leer (G-D1).

**Begründung.** Autorisierungsfehler sind still. Sie erzeugen keinen Fehler, sondern zu viele
Ergebnisse.

**Durchsetzung.** 🟡 CI-Check auf Coverage der Repository-Schicht (Schwelle nach G-G4) plus
Review-Pflicht. 🔴 Dass der Test die *richtigen* Fälle prüft, ist maschinell nicht feststellbar —
deshalb liegt der Kern dieser Absicherung in den geschützten Tests (G-D).

### G-C4 — Kein `as any`, kein `@ts-expect-error`, kein `eslint-disable` zur Umgehung

**Regel.** In Policy-, Repository- und Domänenschicht sind `as any`, `as unknown as`,
`@ts-ignore`, `@ts-expect-error` und `eslint-disable` **verboten**. In anderen Schichten sind sie
begründungspflichtig.

**Begründung.** Der Typ ist an dieser Stelle Teil der Autorisierung: Wenn eine Funktion einen
`AuthorizedContext` verlangt, ist `as any` genau die Umgehung, die die Schicht wertlos macht. Es
ist zugleich der Standardgriff eines Agenten unter Zeitdruck.

**Durchsetzung.** 🟢 Lint-Regel mit Pfad-Geltungsbereich; `eslint-disable` für diese Regel selbst
ist gesperrt (G-G3). TypeScript im `strict`-Modus, `noImplicitAny` aktiv.

### G-C5 — `household_id` ist nicht optional

**Regel.** Jede personenbezogene Tabelle führt `household_id NOT NULL` mit Fremdschlüssel. Kein
Modell und keine Query behandelt es als optional.

**Begründung.** Es ist der Schlüssel, an dem RLS und Policy hängen. Ein `null` darin ist ein Leck
in beiden Schichten gleichzeitig.

**Durchsetzung.** 🟢 Derselbe Schema-Test wie in G-C2: Jede Tabelle, die in `data-inventory.yml`
personenbezogene Felder deklariert, muss `household_id NOT NULL` besitzen.

### G-C6 — Benachrichtigungen unterliegen derselben Sichtbarkeitspolicy

**Regel.** Der Inhalt einer `Notification` durchläuft dieselbe Sichtbarkeitsprüfung wie die
Oberfläche — insbesondere die Selbst-Redaktions-Invariante und die Rundensichtbarkeit. Es gibt
keinen „internen" Pfad, der sie überspringt.

**Begründung.** E-Mail verlässt das System. Ein Leck hier ist nicht zurückholbar, und der
Fan-out-Pfad ist die Stelle, an der die Prüfung am leichtesten vergessen wird.

**Durchsetzung.** 🟢 Geschützter Test G-D5.

### G-C7 — Jede Sichtbarkeitsinvariante wird **zweimal** getestet

**Regel.** Die Sichtbarkeitsinvarianten **V-1 bis V-3** aus `04-Domaenenmodell.md` — allen voran die
Selbst-Redaktion (V-1) — werden **auf zwei Wegen** geprüft:

1. **Über die Policy-Schicht** — der normale Anwendungspfad.
2. **Als rohes SQL** gegen dieselben Tabellen, unter der Anwendungsrolle und mit gesetztem
   Sitzungskontext, ohne die Policy-Schicht zu berühren.

Beide Wege müssen leer liefern. Ein Test, der nur den ersten Weg prüft, genügt nicht.

**Begründung.** ADR-004 erzwingt Autorisierung **zweifach** — Policy-Objekte *und*
Row-Level-Security. Wenn nur der Policy-Pfad getestet wird, ist die zweite Verteidigungslinie
**ungetestet und damit eine Illusion**: Sie könnte längst nicht mehr greifen, und niemand würde es
merken, weil der erste Pfad die Prüfung abfängt. Genau der Fall, für den RLS eingebaut wurde — ein
Agent vergisst ein `WHERE household_id = …` — ist dann nicht abgedeckt.

**Durchsetzung.** 🟢 Für jede der drei Invarianten stehen **zwei** Einträge in
`test/guarded.manifest.json` (`…via_policy` und `…via_raw_sql`). Fehlt einer, bricht der Build.

> ### Wiederkehrende Fehlerstelle: der Profilwechsel
>
> Der Wechsel zwischen Verwaltungs- und Bewohnerkontext ist eine **ausdrücklich vorgesehene
> Funktion und keine Abmeldung**. An genau dieser Stelle sind in der Dokumentationsphase **zweimal
> unabhängig voneinander** Annahmen gebrochen:
>
> 1. Die Selbst-Redaktion (V-1) hängt deshalb am **`Account`**, nicht am aktiven Profil — sonst
>    ließe sie sich durch einen Kontextwechsel aushebeln.
> 2. Der Offline-Stimmpuffer wird deshalb auch **beim Profilwechsel** geleert, nicht nur bei der
>    Abmeldung (G-B7, Zusicherung 5) — sonst hält der Kontext von Profil B die Stimmen von Profil A.
>
> **Für jede neue zustandsbehaftete Komponente gilt daher die Prüffrage: Was passiert damit beim
> Profilwechsel?** Sie ist nicht maschinell erzwingbar 🔴, aber sie ist billig zu stellen — und sie
> hat bereits zwei reale Lecks gefunden, beide erst bei einer Querprüfung und keines durch einen
> Mechanismus.

### G-C8 — `SET LOCAL` nur innerhalb einer Transaktion

**Regel.** Der Sitzungskontext, aus dem RLS den aktuellen `household_id` und das aktuelle
`resident_profile_id` liest, wird **ausschließlich per `SET LOCAL` innerhalb einer offenen
Transaktion** gesetzt. Niemals `SET` ohne `LOCAL`, niemals außerhalb einer Transaktion, niemals in
einem Verbindungs-Setup-Hook.

**Begründung.** Dies ist der **subtilste Fehler in der gesamten Sicherheitsarchitektur**, weil er ein
Leck **durch die Sicherheitsmaßnahme hindurch** erzeugt. Bei Connection Pooling wird dieselbe
physische Verbindung nach der Anfrage an die nächste Anfrage weitergegeben. Ein mit `SET` gesetzter
Wert bleibt an der **Verbindung** haften; ein mit `SET LOCAL` gesetzter Wert endet mit der
**Transaktion**.

Die Folge ohne `LOCAL`: Anfrage B erbt den Haushaltskontext von Anfrage A — und RLS arbeitet dann
korrekt, aber mit **dem falschen Haushalt**. Das Ergebnis ist eine Mandantengrenze, die genau dann
versagt, wenn Last herrscht, die in Tests mit einer einzigen Verbindung **nie** auffällt und deren
Symptom „fremde Bewerbungen im eigenen Haushalt" lautet.

**Durchsetzung.** 🟢
- Der Sitzungskontext ist **nur** über eine einzige Hilfsfunktion setzbar, die eine Transaktion
  eröffnet; direkte `SET`-Aufrufe sind per Lint-Regel gesperrt.
- CI-Check: Vorkommen von `SET ` ohne `LOCAL` in Anwendungs- und Repository-Code bricht den Build.
- **Pool-Wiederverwendungstest:** Zwei Anfragen aus verschiedenen Haushalten laufen nacheinander
  über **dieselbe** Verbindung; die zweite darf nichts von der ersten sehen. Als geschützter Test
  geführt (G-D10).

### G-C9 — Die Datenschutzseite wird nie ohne Freigabe erreichbar

**Regel.** Die Art.-13-Datenschutzseite eines `Household` ist im Zustand `draft` über **keinen**
Codepfad erreichbar — nicht über den Token-Link, nicht über eine Vorschau-Route, nicht über einen
Deep-Link. Der Übergang zu `published` erfolgt ausschließlich durch die ausdrückliche Freigabeaktion
der organisierenden Person und erzeugt ein `ActivityEvent` mit der freigegebenen Textversion.

**Begründung.** Der Seiteninhalt ist eine **rechtliche Erklärung im Namen eines Dritten**. Flatmate.io
darf sie als Auftragsverarbeiter **vorbereiten**, aber nicht veröffentlichen — täte es das, würde es
seine Rolle überschreiten und **für diesen Inhalt selbst verantwortlich** werden, im Widerspruch zur
Rollenkonstruktion aus
[`06-Compliance-Anhang.md` §1.2](06-Compliance-Anhang.md#12-wer-ist-verantwortlicher-wer-auftragsverarbeiter).
Für einen Agenten ist „die Seite direkt ausliefern" der kürzeste Weg zu einer funktionierenden
Route — und genau deshalb braucht die Freigabe einen Mechanismus statt einer Konvention.

**Durchsetzung.** 🟢 Der Zustand ist Teil des Rückgabetyps: Die Render-Funktion nimmt einen
`PublishedPrivacyNotice`, der nur aus einem freigegebenen Datensatz konstruierbar ist — ein `draft`
lässt sich nicht ausliefern, weil er nicht in den Typ passt. Zusätzlich ein Policy-Test je Route
gegen den `draft`-Zustand (G-C3). Typsystem statt Prüfung an jeder Route.

---

## G-D · Geschützte Tests

> **Definition.** Ein *geschützter Test* prüft eine Invariante, deren Verletzung nicht als Bug
> auffällt, sondern als Datenschutzverletzung oder als zerstörtes Vertrauen. Er darf **nicht
> gelöscht, nicht übersprungen und nicht abgeschwächt** werden.

### Mechanismus

1. **Marker.** Jeder geschützte Test trägt in der Testbeschreibung das Präfix `[GUARDED]` und
   darüber einen Kommentar `// GUARDRAIL: <Regel-ID> — siehe GUARDRAILS.md`.
2. **Existenz-Check.** Die CI führt eine Liste der erwarteten geschützten Tests
   (`test/guarded.manifest.json`: Regel-ID → Testdatei → Testname). Fehlt einer, bricht der Build.
   Ein gelöschter Test ist damit **kein grüner Lauf**, sondern ein roter.
3. **Kein `skip`.** CI-Check: `it.skip`, `test.skip`, `describe.skip`, `it.only`, `.todo` oder ein
   auskommentierter Testkörper in einer Datei mit `[GUARDED]` → Build bricht.
4. **Änderungssperre.** Eine Änderung an `test/guarded.manifest.json` oder an einer geschützten
   Testdatei erfordert **menschliche Freigabe** (CODEOWNERS auf diesen Pfaden). Ein Agent darf
   geschützte Tests **hinzufügen**, aber nicht ändern oder entfernen.

**Durchsetzung.** 🟢 für Existenz, Marker, `skip` und Freigabepflicht.
🔴 Dass ein Test *inhaltlich* nicht abgeschwächt wird — Assertion aufgeweicht, Testfall
entschärft —, ist maschinell nicht feststellbar. Dagegen hilft nur die Freigabepflicht in Schritt 4
und ein Mensch, der den Diff liest. **Diese Lücke wird hier offen benannt, nicht kaschiert.**

### Die geschützten Invarianten

| ID | Invariante | Was der Test prüft |
|---|---|---|
| **G-D1** | **Selbst-Redaktion** — niemand liest Beratungsinhalte über sich selbst, dauerhaft und unabhängig vom Rundenstatus | Für ein `ResidentProfile` mit zugehöriger `Application` (`became_resident_id`) liefern alle Lesepfade auf `Vote`, `Veto`, `CastingNote`, Score, Ranglistenposition und Stimmungsbild **leer** — über die Policy-Schicht **und** direkt gegen die Datenbank unter der Anwendungsrolle (RLS). Auch bei wiedereröffneter Runde und bei Wiederbewerbung. |
| **G-D2** | **Quorum-Verhalten** | Kandidaten unter Quorum erscheinen **nicht** in der Rangliste, sondern im Abschnitt „Warten auf Stimmen". Ausgezogene Mitglieder (`moved_out`) werden aus dem Quorum-**Nenner offener Runden** herausgerechnet, ihre Stimmen **zählen** aber in abgeschlossenen Runden weiter. |
| **G-D3** | **Zustandsübergänge** | Nur in der Übergangstabelle deklarierte Übergänge sind ausführbar (ADR-002); jeder Übergang — auch der rückwärtsgerichtete (P-4) — erzeugt genau ein `ActivityEvent` mit `actor_account_id` **und** `actor_profile_id`. Undeklarierte Übergänge scheitern. |
| **G-D4** | **Löschvollständigkeit — in einer Transaktion** | Das Löschen einer `Application` entfernt **in einem Zug** alle verknüpften `Vote`, `Veto`, `CastingNote`, `AvailabilityWindow`, `Appointment` **sowie `subject_statement`, `decision_note` und `rejection_reason`**; es bleiben keine Waisen und **kein Feld mit eigener Frist** (G-E5). Der `ActivityEvent`-Satz bleibt als Tombstone erhalten und enthält **keine** Inhalte ([`06-Compliance-Anhang.md` §5.6](06-Compliance-Anhang.md#56-konflikt-löschung-vs-rechenschaftspflicht)). |
| **G-D5** | **Kein Leck über Benachrichtigungen** | Eine `Notification`, deren Inhalt Beratungsartefakte über die empfangende Person selbst enthielte, wird nicht erzeugt oder nicht zugestellt (G-C6). |
| **G-D6** | **Auskunftsexport ist vollständig und sauber abgegrenzt** | Der Export zu einer `Application` enthält alle Felder aus [`06-Compliance-Anhang.md` §3.3](06-Compliance-Anhang.md#33-feature-datenauskunft-erzeugen-pro-application) — **inklusive `Veto.reason`**, dessen Inhalt offengelegt wird —, **keine** Daten anderer Bewerbender und **keine** Urheberschaft von Stimmen, Vetos oder Notizen. |
| **G-D7** | **Kein Freitext, kein Wert in `ActivityEvent.payload`** | Der Payload wird gegen eine **Positivliste erlaubter Schlüssel je `event_type`** validiert. Ein Beratungsereignis darf **nur Referenzen und Zähler** tragen — `{application_id, votes_cast: 5}` ist erlaubt, `{value: "no"}` und jeder Freitext sind es nicht. Der Test versucht, ein Ereignis mit Wert und mit Freitext zu schreiben, und erwartet Ablehnung. |
| **G-D8** | **Payload-Redaktion zum Fristende** | Nach Ablauf der Aufbewahrungsfrist sind die personenbeziehbaren Payload-Felder `null`, **Struktur und Zeitstempel stehen weiter**, und die Rechenschaftskette ist noch lesbar (wer, wann, welche Art von Handlung). |
| **G-D9** | **`became_resident_id` wird nie auf `null` gesetzt** | Der Rückwärtsübergang `moved_in → offer_made` (P-4) und jeder andere Pfad lassen das Feld unberührt. Der Test führt den Rückweg aus und prüft, dass V-1 danach **weiter greift**. |
| **G-D10** | **Kein Kontext-Leck über den Verbindungspool** | Zwei Anfragen aus verschiedenen Haushalten laufen nacheinander über **dieselbe** physische Verbindung; die zweite sieht nichts von der ersten (G-C8). |
| **G-D11** | **Der Offline-Stimmpuffer überlebt den Versand nicht** | Drei Prüfungen aus G-B7, jede scheitert sonst still: Ein Eintrag älter als **7 Tage** wird verworfen statt versendet; nach einem **Profilwechsel** ist der Puffer leer; dieselbe Nutzlast **zweimal** eingespielt erzeugt einen `Vote` und lässt den Quorum-Nenner unverändert. |
| **G-D12** | **Invite-Token-Einlösung schlägt bei bestehendem `ResidentProfile` fehl, statt zu überschreiben** | Für eine `Session`, deren `Account` im Ziel-`Household` bereits ein `ResidentProfile` hat, liefert das Einlösen eines gültigen `ApplicationInviteToken` (nicht `expires_at`, nicht `used_at`, nicht `revoked_at`) einen erklärten Fehler ("Du bist bereits als Bewohner:in registriert") statt eines Ergebnisses. Kein Merge, keine Überschreibung, kein stiller No-op; `became_resident_id` der betroffenen `Application` bleibt unverändert. Ergänzt G-D9 um den *Prozess*-Fall — G-D9 sichert den *Datenzustand* (nie `null`), G-D12 sichert den *Weg dorthin* (kein zweiter Durchlauf, der ihn überschreibt). |
| **G-D13** | **Der Notiz-Erinnerungs-Reminder respektiert Selbst-Redaktion** | Für ein `Appointment`, dessen `Application` für die Empfängerin/den Empfänger selbst-redigiert ist (V-1, G-D1), wird `casting.note_reminder_due` weder erzeugt noch zugestellt — unabhängig vom Stand des `AppointmentAttendance.note_written`-Flags. Der Reminder liest zur Entscheidung ausschließlich dieses Flag, nie `CastingNote.body` (G-B5 bleibt insoweit unverändert in Kraft). |

> **G-D1 ist die wichtigste Zeile dieses Dokuments.** Sie ist die eine testbare Regel, die im Brief
> ausdrücklich an die Stelle einer Statusabfrage gesetzt wurde, „die man an fünf Stellen vergessen
> kann". Wer sie aufweicht, stellt die Statusabfrage wieder her — nur unsichtbar.
>
> **Und sie hat eine benannte Grenze: G-D1 deckt nur *verknüpfte* Bewerbungen ab.**
> `Application.became_resident_id` ist n:1 und wird manuell gesetzt. Wer sich vor zwei Jahren
> erfolglos beworben hat und diesmal einzieht, hat zwei `Application`-Datensätze; ist nur der neue
> verknüpft, **leckt der alte genau das, was V-1 verhindern soll**. Die Lücke ist prozessual, nicht
> technisch, und mit einem Test nicht schließbar
> ([`06-Compliance-Anhang.md` §3.4](06-Compliance-Anhang.md#34-lücke-die-selbst-redaktion-schützt-nur-verknüpfte-bewerbungen),
> offene Frage Q-14). **Dieser Satz steht hier, weil ein Test, der eine Teilmenge prüft und
> Vollständigkeit suggeriert, schlimmer ist als kein Test.**

> **Warum G-D7 bis G-D9 überhaupt hier stehen.** ADR-003 (append-only Ereignis-Log) hatte in der
> Erstfassung dieses Dokuments **keine einzige Referenz**. Die Log-Regeln standen damit in
> `04-Domaenenmodell.md` und `06-Compliance-Anhang.md` als Architektur- und Rechtsaussage, aber
> nirgends als prüfbare Zusicherung — genau die Konstellation, gegen die die Durchsetzungsklassen
> dieses Dokuments gebaut sind. Ohne G-D7 ist der Satz „das Log ist kein Umweg um V-1" eine
> Behauptung; mit G-D7 ist er eine Eigenschaft.

> **Herkunft von G-D12 und G-D13.** Beide Einträge sichern Regeln ab, die `04-Domaenenmodell.md` mit
> zwei neuen Entitäten aus dem SRD-Scope einführt: `ApplicationInviteToken` (**S-42**, Kontext
> `identity`) und `AppointmentAttendance` (**S-46**, Kontext `casting`, Event-Typ
> `casting.note_reminder_due`). Beide Regeln laufen über einen **neuen** Pfad auf eine **bestehende**
> Invariante zu — I-3 im Fall von G-D12 (Anschluss an G-D9), V-1 im Fall von G-D13 (Anschluss an
> G-D1/G-C6/G-D5) — und wären ohne eigenen Eintrag genau dort ungeschützt, wo die alten Pfade längst
> abgesichert sind: G-D9 prüft den *Datenzustand*, nicht den *Registrierungsvorgang*; G-D5 prüft
> Benachrichtigungen, deren *Inhalt* Beratungsartefakte enthielte, nicht eine Benachrichtigung, die
> allein durch ihre Zustellung Teilnahme an einer Beurteilung verrät. Dieselbe Konstellation wie bei
> G-D7 bis G-D9 (siehe oben): Eine Regel, die nur in der Fachspezifikation steht, kann keinen Build
> brechen.

---

## G-E · Datenbank und Migrationen

### G-E1 — Destruktives DDL nur mit menschlicher Freigabe

**Regel.** `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `ALTER COLUMN … TYPE` mit möglichem
Datenverlust und `DELETE` ohne `WHERE` in einer Migration erfordern **ausdrückliche menschliche
Freigabe**. Ein Agent erzeugt eine solche Migration nicht ohne Auftrag und führt sie nie
selbstständig gegen eine Umgebung mit echten Daten aus.

**Begründung.** Der häufigste Weg eines Agenten, einen Schema-Konflikt zu lösen, ist, die störende
Spalte zu entfernen. In diesem Projekt steht in dieser Spalte möglicherweise die einzige Kopie
einer Casting-Notiz.

**Durchsetzung.** 🟢 CI-Check über neue Dateien im Migrationsverzeichnis auf destruktive Muster;
Treffer markiert den Lauf als freigabepflichtig und CODEOWNERS blockiert das Zusammenführen.

### G-E2 — Migrationen laufen vorwärts und rückwärts

**Regel.** Jede Migration hat ein funktionierendes `down`. Wo eine Rückwärtsmigration Daten
verlöre, wird das im Migrationskopf dokumentiert — und die Migration wird nach G-E1 behandelt.

**Begründung.** P-4 (Reversibilität) gilt nicht nur für Pipeline-Zustände.

**Durchsetzung.** 🟢 CI: `migrate up` → `migrate down` → `migrate up` gegen eine leere Datenbank.
Schema-Vergleich vor und nach dem Zyklus muss identisch sein.

### G-E3 — Schema-Änderung nur über Migrationen

**Regel.** Kein Schema-Zustand entsteht durch `db push`, manuelles SQL gegen eine laufende
Umgebung oder Schema-Synchronisierung zur Laufzeit. Die Migrationskette ist die einzige Wahrheit.

**Begründung.** Ein Schema, das nur in einer Umgebung existiert, macht jeden Compliance-Nachweis
wertlos — auch das `data-inventory.yml`-Gate (G-F).

**Durchsetzung.** 🟢 CI-Check: Schema aus der Migrationskette gegen die deklarierten Modelle;
Abweichung bricht den Build (Drift-Erkennung).

### G-E4 — Keine Änderung an bereits ausgelieferten Migrationen

**Regel.** Eine Migration, die in einer Umgebung gelaufen ist, wird nicht mehr bearbeitet. Fehler
werden durch eine neue Migration korrigiert.

**Begründung.** Nachträglich bearbeitete Migrationen erzeugen divergierende Schemata, deren
Symptome erst Wochen später auftreten.

**Durchsetzung.** 🟢 CI-Check auf Änderungen an bestehenden Migrationsdateien im Diff (Prüfsumme
je Datei).

### G-E5 — Löschung ist atomar, und kein Feld hat eine eigene Frist

**Regel.** Es gibt **einen Zeitgeber pro `Application`** (`Application.retention_until`), nicht einen
pro Feld. Alle personenbezogenen Felder und alle daran hängenden Beratungsartefakte —
`subject_statement`, `decision_note`, `rejection_reason`, `Vote`, `Veto`, `CastingNote`,
`AvailabilityWindow`, `Appointment` — werden in **einer Transaktion** gelöscht. Kein zweiter
Aufbewahrungsjob, keine abweichende Feldfrist.

**Begründung.** Getrennte Fristen erzeugen ein **Rekonstruktionsfenster**. Das deutlichste Beispiel
ist die Gegendarstellung `Application.subject_statement`: Bleibt sie übrig, nachdem die
Beurteilungen gelöscht sind, steht dort *„Ich widerspreche der Aussage, ich sei unpünktlich
gewesen"* — **ohne die Aussage**. Der Inhalt der gelöschten Beurteilung ist damit aus dem
verbliebenen Feld rekonstruierbar; die Löschung hat formal stattgefunden und ist inhaltlich
unterlaufen ([`06-Compliance-Anhang.md` §5.7](06-Compliance-Anhang.md#57-löschung-ist-atomar)).

Der Weg dorthin ist nicht ein Denkfehler, sondern die naheliegende Implementierung: „jedes Feld
bekommt seine eigene Frist" klingt sauberer, als es ist.

**Durchsetzung.** 🟢
- Schema-Check gegen `data-inventory.yml`: Ein Feld einer `Application`-nahen Tabelle mit
  **abweichender** Frist bricht den Build (G-F1).
- Der Löschpfad hat genau **einen** Einstiegspunkt; ein zweiter Aufbewahrungsjob über dieselben
  Tabellen ist per Lint gesperrt.
- Geschützter Test **G-D4** prüft, dass nach dem Löschen einer `Application` **kein** Rest bleibt —
  einschließlich `subject_statement`.

---

## G-F · Datenbestandsverzeichnis

> ADR-010: `data-inventory.yml` ist die maschinenlesbare Deklaration jedes personenbezogenen
> Feldes — Zweck, Rechtsgrundlage, Aufbewahrung, Kategorie, Bounded Context. Sie dient zugleich als
> Art.-30-Verzeichnis und ist die normative Quelle für
> [`06-Compliance-Anhang.md` §6](06-Compliance-Anhang.md#6--datenkategorien--vorlage-für-das-art-30-verzeichnis).

### G-F1 — Undeklarierte personenbezogene Spalte bricht den Build

**Regel.** Eine neue Spalte, die personenbezogene Daten aufnehmen kann, muss vor dem Zusammenführen
in `data-inventory.yml` deklariert sein — mit Zweck, Rechtsgrundlage, Frist, Kategorie und
Kontext. Ohne Eintrag bricht der Build.

**Begründung.** Das ist Art. 25 (Datenschutz durch Technikgestaltung) als Werkzeug statt als
Vorsatz. Compliance-Dokumentation, die man nachträglich pflegen muss, wird nicht gepflegt.

**Durchsetzung.** 🟢 CI-Gate: Abgleich der Schema-Definition gegen `data-inventory.yml`. Jede
Spalte ist entweder deklariert oder ausdrücklich als `personal_data: false` markiert. Eine dritte
Möglichkeit gibt es nicht — **es gibt keinen stillen Default**.

> Dass eine als `personal_data: false` markierte Spalte tatsächlich keinen Personenbezug hat, kann
> das Gate nicht prüfen. Das Gate erzwingt die **Entscheidung**, nicht ihre Richtigkeit — und macht
> sie im Diff sichtbar. 🟡

### G-F2 — Freitextfelder erben die strengsten Regeln

**Regel.** Ein Feld der Kategorie `FREITEXT` erbt automatisch: Redaktion im Logger (G-B3),
Ausschluss aus externen Fehlerberichten (G-B4), Aufnahme in den Auskunftsexport (G-D6),
Löschung bei Fristablauf.

**Begründung.** Freitext ist der Träger des Art.-9-Risikos
([`06-Compliance-Anhang.md` §8](06-Compliance-Anhang.md#8--art-9--besondere-kategorien-im-freitext)).
Diese vier Konsequenzen sind zu wichtig, um an vier Stellen von Hand nachgezogen zu werden.

**Durchsetzung.** 🟢 Alle vier Listen werden **aus `data-inventory.yml` generiert**, nicht gepflegt.
Ein Test prüft, dass die generierten Artefakte aktuell sind (Regeneration im CI, Diff muss leer
sein).

### G-F3 — Keine Strukturfelder für Art.-9-Kategorien

**Regel.** Es entstehen **keine** Felder für Nationalität, Herkunft, Religion, Gesundheit,
Behinderung, sexuelle Orientierung, politische oder gewerkschaftliche Zugehörigkeit,
Familienstand — auch nicht als optionaler „Steckbrief", auch nicht als Freitext mit einladender
Beschriftung.

**Begründung.** Ein strukturiertes Feld macht aus einem Zufallsbefund eine systematische
Verarbeitung ohne Rechtsgrundlage
([`06-Compliance-Anhang.md` §8.2](06-Compliance-Anhang.md#83-fünf-folgen-für-das-produkt)).

**Durchsetzung.** 🟡 CI-Check auf eine Sperrliste von Feldnamen und Beschriftungen (`nationality`,
`religion`, `health`, `disability`, `ethnicity`, `marital_status`, `sexual_orientation`,
`political`, `union`, sowie deutsche Entsprechungen in UI-Texten). 🔴 Ein umbenanntes Feld
(`background`, `lifestyle`) entkommt der Liste — dagegen hilft nur das Review.

---

## G-G · Test- und CI-Disziplin

> **Der häufigste AI-Fehlermodus in diesem Projekt.** Ein Agent, der einen roten Lauf grün bekommen
> soll, hat zwei Wege: den Code reparieren oder den Test entschärfen. Der zweite ist kürzer.

### G-G1 — Ein Test wird nie geschwächt, um CI grün zu bekommen

**Regel.** Assertions aufweichen, Testfälle entfernen, Erwartungswerte an das falsche Ergebnis
anpassen, Zeitüberschreitungen hochsetzen, um eine Instabilität zu verdecken — **verboten**. Ist
ein Test falsch, wird das **begründet und getrennt** geändert, nicht im selben Commit wie der Fix.

**Begründung.** Grün ist kein Ziel, sondern eine Aussage. Ein Test, der an das Ergebnis angepasst
wurde, sagt nichts mehr aus — und niemand merkt es, weil er grün ist.

**Durchsetzung.** 🟡 CI markiert Commits, die Produktionscode **und** Testerwartungen in derselben
Datei ändern, als reviewpflichtig; Trendbericht über die Zahl der Assertions je Testdatei (Rückgang
ist ein Signal). 🟢 Für geschützte Tests greift zusätzlich G-D. 🔴 Im allgemeinen Fall bleibt die
Regel Prosa — sie ist deshalb hier die **wichtigste Regel, die nicht durchsetzbar ist**.

### G-G2 — Kein `skip`, kein `only`, kein auskommentierter Test

**Regel.** Übersprungene, isolierte oder auskommentierte Tests gelangen nicht in den Hauptzweig.
Ein zeitweise deaktivierter Test braucht eine Begründung im Code und einen verlinkten Vorgang.

**Durchsetzung.** 🟢 Lint-Regel plus CI-Check über den Diff.

### G-G3 — Ein CI-Check wird nicht entschärft, um einen Lauf zu bestätigen

**Regel.** Schwellenwerte senken, Checks aus der Pipeline nehmen, `continue-on-error` setzen,
Lint-Regeln global abschalten oder `.eslintrc`/`tsconfig.json` lockern ist eine Änderung **an den
Guardrails selbst** und erfordert menschliche Freigabe.

**Begründung.** Sonst ist jede vorherige Regel dieses Dokuments in einer Zeile abschaltbar.

**Durchsetzung.** 🟢 CODEOWNERS auf `.github/workflows/`, `.eslintrc*`, `tsconfig.json`,
`GUARDRAILS.md`, `data-inventory.yml`, `test/guarded.manifest.json` und der Migrationskonfiguration.
Ein Agent darf diese Dateien nicht ohne Freigabe ändern.

### G-G4 — Coverage-Schwelle nur nach oben

**Regel.** Die Abdeckungsschwelle wird nie gesenkt. Für Policy-, Repository- und Domänenschicht
gilt eine erhöhte Schwelle.

**Durchsetzung.** 🟢 Schwellen in der Konfiguration, Datei durch CODEOWNERS geschützt (G-G3);
CI-Check auf Senkung im Diff.

### G-G5 — Der reine Domänenkern wird ohne Datenbank getestet

**Regel.** Voting-Mathematik, Rangberechnung, Zustandsmaschine, Termin-Kostenmodell und
Zeitfenster-Parser sind pure Funktionen und werden als solche getestet — ohne Datenbank, ohne Netz,
ohne Zeitabhängigkeit.

**Begründung.** Die Score-Formel (Stufenwerte 0/1/3/5, Mittelwert auf 0–100 skaliert) ist in der UI
offengelegt (P-3). Was offengelegt ist, muss stimmen — und muss ohne Aufbauaufwand prüfbar sein.

**Durchsetzung.** 🟢 Import-Boundary-Lint: Der Domänenkern importiert keinen Datenbank-Client, kein
`fetch`, kein `Date.now()` (Zeit wird injiziert).

---

## G-H · Abhängigkeiten

### G-H1 — Keine ungefragten Pakete

**Regel.** Ein Agent fügt keine neue Laufzeitabhängigkeit hinzu, ohne sie zu benennen und zu
begründen. Für Funktionen, die die Standardbibliothek oder eine vorhandene Abhängigkeit abdeckt,
kommt kein Paket hinzu.

**Begründung.** Jede Abhängigkeit ist Angriffsfläche, Lizenzrisiko und potenzieller Empfänger
personenbezogener Daten (G-B4).

**Durchsetzung.** 🟢 CODEOWNERS auf `package.json`; CI-Check meldet neue Einträge im Diff
gesondert. 🔴 Ob das Paket nötig war, entscheidet das Review.

### G-H2 — Lizenzprüfung

**Regel.** Neue Abhängigkeiten werden auf ihre Lizenz geprüft. Copyleft-Lizenzen mit Ausstrahlung
auf den Anwendungscode sind ohne ausdrückliche Entscheidung ausgeschlossen.

**Durchsetzung.** 🟢 Lizenz-Check im CI gegen eine Zulassungsliste.
*Werkzeugvorschlag: `license-checker` oder Äquivalent.*

> ⚠️ TBD — zu ergänzen: Die Zulassungsliste ist festzulegen. Zu klären ist insbesondere, ob die
> Apache-2.0-Abhängigkeiten des Solver-Pfads (ADR-005) und die eigene Lizenzierung von Flatmate.io
> zusammenpassen.

### G-H3 — Lockfile-Pflicht

**Regel.** Das Lockfile wird immer mitgeliefert. Installationen laufen reproduzierbar
(`npm ci` oder Äquivalent), nie mit auflösender Installation im CI oder in der Produktion.

**Durchsetzung.** 🟢 CI installiert ausschließlich aus dem Lockfile; ein danach veränderter
Lockfile bricht den Build.

### G-H4 — Keine `latest`-Versionen, keine Bereichsangaben ohne Not

**Regel.** Versionen werden gepinnt oder eng begrenzt. `latest`, `*` und `next` sind verboten.

**Begründung.** Ein reproduzierbarer Build ist Voraussetzung für den Determinismus des Solvers
(G-K) und für jede Fehlersuche.

**Durchsetzung.** 🟢 CI-Check über `package.json` auf verbotene Bereichsangaben.

### G-H5 — Kein `--force`, kein `--legacy-peer-deps`

**Regel.** Abhängigkeitskonflikte werden gelöst, nicht überstimmt.

**Begründung.** Beide Schalter machen einen Konflikt unsichtbar, der zur Laufzeit wiederkommt.

**Durchsetzung.** 🟢 CI-Check auf diese Schalter in Skripten, Workflows und Dockerfiles.

### G-H6 — Der Python-Solver-Pfad folgt denselben Regeln

**Regel.** Die `ortools`-Abhängigkeit (ADR-005) wird gepinnt, im Image reproduzierbar installiert
und wie jede andere Abhängigkeit behandelt. Der Kindprozess erhält **kein Netzwerk**.

**Begründung.** ADR-005 begründet die Wahl unter anderem damit, dass die Daten den Host nicht
verlassen. Das ist nur wahr, solange der Prozess nicht hinaustelefoniert.

**Durchsetzung.** 🟢 Gepinnte Version im Abhängigkeitsmanifest; Netzwerkabschaltung für den
Kindprozess auf Container-Ebene, im CI geprüft.

---

## G-I · Kontextgrenzen

### G-I1 — Import-Boundary-Lint wird nicht per Ausnahme aufgeweicht

**Regel.** Die Kontexte `identity` · `casting` · `deliberation` · `scheduling` · `notifications` ·
`audit` importieren einander nur über deklarierte öffentliche Schnittstellen. **Keine
Cross-Context-Joins.** Der Import-Boundary-Lint erhält **keine** Einzelausnahmen.

**Begründung.** ADR-001. Die Grenze ist zugleich die Grenze der Zweckbindung (G-B5). Die erste
Ausnahme ist immer begründet — und die dritte macht die Regel wertlos.

**Durchsetzung.** 🟢 Import-Boundary-Lint als CI-Gate; `eslint-disable` für diese Regel gesperrt
(G-C4, G-G3). Eine neue erlaubte Kante wird in der **Konfiguration** eingetragen, nicht als
Ausnahme im Code — und diese Datei ist durch CODEOWNERS geschützt.

### G-I2 — Kommunikation zwischen Kontexten über Domain-Events

**Regel.** Wo ein Kontext auf eine Veränderung in einem anderen reagieren muss, geschieht das über
ein Domain-Event, nicht über einen direkten Aufruf oder einen gemeinsamen Datenbankzugriff.

**Durchsetzung.** 🟢 durch G-I1 erzwungen. 🟡 Ob das Event richtig geschnitten ist, entscheidet das
Review.

### G-I3 — Der Solver bleibt hinter seinem Port

**Regel.** Der CP-SAT-Solver ist ausschließlich über den in ADR-005 vorgesehenen **Solver-Port**
erreichbar. Kein direkter Prozessaufruf aus einer Route, keine Solver-Typen im Domänenkern.

**Begründung.** Austauschbarkeit war der ausdrückliche Grund für den Port. Ein Aufruf, der ihn
umgeht, macht sie zunichte.

**Durchsetzung.** 🟢 Import-Boundary-Lint: Das Solver-Adaptermodul ist nur aus `scheduling`
importierbar; Prozessstart-APIs sind außerhalb des Adapters gesperrt.

---

## G-J · Halluzinierte APIs und Typsicherheit

### G-J1 — Keine Bibliotheks-API ohne Verifikation gegen die installierte Version

**Regel.** Ein Agent verwendet keine Funktion, Option oder Signatur einer Abhängigkeit, die er
nicht **gegen die im Lockfile festgelegte Version** verifiziert hat — durch Typdefinitionen im
`node_modules`-Baum oder die Dokumentation genau dieser Version. Nicht durch Erinnerung.

**Begründung.** Erfundene APIs sind der bekannteste Fehlermodus generierter Codes. Sie sehen
plausibel aus, kompilieren gelegentlich sogar und scheitern zur Laufzeit — bevorzugt an einer
Stelle, die im Test nicht abgedeckt ist.

**Durchsetzung.** 🟢 Strikte Typprüfung fängt den größten Teil (G-J2). 🟢 Der Build läuft gegen die
Lockfile-Versionen (G-H3), nicht gegen aufgelöste. 🔴 Der Rest — falsche Semantik bei richtiger
Signatur — bleibt Prosa und wird nur durch Tests gefunden.

### G-J2 — Strikte Typprüfung, kein `any`

**Regel.** TypeScript im `strict`-Modus. `any` ist im Anwendungscode verboten; unbekannte Formen
sind `unknown` und werden validiert. Für die Policy-, Repository- und Domänenschicht gilt zusätzlich
G-C4.

**Durchsetzung.** 🟢 `tsconfig.json` mit `strict: true`, `noImplicitAny`, `noUncheckedIndexedAccess`;
Lint-Regel gegen explizites `any`. Datei durch CODEOWNERS geschützt (G-G3).

### G-J3 — Externe Daten werden am Rand validiert

**Regel.** Jede Eingabe von außen — Formulare, Paste-Parser, Token-Link-Seite, Solver-Antwort,
Umgebungsvariablen — wird an der Kontextgrenze gegen ein Schema validiert. Danach gilt der Typ.

**Begründung.** Die Solver-Antwort ist Fremddaten aus einem Prozess in einer anderen Sprache; das
Ergebnis des Paste-Parsers ist Fremddaten aus einer WhatsApp-Nachricht.

**Durchsetzung.** 🟢 Schema-Validierung verpflichtend an definierten Randmodulen; Lint-Regel gegen
ungeprüfte `JSON.parse`-Ergebnisse.

### G-J4 — Keine erfundenen Felder im Domänenmodell

**Regel.** Ein Agent fügt keine Entität, kein Feld und keinen Zustand hinzu, die nicht in
`04-Domaenenmodell.md` oder `00-Session-Brief.md` stehen. Wird etwas gebraucht, das dort fehlt,
wird das **gemeldet**, nicht erfunden.

**Begründung.** Die Entitätsnamen sind Kontrakt zwischen mehreren parallel entstandenen Dokumenten.
Ein erfundenes Feld bricht zugleich G-F1, weil es nicht im Datenbestandsverzeichnis stehen kann.

**Durchsetzung.** 🟢 mittelbar über G-F1: Ein neues personenbezogenes Feld ohne Deklaration bricht
den Build. 🔴 Für nicht personenbezogene Felder bleibt es Prosa.

---

## G-K · Solver-Determinismus

### G-K1 — Fixer Seed und **ein** Worker

**Regel.** Der CP-SAT-Solver läuft mit festem Zufalls-Seed und **genau einem** Solver-Worker. Diese
Parameter werden **nicht** „für Performance" geändert — auch nicht versuchsweise, auch nicht nur in
der Produktion.

**Begründung.** CP-SAT ist **nur unter diesen beiden Bedingungen deterministisch**. Mehrere Worker
liefern je nach Zeitverhalten unterschiedliche, gleich gute Lösungen. Für einen Terminplaner heißt
das: Zweimal derselbe Knopf, zwei verschiedene Vorschläge, keine Erklärung. Das verletzt **P-3
(Legitimität vor Optimalität)** unmittelbar — und Legitimität ist hier der Produktzweck, nicht ein
Qualitätsmerkmal.

**Durchsetzung.** 🟢
- Seed und Worker-Zahl sind Konstanten im Solver-Adapter, nicht konfigurierbar; CI-Check auf
  Änderungen an diesen Zeilen (CODEOWNERS auf dem Adaptermodul).
- **Determinismus-Test:** derselbe Eingabefall, zehn Läufe, identisches Ergebnis — als geschützter
  Test geführt.

### G-K2 — Erklärbarkeit ist Teil der Funktion, nicht Zubehör

**Regel.** Jeder Solver-Aufruf liefert neben dem Vorschlag die Erklärung mit: verletzte Soft-Terme
nachgerechnet („Di 17:00 — 5/7 können") und bei Unlösbarkeit die einzeln relaxierten harten
Constraints („keine Lösung: Lea kann nur Di 16–19, dort können nur 2 von 7"). Ein Vorschlag ohne
Erklärung wird nicht angezeigt.

**Begründung.** P-3. Ein unerklärter Vorschlag ist in einer WG-Diskussion wertlos.

**Durchsetzung.** 🟢 Der Rückgabetyp des Solver-Ports macht die Erklärung **verpflichtend**, nicht
optional — ein Vorschlag ohne Erklärung ist nicht konstruierbar. Typsystem statt Konvention.

### G-K3 — Kein nichtdeterministisches Verfahren, kein KI-Verfahren

**Regel.** Genetische, heuristisch-zufällige oder lernende Verfahren zur Terminplanung sind
ausgeschlossen — auch nicht als Rückfallebene bei Zeitüberschreitung. Bei Zeitüberschreitung
degradiert das System auf **manuelle Terminlegung**, nicht auf ein anderes Verfahren.

**Begründung.** Im Brief ausdrücklich ausgeschlossen (`timetabling-solver`, genetisch:
nichtdeterministisch, nicht erklärbar). Eine Rückfallebene, die anders rechnet, ist derselbe Verstoß
mit zusätzlicher Unsichtbarkeit.

**Durchsetzung.** 🟢 Abhängigkeits-Sperrliste im CI (G-H1). 🟡 Eigenimplementierungen erkennt keine
Liste — dagegen hilft der Determinismus-Test aus G-K1, der auch eine selbstgebaute Heuristik
auffliegen ließe.

### G-K4 — Solver-Eingaben werden nicht persistiert

**Regel.** Die JSON-Eingabe an den `ortools`-Kindprozess wird **nicht** in eine Datei, eine Tabelle
oder ein Log geschrieben — auch nicht „zur Fehlersuche", auch nicht pseudonymisiert. Persistiert
wird ausschließlich das Ergebnis (`Appointment`) samt `Appointment.explanation`.

**Begründung.** Die Eingabe enthält die Verfügbarkeitsfenster aller Beteiligten und ist damit
personenbezogen. Ein Eingabearchiv wäre eine **zweite Kopie außerhalb des Aufbewahrungsregimes** —
sie würde die 180-Tage-Automatik unterlaufen, ohne in `data-inventory.yml` zu stehen. Die Erklärung
wird deshalb **zur Anfragezeit** erzeugt und mit dem Ergebnis gespeichert, statt sie später aus einem
Archiv zu rekonstruieren. `Appointment.solver_run_id` bleibt zulässig, weil eine Korrelations-ID kein
Personendatum trägt.

**Durchsetzung.** 🟢 Der Solver-Adapter hat keinen Schreibpfad: Dateisystem- und Logger-Zugriff sind
in diesem Modul per Lint-Regel gesperrt (dieselbe Mechanik wie G-C1). CI-Check auf Schreibaufrufe im
Adapter.

---

## G-L · Die KI-Grenze (P-5)

> ### Nicht verhandelbar
>
> **KI erzeugt in Flatmate.io niemals Bewertungen, Rankings, Empfehlungen oder Entscheidungen über
> Personen.** Zulässig ist ausschließlich strukturierende Textverarbeitung — Zusammenfassen,
> Extrahieren von Zeitfenstern, Zuordnen zu vorhandenen Feldern.
>
> Diese Zeile steht nicht zur Abwägung. Sie ist die Grenze, die Flatmate.io außerhalb der
> Hochrisiko-Einordnung nach Anhang III der KI-Verordnung hält
> ([`06-Compliance-Anhang.md` §9](06-Compliance-Anhang.md#9--ai-act-einordnung-und-p-5)), und
> zugleich der Schutz vor der unsichtbaren Verarbeitung von Art.-9-Daten im Freitext
> ([`06-Compliance-Anhang.md` §8](06-Compliance-Anhang.md#8--art-9--besondere-kategorien-im-freitext)).
> Ein Agent, der sie „nur für einen Prototyp" überschreitet, hat den Zweck des Projekts verfehlt.

### G-L1 — Kein Modellaufruf, der Personen bewertet

**Regel.** Kein Aufruf eines Sprachmodells, dessen Ausgabe eine Aussage über die **Eignung,
Eigenschaften oder Rangfolge** einer Person ist oder sein könnte. Die Prüffrage lautet nicht
„welches Modell", sondern: **Fügt die Ausgabe etwas über die Person hinzu, das nicht in der Eingabe
stand?** Wenn ja, ist sie verboten.

| Erlaubt | Verboten |
|---|---|
| „Extrahiere Name, Alter, Kontakt" | „Wie gut passt diese Person zur WG?" |
| „Wandle ‚dienstags ab 16' in ein Zeitfenster" | „Sortiere diese Bewerbungen nach Eignung" |
| „Kürze diesen Text auf drei Sätze" | „Fasse zusammen, was für und gegen diese Person spricht" |
| „Enthält dieser Text eine Telefonnummer?" | „Erkenne Warnsignale in dieser Bewerbung" |

**Durchsetzung.** 🟢 In v1 gibt es **keinen Modellaufruf im Produktionscode**. Das ist maschinell
prüfbar: CI-Sperrliste für Modell-SDKs und für ausgehende Ziele bekannter Anbieter (vgl. G-B4,
G-H1). Ein hinzugefügter Modellaufruf bricht den Build und braucht eine bewusste, freigegebene
Ausnahme. 🔴 Ab dem Zeitpunkt, an dem ein zulässiger Aufruf existiert (v2, G-L2), bleibt die
inhaltliche Grenze Prosa plus Schema-Zwang (G-L3).

### G-L2 — Kein Bewerber-Freitext an ein Modell ohne Rechtsgrundlage und AVV

**Regel.** `Application.message_raw`, `Application.decision_note`, `Application.rejection_reason`,
`CastingNote.body`, `Veto.reason` und
`AvailabilityWindow.raw_input` werden an **kein** Sprachmodell übergeben, solange nicht **beide**
Bedingungen erfüllt und dokumentiert sind:

1. **Verarbeitung in der EU** und ein **AVV mit dem Modellanbieter**, der als
   Unterauftragsverarbeiter in die AVV-Kette aufgenommen und den Haushalten offengelegt ist; kein
   Training auf den Eingabedaten.
2. **Ausgabe strikt auf Extraktion begrenzt** — festes Ausgabeschema, dessen Felder mit dem
   Formular identisch sind; kein freier Ausgabetext; menschliche Bestätigung bleibt Pflicht.

**Fehlt eine der beiden Bedingungen, findet das Feature nicht statt** — auch nicht „vorläufig zum
Ausprobieren", auch nicht in einer Entwicklungsumgebung mit echten Texten (G-B1, G-B2).

**Begründung.** Der Eingabetext bleibt personenbezogen und enthält mit hoher Wahrscheinlichkeit
Art.-9-Daten. Ein Modellaufruf ohne AVV ist eine Übermittlung an einen nicht vereinbarten
Empfänger.

**Durchsetzung.** 🟢 Solange G-L1 gilt (keine Modell-SDKs im Build), ist die Regel technisch
erzwungen. 🟡 Danach: Die Felder der Kategorien `FREITEXT` und `BEURTEILUNG` aus
`data-inventory.yml` werden in eine generierte Sperrliste übernommen; ein Lint-Check verbietet, sie
in den Nutzlast-Pfad eines Modellaufrufs zu geben.

### G-L3 — Extraktion nur gegen ein festes Schema

**Regel.** Wo ein zulässiger Modellaufruf existiert (v2), ist die Ausgabe an ein **geschlossenes
Schema** gebunden, dessen Felder mit vorhandenen Formularfeldern identisch sind. Kein freier Text
in der Ausgabe, keine zusätzlichen Felder, keine Bewertungsskalen, keine Begründungen.

**Begründung.** Das Schema ist der Mechanismus, der P-5 durchsetzt, statt darauf zu hoffen. Ein
Modell, das nur `{name, age, contact, availability}` zurückgeben **kann**, kann nicht ranken.

**Durchsetzung.** 🟢 Schema-Validierung der Modellantwort ist verpflichtend (G-J3); jedes
zusätzliche Feld führt zur Ablehnung der Antwort, nicht zur Übernahme.

### G-L4 — Parser-Vorschläge sind immer bestätigungspflichtig

**Regel.** Weder der regelbasierte Paste-Parser noch der Freitext→Zeitfenster-Parser noch ein
späteres KI-Parsing übernimmt Werte **stillschweigend**. Jeder Vorschlag wird angezeigt und
menschlich bestätigt, bevor er zu einem Domänenobjekt wird.

**Begründung.** P-1 (Kanalneutralität — jeder Erfassungspfad erzeugt dasselbe Objekt) und P-3
(Erklärbarkeit). Ein stillschweigend übernommener Parser-Fehler wird zu einem Datum, das niemand
geprüft hat und dessen Herkunft unsichtbar ist.

**Durchsetzung.** 🟢 Der Parser gibt einen `Suggestion`-Typ zurück, kein Domänenobjekt; die
Umwandlung erfordert eine ausdrückliche Bestätigungshandlung. Typsystem statt Konvention.
`AvailabilityWindow.source` protokolliert den Ursprung (`manual` / `token_link` / `parsed`).

---

## G-M · Scope-Disziplin

### G-M1 — Keine unbeauftragten Refactorings in fremden Kontexten

**Regel.** Ein Agent, der an `casting` arbeitet, refaktoriert nicht „nebenbei" `notifications`.
Änderungen bleiben im beauftragten Bounded Context. Fällt außerhalb etwas auf, wird es **gemeldet**,
nicht behoben.

**Begründung.** Ein Diff, der drei Kontexte berührt, ist nicht mehr überprüfbar — und
Überprüfbarkeit ist bei generiertem Code die einzige verbleibende Kontrolle. Gerade in diesem
Projekt hängen an unscheinbaren Stellen Sichtbarkeitsinvarianten.

**Durchsetzung.** 🟡 CI meldet Diffs, die mehr als einen Kontext berühren, als reviewpflichtig.
🔴 Ob die Berührung nötig war, entscheidet das Review.

### G-M2 — Kein Feature ohne Zeile im SRD-Scope

**Regel.** Es entsteht kein Feature, das sich nicht auf eine Scope-Zeile in `02-SRD.md`
zurückführen lässt. Insbesondere entstehen keine v1.1-, v1.2- oder v2-Funktionen „schon mal
vorbereitend".

**Begründung.** Verifikationspunkt 3 des Briefs verlangt die Rückführbarkeit jedes PRD-Features auf
eine SRD-Scope-Zeile. Vorgezogene Funktionen brechen diese Kette und erzeugen Datenfelder, die
niemand deklariert hat (G-F1).

**Durchsetzung.** 🔴 **Nur Prosa.** Es gibt keinen Mechanismus, der ein zu großzügig ausgelegtes
Feature erkennt. Die einzige Absicherung ist ein kleiner Diff (G-M1) und ein Mensch, der ihn liest.

### G-M3 — Kein Feature setzt einen Link an Bewerbende voraus

**Regel.** Kein v1-Feature funktioniert **nur** dann, wenn eine bewerbende Person einen Link
öffnet. Jede Information, die über einen Link hereinkommen kann, muss auch von Hand einpflegbar
sein — und beide Pfade erzeugen **dasselbe** Domänenobjekt.

**Begründung.** **P-1 (Kanalneutralität)** ist das Differenzierungsmerkmal gegenüber
`besichtigungstermine.com`, das auf den Link angewiesen ist. Bewerbende werden nie in die App
gezwungen.

**Durchsetzung.** 🟢 Für den Verfügbarkeits-Pfad maschinell prüfbar: Ein Test legt einen
vollständigen Casting-Ablauf **ohne jede Interaktion einer bewerbenden Person** an und führt ihn bis
`moved_in`. Bricht er ab, ist P-1 verletzt. Als geschützter Test empfohlen. 🔴 Für neue Features
bleibt die Regel Prosa, bis der Ablauftest sie mit abdeckt.

---

## Zusammenfassung: Durchsetzungsstand

> **Zweck dieser Tabelle.** Sie macht sichtbar, wo dieses Dokument tatsächlich schützt und wo es nur
> bittet. Die 🔴-Zeilen sind die Angriffsfläche — sie gehören bei jeder Erweiterung des Projekts
> daraufhin geprüft, ob inzwischen ein Mechanismus möglich geworden ist.

| Regel | Klasse | Mechanismus |
|---|---|---|
| G-A1 Kein Secret im Repo | 🟢 | Secret-Scanning (Pre-Commit + CI) |
| G-A2 Nur `.env.example` | 🟢 | `.gitignore`-Check, Umgebungsschema |
| G-A3 Keine Secrets in Logs | 🟢 | Redaktionsliste + Unit-Test |
| G-A4 Kein Secret in einen Prompt | 🔴 | **keiner** — nur kein Zugriff auf Produktions-Secrets |
| G-A5 Beitrittscode nie in Log oder Query-String | 🟢 | Redaktionsliste, Pfad-Redaktion der Einladungsroute, Lint |
| G-B1 Keine echten Personendaten in Fixtures | 🟡 | Domänenkonvention automatisiert, Freitext nicht |
| G-B2 Keine Produktionsdaten lokal | 🟡 | Skript-Check, Zugriffsentzug |
| G-B3 Keine PII in Logs | 🟢 | generierte Redaktionsliste aus `data-inventory.yml` |
| G-B4 Keine PII an externe Dienste | 🟢 | `beforeSend`-Filter, CSP-Check |
| G-B5 PII nur im zuständigen Kontext | 🟢 | Import-Boundary-Lint |
| G-B6 Kein PII im Gerätecache (Service Worker) | 🟢 | Positivliste statischer Muster + Cache-Test |
| G-B7 Stimmpuffer überlebt den Versand nicht | 🟢 | Nutzlast-Schema, TTL-Test, Leer-Tests, Idempotenztest |
| G-C1 Policy-Schicht nie umgehen | 🟢 | Modulgrenze für den DB-Client |
| G-C2 RLS nie deaktivieren | 🟢 | Migrations-Check + Positiv-Test je Tabelle |
| G-C3 Policy-Test je neuer Query | 🟡 | Coverage-Schwelle + Review |
| G-C4 Kein `as any` in kritischen Schichten | 🟢 | Lint mit Pfad-Geltungsbereich |
| G-C5 `household_id NOT NULL` | 🟢 | Schema-Test gegen `data-inventory.yml` |
| G-C6 Benachrichtigungen prüfen Sichtbarkeit | 🟢 | geschützter Test G-D5 |
| G-C7 Sichtbarkeitsinvarianten zweimal getestet | 🟢 | zwei Manifest-Einträge je Invariante (Policy + rohes SQL) |
| G-C8 `SET LOCAL` nur in Transaktion | 🟢 | einzige Hilfsfunktion, Lint, CI-Check, Pool-Test G-D10 |
| G-C9 Datenschutzseite nie ohne Freigabe erreichbar | 🟢 | `PublishedPrivacyNotice`-Typ + Policy-Test je Route |
| G-D Geschützte Tests (Existenz, Marker, `skip`) | 🟢 | Manifest-Check + CODEOWNERS |
| G-D Geschützte Tests (inhaltliche Abschwächung) | 🔴 | **keiner** — nur Freigabepflicht und Review |
| G-D1 Grenze: nur verknüpfte Bewerbungen | 🔴 | **keiner** — prozessual, im Dokument benannt (Q-14) |
| G-D7 Kein Freitext/Wert in `ActivityEvent.payload` | 🟢 | Positivliste erlaubter Payload-Schlüssel je `event_type` |
| G-D8 Payload-Redaktion zum Fristende | 🟢 | geschützter Test |
| G-D9 `became_resident_id` nie `null` | 🟢 | geschützter Test über den Rückwärtsübergang |
| G-D10 Kein Leck über den Verbindungspool | 🟢 | geschützter Test, zwei Haushalte über eine Verbindung |
| G-D11 Stimmpuffer: TTL, Profilwechsel, Idempotenz | 🟢 | drei geschützte Tests (G-B7, Zusicherungen 1, 5, 6) |
| G-D12 Invite-Token: Fehler statt Überschreibung bei bestehendem Profil | 🟢 | geschützter Test über den Einlösepfad (Anschluss an G-D9/I-3) |
| G-D13 Notiz-Reminder respektiert Selbst-Redaktion | 🟢 | geschützter Test, prüft nur `AppointmentAttendance.note_written` (Anschluss an G-D1/G-C6/G-D5) |
| G-E1 Destruktives DDL | 🟢 | Migrations-Muster-Check + CODEOWNERS |
| G-E2 Migrationen reversibel | 🟢 | up/down/up im CI |
| G-E3 Nur Migrationen | 🟢 | Drift-Erkennung |
| G-E4 Keine Änderung an gelaufenen Migrationen | 🟢 | Prüfsummen-Check |
| G-E5 Löschung atomar, keine Feldfrist | 🟢 | Schema-Check gegen `data-inventory.yml`, ein Löschpfad, G-D4 |
| G-F1 Undeklarierte Spalte bricht Build | 🟢 | ADR-010-Gate (Entscheidung erzwungen, nicht Richtigkeit 🟡) |
| G-F2 Freitext erbt strengste Regeln | 🟢 | Generierung statt Pflege |
| G-F3 Keine Art.-9-Strukturfelder | 🟡 | Feldnamen-Sperrliste; Umbenennungen entkommen 🔴 |
| G-G1 Tests nie schwächen | 🔴 | **keiner im allgemeinen Fall** — nur Signale und Review |
| G-G2 Kein `skip`/`only` | 🟢 | Lint + Diff-Check |
| G-G3 CI-Checks nicht entschärfen | 🟢 | CODEOWNERS auf Konfigurationsdateien |
| G-G4 Coverage nur nach oben | 🟢 | geschützte Konfiguration + Diff-Check |
| G-G5 Domänenkern ohne DB | 🟢 | Import-Boundary-Lint |
| G-H1 Keine ungefragten Pakete | 🟢/🔴 | CODEOWNERS auf `package.json`; Notwendigkeit = Review |
| G-H2 Lizenzprüfung | 🟢 | Zulassungsliste im CI |
| G-H3 Lockfile-Pflicht | 🟢 | reproduzierbare Installation |
| G-H4 Keine `latest`-Versionen | 🟢 | Manifest-Check |
| G-H5 Kein `--force` | 🟢 | Skript- und Workflow-Check |
| G-H6 Solver-Pfad gepinnt, ohne Netz | 🟢 | Pinning + Container-Netzwerkabschaltung |
| G-I1 Import-Boundary ohne Ausnahmen | 🟢 | Lint + gesperrte Konfiguration |
| G-I2 Domain-Events zwischen Kontexten | 🟢/🟡 | Lint erzwingt Form, Review den Schnitt |
| G-I3 Solver hinter dem Port | 🟢 | Import-Boundary-Lint |
| G-J1 Keine unverifizierten APIs | 🟢/🔴 | Typprüfung fängt Signaturen, nicht Semantik |
| G-J2 Strikte Typen, kein `any` | 🟢 | `tsconfig` + Lint, Konfiguration geschützt |
| G-J3 Validierung am Rand | 🟢 | Schema-Zwang, Lint gegen rohes `JSON.parse` |
| G-J4 Keine erfundenen Felder | 🟢/🔴 | mittelbar über G-F1; sonst Prosa |
| G-K1 Seed und ein Worker | 🟢 | Konstanten + CODEOWNERS + Determinismus-Test |
| G-K2 Erklärbarkeit verpflichtend | 🟢 | Rückgabetyp erzwingt sie |
| G-K3 Kein nichtdeterministisches Verfahren | 🟢/🟡 | Sperrliste; Eigenimplementierung nur über G-K1 |
| G-K4 Solver-Eingaben nicht persistiert | 🟢 | Adaptermodul ohne Schreibpfad (Lint + CI-Check) |
| G-L1 Kein bewertender Modellaufruf | 🟢 | Sperrliste für Modell-SDKs (v1: kein Aufruf) |
| G-L2 Kein Freitext ohne AVV | 🟢/🟡 | technisch erzwungen in v1; danach generierte Sperrliste |
| G-L3 Extraktion nur gegen festes Schema | 🟢 | Schema-Validierung der Antwort |
| G-L4 Parser-Vorschläge bestätigungspflichtig | 🟢 | `Suggestion`-Typ statt Domänenobjekt |
| G-M1 Keine fremden Refactorings | 🟡 | Kontext-Diff-Meldung + Review |
| G-M2 Kein Feature ohne SRD-Zeile | 🔴 | **keiner** — nur kleiner Diff und Review |
| G-M3 Kein Link-Zwang für Bewerbende | 🟢/🔴 | Ablauftest ohne Bewerber-Interaktion; neue Features Prosa |

**Bilanz.** Von 68 aufgeführten Positionen sind **51 vollständig automatisierbar**, **5
teilautomatisiert**, **7 gemischt** (automatisierter Kern, prosaischer Rest) und **5 rein
prosaisch**.

Die fünf rein prosaischen Positionen sind:

| Position | Warum kein Mechanismus | Was stattdessen trägt |
|---|---|---|
| **G-A4** Kein Secret in einen Prompt | Der Vorgang findet außerhalb des Repositories statt | Agenten erhalten keinen Zugriff auf Produktions-Secrets |
| **G-D** inhaltliche Abschwächung geschützter Tests | „Assertion aufgeweicht" ist maschinell nicht von „Assertion korrigiert" unterscheidbar | CODEOWNERS-Freigabe auf allen geschützten Testpfaden |
| **G-D1-Grenze** unverknüpfte Wiederbewerbungen | Die Verknüpfung zweier Bewerbungen zu einer Person ist eine menschliche Feststellung, kein Datenzustand | Vorschlag-und-Bestätigen beim Setzen von `became_resident_id`; offene Frage Q-14 |
| **G-G1** Tests nie schwächen, um CI grün zu bekommen | dasselbe Problem wie bei G-D, im allgemeinen Fall | kleiner Diff, Trendbericht über Assertion-Zahlen, Review |
| **G-M2** Kein Feature ohne SRD-Zeile | Scope ist keine Codeeigenschaft | Rückführbarkeitsprüfung im Review (Verifikationspunkt 3 des Briefs) |

Hinzu kommen die prosaischen Anteile der gemischten Positionen: die *Notwendigkeit* eines Pakets
(G-H1), die *Semantik* einer verifizierten API (G-J1), erfundene **nicht** personenbezogene Felder
(G-J4) und neue Features gegenüber P-1 (G-M3).

Diese Stellen sind zugleich diejenigen, deren Verletzung am schwersten zu bemerken ist — sie
erzeugen keinen roten Lauf, sondern einen grünen. **Das ist die ehrliche Grenze dieses Dokuments**
und der Grund, warum es die Klassenkennzeichnung überhaupt führt.

---

## Minimal-Gate für den ersten Commit

Bevor die erste Zeile Anwendungscode entsteht, sollten diese Gates stehen. Sie sind billig, wenn sie
zuerst kommen, und teuer, wenn sie nachgezogen werden:

1. Secret-Scanning (G-A1) und `.gitignore` für `.env*` (G-A2)
2. TypeScript `strict`, Lint gegen `any` und `eslint-disable` (G-C4, G-J2)
3. CODEOWNERS auf Konfiguration, Workflows, `GUARDRAILS.md`, `data-inventory.yml`,
   `test/guarded.manifest.json`, Migrationsverzeichnis, Solver-Adapter (G-G3, G-D, G-E1, G-K1)
4. `data-inventory.yml` mit Schema-Abgleich als Pflicht-Gate (G-F1) — **vor** der ersten Tabelle
5. RLS-Positiv-Test über alle Tabellen mit `household_id` (G-C2, G-C5) — **vor** der ersten Tabelle
6. `test/guarded.manifest.json` mit den dreizehn Invarianten aus G-D, zunächst als scheiternde Tests —
   die Sichtbarkeitsinvarianten je **zweimal**, gegen die Policy-Schicht und als rohes SQL (G-C7)
7. Sitzungskontext ausschließlich über eine Transaktions-Hilfsfunktion, `SET` ohne `LOCAL` per Lint
   gesperrt (G-C8) — **vor** der ersten Policy, nicht danach
8. Import-Boundary-Lint mit den sechs Bounded Contexts (G-I1)
9. Lockfile-Installation, Lizenz-Check, Versions-Check (G-H2 bis G-H4)

> ⚠️ TBD — zu ergänzen: Konkrete Werkzeugauswahl (Test-Runner, Lint-Plugin für Modulgrenzen,
> Secret-Scanner, Lizenz-Checker) und die Lizenz-Zulassungsliste aus G-H2. Beides gehört in den
> Repo-Aufsetz-Schritt, nicht in dieses Dokument.

---

> **Änderungshistorie**
>
> | Version | Datum | Änderung |
> |---|---|---|
> | V0.1 | 2026-08-19 | Erstfassung auf Basis von `00-Session-Brief.md`. Dreizehn Risikoklassen, jede Regel mit Begründung und Durchsetzungsmechanismus. Durchsetzungsklassen 🟢/🟡/🔴 eingeführt, damit rein prosaische Regeln nicht als Absicherung gelesen werden. |
> | V0.2 | 2026-08-19 | Querprüfung gegen `04-Domaenenmodell.md`. Feldnamen an die Schema-Autorität angeglichen. **Acht Regeln nachgetragen:** G-A5 (Beitrittscode nie in Log oder Query-String), G-C7 (Sichtbarkeitsinvarianten zweimal testen — Policy *und* rohes SQL, sonst ist ADR-004 eine Illusion), G-C8 (`SET LOCAL` nur in Transaktion — Leck *durch* die Sicherheitsmaßnahme hindurch bei Connection Pooling), G-D7 bis G-D10 (ADR-003 hatte keine einzige Referenz: kein Freitext im Payload, Redaktion zum Fristende, `became_resident_id` nie `null`, Pool-Test), G-K4 (Solver-Eingaben nicht persistieren). **Grenze von G-D1 benannt:** deckt nur verknüpfte Bewerbungen ab. Bilanz auf 61 Positionen aktualisiert. |
> | V0.3 | 2026-08-19 | Zweite Querprüfungsrunde. **G-C9** ergänzt: Die Art.-13-Datenschutzseite eines Haushalts ist im Zustand `draft` über keinen Codepfad erreichbar — Flatmate.io darf als Auftragsverarbeiter eine Erklärung im Namen des Verantwortlichen vorbereiten, nicht veröffentlichen. Durchgesetzt über einen `PublishedPrivacyNotice`-Typ statt über eine Prüfung je Route. Bilanz auf 62 Positionen, 65 Regeln. |
> | V0.4 | 2026-08-19 | **G-B6** (Service Worker cacht nur die App-Hülle — die Löschautomatik erreicht kein Endgerät, ADR-011 hätte sonst das Löschkonzept unterlaufen) und **G-E5** (Löschung atomar, kein Feld mit eigener Frist — sonst wird der Inhalt einer gelöschten Beurteilung aus der verbliebenen Gegendarstellung rekonstruierbar) ergänzt; G-D4 entsprechend erweitert. Bilanz auf 64 Positionen, 67 Regeln. |
> | V0.6 | 2026-08-19 | Präzisierung ohne neue Regeln — **Bilanz unverändert bei 66 Positionen und 68 Regeln**. Zusicherung 6 von G-B7 auf **Art. 5 Abs. 1 lit. d** und **Art. 16** zurückgeführt. Neuer Merksatz **„Wiederkehrende Fehlerstelle: der Profilwechsel"** unter G-C7: Er ist keine Abmeldung, und an ihm sind zweimal unabhängig Annahmen gebrochen (V-1 hängt deshalb am `Account`, der Stimmpuffer wird deshalb auch beim Wechsel geleert). Als 🔴 gekennzeichnet — eine Prüffrage, kein Mechanismus. |
> | V0.5 | 2026-08-19 | **G-B7** ergänzt: der Offline-Stimmpuffer als einzige, benannte Ausnahme von G-B6 — zulässig, weil er eine noch nicht abgeschlossene Transaktion hält, aber nur solange „kann den Versand nicht überleben" erzwungen ist. Sechs Zusicherungen, davon zwei über den Auftrag hinaus ergänzt: Leeren beim **Profilwechsel** (nicht nur bei Abmeldung) und **idempotente Wiedereinspielung**. **G-D11** als geschützter Test für die drei still scheiternden Zusicherungen. Bilanz auf 66 Positionen, 68 Regeln. |
> | V0.7 | 2026-08-31 | Produkt-Audit-Konsistenzabgleich. **G-D12** ergänzt (Invite-Token aus SRD S-42/`ApplicationInviteToken` schlägt bei bereits bestehendem `ResidentProfile` fehl statt zu überschreiben — Anschluss an G-D9/I-3) und **G-D13** (Notiz-Erinnerungs-Reminder aus S-46/`AppointmentAttendance` respektiert Selbst-Redaktion — Anschluss an G-D1/G-C6/G-D5, liest nur das `note_written`-Flag, nie `CastingNote.body`). Bilanz auf 68 Positionen, 70 Regeln. |
