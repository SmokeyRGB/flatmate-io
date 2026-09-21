> **Quelle:** `../07-Screen-Inventar.md` §7–8, Gruppe O (Stand V0.1, eingefroren 2026-09-09)
> **Gruppe:** O — Organisation und Moderation
> **Schema-Autorität:** Alle Feld-, Zustands- und Entitätsnamen sind aus `../domain/`
> zitiert, nie neu erfunden.

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
| **Zugang** | Avatar-Menü „Organisation" oder CTA aus einer Benachrichtigung — Navigation, **kein** Identitätswechsel (ADR-013) |

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
| Parser erkennt nichts | Formular mit dem Rohtext im Freitextfeld, keine geratenen Felder, keine Fehlermeldung (`03-PRD.md` §4.1.3) |

---

#### O4 · Pipeline

| | |
|---|---|
| **Zweck** | Alle Bewerbungen einer Runde nach Status überblicken |
| **Zugang** | Aus O1 |

**Kernelemente**

- Bewerbungen gruppiert nach `Application.status`
- Zugriff auf O5 je Bewerbung
- **Layout (ergänzt 2026-09-16, Prototype-User-Test):** Rundeninfo-Kopf und Bewerbungsliste
  werden als ein visuell zusammenhängender Block dargestellt, nicht als zwei getrennte Cards —
  beides gehört zur selben Runde und soll auch so aussehen. Kein konkretes CSS vorgeschrieben,
  nur die Absicht.
- **Keine „Archivieren"-Handlung in v0.1:** Die Pipeline bietet pro Bewerbung nur „Löschen"
  (manuell, S-33-Hälfte). Der `archived`-Zustand und seine 14-Tage-Vorwarnung gehören zur
  Aufbewahrungsautomatik (O17/O18) und sind v0.2-Scope (S-33, siehe `backlog/roadmap.md`) — kein
  „Archivieren"-Button auf dieser Fläche.

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
- **Copy-Paste-Text mit Datenschutzhinweis** wird erzeugt (S-16) — **in derselben Handlung, nicht
  optional und nicht nachgelagert:** ein Klick auf „Einladen"/„Als eingeladen markieren", der nur
  den Status wechselt und keinen Text erzeugt, erfüllt diesen Screen nicht (im Prototyp
  beobachteter Fehler, 2026-09-16)

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
| Handlungen | keine | entfernen, `moved_out`, reaktivieren, Einladungslinks erzeugen/verlängern/löschen |
| Verwaltung | — | voll |
| Moderator | ja | **voll (Parität mit Verwaltung, U-30, 2026-09-17 — vormals lesend)** |
| Bewohnende | ja | **nein, aber eigene reduzierte „Wer wohnt hier"-Ansicht (B5, U-30)** |

**Kernelemente**

- Mitgliederliste mit Rolle, Beitrittsdatum, verknüpften `ResidentProfile`s
- **Kontakt ist eine Datenspalte, kein Button.** Die Mitgliederliste zeigt hinterlegte
  Kontaktdaten an; es gibt keine eigene „Kontakt"-Handlung (im Prototyp beobachteter Fehler,
  2026-09-16 — dort erschien pro Mitglied ein zusätzlicher „Kontakt"-Button ohne Spec-Basis)
