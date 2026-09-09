# Session-Sprint-Log — UX-Schicht Flatmate.io

> **Sprint:** Screen-Inventar + Nachzug der Kette
> **Start:** 2026-09-02 · **Branch:** `dev/flatmate-sprint-v0.1`
> **Koordination:** Sitzung „Flatmate.io UX/UI-Plan"
> **Plan:** `~/.claude/plans/ich-habe-zahlreiche-anforderungen-quiet-dusk.md` (V5)

Dieses Log hat zwei Zwecke: **die Koordination dieses Sprints** und **das Vermeiden derselben
Fehler beim nächsten Mal.** Es ist kein Fortschrittsbericht — Fortschritt steht im `review-log.md`.

---

## 1. Arbeitsteilung

| Sitzung | Besitzt | Ziel |
|---|---|---|
| Flatmate.io Screen-Inventar | `07-Screen-Inventar.md` *(neu)* | V0.1 |
| Flatmate.io: Nachzug SRD | `02-SRD.md` | V0.4 → V0.5 |
| Flatmate.io: Nachzug PRD | `03-PRD.md` | V0.5 → V0.6 |
| Flatmate.io: Nachzug Domaenenmodell | `04-Domaenenmodell.md` | V0.3 → V0.4 |
| Koordination | `review-log.md`, dieses Log | — |

**Eine Datei, ein Besitzer.** Wem eine nötige Änderung in einer fremden Datei auffällt: an die
Koordination melden, nicht selbst schreiben. Vier Sitzungen auf einer Dokumentenkette scheitern
nicht an Fehlern, sondern an **Divergenz** — vier Fassungen derselben Regel, die sich um Nuancen
unterscheiden.

**Quelle ist der Plan, nicht die Nachbarsitzung.** Alle arbeiten aus U-1…U-26. Wo eine Regel
mehrere Dokumente betrifft, wird sie **an einer** Stelle ausformuliert und sonst nur zitiert:

| Regel | Ausformuliert in |
|---|---|
| `phase_hint`-Berechnung | Screen-Inventar §3 |
| CTA-Sortierung / Aufgabenmodell | Screen-Inventar §2 |
| UI-Sprache (Übersetzungstabelle) | Screen-Inventar §7–8 |
| Scope-Nummern S-47…S-51 | SRD |
| Feld- und Zustandsnamen | Domänenmodell |

**Vergebene Scope-Nummern — nicht verhandelbar:** S-47 zweiter Durchlauf · S-48 Aufgabenmodell
mit Vorrangregel · S-49 Einladungslink absichern · S-50 Verwaltung ohne Casting-Zugriff ·
S-51 Anwesenheit angenommen + Absage einzelner Personen.

---

## 2. Was alle vier Sitzungen wissen müssen

### 2.1 Die Versionszeilen sind stehengeblieben

Das Spec-Update vom 02.09. hat ~1600 Zeilen geändert, fünf Scope-Zeilen und drei Entitäten
ergänzt — aber **keine einzige Versionszeile wurde mitgezogen.** `02-SRD` steht auf V0.4,
`03-PRD` auf V0.5, `04-Domaenenmodell` auf V0.3, alle datiert auf den 19.08. Die
Revisionshistorie des PRD endet bei V0.5 und kennt die September-Änderungen nicht.

**Auftrag an alle drei Nachzug-Sitzungen:** Der Revisionseintrag dokumentiert **beides** — die
September-Änderungen des eigenen Dokuments *und* die UX-Änderungen aus dem Plan. Sonst bleibt die
größere der beiden Änderungen für immer unverzeichnet.

Das ist zugleich der **vierte** Vorfall derselben Art. Der `review-log.md` dokumentiert ihn
bereits an sich selbst: *„die Regel ‚Versionszeile mitziehen' ist genau die Sorte Zusicherung,
die ohne Mechanismus nicht hält."* Vier Vorfälle sind kein Sorgfaltsproblem mehr, sondern ein
fehlender Mechanismus — Vorschlag in §4.

