# 07 — Screen-Inventar: Flatmate.io

> **Version:** V0.1
> **Datum:** 2026-09-02
> **Autor:** Samuel Zink (@SmokeyRGB)
> **Vorgänger:** `01-Problem-Framing.md` · `02-SRD.md` (V0.4, Nachzug auf V0.5 parallel in Arbeit)
> · `03-PRD.md` (V0.5, Nachzug auf V0.6 parallel in Arbeit) · `04-Domaenenmodell.md` (V0.3,
> Nachzug auf V0.4 parallel in Arbeit) · `05-ADRs.md` · `06-Compliance-Anhang.md` · `GUARDRAILS.md`
> **Nachfolger:** keiner in v1 vorgesehen — Deliverable dieses Vorhabens ist ausschließlich
> dieses Dokument, kein Mockup (U-8). Ein klickbares Low-Fi-Mockup ist ein möglicher, aber
> nicht beauftragter nächster Schritt (§15)

> **Zweck.** Der `review-log.md` benennt drei Design-Lücken: kein Screen-Inventar, der
> Feinschliff-Bildschirm ohne Gestaltungsspezifikation, das Onboarding beim Erstbeitritt nicht
> beschrieben. Dieses Dokument schließt alle drei — die mittlere, indem es die Interaktion
> beseitigt statt sie zu gestalten (§9). Es ist die fehlende Schicht zwischen der Anforderungskette
> (`01`–`06`, `GUARDRAILS.md`) und einer Umsetzung: wie sich das Modell als Oberfläche anfühlt.

> **Schema-Autorität.** Alle Feld-, Zustands- und Entitätsnamen in diesem Dokument sind aus
> `04-Domaenenmodell.md` zitiert, nie neu erfunden. Weicht ein Name hier von der aktuellen Fassung
> des Domänenmodells ab, gilt das Domänenmodell — dieses Dokument ist dann zu korrigieren, außer
> §3, §4.0.1 und §7–8 markieren die Abweichung ausdrücklich als **Korrektur am Domänenmodell**
> (§13 führt diese Fälle vollständig auf).

> **Sprachregelung.** Dokument deutsch, alle Bezeichner englisch (ADR-012). UI-Label für
> `Household` ist in v1 durchgängig **„WG"** (E-02). Sichtbarer Text auf den Bildschirmen selbst
> folgt zusätzlich der Übersetzungstabelle in §8.6 (U-24) — kein Fachwort aus dem Modell erscheint
> dort ungeklärt.

> **Herkunft.** Dieses Dokument setzt den vom Nutzer genehmigten Plan
> `ich-habe-zahlreiche-anforderungen-quiet-dusk.md` (Stand V5, Entscheidungen U-1 bis U-26) um.
> Es ist Teil eines Sprints mit drei parallelen Nachzug-Dokumenten (`02-SRD.md`, `03-PRD.md`,
> `04-Domaenenmodell.md`); Koordination und Arbeitsteilung stehen in `Session-Sprint-Log.md`.

---

## §1 — Kontext

Die Anforderungskette für Flatmate.io ist dicht (`01-Problem-Framing` → `02-SRD` → `03-PRD` →
`04-Domaenenmodell` → `05-ADRs` → `06-Compliance-Anhang` → `GUARDRAILS`, ~210 Akzeptanzkriterien),
beschreibt aber nirgends, wie sich das als Oberfläche anfühlt. Drei Befunde erklären, warum das
mehr als ein fehlendes Artefakt ist:

1. **Der Rundenkopf hat einen Handlungsaufruf, die Realität hat mehrere.** [03-PRD.md:325](03-PRD.md:325)
   definiert „4 offene Bewerbungen warten auf dich". Aber Stimmen laufen **pro Bewerbung**, nicht
   pro Runde ([`Vote.stage`](04-Domaenenmodell.md:674)). Ein Bewohner kann gleichzeitig offen
   haben: Stimmen der ersten Runde · Stimmen der zweiten · Verfügbarkeit · Slot-Reaktionen ·
   Casting-Notizen. Welche zuerst dran ist, steht nirgends — das ist die eigentliche Ursache und
   der Gegenstand von §2.
2. **Die Phasenanzeige hat keine Formel.** `phase_hint` ist „abgeleitet, nicht gespeichert"
   geführt, ohne Berechnungsregel — Gegenstand von §3.
3. **Die Navigation ist objektorientiert.** Fünf Tabs (Runde · Bewerbungen · Termine · Feed · Ich)
   spiegeln das mentale Modell des Moderators, nicht des Bewohners, der erst entscheiden muss, wo
   er nachsieht — aufgelöst in §4.

**Struktur dieses Dokuments.** §2–§6 legen die vier tragenden Regeln fest, auf die das
Bildschirmverzeichnis (§7–§8) aufbaut — mit Absicht in dieser Reihenfolge: §3 (Phasenanzeige) muss
vor §2 (Aufgabenmodell) geklärt sein, weil die neue Rundenfrist `phase_deadline_at` sich auf eine
Phase beruft, die erst durch §3 einen Namen bekommt. §9 und §10 vertiefen zwei einzelne Abläufe,
die mehr Erklärung brauchen, als eine Tabellenzeile trägt. §11–§15 schließen mit Sichtbarkeit,
Barrierefreiheit, der Abweichungsliste gegen die bestehende Kette, offenen Punkten und dem
nächsten Schritt.

---

## §2 — Das Aufgabenmodell

**Das Problem in einem Satz.** Ein Bewohner kann mehrere offene Aufgaben gleichzeitig haben, und
bisher legt nichts fest, welche zuerst dran ist.

### 2.1 Sechs Aufgabenarten

Jede mit einer Bedingung, wann sie überhaupt auftaucht:

| # | Aufgabe | Taucht auf, wenn … |
|---|---|---|
| T-1 | Casting-Notiz schreiben | `AppointmentAttendance.attended = true` und `note_written = false` — die Person war bestätigt dabei und hat noch nichts geschrieben (S-46) |
| T-2 | Auf einen Terminvorschlag reagieren | es gibt `Slot`s, zu denen sich das Profil noch nicht geäußert hat |
| T-3 | Verfügbarkeit eintragen | die Terminfindung läuft und die eigenen Zeiten fehlen |
| T-4 | Stimme zur Zusage (`stage = offer`) | jemand ist gecastet und zur Zusage liegt noch keine Stimme vor |
| T-5 | Stimme zur Einladung (`stage = invite`) | es liegen Bewerbungen vor, zu denen noch nicht gestimmt wurde |
| T-6 | Zweiter Durchlauf | T-5 ist erledigt und zu oft „Unbedingt" wurde vergeben (§9) |

### 2.2 Sortierung nach Zeitdruck, nicht nach fester Rangliste

Jede offene Aufgabe bekommt, wo das Modell eines hergibt, ein echtes Datum:

| Aufgabe | Woher das Datum kommt |
|---|---|
| T-4, T-5 Stimmen | `CastingRound.phase_deadline_at` (S-44) — die weiche Frist der Runde, falls gesetzt. Angezeigt als „Stimme ab bis X" bzw. „noch 2 Tage" |
| T-2 Slot-Reaktion | der Termin selbst — danach ist die Reaktion wertlos |
| T-1 Casting-Notiz | der Tag nach dem Casting; danach verblasst die Erinnerung |
| T-3 Verfügbarkeit | sobald jemand eingeladen ist: das Zeitfenster, in dem gecastet werden soll |
| T-6 zweiter Durchlauf | kein Datum |

Sortiert wird: **Aufgaben mit Datum zuerst, die nächstfällige zuoberst.** Aufgaben ohne Datum
danach, in der festen Reihenfolge T-1 · T-2 · T-3 · T-4/T-5 · T-6.