- **Einladungslinks** — *(neu gefasst 2026-09-21, O-18 aufgelöst: ein Haushalt stellt **mehrere**
  Links aus, jeder mit eigener Frist, eigener Grenze und eigenem Zähler; `domain/identity.md`
  §2.1 `JoinCodeIssuance`)*. Der Abschnitt hat drei Teile in dieser Reihenfolge:

  **1. Der Warnhinweis**, bevor irgendetwas anderes kommt — dort, wo der Link kopiert wird, nicht
  anderswo auf der Seite (S-49): „Teile diesen Link nur direkt mit deinen Mitbewohnenden — niemals
  öffentlich. Wer ihn hat, kann mitstimmen."

  **2. Ein neuer Link wird erzeugt, nicht bearbeitet.** Zwei Felder nebeneinander — „Gültig für
  (Tage)", vorbelegt **7**, und „Höchstens nutzbar", vorbelegt **1** — und darunter eine Handlung
  „Neuen Link erzeugen". Die Felder beschreiben **den nächsten** Link, nicht den bestehenden: ein
  ausgestellter Link ist ein Versprechen an die Person, die ihn bekommen hat, und wird nachträglich
  nicht umgeschrieben. Unter der Nutzungsgrenze steht ihre Begründung im Klartext: „Standard: ein
  Link für eine Person. Erhöhe das nur, wenn mehrere denselben Link nutzen sollen." Das ist die
  Stelle, an der O-15's Standard **1** erklärt wird, statt nur zu gelten.

  **3. Die Liste der Links**, lebende und tote (FR-2.29). Je Link: die Restfrist („gültig bis
  22.9.2026"), der Zähler gegen seine Grenze („0 von 1 genutzt"), zwei Handlungen — **„+7 Tage"**
  (O-15's *„mit einem Tippen verlängerbar"*, als Handlung statt als Datumsfeld) und **„Löschen"** —
  und darunter der Code selbst in Monospace als kleine Überschrift, die vollständige URL gegedämpft
  darunter, dann das **gestapelte Paar Kopier-Schaltflächen** aus `../09-Design-System.md`:
  „Link kopieren" ganzbreit und gefüllt oben, „Nur den Code kopieren" leiser darunter. Die zweite
  ist kein Beiwerk — sie ist der Kanal für **FR-2.27**, die Eingabe von Hand.

  Ein toter Link verschwindet nicht: er bleibt mit seinem Endstand stehen und nennt, wer über ihn
  hereinkam (`Membership.joined_via_issuance_id`). Genau das war O-18's Anliegen.

  **„Löschen"**, nicht „Widerrufen" und nicht „Zurückziehen" (UI-Vokabular `rahmenwerk.md` §8.6) —
  und Löschen berührt die Mitgliedschaften nicht, die über diesen Link entstanden sind.

  **Was hier nicht steht:** kein Schloss-Symbol, kein „sicher", kein „geschützt". Diese Grenzen sind
  soziale Sichtbarkeit, keine Härtung (C-2.5), und die Oberfläche darf sie nicht als etwas anderes
  ausgeben.
- Mitglied entfernen, `moved_out` setzen, reaktivieren
- **Zweistufiges Entfernen (U-27, entschieden 2026-09-16):** „Ausgezogen" (`moved_out` setzen) ist
  der reguläre Weg für tatsächliche Auszüge — Stimmen und Historie bleiben erhalten. „Entfernen"
  ist endgültig, verlangt die **Eingabe des exakten Anzeigenamens** zur Bestätigung (kein einfacher
  Klick) und ist ausdrücklich für **fälschlich oder böswillig über den Beitrittscode beigetretene
  Personen** gedacht — nicht für Auszüge. **Verfügbar für Verwaltung und Moderator gleichermaßen
  (U-30, 2026-09-17)** — vormals nur Verwaltung, da der Moderator bis dahin ohnehin nur lesend war

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
>
> **Nachtrag U-30 (2026-09-17):** Bewohnende erhalten seither wieder eine (reduzierte) Sicht auf
> die Mitgliedschaft — screen `B-start.md` B5 — womit ein Teil der ersten Säule (Sichtbarkeit)
> zurückkehrt, ausdrücklich ohne das Entfernen-Recht wiederherzustellen. Der Beitrittslink bleibt
> deshalb weiterhin Pflicht-Kontrolle, nicht nur Ergänzung — B5 ist eine Erkennungshilfe für
> Bewohnende, kein Ersatz für die Ablauf-/Nutzungsgrenze.

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
- **Abstimmungsverfahren** — Regel-Sperre während einer laufenden Runde (E-25). Umfasst u. a.
  `hide_results_until_voted` und, neu (2026-09-16, Prototype-User-Test), `reveal_vote_authorship`
  — Toggle „Stimmen-Urheberschaft in der Rangliste zeigen", Default aus, mit Hinweistext zum
  Anker-/Bandwagon-Tradeoff (`domain/identity.md`)
- **Datenschutzseite freigeben** — `PublishedPrivacyNotice` (G-C9); vor Freigabe über keinen
  Codepfad erreichbar

---