### 2.2 Offene Befunde, die während des Sprints auftauchen werden

Fünf Dinge sind beim Prüfen aufgefallen und noch nicht behoben. Wer über sie stolpert, hat keinen
neuen Fund gemacht:

| # | Befund | Betrifft |
|---|---|---|
| B-1 | `CastingRound.phase_deadline_at` beruft sich auf „die aktuelle Rundenphase" — **die es als Zustand nicht gibt.** `phase_hint` ist abgeleitet und hat keine Formel | Screen-Inventar §3, Domänenmodell |
| B-2 | Der PWA-Install-Hinweis wird laut Domänenmodell „weiter oben einsortiert, aus demselben Grund wie eine näher rückende Rundenfrist" — **bestätigter Fehler**, er ist keine Aufgabe | Domänenmodell, Screen-Inventar |
| B-3 | **Die kurzfristige Absage einer einzelnen Person zu einem Termin ist nicht modelliert.** `Appointment.status` gilt für den ganzen Termin | Domänenmodell, SRD (S-51) |
| B-4 | `join_code` hat nur Rotation — **kein Ablauf, keine Nutzungsgrenze** | Domänenmodell, SRD (S-49) |
| B-5 | Womit meldet sich ein Resident-Account **ohne E-Mail** an? `Account.email` ist bereits `text?`, die Anmeldekennung ist nirgends bestimmt | Domänenmodell (O-D) |

### 2.3 Drei Design-Lücken bleiben bis zum Abschluss offen

Der `review-log.md` führt sie als ⚠️/🔴/⚠️: kein Screen-Inventar · Feinschliff ohne
Gestaltungsspezifikation · Onboarding beim Erstbeitritt nicht beschrieben. Sie werden **erst
geschlossen, wenn das Inventar steht** — die Koordination trägt das nach, keine Sitzung schließt
sie selbst.

---

## 3. Fehler und Beinahe-Fehler dieses Runs

Chronologisch. Jeder Eintrag mit dem, was beim nächsten Mal anders laufen sollte.

### F-1 — Auf dem falschen Branch gelesen

Die Spezifikationen wurden zunächst von `main` gelesen. Dort liegen sie in einem **älteren
Stand**; die aktuellen Dokumente liegen auf `dev/flatmate-sprint-v0.1`. Der Fehler fiel erst auf,
als die Dateien auf `main` plötzlich fehlten.

**Konsequenz:** Ein ganzer Planungsdurchgang (V1–V3) entstand gegen einen veralteten Stand. Fünf
Scope-Zeilen, drei Entitäten und die umgeschriebene S-28 fehlten darin vollständig.

> **Nächstes Mal:** `git branch --show-current` **vor** dem ersten Lesen, und gegenprüfen, ob die
> erwarteten Dateien existieren. Bei einem Repo mit Feature-Branches ist `main` nicht der Default,
> sondern eine Annahme.

### F-2 — Kommentare kamen nicht an, und ich habe zu lange gesucht

Der Nutzer hatte Kommentare per Textmarkierung im Plan hinterlegt. Diese Markierungen sind nicht
übertragen worden; die Plandatei war unverändert. Es wurden `git status`, das Repo, das
Scratchpad und die Plandatei nach Kommentarmarkern durchsucht, bevor gefragt wurde.

> **Nächstes Mal:** Ein bis zwei gezielte Prüfungen, dann sofort fragen. Wenn ein Nutzer „die
> Kommentare" sagt und nichts auffindbar ist, ist die Ursache fast immer ein Übertragungsproblem —
> nicht ein Suchproblem. Der verlässliche Kanal ist das Einfügen als Zitatblock.

### F-3 — Eine Formulierung hat einen Sicherheitsverdacht erzeugt