> **Was S-44 hier vereinfacht.** Ohne eine gesetzte Frist müsste die Dringlichkeit einer
> Abstimmung aus dem Einzugsdatum hergeleitet werden. Mit `phase_deadline_at` setzt der Haushalt
> sie stattdessen selbst — und weil er sie setzt, ist sie auch erklärbar, ohne dass das System
> etwas unterstellt. Ist keine Frist gesetzt, fallen T-4 und T-5 in die zweite Gruppe zurück, und
> die feste Reihenfolge greift wie zuvor.
>
> **Und was sie nicht tut.** Die Frist blockiert nichts. Nach Ablauf bleibt die Runde
> entscheidungsfähig — genauso wie das Quorum nur anzeigt und nicht sperrt (S-13). Eine
> abgelaufene Frist verändert nur die Sortierung und den Text („seit 2 Tagen überfällig"), niemals
> die Verfügbarkeit einer Handlung.

**Zwei Dinge erzeugen Zeitdruck:**

1. **Eine harte Frist.** Es gibt ein Datum, nach dem die Aufgabe nichts mehr nützt: der Termin ist
   vorbei, das Veto ist gesperrt, der Einzug hat stattgefunden.
2. **Andere hängen an mir.** Solange eine Person nicht handelt, kommt die Gruppe nicht weiter.
   Ohne Verfügbarkeit lässt sich kein Termin rechnen. Ohne Notiz können Abwesende bei der Zusage
   gar nicht mitentscheiden — Schritt 16 der Belegkette ([03-PRD.md §4.0.2](03-PRD.md:218)), als
   zentraler Schmerzpunkt markiert.

**Die App nennt den Grund.** Neben jeder Aufgabe steht, warum sie dran ist: „Termin morgen 17:00"
· „Einzug in 9 Tagen" · „4 andere warten auf deine Notiz". Die Reihenfolge ist damit nicht nur
richtig, sondern nachvollziehbar (P-3).

**Beispiel.** Ein Bewohner öffnet die App am Montag. Offen sind: 3 neue Bewerbungen (T-5, kein
Datum) · eine Notiz vom Casting am Samstag (T-1, fällig seit Sonntag) · eine Slot-Reaktion für
Mittwoch (T-2). Reihenfolge: **Notiz** (überfällig) → **Slot** (in 2 Tagen) → **Bewerbungen** (kein
Datum). Der primäre CTA lautet „Notiz zu Lea schreiben — 4 andere warten darauf".

### 2.3 Darstellungsregel

Genau **ein** primärer CTA mit konkreter Zahl und direktem Ziel · darunter bis zu **drei** Zeilen
· der Rest eingeklappt als „und N weitere". Ist nichts offen, steht dort der Rundenstand — nie eine
leere Fläche. T-6 erscheint nie neben T-5, weil es dessen Folgeschritt ist.

**Moderations-Brücke.** Eine einzelne Zeile am Fuß der Aufgabenliste, nur sichtbar für Profile mit
Rechten, nie in die persönliche Liste gemischt: „3 Dinge brauchen deine Moderation →" (U-5). Führt
direkt in die Organisationsfläche (§4.2), nicht in eine Übersicht.

**Schließt P-O-05** ([03-PRD.md:1254](03-PRD.md:1254)): Der Durchlauf arbeitet auf der Menge, die
beim Öffnen feststand; T-5 rechnet beim nächsten Öffnen neu.

---

## §3 — Die Phasenanzeige

**Das Problem.** Oben in der App soll stehen, wo die Runde gerade steht — etwa „Abstimmung
Runde 1". Diese Rundenphase gibt es als Zustand aber nicht: Jede Bewerbung hat ihren eigenen
Zustand, gleichzeitig kann eine bei „Interview", eine bei „Zusage" und eine neu eingegangen sein.
Kein einzelner Zustand stimmt für die ganze Runde.

### 3.1 Berechnungsregel

Die Anzeige wird aus der Bewerbung berechnet, die **am weitesten fortgeschritten** ist:

| Weiteste Bewerbung steht bei … | Anzeige |
|---|---|
| noch keine Bewerbung da | „Warten auf Bewerbungen" |
| `new` / `screened` | „Abstimmung Runde 1" |
| `invited` / `scheduled` | „Terminfindung" |
| `interviewed` | „Abstimmung Runde 2" |
| `offer_made` / `moved_in` | „Zusage läuft" |

**Seitenzustände zählen nicht als Fortschritt.** `rejected_by_household`, `declined_by_applicant`,
`withdrawn` und `archived` sind Sackgassen, keine Stationen auf dem Hauptpfad — eine Bewerbung
darin ist nicht „am weitesten fortgeschritten", sie ist aus der Berechnung heraus. Sind **alle**
Bewerbungen einer Runde in einem Seitenzustand, gilt dieselbe Anzeige wie bei noch keiner
Bewerbung: „Warten auf Bewerbungen". (Wortgleich mit der Regel in
[04-Domaenenmodell.md §8.6](04-Domaenenmodell.md), dort als `MAIN_PATH_ORDER`-Pseudocode geführt —
zwei Fassungen derselben Regel, keine zwei Regeln.)

**Warum das allein nicht reicht.** Bei 20 Bewerbungen, von denen erst eine bei „Zusage" steht, wäre
„Zusage läuft" irreführend. Deshalb steht **darunter immer die tatsächliche Verteilung**: „7 in
Sichtung · 2 im Termin · 1 gecastet".

**Was die Anzeige nicht ist: ein Tor.** Sie sperrt nichts und verbirgt nichts. Eine Bewerbung
weiterzuschieben ist immer möglich, unabhängig davon, was oben steht.

> **Verworfene Alternative:** „wo die Masse liegt" statt „am weitesten". Verworfen, weil dann die
> dringendste Entscheidung der Runde unsichtbar würde, sobald sie nur eine Bewerbung betrifft.

### 3.2 Geltungsbereich der Rundenfrist

`phase_deadline_at` ist ein **einzelnes** Feld auf der Runde und heißt „Frist der aktuellen
Rundenphase". Daraus folgt zwingend: Es gibt **immer nur eine Frist gleichzeitig**, und sie gehört
zu genau der Phase, die die Berechnungsregel oben nennt. Die moderierende Person setzt sie; wenn
die Phase wechselt, setzt sie eine neue — automatisch geschieht nichts (O-E).

Die Frist wird deshalb **nie allein angezeigt**, sondern immer zusammen mit ihrer Phase:
„Abstimmung Runde 1 — noch 2 Tage" statt „noch 2 Tage". Zwei Regeln sichern das:

- **Wechselt die Phase, während eine Frist läuft**, bleibt die alte Frist stehen und wird als „aus
  der vorherigen Phase" gekennzeichnet, bis jemand sie ändert oder löscht. Sie still zu übernehmen
  wäre falsch (sie war für etwas anderes gedacht), sie still zu löschen ebenso (eine Absprache
  verschwände ohne Anlass).
- **Die Organisationsfläche weist darauf hin**, wenn die Phase gewechselt hat und die Frist noch
  die alte ist — als Aufgabe, nicht als Warnung.

> **Warum §3 vor §2 geklärt sein muss.** `phase_deadline_at` beruft sich auf „die aktuelle
> Rundenphase" — ohne die Berechnungsregel oben ist nicht bestimmt, wofür genau die Frist gilt und
> wann sie wechselt. Das war vorher ein Schönheitsfehler der Anzeige; jetzt hängt ein Datenfeld
> daran, das die Sortierung in §2 direkt speist.

---

## §4 — Rahmenwerk: drei Flächen

### 4.1 Übersicht

| Fläche | Rahmenwerk | Wer |
|---|---|---|
| **Zugang** | keine Navigation | vor der Anmeldung |
| **Bewohner** | untere Leiste *Start · Casting* · Kopfzeile *Glocke · Avatar* | jedes `ResidentProfile` |
| **Organisation** | eigene Fläche, kein Tab | wer laut Rechtematrix Rechte hat |

Zwei Tabs statt fünf (K-3): „Runde · Bewerbungen · Termine · Feed · Ich" spiegelte das mentale
Modell des Moderators. Ein Bewohner entscheidet sich nicht zwischen fünf Objekten, sondern
zwischen „was steht an" (Start, §2) und „wie steht die Bewerbungslage" (Casting, §7.4).

**Zwei Wege in die Organisation** — kein eigenes Icon in der Kopfzeile (K-6):

1. **Avatar-Menü** → „In Moderation wechseln"
2. **CTA aus der Benachrichtigung** bzw. aus der Moderations-Brücke im Dashboard (§2.3) — direkt
   auf die Handlung, nicht auf eine Übersicht

### 4.2 Identitätswechsel und Rechte

Der Identitätswechsel wohnt im selben Avatar-Menü. Eine frühere Formulierung — „ist
`acting_profile_id` `null`, handelt man als Verwaltung" — war irreführend: Sie liest sich, als
verliehe ein Null-Wert Rechte. Richtig ist:

- **`Session.acting_profile_id = null`** heißt **nur** „für diese Sitzung ist kein Bewohnerprofil
  aktiv". Mehr nicht.
- **Die Rechte kommen aus `Membership.role`** (`household_admin` · `moderator` · `member`) **und
  `Membership.permissions`** (`manage_settings`, `manage_members`, `close_round`, …). Ein Konto mit
  `role = member` bekommt durch `null` **nichts** dazu — es verliert nur seine Stimmidentität.

**Regel fürs Inventar:** Welche Abschnitte der Organisationsfläche erscheinen, entscheidet
**allein `role`/`permissions`** — nie, ob `acting_profile_id` gesetzt ist (U-21).

> **Geschützter Test (für `GUARDRAILS.md`):** Ein Konto ohne `household_admin` sieht den Abschnitt
> „Haushalt" auch dann nicht, wenn `acting_profile_id` `null` ist.

### 4.3 Verwaltung erreicht keine Castings

Ein ohne Bewohnerprofil angemeldetes Konto erreicht **nur** Haushaltsverwaltung: Zimmer,
Mitglieder, Beitrittscode, Verfahrensregeln, Aufbewahrung (U-20). Runden, Bewerbungen, Termine und
Notizen setzen ein `ResidentProfile` voraus.

Was das löst:

1. **Jede Casting-Handlung trägt einen Namen.** Bisher kann die Verwaltung Bewerbungen anlegen,
   Status ändern, Termine bestätigen und löschen — protokolliert als „Verwaltung", ohne Person. In
   einem Produkt, dessen Versprechen Legitimität ist (P-3), ist das eine Lücke.
2. **Die Sichtbarkeitsregeln werden kleiner.** Wer Beratungsinhalte sehen kann, ist ab jetzt immer
   ein Profil mit `RoundParticipation`.

**Zwei Ausnahmen bleiben bei der Verwaltung** — Pflichten des Verantwortlichen, die nicht an der
Bewohnerlage hängen dürfen: **Aufbewahrung** (verlängern, kürzen, löschen, archivieren) und
**„Datenauskunft erzeugen"**. Letzteres liest zwangsläufig Beratungsinhalte, deshalb als **Export
ohne Einsicht**: die Verwaltung stößt den Export an, sieht die Inhalte aber nicht im Bildschirm.
Jeder Export erzeugt einen `ActivityEvent`.

