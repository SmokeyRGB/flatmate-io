# Review-Log — Requirements Flatmate.io

> **Version:** V0.2
> **Datum:** 2026-09-09
> **Autor:** Samuel Zink (@SmokeyRGB)
> **Inhalt:** das Offene-Punkte-Register (unten) sowie die Protokolle der drei Prüfdurchgänge

---

## Offene-Punkte-Register

**Dies ist der einzige Ort, an dem der Status eines offenen Punkts steht.** Die Fachdokumente
tragen weiterhin die Frage und ihre Begründung — aber nicht mehr den Status. Wer wissen will,
ob etwas offen ist, schaut hier und nirgends sonst.

### Warum es dieses Register gibt

Der Status offener Punkte wurde an **vier** Stellen von Hand geführt: `02-SRD.md` §11,
`03-PRD.md` §8, `04-Domaenenmodell.md` §10.3 und `07-Screen-Inventar.md` §14. Alle vier sind
auseinandergelaufen, und zwar genau so wie §9 des Domänenmodells dreimal auseinandergelaufen
ist — aus demselben Grund, den dieses Dokument weiter unten selbst benennt: eine Zusicherung
ohne Mechanismus hält nicht.

Der Befund im Einzelnen, Stand 2026-09-09:

- `03-PRD.md` §8 führte **P-O-08** und **P-O-09** als offen. Beide waren **am selben Tag**, an
  dem sie entstanden, im Domänenmodell §10.2 beantwortet worden (O-13, O-14).
- `07-Screen-Inventar.md` §14 führte **alle sechs** Punkte O-A bis O-F als offen. Alle sechs
  waren aufgelöst; der Sprint-Log hält das fest, die Tabelle wurde nie nachgezogen.
- `07-Screen-Inventar.md` §13 führte **AW-1 bis AW-13** ohne Statusspalte. Alle dreizehn waren
  abgearbeitet — nur ließ sich das der Tabelle nicht ansehen.
- `04-Domaenenmodell.md` §10.3 führte **O-5** als offen, obwohl die verlangte prüfbare
  Zusicherung längst als **G-D7** und **G-D8** in `GUARDRAILS.md` stand.

### Die fünf Regeln

1. **Eine Zeile wird nie gelöscht.** Beim Schließen werden ID *und* Fragetext durchgestrichen,
   die Zeile bleibt stehen. Die Begründung, warum etwas *nicht* gemacht wurde, ist der
   wertvollere Teil.
2. **Eine ID ist dauerhaft.** Nummern werden nie neu vergeben — dieselbe Regel wie für
   ADR-Nummern (`05-ADRs.md`, Aufteilungsregel 1) und Scope-Zeilen (`02-SRD.md` §5.3).
3. **Eine geschlossene Zeile trägt Datum und Quelle:** `**Geklärt:** <ein Satz>. Maßgeblich:
   <Datei> §<n>`. Der Entscheidungstext steht in **genau einem** Dokument; jede weitere
   Erwähnung ist ein Verweis darauf.
4. **Eine Frage, eine tragende ID.** Steht dieselbe Frage unter mehreren IDs, ist eine die
   tragende und die anderen werden einzeilige Verweise. Zuständigkeit nach Dokument: SRD für
   Scope und Phasen, `04` für das Schema, PRD für Verhalten, `06` für Recht.
5. **Offene Zeilen tragen keine Auszeichnung.** Damit zählt `grep -c '^| \*\*O-'` die
   tatsächlich offenen.

Durchgesetzt wird das von **G-N5** (`GUARDRAILS.md`) und geprüft von `tools/done-check.ts`.

### ⚠ Zwei Nummernräume, die sich fast berühren

`02-SRD.md` nummeriert **null-gefüllt** (`O-01` … `O-08`), `04-Domaenenmodell.md` **ohne
führende Null** (`O-1` … `O-16`). Acht IDs unterscheiden sich damit **nur durch eine Null** und
bedeuten völlig Verschiedenes:

| Sieht gleich aus | `02-SRD.md` §11 | `04-Domaenenmodell.md` §10 |
|---|---|---|
| `O-06` / `O-6` | Grenzwerte des Solvers | `PasskeyCredential` modelliert |
| `O-05` / `O-5` | Spendenkommunikation | Redaktionsregel für `ActivityEvent.payload` |
| `O-01` / `O-1` | Quorum-Schwelle | Manuelle Verknüpfung früherer Bewerbungen |

Die Nummern bleiben (Regel 2) — umbenennen würde 100+ Verweise brechen. Stattdessen wird in
diesem Register **jede ID mit ihrem Dokument qualifiziert**, und ein Verweis in Prosa nennt
immer die Datei mit. Ein unqualifiziertes „O-6" ist mehrdeutig und damit ein Fehler.

### Offen — Entscheidung oder Erhebung nötig