Im Plan stand: *„ist `acting_profile_id` `null`, handelt man als Verwaltung"*. Das liest sich, als
verliehe ein Null-Wert Rechte. Der Nutzer hat zu Recht nachgefragt.

**Tatsächlich:** Rechte kommen aus `Membership.role` (`household_admin`/`moderator`/`member`) und
`Membership.permissions`. `Session.acting_profile_id = null` heißt ausschließlich „kein
Bewohnerprofil aktiv" und verleiht nichts.

> **Nächstes Mal:** Beim Beschreiben eines Rechtemodells **das Feld benennen, das das Recht
> tatsächlich verleiht** — nie das Feld, das gerade im Kontext steht. Aus dem Vorfall ist ein
> geschützter Test geworden (U-21), das ist der bessere Ausgang.

### F-4 — Eine Regel zu weit ausgelegt

Der Plan forderte, UI-Texte müssten „beschreibend, nie empfehlend" sein, und berief sich auf
**P-5**. P-5 verbietet aber, dass **KI** Bewertungen über Personen erzeugt. Die Anwendung rankt
ohnehin (Score, Rangliste, E-07/S-12), und ein von Hand geschriebener Oberflächensatz ist keine
KI-Ausgabe. Die Einschränkung war unbegründet und hätte das Produkt unnötig blass gemacht.

> **Nächstes Mal:** Vor dem Ableiten einer Einschränkung **den Wortlaut der Regel zitieren.** Die
> richtige Grenze lag woanders (Prozess vs. Person) und war weiter, nicht enger.

### F-5 — Scope-Nummern doppelt vergeben

Der Plan wollte S-42…S-45 vergeben. Diese Nummern waren im Spec-Update bereits belegt (S-42
Einladungstoken, S-44 Rundenfrist, S-45 PWA-Hinweis, S-46 Notiz-Erinnerung). Folge von F-1.

> **Nächstes Mal:** Vor dem Vergeben einer Nummer die aktuelle Tabelle greppen, nicht die
> Erinnerung befragen:
> ```bash
> grep -oE "S-[0-9]{2}" 02-SRD.md | sort -u | tail -5
> ```

### F-6 — Eine Änderung vorgeschlagen, die es schon gab

Der Plan schlug vor, `Account.email` optional zu machen. Das Feld war zu diesem Zeitpunkt bereits
`text?` mit exakt der vorgeschlagenen Aufteilung (Pflicht beim Admin-Account, nullable bei
Resident-Accounts). Ebenfalls Folge von F-1.

> **Nächstes Mal:** Jede vorgeschlagene Feldänderung vorher gegen die Feldtabelle prüfen. Kostet
> eine Zeile `sed -n`, spart eine Peinlichkeit.

### F-7 — Zweimal gegen das Sprintziel optimiert

Zwei Vorschläge wurden vom Nutzer gekippt, und beide aus demselben Grund:

- **Anwesenheit erfassen** als eigener Schritt der Moderation — erzeugt genau den
  Organisationsaufwand, den das Produkt senken soll (jetzt U-23: Anwesenheit wird angenommen).
- **Verwaltung mit vollem Casting-Zugriff** — bequem, aber ohne Zurechenbarkeit (jetzt U-20).

Beide Male war auf Vollständigkeit und Korrektheit optimiert worden statt auf das erklärte Ziel.

> **Nächstes Mal:** Jeder vorgeschlagene Schritt bekommt die Frage: **„Wer muss dafür etwas tun,
> das er vorher nicht tun musste?"** Lautet die Antwort „die moderierende Person", ist der
> Vorschlag begründungspflichtig. Aufwandssenkung ist in diesem Produkt ein Ziel (PB-2), kein
> Nebeneffekt.

### F-9 — Dieselbe Regel, dreimal nicht bis zum Ende durchgezogen