**Was es kostet — eine Stelle, und die ist lösbar.** „Der Haushalt darf nicht handlungsunfähig
werden", wenn der letzte Moderator auszieht, bleibt wahr — über einen Zwischenschritt: Die
Verwaltung kann sich jederzeit selbst ein `ResidentProfile` anlegen und Moderatoren ernennen
(§7.20, Abschnitt „Haushalt"). Der Weg ist einen Schritt länger und liefert am Ende einen
benannten Handelnden.

> **Nicht als Härtung darstellen.** Die Trennung ist keine Sicherheitsgrenze — wer die
> Haushaltszugangsdaten kennt, kann sich ein Profil anlegen und handeln. Was sich ändert, ist
> **Zurechenbarkeit**, nicht Zugriffsschutz: jede Casting-Handlung hat danach einen Namen.

**Zur Selbst-Redaktion:** Sie hängt am `Account`, nicht am aktiven Profil
(`redaction_subjects()` sammelt alle Profile des Accounts). Ein Identitätswechsel ist deshalb kein
Weg an der Invariante vorbei.

### 4.4 Abschnitte der Organisationsfläche

Runde · Bewerbungen · Termine · Zimmer · Mitglieder · Aufbewahrung · **Haushalt** (nur `Account`:
`ResidentProfile` anlegen, Moderator ernennen, Abstimmungsverfahren, Datenschutzseite freigeben —
G-C9).

---

## §5 — Ereignisklassen

Zwei Klassen, aus `ActivityEvent.event_type` **abgeleitet, nicht gespeichert** — gleiche Bauform
wie `phase_hint` (§3) und `Vote.weight`:

- **`outcome`** — Dinge, die für ein Profil feststehen und nicht selbst ausgelöst wurden:
  bestätigter Termin, erteilte Zusage, Einzugsdatum, Rundenschluss, neue Mitbewohnende. Speist
  „Seit deinem letzten Besuch" auf dem Start-Bildschirm, höchstens fünf Zeilen (§7.6).
- **`process`** — alles Übrige: einzelne Statuswechsel, Codeausgaben, Notizanlagen. Nur im
  Activity Center (§7.7).

Die Zuordnungstabelle für alle Ereignistypen liegt im Domänenmodell (§8, Rechenmodelle). Die
Sichtbarkeitspolicy gilt für beide Klassen unverändert (V-1, G-C6) — einschließlich
`Notification.suppressed_reason = self_redaction` für die Notiz-Erinnerung aus S-46 (G-D13).

**Der Kanal ist eine zweite Achse (S-28).** Reihenfolge: **Push → E-Mail (nur falls hinterlegt) →
In-App.** Zwei Folgen:

1. **Der Normalfall nach dem Beitritt ist „nur In-App".** Wer nach S-03 ohne E-Mail beitritt und
   Push noch nicht erlaubt hat, erreicht keine Benachrichtigung außerhalb der App. Für diese
   Person ist der Start-Bildschirm der einzige Kanal — er muss also ohne jede Erinnerung von außen
   funktionieren.
2. **Push-Berechtigung ist ein eigener Bildschirm** (§7.9), kein Systemdialog nebenbei. Er
   erscheint **nach** der ersten abgegebenen Stimme, nicht davor — vorher gibt es nichts zu
   benachrichtigen, und jede Hürde vor der ersten Stimme geht gegen die Kernmetrik.

---

## §6 — Die vier Pflichtzustände (kein fünfter)

Redigiertes braucht keinen eigenen Zustand — es soll einfach nicht da sein. Ein Feed-Eintrag,
dessen Ziel unsichtbar ist, erscheint für dieses Profil überhaupt nicht, und die eigene Bewerbung
taucht weder in der Rangliste noch unter „Warten auf Stimmen" auf.

**Regel im Inventar:** Redigiertes existiert für dieses Profil nicht. Kein Platzhalter, keine
Lücke, kein Hinweis, keine Zählung, aus der man zurückrechnen könnte.

**Genau eine benannte Ausnahme:** die Detailseite der *eigenen* Bewerbung (§7.13). Dorthin darf
man, weil das Sachprofil sichtbar bleibt (Name, Kontakt, Termin, Zimmer, Einzugsdatum) — und nur
dort wäre die Leere sonst als Ladefehler lesbar. Dort steht der Satz aus
[03-PRD.md:503](03-PRD.md:503).

Es bleiben **vier** Zustände: **Laden · Leer · Fehler · Keine Berechtigung.**
Standardverhalten zentral:

| Zustand | Standard |
|---|---|
| **Laden** | Skeleton in der Form des erwarteten Inhalts. Nie Vollbild-Spinner, nie Layoutsprung |
| **Leer** | Ein Satz, was hier normalerweise steht, plus die eine sinnvolle Handlung — oder die Erklärung, warum es noch nichts gibt. Nie ohne Anschlusshandlung |
| **Fehler** | Was schiefging in einem Satz ohne Fachjargon, „Erneut versuchen", und die Zusicherung, dass nichts verloren ging |
| **Keine Berechtigung** | Erklärung **warum** plus wer helfen kann, statt einer bloßen Sperre |

Je Bildschirm in §7–§8 nur ausgeschrieben, wo es vom Standard abweicht.

---

## §7–§8 — Bildschirmverzeichnis (41 Bildschirme)

### Legende

| Kürzel | Bedeutung |
|---|---|
| **B / O / V(alle)** | Bewohner (jedes `ResidentProfile`) / Organisation (nach `role`/`permissions`, §4.2) / vor der Anmeldung |
| **v1 / v1.1** | Phase — v1.1 nur, wo eine Zeile das ausdrücklich markiert; alles andere ist v1 |
| ⚡ | Kernbildschirm — hier entscheidet sich das Produkterlebnis |

**Vier Pflichtzustände je Bildschirm** (§6): Laden · Leer · Fehler · Keine Berechtigung. Nur
einzeln ausgeführt, wo sie inhaltlich vom Standard abweichen.

### 7.0 Übersichtstabelle

| # | Bildschirm | Rollen | Fläche | ⚡ |
|---|---|:--:|---|:--:|
| **A — Zugang** |
| A1 | Registrierung (Haushalt) | alle | Zugang | |
| A2 | Anmeldung | alle | Zugang | |
| A3 | Beitritt per Code | alle | Zugang | |
| A4 | Einladungstoken einlösen | alle | Zugang | |
| **B — Start** |
| B1 | Start — „Was ist dran?" | B | Bewohner | ⚡ |
| B2 | Benachrichtigungszentrum | B | Bewohner | |
| B3 | Activity Center — „Alle Aktivitäten" | B | Bewohner | |
| B4 | Teilnehmendenliste | B | Bewohner | |
| **C — Beteiligung** |
| C1 | Screening-Durchlauf | B | Bewohner | ⚡ |
| C2 | Zweiter Durchlauf | B | Bewohner | |
| C3 | Runde 2 — Zusage-Abstimmung | B | Bewohner | |
| C4 | Casting-Notiz schreiben | B | Bewohner | |
| C5 | Verfügbarkeit eintragen | B | Bewohner | |
| C6 | Slot-Reaktion | B | Bewohner | |
| C7 | Push-Berechtigung erteilen | B | Bewohner | |
| C8 | „Ich kann doch nicht" — Terminabsage | B | Bewohner | |
| **D — Casting-Tab** |
| D1 | Rangliste — „Warten auf Stimmen" | B | Bewohner | ⚡ |
| D2 | Kandidaten-Einzelansicht | B | Bewohner | |
| D3 | Eigene Bewerbung | B | Bewohner | |
| D4 | Termine | B | Bewohner | |
| **E — Einstellungen** |
| E1 | Einstellungen | B | Bewohner | |
| **O — Organisation** |
| O1 | Orga-Dashboard | O | Organisation | ⚡ |
| O2 | Runde anlegen | O | Organisation | |
| O3 | Bewerbung erfassen | O | Organisation | |
| O4 | Pipeline | O | Organisation | |
| O5 | Statuswechsel + Copy-Paste-Text | O | Organisation | |
| O6 | Frühere Bewerbung zuordnen | O | Organisation | v1.1 |
| O7 | Verfügbarkeitsraster / Heatmap | O | Organisation | |
| O8 | Bewerber-Verfügbarkeit eintragen | O | Organisation | |
| O9 | Terminvorschlag | O | Organisation | |
| O10 | Terminbestätigung | O | Organisation | |
| O11 | Anwesenheit korrigieren | O | Organisation | |
| O12 | Zusage erteilen + Einladungstoken erzeugen | O | Organisation | |
| O13 | Rückmeldung einpflegen | O | Organisation | |
| O14 | Zimmer | O | Organisation | |
| O15 | Rundenfrist setzen / verlängern | O | Organisation | |
| O16 | Mitglieder | O | Organisation | |
| O17 | Aufbewahrung | O | Organisation | |
| O18 | Aufbewahrungs-Vorwarnung | O | Organisation | |
| O19 | Datenauskunft | O | Organisation | |
| O20 | Haushalt-Einstellungen | O (nur `household_admin`) | Organisation | |

**41 Bildschirme:** 4 Zugang · 4 Start · 8 Beteiligung · 4 Casting-Tab · 1 Einstellungen ·
20 Organisation. Davon 4 Kernbildschirme (⚡).

---

### A — Zugang

#### A1 · Registrierung (Haushalt)

| | |
|---|---|
| **Zweck** | Einen neuen Haushalt anlegen. Erster Kontakt für die Person, die Flatmate.io einführt |
| **Zugang** | Ohne Anmeldung erreichbar |

**Kernelemente**

- E-Mail + Passwort, mit Hinweis, dass die Adresse künftig gemeinsam mit weiteren Verwaltenden
  genutzt werden kann
- Anlegt: `Household` + `Account` (`role = household_admin`)

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Fehler — E-Mail bereits vergeben | Hinweis mit direktem Weg zur Anmeldung (A2), keine Fehlermeldung ohne Ausweg |

---

#### A2 · Anmeldung

| | |
|---|---|
| **Zweck** | Zugang zu einem bestehenden Konto |
| **Zugang** | Ohne Anmeldung erreichbar |

**Kernelemente**

- Für Haushalts-Accounts: E-Mail + Passwort
- Für Resident-Accounts ohne E-Mail: Haushalt + Anzeigename + Passwort (O-D, Vorschlag) — Feld
  „Haushalt" vorbelegt, wenn das Gerät „angemeldet bleiben" hält
- Passkey als Alternative, wenn zuvor eingerichtet

---

#### A3 · Beitritt per Code

| | |
|---|---|
| **Zweck** | Bestehende Mitbewohnende treten dem Haushalt bei — der kürzeste Weg der Anwendung (S-03) |
| **Zugang** | `join_code`-Link, ohne vorherige Anmeldung |
| **⚡** | Ja — gemeinsam mit C1 der kürzeste, meistgenutzte Pfad der Anwendung |

**Kernelemente**

- **Ein** Bildschirm, **zwei** Pflichtfelder: Name und Passwort. E-Mail entfällt vollständig (S-03)
- Kontrollkästchen „Auf diesem Gerät angemeldet bleiben", vorbelegt
- Haushaltsname zur Bestätigung: „Du trittst *WG Hauptstraße 12* bei" — der Code selbst ist über
  den Link bereits gesetzt, wird nicht erneut abgefragt
- Kein Passkey während der Registrierung, keine Verifikation, kein Zwischenbildschirm
- Anlegt: `ResidentProfile` + `Membership` (`is_resident = true`); **keine** Verknüpfung zu einer
  Bewerbung
- Direkt danach: Screening-Durchlauf (C1), falls eine offene Bewerbung wartet — sonst Start (B1)

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Fehler — Code abgelaufen | „Dieser Beitrittscode ist abgelaufen." + Hinweis, im Haushalt nach einem neuen zu fragen |

---

#### A4 · Einladungstoken einlösen

| | |
|---|---|
| **Zweck** | Der reguläre Weg, aus einer zugesagten Bewerbung eine Bewohnerin oder ein Bewohner zu machen — löst automatisch `Application.became_resident_id` (S-42) |
| **Zugang** | Einmaliger `ApplicationInviteToken`-Link, ohne vorherige Anmeldung |

**Kernelemente**

- Gleicher Registrierungsablauf wie A3 (Name + Passwort), danach direkt in die Runde
- Erklärender Satz zur Selbst-Redaktion: Ab diesem Moment sieht die Person ihre eigene Bewerbung
  anders als die der anderen (§7.13) — die Person muss verstehen, warum, bevor sie es bemerkt

**Vier Ausgänge, nicht zwei (K-17)** — jeder mit einem Satz, der sagt, was jetzt zu tun ist:

| Fall | Feld | Was die Person liest |
|---|---|---|
| Alles gut | — | Registrierung, danach direkt in die Runde |
| Schon eingelöst | `used_at` gesetzt | „Dieser Einladungslink wurde bereits verwendet." + Weg zur Anmeldung |
| Abgelaufen oder zurückgezogen | `expires_at` / `revoked_at` | „Dieser Einladungslink ist abgelaufen." + „Frag in der WG nach einem neuen" |
| Bereits Bewohner:in | Konto hat schon ein `ResidentProfile` im Haushalt | „Du bist bereits als Bewohner:in registriert." — **kein Merge, kein stilles Überschreiben** |

Die drei Fehlertexte unterscheiden sich bewusst: „schon benutzt" und „abgelaufen" führen zu
verschiedenen nächsten Schritten. Der letzte Fall steht im Domänenmodell als geschützter Test
(G-D12), nicht als Kommentar.

---

### B — Start

#### B1 · Start — „Was ist dran?" ⚡

| | |
|---|---|
| **Zweck** | Beantwortet die Kernfrage beim Öffnen: was steht an. Trägt das Aufgabenmodell aus §2 |
| **Zugang** | Standard-Landeseite für jedes `ResidentProfile` |

**Kernelemente**

- Primärer CTA nach der Sortierung aus §2.2, mit genanntem Grund
- Bis zu drei weitere Aufgabenzeilen, Rest eingeklappt als „und N weitere"
- Phasenanzeige aus §3, nie ohne ihre Frist, falls gesetzt
- „Seit deinem letzten Besuch" — nur `outcome`-Ereignisse (§5), höchstens fünf Zeilen
- **PWA-Install-Band** (S-45) — eigenes, optisch abgesetztes Element **unter** dem primären CTA,
  nie auf dessen Platz und nie über einer fristgebundenen Aufgabe (§13, Konflikt 2)
- Moderations-Brücke am Fuß, nur mit Rechten (§2.3)

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Leer (keine Aufgabe offen) | Rundenstand aus §3 füllt die Fläche — nie leer |

---

#### B2 · Benachrichtigungszentrum

| | |
|---|---|
| **Zweck** | Zugriff auf einzelne Benachrichtigungen und den Einstieg ins vollständige Protokoll |
| **Zugang** | Glocke in der Kopfzeile |

**Kernelemente**

- Liste einzelner `Notification`s, ungelesen hervorgehoben
- Unterpunkt „Alle Aktivitäten" → B3
- Jede Notification führt direkt auf ihr Ziel (Bewerbung, Termin, Runde), nie auf eine
  Zwischenübersicht

---

#### B3 · Activity Center — „Alle Aktivitäten"

| | |
|---|---|
| **Zweck** | Das vollständige `ActivityEvent`-Log — löst U-3/U-4 auf: Start zeigt nur Ergebnisse, hier steht alles |
| **Zugang** | Aus B2 |

**Kernelemente**

- Chronologische Liste beider Ereignisklassen (§5), `process` und `outcome` gemeinsam
- Sichtbarkeitspolicy identisch zu B1 (V-1, G-C6) — Redigiertes erscheint nicht (§6)

---

#### B4 · Teilnehmendenliste

| | |
|---|---|
| **Zweck** | Beantwortet „wer sind die sieben?" — nicht „wer wohnt hier?" (zweite, getrennte Frage: O16) |
| **Zugang** | Tippen auf „5 von 7 haben abgestimmt" auf B1 oder D1 |

**Kernelemente**

- Nur Namen der `RoundParticipation`-Teilnehmenden dieser Runde
- Keine Handlungen — reine Information
- **Zeigt ausdrücklich nicht**, wer schon abgestimmt hat und wer nicht (kein „Pranger"; bereits
  heute Akzeptanzkriterium und SRD §10)

> **Unterschied zu O16 Mitglieder.** „Wer macht gerade mit" und „wer wohnt hier" sind nicht
> dieselbe Frage (K-11, U-22, siehe Vergleichstabelle in §7-Einleitung zu O16).

---

### C — Beteiligung

Alle acht Bildschirme dieser Gruppe sind **vollständig auf dem Telefon bedienbar, einhändig, ohne
Querformat** — eine Handlung pro Bildschirm, keine horizontal scrollende Tabelle.

#### C1 · Screening-Durchlauf ⚡

| | |
|---|---|
| **Zweck** | Die häufigste Handlung der Anwendung: Stimme zur Einladung (`stage = invite`) |
| **Zugang** | Direkt nach A3/A4, sonst aus dem primären CTA (T-5) |

**Kernelemente**

- Karte für Karte eine der vier Stufen wählen: Nein / Eher nicht / Finde gut / Unbedingt (E-07)
- Jederzeit revidierbar, solange die Runde offen ist
- Fortschrittsanzeige „2 von 8"
- Nach der letzten Karte: falls eigene „Unbedingt" > `budget`, Übergang zu C2 — sonst direkt zur
  Rangliste (D1)

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Leer | „Nichts wartet auf dich" — keine offene Bewerbung |

---

#### C2 · Zweiter Durchlauf

| | |
|---|---|
| **Zweck** | Ersetzt den früher geplanten eigenen Feinschliff-Bildschirm (§9) — reduziert eigene „Unbedingt"-Stimmen auf ein umsetzbares Maß |
| **Zugang** | Nur nach C1, nur falls `Unbedingt-Zahl > budget` |

**Kernelemente**

- Zwischenschritt mit **einem** Satz: „Du hast 8-mal *Unbedingt* vergeben. Bei 3 Zimmern helfen
  höchstens 5. Noch einmal durchgehen?" — „Durchgehen" / „Überspringen"
- Bei „Durchgehen": derselbe Kartenstapel, nur die eigenen Unbedingt-Karten, dieselben vier Stufen
- Jederzeit abbrechbar, Stimmen bleiben dann unverändert

Details zu `budget` und der Ablaufsequenz: §9.

---

#### C3 · Runde 2 — Zusage-Abstimmung

| | |
|---|---|
| **Zweck** | Stimme zur Zusage (`stage = offer`), optional mit `Veto` |
| **Zugang** | Aus dem primären CTA (T-4), nach Casting einer Bewerbung |

**Kernelemente**

- Gleiche vierstufige Skala wie C1, andere Karten-Menge (nur gecastete Bewerbungen)
- `Veto`-Option mit Pflicht-Begründung
- Veto-Budget-Zähler sichtbar, wenn nahezu erschöpft

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Veto gesetzt | Kandidat rankt tief, wird **nicht** gelöscht (E-11) |
| Veto-Budget erschöpft | Hinweis mit Zähler, Stimme ohne Veto bleibt möglich |

---

#### C4 · Casting-Notiz schreiben

| | |
|---|---|
| **Zweck** | Strukturierte Eindrücke zu einem Casting festhalten — Grundlage für Runde 2 der Abwesenden |
| **Zugang** | Aus T-1 im primären CTA, oder direkt von der Kandidaten-Einzelansicht (D2) |

**Kernelemente**

- Strukturierte Prompts statt freiem Textfeld
- Für alle Rundenteilnehmenden lesbar (nicht selbst-redigiert für Dritte)
- Setzt `AppointmentAttendance.note_written = true` (S-46)

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Leer (fremde Notizen, Kandidaten-Ansicht) | „Keine Notizen vorhanden" statt eines leeren Felds, wenn niemand geschrieben hat |

---

#### C5 · Verfügbarkeit eintragen

| | |
|---|---|
| **Zweck** | Eigene `AvailabilityWindow`s für die Terminfindung angeben |
| **Zugang** | Aus T-3 im primären CTA |

**Kernelemente**

- Raster oder Freitext mit Bestätigung
- Speist die Heatmap in O7

---

#### C6 · Slot-Reaktion

| | |
|---|---|
| **Zweck** | Auf einen Terminvorschlag reagieren: 👍 oder „kann nicht" |
| **Zugang** | Aus T-2 im primären CTA |

**Kernelemente**

- Ein `Slot`, eine binäre Antwort
- Ergebnis speist das Zustimmungsbild in O9/O10

---

#### C7 · Push-Berechtigung erteilen

| | |
|---|---|
| **Zweck** | Web-Push aktivieren — eigener Bildschirm, kein Systemdialog nebenbei (S-28) |
| **Zugang** | Nach der ersten abgegebenen Stimme, einmalig |

**Kernelemente**

- Erklärt in einem Satz, wofür Push genutzt wird, bevor der Systemdialog erscheint
- Erst **nach** der ersten `Vote` gezeigt — vorher gibt es nichts zu benachrichtigen, und jede
  Hürde davor geht gegen die Kernmetrik

---

#### C8 · „Ich kann doch nicht" — Terminabsage

| | |
|---|---|
| **Zweck** | Kurzfristige Absage einer einzelnen Person zu einem Termin, an dem sie eigentlich teilnehmen wollte (U-23) |
| **Zugang** | Aus der Terminerinnerung vor einem `Appointment` |

**Kernelemente**

- Ein Knopf, eine Bestätigung — kein Formular
- Setzt die Person auf „nicht anwesend" für diesen Termin, ohne den ganzen `Appointment.status` zu
  ändern

> **Datenmodell-Lücke, nicht Oberflächen-Lücke.** Die kurzfristige Absage einer einzelnen Person
> ist heute in `04-Domaenenmodell.md` nicht modelliert — `Appointment.status` gilt nur für den
> ganzen Termin (B-3 im Sprint-Log). Dieser Bildschirm setzt das Feld voraus, das die
> Domänenmodell-Sitzung dafür ergänzt; siehe §13.

---

### D — Casting-Tab

#### D1 · Rangliste — „Warten auf Stimmen" ⚡

| | |
|---|---|
| **Zweck** | Bewerbungslage überblicken und in eine Bewerbung einsteigen |
| **Zugang** | Unterer Tab „Casting" |

**Kernelemente**

- Sortierbare Rangliste mit Score (nach eigener Stimme sichtbar, Standard V-4)
- Abschnitt „Warten auf Stimmen" getrennt von der Rangliste
- Zugriff auf D2, D3, D4
- Einstieg in B4 über „5 von 7 haben abgestimmt"

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Leer | Noch keine Bewerbung in dieser Runde — Rundenstand aus §3 statt einer leeren Liste (analog B1) |
| Eigene Stimme fehlt | Ergebnisse verdeckt mit Erklärung, Sprung in C1/C3 |

---

#### D2 · Kandidaten-Einzelansicht

| | |
|---|---|
| **Zweck** | Detailansicht einer Bewerbung mit Stimmen, Notizen und Aggregat |
| **Zugang** | Aus D1 |

**Kernelemente**

- Lädt Stimmen, Notizen und Aggregat erneut mit Policy-Prüfung — übernimmt nichts ungeprüft aus D1
- Zugriff auf C4 (Notiz schreiben/lesen)

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Selbst-Redaktion greift | Kann für die betroffene Person nicht auftreten — die eigene Bewerbung führt stattdessen auf D3 |

---

#### D3 · Eigene Bewerbung

| | |
|---|---|
| **Zweck** | Die einzige benannte Ausnahme vom „existiert nicht" der Selbst-Redaktion (§6) — Sachprofil ohne Beratungsinhalte |
| **Zugang** | Aus D1, sobald die eigene Bewerbung `became_resident_id` gesetzt hat |

**Kernelemente**

- Sachprofil: Name, Kontakt, Termin, Zimmer, Einzugsdatum
- **Keine** Stimmen, Notizen oder Score — mit dem Satz aus [03-PRD.md:503](03-PRD.md:503), damit
  die Leere nicht als Ladefehler gelesen wird

---

#### D4 · Termine

| | |
|---|---|
| **Zweck** | Einzugstermin und `Appointment`s der Runde überblicken |
| **Zugang** | Aus D1 oder dem Terminhinweis auf B1 |

**Kernelemente**

- Übersicht aller Runden-Termine, chronologisch

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Leer | Kein Termin geplant |

---

### E — Einstellungen

#### E1 · Einstellungen

| | |
|---|---|
| **Zweck** | Ein Bildschirm statt mehrerer Einzelziele (K-10) — Benachrichtigungen, Konto, Abmelden als Abschnitte |
| **Zugang** | Aus dem Avatar-Menü |

**Kernelemente**

- **Abschnitt Benachrichtigungen:** Push verwalten (Verweis auf C7), **E-Mail nachtragen** —
  Pitch ausdrücklich „Zugang wiederherstellen, falls du dein Passwort vergisst" (S-45), nie als
  Sperre formuliert
- **Abschnitt Konto:** Passwort ändern, Passkey einrichten/entfernen
- **Abmelden**

> **Kasten — Passwort-Reset ist ein bewusster Tauschhandel (K-18).** Solange ein Resident-Profil
> keine eigene E-Mail hinterlegt hat, kann die Verwaltung dessen Passwort zurücksetzen — das ist
> eine Zugriffsmöglichkeit auf fremde Profile, bewusst eingegangen als Preis dafür, dass ein
> Beitritt ohne E-Mail möglich ist und ein vergessenes Passwort nicht zum dauerhaften
> Profilverlust führt. Die Lücke schließt sich, sobald die Person eine eigene E-Mail hinterlegt;
> bis dahin bleibt sie sichtbar — jeder Reset erzeugt einen `ActivityEvent` im Feed aller
> Bewohnenden und beendet die bestehenden Sitzungen des betroffenen Profils. Nicht als
> Sicherheitsgrenze darstellen (E-03).

---

### O — Organisation

Das Orga-Dashboard folgt derselben Regel wie das Bewohner-Dashboard (K-8): eine Aufgabenliste, kein
Kontrollpult mit acht Kacheln. Drei harte Regeln gelten für die gesamte Fläche, weil
**Organisationsaufwand senken ein Ziel ist** (PB-2), keine Nettigkeit — Moderation ist Mehraufwand,
den jemand zusätzlich zur eigenen Beteiligung freiwillig trägt:

1. **Jede Orga-Aufgabe führt direkt auf die Handlung**, nie auf eine Liste, in der man sie
   wiederfinden muss.
2. **Was das System selbst weiß, wird keine Aufgabe.** Es gibt keine Aufgabe „prüfe, ob das
   Quorum erreicht ist" — die Zahl steht ohnehin da.
3. **Kein Zähler ohne Handlung.** Eine Zeile, die nur informiert, gehört in den Rundenkopf, nicht
   in die Aufgabenliste.

**Wortlaut — Prozess vs. Person (C-10).** Texte dürfen werbend über den **Prozess** sprechen, nie
wertend über die **Person**:

| ✅ Über den Prozess — erlaubt | ❌ Über die Person — nie |
|---|---|
| „Alle haben abgestimmt — ihr könnt jetzt entscheiden, wen ihr einladet" | „3 vielversprechende Kandidaten" |
| „Die Castings sind gelaufen. Jetzt geht's um die Zusage" | „Lea passt gut zu euch" |
| „Lea hat die meisten Punkte bekommen" | „Wir empfehlen Lea" |

Ein Satz darf sich nur auf eine Schwelle berufen, **die es wirklich gibt** (`quorum_share`,
Favoriten-Budget, Veto-Budget, Rundenfrist). Für alles andere beschreibt er, dass ein Schritt
offensteht, und überlässt die Entscheidung der Gruppe. Grund: P-5 verbietet, dass **KI**
Bewertungen über Personen erzeugt — die Anwendung selbst rankt zulässig, weil sie menschliche
Stimmen nach offengelegten Regeln zusammenrechnet (E-07, S-12); ein von Hand geschriebener Satz ist
keine KI-Ausgabe, P-5 verbietet den werbenden Ton also nicht. Die tatsächliche Grenze liegt bei
Prozess vs. Person, nicht bei „beschreibend vs. empfehlend".

#### O1 · Orga-Dashboard ⚡

| | |
|---|---|
| **Zweck** | Einstieg in die Organisationsfläche — Aufgabenliste nach denselben drei Regeln oben |
| **Zugang** | Avatar-Menü „In Moderation wechseln" oder CTA aus einer Benachrichtigung |

**Kernelemente**

- Ein primärer CTA, bis zu drei Zeilen darunter, Rest eingeklappt — sortiert nach Zeitdruck mit
  genanntem Grund, gleiches Prinzip wie B1
- Hinweis, wenn eine Rundenfrist nach einem Phasenwechsel stehengeblieben ist (§3.2)

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Leer (keine Orga-Aufgabe offen) | Rundenübersicht aus §3 füllt die Fläche — nie leer (analog B1, §2.3) |

---

#### O2 · Runde anlegen

| | |
|---|---|
| **Zweck** | Eine neue `CastingRound` starten |
| **Zugang** | Aus O1, oder aus O14 (Zimmer), wenn ein Zimmer frei wird |

**Kernelemente**

- Zimmerauswahl aus den offenen `Room`s
- Anlegt: Runde `open`; `RoundParticipation` aus den aktiven Bewohnenden gesnapshottet (E-13)

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Bereits offene Runde | Hinweis, Wechsel zur bestehenden Runde anbieten |
| Kein Zimmer verfügbar | Hinweis statt Sperre ohne Erklärung |

---

#### O3 · Bewerbung erfassen

| | |
|---|---|
| **Zweck** | Eine eingehende Bewerbung ins System bringen — per Formular oder eingefügter Nachricht |
| **Zugang** | Aus O1 oder O4 |

**Kernelemente**

- Formular ausfüllen **oder** Nachricht einfügen mit Parser-Vorschlag zur Bestätigung (P-1, S-08)
- Einziges Pflichtfeld: `name`
- Anlegt: `Application` im Zustand `new`

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Parser erkennt nichts | Vorbelegtes Formular ohne Fehlermeldung |

---

#### O4 · Pipeline

| | |
|---|---|
| **Zweck** | Alle Bewerbungen einer Runde nach Status überblicken |
| **Zugang** | Aus O1 |

**Kernelemente**

- Bewerbungen gruppiert nach `Application.status`
- Zugriff auf O5 je Bewerbung

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Leer | Noch keine Bewerbung erfasst — Primärhandlung „Bewerbung erfassen" (O3) statt einer leeren Fläche |

---

#### O5 · Statuswechsel + Copy-Paste-Text

| | |
|---|---|
| **Zweck** | Eine Bewerbung im Status weiterschieben und den dazugehörigen Nachrichtentext erzeugen |
| **Zugang** | Aus O4 |

**Kernelemente**

- „Als eingeladen markieren" → `status: new → screened → invited`
- **Copy-Paste-Text mit Datenschutzhinweis** wird erzeugt (S-16)

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Selbst-Redaktion greift | Sachprofil ohne Beratungsinhalte, mit ehrlichem Hinweis auf den Umfang |

---

#### O6 · Frühere Bewerbung zuordnen

| | |
|---|---|
| **Zweck** | Manuelle Zuordnung für alle Fälle **ohne** Einladungstoken — ältere Bewerbungen derselben Person, nachträgliche Korrekturen (S-40) |
| **Zugang** | Aus O5, wenn eine Person bereits früher beworben hat |
| **Phase** | v1.1 |

**Kernelemente**

- Suche nach vorhandenen `Application`s derselben Person
- Bestätigung setzt `became_resident_id` manuell — der Ausnahmeweg neben dem regulären
  Einladungstoken (A4)

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Leer (kein Treffer) | „Keine frühere Bewerbung dieser Person gefunden" + Weg zurück zu O5, ohne Sackgasse |

> **Trennung von A4 halten.** Ohne klare Trennung wirkt dieser Bildschirm wie eine überflüssige
> Dopplung des Einladungstokens — er ist es nicht: A4 ist der reguläre Weg, dieser hier der
> Ausnahmeweg.

---

#### O7 · Verfügbarkeitsraster / Heatmap

| | |
|---|---|
| **Zweck** | Verfügbarkeit der Bewohnenden für die Terminfindung überblicken |
| **Zugang** | Aus O9 |

**Kernelemente**

- Heatmap „4/7 können" aus den `AvailabilityWindow`s der Bewohnenden (C5)
- Mobil vereinfacht darstellbar (§4.1.0, Moderations-Bildschirm)

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Kein Eintrag | Heatmap bleibt leer, manuelles Legen bleibt möglich |

---

#### O8 · Bewerber-Verfügbarkeit eintragen

| | |
|---|---|
| **Zweck** | Wunschzeiten der Bewerbenden erfassen — v1 manuell/Parser, v1.1 per Token-Link |
| **Zugang** | Aus O5 nach dem Statuswechsel auf `invited` |

**Kernelemente**

- `AvailabilityWindow` an der `Application`

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Keine Angabe | Alle Slots gelten als möglich, sichtbar als Annahme markiert |

---

#### O9 · Terminvorschlag

| | |
|---|---|
| **Zweck** | Einen Termin berechnen oder von Hand legen |
| **Zugang** | Aus O7/O8 |

**Kernelemente**

- „Vorschlag berechnen" **oder** `Slot`s von Hand legen
- Vorschlag mit nachrechenbarer Begründung (S-19, S-20, P-3)

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Unlösbar | Harte Constraints einzeln relaxiert, Grund benannt |
| Solver nicht verfügbar | Manuelles Legen bleibt voll nutzbar |

---

#### O10 · Terminbestätigung

| | |
|---|---|
| **Zweck** | Einen vorgeschlagenen Termin final bestätigen |
| **Zugang** | Aus O9, nachdem Bewohnende per C6 reagiert haben |

**Kernelemente**

- Zustimmungsbild aus den Slot-Reaktionen (C6)
- Bestätigung: `Appointment` angelegt, `status: invited → scheduled`, Kalendereintrag
- Legt `AppointmentAttendance`-Zeilen aus `expected_attendee_profile_ids` an, **`attended = true`**
  — die moderierende Person tut hier nichts weiter (U-23)

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Zu wenig Zustimmung | Moderator bestätigt trotzdem oder legt neu; keine Sperre |
| Bewerbende sagt Termin ab | `scheduled → invited` (Rückwärtsübergang, P-4) |

---

#### O11 · Anwesenheit korrigieren

| | |
|---|---|
| **Zweck** | Ausnahmefall — „War jemand doch nicht da?", **nie** Pflichtschritt (U-23) |
| **Zugang** | Aus D4/O10, erreichbar, aber nicht beworben |

**Kernelemente**

- Korrektur von `AppointmentAttendance.attended` für einzelne Teilnehmende
- Im Normalablauf einer Runde enthält das Orga-Dashboard (O1) **keine** Aufgabe hierzu — sie
  erscheint nur, wenn über C8 jemand abgesagt hat

> **Warum das hier steht statt als Pflichtschritt.** Anwesenheit erfassen als eigener
> Moderationsschritt erzeugt genau den Organisationsaufwand, den das Produkt senken soll. Die
> Information liegt ohnehin vor — wer auf den `Slot` reagiert hat und im `Appointment` als
> Teilnehmender steht, wollte da sein. Die Richtung ist deshalb umgekehrt: `attended` startet auf
> `true` (O10), Bewohnende sagen selbst ab (C8), die Moderation korrigiert nur Ausnahmen (hier).

---

#### O12 · Zusage erteilen + Einladungstoken erzeugen

| | |
|---|---|
| **Zweck** | Eine gecastete Bewerbung zur Bewohnerin/zum Bewohner machen |
| **Zugang** | Aus O4, nach Runde 2 (C3) |

**Kernelemente**

- „Zusage erteilen", Zimmer und Wunsch-Einzugstermin festhalten (auch vorläufig)
- `status: interviewed → offer_made`; Copy-Paste-Text; **Veto-Sperre greift**
- Erzeugt den `ApplicationInviteToken` für A4 (S-42)

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Mehrere Zimmer offen | Zimmerzuordnung erforderlich, `Room` wechselt Zustand |

---

#### O13 · Rückmeldung einpflegen

| | |
|---|---|
| **Zweck** | Zusage oder Absage der Bewerbenden erfassen |
| **Zugang** | Aus O12 |

**Kernelemente**

- Zusage → `moved_in`, `became_resident_id` wird gesetzt, sobald ein `ResidentProfile` entsteht
  (regulär über A4, oder manuell über O6)
- Absage → `declined_by_applicant`

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Rücktritt nach Zusage | `moved_in → offer_made` oder `declined_by_applicant`, auditiert (P-4) |

---

#### O14 · Zimmer

| | |
|---|---|
| **Zweck** | `Room`s als eigene Objekte verwalten |
| **Zugang** | Aus O1, Abschnitt Organisationsfläche |

**Kernelemente**

- Zimmerliste mit Status
- Zimmer anlegen/bearbeiten
- Verweis auf O2, wenn ein Zimmer frei wird und noch keine Runde dafür läuft

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Leer (frisch angelegter Haushalt) | „Noch keine Zimmer — leg das erste an" mit direkter Primärhandlung, kein toter Zustand |

---

#### O15 · Rundenfrist setzen / verlängern

| | |
|---|---|
| **Zweck** | `phase_deadline_at` für die aktuelle Rundenphase setzen oder verlängern (S-44) |
| **Zugang** | Aus O1 oder direkt von der Phasenanzeige |

**Kernelemente**

- Datum wählen, mit dem Hinweis, zu welcher Phase (§3.1) es gehört
- Kein Vorschlagswert — eine automatisch gesetzte Frist wäre eine Erwartung, die niemand vereinbart
  hat (O-E)
- Verlängern mit einem Tippen

---

#### O16 · Mitglieder

| | |
|---|---|
| **Zweck** | Verwaltung — wer gehört zum Haushalt. Getrennt von der Teilnehmendenliste (B4), die nur „wer macht gerade mit" beantwortet (K-11, U-22) |
| **Zugang** | Aus O1, Abschnitt Organisationsfläche |

**Zwei Listen im Vergleich**

| | **Teilnehmendenliste (B4)** | **Bewohnerliste (hier)** |
|---|---|---|
| Zweck | Information — wer gehört zu dieser Runde | Verwaltung — wer gehört zum Haushalt |
| Inhalt | nur Namen | Namen, Beitrittsdatum, Kontakt, Status |
| Handlungen | keine | entfernen, `moved_out`, reaktivieren, Code |
| Verwaltung | — | voll |
| Moderator | ja | lesend |
| Bewohnende | ja | **nein** |

**Kernelemente**

- Mitgliederliste mit Rolle, Beitrittsdatum, verknüpften `ResidentProfile`s
- **Beitrittscode teilen** — mit den drei Auflagen aus S-49:
  1. Warnhinweis dort, wo der Link kopiert wird: „Teile diesen Link nur direkt mit deinen
     Mitbewohnenden — niemals öffentlich. Wer ihn hat, kann mitstimmen."
  2. Ablauf (`join_code_expires_at`, Vorschlag 7 Tage, mit einem Tippen verlängerbar)
  3. Nutzungsgrenze (`join_code_max_uses`, vorbelegt mit der Zahl der noch fehlenden Bewohnenden)
- Mitglied entfernen, `moved_out` setzen, reaktivieren

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Leer (nur die Verwaltung ist Mitglied) | Beitrittscode prominent statt einer leeren Liste — dieselbe Handlung wie oben, kein Sonderbildschirm |

> **Warum die drei Auflagen hier tragend sind, nicht nur ergänzend.** Mit der Trennung in zwei
> Listen sehen reine Bewohnende die Bewohnerliste nicht mehr und können niemanden mehr entfernen —
> zwei von vier Säulen des bisherigen strukturellen Missbrauchsschutzes (E-06) fallen weg. Übrig
> bleiben der Feed-Eintrag „X ist beigetreten" und die Bewohnerzahl im Nenner. Der Beitrittslink
> wird dadurch zur **letzten verbliebenen Kontrolle** — Ablauf und Nutzungsgrenze sind deshalb
> Pflicht, keine Zugabe.

---

#### O17 · Aufbewahrung

| | |
|---|---|
| **Zweck** | Aufbewahrungsfristen abgeschlossener Runden verwalten |
| **Zugang** | Aus O1, Abschnitt Organisationsfläche — bleibt für ein Konto ohne `ResidentProfile` erreichbar (§4.3, Ausnahme) |

**Kernelemente**

- Verlängern, kürzen, löschen, archivieren
- Aufbewahrungsuhr startet mit Rundenschluss (180 Tage, E-18)

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Leer | Noch keine abgeschlossene Runde — nichts zur Aufbewahrung, kein Fehlzustand |

---

#### O18 · Aufbewahrungs-Vorwarnung

| | |
|---|---|
| **Zweck** | 14 Tage vor Ablauf aktiv werden |
| **Zugang** | Aus einer Benachrichtigung, oder aus O17 |

**Kernelemente**

- „Verlängern / jetzt löschen / archivieren"
- Verlängerung protokolliert mit Begründung

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Keine Reaktion | **Keine stille Löschung** — erneuter Hinweis, Löschung erst nach Ablauf und mit `ActivityEvent` |

---

#### O19 · Datenauskunft

| | |
|---|---|
| **Zweck** | Export aller zu einer bewerbenden Person gespeicherten Daten — Export **ohne Einsicht** (§4.3) |
| **Zugang** | Aus O1, Abschnitt Organisationsfläche — bleibt für ein Konto ohne `ResidentProfile` erreichbar (§4.3, Ausnahme) |

**Kernelemente**

- „Datenauskunft erzeugen" auf einer `Application`
- Die Verwaltung stößt den Export an, sieht die Inhalte nicht im Bildschirm
- Jeder Export erzeugt einen `ActivityEvent`
- Auskunftspflichtig ist der Haushalt; Flatmate.io unterstützt (Art. 28 Abs. 3 lit. e DSGVO)

---

#### O20 · Haushalt-Einstellungen

| | |
|---|---|
| **Zweck** | Die drei Account-exklusiven Dinge, die nicht an der Bewohnerlage hängen dürfen (§4.4) |
| **Zugang** | Nur `household_admin`, unabhängig von `acting_profile_id` (§4.2) |

**Kernelemente**

- **`ResidentProfile` anlegen** — der Weg, über den die Verwaltung handlungsfähig bleibt, wenn der
  letzte Moderator auszieht (§4.3)
- **Moderator ernennen** — Rollenwechsel innerhalb der `Membership`
- **Abstimmungsverfahren** — Regel-Sperre während einer laufenden Runde (E-25)
- **Datenschutzseite freigeben** — `PublishedPrivacyNotice` (G-C9); vor Freigabe über keinen
  Codepfad erreichbar

---

## §9 — Der zweite Durchlauf statt eines Feinschliff-Screens

Statt eines eigenen Vergleichsbildschirms (bisher [03-PRD.md §4.1.5](03-PRD.md:452), „Unbedingt"-
Kandidaten **nebeneinander, direkt herabstufbar") ein zweiter kurzer Durchlauf über die eigenen
„Unbedingt"-Karten, im selben Muster wie das Screening (C1/C2).

**Warum das die Design-Lücke schließt, statt sie zu füllen.** Der `review-log.md` nennt den
Feinschliff „die einzige wirklich neue Interaktion des Produkts" und markiert das fehlende Design
🔴. Ein zweiter Durchlauf **beseitigt die Neuheit**, statt sie zu gestalten — niemand lernt eine
zweite Bedienweise. Damit fällt die Lücke weg, statt offen zu bleiben.

**Ablauf:**

1. Letzte Karte des Screenings (C1) ist bewertet
2. Nur falls eigene „Unbedingt" > `budget`: Zwischenschritt (C2, Schritt 2) — „Durchgehen" oder
   „Überspringen"
3. Bei „Durchgehen": derselbe Kartenstapel, nur die eigenen Unbedingt-Karten, dieselben vier
   Stufen, Fortschritt „2 von 8"
4. Danach die Rangliste (D1)

**Was bleibt:** `budget = max(1, ceil(offene Zimmer × 1,5))` · nur sichtbar, wenn überschritten ·
jederzeit abbrechbar, Stimmen bleiben dann unverändert · in `HouseholdSettings` abschaltbar.

E-08 selbst bleibt gültig — seine Begründung („die Korrektur passiert dort, wo alle Karten bekannt
sind") trägt den zweiten Durchlauf genauso wie das nebeneinanderliegende Layout, das er ersetzt.

---

## §10 — Erstbeitritt: so wenig wie möglich, aber ehrlich über das Risiko

**Der Weg.** S-03 schreibt „nur Name und Passwort als Pflichtfelder" und verbietet ein
E-Mail-Pflichtfeld im Beitrittsformular ausdrücklich. Beitrittslink öffnen → **ein** Bildschirm mit
**zwei** Feldern (Name, Passwort) → direkt in den Screening-Durchlauf. Dazu ein Kontrollkästchen
„Auf diesem Gerät angemeldet bleiben", vorbelegt. Kein Passkey während der Registrierung, keine
Verifikation, kein Zwischenbildschirm (A3, §7).

**Zwei Wege hinein, nicht einer:**

| Weg | Wer | Was dabei passiert |
|---|---|---|
| **Haushalts-Beitrittscode** (`join_code`, S-03, A3) | bestehende Mitbewohnende | `ResidentProfile` + `Membership` entstehen; **keine** Verknüpfung zu einer Bewerbung |
| **Einladungstoken** (`ApplicationInviteToken`, S-42, A4) | wer gerade zugesagt hat und einzieht | einmalig verwendbar; setzt `became_resident_id` automatisch — der reguläre Weg |

O6 (frühere Bewerbung zuordnen) bleibt trotzdem nötig, aber in kleinerer Rolle: für alle Fälle
**ohne** Token — ältere Bewerbungen derselben Person, nachträgliche Korrekturen. Das Inventar
trennt beide Wege (A4 vs. O6), sonst wirkt O6 wie eine überflüssige Dopplung.

**Was das kostet — und wie es aufgefangen wird:**

| Folge | Auffangen |
|---|---|
| Ohne E-Mail keine Wiederherstellung durch die Person selbst | Die Verwaltung kann das Passwort zurücksetzen (E1, Kasten) — ein bewusster, dokumentierter Tauschhandel |
| Ohne E-Mail keine E-Mail-`Notification`, Push braucht erst eine Erlaubnis (S-28) | E-Mail wird später angeboten (E1), wo sie nützt — nie als Sperre |
| `Account.email` sollte optional werden | Bereits erledigt: das Feld ist `text?` — Pflicht beim Haushalts-Admin-Account (A1), nullable bei Resident-Accounts. Offen bleibt die Anmeldekennung für Resident-Accounts ohne E-Mail (O-D, siehe A2) |

**Sicherheit des Einladungslinks — jetzt tragend, nicht ergänzend.** „Sicherheit durch gezielte
Einladung" macht den `join_code` zur **einzigen** Zugangskontrolle: keine E-Mail, keine
Verifikation, kein zweiter Faktor. Wer ihn hat, kann beitreten und mitstimmen. Die drei Auflagen
auf O16 (Warnhinweis, Ablauf, Nutzungsgrenze) sind deshalb keine Zugabe, sondern das, was die
Formel überhaupt trägt — Details dort.

Von den vier ursprünglichen strukturellen Missbrauchsschutz-Elementen aus E-06 fallen zwei mit der
Trennung in Teilnehmendenliste (B4) und Bewohnerliste (O16) weg: Bewohnende sehen die volle Liste
nicht mehr und können niemanden mehr entfernen. Übrig bleiben der Feed-Eintrag „X ist beigetreten"
und die Bewohnerzahl im Nenner. Die drei O16-Auflagen sind damit nicht mehr Ergänzung zur sozialen
Kontrolle, sondern weitgehend ihr Ersatz — und keine davon steht dem beitretenden Bewohner im Weg,
sie wirken alle auf O16, nie auf A3/A4.

---

## §11 — Sichtbarkeit als Anzeigeregeln

Jeder Bildschirm mit Beratungsinhalt notiert, was V-1 und V-4 ausblenden — nach der Regel aus §6:
Ausgeblendetes existiert nicht, statt leer zu erscheinen.

| Regel | Prädikat | Betroffene Bildschirme |
|---|---|---|
| **V-1 — Selbst-Redaktion** | Beratungsinhalte über die eigene Bewerbung sind für die betroffene Person dauerhaft unsichtbar, unabhängig vom Rundenstatus | D1 (Ausschluss aus Rangliste/„Warten auf Stimmen"), D2 (führt stattdessen auf D3), B3 (Feed-Eintrag erscheint nicht), C4 (eigene Notizen anderer bleiben unsichtbar) |
| **V-2 — Rundensichtbarkeit** | Beratungsinhalte nur für Profile mit `RoundParticipation` an dieser Runde | C1–C4, D1, D2, O4, O5 |
| **V-3 — Entzug bei `moved_out`** | Sofortiger Zugriffsentzug, Quorum-Nenner sinkt | alle Beteiligungs- und Casting-Tab-Bildschirme |
| **V-4 — Ergebnisse verdeckt bis zur eigenen Stimme** | Score und Rangliste bleiben verdeckt, bis die Person selbst gestimmt hat | D1 |

Für jeden Bildschirm mit Beratungsinhalt in §7–§8 ist das über die Spalte „Abweichende Zustände"
bzw. den Fließtext ausgeschrieben, wo eine Regel greift; die Standardregel gilt sonst stillschweigend.

---

## §12 — Barrierefreiheit

- **Nie Farbe allein.** Zustandskennzeichnungen (Bewerbungsstatus, Slot-Zusagen, Quorum-Fortschritt)
  immer Symbol **und** Text.
- **Textentsprechung der vierstufigen Skala** (C1, C2, C3): Stufen sind benannt („Nein" · „Eher
  nicht" · „Finde gut" · „Unbedingt"), nie nur als Balken oder Farbverlauf dargestellt.
- **Tastaturbedienung des Durchlaufs** (C1–C3): ↑/↓ oder Zifferntasten zwischen den vier Stufen,
  Enter bestätigt, kein Bildschirm setzt Hover voraus (§4.1.0-Kriterium bleibt gültig).
- **Fokusreihenfolge** folgt der visuellen Reihenfolge auf allen Beteiligungs-Bildschirmen; der
  primäre CTA auf B1/O1 ist das erste fokussierbare Element nach der Kopfzeile.
- **Fehlertexte ohne Fachjargon** (§6) sind zugleich eine Barrierefreiheits-Anforderung: sie dürfen
  keine Modellbegriffe ohne Übersetzung (§8.6) enthalten.

---

## §13 — Abweichungsliste gegen die bestehende Kette

Diese Liste ist die Arbeitsvorlage für die drei parallelen Nachzug-Dokumente
(`02-SRD.md`, `03-PRD.md`, `04-Domaenenmodell.md`). Jede Zeile nennt die Stelle in der bestehenden
Kette, die diesem Inventar widerspricht oder die es voraussetzt.

| # | Abweichung | Betroffenes Dokument | Auflösung hier |
|---|---|---|---|
| AW-1 | Fünf Tabs (Runde · Bewerbungen · Termine · Feed · Ich) | [03-PRD.md §4.1.0](03-PRD.md:281) | §4.1 — zwei Tabs + Kopfzeile |
| AW-2 | „Rundenphase" als Begriff, den es als Zustand nicht gibt | 03-PRD.md §4.1.4/§4.1.6/§4.2.4 | §3.1 — Terminologie auf `stage` (`invite`/`offer`) korrigiert |
| AW-3 | `phase_deadline_at` beruft sich auf eine Rundenphase ohne Berechnungsregel | 04-Domaenenmodell.md (B-1 im Sprint-Log) | §3.1 liefert die fehlende Formel — **Korrektur am Domänenmodell**, nicht nur am Inventar |
| AW-4 | PWA-Install-Hinweis „weiter oben einsortiert, aus demselben Grund wie eine näher rückende Rundenfrist" | 04-Domaenenmodell.md (B-2 im Sprint-Log) | §2.3/§7.6 — eigenes Band unter dem CTA, nie Teil der Aufgabensortierung. **Bestätigter Fehler im Domänenmodell**, dort zu korrigieren |
| AW-5 | Feinschliff-Bildschirm mit „Unbedingt"-Kandidaten nebeneinander, direkt herabstufbar | 03-PRD.md §4.1.5 | §9 — zweiter Durchlauf ersetzt den eigenen Bildschirm |
| AW-6 | „acting_profile_id = null" als Auslöser von Verwaltungsrechten (frühere Planformulierung) | — (in diesem Dokument selbst korrigiert) | §4.2 — Rechte kommen ausschließlich aus `role`/`permissions` |
| AW-7 | Bewohnerliste als eine Liste, für alle sichtbar, jedes Mitglied kann entfernen | 02-SRD.md S-05 | §7 (B4/O16) — zwei getrennte Listen mit unterschiedlichen Rechten. `01-Problem-Framing.md` E-06 bleibt als historischer Beschluss unverändert stehen — spätere Festlegungen leben laut eigener Regel des Dokuments als S-Zeilen im SRD; nur dessen Begründung ist durch U-22 teilweise überholt |
| AW-8 | `join_code` nur mit Rotation, kein Ablauf, keine Nutzungsgrenze | 04-Domaenenmodell.md (B-4 im Sprint-Log) | §7.16 (O16) — Ablauf und Nutzungsgrenze als Pflicht ergänzt, Rotation bleibt (G-A5 unverändert gültig) |
| AW-9 | Kurzfristige Absage einer einzelnen Person zu einem Termin nicht modelliert | 04-Domaenenmodell.md (B-3 im Sprint-Log) | §7 (C8/O11) setzt das Feld voraus — Domänenmodell-Sitzung muss es ergänzen |
| AW-10 | Anwesenheit „von der moderierenden Person nach dem Termin gesetzt" | 04-Domaenenmodell.md `AppointmentAttendance.attended` | §7.11/§7.10 (O10/O11) — Richtung umgekehrt: `attended` startet `true`, Moderation korrigiert nur Ausnahmen |
| AW-11 | Verwaltung mit vollem Zugriff auf Runden, Bewerbungen, Termine, Notizen | 03-PRD.md §4.0.1 (Rechtematrix) | §4.3 — Verwaltung ohne `ResidentProfile` erreicht keine Castings, zwei benannte Ausnahmen |
| AW-12 | „rein deskriptiv, nie empfehlend" als UI-Textregel unter Berufung auf P-5 | — (frühere Planformulierung) | §7 (Organisation-Einleitung) — Grenze liegt bei Prozess vs. Person, nicht bei beschreibend vs. werbend |
| AW-13 | Bildschirmliste in 03-PRD.md §4.1.13 nennt „Persönliche Einstellungen" und „Passwort/Passkey" als getrennte Ziele | 03-PRD.md §4.1.13 | §7 (E1) — ein Bildschirm mit Abschnitten |

Nummern S-47 bis S-51 (SRD, vergeben laut `Session-Sprint-Log.md` §1) werden in diesem Dokument
zitiert, nicht neu definiert: **S-47** zweiter Durchlauf (§9) · **S-48** Aufgabenmodell mit
Vorrangregel (§2) · **S-49** Einladungslink absichern (§7.16/O16) · **S-50** Verwaltung ohne
Casting-Zugriff (§4.3) · **S-51** Anwesenheit angenommen plus Absage einzelner Personen
(§7.11/§7.24, O10/O11/C8).

---

## §14 — Offene Punkte

| # | Punkt | Vorschlag | Betrifft |
|---|---|---|---|
| O-A | Passwort-Rücksetzung für Bewohnende ohne E-Mail | Durch den Haushalts-`Account`, mit sichtbarem `ActivityEvent` und Beendigung bestehender Sitzungen | E1, 04-Domaenenmodell.md |
| O-B | Standardwerte Einladungslink | Ablauf 7 Tage · Nutzungsgrenze = fehlende Bewohnende, beides in `HouseholdSettings` änderbar | O16 |
| O-C | Dauer der „angemeldet bleiben"-Sitzung | Vorschlag 90 Tage mit gleitender Verlängerung; endet bei Passwortwechsel und bei `moved_out` | A3, A4, 04-Domaenenmodell.md (`Session`) |
| O-D | Womit meldet sich ein Resident-Account ohne E-Mail an? `Account.email` ist bereits nullable, die Anmeldekennung ist nirgends bestimmt | Vorschlag: Haushalt + Anzeigename + Passwort, Eindeutigkeit `(household_id, display_name)` | A2, 04-Domaenenmodell.md |
| O-E | Wer setzt und verlängert `phase_deadline_at`, gibt es eine Voreinstellung? | Die moderierende Person, ohne Voreinstellung | O15 |
| O-F *(neu)* | Kurzfristige Absage einer einzelnen Person (AW-9) — welches Feld trägt das? | Vorschlag an die Domänenmodell-Sitzung: eine `AppointmentAttendance`-eigene Markierung statt einer Änderung an `Appointment.status`, damit die Notiz-Erinnerung (S-46) korrekt zwischen „war nicht da" und „war da, hat aber nicht geschrieben" unterscheidet | C8, O11, 04-Domaenenmodell.md |

---

## §15 — Nächster Schritt

Dieses Dokument ist das vollständige Deliverable dieses Vorhabens (U-8) — kein Mockup ist
beauftragt. Damit die Kette widerspruchsfrei bleibt, sind drei Anschlüsse nötig, parallel in
Arbeit laut `Session-Sprint-Log.md`:

1. `02-SRD.md` auf V0.5 — Scope-Zeilen S-47 bis S-51, S-11 umformulieren, S-05 ändern (AW-7),
   §6 um eine Beobachtungsmetrik für U-14 ergänzen.
2. `03-PRD.md` auf V0.6 — Navigationsmodell (AW-1), Terminologie `stage` (AW-2), Bildschirmliste
   nach §7–§8 angleichen, neue Inhaltsregel C-10 (Organisation-Einleitung in §7).
3. `04-Domaenenmodell.md` — `phase_hint`-Berechnungsregel als Pseudocode (AW-3), PWA-Hinweis aus
   der Aufgabensortierung herausnehmen (AW-4), `AppointmentAttendance` umdrehen (AW-10),
   kurzfristige Einzelabsage modellieren (AW-9/O-F), `join_code`-Grenzen ergänzen (AW-8),
   Rechteableitung als geschützter Test (§4.2).

Danach: `review-log.md` — Eintrag „Durchgang 2 — Nachlauf Design", die drei 🎨-Lücken schließen,
mit dem Vermerk, dass die 🔴-Lücke (Feinschliff) durch Wegfall der Interaktion geschlossen wurde,
nicht durch ihre Spezifikation (§9). Diese beiden letzten Schritte liegen bei der Koordinationssitzung.

Ein klickbares Low-Fi-Mockup der vier Kernbildschirme (B1, C1, D1, O1) — nach dem Vorbild
[Ideas/Notella/04-Screen-Inventar.md, Abschnitt „Für das Mockup ausgewählte Bildschirme"](../Notella/04-Screen-Inventar.md:671)
— ist ein möglicher, aber nicht beauftragter weiterer Schritt.