| Schlüssel | Frage | Zuständig / Nächster Schritt |
|---|---|---|
| **`02-SRD.md` O-07** | Baseline-Erhebung im Testhaushalt (§8.3) | **Zeitkritisch, einziger Punkt dieser Art.** Wird retrospektiv aus den Chatverläufen der letzten Runde erhoben (Nachrichtenzahl, Tage von erster Bewerbung bis Entscheidung, Zahl der Antwortenden). Nach dem ersten Einsatz nicht mehr rekonstruierbar, und mit jedem Monat schwerer. Ersetzt zugleich den Befund „Baseline fehlt" aus Durchgang 1 — **ein Punkt, nicht zwei** |
| **`04-Domaenenmodell.md` O-1** *(Prozessteil)* | Frühere Bewerbungen derselben Person werden **nur von Hand** verknüpft; wer das vergisst, erzeugt genau das Leck, das V-1 verhindern soll | Der Dokumentationsteil ist erledigt (siehe unten). Offen bleibt das Prozessrisiko. Wird zur **harten Vorbedingung**: keine zweite echte Runde auf echten Daten, bevor der S-40-Prompt implementiert und durch den in `03-PRD.md` §4.1.7 verlangten eigenen Testfall gedeckt ist. Rechtlich weiter offen als `06-Compliance-Anhang.md` **Q-14** |
| **`04-Domaenenmodell.md` O-8** | Rangliste als Solver-Eingabe — Terminplanung nach Abstimmungsergebnis priorisieren | **Bewusst offen gehalten als Entwurfsoption, nicht als Ausschluss.** Zwei Fragen entscheiden es: (a) verkompliziert es den Ablauf für die Nutzenden? (b) verschlechtert es die Solver-Laufzeit so weit, dass es sich nicht mehr lohnt? Kein Beschluss jetzt nötig — automatisches Lösen liegt in v1.1. ADR-005 hält fest, dass der Solver-Port eine zusätzliche Gewichtung je Bewerbung nicht ausschließen darf |
| **`03-PRD.md` P-O-04** | Wortlaut aller Hinweistexte (Selbst-Redaktion, Anonymitätshinweis, „Verwaltung", Copy-Paste-Datenschutzhinweis) | Sammelarbeit, keine Autorenarbeit: ~80 % der Formulierungen stehen wörtlich in `02-SRD.md` §10, `06-Compliance-Anhang.md` §4.5, `03-PRD.md` §4.6.1 (C-10) und im Screen-Inventar. Zusammenzuführen in einen Textkatalog. **Ausgenommen:** ob der Copy-Paste-Hinweis Art. 14 genügt — das ist eine Rechtsfrage und geht auf die Q-Liste |
| ~~`04-Domaenenmodell.md` O-18~~ *(neu 2026-09-16, aufgelöst 2026-09-21)* | ~~`join_code`-Historie fehlt: das Modell trägt nur einen einzelnen, rotierenden Code mit Zähler, keine Historie einzelner Ausstellungen mit Nutzer-Zuordnung~~ | **Geklärt 2026-09-21 — zugunsten der Historie**, siehe die ausführliche Zeile unten in „In diesem Sprint geschlossen". Maßgeblich: `domain/identity.md` §2.1 (`JoinCodeIssuance`) |
| ~~`07-Screen-Inventar.md` O-G~~ *(neu 2026-09-09)* | ~~Die **Übersetzungstabelle für UI-Vokabular** (U-24: kein Modellbegriff erscheint auf einem Bildschirm ungeklärt) ist an zwei Stellen als „§8.6" zitiert — im Kopf des Dokuments und in §12 als Barrierefreiheits-Anforderung — existiert aber nicht.~~ | **Geklärt 2026-09-16:** Tabelle geschrieben, aus den tatsächlichen UI-Texten des Lovable-Prototyps geerntet (Prototyp-Abgleich gegen `docs/`). Maßgeblich: `screens/rahmenwerk.md` §8.6. Architekturhinweis zur i18n-Bereitschaft (Schlüssel→Text-Tabelle statt Inline-Strings) ergänzt in `adr/0006-stack-nextjs-postgres-drizzle.md` |
| **`04-Domaenenmodell.md` O-19** *(neu 2026-09-24)* | Der Aufbewahrungs-Anker von `Application` ist der Abschluss ihrer `CastingRound` (§5.3, korrigiert von den beiden lebenden Zitaten in `domain/aufbewahrung.md` §7 und `domain/casting.md`, die noch `created_at` nannten). Eine `Application`, deren Runde nie abgeschlossen wird, oder die zu keiner Runde gehört (`round_id` ist nullbar), hat damit **kein Löschdatum** | Frage und Begründung in `domain/offene-punkte.md` §10.3 (O-19); rechtlicher Teil bei `06-Compliance-Anhang.md` §5. Vor dem Bau des Aufbewahrungslaufs zu entscheiden |

### Implementierungspflichten — keine Spezifikationslücken

Diese Punkte sind nicht durch Schreiben zu schließen. Sie sind Auflagen an die Umsetzung und
stehen als solche in `GUARDRAILS.md`; hier nur als Nachweis, dass sie nicht verlorengegangen sind.

| Schlüssel | Auflage | Fällig |
|---|---|---|
| **`02-SRD.md` O-06** = **`03-PRD.md` P-O-06** | Grenzwerte des Solvers messen (Bewerbende × Slots × Bewohnende) auf der Zielhardware, Ergebnis in ADR-005 eintragen | **v1.1**, vor S-19. Bisher als Planungsschuld geführt, obwohl der Solver in v1.1 liegt — neu einsortiert |
| **`04-Domaenenmodell.md` O-10** | Einreichungsweg für `Application.subject_statement` festlegen | v1.1; betrifft nur die Oberfläche, das Schema ist unberührt |
| `GUARDRAILS.md` G-H2 | Lizenz-Allowlist | **geschlossen** — permissive Liste, Repo bleibt vorerst privat. Details in `tools/README.md` |
| `GUARDRAILS.md` Werkzeugwahl | Test-Runner, Modulgrenzen-Lint, Secret-Scanner, Lizenzprüfer | **geschlossen** — Vitest · dependency-cruiser · gitleaks · license-checker-rseidelsohn. Begründung je Werkzeug in `tools/README.md` |
| Durchgang 1: Teststrategie | Kapitel „was außer den geschützten Tests geprüft wird" | Nach der Werkzeugwahl, in `GUARDRAILS.md` |
| ~~Durchgang 1: ADR-005-Verpackung~~ | ~~Auslieferung des Python-Kindprozesses skizzieren~~ | **Geklärt 2026-09-16:** Der Solver läuft nicht mehr als lokaler Kindprozess der App, sondern als eigener Dienst (AWS Lambda, `eu-central-1`) — ausgelöst durch den Wunsch nach kostenlosem, serverlosem App-Hosting (Vercel). Maßgeblich: `adr/0005-*.md`, `adr/0006-*.md`, beide Änderungen vom 2026-09-16. Die alte Vorbedingung („ADR-006 muss eine Umgebung mit lokalem Kindprozess wählen") entfällt damit |
| **ADR-005/0006 (2026-09-16)** | AWS-AVV und Eintrag als Unterauftragsverarbeiter fehlen noch | **Blockiert die Inbetriebnahme des Solver-Dienstes**, nicht v0.1/v1.1 als Meilenstein — G-B4 kennt kein Versions-Gate, nur „neues ausgehendes Netzwerkziel". Firma/Sitz, Verarbeitungsort samt EU-Nachweis und AVV-Wortlaut sind beim Anbieter zu erheben, wie schon bei Supabase (§4 in `06-Compliance-Anhang.md`) |
| ~~ADR-006 (2026-09-16)~~ | ~~`SET LOCAL`-Sicherheit unter Supabases Transaktions-Pooler ist unverifiziert~~ | **Geklärt 2026-09-16:** Der geschützte Test **G-D10/AC-0.7** ist grün gegen die echte, lebende Supabase-Instanz (`flatmate-io`, `eu-west-1`) über den Transaktions-Pooler gelaufen — zwei Haushalte nacheinander über dieselbe physische Verbindung, die zweite Anfrage sieht nichts von der ersten. `SET LOCAL`s Transaktions-Scoping hält als alleinige Verteidigungslinie, wie in der Umsetzung des ersten Implementierungspakets begründet, jetzt auch empirisch bestätigt |
| ~~`GUARDRAILS.md` G-C8 (2026-09-25)~~ | ~~Der Sitzungskontext-Mechanismus sollte von drei sequentiellen `SET LOCAL`-Anweisungen (drei Round-Trips) auf eine gleichwertige Form verkürzt werden, ohne G-C8s Garantie zu verändern~~ | **Geklärt 2026-09-25, Menschenentscheidung:** `src/db/session-context.ts` setzt den Kontext seither über **eine** `SELECT set_config(…, true), …`-Anweisung — `set_config(name, value, is_local := true)` ist gleichwertig zu `SET LOCAL` (transaktionslokal, endet mit COMMIT/ROLLBACK). Round-Trips pro `withSessionContext`-Aufruf sinken von sechs auf vier. Der G-C8-Lint (`scripts/lint/session-context.ts`) erkennt seither auch `set_config` (vorher unsichtbar) sowie `SET SESSION …`/`SET … TO`/`SET LOCAL … TO` als Umgehungen, und scannt zusätzlich `drizzle/*.sql`. Ein neuer Pool-Wiederverwendungstest (`tests/integration/raw-sql/session-context-set-config.test.ts`) prüft die Garantie über den echten Mechanismus; seine Aufnahme in G-D10s geschützte Dateien ist ein separater, noch ausstehender Menschenentscheid. Maßgeblich: `GUARDRAILS.md` G-C8, `adr/0004-*.md`, `adr/0006-*.md`, `domain/invarianten.md` §5.5, `domain/identity.md`, `backlog/requirements/F0-requirements.md` AC-0.7 |
| Durchgang 1: Backup | RPO 24 h · RTO 8 h · **Backup-Aufbewahrung höchstens 30 Tage** · jeder Restore lässt den Löschlauf durchlaufen, bevor die Anwendung Verkehr annimmt | **Neu und wichtig:** S-33 erlaubt, die Frist auf 30 Tage zu verkürzen. Ein länger gehaltenes Backup überlebt damit die kürzeste zulässige Frist, und ein Restore holt gelöschte Bewerberdaten zurück — ohne jede Warnung. Beide Hälften sind nötig; die Deckelung allein genügt nicht |
| Durchgang 3: drei CI-Prüfungen | Versionszeile · Scope-Nummern · vier Pflichtzustände je Bildschirm | Aufgegangen in **G-N1**, **G-N2**, **G-N6** |
| Durchgang 3: `04` §9 | Aus `data-inventory.yml` erzeugen oder streichen | „Erzeugen" ist heute keine Option — die Datei existiert noch nicht. Zwischenschritt: die veralteten Feldzahlen aus den drei §9-Überschriften entfernen |
| **F3: `transitionApplication`** *(neu 2026-09-23)* | Die exportierte Repository-Funktion `transitionApplication` im Casting-Modul ändert den Zustand einer `Application`, ohne eine Berechtigung zu prüfen. Heute ruft sie nur ein Test auf, keine Route erreicht sie. Wer eine Bewerbung in welchen Zustand versetzen darf, entscheidet F3 — die Regel wird hier bewusst nicht vorweggenommen | **F3**, bevor die erste Route sie aufruft. Gefunden bei der Auswertung der PR-Reviews #4–#18 (2026-09-23). Bis dahin steht sie im Autorisierungs-Matrixtest als einzige bewusst offene Ausnahme, und der Test schlägt fehl, sobald eine Route sie aufruft (G-C) |
| **G-D15: Restpflichten zur Datenbankhälfte** *(neu 2026-09-24)* | Drei Auflagen aus der Schließung der G-D15-Datenbankhälfte (siehe unten, „In diesem Sprint geschlossen"): (a) Jede neue Repository-Funktion auf `Application` lehnt eine Sitzung ohne `ResidentProfile` selbst und früh ab und hat dafür einen eigenen Test — die Policy darunter ist die zweite Linie, nicht die einzige. (b) `vote` erhält dieselbe RESTRICTIVE-Policy ab seiner ersten Migration: mit Stimmen wird „5 von 7" ableitbar, und den Nenner sieht der Haushalts-Account bereits. (c) **Menschliche Entscheidung 2026-09-24:** Nach Ablauf der Aufbewahrungsfrist einer abgeschlossenen Runde werden ihre Bewerbungen automatisch gelöscht, sofern keine Verlängerung beantragt wurde. Die Löschung läuft auf einem benannten Systempfad, nie in einer Haushalts-Account-Sitzung — dort fände sie keine Zeile und meldete dennoch Erfolg. Der Haushalts-Account erfährt nur, dass die Frist der Runde abläuft und die Bewerbungen dann gelöscht werden, sofern keine Verlängerung erfolgt — **nie, wie viele**. Deckt sich mit `screens/O-organisation.md` O17/O18 | (a) **F3**, mit der ersten Lese- oder Anlagefunktion · (b) **F4**, erste `vote`-Migration · (c) die Scheibe, die den Aufbewahrungslauf baut |

### Geparkt — mit Eigentümer, nicht durch Dokumentation lösbar

| Schlüssel | Punkt | Warum geparkt |
|---|---|---|
| Durchgang 1: Hosting-Kosten | Kosten je Haushalt nie geschätzt | Rechnung gegen einen bereits entschiedenen Stack (ADR-006). Sechs Zeilen, keine Entscheidung |
| Durchgang 1: NFR-Zielwerte | gesetzt, nicht hergeleitet | Vor der ersten Messung wäre eine Herleitung Scheingenauigkeit. Wird ehrlich umbeschriftet: „gesetzt; Herleitung nach der ersten Messung" |
| Durchgang 2: S-44 / S-46 | Wirkung von Rundenfrist und Notiz-Erinnerung unbelegt | Beide liegen in v0.2; die Prüfung gehört zu den Prototypen |
| `Product-Audit-Hypotheses.md` H-D1…H-V7 | 21 unbelegte Annahmen | Durch kein Dokument zu schließen. Erhebung wandert von der geplanten Concierge-Runde zu den **Prototypen** (ab der Woche nach dem 2026-09-09). **Achtung:** die Hypothesen-Datei macht Solver, Kalender, Veto, Benachrichtigungen und PWA — „zwischen einem Drittel und der Hälfte des v1-Aufwands" — von einem Bericht der Concierge-Runde abhängig. Diese Sperre ist auf die Prototypen umzuhängen, sonst hat sie keinen Auslöser mehr |
| `06-Compliance-Anhang.md` Q-1…Q-14 | Offene Rechtsfragen | **Außerhalb dieses Sprints — anwaltliche Prüfung nötig.** Q-1 bis Q-4 sind launch-blockierend. Sie blockieren den **ersten echten Haushalt**, nicht die Implementierung gegen synthetische Daten |

### In diesem Sprint geschlossen

| Schlüssel | Frage | Geklärt |
|---|---|---|
| ~~`05-ADRs.md` ADR-006 (Auth-Teil)~~ | ~~Self-hosted Auth oder ein Anbieter — und welcher?~~ | **Supabase Auth**, derselbe Anbieter wie für die Datenbank; die AVV-Kette wird dadurch nicht länger. Ausgelöst von der Aufgabebedingung des Records selbst. Maßgeblich: `adr/0006-*.md`, Kasten „Änderung 2026-09-11" |
| ~~`07-Screen-Inventar.md` O-D~~ | ~~Anmeldekennung für Resident-Accounts ohne E-Mail — im Inventar zweimal widersprüchlich geführt~~ | War bereits über O-12 geklärt, die Inventarzeile widersprach nur ihrem eigenen Register. Nachgezogen 2026-09-11. Maßgeblich: `domain/identity.md` §2.1 (O-12) |
| ~~Wechsel der handelnden Identität innerhalb einer Sitzung~~ | ~~Bleibt der Profilwechsel, der zweimal Annahmen gebrochen hat?~~ | **Nein — abgeschafft.** Zwei Account-Typen, eine feste Identität je Sitzung; der Wechsel verlangt Abmelden und neue Anmeldung. Die 🔴-Prüffrage verliert ihren Gegenstand, G-D11 bekommt eine Substitution, G-D14 kommt neu hinzu. Maßgeblich: `adr/0013-zwei-account-typen-feste-identitaet.md` |
| ~~`02-SRD.md` O-09~~ | ~~S-50 verbietet dem Haushalts-Account `CastingRound`, aber O17, S-35 und `Room → not_available` brauchen Rundensicht~~ | **Geklärt (2026-09-14):** S-50 präzisiert, V-2 unverändert. Rundenidentität und Lebenszyklus sichtbar, alles aus `Application` Abgeleitete **einschließlich Zahlen** unsichtbar; erzwungen durch **G-D15**. Maßgeblich: `adr/0014-haushalts-account-sieht-runden-ohne-bewerbungsdaten.md` |
| ~~`03-PRD.md` P-O-10~~ | ~~Rechtematrix und Zustandsmaschine nennen verschiedene Tore für die Zimmer-Verfügbarkeit~~ | **Geklärt (2026-09-14):** neues Recht **`manage_rooms`**, vorbelegt bei `household_admin` und `moderator`. Verfügbarkeit ist eine Entscheidung der laufenden Runde und wirkt aufs Favoriten-Budget; `manage_settings` wäre das falsche Tor. Maßgeblich: `domain/identity.md` §2.1, `domain/zustandsmaschinen.md` §3.3 |
| ~~`04-Domaenenmodell.md` O-17~~ | ~~`created_by_profile_id` ist nullbar, aber seit S-50/U-20 erzeugt niemand mehr `null`~~ | **Geklärt (2026-09-14):** beide Spalten werden **`NOT NULL`**. Ein künftiger Systempfad bekäme eine benannte Quelle — „kein Wert" und „vom System" dürfen nicht gleich aussehen. Maßgeblich: `domain/casting.md` §2.2, `domain/scheduling.md` §2.4 |
| ~~`02-SRD.md` O-08~~ | ~~Token-Seite für Verfügbarkeiten aus v1.1 nach v1 vorziehen?~~ | **Nein.** v0.1 ist der vertikale Schnitt Bewerbung → Screening → Stimme → Ergebnis; Verfügbarkeiten kommen darin nicht vor, also kann die Seite nicht vorgezogen werden. Bleibt v1.1. **Tragende ID für diese Frage.** Maßgeblich: `02-SRD.md` §5.4 |
| ~~`03-PRD.md` P-O-07~~ | ~~dieselbe Frage~~ | → Verweis auf `02-SRD.md` O-08 |
| ~~`04-Domaenenmodell.md` O-11~~ | ~~dieselbe Frage~~ | → Verweis auf `02-SRD.md` O-08 |
| ~~`03-PRD.md` P-O-08~~ | ~~Dauer der „angemeldet bleiben"-Sitzung~~ | 90 Tage gleitend. Maßgeblich: `04-Domaenenmodell.md` §10.2 (O-13). War am Entstehungstag beantwortet |
| ~~`03-PRD.md` P-O-09~~ | ~~Wer setzt `phase_deadline_at`?~~ | Die moderierende Person, ohne Voreinstellung. Maßgeblich: `04-Domaenenmodell.md` §10.2 (O-14) |
| ~~`04-Domaenenmodell.md` O-5~~ | ~~Redaktionsregel für `ActivityEvent.payload`~~ | Bereits erfüllt: **G-D7** (Nutzlast gegen Schlüssel-Allowlist je `event_type` geprüft, mit Test, der Freitext erwartungsgemäß abweist) und **G-D8** (Redaktion am Fristende). Maßgeblich: `GUARDRAILS.md` §G-D |
| ~~`04-Domaenenmodell.md` O-1~~ *(Dokumentationsteil)* | ~~Drei verlangte Nachweise: Pflichthandlung im PRD, Risiko in `06`, benannte Grenze in `GUARDRAILS.md`~~ | Alle drei vorhanden: `03-PRD.md` §4.1.7, `06-Compliance-Anhang.md` §3.4 samt Q-14, `GUARDRAILS.md` G-D1. **Ein Restpunkt entschieden:** das PRD baut die **Rückfrage** („Gibt es frühere Bewerbungen dieser Person?"), Q-14 schlägt zusätzlich einen **Ähnlichkeitsvorschlag** vor. Das sind zwei verschiedene Funktionen mit verschiedener Rechtslage — die Rückfrage ist die Antwort, der Ähnlichkeitsvorschlag bleibt bei der anwaltlichen Prüfung unter Q-14 |
| ~~`07-Screen-Inventar.md` O-A…O-F~~ | ~~sechs UX-Punkte~~ | Alle sechs aufgelöst in `04-Domaenenmodell.md` §10.2: O-A→O-16, O-B→O-15, O-C→O-13, O-D→O-12, O-E→O-14, O-F→O-7 (`AppointmentAttendance`, U-23, S-51) |
| ~~`07-Screen-Inventar.md` AW-1…AW-13~~ | ~~Abweichungsliste gegen die übrige Kette~~ | Alle dreizehn abgearbeitet: AW-1/2/5/11/13 im PRD V0.6, AW-3/4/8/9/10 im Domänenmodell V0.4, AW-6/7/12 im Inventar selbst. §13 erhält eine Statusspalte |
| ~~Durchgang 1: `moved_out_at` / `moved_out_on`~~ | ~~Restposten aus einer Umbenennung~~ | Bereits behoben. `moved_out_at` steht nur noch an zwei historischen Stellen (Changelog `06`, dieser Befund); jede lebende Fundstelle heißt `moved_out_on` |
| ~~Durchgang 1: Aufwandsgegenprobe~~ | ~~„Keine Aufwandsschätzung, nirgends"~~ | Geschlossen 2026-09-08 durch den Phasenschnitt `02-SRD.md` §5.4. Die Zeile war noch als offenes 🔴 zitiert — korrigiert |
| ~~`domain/offene-punkte.md` O-15 (aktualisiert)~~ | ~~Standard-Nutzungsgrenze des Beitrittscodes — bisher „Zahl der noch fehlenden Bewohnenden"~~ | **Geklärt (2026-09-16, Prototyp-Abgleich).** Standard **1** (Einmal-Code) aus Sicherheitsgründen; Ausnahme der Gründungs-Link direkt nach A1, der weiterhin für mehrere Personen vorbelegt wird. Maßgeblich: `domain/offene-punkte.md` (O-15), nachgezogen in `08-UX-Entscheidungen.md` U-12, `domain/identity.md` §2.1, `screens/O-organisation.md` O16 |
| ~~`06-Compliance-Anhang.md` §11.2~~ | ~~Speicherformat von `Household.join_code` — die fünf Auflagen regeln Umgang, nicht Format~~ | **Geklärt (2026-09-16, Prototyp-Abgleich).** Klartext, dauerhaft lesbar für Moderation/Haushalts-Account desselben Haushalts — akzeptiertes Risiko, diese Rollen sind bereits authentifizierte Mitglieder. G-A5 (Log-/Query-String-Verbot) bleibt unverändert gültig. Maßgeblich: `domain/identity.md` §2.1, nachgezogen in `06-Compliance-Anhang.md` §11.2 |
| ~~Prototyp-Abgleich: Einladungsfluss v0.1 vs. v0.2~~ | ~~Prototyp-Baulog behandelte den Haushalts-Beitrittscode (S-49) als „Vorziehen von S-40/S-42" aus v0.2 — echter Konflikt oder Begriffsverwechslung?~~ | **Geklärt (2026-09-16): keine Scope-Änderung nötig.** S-49 (allgemeine Bewohner-Einladung) war immer v0.1 — nötig, um die eigenen Mitbewohnenden bei der ersten Runde zu registrieren. S-42 (`ApplicationInviteToken`, Einladung einer **bestätigten Bewerbung** nach Runde 2/Zusage) bleibt v0.2 und ist im Prototyp nicht gebaut. Der Baulog hat beide Dinge nur begrifflich vermischt. Maßgeblich: `02-SRD.md` §5.4, `docs/backlog/README.md` (F2) |
| ~~`08-UX-Entscheidungen.md` (neu)~~ | ~~Zweistufiges Entfernen von Mitgliedern ("Ausgezogen" vs. getippte Bestätigung "Entfernen") — im Prototyp gebaut, nie als Entscheidung festgehalten~~ | **Geklärt (2026-09-16, Prototyp-Abgleich), MAJOR:** als **U-27** aufgenommen — Moderationswerkzeug gegen Personen, die böswillig über den Einladungslink beigetreten sind. Maßgeblich: `08-UX-Entscheidungen.md` U-27, nachgezogen in `screens/O-organisation.md` O16 und `09-Design-System.md` |
| ~~`backlog/features/F5-ranking-hidden-until-you-vote.md`~~ | ~~Anti-Mitläufer-Begründung für `hide_results_until_voted` stand nur implizit da; offene Frage, ob Stimmkorrektur die Regel unterläuft~~ | **Geklärt (2026-09-16, Prototyp-Abgleich):** Begründung bereits vorhanden (Activity 1), ergänzt um die explizite Klarstellung, dass Stimmkorrektur vor Rundenschluss erlaubt bleibt und die Sichtbarkeitsregel nicht verletzt — „schon abgestimmt" (schaltet Sichtbarkeit frei) und „Stimme noch änderbar" sind unabhängige Fragen. Maßgeblich: `backlog/features/F5-ranking-hidden-until-you-vote.md` |
| ~~`backlog/requirements/F2-requirements.md` EC-2.2~~ | ~~Beitritt bei offener Runde: „**nicht** in den Teilnehmenden-Schnappschuss aufgenommen, die Moderation muss von Hand hinzufügen; der Nenner bleibt unverändert" — zitiert FR-1.18 in der Fassung **vor** deren Revision~~ | **Korrigiert (2026-09-21), vor Beginn der F2-Planung gefunden.** F1 **FR-1.18** wurde am 2026-09-17 auf **automatisch** umgestellt und ist seitdem als Trigger `membership_auto_join_open_rounds` (`drizzle/0010`, idempotent seit `0012`) in Betrieb: wer bei offener Runde beitritt, wird automatisch aufgenommen, markiert `joined_after_open`, und der Nenner **wächst**. EC-2.2 war damit nicht nur veraltet, sondern beschrieb das Gegenteil des gebauten Verhaltens — und hätte die Beitrittsstrecke und den Beteiligungszähler falsch geplant. Maßgeblich: `backlog/requirements/F1-requirements.md` FR-1.18 |
| ~~`backlog/requirements/F2-requirements.md` FR-2.4~~ | ~~Nutzungsgrenze des Beitrittscodes „vorbelegt mit der Zahl der noch erwarteten Bewohnenden" — der durch O-15 **ersetzte** Vorschlag~~ | **Korrigiert (2026-09-21), derselbe Befund-Typ wie EC-2.2.** O-15 hat den allgemeinen Standard am 2026-09-16 auf **1** (Einmal-Code) gesetzt und den alten Vorschlag ausdrücklich „ersetzt, nicht nur ergänzt"; die Zahl der erwarteten Bewohnenden gilt nur noch für den **Gründungs-Link** nach `A1`. FR-2.4 trug weiter den ersetzten Wortlaut. Ebenfalls nachgezogen: §8 des Pakets führte **P-O-08** als „genuine blocker", obwohl seit 2026-09-09 geschlossen (90 Tage gleitend, O-13). Maßgeblich: `domain/offene-punkte.md` §10.2 (O-15, O-13) |
| ~~`backlog/requirements/F2-requirements.md` FR-2.13~~ | ~~„kein Install-Prompt und keine E-Mail-Nachfrage im Beitrittsformular" — las sich als Verbot des **optionalen E-Mail-Feldes** und widersprach damit FR-2.11 desselben Pakets~~ | **Entschieden und korrigiert (2026-09-21), F2-Planung.** Die beiden Sätze regeln Verschiedenes: FR-2.11 regelt das **Formular**, FR-2.13 den **Vorgang**. Verboten ist, jemanden zu bedrängen — ein Install-Prompt oder eine **Nachfrage** nach einer Adresse. Ein sichtbar freiwilliges, leer abschickbares Feld mit einer Zeile Begründung darunter fragt niemanden etwas ab. `03-PRD.md` §4.1.1 zog diese Linie bereits („Resident-E-Mail-**Nachfrage**") und führt das optionale Feld als eigenes Akzeptanzkriterium — das Paket war die abweichende Seite, nicht das PRD. Nachgezogen: FR-2.13 und `screens/A-zugang.md` A3 (dort stand „E-Mail entfällt vollständig"). Maßgeblich: `03-PRD.md` §4.1.1 |
| ~~`backlog/requirements/F2-requirements.md` FR-2.8, AC-2.7–AC-2.9, EC-2.7~~ | ~~Eine abgelehnte Beitrittsanfrage soll „benennen, welcher der drei Gründe zutrifft" (abgelaufen / Nutzungsgrenze erreicht / rotiert)~~ | **Entschieden (2026-09-21), F2-Planung: eine einzige Meldung, kein Grund.** Drei Gründe, und der zweite ist der harte: (1) Die Aufschlüsselung verrät einer **nicht angemeldeten** Person, ob es den Code je gab und ob er bloß aufgebraucht war. (2) „Durch Rotation ersetzt" ist von „hat nie existiert" ohne eine `join_code`-Historie überhaupt nicht unterscheidbar — und die hat das Modell nicht (**O-18**, offen, siehe oben). Die Anforderung war damit nicht nur zu freigiebig, sondern in einem Drittel unimplementierbar. (3) EC-2.7 brauchte eine Vorrangregel zwischen zwei Gründen, die damit entfällt. **Was bleibt, ist die Hälfte, die der Usability-Test des Prototyps vermisst hat** („no recovery path", Notizen unter `coursework/exercise-12/`, bewusst nicht versioniert): der Hinweis „Frag in der WG nach einem aktuellen Link". **O-18 bleibt unberührt offen** — die Entscheidung wurde bewusst so getroffen, dass sie ihn nicht braucht. Nachgezogen: FR-2.8, AC-2.7–AC-2.9, EC-2.1, EC-2.7–EC-2.9, §8 Punkt 3, `screens/A-zugang.md` A3, `03-PRD.md` §4.1.1 |
| ~~`domain/offene-punkte.md` O-15 (Vorbelegung des Gründungs-Links)~~ | ~~Die Nutzungsgrenze des Gründungs-Links soll mit der „Zahl der bei der Gründung angegebenen erwarteten Bewohnenden" vorbelegt werden — diese Zahl erhebt niemand~~ | **Entschieden (2026-09-21), F2-Planung: in v0.1 nicht gebaut — die Vorbelegung wird zurückgestellt, nicht abgeschafft.** F2 fügt kein haushaltsweites Feld „erwartete Bewohnende" hinzu. Ein Beitrittscode trägt `join_code_max_uses` und sonst nichts; wer einen Link in den Gruppenchat gibt, erhöht die Zahl von Hand auf O16. Das erfüllt die Absicht von O-15 — ein Link soll nicht von mehr Personen einlösbar sein als gedacht — ohne ein Feld, dessen einziger Leser eine Vorbelegung wäre. **Der Preis wird benannt, nicht versteckt:** der Vorschlagswert in `domain/identity.md` §2.1 und `screens/O-organisation.md` O16 bleibt in v0.1 ein Vorschlag ohne Quelle. Wer ihn später einlösen will, braucht zuerst das Feld bei der Registrierung. Nachgezogen: `backlog/requirements/F2-requirements.md` §8 Punkt 2, `backlog/features/F2-join-in-two-fields.md` |
| ~~`03-PRD.md` §4.1.1 und `screens/A-zugang.md` A3 — wohin ein Beitritt führt~~ | ~~Beide führen direkt in den Screening-Durchlauf (C1) und nennen Start (B1) nur als Rückfallebene; **FR-2.18** des F2-Pakets sagt Start~~ | **Menschliche Entscheidung (2026-09-21), zwei Dokumente überstimmt — deshalb hier und nicht als stille Korrektur.** **FR-2.18 bleibt, wie sie steht; `03-PRD.md` §4.1.1 und A3 werden nachgezogen.** Drei Gründe, einer davon ein Beleg: (1) **Beleg** — der eigene Usability-Test des Prototyps (Notizen und Aufnahmen unter `coursework/exercise-12/`, bewusst nicht versioniert) landet auf dem Startbildschirm und protokolliert das als „the strongest moment in the flow" und als „the clearest hit against the stated success criterion (land immediately on exactly what to do next, not a blank dashboard)"; die Aufnahme zeigt Start mit **einer** Karte, die nach C1 führt — einen Tipp entfernt, nicht automatisch. (2) **Struktur** — Start ist der Ort, an dem die Vorrangregel FR-2.24 lebt; ein Sprung darüber hinweg umginge das Aufgabenmodell auf genau dem Bildschirm, für den es existiert. (3) **Einheitlichkeit** — EC-2.3 (Beitritt ohne offene Runde) wird derselbe Weg statt eines Sonderfalls. **Konsequenz für die Umsetzung, nicht nur für den Text:** B1 muss existieren, bevor die Beitrittsstrecke ausgeliefert wird — sonst landet eine beitretende Person auf `(org)/dashboard`, und das ist **O1**, die Organisationsfläche: falsches Publikum, falscher Inhalt, und genau das „ankommen und stehenbleiben", vor dem R-2.5 warnt. Maßgeblich für die Landung: `backlog/requirements/F2-requirements.md` **FR-2.18** |
| ~~`04-Domaenenmodell.md` O-18~~ *(tragende Zeile)* | ~~`join_code`-Historie fehlt — ein einzelner rotierender Code mit Zähler, keine Historie einzelner Ausstellungen~~ | **Entschieden (2026-09-21) zugunsten der Historie, während die Planung von F2-Change-1 lief — und das ist der Grund, aus dem die Zeile so ausführlich ist: die Entscheidung hat das Anforderungspaket geändert, nicht nur eine Frage beantwortet.** Auslöser war ein Abgleich der geplanten Umsetzung gegen den Prototyp-Bildschirm O16: dort erzeugt die moderierende Person **Links**, jeder mit eigener Frist („Gültig für (Tage)"), eigener Grenze („Höchstens nutzbar"), eigenem Zähler („0 von 1 genutzt") und eigenen Handlungen („+7 Tage", „Löschen"); tote Links bleiben als Historie stehen. Das ist nicht der Bildschirm zu einem rotierenden Code, sondern zu einer Entität. **Drei Belege lagen bereits im Repository und wurden beim Planen übersehen:** (1) `screens/O-organisation.md` O16 sagte schon „ein bereits verwendeter Link wird gelöscht, ohne dass das etwas an den darüber bereits beigetretenen Mitgliedschaften ändert" — ein Satz, der unter einem einzigen rotierenden Code kaum Sinn ergibt; (2) `Membership.joined_via_code` steht seit F1 im Schema und wird nirgends geschrieben, weil es unter dem alten Modell keinen Zweck hat; (3) O-18 selbst schlug `JoinCodeIssuance` namentlich vor. **Neu:** Entität `JoinCodeIssuance` (`domain/identity.md` §2.1) mit `code`, `expires_at`, `max_uses`, `uses`, `created_by_account_id`, `deleted_at`; die fünf `join_code*`-Spalten verlassen `Household`; `Membership.joined_via_code` wird zu `joined_via_issuance_id` (ein Verweis, keine Kopie — sonst trüge die Zeile den Code selbst und unterliefe G-A5). **Das gefrorene `04-Domaenenmodell.md` wird nicht angefasst:** es bleibt der V0.4-Schnappschuss, die lebende Fassung ist `domain/identity.md`. O-18 hatte die Entscheidung genau deshalb aufgeschoben — das war eine Vorsicht zu viel, denn der Schnappschuss darf divergieren; das ist seine Aufgabe. Nachgezogen: `F2-requirements.md` (FR-2.1, FR-2.3–FR-2.6, AC-2.9, EC-2.1/2.8/2.9, §8 Punkt 3), `screens/O-organisation.md` O16, `SPEC-INDEX.md`, `08-UX-Entscheidungen.md` U-12, `GUARDRAILS.md` G-A5, `02-SRD.md` S-49 |
| ~~`F2-requirements.md` FR-2.1~~ | ~~„Each household shall have exactly one join code […] There shall be no per-person codes"~~ | **Geändert (2026-09-21), Folge aus O-18.** Ein Haushalt kann mehrere Links gleichzeitig offen haben. **Die Absicht der Zeile bleibt, ihre Zahlangabe fällt:** **US-2.1** begründet FR-2.1 mit „so that I am not managing one code per person" — das verbietet, dass das System einen Code je Person **verlangt**, nicht, dass die moderierende Person einen zweiten Link ausstellt. Die alte Formulierung beschrieb die Kardinalität des damaligen Modells und las sich wie eine Anforderung. Ein Link für den Gruppenchat muss weiterhin immer genügen. Die personengebundene Einladung einer zugesagten **Bewerbung** bleibt davon unberührt und v0.2 (`ApplicationInviteToken`, S-42). Ebenfalls geändert: US-2.1, US-2.3; neu US-2.14, US-2.15. Maßgeblich: `F2-requirements.md` FR-2.1 |
| ~~Format des Beitrittscodes~~ | ~~`randomUUID()` — nie als Entscheidung festgehalten, sondern aus F1's Registrierung übernommen~~ | **Entschieden (2026-09-21): kurzer, von Hand eingebbarer Code (Bauform `UAMPN-QACVZ`) — zusammen mit einer Versuchsbegrenzung, als eine Entscheidung.** **P-1 Kanalneutralität** verlangt, dass alles, was per Link ankommt, auch von Hand eingegeben werden kann; niemand tippt 36 Zeichen von einem Zettel ab, also genügte das `uuid` P-1 nicht. Daraus folgen zwei weitere Anforderungen: **FR-2.27** (eine Eingabe von Hand muss es überhaupt geben — ein tippbarer Code ohne Feld erfüllt nichts) und **FR-2.28** (Versuchsbegrenzung). **Warum die Begrenzung nicht optional ist:** die Prüfung eines Codes ist ein Orakel gegen den **gesamten Bestand**, nicht gegen einen Haushalt — ein Rateversuch wird gegen jeden lebenden Link geprüft, der Suchraum teilt sich also durch deren Zahl. Bei einem Haushalt belanglos, bei zehntausend nicht. Beide Hälften gehören zusammen; die erste ohne die zweite auszuliefern würde die einzige verbliebene Zugangskontrolle (C-2.4) schwächen statt sie benutzbar zu machen (**C-2.12**). Maßgeblich: `domain/identity.md` §2.1 (sechste Auflage), `F2-requirements.md` FR-2.26–FR-2.28, C-2.12 |
| ~~Pfad der Beitrittsroute~~ | ~~Der Prototyp zeigt `/beitritt/<code>`; die Codebasis benennt Routen englisch~~ | **Entschieden (2026-09-21): `/join/<code>`.** **ADR-012** stellt implementierungsnahe Bezeichner auf Englisch, und ein Routensegment ist ein Bezeichner, kein Oberflächentext — die Abweichung vom Prototyp ist beabsichtigt und keine Nachlässigkeit. Der Prototyp ist ohnehin ausschließlich Gestaltungsreferenz, nie Quelle einer Implementierungsentscheidung. Der Code bleibt **Pfadsegment** und wird nie Query-Parameter (**G-A5**). Maßgeblich: `adr/0012-*.md`, `GUARDRAILS.md` G-A5 |
| ~~`close_round`-Vorbelegung~~ | ~~`claimResidentProfile` leitete das Recht `close_round` bisher implizit aus „erste beigetretene Bewohner-Mitgliedschaft" ab — eine Annäherung an `backlog/requirements/F1-requirements.md` §8 Punkt 1, die neben der eigenen Empfehlung lag, sobald eine Mitbewohnerin vor der registrierenden Person selbst beitrat, und die einem Profil eine für alle anderen unsichtbare Sonderstellung gab~~ | **Menschliche Entscheidung (2026-09-22): Rolle-Vorbelegung statt Ableitung aus der Ankunftsreihenfolge.** `close_round` wird jetzt, wie `manage_rooms` (P-O-10), vorbelegt bei `household_admin` **und** `moderator` — wer Rundenkontrolle braucht, wird zur Moderation ernannt, statt sie über einen Zufall der Reihenfolge zu erhalten. **Abgabebedingung, in der Quelle selbst festgehalten:** ein **drittes** derart vorbelegtes Recht öffnet S-04s Ausschluss von `Berechtigungsvorlagen` neu, statt ihn ein weiteres Mal zu dehnen. Maßgeblich: `domain/identity.md` §2.1, nachgezogen in `backlog/requirements/F1-requirements.md` §8 |
| ~~Übernahme eines vorbereiteten Profils ohne Link~~ | ~~Ein vorbereitetes `ResidentProfile` ließ sich mit Haushalts-ID und dem angezeigten Namen übernehmen, ohne ein Geheimnis vorzuweisen — das Passwort wurde bei der Übernahme selbst erst gesetzt, und die Haushalts-ID ist ausdrücklich „keine Sicherheitsgrenze, nur Zuordnung" (C-1.4)~~ | **Menschliche Entscheidung (2026-09-22): der Einladungslink bindet sich optional an ein vorbereitetes Profil, und das ist danach der einzige Weg, es zu übernehmen.** `JoinCodeIssuance` erhält ein nullbares `resident_profile_id`. Ein Link ohne diesen Wert verhält sich wie jeder bisherige — seine Einlösung legt ein neues Profil an. Ein Link mit gesetztem Wert übernimmt stattdessen genau das benannte, bereits vorbereitete Profil; die besuchende Person wird namentlich begrüßt und nur nach einem Passwort gefragt, nie nach dem Namen. Der bisherige eigene Übernahme-Weg entfällt vollständig — es gibt danach keinen Weg mehr, ein vorbereitetes Profil ohne einen dafür ausgestellten Link zu übernehmen. Die Ablehnung bleibt für beide Link-Arten dieselbe einzelne Meldung (FR-2.8) — bewusst keine eigene Formulierung für einen verbrauchten gebundenen Link, anders als `screens/A-zugang.md` A4 es für den v0.2-Token vorsieht. Maßgeblich: `domain/identity.md` §2.1 |
| ~~U-27's harter Entfernen-Schritt landete in `moved_out`~~ | ~~`removeMember` setzte `resident_profile.status = 'moved_out'`, den Zustand der weichen Stufe — eine entfernte Person erschien mit dem „Ausgezogen"-Badge und einer Reaktivieren-Handlung, ein Klick stellte den Zugriff wieder her. Widerspruch zu U-27's „«Entfernen» (hart, endgültig)" direkt, nicht nur der Lesart nach~~ | **Menschliche Entscheidung (2026-09-22): ein vierter `ResidentProfile.status`, `removed`, ohne Übergang heraus — durchgesetzt per Datenbank-Trigger, nicht nur im Anwendungscode.** Drei weitere, im selben Zug entschiedene Punkte: **der Anzeigename einer entfernten Person wird sofort wieder frei** (FR-1.4 entsprechend erweitert); **eine entfernte Person erscheint nicht mehr auf O16s Bewohnerliste** (Audit-Spur bleibt, FR-1.30/AC-1.23 unverändert); **ein lebender Link, über den eine entfernte Person beigetreten ist, trägt eine Warnung neben „Löschen"**, ohne die Person zu nennen, und wird nicht automatisch gelöscht. Zusätzlich beim Planen gefunden und mitgeschlossen, weil eine Entfernung sonst weniger als endgültig wäre: `signIn` prüfte `revoked_at` der Mitgliedschaft nicht, ein neues Einloggen hätte den Zugriffsentzug rückgängig gemacht (V-3, „sofortiger Zugriffsentzug"); `getRoundParticipants` prüfte `resident_profile.status` nicht, eine ausgezogene oder entfernte Person blieb auf der Teilnehmendenliste einer offenen Runde. Bestehende harte Entfernungen vor dieser Änderung werden per Migration nachgezogen: nur ein Profil, dessen letztes Mitgliedschafts-Ereignis `membership.removed_as_intruder` ist, wird zu `removed`; ein bloßer Auszug bleibt reaktivierbar. **Menschliche Entscheidung (2026-09-23, aus dem 8.3-Rundgang):** der Hinweis zeigte sich fälschlich auch auf einem aufgebrauchten Einmal-Link, und tote Links überfüllten O16. Zwei Korrekturen: der Hinweis gilt jetzt nur für einen **lebenden** Link (nicht gelöscht, nicht abgelaufen, Nutzungen übrig) statt für jeden nicht gelöschten — ein aufgebrauchter oder gelöschter Link kann nie wieder verwendet werden und trägt deshalb keinen Hinweis, ein abgelaufener bekommt ihn mit „+7 Tage" zurück; und tote Links (abgelaufen, aufgebraucht, gelöscht) stehen jetzt in einem standardmäßig eingeklappten Abschnitt unterhalb der lebenden — weiterhin vollständig gelistet, nur nicht mehr ungefragt sichtbar. Maßgeblich: `08-UX-Entscheidungen.md` U-27, `domain/invarianten.md` §5.3 (V-3), nachgezogen in `domain/identity.md` §2.1, `backlog/requirements/F1-requirements.md` FR-1.4/FR-1.26, `screens/O-organisation.md` O16 |
| ~~Beitrittscode von Hand eingeben — eigener Bildschirm oder Feld auf A3?~~ | ~~Änderung 2 (join-by-link, PR #17) verschob die manuelle Eingabe und die beiden Sign-in-Einstiege ausdrücklich in eine eigene Folgeänderung, ohne deren Bauform festzulegen~~ | **Menschliche Entscheidung (2026-09-23): ein eigener Bildschirm `/join`, der normalisiert und weiterleitet, statt ein Codefeld auf A3 selbst.** A3 kann erst nach Auflösung des Codes wissen, ob sie neutral oder gebunden begrüßt (ein Feld oder zwei), und FR-2.9 verlangt den Haushaltsnamen vor jeder Eingabe — ein kombiniertes Formular verletzt beides. `/join` löst deshalb nichts auf: es normalisiert nur und leitet auf `/join/<CODE>` weiter, wo A3 wie gehabt entscheidet. **Leer** wird als „Beitrittspfad ohne Code" gelesen, keine wörtliche leere Liste — A3 kennt kein Listenformat. **Bewusst offen gelassen:** die Bewohner:in-Anmeldung (A2) fragt nach einer Haushalts-UUID, die niemand, der über einen Link beigetreten ist, je gesehen hat; A2 verspricht eine Vorbelegung, die nirgends geschieht, und wird damit zur Sackgasse, sobald die Sitzung endet. Der Fehler betrifft A2/O-12, nicht A3, und braucht eine eigene Lösung (ein Geräte-Cookie allein löst nur ein Gerät) — hier nur benannt, nicht behoben. **`next dev` druckt den Einladungspfad ins Terminal**, weil sein Anfragen-Log standardmäßig jeden eingehenden Pfad protokolliert; die Entwicklungskonfiguration ignoriert `/join/`-Pfade jetzt ausdrücklich. Das Produktions-Zugriffslog bleibt, wie schon in Änderung 2 festgehalten, eine Aufgabe der Bereitstellung. Maßgeblich: `backlog/requirements/F2-requirements.md` FR-2.27/FR-2.9, `GUARDRAILS.md` G-A5, `screens/A-zugang.md` A2/A3 |
| ~~`GUARDRAILS.md` G-D15 (Datenbankhälfte für `Application`)~~ *(neu und geschlossen 2026-09-24)* | ~~Eine Sitzung ohne `ResidentProfile` konnte per Roh-SQL unter `app_runtime` `SELECT count(*) FROM application` ausführen: `application` trug nur die Haushalts-Isolationspolicy, und der Roh-SQL-Test zu G-D15 fragte `application` nie ab, obwohl das Manifest G-D15 als `implemented` führte. Gefunden bei der Planung des Startbildschirms~~ | **Geklärt 2026-09-24:** zwei RESTRICTIVE-Policies auf `nullif(current_setting('app.profile_id', true), '') IS NOT NULL` (`domain/invarianten.md` §5.5; das `nullif` deckt den Wert `''` auf einer wiederverwendeten Pool-Verbindung ab) — auf `application` für alle Befehle, auf `activity_event` nur für das Lesen von Zeilen mit `subject_type = 'application'`. `round_participation` bleibt bewusst frei: nichts darin ist aus `Application` abgeleitet, und der Haushalts-Account schreibt es selbst beim Öffnen einer Runde. Migration `drizzle/0018`, je ein Test über die Policy-Schicht und als rohes SQL (G-C7), beide im G-D15-Eintrag des Manifests. Restpflichten oben unter „Implementierungspflichten". Maßgeblich: `GUARDRAILS.md` G-D15, `adr/0014-haushalts-account-sieht-runden-ohne-bewerbungsdaten.md` |
| ~~Beteiligungsstand auf Start — behalten oder verschieben?~~ | ~~`03-PRD.md` §4.1.2, `backlog/requirements/F2-requirements.md` FR-2.22/AC-2.14 und `screens/B-start.md` B4 sahen „5 von 7 haben abgestimmt" auf dem Start-Bildschirm B1 vor~~ | **Menschliche Entscheidung (2026-09-24): der Beteiligungsstand verlässt Start. Er steht stattdessen im Casting-Tab (D1), nach dem Screening, zusammen mit dem Scoreboard.** B4 (Teilnehmendenliste) verliert damit seinen Einstieg von B1 — er bleibt über D1 erreichbar, das bereits einen eigenen Zugang zu B4 hat. Geänderte Stellen: `03-PRD.md` §4.1.2 (Tabellenzeile *Beteiligungsstand* entfernt, Satz mit Verweis hierher ergänzt); `backlog/requirements/F2-requirements.md` FR-2.22 und AC-2.14 (beide *withdrawn*, nicht gelöscht — IDs sind dauerhaft), US-2.12 (auf D1 verwiesen), die Zusammenfassungszeile in §1; `backlog/features/F2-join-in-two-fields.md` (dieselbe Story-Zeile ergänzt); `screens/B-start.md` B4 *Zugang* (`„… auf B1 oder D1"` → `„… auf D1"`). **`02-SRD.md`s eigene Erwähnung „„5 von 7 haben abgestimmt" im Rundenkopf" wird NICHT geändert** — sie beschreibt D1s Rundenkopf, nicht B1, und bleibt damit weiterhin zutreffend. Der Inhalt des Zählers selbst (Zähler/Nenner-Regel, V-3 (b)) ist unverändert und gilt weiterhin überall, wo er gezeigt wird. **Zugleich festgehalten:** B1 (Start) liegt unter `/dashboard`, die Organisationsfläche O1 unter `/organization` — das Konto des Haushalts (kein `ResidentProfile`) landet auf O20 (`/settings`). Maßgeblich: `screens/B-start.md` B1/B4, `03-PRD.md` §4.1.2 |
| ~~`domain/identity.md` O-16 — Passwort-Reset ohne E-Mail, im Widerspruch zu EC-2.6~~ *(neu und geschlossen 2026-09-24)* | ~~`03-PRD.md` §4.1.1 (K-18) und `domain/identity.md` §2.1 (O-16) versprechen, dass die Verwaltung das Passwort eines Resident-Profils ohne E-Mail zurücksetzen kann; `backlog/requirements/F2-requirements.md` **EC-2.6** sagte stattdessen, eine Wiederherstellung sei unmöglich und die Moderation müsse ein neues Profil anlegen — ein Widerspruch, gefunden bei der Planung von `resident-settings` (E1)~~ | **Menschliche Entscheidung (2026-09-24), vier Teile.** (1) **Anbieter-Wechsel plus E-Mail-Anmeldung:** trägt eine Person eine echte `email` nach — beim Beitritt angegeben oder später in den eigenen Einstellungen (E1) hinterlegt —, **ersetzt** diese die abgeleitete Kennung beim Anbieter, statt daneben zu stehen; von da an kann die Person sich zusätzlich mit dieser Adresse und ihrem Passwort anmelden (O-12), `(Household, display_name) + Passwort` bleibt daneben immer möglich. (2) **Keine Entfernung der Adresse:** sie lässt sich ändern, nie löschen — Kosten: Datenminimierung hängt fortan von der Kontolöschung ab, nicht mehr von einer Entfernungsfunktion. (3) **Reset per Einmal-Link statt direktem Reset durch die Verwaltung:** eine wörtliche Rückkehr nach `prepared` ist unmöglich (`active → prepared` ist kein deklarierter Übergang, ADR-002/G-D3; ein `prepared`-Profil läge mitten in V-3s Nenner; die Übernahme würde mit dem bestehenden Auth-Nutzer kollidieren). Die Verwaltung (`Membership.is_resident = false`, **ausschließlich der Haushalts-Account**, nicht die Moderation — U-30s Bewohnerlisten-Parität gilt hier nicht) stellt stattdessen einen einmal verwendbaren Link für ein **aktives** Profil ohne `email` aus; das Einlösen setzt das neue Passwort, beendet **alle** Sitzungen des Profils und erzeugt `account.password_reset_by_admin` — inhaltlich unverändert gegenüber der ursprünglichen O-16-Absicht, nur als Link statt als direkter Reset. Ausgestellt werden kann ein Link nur, solange das Profil-Konto keine `email` trägt; sobald eine hinterlegt wird, schließt sich die Lücke, und ein bereits ausgestellter, nicht eingelöster Link wird ungültig. (4) **EC-2.6 korrigiert** auf das K-18/O-16-Verhalten, markiert *(corrected 2026-09-24)*. Maßgeblich: `domain/identity.md` §2.1 (O-12, O-16); nachgezogen in `backlog/requirements/F2-requirements.md` EC-2.6 |

### Nicht mehr hier geführt

Die Fachdokumente behalten ihre Fragen samt Begründung, verlieren aber die Statusspalte. Wer
dort eine Statusangabe findet, hat einen Fehler gefunden: **G-N5** prüft das.

---

## Durchgang 1 — 2026-08-19

**Geprüfter Stand:** `01` V0.2 · `02` V0.4 · `03` V0.5 · `04` V0.3 · `05` V0.5 · `06` V0.6 ·
`GUARDRAILS.md` V0.6 — zusammen ~8700 Zeilen in neun Dateien. Entstanden aus fünf Fragerunden
(Ergebnis: `00-Session-Brief.md`) und vier Querprüfungsrunden mit drei parallel arbeitenden
Sub-Chats.

> **Zum Zustand dieser Zeile.** Sie stand bis zuletzt auf „SRD V0.1, PRD V0.1, ~7960 Zeilen",
> während weiter unten die Lehre notiert war, dass Versionszeilen nicht mitwandern. Damit ist der
> Defekt dreimal aufgetreten — in `01`, in `03` und hier — und das dritte Mal in dem Dokument, das
> ihn beschreibt. Behoben, aber stehengelassen als Beleg: **die Regel „Versionszeile mitziehen" ist
> genau die Sorte Zusicherung, die ohne Mechanismus nicht hält**, und sie ist damit ein viertes
> Beispiel für den Befund weiter unten.

### Maschinell geprüft

Alle Befunde per `grep` gegen die Dateien, nicht aus den Selbstauskünften der Sub-Chats übernommen.
Die Spalte „Nachlauf" hält fest, was die Querprüfung geschlossen hat.

| Prüfung | Erstbefund | Nachlauf |
|---|---|---|
| Alle SRD-Scope-Zeilen im PRD referenziert | ✅ 37 von 37 | ✅ **41 von 41.** Der PRD-Chat hat S-38 bis S-41 für die vier Nachträge selbst angelegt, weil die Kette sonst genau daran gerissen wäre — nicht beauftragt. Akzeptanzkriterien von 149 auf 210 |
| **PWA gegen Löschkonzept** | ❌ Erst in der dritten Runde aufgefallen, beim Prüfen von § 25 TDDDG: **eine PWA, die Bewerberdaten offline vorhält, legt personenbezogene Daten auf die Geräte der Bewohnenden — außerhalb der Reichweite der 180-Tage-Löschautomatik.** ADR-011 hätte das Löschkonzept unterlaufen, ohne dass es irgendwo auffällt | ✅ Entschieden: der Service Worker cacht ausschließlich die App-Hülle, niemals Bewerber- oder Beratungsdaten. Offline heißt „die App startet ohne Netz", nicht „die Daten sind ohne Netz da". Als Bedingung in ADR-011, als Grenze des Löschkonzepts in `06` §5, als Guardrail |
| **Gegendarstellung mit eigener Frist** | ❌ `subject_statement` unter derselben 180-Tage-Regel ist richtig, aber ein *eigener* Zeitgeber hätte ein Fenster geöffnet, in dem „Ich widerspreche der Aussage, ich sei unpünktlich gewesen" ohne die Aussage dasteht — und damit den Inhalt der gelöschten Beurteilung **rekonstruierbar** macht | ✅ Kein eigener Zeitgeber, erbt die Frist der `Application`, Löschung in derselben Transaktion |
| Offline-Puffer für Stimmen gegen die Service-Worker-Grenze | ❌ Folgekollision der Service-Worker-Entscheidung: das PRD hatte einen Offline-Puffer für abgegebene Stimmen, der per Definition ⚫-Daten aufs Gerät legt. Die zunächst angebotene Begründung („kein fremdes Datum betroffen") war **falsch** — ein `Vote` ist `application_id` plus Wert und damit eine Beurteilung über eine dritte Person | ✅ Ausnahme bleibt, Begründung ersetzt: **unabgeschlossene Transaktion, keine gespeicherte Kopie** (§ 25 Abs. 2 Nr. 2 TDDDG deckt das stärker als App-Hüllen-Caching). Tragend ist die **harte Höchstlebensdauer unabhängig vom Versanderfolg** — ohne sie trägt ein Gerät, das Monate später zurückkommt, eine Beurteilung über eine längst gelöschte Bewerbung, also dasselbe Leck durch die Hintertür. Dazu: keine Anzeigedaten im Puffer, Verwerfen statt Wiederholen, Leeren bei Abmeldung |
| Divergenz in der **umgekehrten** Richtung | ❌ Im dritten Durchgang führte `06` drei Felder ein, die `04` nicht kannte (`Household.contact_email`, `privacy_notice_state`, `privacy_notice_published_*`) | ✅ an `04` weitergegeben. Lehre siehe Retrospektive |
| Alle zwölf ADR-Nummern in den Fachdokumenten referenziert | ✅ vollständig. ADR-006 fehlt im SRD — korrekt, das SRD bleibt lösungsneutral | — |
| 17 verbindliche Entitätsnamen unverändert | ✅ keine Abwandlung | — |
| P-1…P-5 namentlich referenziert, nicht umformuliert | ✅ in allen sechs Fachdokumenten | — |
| **Feldnamen** einheitlich | ❌ ~17 Divergenzen zwischen `04` und `06` (`applicant_name`/`display_name`, `state`/`status`, `retention_until`/`deletion_due_at`, `can_vote`/`is_eligible_to_vote`, `actor_profile_id`/`acting_profile_id` …) | ✅ angeglichen, `04` ist Schema-Autorität. **Restposten:** `moved_out_at` gegen `moved_out_on` — beim Umbenennen durchgerutscht, nachgemeldet |
| ADR-003 in `GUARDRAILS.md` referenziert | ❌ null Treffer — die Ereignis-Log-Regeln standen als Architektur- und Rechtsaussage da, aber nicht als prüfbare Zusicherung | ✅ G-D7 bis G-D10 nachgetragen (kein Wert im Payload, Redaktion zum Fristende, `became_resident_id` nie `null`, Pool-Wiederverwendungstest) |
| Vier fehlende Modellbestandteile | ❌ `collected_from`, `AvailabilityToken`, `subject_statement`, `PasskeyCredential` fehlten im Domänenmodell | ✅ alle vier modelliert |
| **Klassen-Notation** zwischen `04` und `06` abbildbar | ❌ `04` klassifiziert 🔴/🟠/⚫/⚙️, `06` nach Verarbeitungszweck (`META`/`KONFIG`). Substanziell deckungsgleich, aber die Gegenprobe „jedes 🔴/🟠/⚫-Feld hat eine Zeile" ist ohne Abbildungstabelle nicht mehr maschinell prüfbar | ✅ `06` §6.0 als Brücke nachgetragen |
| Überprüfbare Negativaussage stichprobenartig gegengeprüft | ✅ Behauptung „Quorum-Schwelle kommt in `06` und `GUARDRAILS.md` nicht vor" trifft zu (0 Treffer) | — |
| Datenschutzseite je Haushalt: erzeugt **und** freigegeben? | ❌ „von Flatmate.io erzeugt, im Namen des Haushalts veröffentlicht" wäre eine rechtliche Erklärung im Namen eines Dritten — als Auftragsverarbeiter darf man sie vorbereiten, freigeben muss der Verantwortliche | ✅ `06` §4.5 um `draft` → `published` als ausdrückliche Handlung erweitert, plus Guardrail G-C9 |
| Zwei rechtliche TBDs, die keine sein mussten | ❌ Zuständige Aufsichtsbehörde und Postanschrift des `Household` standen als offen, hätten aber eine Ortsangabe erzwungen, die es nicht gibt | ✅ `06` §4.6: Art. 13 Abs. 2 lit. d verlangt nur das *Bestehen* des Beschwerderechts, nicht die Benennung der Behörde; und die Haushalts-E-Mail ist die verhältnismäßige Kontaktangabe — eine WG, die Bewerbenden ihre Postanschrift offenlegt, erzeugt das Gegenteil dessen, was die Pflicht bezweckt |

---

### Multi-Rollen-Review

**🎯 Produkt**

| Prüfpunkt | Befund |
|-----------|--------|
| Problem klar? | ✅ Belegkette „Ist-Prozess in 13 Schritten" mit Spalte „was kaputt geht", verdichtet auf sechs Aufgabenarten; jeder Schritt im PRD-Hauptfluss zugeordnet |
| Kennzahlen messbar? | ✅ Beteiligungsquote > 80 % als Kern, sechs Beobachtungs- und sieben Zweitordnungsmetriken |
| Scope abgegrenzt? | ✅ 37 einzeln zitierbare In/Out-Zeilen plus Phasenschnitt v1 / v1.1 / v1.2 / v2 |
| Wettbewerb belegt? | ✅ `besichtigungstermine.com` als reale Teilüberlappung benannt, WhatsApp als eigentlicher Wettbewerber, Ashby/Greenhouse als Benchmark, Roomi/Badi ausdrücklich als falsche Analogie |
| Regulatorik im Produktrisiko verankert? | ✅ Der Art.-15-Posten steht als **erster** Eintrag in SRD §7, nicht als Fußnote |
| **Lücke** | ✅ **Adressiert (2026-09-08)** — `02-SRD.md` §5.4 ist in **v0.1 (vertikaler Schnitt)** und **v0.2 (vollständige Runde = v1)** unterteilt; das ist die hier geforderte Aufwandsgegenprobe. S-19/S-20 (Solver) und S-26 (Kalender) sind dabei nach v1.1 gewandert. Ursprünglicher Befund: 🔴 **Keine Aufwandsschätzung, nirgends.** Der v1-Scope wurde festgelegt, ohne dass die verfügbare Zeit je zur Sprache kam — bei Zustandsmaschine, doppelter Autorisierung, CP-SAT-Solver, PWA und Löschautomatik ist das die größte offene Produktfrage. Siehe Retrospektive |
| **Lücke** | ⚠️ Baseline-Erhebung (SRD O-07) noch nicht durchgeführt; sie muss **vor** dem Ersteinsatz im Testhaushalt stattfinden, sonst ist der Vorher/Nachher-Vergleich verloren |
| **Lücke** | ⚠️ Das Geschäftsmodell (Spenden, Vermieter-Freemium ab v2) ist eine Haltung, keine Rechnung. Hostingkosten pro Haushalt sind nirgends geschätzt |

**🎨 Design**

| Prüfpunkt | Befund |
|-----------|--------|
| Szenarien konkret genug? | ✅ 23-Schritt-Hauptfluss mit Ist-Schritt-Zuordnung, Datenübergabe und sechs Nebenflüssen |
| Nutzergruppen differenziert? | ✅ fünf Gruppen mit Rechtematrix und Wechsel-/Herabstufungslogik |
| Akzeptanzkriterien prüfbar? | ✅ 210 Checkboxen, insbesondere für die Sichtbarkeitsinvariante |
| Inhaltsregeln für Freitext? | ✅ C-1…C-8 plus vier konkrete Notiz-Prompts **und** eine Negativliste („Wie war der Gesamteindruck?", Sterne, Persönlichkeitsmerkmale) |
| **Lücke** | ⚠️ **Kein Screen-Inventar** — bewusst abgewählt. Folge: Leer-, Lade- und Fehlerzustände existieren nur als nichtfunktionale Anforderung, nicht je Screen; visuelle Sprache ist undefiniert |
| **Lücke** | 🔴 Der **Feinschliff-Screen** ist die einzige wirklich neue Interaktion des Produkts und hat keine Gestaltungsspezifikation. Genau an ihm hängt, ob das Budget als Hilfe oder als Gängelung erlebt wird — der Einwand, der die vierstufige Skala überhaupt erzeugt hat |
| **Lücke** | ⚠️ Onboarding beim allerersten Beitritt nicht beschrieben, obwohl Aktivierungsfriktion als Hauptrisiko benannt ist |

**🔧 Engineering**

| Prüfpunkt | Befund |
|-----------|--------|
| Datenmodell klar? | ✅ 20 Entitäten (17 aus dem Bezeichner-Kontrakt, drei — `Session`, `AvailabilityToken`, `PasskeyCredential` — ausdrücklich als Erweiterung *außerhalb* des Kontrakts markiert, damit ihre Namen beim Aufsetzen der Module noch änderbar sind), drei Zustandsmaschinen, I-1…I-10 als Invarianten, **52 personenbezogene Felder in 16 der 20 Entitäten** klassifiziert (10 ⚫ · 14 🔴 · 28 🟠). Ohne Inventarzeile bleiben nur `HouseholdSettings`, `CastingRound`, `RoundParticipation`, `Slot` |
| Klassifizierung belastbar? | 🟡 Die Summe musste **zweimal** nachgezogen werden: V0.1 war falsch gerechnet (33 statt 35), dann 50 → 52 durch die Nachträge. Beide Male vom Sub-Chat selbst gemeldet. Der Schluss daraus ist der eigentliche Befund: **die Feldtabellen sind maßgeblich, nicht die Summe** — und dass ein sorgfältig geschriebenes Dokument seine eigene Summe zweimal nachziehen musste, ist das stärkste Argument für ADR-010, das diese Session produziert hat. Belegt statt behauptet: ein Datenbestandsverzeichnis muss ein CI-Gate sein, weil eine Zahl in einem Dokument verlässlich veraltet |
| Sichtbarkeitsregeln implementierbar? | ✅ V-1…V-4 als Prädikate, mit Arbeitsteilung: V-1/V-2/V-3 zusätzlich als RLS, **V-4 ausdrücklich nicht** (eine Zeilen-Policy auf `votes` würde dem Aufrufer den Mittelwert verfälschen) |
| Nichtfunktionale Anforderungen? | 🟡 vorhanden, aber die Zielwerte sind gesetzt, nicht abgeleitet (< 1,5 s Rundenkopf, < 10 s Solver-Abbruch, 200 Haushalte / 30 000 Bewerbungen) |
| Technische Risiken? | ✅ Solver-Determinismus, Solver-Ausfall, Invarianten-Leckpfade, AI-Implementierung — jeweils mit Gegenmaßnahme |
| Guardrails durchsetzbar? | ✅ **Stand 2026-09-08: 70 Regeln auf 68 Positionen** (`GUARDRAILS.md` §Bilanz; die Zahlen unten sind der Stand zum Zeitpunkt des Durchgangs) — damals 64 Regeln auf 61 Positionen in 13 Klassen (44 🟢, 5 🟡, 7 gemischt, 5 🔴), jede mit Durchsetzungsklasse **und einer Bilanztabelle, die die fünf rein prosaischen Positionen namentlich als Grenze des Dokuments ausweist** |
| Subtilster technischer Fund? | ✅ **G-C8** — `SET LOCAL` nur innerhalb einer Transaktion. Sonst haftet der Wert an der *Verbindung* statt an der Transaktion: Anfrage B erbt den Haushaltskontext von A, RLS arbeitet dann völlig korrekt mit dem falschen Haushalt, und bei einer einzigen Testverbindung fällt es nie auf. Ein Leck **durch** die Sicherheitsmaßnahme hindurch. Erst durch G-D10 (Pool-Wiederverwendungstest) überhaupt durchsetzbar |
| Vier Folgefunde aus V0.2 | ✅ Beim Modellieren der drei Nachtragsentitäten fielen vier Regeln an, die vorher niemand formuliert hatte: **`Session.acting_profile_id` darf nur auf ein Profil mit gültiger `Membership` desselben Accounts zeigen** — ohne die Prüfung ist der Profilwechsel eine Rechteausweitung; **die Seite hinter dem `AvailabilityToken` zeigt nur Zeitraster und Art.-13-Hinweis, keinen Namen** — wer den Link abfängt, sieht ein leeres Raster; **`subject_statement` ist 🔴 und ausdrücklich *nicht* V-1-geschützt**, weil es die Aussage der betroffenen Person über sich selbst ist und sie ihre eigene Gegendarstellung lesen darf; **das Löschen des letzten Passkeys entzieht nie den Zugang** — sonst kippt ADR-007 vom Aufsatz in eine Abhängigkeit und verletzt genau das P-2, das er schützen soll |
| Benannte Kehrseite von ADR-010 | ✅ Ehrlich mitgeschrieben statt verschwiegen: **vier Verbraucher aus einer Quelle heißt, ein Generierungsfehler wirkt an vier Stellen gleichzeitig.** Eine falsch als ⚙️ deklarierte Spalte fehlt dann nicht nur im Verzeichnis, sondern auch in Log-Redaktion, Fehler-Tracker-Filter, Auskunftsexport und Löschung |
| **Lücke** | ⚠️ Kein Teststrategie-Kapitel. Die sechs geschützten Tests (G-D1…G-D6, in V0.2 auf zehn erweitert) decken die Invarianten, aber nicht die Frage, was sonst getestet wird und wie |
| **Lücke** | ⚠️ Sicherung und Wiederherstellung (RPO/RTO) offen, hängt an ADR-006. Bei einem Werkzeug mit Löschautomatik ist ein Backup, das die Frist überlebt, zugleich ein Compliance-Problem — dieser Zusammenhang ist nirgends ausgeschrieben |
| **Lücke** | ⚠️ Der Python-Kindprozess aus ADR-005 hat keine Paketierungs- und Auslieferungsskizze über die Entscheidung hinaus |

---

### Retrospektive

**Dünnste Abschnitte und warum**

1. **Aufwandsschätzung** — existiert nicht. Echte Lücke, nicht bewusste Auslassung. Siehe unten.
2. **Design-Perspektive** — dünn, weil das Screen-Inventar abgewählt wurde. Bewusste Entscheidung
   des Autors; die Folge (Feinschliff-Screen ohne Spezifikation) ist trotzdem real.
3. **SRD §3.3 Markenwirkung** — TBD. Für ein spendenfinanziertes Vorhaben ohne Marktziel gibt es
   dazu ehrlicherweise nichts zu sagen.
4. **SRD §8.2 A/B-Testing** — begründetes TBD, und die Begründung wurde im Schreiben besser als
   meine: nicht nur „kein Traffic", sondern fachlich — eine Aufteilung *innerhalb* eines Haushalts
   beschädigt das Verfahren, statt es zu messen.
5. **Rechtliche Abschnitte** — 14 offene Fragen, vier davon launch-blockierend. Dünn von Natur aus,
   korrekt als solche markiert und nicht weggeschrieben. Q-4 (Art.-9-Daten im Freitext ohne
   tragfähige Rechtsgrundlage) ist der ehrlichste Abschnitt der ganzen Dokumentation.

**Welche Fragen hätten früher gestellt werden sollen**

| Was zu spät kam | Wirkung | Lehre |
|-----------------|---------|-------|
| **Das Zeitbudget wurde nie erfragt** | Der v1-Scope steht ohne jede Aufwandsgegenprobe. Zustandsmaschine plus doppelte Autorisierung plus CP-SAT plus PWA plus Löschautomatik ist für ein Solo-Vorhaben viel | Genau diese Lehre steht schon im Review-Log von Notella: *„Bei Solo-Vorhaben gehört ‚wie viel Zeit hast du wirklich?' in die erste Fragerunde."* Sie wurde nicht angewendet. **Ein Review-Log, das nicht vor der nächsten Session gelesen wird, ist Dekoration** |
| Der Bezeichner-Kontrakt fixierte **Entitäten, nicht Felder** | ~17 Feldnamen liefen in paralleler Arbeit auseinander; eine Korrekturrunde. Und die Divergenz kam in der **dritten** Runde erneut, nur umgekehrt: `06` führte drei `Household`-Felder ein, die `04` nicht kannte | Beim Parallelisieren muss der Kontrakt so tief sein wie die Kopplung — Entitätsnamen koppeln nicht, Felder tun es. Die Wiederholung zeigt aber die eigentliche Lehre: **es genügt nicht, eine Autorität zu benennen; es braucht einen Weg, auf dem eine Neuanlage sie erreicht.** Sonst erzeugt jede Runde neue Divergenz in der Richtung, aus der gerade geschrieben wird |
| Die Wechselwirkung PWA gegen Löschautomatik wurde nie gestellt | Zwei Entscheidungen des Briefs (ADR-011 und die 180-Tage-Frist) widersprachen sich, und es fiel erst in der dritten Querprüfungsrunde beim Prüfen einer *dritten* Norm auf | Nach jeder Entscheidung fragen: *welche andere Entscheidung berührt sie?* Zwei je einzeln richtige Festlegungen können zusammen falsch sein — und genau diese Paare stehen in keiner Checkliste |
| Die Phasentabelle des Briefs widersprach dem Entscheidungsteil (Verfügbarkeits-Link v1 gegen v1.1) | Fiel erst auf, als ein Sub-Chat den Token modellieren musste | Eine Phasentabelle darf nicht *neben* der Entscheidungsliste geschrieben werden, sondern muss aus ihr abgeleitet und gegengeprüft werden |
| Der Quorum-Standardwert wurde nie entschieden | Drei Chats mussten ihn erfinden; einer fand eine bessere Begründung als ich (eine leere Rangliste demotiviert genau die Beteiligung, die sie voraussetzt) | Nach jeder Entscheidung fragen: *welche Parameter impliziert sie?* Ein Verfahren ohne Schwellenwert ist keine Entscheidung |
| Art. 14 wurde behauptet, bevor er geprüft war | Eine alarmistische Fehldarstellung — Scraping-Panik plus die Aussage, die Informationspflicht treffe die Plattform. Für Auftragsverarbeiter gilt Art. 14 gar nicht, und im Regelfall greift Art. 13 | Rechtsaussagen **vor** der Behauptung verifizieren, nicht nach dem Widerspruch. Die Rückfrage des Autors hat hier einen Fehler in meiner Analyse gefunden |
| V-1 wurde als „harte, testbare Invariante" verkauft | Sie ist prosaisch weich: `became_resident_id` wird **manuell** gesetzt, und eine Person mit zwei Bewerbungen leckt über die alte. Drei Chats fanden das unabhängig | Wenn ich eine Invariante als hart bezeichne, muss die Anschlussfrage lauten: *wer setzt das Feld, und was passiert, wenn es niemand tut?* |

**Zur Methode: drei parallele Sub-Chats mit gemeinsamem Vertrag**

Das war die Neuheit dieser Session, und sie hat sich gerechnet — aber nicht aus dem Grund, den ich
erwartet hatte. Der Gewinn war nicht die Geschwindigkeit, sondern die **redundante Lesung**: drei
Chats lasen denselben Brief mit unterschiedlicher Fachbrille und fanden drei Dinge, die der Brief
nicht hatte.

- Der **Compliance-Blick** entdeckte, dass die Art.-13/14-Achse im Domänenmodell gar nicht
  darstellbar war: `Application.source` ist der technische Pfad, nicht die Erhebungsquelle.
- Der **Modell-Blick** entdeckte, dass das append-only Ereignis-Log ein bequemer Umweg um die
  Selbst-Redaktion ist, wenn Payloads Werte statt Referenzen tragen — ein Sicherheitsleck, kein
  Compliance-Punkt. Und er fand die V-1-Verknüpfungslücke.
- Der **PRD-Blick** entdeckte, dass eine Veto-Begründung ihre Urheberin verrät, Art. 15 Abs. 4
  also nicht schützt, was er zu schützen scheint.

Kosten der Methode: die ~17 Feldnamen-Divergenzen, und zwei Chats meldeten fertig, **bevor** meine
Nachtragsnachrichten bei ihnen ankamen — Nachrichten kreuzten sich, weil ich die Querprüfung erst
nach der ersten Rückmeldung startete. Lehre: bei parallelen Agenten die Querprüfung beginnen,
sobald die **ersten** Artefakte auf der Platte liegen, nicht wenn der erste Bericht eintrifft.

**Der eigentliche Grund, warum sich die Parallelität gerechnet hat**, ist aber ein anderer als
„drei Blickwinkel" — und die schärfste Fassung dazu kam am Ende vom Compliance-Chat selbst:

> Die wertvollsten Funde waren nicht die Regeln, die beim ersten Schreiben getroffen wurden,
> sondern die vier Stellen, an denen die Querprüfung etwas fand, das in **keinem** Einzeldokument
> falsch war: die ADR-003-Lücke, der `SET LOCAL`-Fall, die Wechselwirkung zwischen
> `subject_statement` und ihrer Bezugsaussage, und der Service Worker gegen das Löschkonzept.
> **Alle vier lagen *zwischen* zwei richtigen Entscheidungen.**

Das ist ein Argument für parallele Bearbeitung *mit* Querprüfung und gegen ein einzelnes, in sich
konsistentes Dokument: ein kohärenter Text kann diese Fehlerklasse nicht enthalten — und deshalb
auch nicht sichtbar machen. Erst wenn zwei je richtige Festlegungen in getrennten Dateien stehen und
jemand beide gleichzeitig liest, fällt der Widerspruch auf. Redundanz war nicht der Preis der
Methode, sondern ihr Wirkmechanismus.

Konsequent dazu die einzige nicht erzwingbare Regel, die trotzdem in `GUARDRAILS.md` aufgenommen
wurde: **„Was passiert damit beim Profilwechsel?"** — als 🔴 gekennzeichnete Prüffrage für jede neue
zustandsbehaftete Komponente, begründet damit, dass genau diese Frage zwei reale Lecks gefunden hat
(V-1 am Account statt am Profil, Leeren des Stimmpuffers beim Wechsel), beide durch Querprüfung und
keines durch einen Mechanismus. Eine Frage in einem Regelwerk zu dokumentieren ist unüblich; hier
ist es richtig, weil ihre Trefferquote belegt ist.

**Was gut lief**

- **Der Widerspruch war produktiv, in beide Richtungen.** Vier Vorschläge des Autors haben meine
  geschlagen: die vierstufige Skala („Unbedingt" *ist* das Favoriten-Signal und spart den zweiten
  Screening-Durchlauf), der Haushalts-Account als echtes Login mit Profilwechsel, CP-SAT statt
  Hungarian (parallele Castings mit Bewohner-Abdeckung sind gekoppelte Zuweisungen), und die
  Absage an Passkey-only. Vier Vorschläge der Sub-Chats ebenso: `quorum_share = 0.5`, V-1 am
  Account statt am aktiven Profil, zweiphasige Zielfunktion statt gewichteter Summe, feste
  Relaxationsreihenfolge.
- **Zwei Rechtsbehauptungen wurden auf Nachfrage geprüft, eine davon korrigiert.** Art. 15 hielt
  (BFH und BGH 2025, weite EuGH-Auslegung), Art. 14 nicht.
- **Die Unverbindlichkeit von `04` und `05` war die richtige Vorgabe.** Weil jeder ADR
  „Vorschlag — anfechtbar" trägt, wurden Aufgabebedingungen mitgeschrieben („das gibt man auf,
  wenn …") statt falscher Gewissheit.
- **Die S-Nummern haben die Querprüfung von Lesen auf `grep` reduziert.** Eigenentscheidung des
  PRD-Chats, nicht Vorgabe — und die nützlichste der Session.
- **Eine neue Gattung geschützter Test ist entstanden.** Der PRD-Chat hat für die S-40-Lücke einen
  Test formuliert, der eine **bekannte Grenze als erwartetes Verhalten dokumentiert** und
  ausdrücklich nicht so umgeschrieben werden darf, dass die Grenze verschwindet. Ein normaler
  geschützter Test sichert eine Zusicherung — dieser sichert ein *Eingeständnis*. Bei
  AI-geschriebenem Code ist genau das nötig, weil ein Agent eine dokumentierte Lücke sonst als Bug
  behandelt und „behebt", indem er den Test anpasst.
- **Zwei Begründungen der Sub-Chats waren besser als meine.** Gegen den automatischen
  Personenabgleich: *zwei verschiedene „Lea Müller" zu verschmelzen wäre schlimmer als die Lücke* —
  ein Falsch-Positiv zeigt Person A die Beurteilungen über Person B, also ein größeres Leck als
  das, das es schließen soll. Und G-C9 als **Typ** statt als Prüfung: ein
  `PublishedPrivacyNotice`, der nur aus einem freigegebenen Datensatz konstruierbar ist, ist der
  Unterschied zwischen einer Regel, die man befolgen muss, und einer, die man nicht brechen kann.
- **Die Sub-Chats haben gegen sich selbst gearbeitet, nicht nur für sich.** Einer fand und
  korrigierte seinen eigenen Zählfehler; einer schrieb die Kehrseite seiner eigenen Verschärfung
  mit; einer wies die Grenze seines eigenen geschützten Tests aus, mit dem Satz, dass ein Test,
  der eine Teilmenge prüft und Vollständigkeit suggeriert, schlimmer ist als kein Test. Das war
  nicht beauftragt.
- **Entschiedene offene Punkte behalten ihre Nummer.** `04` §10 ist in „in V0.2 entschieden" und
  „weiter offen" geteilt, statt erledigte Punkte zu löschen — Querverweise aus PRD, `06` und
  `GUARDRAILS.md` treffen weiter. Kleine Konvention, große Wirkung bei sechs Dokumenten, die sich
  gegenseitig zitieren.

**Das erste Dokument der Kette ist das wahrscheinlichste Einstiegs- *und* Veraltungsdokument**

`01-Problem-Framing.md` stand nach vier Revisionsrunden noch auf V0.1, und `03-PRD.md` ebenso —
Revisionen wandern nach unten, Versionszeilen nicht mit. Der eigentliche Fund war aber nicht die
Zahl: **die E-Tabelle in `01` liest sich wie das vollständige Entscheidungsverzeichnis des
Vorhabens, ist es aber nicht.** E-01…E-27 hält die Beschlüsse der Anforderungs-Session, während
fünf Festlegungen mit dem höchsten Compliance-Gewicht als S-38…S-41 im SRD entstanden sind:
Art.-13/14-Weiche, Absatzverwerfung im Erfassungsmoment, Zuordnung früherer Bewerbungen,
Gegendarstellung, Service-Worker-Grenze. Wer nur das Problem Framing liest — und das ist bei einem
Problem-Framing-Dokument der wahrscheinlichste Einstieg — hält den Stand für vollständig.

Gelöst wurde es richtig: ein Hinweis vor der Tabelle, der die Lücke ausspricht, die fünf Punkte
benennt, begründet warum sie nicht dort stehen (sie sind keine Beschlüsse der Session) und
weiterschickt. **Nicht** durch Nachtragen als E-28 ff. — das hätte die Tabelle als Sitzungsprotokoll
entwertet.

**Lehre:** Bei einer Dokumentenkette gehört in das *erste* Dokument ein Satz darüber, was es
**nicht** enthält. Vollständigkeit ist dort keine Eigenschaft, sondern eine Behauptung, die mit
jeder Revision weiter unten falscher wird.

**Der Profilwechsel ist zweimal die Stelle gewesen, an der Annahmen brechen**

Erst bei V-1: die Selbst-Redaktion musste am **Account** hängen und nicht am aktiven Profil, sonst
wäre der Wechsel der Umweg um die Invariante gewesen. Dann eine Schicht tiefer beim Sendepuffer:
meine vier Zusicherungen stellten auf Abmeldung und Sitzungsentzug ab — der Profilwechsel ist
keines von beidem, der Puffer überlebt ihn, und dann hält der Kontext von Profil B die Stimmen von
Profil A. Beide Male derselbe Fehlertyp, beide Male von einem Sub-Chat gefunden, nicht von mir.

**Warum es kein Zufall ist** — die Formulierung stammt vom ADR-Chat und ist die tragende:

> Der Profilwechsel ist der **einzige Vorgang im Produkt, der die handelnde Identität ändert, ohne
> die Sitzung zu beenden.** Jede Regel, die „pro angemeldeter Person" gedacht ist, gehört gegen ihn
> geprüft.

Bei V-1 war es **Lesezugriff**, beim Stimmpuffer **Schreibzugriff** — beide Male war die
naheliegende Annahme „eine Sitzung = eine Person", und beide Male lag die richtige Antwort auf der
weniger naheliegenden Seite. Der übertragbare Teil ist deshalb nicht „zweimal denselben Fehler
gefunden", sondern eine **benannte Prüffrage für alles, was danach kommt**: entsteht im Repo eine
dritte Regel, die pro Person denkt, ist der Profilwechsel der erste Test, nicht der letzte.

Dazu ein zweiter Befund derselben Runde, der die Kategorie einer Regel verschiebt: eine doppelt
eingespielte Stimme ist **kein Zählfehler, sondern ein falsches Datum über eine Person** — es
verschiebt Score und Quorum-Nenner, beides auskunftspflichtig, und die betroffene Person bekäme es
in einer Auskunft nach Art. 15 zu sehen. Damit wandert Idempotenz von „saubere Arithmetik" zu
Art. 5 Abs. 1 lit. d, mit einem Berichtigungsanspruch nach Art. 16 auf eine Stimme, die niemand
zweimal abgegeben hat.

**Das stärkste wiederkehrende Muster: Spezifikationsdichte ist nicht Durchsetzung**

Dreimal in vier Runden stand eine Regel ausführlich und mehrfach in den Spezifikationsdokumenten —
und fehlte in `GUARDRAILS.md`:

1. **ADR-003** (Ereignis-Log): null Referenzen in den Guardrails, obwohl die Payload-Regel in `04`
   und `06` je einen eigenen Block hatte.
2. **Die Pfad-Redaktion des Beitrittscodes** im Zugriffslog: musste zwischen zwei Chats
   weitergetragen werden, weil keiner Schreibrecht in der Datei des anderen hatte.
3. **Die Höchstlebensdauer des Stimmen-Puffers**: fünfmal in `03`, zweimal in `05`, einmal in `06` —
   nullmal als Regel. Und von den vier Zusicherungen der Puffer-Ausnahme ist genau diese die
   einzige, die sie überhaupt trägt.

Der dritte Fall ist der lehrreichste, weil er nicht aus Nachlässigkeit entstand: die Regel war
gründlich beschrieben, an drei Stellen, mit Begründung. Sie konnte trotzdem keinen Build brechen.

**Lehre:** Bei jeder Regel, die als Zusicherung formuliert ist, ist die Anschlussfrage nicht „steht
sie im Dokument?", sondern **„welche Datei bricht, wenn sie verletzt wird?"** Wo die Antwort „keine"
lautet, ist sie eine Absicht. Das ist genau die Unterscheidung, die die Durchsetzungsklassen
🟢/🟡/🔴 leisten sollen — sie greift aber nur für Regeln, die es überhaupt in die Datei geschafft
haben. Bei getrennten Schreibrechten braucht es dafür einen Weg, keinen guten Willen.

Der Compliance-Chat hat daraus den **Mechanismus** formuliert, und der ist der brauchbarere Teil:
*Prosa-Zusicherungen in Fachdokumenten brauchen **beim Entstehen** einen Guardrail-Verweis, sonst
entsteht die Lücke systematisch und wird nur zufällig gefunden.* Alle drei Fälle oben wurden durch
eine Querprüfung entdeckt, nicht durch einen Mechanismus — das ist Glück, nicht Prozess.

**Und eine Einschränkung meiner eigenen Prüfmethode**, die dabei sichtbar wurde: die Querprüfung
lief über `grep` nach Begriffen. Das prüft **Vokabular-Konsistenz, nicht semantische Anwesenheit.**
Wo das Vokabular selbst der Gegenstand ist — die 17 Feldnamen, die ADR-Nummern, die S-Zeilen —
trifft die Methode zuverlässig. Eine Regel, die unter einem anderen Wort steht, liest sie als
abwesend: die Höchstlebensdauer hieß im PRD zunächst „spätestens 7 Tage", war also vorhanden und
nur unter diesem einen Suchwort unsichtbar. Ich habe hier mit drei Synonymen gesucht und damit
Glück gehabt. Ein viertes Wort wäre durchgefallen. Wer so prüft, muss die tragenden Begriffe vorher
festlegen — dann ist es eine Prüfung und keine Stichprobe.

**Wo der Review-Durchgang bewusst endet**

Die dritte und vierte Querprüfungsrunde haben je einen echten Fund gebracht — die PWA gegen das
Löschkonzept, dann den Stimmen-Puffer gegen die eben beschlossene Service-Worker-Grenze. Beide
waren **Folgekollisionen**: jede geschlossene Lücke hat eine neue Berührung erzeugt. Das kann
prinzipiell weiterlaufen, und irgendwann korrigiert man Dokumente statt ein Produkt.

Der Durchgang endet hier, weil die verbleibenden Fragen nicht mehr durch Nachlesen entschieden
werden können, sondern durch Bauen: ob die Höchstlebensdauer des Puffers sieben Tage oder einer
ist, ob das Zeitbudget des Solvers reicht, ob der Feinschliff-Screen als Hilfe erlebt wird. Das
sind Fragen an einen Prototyp, nicht an eine Spezifikation. Die offenen Punkte sind numeriert und
auffindbar — O-1 bis O-11 in `04`, O-01 bis O-08 in `02`, Q-1 bis Q-14 in `06` — und das ist die
richtige Form, in der sie auf die Implementierung warten.

**Der übertragbare Teil: drei Bauformen gegen eine Fehlerklasse**

Vorschlag des PRD-Chats, und der beste Kandidat für etwas, das über dieses Projekt hinaus taugt.
Aus vier Runden Gegenprüfung sind drei Dokumentationsbauformen entstanden, die in keiner Vorlage
stehen und alle gegen **dieselbe** Fehlerklasse gerichtet sind: eine Regel, die **formal erfüllt
ist und ihren Zweck verfehlt**.

| Bauform | Beispiel | Wogegen sie schützt |
|---|---|---|
| **Test, der eine bekannte Grenze als erwartetes Verhalten festschreibt** — und ausdrücklich nicht so umgeschrieben werden darf, dass die Grenze verschwindet | S-40 / G-D1: V-1 schützt nur *verknüpfte* Bewerbungen | Ein Agent behandelt eine dokumentierte Lücke als Bug und „behebt" sie, indem er den Test anpasst. Ein normaler geschützter Test sichert eine Zusicherung — dieser sichert ein **Eingeständnis** |
| **Dokumentierte verworfene Begründung für eine angenommene Entscheidung** | PRD §6.2 „Verworfene Begründung — bewusst dokumentiert, nicht gestrichen": *nicht* „kein fremdes Datum betroffen" | Nicht der Wiederaufbau des falschen Grunds, sondern die **Erweiterung per Analogie** daraus: wer das falsche Argument als tragend liest, hält als nächstes einen lokalen Notizentwurf für ebenso unproblematisch — und der ist es nicht. Ein ADR hält verworfene *Optionen*; das ist die Ebene darunter |
| **Zusicherung an einen Ankerpunkt gebunden statt an eine Erwartung** | Höchstlebensdauer des Puffers hängt an der **Entstehungszeit**, nicht am letzten Versandversuch | „7 Tage seit dem letzten Versuch" ist eine zulässige Lesart derselben Worte und verlängert sich bei jedem Aufwachen des Geräts beliebig weit. Meine Fassung war nicht falsch, sondern **unterspezifiziert** — und genau das ist die gefährlichere Sorte, weil sie sich richtig liest |

Die dritte Zeile ist auch die genauere Attribution: der PRD-Chat hat darauf bestanden, das als
*Präzisierung* zu führen und nicht als Fund, weil „unabhängig vom Versanderfolg" die Verlängerung
inhaltlich schon ausschließt und nur der Ankerpunkt fehlte. Ebenso hat er den Verdienst am
Puffer-Konflikt relativiert: wer eine fremde Regel in ein Dokument einarbeitet, das er selbst
geschrieben hat, stolpert zwangsläufig über den Widerspruch — bemerkenswert wäre gewesen, ihn zu
finden, ohne beide Zeilen nebeneinander zu sehen. Beide Korrekturen sind zutreffend und stehen
hier, weil ein Review-Log, das Beiträge großzügiger zuschreibt als sie waren, seinen Zweck verliert.

**Nächster Schritt**

Vor der ersten Zeile Code: Aufwandsgegenprobe des v1-Scope (die 🔴-Lücke oben), Baseline-Erhebung
im Testhaushalt (SRD O-07, danach nicht rekonstruierbar), und Klärung von Q-1 bis Q-4 aus
`06-Compliance-Anhang.md`.

---

## Durchgang 2 — 2026-08-31 (Produkt-Audit-Konsistenzabgleich)

**Auslöser.** `Product-Audit-Hypotheses.md` (V0.4) hatte 21 ungeprüfte Annahmen benannt. Der
Autor gab dazu neun Rückmeldungen — teils Korrekturen an der Prämisse des Audits, teils neue
Produktentscheidungen, teils Bestätigungen, dass etwas bereits geklärt ist. Ziel dieses
Durchgangs: die sieben Kern-Spec-Dokumente und `GUARDRAILS.md` konsistent nachziehen, dann das
Audit selbst auf V0.5 heben. Methode: drei parallele Explore-Agents zum Auffinden der
Fundstellen, danach neun Bearbeitungs-Agenten (einer je Zieldokument, in Abhängigkeitsreihenfolge:
Domänenmodell → SRD → fünf parallele Dokumente → Audit-Dokument), gefolgt von einem manuellen
Konsistenz-Sweep.

### Was geändert wurde

| # | Rückmeldung | Ergebnis | Betroffene Dokumente |
|---|---|---|---|
| 1 | „Werkzeug nicht ausgesucht" ist zu absolut — die organisierende Person ist selbst Bewohnende, informelle Vorab-Zustimmung ist der Regelfall | Zehn Stellen umformuliert; R-02 heißt jetzt „Low-Commitment-Zustimmung, nicht Nicht-Zustimmung" | `01`, `02`, `05`, Audit (H-D1) |
| 2 | CastingNote-Erinnerung nach dem Casting-Termin | Neue Scope-Zeile **S-46**, Entität `AppointmentAttendance` (löst O-7), Guardrail **G-D13** | `02`, `03`, `04`, `GUARDRAILS`, Audit (H-D2) |
| 3 | „Werkzeug-Reduktion" impliziert fälschlich Ersatz von WhatsApp/WG-Gesucht | Ziel umformuliert: Casting-Vorgänge laufen nicht mehr parallel im Chat, kein Ersatzanspruch | `02`, Audit (H-D3) |
| 4 | Ist die Informationspflicht bei WG-Gesucht-Übernahme wirklich offen? | **Keine Änderung** — `06` §4 hatte das bereits korrekt geklärt (Art. 13 beim Haushalt, nicht Art. 14) | — |
| 5 | Zeitliche Begrenzung von Abstimmungsrunden | Neue Scope-Zeile **S-44** (`phase_deadline_at`), **v1** statt Kandidat — speist CTA-Sortierung im Dashboard | `01`, `02`, `04`, Audit (H-D8) |
| 6/7 | Einladungslink-Sichtbarkeit generalisieren, Doppelregistrierung als Fehler statt stiller Überschreibung | Neue Scope-Zeile **S-42**, Entität `ApplicationInviteToken`, Guardrail **G-D12**; `joined_at` bekommt zweiten Zweck (Moderatoren-Sichtbarkeit) | `02`, `03`, `04`, `GUARDRAILS`, Audit (H-F5) |
| 8/10 | E-Mail-Benachrichtigungen ins Backlog, PWA-Installation verbindlich führen | Web Push von v1.1 nach **v1** vorgezogen, E-Mail wird Fallback-Kanal; neue Scope-Zeile **S-45** (Install-Banner + zurückhaltende Resident-E-Mail-Abfrage); neue Entität `PushSubscription`; **E-22 korrigiert** (V0.2→V0.3 in `01`); ADR-011-Begründung umgedreht | `01`, `02`, `03`, `04`, `05`, `06`, Audit (H-F6) |
| 9 | Spenden-E-Mail nach 3–4 Runden statt offenem Ort | **O-05 aufgelöst** zu Scope-Zeile **S-43** (v1.1): einmalige E-Mail an die Household-E-Mail, außerhalb des In-App-Flows | `01`, `02`, Audit (H-V4, H-V7) |

**Neues E-Mail-Konzeptmodell**, weil eine erste Fassung fälschlich drei Felder unterschied:
Household-E-Mail (`Account.email` des Haushalts-Admin-Accounts, Pflicht) und Resident-E-Mail
(`Account.email` eines Resident-Accounts, jetzt optional/nachpflegbar) — zwei Konzepte, nicht
drei. `Household.contact_email` (Art.-13-Kontakt für Bewerbende) bleibt unbeteiligt.

### Ein eigener Fehler in diesem Durchgang, stehengelassen als Beleg

Der Ausführungsplan wies jedem Zieldokument eine Liste zu erledigender Themen zu — und verlor
dabei **Thema 2** aus der Zuordnung für `02-SRD.md`, obwohl der Plantext selbst bereits „Neue
Scope-Zeile S-43" für die CastingNote-Erinnerung festgehalten hatte. Der SRD-Bearbeitungs-Agent
bekam diesen Auftrag nie und vergab **S-43 stattdessen an die Spenden-E-Mail** (Rückmeldung 9,
die in derselben Sitzung ebenfalls eine neue Nummer brauchte). Der Fehler fiel erst beim Lesen
der Agenten-Zusammenfassung auf, nicht vorher — die CastingNote-Erinnerung bekam per Nachtrag
**S-46**. Betroffen war nur diese eine Datei; kein anderer Agent hatte zu dem Zeitpunkt bereits
mit der falschen Nummer gearbeitet.

**Lehre:** Eine Pro-Dokument-Aufgabentabelle, die aus mehreren Themenabschnitten heraus manuell
zusammengestellt wird, ist selbst eine Fehlerquelle — jede Zeile „Dokument X bekommt Themen A, B,
C" muss gegen **jeden** Themenabschnitt geprüft werden, der dieses Dokument erwähnt, nicht nur
gegen die eigene Spalte der Tabelle. Eine `grep` nach dem Dateinamen über alle Themenabschnitte
hinweg hätte die Lücke vor dem Dispatch gefunden, nicht danach. Dasselbe Muster wie in Durchgang
1 (Feldnamen-Divergenz bei paralleler Arbeit): **Nummern- und Zuordnungs-Konflikte bei
paralleler Vergabe verlangen einen Abgleichsschritt, der nicht optional ist, weil „eine Tabelle
geschrieben zu haben" nicht dasselbe ist wie „sie gegengeprüft zu haben."**

### Weitere Nacharbeiten aus dem manuellen Konsistenz-Sweep

Drei Stellen hatten die Bearbeitungs-Agenten korrekt als außerhalb ihres Auftrags liegend
gemeldet, statt sie unbeauftragt zu ändern — genau das richtige Verhalten, aber es brauchte einen
Nachlauf: die „Übernommen aus SRD"-Phasentabelle in `03-PRD.md` §7.1 (fehlende S-42/44/45/46,
veraltete Web-Push-Zuordnung), die v1-Scope-Liste in `01-Problem-Framing.md` (gleiches Muster),
und die `GUARDRAILS.md`-Zusammenfassungstabelle samt Bilanz-Zählung (neue G-D12/G-D13 fehlten in
der Übersichtstabelle, obwohl sie im Haupttext standen). Alle drei sind jetzt nachgezogen.

**Bestätigtes Muster aus Durchgang 1:** „Spezifikationsdichte ist nicht Durchsetzung" gilt
spiegelbildlich auch für Konsistenz-Updates — eine Regel an ihrer Hauptstelle zu ändern reicht
nicht, wenn dieselbe Datei an anderer Stelle eine eigene, redundante Zusammenfassung derselben
Information führt (Zähltabellen, Phasenübersichten, Scope-Listen). Jede Redundanz ist ein
zusätzlicher Ort, an dem eine Änderung vergessen werden kann.

### Ergebnis

Alle neun Rückmeldungen sind jetzt in den Spec-Dokumenten verankert (S-42 bis S-46, E-22
korrigiert, O-05 aufgelöst) und `Product-Audit-Hypotheses.md` steht auf **V0.5**, konsistent mit
dem neuen Spec-Stand. Zwei neue Guardrails (G-D12, G-D13) sichern die beiden neuen
Prozessregeln. Offen bleibt, was auch Durchgang 1 offenließ: Die tatsächliche Wirkung von S-44
(Rundenfrist) und S-46 (Notiz-Erinnerung) ist ungeprüft — beide sind jetzt spezifiziert, nicht
validiert. Das ist der Unterschied, den das Audit selbst zwischen „Entscheidung" und „Hypothese"
zieht, und er gilt für die in diesem Durchgang neu entstandenen Scope-Zeilen genauso wie für die
alten.

---

## Durchgang 3 — 2026-09-02 (UX-Schicht: Aufgabenmodell, Rollenschnitt, Screen-Inventar)

**Auslöser:** Die Frage des Autors, wie die Anforderungen als Oberfläche aussehen sollen — was ein
Bewohner sieht, was der Moderator zusätzlich tut, und wie beim Öffnen der App ohne Navigieren klar
wird, was gerade ansteht. Damit ist genau die Lücke adressiert, die Durchgang 1 unter 🎨 Design
als bewusst abgewählt vermerkt hatte.

**Stand dieses Eintrags:** Er dokumentiert **Entscheidungen und Befunde**, nicht abgeschlossene
Dateiänderungen. Die Umsetzung läuft parallel in vier Sitzungen (Screen-Inventar, SRD, PRD,
Domänenmodell); ihre Ergebnisse werden hier nachgetragen. Diese Trennung ist Absicht — ein
Review-Log, das Vorhaben als Vollzug verbucht, ist wertlos.

### Was maschinell geprüft wurde

| Prüfung | Befund |
|---|---|
| **Versionszeilen gegen Dateiinhalt** | ❌ **Das Spec-Update vom 02.09. hat ~1600 Zeilen geändert, fünf Scope-Zeilen und drei Entitäten ergänzt — und keine einzige Versionszeile mitgezogen.** `02-SRD` steht auf V0.4, `03-PRD` auf V0.5, `04-Domaenenmodell` auf V0.3, alle datiert 19.08. Die Revisionshistorie des PRD endet bei V0.5 und kennt die September-Änderungen nicht |
| Höchste vergebene Scope-Nummer | ❌ Die UX-Planung wollte S-42…S-45 vergeben — sämtlich belegt (S-42 Einladungstoken, S-44 Rundenfrist, S-45 PWA-Hinweis, S-46 Notiz-Erinnerung). Korrigiert auf **S-47…S-51**, bevor etwas geschrieben wurde |
| `phase_deadline_at` gegen den Phasenbegriff | ✅ **Erledigt (2026-09-08):** die fehlende Berechnungsregel steht als Pseudocode in `04-Domaenenmodell.md` §8.6; die Terminologie ist in `03-PRD.md` V0.6 auf `Vote.stage` umgestellt. Ursprünglicher Befund: ❌ Das neue Feld heißt „Frist der aktuellen **Rundenphase**". Eine Rundenphase ist aber kein Zustand: `CastingRound.status` kennt nur `draft/open/paused/closed/archived`, und `phase_hint` ist ausdrücklich „abgeleitet, nicht gespeichert" — **ohne Berechnungsregel**. Ein Datenfeld hängt damit an einem Begriff, den kein Dokument definiert |
| CTA-Sortierung: wer definiert sie? | ❌ **Drei** Scope-Zeilen speisen sie (S-44 Rundenfrist, S-45 PWA-Hinweis, S-46 Notiz-Erinnerung), **keine** definiert sie. „Speist die CTA-Sortierung im Dashboard" steht dreimal da, die Sortierung selbst nirgends |
| PWA-Hinweis in der Aufgabensortierung | ❌ Das Domänenmodell ordnet den Install-Hinweis „weiter oben ein, aus demselben Grund wie eine näher rückende Rundenfrist". **Als Fehler bestätigt:** Er ist keine Aufgabe im Castingprozess, wird nie erledigt und würde, weil er bis zur Installation wiederkehrt, echte Aufgaben dauerhaft verdrängen |
| Absage einzelner Personen zu einem Termin | ❌ **Nicht modelliert.** `Appointment.status` kennt `cancelled` und `no_show`, gilt aber für den ganzen Termin. `expected_attendee_profile_ids` trägt nur die Absicht. Damit hat die kurzfristige Absage einer einzelnen Person weder Feld noch Weg — und S-46 schickt die Notiz-Erinnerung an die Falschen |
| `join_code`-Auflagen | ❌ Weiterhin nur Rotation. **Kein Ablauf, keine Nutzungsgrenze** — obwohl S-03 die E-Mail-Pflicht beim Beitritt gestrichen hat und der Link damit die einzige verbleibende Zugangskontrolle ist |
| Anmeldekennung ohne E-Mail | ❌ `Account.email` ist korrekt auf `text?` umgestellt (Pflicht beim Admin-Account, nullable bei Resident-Accounts). **Womit sich ein Resident-Account dann anmeldet, steht nirgends** |
| Rechteableitung | 🟡 Kein Defekt im Modell — `Membership.role`/`permissions` tragen die Rechte korrekt. Aber die Verwechslungsgefahr mit `Session.acting_profile_id = null` ist real genug, dass daraus ein geschützter Test wird |

### Was entschieden wurde

Vollständig als U-1…U-26 im Plan. Die sechs Festlegungen, die die Dokumente wirklich verändern:

| # | Entscheidung | Warum |
|---|---|---|
| **Aufgabenmodell mit Vorrangregel** (S-48) | Der Rundenkopf hat bisher **einen** Handlungsaufruf. Stimmen laufen aber pro Bewerbung (`Vote.stage`), also können Runde-1-Stimmen, Runde-2-Stimmen, Verfügbarkeit, Slot-Reaktionen und Notizen gleichzeitig offen sein | Sortiert wird nach **Zeitdruck** mit genanntem Grund („Termin morgen 17:00"), nicht nach fester Liste. S-44 liefert dafür das Datum |
| **Kein Feinschliff-Bildschirm** (S-47) | Durchgang 1 führte ihn als 🔴 „einzige wirklich neue Interaktion, ohne Gestaltungsspezifikation" | Statt die Lücke zu füllen, entfällt sie: ein zweiter kurzer Durchlauf im bereits gelernten Kartenmuster. Der Bewohner lernt keine zweite Bedienweise. **E-08 bleibt gültig** — seine Begründung trägt beide Formen |
| **Verwaltung erreicht keine Castings** (S-50) | Heute darf der Haushalts-Account Bewerbungen anlegen, Status ändern, Termine bestätigen und löschen — protokolliert als „Verwaltung", also ohne Person | Danach trägt jede Casting-Handlung einen Namen. **Ausdrücklich keine Härtung:** E-03 bleibt gültig, wer die Zugangsdaten kennt, legt sich ein Profil an. Was sich ändert, ist Zurechenbarkeit, nicht Zugriffsschutz. Ausnahmen: Aufbewahrung und Datenauskunft-Export |
| **Anwesenheit wird angenommen, nicht erfasst** (S-51) | Das Modell legt das Setzen von `attended` bei der moderierenden Person ab — nach jedem Termin, für jede Person | Erzeugt genau den Organisationsaufwand, den das Produkt senken soll (PB-2). Umgekehrt: `attended` startet auf `true`, wer verhindert ist, sagt selbst ab, die Moderation korrigiert nur Ausnahmen |
| **Zwei Listen statt einer** | Bewohnerliste war Duplikatsschutz *und* Verwaltungswerkzeug in einem | Getrennt in Teilnehmendenliste (alle, nur Namen) und Bewohnerliste (Verwaltung voll, Moderator lesend). **Mit einer Folge, die benannt gehört:** von E-06s vier strukturellen Schutzmechanismen fallen damit zwei weg, und S-49 wird von einer Verbesserung zur Voraussetzung |
| **Rahmenwerk: zwei Tabs statt fünf** | Die Navigation (Runde · Bewerbungen · Termine · Feed · Ich) ist das mentale Modell des *Moderators*; ein Bewohner muss erst entscheiden, wo er nachsieht | Start · Casting, Kopfzeile mit Glocke und Avatar. Organisation liegt hinter dem Avatar-Menü oder einer CTA aus der Benachrichtigung |

### Eine Regel, die zu weit ausgelegt worden war

Die UX-Planung hatte gefordert, Oberflächentexte müssten „beschreibend, nie empfehlend" sein, und
sich dafür auf **P-5** berufen. Das ist falsch: P-5 verbietet, dass **KI** Bewertungen, Rankings
oder Empfehlungen über Personen erzeugt. Die Anwendung rankt ohnehin — Score und Rangliste sind
E-07 und S-12, zulässig, weil sie menschliche Stimmen nach offengelegten Regeln zusammenrechnen.
Ein von Hand geschriebener Oberflächensatz ist gar keine KI-Ausgabe.

Die Grenze verläuft stattdessen zwischen **Prozess** und **Person**: „Alle haben abgestimmt — ihr
könnt jetzt entscheiden, wen ihr einladet" ist zulässig, „drei vielversprechende Kandidaten" nicht.
Dazu zwei Auflagen: nachrechenbar per Tippen (P-3), und **nur Schwellen zitieren, die es wirklich
gibt**. Der zwischenzeitlich erwogene Satz „bereit für die Einladung" ist daran gescheitert — er
hätte eine Eignungsschwelle vorausgesetzt, die `HouseholdSettings` nicht kennt und die auch nicht
erfunden wird.

Der Befund ist derselbe wie in Durchgang 1 bei den Feldnamen, nur andersherum: **Eine Regel aus
dem Gedächtnis zu verschärfen ist so fehleranfällig wie sie zu vergessen.** Vor dem Ableiten einer
Einschränkung gehört der Wortlaut zitiert.

### Sprache: eine Zielgruppe, die im Dokument fehlte

Bisher regelte die Kette die Sprache nur auf Bezeichnerebene (ADR-012: Dokument deutsch,
Bezeichner englisch). Nicht geregelt war, dass die **Oberfläche** für junge Mitbewohnende ohne
Vorwissen und ohne Einarbeitung lesbar sein muss. „Quorum", „Stage", „Feasibility" und „Score"
stehen im Modell zu Recht — auf einem Bildschirm haben sie nichts verloren. Als
Übersetzungstabelle im Screen-Inventar verankert, gültig für die gesamte Oberfläche.

### Die drei Design-Lücken

| Lücke aus Durchgang 1 | Stand |
|---|---|
| ⚠️ Kein Screen-Inventar | ✅ **Geschlossen** — `07-Screen-Inventar.md` V0.1, 41 Bildschirme, vier Pflichtzustände je Bildschirm, §13 Abweichungsliste AW-1…AW-13 |
| 🔴 Feinschliff-Screen ohne Gestaltung | ✅ **Geschlossen, aber anders als erwartet** — nicht durch eine Gestaltungsspezifikation, sondern durch **Wegfall der Interaktion** (S-47, §9 des Inventars). Ein zweiter kurzer Durchlauf im bereits gelernten Kartenmuster ersetzt den eigenen Bildschirm; damit lernt niemand eine zweite Bedienweise. **E-08 bleibt gültig** |
| ⚠️ Onboarding beim Erstbeitritt | ✅ **Geschlossen** — zwei Pflichtfelder (Name, Passwort), „angemeldet bleiben" vorbelegt, E-Mail später mit dem ehrlichen Pitch „Zugang wiederherstellen". Die Absicherung wandert auf die **Teilen-Seite** des Einladungslinks (S-49), damit sie dem Beitretenden nicht im Weg steht |

Die vier Dokumente stehen: `02-SRD.md` **V0.5** · `03-PRD.md` **V0.6** ·
`04-Domaenenmodell.md` **V0.4** · `07-Screen-Inventar.md` **V0.1**. Die Konsistenzprüfung über
alle vier ist durchgeführt und in `Session-Sprint-Log.md` §4a protokolliert.

### Ergebnis

Sechs Defekte gefunden, von denen fünf ohne diesen Durchgang unbemerkt geblieben wären: die
stehengebliebenen Versionszeilen, der undefinierte Phasenbegriff unter `phase_deadline_at`, die
dreifach referenzierte aber nirgends definierte CTA-Sortierung, der PWA-Hinweis in der
Aufgabenliste und die fehlende Einzelabsage zu einem Termin.

**Das wiederkehrende Muster ist dasselbe wie in Durchgang 1 und 2, nur an neuer Stelle:** Ein
Dokument beschreibt, dass etwas „gespeist" oder „mitgezogen" wird, ohne dass irgendwo steht,
wovon. Drei Scope-Zeilen konnten auf eine Sortierung verweisen, die es nicht gab, weil ein
Verweis auf eine nicht existierende Regel niemanden stört — bis sie gebaut werden soll.

**Und die Schwesterform dieses Musters ist in diesem Durchgang dreimal aufgetreten** — eine Regel
wird beschlossen, an ihrer Hauptstelle korrekt angewandt und dann nicht bis zur letzten
Anwendungsstelle durchgezogen:

| Wo | Was stehenblieb | Gefunden von |
|---|---|---|
| Plan, Verifikationsliste | „Entfernen steht allen Bewohnenden offen" nach dem Beschluss U-22 | der PRD-Sitzung beim ersten Lesen |
| `02-SRD.md` §6/§8.2/§10 | drei „Feinschliff"-Reste nach dem Beschluss, den Bildschirm abzuschaffen | der SRD-Sitzung selbst |
| `07-Screen-Inventar.md` | sieben Bildschirme ohne Pflicht-Leerzustand, obwohl drei andere im selben Dokument das Muster zeigten | der Screen-Inventar-Sitzung bei gezielter Gegenprobe |
| `04-Domaenenmodell.md` §9 | **Querprüfungsliste seit dem Spec-Update tot** — drei Entitäten fehlten ganz, sieben Feldzeilen, Summe 52 statt 59, Nenner 20 statt 23 | der Domänenmodell-Sitzung |
| `04-Domaenenmodell.md` `Membership.revoked_at` | „jedes Mitglied kann entfernen" nach dem Beschluss U-22 — derselbe Rest wie im Plan | ebenda |
| `02-SRD.md` S-10 | Revidierbarkeit von Stimmen noch an „Rundenphase" gebunden — nachdem der Begriff als **nicht sperrende Anzeige** definiert wurde, band das eine Regel an eine Anzeige | der Konsistenzprüfung am Ende |
| `07-Screen-Inventar.md` AW-7 **und** §15 | falsche Dateiangabe für E-06 — an **zwei** Stellen, die zweite fiel erst beim Korrigieren der ersten auf | ebenda |

**Alle sieben wurden beim Gegenprüfen gefunden, keiner beim Schreiben.** Das ist der eigentliche
Befund: In jedem Fall war die Regel bekannt, richtig formuliert und an ihrer Hauptstelle korrekt
umgesetzt — es fehlte die Vollprüfung über alle Anwendungsstellen. Sorgfalt adressiert das nicht.

**Der §9-Fall verdient eine eigene Bemerkung, weil er diesen Log widerlegt.** Durchgang 1 hatte
denselben Defekt an derselben Liste bereits zweimal notiert und daraus geschlossen: *„die
Feldtabellen sind maßgeblich, nicht die Summe"* — und weiter, dass genau das *„das stärkste
Argument für ADR-010"* sei. Der Schluss war richtig, ADR-010 wurde beschlossen, und der Defekt
ist trotzdem ein drittes Mal aufgetreten, diesmal mit drei komplett fehlenden Entitäten.

Der Grund ist, dass ADR-010 die falsche Hälfte absichert: Es macht `data-inventory.yml` zum
CI-Gate, während **§9 eine von Hand gepflegte Zweitschrift derselben Information in Prosa** ist.
Damit ist §9 genau das, was Durchgang 2 als Fehlerquelle benannt hat — eine Redundanz, also „ein
zusätzlicher Ort, an dem eine Änderung vergessen werden kann". **Empfehlung: §9 aus
`data-inventory.yml` generieren oder streichen.** Von Hand gepflegt veraltet die Liste ein viertes
Mal; dass es diesmal auffiel, lag allein daran, dass eine Sitzung ohnehin jede Entität durchgehen
musste.

Der Gegenvorschlag steht in `Session-Sprint-Log.md` §4: **drei** kleine CI-Prüfungen —
Versionszeilen gegen den letzten inhaltlichen Commit, Scope-Nummern gegen ihre Verweise, und die
vier Pflichtzustände je Bildschirm im Screen-Inventar. Nach demselben Argument, das Durchgang 1
für ADR-010 gemacht hat: eine Zusicherung ohne Mechanismus hält nicht.