Bei der Gegenprobe des eigenen Dokuments fand die Screen-Inventar-Sitzung **sieben Bildschirme
ohne „Leer"-Zustand** (D1, O1, O4, O6, O14, O16, O17) — obwohl §6 den Zustand als Pflicht führt
und B1, D4 und O7 im selben Dokument bereits das richtige Muster zeigten. Am auffälligsten: **O1**,
das Orga-Dashboard, für das §2.3 die Leerzustandsregel ausdrücklich mitformuliert.

Damit ist dieselbe Fehlerklasse in **einem** Sprint dreimal aufgetreten:

| Wo | Was stehenblieb |
|---|---|
| F-8 · Plan | Verifikationsliste trug die Aussage von vor U-22 |
| SRD · §6/§8.2/§10 | drei „Feinschliff"-Reste nach dem Beschluss K-1/U-10 |
| F-9 · Screen-Inventar | sieben fehlende Leerzustände, Muster war im selben Dokument vorhanden |

Alle drei wurden gefunden, weil jemand **gezielt gegengeprüft** hat — keiner beim Schreiben.

> **Der Befund ist nicht „unsauber gearbeitet".** In allen drei Fällen war die Regel bekannt,
> richtig formuliert und an ihrer Hauptstelle korrekt angewandt. Was fehlte, war die **Vollprüfung
> über alle Anwendungsstellen**. Genau deshalb hilft Sorgfalt hier nicht weiter, und genau deshalb
> gehört das in §4 — als Prüfung, nicht als Vorsatz.

### F-10 — Die Querprüfungsliste war seit dem Spec-Update tot

Die Domänenmodell-Sitzung fand §9 des eigenen Dokuments (Querprüfungsliste der personenbezogenen
Felder) **seit dem September-Update nie nachgezogen**: `ApplicationInviteToken`,
`AppointmentAttendance` und `PushSubscription` standen im Modell, aber in keiner Zeile der Liste.
Sieben Feldzeilen fehlten, die Summe stand auf **52 statt 59**, der Entitäten-Nenner auf 20 statt 23.

**Das ist der bisher stärkste Fall**, weil `review-log.md` denselben Defekt in Durchgang 1 bereits
zweimal an derselben Liste dokumentiert hatte — und daraus wörtlich schloss: *„die Feldtabellen
sind maßgeblich, nicht die Summe"* und *„dass ein sorgfältig geschriebenes Dokument seine eigene
Summe zweimal nachziehen musste, ist das stärkste Argument für ADR-010."*

Jetzt ist es zum dritten Mal passiert, in größerem Umfang, **obwohl der Schluss bereits gezogen
und ADR-010 bereits beschlossen war.**

> **Die eigentliche Ursache ist Redundanz, nicht Nachlässigkeit.** ADR-010 macht
> `data-inventory.yml` zum CI-Gate. §9 ist eine **von Hand gepflegte Zweitschrift derselben
> Information** in Prosaform — und damit genau die Sorte Duplikat, das Durchgang 2 schon als
> Fehlerquelle benannt hat („jede Redundanz ist ein zusätzlicher Ort, an dem eine Änderung
> vergessen werden kann").
>
> **Empfehlung an das Vorhaben (Entscheidung nach dem Sprint):** §9 entweder **aus
> `data-inventory.yml` generieren** oder **streichen**. Von Hand gepflegt wird sie ein viertes Mal
> veralten, und der einzige Grund, warum es diesmal auffiel, war ein Agent, der ohnehin jede
> Entität durchgehen musste.

**Zweiter Befund derselben Sitzung, kleiner:** `Membership.revoked_at` behauptete noch „jedes
Mitglied kann entfernen" — seit U-22 falsch. Damit ist der U-22-Rest **an zwei** Stellen
aufgetaucht (auch im Plan, F-8). Die Sitzung hat die Rechteabstufung bewusst nicht selbst
entschieden, sondern an die PRD-Rechtematrix delegiert. Richtig so.

### F-11 — Eine Regel in zwei Dokumenten, ein Detail nur in einem

Die `phase_hint`-Formel wurde vom Domänenmodell korrekt aus Inventar §3.1 übernommen — und dabei
um eine Präzisierung ergänzt, die im Inventar fehlt: **Seitenzustände** (`rejected_by_household`,
`declined_by_applicant`, `withdrawn`, `archived`) zählen nicht als Fortschritt. Ohne diese Zeile
ist §3.1 an einer realen Stelle unbestimmt: Eine Runde, in der alle Bewerbungen abgelehnt wurden,
hat keine definierte Anzeige.

Kein Fehler des Domänenmodells — es hat die Lücke gefüllt. Aber genau **so** entsteht Divergenz:
zwei Fassungen derselben Regel, von denen eine mehr weiß. An die Screen-Inventar-Sitzung
zurückgegeben.

> **Nächstes Mal:** Wenn eine Regel „an EINER Stelle ausformuliert, sonst zitiert" wird, muss die
> **Präzisierung zurückfließen**. Die zitierende Sitzung meldet, was sie ergänzen musste.

---

## 4. Vorschlag: Mechanismus gegen F-5 und die Versionszeilen

Vier Vorfälle mit stehengebliebenen Versionszeilen und einer mit doppelt vergebenen Nummern haben
dieselbe Ursache: **eine Zusicherung ohne Prüfung.** Genau dafür existiert in diesem Vorhaben
bereits ein Muster — ADR-010 macht das Datenbestandsverzeichnis zum CI-Gate, weil „eine Zahl in
einem Dokument verlässlich veraltet".

Vorschlag für `GUARDRAILS.md`, **nach** dem Sprint zu entscheiden:

- **Versionszeilen-Prüfung:** Für jedes Dokument der Kette vergleichen, ob die Versionszeile
  jünger ist als der letzte inhaltliche Commit an dieser Datei. Andernfalls Build brechen.
- **Scope-Nummern-Prüfung:** Höchste vergebene S-Nummer aus `02-SRD.md` gegen alle Verweise in den
  übrigen Dokumenten. Jede Referenz auf eine nicht existierende Nummer bricht.
- **Vollständigkeitsprüfung der Bildschirmzustände** *(neu, nach F-9)*: Für jeden Bildschirm in
  `07-Screen-Inventar.md` prüfen, ob alle vier Pflichtzustände entweder ausgeschrieben oder
  ausdrücklich als „Standard" vermerkt sind. Das Dokument ist tabellarisch aufgebaut, die Prüfung
  ist deshalb billig — und sie hätte alle sieben Fälle aus F-9 gefunden.

Alle drei sind klein und schließen genau die Fehlerklassen, die dieser Sprint produziert hat:
zweimal eine stehengebliebene Aussage nach einem Beschluss, einmal eine doppelt vergebene Nummer,
einmal sieben fehlende Zustände.

> **Warum das kein Prozessvorschlag ist, sondern ein Bauvorschlag.** Alle vier Fälle wurden von
> Menschen bzw. Agenten gefunden, die *gezielt gegengeprüft* haben — keiner beim Schreiben. Eine
> Regel „sorgfältiger sein" hätte keinen davon verhindert. Das ist dasselbe Argument, das
> `review-log.md` in Durchgang 1 für ADR-010 gemacht hat: *„ein Datenbestandsverzeichnis muss ein
> CI-Gate sein, weil eine Zahl in einem Dokument verlässlich veraltet."*

---

## 4a. Konsistenzprüfung über alle vier Dateien (Koordination)

Durchgeführt nach Abschluss aller vier Aufträge. Was keine Einzelsitzung prüfen konnte.

| Prüfung | Ergebnis |
|---|---|
| Versionszeilen gezogen | ✅ `02-SRD` V0.5 · `03-PRD` V0.6 · `04-Domaenenmodell` V0.4 · `07-Screen-Inventar` V0.1 |
| Revisionseinträge decken **beide** Wellen ab | ✅ alle drei Nachzug-Dokumente nennen die September-Änderungen **und** den UX-Nachzug |
| S-47…S-51 real vergeben | ✅ alle fünf im SRD vorhanden |
| Screen-Inventar von den anderen referenziert | ✅ SRD 6 · PRD 12 · Domänenmodell 5 Treffer |
| `phase_hint` in beiden Fassungen identisch | ✅ Inventar §3.1 und Domänenmodell §8.6, gegenseitig verwiesen, Seitenzustände in beiden (nach F-11) |
| Getilgte Altbegriffe | ✅ „Rundenphase" in `03-PRD` bei null · Fünf-Tab-Zeichenkette und „nebeneinander" ebenso. Restvorkommen nur in **Zitaten** (Abweichungslisten, Korrekturhinweise, dieses Log) |
| **Zwei echte Reste gefunden — beide behoben** | **S-10 im SRD** band die Revidierbarkeit von Stimmen noch an „Rundenphase". Seit der Definition als nicht-sperrende Anzeige bindet das eine Regel an eine Anzeige. Neu: *„revidierbar innerhalb derselben `Vote.stage`, solange die `CastingRound` `open` ist"* · **AW-7 im Inventar** nannte `02-SRD.md` für E-06, das in `01-Problem-Framing.md` liegt. Korrigiert, plus Satz zur bewussten Divergenz. Die Sitzung fand dabei **dieselbe falsche Kopplung in §15** und zog sie mit — sechste Instanz derselben Fehlerklasse |
| Nachprüfung | ✅ „Rundenphase" kommt im SRD jetzt nur noch in S-44 vor (dort korrekt, als Feldbeschreibung) |

**Eine bewusste, dokumentierte Divergenz:** **E-06** in `01-Problem-Framing.md` behält den alten
Wortlaut („Bewohnerliste für alle sichtbar, jedes Mitglied kann entfernen"). Das ist **kein
Versehen**: Die E-Tabelle hält fest, was in der Anforderungs-Session beschlossen wurde, und das
Dokument sagt selbst in einem Kasten, dass spätere Festlegungen als S-Zeilen im SRD leben („Wer
den vollständigen Stand sucht, liest das SRD"). E-06 bleibt damit historischer Beschluss, obwohl
seine Begründung durch U-22 teilweise überholt ist. Hier festgehalten, damit es beim nächsten
Durchgang nicht als offener Fehler „gefunden" wird.

---

## 5. Laufende Einträge

*Neue Befunde, Rückfragen aus den Sub-Chats und Entscheidungen werden hier ergänzt.*

| Datum | Von | Eintrag |
|---|---|---|
| 2026-09-02 | Koordination | Sprint gestartet, vier Aufträge verteilt |
| 2026-09-02 | Koordination | `review-log.md` um **Durchgang 3** ergänzt: sechs Defekte, sechs Entscheidungen, Status der drei Design-Lücken |
| 2026-09-02 | Screen-Inventar | **`07-Screen-Inventar.md` V0.1 fertig** — 41 Bildschirme, §13 Abweichungsliste AW-1…AW-13 als Arbeitsvorlage, §14 offene Punkte inkl. neuem **O-F** (Einzelabsage). Gegengeprüft: Bildschirmzahl stimmt, §3.1 liefert die fehlende `phase_hint`-Formel, §2.2 definiert die Sortierung, auf die S-44/S-45/S-46 verweisen |
| 2026-09-02 | Nachzug SRD | **`02-SRD.md` V0.5 fertig.** Ein Revisionseintrag deckt **beides** ab: rückwirkend Commit `15e1fa0` (der ohne Versionszeile blieb) und den UX-Nachzug. S-47…S-51 angelegt, S-11 und S-05 umformuliert, §6 um die Moderations-Metrik ergänzt, §10 um zwei Prinzipien |
| 2026-09-02 | Nachzug SRD | Drei weitere „Feinschliff"-Reste in §6/§8.2/§10 gefunden und mitkorrigiert — dieselbe Fehlerklasse wie F-8, nur in einer anderen Datei |
| 2026-09-02 | Nachzug SRD | **Verwechslungsfalle gemeldet, kein Konflikt:** Wo der Plan „S-43 entfällt ersatzlos" schreibt, meint er seine **eigene Entwurfsnummerierung** aus einer früheren Fassung — nicht das reale S-43 im SRD (Spenden-E-Mail, v1.1). An die übrigen Sitzungen weitergegeben. *Lehre für künftige Pläne: Entwurfsnummern nie im selben Namensraum wie die echten vergeben* |
| 2026-09-02 | Koordination | AW-3, AW-4, AW-8, AW-9, AW-10 sowie O-A/O-C/O-D/O-F gebündelt an die Domänenmodell-Sitzung übergeben |
| 2026-09-02 | Screen-Inventar | Gegenprobe der vier Pflichtzustände: **sieben fehlende Leerzustände** ergänzt (D1, O1, O4, O6, O14, O16, O17) → F-9. Bildschirmzahl unverändert 41 |
| 2026-09-02 | Nachzug Domänenmodell | **`04-Domaenenmodell.md` V0.4 fertig.** AW-3/4/8/9/10 umgesetzt · §8.6 `phase_hint` als Pseudocode (wortgleich zu Inventar §3.1, beidseitig verwiesen) · §8.7 CTA-Sortierung als eigene Regel · §8.8 `audience_class` · `join_code` um Ablauf/Nutzungsgrenze · `AppointmentAttendance` umgedreht inkl. Einzelabsage · O-A…O-E aufgelöst. Gegengeprüft: Summe 11+15+33 = 59 rechnet auf |
| 2026-09-02 | Nachzug Domänenmodell | **§9-Querprüfungsliste seit dem Spec-Update tot** → F-10, wichtigster Einzelbefund des Sprints. Dazu `Membership.revoked_at` mit U-22-Rest korrigiert |
| 2026-09-02 | Koordination | **F-11 zurückgespielt und geschlossen:** Präzisierung zu Seitenzuständen aus Domänenmodell §8.6 in Inventar §3.1 nachgetragen, mit gegenseitigem Verweis. Divergenz an der Zitierstelle gefangen, nicht erst beim nächsten Konflikt |
| 2026-09-02 | Nachzug PRD | **Widerspruch im Plan gefunden und behoben.** Die Verifikationsliste sagte noch „die Entfernen-Handlung steht **allen** Bewohnenden offen (E-06, S-05)" — ein Rest der Fassung vor U-22. Korrigiert: Teilnehmendenliste ohne Handlungen für alle, Bewohnerliste für reine Bewohner-Profile **gar nicht**, Entfernen bei Verwaltung und Moderation. **Betrifft die SRD-Sitzung**, weil E-06 und S-05 dort geändert werden |

### F-8 — Eine Änderung nicht bis in die Prüfliste durchgezogen

U-22 (zwei getrennte Listen) wurde im Plan an vier Stellen eingearbeitet — aber nicht in der
Verifikationsliste am Ende. Dort stand die alte Fassung weiter. Gefunden nicht von mir, sondern
von der PRD-Sitzung beim ersten Lesen.

> **Nächstes Mal:** Nach jeder gekippten Festlegung die **ganze** Datei nach der alten Aussage
> durchsuchen, nicht nur die Abschnitte, die man gerade bearbeitet — Prüflisten, Zusammenfassungen
> und Tabellen am Dateiende sind die typischen Nachzügler.
>
> Das ist exakt das Muster, das `review-log.md` in Durchgang 2 als bestätigt notiert: *„eine Regel
> an ihrer Hauptstelle zu ändern reicht nicht, wenn dieselbe Datei an anderer Stelle eine eigene,
> redundante Zusammenfassung derselben Information führt."* Jetzt auch im Plan selbst passiert.
