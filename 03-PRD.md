# PRD — Flatmate.io

### Product Requirements Document · Casting-Prozess für WGs und Wohnprojekte

> **Version:** V0.6 — *Zwei Änderungswellen, beide seit V0.5 unverzeichnet und hier
> nachgezogen (siehe §1 für die vollständige Aufschlüsselung). **Welle 1 — Spec-Update vom
> 02.09.2026:** stand bereits im Fließtext, aber nie in dieser Kopfzeile: Beitritt ohne E-Mail
> (S-03), automatischer Einladungslink bei `moved_in` (S-42), weiche Rundenfrist (S-44),
> PWA-Install-Hinweis und Web Push jetzt v1 (S-45, S-28), Notiz-Erinnerung nach dem Casting
> (S-46). **Welle 2 — UX-Nachzug aus dem Screen-Inventar-Plan (U-1…U-26):** Navigation von 5
> Tabs auf 2 Tabs + Kopfzeile verkürzt (§4.1.0) · Rundenkopf → **Start** mit Aufgabenmodell und
> Sortierung nach Zeitdruck (§4.1.2, S-48) · **größter Einzeleingriff:** Verwaltung ohne
> `ResidentProfile` erreicht keine Castings mehr, Rechtematrix entsprechend gekürzt (§4.0.1,
> S-50) · Feinschliff-Screen ersetzt durch zweiten Durchlauf im Kartenmuster (§4.1.5, S-47) ·
> Bewohnerliste in Teilnehmendenliste und Bewohnerliste getrennt (§4.1.13, U-22) ·
> Einstellungen auf einen Bildschirm konsolidiert (§4.1.13, K-10) · Beitrittscode abgesichert
> mit Warnhinweis, Ablauf, Nutzungsgrenze (§4.3, S-49) · Anwesenheit wird angenommen statt
> erfasst (§4.1.11, S-51) · Terminologie des Rundenzustands durch `Vote.stage` ersetzt (§4.1.4/§4.1.6/
> §4.2.4) · neue Inhaltsregel C-10 Prozess-vs-Person (§4.6) · P-O-05 geschlossen, zwei neue
> offene Punkte (§8). Vollständige Historie in §1.*
> **Datum:** 2026-09-02
> **Autor:** Samuel Zink (@SmokeyRGB)
> **Vorgänger:** `01-Problem-Framing.md` → `02-SRD.md`
> **Nachfolger:** `04-Domaenenmodell.md` → `05-ADRs.md` · `06-Compliance-Anhang.md` →
> `GUARDRAILS.md` · `review-log.md` · `07-Screen-Inventar.md` (kein Mockup in v1, U-8)
> **Projekttyp:** Cross-Page-Flow · Nutzergruppen-Differenzierung · phasiertes Rollout

> **Nummerierungshinweis.** Diese Kette folgt der logischen Reihenfolge
> **Problem Framing → SRD → PRD**: `01` → `02-SRD.md` → `03-PRD.md`. Das weicht bewusst von
> `Ideas/Notella/` ab (dort PRD `02`, SRD `03`). Dieses Dokument **wiederholt die
> Argumentation nicht** — es verweist auf die Scope-Zeilen S-01…S-51 aus `02-SRD.md` §5.3
> und die Rahmenentscheidungen E-01…E-27 aus `01-Problem-Framing.md`.

> **Sprachregelung.** Dokument deutsch, alle Bezeichner, Schema-, Feld- und Zustandsnamen
> englisch (ADR-012). UI-Label für `Household` ist in v1 durchgängig **„WG"** (E-02).
> Kernmetrik und Verzicht auf A/B-Tests folgen aus **E-24**.

> **Verbindlichkeit der Bezeichner.** Die **Entitätsnamen** in diesem Dokument
> (`Household`, `Account`, `ResidentProfile`, `Membership`, `Room`, `CastingRound`,
> `RoundParticipation`, `Application`, `Vote`, `Veto`, `CastingNote`, `AvailabilityWindow`,
> `Slot`, `Appointment`, `ActivityEvent`, `Notification`, `HouseholdSettings`) sind
> verbindlich. **Feld- und Attributnamen** in diesem Dokument sind fachliche Vorschläge;
> verbindliche Quelle für Felder, Typen und Kardinalitäten ist **`04-Domaenenmodell.md`**.
> Bei Abweichung gilt das Domänenmodell.

---

## 1. Revisionshistorie

| Version | Datum | Autor | Änderung |
|---------|-------|-------|----------|
| V0.6 | 2026-09-02 | Samuel Zink (@SmokeyRGB) | **Zwei Änderungswellen nachgezogen, die seit V0.5 unverzeichnet waren.** **Welle 1 (Spec-Update 02.09.2026, ~1600 geänderte Zeilen, nie in dieser Historie erfasst):** Dieses Dokument enthielt bereits vor diesem Eintrag den Beitritt ohne E-Mail (S-03, §4.1.1), den automatischen `ApplicationInviteToken` bei `moved_in` (S-42, §4.1.7), die Notiz-Erinnerung `casting.note_reminder_due` nach `scheduled → interviewed` (S-46, §4.6.4) sowie die Kanalreihenfolge Push → E-Mail-Fallback → In-App (S-28, §6.2) — jetzt hier erstmals dokumentiert. **Welle 2 (UX-Nachzug aus `07-Screen-Inventar.md`, U-1…U-26, S-47…S-51):** §3 Design-Zeile verweist jetzt auf das Screen-Inventar · **§4.0.1 Rechtematrix, größter Einzeleingriff:** Haushalts-Account verliert Zugriff auf `CastingRound`, `RoundParticipation`, `Application` (anlegen/Status/löschen), `CastingNote`, `Slot`, `Appointment` und fremde `AvailabilityWindow`s; behält Zimmer, Mitglieder, Code, Aufbewahrung, Einstellungen und als einzige Ausnahmen Aufbewahrung sowie Datenauskunft-Export ohne Einsicht (S-50/U-20) · „Kontextwechsel" umbenannt in „Identitätswechsel", geschützter Test gegen Rechteausweitung über `acting_profile_id = null` ergänzt (U-21) · „Moderator scheidet aus" um den Zwischenschritt „Verwaltung legt sich selbst ein `ResidentProfile` an" erweitert · **§4.1.0** Navigationsmodell von 5 Tabs auf 2 Tabs (*Start · Casting*) + Kopfzeile (Glocke · Avatar) verkürzt, Kriterium „aktiver Kontext" auf wechselfähige Sitzungen verengt (U-2) · **§4.1.1** Kontrollkästchen „angemeldet bleiben" ergänzt, Kasten zum Passwort-Reset-Tauschhandel (K-18) · **§4.1.2** „Rundenkopf" grundlegend zu **„Start"** mit Aufgabenmodell umgebaut: genau ein primärer CTA, Sortierung nach Zeitdruck über `phase_deadline_at`, Moderations-Brücke, PWA-Band-Platzierung (U-1, U-9, S-48) · **§4.1.4/§4.1.6/§4.2.4** Terminologie des zuvor verwendeten Rundenzustands-Begriffs durch `Vote.stage` ersetzt, weil der alte Begriff einen nicht existierenden Rundenzustand suggerierte · **§4.1.5** Feinschliff-Screen durch zweiten Durchlauf im Screening-Kartenmuster ersetzt, eigene Vergleichsdarstellung entfällt (U-10, S-47) · **§4.1.9/§4.1.11** Bezug auf `AppointmentAttendance` ergänzt; Anwesenheit wird angenommen statt erfasst, „Ich kann doch nicht" als Selbstauskunft, Korrektur nur als Ausnahmefall — offener Punkt an `04-Domaenenmodell.md`, da die Einzelabsage dort noch nicht modelliert ist (U-23, S-51) · **§4.1.12** Ereignisklassen `outcome`/`process` getrennt (U-3/U-4) · **§4.1.13** Bewohnerliste in Teilnehmendenliste und Bewohnerliste getrennt (U-22), „Persönliche Einstellungen" und „Passwort/Passkey" zu einem Bildschirm „Einstellungen" verschmolzen (K-10), PWA-Band-Konflikt mit echten Aufgaben aufgelöst (U-19) · **§4.1.14** Plattformtabelle ans neue Navigationsmodell angeglichen · **§4.1.15 (neu)** Einladungstoken einlösen, Push-Berechtigung, PWA-Install-Band als Bildschirmkatalog-Einträge · **§4.3** Beitrittscode-Absicherung: Warnhinweis, Ablauf, Nutzungsgrenze (S-49/U-12, jetzt Voraussetzung statt Zugabe, da E-06 den strukturellen Schutz für Bewohnende verliert) · **§4.6** neue Inhaltsregel **C-10** — Oberflächentexte werbend über den Prozess, nie wertend über die Person (K-12/K-14/K-16) · **§7.1** v1-Scope um S-47…S-51 ergänzt · **§8** P-O-05 geschlossen (Screen-Inventar §2 löst es), zwei neue offene Punkte P-O-08 (Sitzungsdauer „angemeldet bleiben") und P-O-09 (wer setzt `phase_deadline_at`) |
| V0.5 | 2026-08-19 | Samuel Zink (@SmokeyRGB) | Die verworfene Begründung der Sendepuffer-Ausnahme („kein fremdes Datum betroffen“) ist jetzt **als Bauform benannt** — „**Verworfene Begründung — bewusst dokumentiert, nicht gestrichen**“ in §6.2, mit Querverweis in §6.5. Zweck ausgeschrieben: Eine Entscheidung, die aus dem falschen Grund richtig ist, wird **per Analogie aus dem falschen Grund erweitert** — wer „kein fremdes Datum“ als tragendes Argument liest, hält als nächstes einen lokalen Notizentwurf für ebenso unproblematisch |
| V0.4 | 2026-08-19 | Samuel Zink (@SmokeyRGB) | **Begründung der Sendepuffer-Ausnahme korrigiert** (§6.2, §6.5): Sie stand auf „kein fremdes Datum betroffen" — das ist falsch, weil eine `Vote` aus `application_id` plus Wert besteht und damit eine Beurteilung **über eine dritte Person** ist. Sie steht jetzt auf **„unabgeschlossene Transaktion"** (§ 25 TDDDG, ausdrücklich gewünschter Dienst) und ist an **vier erzwungene Eigenschaften** gebunden statt an die Erwartung „Sekunden bis Minuten": Höchstlebensdauer 7 Tage, keine Anzeigedaten, Verwerfen statt Wiederholen bei Ablehnung, Leerung bei Abmeldung. Acht neue Akzeptanzkriterien in §6.5. S-30 und §7 im SRD nachgezogen; Vermerk, dass die Ausnahme auch in ADR-011 stehen muss |
| V0.3 | 2026-08-19 | Samuel Zink (@SmokeyRGB) | Zwei Nachträge aus der Querprüfung: **`subject_statement` erhält keinen eigenen Aufbewahrungszeitgeber** und wird in derselben Transaktion wie die Bezugsdaten gelöscht (§4.2.6, §4.6.3) · **Der Service Worker cacht ausschließlich die App-Hülle**, niemals Bewerber- oder Beratungsdaten (§4.1.0, §6.2, §6.5) — Konflikt zwischen PWA in v1 (ADR-011) und der 180-Tage-Löschautomatik, aufgeworfen beim Prüfen von § 25 TDDDG. Scope-Zeilen S-30 und S-41 im SRD entsprechend nachgezogen |
| V0.2 | 2026-08-19 | Samuel Zink (@SmokeyRGB) | **Querprüfung mit `04-Domaenenmodell.md` und `06-Compliance-Anhang.md` eingearbeitet.** Neu: Art.-13/14-Weiche über `Application.collected_from` (§4.1.3, S-38) · Absatzverwerfung im Paste-Parser (§4.1.3, S-39) · **Aktion „frühere Bewerbung derselben Person zuordnen"** als prozessuale Hälfte der Sichtbarkeitsinvariante (§4.1.7, §4.2.5, §6.5, S-40) · `subject_statement` als v1.1-Zeile (§7.1, S-41). Korrigiert: Quorum-Wortlaut **„mindestens die Hälfte"** und `quorum_share = 0,5` (§4.2.4) · Feinschliff-Budget mit Boden `max(1, …)` (§4.1.5) · Verhalten am Solver-Zeitlimit (§4.1.8, §6.1, §6.2) · **„Archivieren" ist ein reiner Sichtbarkeitszustand, keine Fristverlängerung** (§4.2.6, §4.3) · Semantik bei Auszug während offener Runde: Stimme bleibt im Score, Person fällt aus Zähler **und** Nenner (§4.2.3, §4.2.4, §6.5) · Verfügbarkeits-Link als Datenmodell-in-v1 / Seite-in-v1.1 (§4.1.8, §7.1). **P-O-01 und P-O-02 geschlossen** (§8) |
| V0.1 | 2026-08-19 | Samuel Zink (@SmokeyRGB) | Erstfassung auf Basis `00-Session-Brief.md`, `01-Problem-Framing.md` (E-01…E-27) und `02-SRD.md` (S-01…S-37). Aktivierte optionale Sektionen: §4.0.1 Nutzergruppen, §4.0.2 Nutzerflüsse (Cross-Page), §4.6 Inhaltsregeln. Zwei offene SRD-Punkte hier entschieden: **O-01** Quorum-Schwelle (§4.2.4) und **O-04** parallele Runden (§4.2.2) |

---

## 2. Hintergrund

In WGs und Wohnprojekten mit fünf und mehr Bewohnenden löst jeder Bewohnerwechsel einen
dreizehnschrittigen Prozess aus, der sich über Anzeigenportal, WhatsApp-Gruppe,
Terminwerkzeug und Zettel verteilt. Die Folge: die Organisationsarbeit hängt an einer
Person, und bei allen anderen bricht die Beteiligung ein, weil Mitmachen im Chatverlauf
unbequem ist. Bei einer Wechselhäufigkeit von mehrmals pro Jahr wiederholt sich das
regelmäßig.

Flatmate.io bildet diesen Prozess als **Zustandsverlauf** ab statt als Nachrichtenstrom.
Der reale Wettbewerber ist WhatsApp plus Sprachnachricht; strukturell ist das Produkt ein
**Mini-ATS für WGs**. Die Kernmetrik ist deshalb nicht Zeitersparnis, sondern die
**Beteiligungsquote — Ziel > 80 %** der stimmberechtigten Bewohnenden pro Runde.

Vollständige Begründung, Zielgruppen, Benchmark, Scope-Grenze, Phasenschnitt, Metriken und
Risiken: `01-Problem-Framing.md` und `02-SRD.md`. Rechtliche Analyse:
`06-Compliance-Anhang.md`.

---

## 3. Überblick

| Punkt | Inhalt |
|-------|--------|
| **Zugehörige Anforderung** | `02-SRD.md` §5.3, Scope-Zeilen **S-01 bis S-51** (S-42 bis S-46 aus dem Spec-Update vom 02.09.2026, S-47 bis S-51 aus diesem UX-Nachzug) · Rahmenentscheidungen **E-01 bis E-27** · Designprinzipien **P-1 bis P-5** |
| **Design** | Siehe `07-Screen-Inventar.md` — Aufgabenmodell, Rahmenwerk und ~41 Bildschirme. Kein Mockup in v1 |
| **Plattform** | Web, **mobile-first**, installierbare PWA (ADR-011). Kein App-Store, keine native App in v1 (P-2) |
| **Sprache** | UI deutsch in v1. Mehrsprachigkeit ist **nicht** aktiviert (siehe Hinweis vor §4.6) |
| **Betriebsmodell** | Betrieb durch das Vorhaben selbst, EU-Hosting (ADR-006). Non-Profit / spendenfinanziert, für Bewohnende dauerhaft kostenlos (E-23). DSGVO-Rollen: **`Household` = Verantwortlicher, Flatmate.io = Auftragsverarbeiter** |
| **Kernfunktion** | Eine WG erfasst Bewerbungen kanalunabhängig, bewertet sie in einem Karten-Screening mit vierstufiger Skala, sieht eine erklärbare Rangliste mit sichtbarem Quorum, findet Termine über ein Verfügbarkeitsraster mit nachrechenbaren Vorschlägen, hält Casting-Notizen für Abwesende fest, stimmt in einer zweiten Runde mit Veto über die Zusage ab und führt die `Application` über eine explizite, rückwärts begehbare Zustandsmaschine bis `moved_in` |
| **Nutzergruppen (v1)** | Haushalts-Account · Moderator · Bewohnender · ehemaliger Bewohnender · Bewerbender ohne Konto (§4.0.1) |
| **Bildschirme (v1)** | Registrierung (Haushalt) · Beitritt per Code · **Einladungstoken einlösen** (S-42) · **Start** (Aufgabenmodell, ersetzt „Rundenkopf/Dashboard") · Bewerbung erfassen (Formular + Einfügen) · Screening-Durchlauf inkl. **zweitem Durchlauf** (ersetzt Feinschliff) · Rangliste · Kandidaten-Einzelansicht · **Organisation** (ersetzt Pipeline/Haushalts-Einstellungen als eigene Fläche: Runde · Bewerbungen · Termine · Zimmer · Mitglieder · Aufbewahrung · Haushalt) · Verfügbarkeitsraster · Terminvorschlag · Casting-Notizen · Runde 2 + Veto · **Push-Berechtigung erteilen** (S-28) · Kalender · Aktivitäts-Feed · Benachrichtigungszentrum · **Einstellungen** (ein Bildschirm, ersetzt „Persönliche Einstellungen") · **Teilnehmendenliste** und **Bewohnerliste** (zwei getrennte Bildschirme, ersetzt „Bewohnerliste") · Aufbewahrungs-/Datenauskunftsansicht. Vollständige Liste mit Rollen und Zugriff: `07-Screen-Inventar.md` §7–8 |
| **Nicht enthalten** | Jede KI-gestützte Bewertung, Rangbildung oder Empfehlung über Personen (**P-5, dauerhaft**) · Nachrichtenversand an Bewerbende durch die Anwendung · Portal-API/Scraping · Kalender-Sync · Geräte-Fingerprinting |

---

## 4. Produktanforderungen

### 4.0.1 Nutzergruppen und Differenzierung

**Aktivierte optionale Sektion** — die fünf Gruppen unterscheiden sich nicht in Rangstufen,
sondern in *Art* des Zugriffs. Sie entstehen aus **orthogonalen `Membership`-Attributen**
(`is_resident`, `role`) plus einzeln vergebbaren Berechtigungen, nicht aus einer Hierarchie
(E-04, S-04).

#### Abgrenzung der Gruppen

| Gruppe | Technische Bestimmung | Kann abstimmen? | Kernaufgabe | Anteil / Anzahl |
|--------|----------------------|:---------------:|-------------|-----------------|
| **Haushalts-Account** | `Account` des `Household`, ohne aktives `ResidentProfile` im Kontext | **Nein** | Verwaltung: Haushalt anlegen, Zimmer pflegen, Beitrittscode ausgeben, Moderatoren ernennen, Einstellungen und Aufbewahrung verwalten | genau 1 pro `Household` |
| **Moderator** | `Membership.role = moderator` (typischerweise mit `is_resident = true`) | **Ja**, sofern `is_resident = true` | Treibt die Runde: Runde anlegen und schließen, Status ändern, Termine bestätigen, Notizen anlegen, auf Vorwarnungen reagieren | 1–2 pro Haushalt |
| **Bewohnender** | `Membership.is_resident = true`, `role = resident` | **Ja** | Stimmt ab, gibt Verfügbarkeiten an, reagiert auf Slots, liest Notizen | 4–9 pro Haushalt |
| **Ehemaliger Bewohnender** | `Membership` im Zustand `moved_out` | **Nein** (Zugriff entzogen) | Keine — die Gruppe existiert, damit ihre Vergangenheit korrekt behandelt wird | wächst mit jedem Wechsel |
| **Bewerbender ohne Konto** | `Application`, **kein `Account`** | Nein | Bewirbt sich über einen beliebigen Kanal; gibt ggf. Verfügbarkeiten über eine Token-Seite an (v1.1) | 10–60 pro Runde |

> **Wichtig und nicht als Härtung darzustellen (E-03):** Dass der Haushalts-Account nicht
> abstimmen kann, ist **ausschließlich eine Klarheitsentscheidung, keine
> Sicherheitsgrenze.** Jeder Bewohnende, der E-Mail und Passwort des Haushalts kennt, kann
> sich dort anmelden. Die Trennung existiert, damit nicht unklar ist, wer eine Stimme
> abgegeben hat — nicht, um jemanden auszuschließen. Die UI darf sie nicht als
> Schutzmechanismus beschreiben.

#### Differenzierung nach Dimension

| Dimension | Haushalts-Account | Moderator | Bewohnender | Ehemaliger | Bewerbender ohne Konto |
|-----------|-------------------|-----------|-------------|-----------|------------------------|
| Startbildschirm | **Organisation → Haushalt** (Zimmer, Mitglieder, Aufbewahrung — kein Zugriff auf Runden, S-50/U-20) | **Start** (Aufgabenliste, wie Bewohnender), mit **Moderations-Brücke** am Fuß zur Organisationsfläche (U-5) | **Start** — Aufgabenliste, sortiert nach Zeitdruck (U-1, U-9, Screen-Inventar §2) | — (kein Zugang) | keiner (nur ggf. Token-Seite) |
| Zentraler Handlungsaufruf | „Beitrittscode teilen" / „ResidentProfile anlegen" | **genau ein** primärer CTA aus der Aufgabenliste, plus Moderations-Brücke „N Dinge brauchen deine Moderation →" | **genau ein** primärer CTA aus der Aufgabenliste (z. B. „Notiz zu Lea schreiben — 4 andere warten darauf"), sortiert nach Zeitdruck, nicht nach fester Rangliste (Screen-Inventar §2) | — | „Wann kannst du?" (v1.1) |
| Sieht Beratungsinhalte | **Nein — kein Zugriff auf `CastingRound`s ohne eigenes `ResidentProfile`** (S-50/U-20). Ausnahmen: Aufbewahrungsansicht und Datenauskunft-Export (ohne Einsicht) | Ja, außer wo Selbst-Redaktion greift | Ja, außer wo Selbst-Redaktion greift | **Nein** | **Nein** |
| Sieht Rangliste und Score | **Nein** (S-50/U-20, folgt aus fehlendem `ResidentProfile`) | Ja | Ja, erst nach eigener Stimmabgabe (Standard, S-14) | Nein | Nein |
| Sieht Teilnehmendenliste (wer nimmt an der Runde teil) | **Nein** (S-50/U-20) | Ja | Ja | Nein | Nein |
| Sieht Bewohnerliste (wer wohnt im Haushalt) | Ja, **voll** | Ja, **lesend** | **Nein** (U-22 — geändert gegenüber V0.5: bisher „Ja, Duplikatsschutz S-05"; die Duplikatsschutz-Begründung von S-05/E-06 wird in `02-SRD.md` nachgezogen) | Nein | Nein |
| Zählt in Zähler und Nenner der Quorum-/Beteiligungsanzeige | nicht enthalten | ja, wenn `is_resident` | ja | **nein** — die Person fällt aus beiden heraus, ihre `Vote` bleibt aber im Score und wird markiert (§4.2.3) | — |
| Kann Status ändern | **nein** (S-50/U-20 — geändert ggü. V0.5: bisher „ja") | ja | nur mit einzeln vergebener Berechtigung | nein | nein |
| Kann Runde schließen | **nein** (S-50/U-20 — geändert ggü. V0.5: bisher „ja") | ja | nur mit Berechtigung | nein | nein |
| Kann Termine bestätigen | **nein** (S-50/U-20 — geändert ggü. V0.5: bisher „ja") | ja | nur mit Berechtigung | nein | nein |
| Erhält `Notification` | ja (Verwaltungsereignisse, Aufbewahrungs-Vorwarnung) | ja (alles) | ja (Digest-Standard) | **nein, ab `moved_out` sofort** | nein (v1) |
| Erscheint im `ActivityEvent`-Feed als Urheber | **„Verwaltung"** (ehrlich, kein Personenname) | Personenname | Personenname | „ehemaliges Mitglied" | Kandidatenname im Sachbezug |

#### Rechtematrix

> **Geändert ggü. V0.5 (S-50/U-20 — größter Einzeleingriff dieser Version).** Ein
> Haushalts-Account ohne aktives `ResidentProfile` erreicht **keine** Castings mehr — keine
> `CastingRound`, keine `RoundParticipation`, kein `Application`-Anlegen/-Statuswechsel/-Löschen,
> keine `CastingNote`, keinen `Slot`, keinen `Appointment` und keine fremde
> `AvailabilityWindow`. Er behält Zimmer, Mitglieder, Beitrittscode, Aufbewahrung, die
> Haushalts-Einstellungen (inkl. Abstimmungsverfahren) und **zwei benannte Ausnahmen**:
> Aufbewahrung (unverändert) und **„Datenauskunft erzeugen" als Export ohne Einsicht** — die
> Verwaltung stößt den Export an, sieht die Inhalte aber nicht im Bildschirm (Screen-Inventar
> §4). Grund: Jede Casting-Handlung soll einen Namen tragen (P-3); heute lief das teils unter
> „Verwaltung" ohne Person. **Das ist Zurechenbarkeit, keine Sicherheitsgrenze** — E-03 bleibt
> unverändert gültig: Wer die Haushaltszugangsdaten kennt, kann sich selbst ein
> `ResidentProfile` anlegen und handeln.

| Aktion | Haushalts-Account | Moderator | Bewohnender | Ehemaliger |
|--------|:-----------------:|:---------:|:-----------:|:----------:|
| `Household` anlegen / Einstellungen ändern | ✅ | ⬜ nur mit Berechtigung | ❌ | ❌ |
| `Room` anlegen / Status ändern | ✅ | ✅ | ❌ | ❌ |
| Beitrittscode erzeugen / widerrufen | ✅ | ✅ | ❌ | ❌ |
| `ResidentProfile` anlegen (aus Verwaltungskontext) | ✅ | ❌ | ❌ | ❌ |
| Moderator ernennen / Berechtigung vergeben | ✅ | ❌ | ❌ | ❌ |
| Mitglied entfernen / auf `moved_out` setzen | ✅ | ✅ | ❌ (**geändert, U-22** — bisher „✅, Duplikatsschutz S-05"; die Begründung von S-05/E-06 wird in `02-SRD.md` nachgezogen) | ❌ |
| `CastingRound` anlegen / schließen / wiedereröffnen | **❌** (S-50/U-20) | ✅ | ⬜ | ❌ |
| `RoundParticipation` hinzufügen / entfernen | **❌** (S-50/U-20) | ✅ | ❌ | ❌ |
| `Application` anlegen (Formular oder Einfügen) | **❌** (S-50/U-20) | ✅ | ⬜ | ❌ |
| `Application.status` ändern (vorwärts) | **❌** (S-50/U-20) | ✅ | ⬜ | ❌ |
| `Application.status` **zurücknehmen** | **❌** (S-50/U-20) | ✅ | ❌ | ❌ |
| `Application` löschen | **❌** (S-50/U-20) | ✅ | ❌ | ❌ |
| **Datenauskunft erzeugen** | ✅ — **Export ohne Einsicht**, einzige Ausnahme (S-50/U-20) | ✅, mit Einsicht | ❌ | ❌ |
| **`Vote` abgeben / ändern** | ❌ | ✅ (wenn `is_resident`) | ✅ | ❌ |
| **`Veto` setzen / zurückziehen** | ❌ | ✅ (wenn `is_resident`) | ✅ | ❌ |
| `CastingNote` anlegen / bearbeiten | **❌** (S-50/U-20) | ✅ | ✅ | ❌ |
| Eigene `AvailabilityWindow` pflegen | ❌ (kein Bewohnender) | ✅ | ✅ | ❌ |
| Fremde `AvailabilityWindow` pflegen (Bewerbende) | **❌** (S-50/U-20) | ✅ | ⬜ | ❌ |
| `Slot` legen · „Vorschlag berechnen" | **❌** (S-50/U-20) | ✅ | ❌ | ❌ |
| Auf `Slot` reagieren (👍 / „kann nicht") | ❌ | ✅ | ✅ | ❌ |
| `Appointment` bestätigen | **❌** (S-50/U-20) | ✅ | ⬜ | ❌ |
| Anwesenheit einer einzelnen Person korrigieren (Ausnahmefall, U-23, S-51) | **❌** (S-50/U-20) | ⬜ | ❌ (Selbstauskunft: „ich kann doch nicht") | ❌ |
| Aufbewahrung verlängern / kürzen / jetzt löschen | ✅ | ✅ (verlängern, löschen) | ❌ | ❌ |
| Abstimmungsverfahren ändern | ✅ (**nicht während laufender Runde**, S-35 — Teil des Abschnitts „Haushalt") | ⬜ | ❌ | ❌ |
| Persönliche Benachrichtigungseinstellungen | ✅ | ✅ | ✅ | ❌ |

✅ = immer · ⬜ = nur mit einzeln vergebener Berechtigung · ❌ = nie

#### Wechsel- und Herabstufungslogik

> **Umbenannt ggü. V0.5: „Kontextwechsel" → „Identitätswechsel".** Das Wort „Kontext" hatte
> nahegelegt, `Session.acting_profile_id = null` verleihe der Verwaltung erweiterte Rechte.
> Das ist falsch und wird als **geschützter Test** festgehalten (U-21, Screen-Inventar §4):
> **Rechte kommen ausschließlich aus `Membership.role`/`Membership.permissions`.**
> `acting_profile_id = null` bedeutet ausschließlich „kein Bewohnerprofil in dieser Sitzung
> aktiv" — nicht mehr. Ein Konto mit `role = member` bekommt durch `null` nichts dazu; es
> verliert nur seine Stimmidentität. Welche Abschnitte der Organisationsfläche sichtbar sind,
> entscheidet **allein** `role`/`permissions`, nie `acting_profile_id`. Der Wechsel selbst
> läuft über das **Avatar-Menü** („In Moderation wechseln"), nicht über ein eigenes
> Navigationselement (U-4/K-6, Screen-Inventar §4).

| Übergang | Auslöser | Verhalten |
|----------|----------|-----------|
| Verwaltung → Bewohner (S-02) | Identitätswechsel im Avatar-Menü, sofern ein `ResidentProfile` existiert | Sichtbarer Indikator, welche Identität aktiv ist. `ActivityEvent`s tragen **beide** Angaben: `Account` und handelndes Profil (E-21) |
| Verwaltung → Moderator ohne Bewohnerprofil | Haushalts-Account ernennt ein `ResidentProfile` zum Moderator und wechselt nicht in dieses Profil | Zulässiger Dauerzustand. Die Verwaltung bleibt ohne eigenes `ResidentProfile` **stimmrechtslos und ohne Casting-Zugriff** (S-50/U-20) |
| Bewohnender → Moderator | Ernennung durch Haushalts-Account | Stimmrecht bleibt erhalten (orthogonale Attribute, E-04) |
| Bewohnender → ehemaliger Bewohnender | Setzen auf `moved_out` | **Sofortiger** Zugriffsentzug auf alle `CastingRound`s. `Vote`s bleiben und **zählen weiter im Score** — auch in einer währenddessen offenen Runde —, werden als „ehemaliges Mitglied" markiert; die Person fällt aus **Zähler und Nenner** der Beteiligungs- und Quorum-Anzeige (E-14, S-32, §4.2.3) |
| Ehemaliger → Bewohnender (Rückkehr) | Reaktivierung durch Haushalts-Account oder Moderator | Zugriff kehrt zurück. Alte `Vote`s bleiben unverändert zugeordnet. `RoundParticipation` muss **explizit** neu vergeben werden (E-13) |
| Bewerbender → Bewohnender | `Application.status = moved_in`, automatischer `ApplicationInviteToken` (S-42), Anlage eines `ResidentProfile` beim Einlösen | **`Application.became_resident_id` wird gesetzt** → Selbst-Redaktion greift ab diesem Moment **dauerhaft** (E-12, S-31). Bevorzugter Weg über den Einladungslink; manuelle Zuordnung (§4.1.7) bleibt für alle übrigen Fälle |
| Moderator scheidet aus **(geändert ggü. V0.5, S-50/U-20)** | `moved_out` des einzigen Moderators | Der Haushalts-Account bleibt handlungsfähig, aber **nicht mehr unmittelbar** — er hat selbst keinen Casting-Zugriff mehr. Der Weg führt über einen **Zwischenschritt**: die Verwaltung legt sich **selbst ein `ResidentProfile` an** und ernennt sich oder eine andere Person zum Moderator (beides bleibt Verwaltungsrecht, §4.0.1). Ergebnis: ein **benannter** Handelnder statt eines anonymen „Verwaltung"-Zugriffs. Warnung im Feed und an den Haushalts-Account, solange kein Moderator mit `ResidentProfile` existiert |

**Akzeptanzkriterien §4.0.1**

- [ ] Ein `Account` ohne aktives `ResidentProfile` hat auf jedem Bildschirm mit Abstimmungselementen keine Stimmabgabe-Steuerung — auch nicht deaktiviert, sondern mit Erklärungstext („Die Verwaltung stimmt nicht ab. Wechsle in dein Bewohner-Profil.")
- [ ] Ein `ActivityEvent`, das ohne aktives `ResidentProfile` ausgelöst wurde, zeigt im Feed „Verwaltung" als Urheber und keinen Personennamen
- [ ] Ein `ActivityEvent`, das mit aktivem `ResidentProfile` ausgelöst wurde, zeigt den Namen dieses `ResidentProfile`
- [ ] **Geändert ggü. V0.5:** Ein Hinweis auf die aktive Identität ist nur für Sitzungen erforderlich, die zwischen mehreren Identitäten wechseln können — nicht mehr als Kriterium „auf jedem Bildschirm für alle" (§4.1.0)
- [ ] **Geschützter Test (U-21):** Ein Konto ohne `household_admin` sieht den Organisationsabschnitt „Haushalt" auch dann nicht, wenn `Session.acting_profile_id` `null` ist — sichtbare Abschnitte richten sich ausschließlich nach `Membership.role`/`Membership.permissions`
- [ ] **S-50/U-20, geschützter Test:** Für ein Konto ohne `ResidentProfile` liefert jede Runden-, Bewerbungs-, Termin- und Notizansicht keinen Inhalt — Ausnahmen sind ausschließlich die Aufbewahrungsansicht und der Datenauskunft-Export (ohne Einsicht)
- [ ] Wird ein `Membership` auf `moved_out` gesetzt, liefert der nächste Abruf jeder Runden-, Bewerbungs-, Stimmen- und Notizansicht für dieses Profil keinen Inhalt — nicht ein ausgeblendetes Element, sondern keine Daten
- [ ] Nach `moved_out` erhält das Profil keine weitere `Notification`, einschließlich eines bereits geplanten Digests
- [ ] Nach `moved_out` sinken **Zähler und Nenner** der Beteiligungs- und Quorum-Anzeige offener Runden um jeweils 1 (sofern die Person abgestimmt hatte)
- [ ] Der **Score** einer `Application` ändert sich durch `moved_out` **nicht** — in offenen wie in abgeschlossenen Runden. Die Rangliste springt nicht
- [ ] Eine `Vote` eines `moved_out`-Profils wird sichtbar als „ehemaliges Mitglied" gekennzeichnet („1 Stimme von einem ehemaligen Mitglied") und bleibt im Score berücksichtigt
- [ ] Zieht die Person während einer **offenen** Runde aus, gilt dasselbe: Stimme bleibt gewertet, Person raus aus Zähler und Nenner
- [ ] Eine Berechtigung (Bewerber anlegen, Status ändern, Runde schließen, Termine bestätigen) ist einzeln vergebbar, ohne dass das Profil Moderator wird
- [ ] Die Ernennung zum Moderator entzieht kein Stimmrecht
- [ ] **Geändert ggü. V0.5 (S-50/U-20):** Ist der einzige Moderator ausgezogen, bleibt der Haushalt handlungsfähig, aber **nicht unmittelbar** über den Haushalts-Account — dieser muss sich zuerst selbst ein `ResidentProfile` anlegen und einen Moderator ernennen (beides ohne fremde Hilfe möglich). Der Feed weist auf den fehlenden Moderator hin, solange dieser Zwischenschritt nicht erfolgt ist

---

### 4.0.2 Nutzerflüsse (Cross-Page)

**Aktivierte optionale Sektion** — der Prozess ist der Kern des Produkts. Die Nummerierung
in der Spalte „Ist-Schritt" verweist auf die 13 Ist-Prozessschritte aus
`01-Problem-Framing.md`; damit ist jeder Schritt der Belegkette nachweislich abgedeckt.

#### Hauptfluss — von der Anzeige bis zum Einzug

| # | Bildschirm | Nutzerhandlung | Ergebnis | Ist-Schritt | Verzweigung |
|---|-----------|----------------|----------|:-----------:|-------------|
| 1 | Registrierung (Haushalt) | E-Mail + Passwort, Hinweis auf gemeinsam genutzte Adresse | `Household` + `Account` angelegt | — | E-Mail bereits vergeben → Anmeldung anbieten |
| 2 | Organisation → Haushalt | Zimmer anlegen, Beitrittscode erzeugen | `Room`s angelegt, ein Code für den ganzen Haushalt (E-05) | 1 | Kein Zimmer → Runde kann nicht angelegt werden, Hinweis statt Sperre ohne Erklärung |
| 3 | Beitritt per Code **oder Einladungstoken** (S-42) | Bewohnende öffnen Code/Link, Name + Passwort | `ResidentProfile` + `Membership` (`is_resident = true`); beim Einladungstoken zusätzlich `Application.became_resident_id` automatisch gesetzt | — | Code abgelaufen → Fehlerzustand mit „Code neu anfordern"-Hinweis an den Haushalt · Token: vier Ausgänge, siehe §4.1.15 |
| 4 | Organisation → Runde **(geändert ggü. V0.5: nicht mehr „Rundenkopf" — Anlegen ist eine Moderationshandlung, kein Bewohner-Startbildschirm, S-50/U-20)** | Moderator legt `CastingRound` an, wählt Zimmer | Runde `open`; `RoundParticipation` aus den aktiven Bewohnenden **gesnapshottet** (E-13) | — | Bereits offene Runde → Hinweis, Wechsel anbieten (§4.2.2) |
| 5 | Bewerbung erfassen | Formular ausfüllen **oder** Nachricht einfügen und Parser-Vorschlag bestätigen | `Application` im Zustand `new` (P-1, S-08) | 2, 3 | Parser erkennt nichts → vorbelegtes Formular ohne Fehlermeldung; Pflichtfeld ist nur `name` |
| 6 | **Screening-Durchlauf** | Karte für Karte eine der vier Stufen wählen | `Vote` (Runde 1) je `Application`, jederzeit revidierbar | 4 | Keine offene Bewerbung → Leerzustand „nichts wartet auf dich" |
| 7 | **Zweiter Durchlauf** (ersetzt „Feinschliff" als eigenen Bildschirm, §4.1.5) | Nur falls `Unbedingt > ceil(Zimmer × 1,5)`: derselbe Kartenstapel, nur mit den eigenen Unbedingt-Karten | Angepasste `Vote`s (E-08, S-11/S-47) | 4 | Schwelle nicht erreicht oder abgeschaltet → Schritt entfällt vollständig |
| 8 | Rangliste | Sortieren, Kandidaten öffnen | Score sichtbar (erst nach eigener Stimme, Standard), Quorum-Abschnitt getrennt | 4 | Eigene Stimme fehlt → Ergebnisse verdeckt mit Erklärung und Sprung in den Durchlauf |
| 9 | Kandidaten-Einzelansicht | „Als eingeladen markieren" | `status: new → screened → invited`; **Copy-Paste-Text mit Datenschutzhinweis** wird erzeugt (S-16) | 5 | Selbst-Redaktion greift → Sachprofil ohne Beratungsinhalte, mit ehrlichem Hinweis |
| 10 | Verfügbarkeitsraster | Bewohnende tragen `AvailabilityWindow` ein (Raster oder Freitext mit Bestätigung) | Heatmap „4/7 können" | 6 | Kein Eintrag → Heatmap bleibt leer, manuelles Legen bleibt möglich |
| 11 | Verfügbarkeit der Bewerbenden | Moderator pflegt Wunschzeiten ein (v1: manuell/Parser; v1.1: Token-Link) | `AvailabilityWindow` an der `Application` | 6 | Keine Angabe → alle Slots gelten als möglich, sichtbar als Annahme markiert |
| 12 | Terminvorschlag | „Vorschlag berechnen" **oder** `Slot`s von Hand legen | Vorschlag mit **nachrechenbarer Begründung** (S-19, S-20) | 6 | Unlösbar → harte Constraints einzeln relaxiert, Grund benannt · Solver nicht verfügbar → manuelles Legen bleibt voll nutzbar (§6.2) |
| 13 | Slot-Reaktionen | Bewohnende reagieren 👍 / „kann nicht" | Zustimmungsbild je `Slot` | 6 | Zu wenig Zustimmung → Moderator bestätigt trotzdem oder legt neu; keine Sperre |
| 14 | Terminbestätigung | Moderator bestätigt | `Appointment` angelegt, `status: invited → scheduled`, Kalendereintrag | 6 | Bewerbende sagt Termin ab → `scheduled → invited` (Rückwärtsübergang, P-4) |
| 15 | Casting | — (findet vor Ort statt) | `status: scheduled → interviewed` | 7 | Termin geplatzt → Rückwärtsübergang |
| 16 | Casting-Notizen | Anwesende füllen strukturierte Prompts | `CastingNote` an der `Application`, für alle Rundenteilnehmer lesbar | **8** | Niemand schreibt → Abwesende sehen „keine Notizen vorhanden" statt eines leeren Feldes |
| 17 | **Runde 2** | Abstimmung über gecastete Bewerbende, gleiche vierstufige Skala; optional `Veto` | `Vote` (Runde 2), ggf. `Veto` mit Begründung | 9 | `Veto` gesetzt → Kandidat rankt tief, wird **nicht** gelöscht (E-11) · Veto-Budget erschöpft → Hinweis mit Zähler |
| 18 | Zusage | „Zusage erteilen", Zimmer und Wunsch-Einzugstermin festhalten (auch vorläufig) | `status: interviewed → offer_made`; Copy-Paste-Text; **Veto-Sperre greift** | 10 | Mehrere Zimmer → Zimmerzuordnung erforderlich, `Room` wechselt Zustand |
| 19 | Rückmeldung einpflegen | Zusage oder Absage der Bewerbenden erfassen | Zusage → `moved_in`, `became_resident_id` wird gesetzt, sobald ein `ResidentProfile` entsteht · Absage → `declined_by_applicant` | 11 | Rücktritt nach Zusage → `moved_in → offer_made` oder `declined_by_applicant`, auditiert (P-4) |
| 20 | Feed / Benachrichtigung | — (automatisch) | „X zieht am … in Zimmer … ein" im Feed und im Digest | 12 | Selbst-Redaktion greift für die betroffene Person auf alle Beratungsinhalte, **nicht** auf die Sachnachricht |
| 21 | Kalender | Einzugstermin und `Appointment`s ansehen | Übersicht aller Runden-Termine | 13 | Kein Termin → Leerzustand |
| 22 | Runde schließen | Moderator schließt die Runde | Runde `closed`; **Aufbewahrungsuhr startet** (180 Tage, E-18) | — | Offene Zimmer → Hinweis, dass die Runde für die übrigen Zimmer weiterlaufen kann (S-07) |
| 23 | Aufbewahrungs-Vorwarnung | 14 Tage vor Ablauf: „verlängern / jetzt löschen / archivieren" | Verlängerung protokolliert mit Begründung, oder Löschung | — | Keine Reaktion → **keine stille Löschung**; erneuter Hinweis, Löschung erst nach Ablauf und mit `ActivityEvent` |

#### Datenübergabe zwischen Bildschirmen

- Start / Organisation → alle Unterseiten: `casting_round_id` plus der aufgelöste
  Sichtbarkeitskontext (aktives Profil, `RoundParticipation`, Selbst-Redaktionsmenge). **Der
  Sichtbarkeitskontext wird serverseitig aufgelöst und nie clientseitig gefiltert** (S-36)
- Screening-Durchlauf → zweiter Durchlauf: Liste der eigenen `Unbedingt`-Stimmen plus
  `ceil(Zimmer × 1,5)` als Schwelle
- Rangliste → Kandidaten-Einzelansicht: `application_id`; die Einzelansicht lädt Stimmen,
  Notizen und Aggregat **erneut mit Policy-Prüfung**, statt sie aus der Liste zu übernehmen
- Kandidaten-Einzelansicht → Terminfindung: `application_id` als Vorfilter des Rasters plus
  die `AvailabilityWindow`s dieser Person für die Feasibility-Prüfung
- Terminvorschlag → Terminbestätigung: Vorschlag als `Slot`-Menge **plus die
  Begründungsdaten** (erfüllte und verletzte Terme), damit die Erklärung nicht neu berechnet
  werden muss und garantiert zum angezeigten Vorschlag passt (P-3)
- Feed → Zielobjekt: `activity_event_id` → Sprung auf `Application`, `Appointment` oder
  `CastingRound`; ist das Ziel durch Selbst-Redaktion nicht sichtbar, erscheint der
  Feed-Eintrag gar nicht — nicht ein Sprung in einen Fehlerzustand

#### Nebenflüsse

| Fluss | Auslöser | Ablauf |
|-------|----------|--------|
| **Neue Person zieht ein, Runde läuft weiter** | `moved_in` bei mehreren Zimmern | `ResidentProfile` anlegen → per Code beitreten → **explizit** zur laufenden `RoundParticipation` hinzufügen (E-13) → sie sieht die Runde inklusive Historie zu *anderen* Kandidaten, aber dauerhaft nichts über sich selbst (E-12) |
| **Person zieht aus** | `moved_out` | Sofortiger Zugriffsentzug · `Vote`s bleiben und zählen in abgeschlossenen Runden · Quorum-Nenner offener Runden sinkt · keine weiteren `Notification`s |
| **Zimmer vorzeitig vergeben** | `Room` wechselt auf vergeben | Runde läuft für die übrigen Zimmer weiter; Feinschliff-Schwelle rechnet mit den **noch offenen** Zimmern |
| **Runde wiedereröffnen** | Zusage platzt nach Rundenschluss | `closed → open`, auditiert; Aufbewahrungsuhr wird zurückgesetzt und dies protokolliert; Sichtbarkeitsinvariante greift unverändert weiter — **das war der Grund, die statusabhängige Heuristik zu verwerfen** |
| **Datenauskunft** | Bewerbende fragt beim Haushalt an | Moderator öffnet die `Application` → „Datenauskunft erzeugen" → Export aller zu dieser Person gespeicherten Daten (S-34). Auskunftspflichtig ist der Haushalt; Flatmate.io unterstützt (Art. 28 Abs. 3 lit. e) |
| **Wiederbewerbung einer inzwischen eingezogenen Person** | Neue `Application` derselben Person | Die Invariante greift über `became_resident_id` unabhängig von Runde und Status (§4.2.5) |

**Akzeptanzkriterien §4.0.2**

- [ ] Jeder der 13 Ist-Prozessschritte ist in der Tabelle oben mindestens einem Bildschirm zugeordnet
- [ ] Der Hauptfluss ist von Schritt 3 (Beitritt) bis Schritt 6 (erste `Vote`) ohne Zwischenbildschirm erreichbar, der nicht der Stimmabgabe dient
- [ ] Eine nicht verifizierte E-Mail-Adresse verhindert die erste `Vote` **nicht** (E-05)
- [ ] Vor abgeschlossener E-Mail-Verifikation wird keine `Notification` versendet und kein Beratungsinhalt per Mail zugestellt
- [ ] Jeder Vorwärtsübergang in der Tabelle hat einen erreichbaren Rückwärtsweg, der nicht als Fehlerdialog gestaltet ist
- [ ] Ein Feed-Eintrag, dessen Zielobjekt für das aktive Profil durch Selbst-Redaktion unsichtbar ist, erscheint für dieses Profil überhaupt nicht
- [ ] Der Sprung aus dem Feed führt niemals auf einen Bildschirm mit „keine Berechtigung"

---

### 4.1 Frontend-Anforderungen

#### 4.1.0 Navigations- und Layoutmodell

**Mobile-first ist hier eine Aufteilung, keine Bildschirmbreite.** Die Stimmabgabe findet
auf dem Telefon statt; die Moderation überwiegend am größeren Gerät. Daraus folgt eine
Zweiteilung, die im Layout sichtbar wird:

| Klasse | Bildschirme | Anforderung |
|--------|-------------|-------------|
| **Beteiligungs-Bildschirme** | Start · Screening-Durchlauf inkl. zweitem Durchlauf · Rangliste · Kandidaten-Einzelansicht · Slot-Reaktionen · Casting-Notizen · Runde 2 · Feed · Teilnehmendenliste | **Vollständig auf dem Telefon bedienbar, einhändig, ohne Querformat.** Eine Handlung pro Bildschirm. Keine Tabelle, die horizontal gescrollt werden muss |
| **Organisations-Bildschirme** | Verfügbarkeitsraster · Terminvorschlag · Pipeline · Zimmer · Mitglieder · Bewohnerliste · Aufbewahrung · Haushalt-Einstellungen | Dürfen das größere Gerät bevorzugen. **Müssen** auf dem Telefon lesbar und in ihren Kernhandlungen bedienbar bleiben (Status ändern, Termin bestätigen, Vorwarnung beantworten) — das Raster darf mobil vereinfacht dargestellt werden |

> **Navigationsmodell ersetzt (geändert ggü. V0.5, U-2).** Die bisherigen 5 Tabs (Runde ·
> Bewerbungen · Termine · Feed · Ich) sind ein Moderator-Mentalmodell — ein Bewohner muss
> erst entscheiden, wo er nachsieht. Ersetzt durch **2 Tabs + Kopfzeile mit zwei Elementen**
> (Screen-Inventar §4):
>
> - **Untere Leiste:** *Start* · *Casting* — genau zwei Elemente
> - **Kopfzeile:** *Glocke* (Benachrichtigungszentrum) · *Avatar* (Identitätswechsel,
>   Einstellungen, Zugang zur Organisationsfläche über „In Moderation wechseln") — **kein**
>   eigenes Moderations-Icon (K-6). Wer Rechte hat, erreicht die Organisationsfläche über das
>   Avatar-Menü oder direkt über einen CTA aus einer Benachrichtigung bzw. der
>   Moderations-Brücke im Dashboard (§4.1.2)
> - **Organisation** ist eine eigene Fläche ohne eigenen Tab-Platz — sie ersetzt die getrennten
>   Bildschirme „Pipeline" und „Haushalts-Einstellungen" durch eine gemeinsame,
>   abschnittsbasierte Fläche (§4.0.1)

**Rahmenwerk:** die untere Navigation *Start · Casting* auf dem Telefon, eine seitliche
Navigation mit denselben zwei Punkten plus Organisationseinstieg ab Tablet. Die **aktive
Identität** (Verwaltung / welches `ResidentProfile`) ist über den Avatar erkennbar. **Welche
Bereiche sichtbar sind, richtet sich ausschließlich nach `role`/`permissions` — nie danach,
ob `acting_profile_id` `null` ist** (U-21, geschützter Test, §4.0.1) — deshalb ist ein aktiver
„Kontext"-Indikator hier **nicht** mehr als eigenes Kriterium erforderlich, anders als in V0.5:
Es gibt nichts, das eine Sitzung *zusätzlich* freischaltet.

**Akzeptanzkriterien §4.1.0**

- [ ] Jeder Beteiligungs-Bildschirm ist bei 375 px Breite ohne horizontales Scrollen vollständig bedienbar
- [ ] **Geändert ggü. V0.5 (Screen-Inventar §4):** Ein Hinweis auf die aktive Identität ist nur für Sitzungen erforderlich, die zwischen mehreren Identitäten wechseln können (Haushalts-Account mit eigenem `ResidentProfile`, Person mit mehreren Profilen) — nicht auf jedem Bildschirm für alle. Für die übrigen ~90 % der Sitzungen ist kein Dauerindikator gefordert
- [ ] Kein Beteiligungs-Bildschirm setzt Hover-Interaktion voraus
- [ ] Die Anwendung ist als PWA installierbar und startet ohne Netzverbindung mindestens mit einem erklärenden Zustand statt einer Browser-Fehlerseite (ADR-011)
- [ ] Ohne Netzverbindung zeigt die gestartete App **keine** zuvor geladenen Bewerber- oder Beratungsdaten, sondern den Offline-Zustand (§6.2)

#### 4.1.1 Beitritt und erste Stimme

Der kürzeste Weg der Anwendung (S-03, SRD §10). Ein Bildschirm, **zwei Pflichtfelder: Name
und Passwort. E-Mail ist optional.** Der Beitrittscode gilt für den **ganzen Haushalt**,
nicht pro Person (E-05), ist über den Link bereits gesetzt und wird nur zur Bestätigung
angezeigt („Du trittst *WG Hauptstraße 12* bei"). **Ergänzt (Screen-Inventar §10):** ein
Kontrollkästchen **„Auf diesem Gerät angemeldet bleiben"**, vorbelegt an.

> **Dieselbe Begründung wie beim Passkey-Präzedenzfall unten:** Was für die erste Stimme
> nicht gebraucht wird, wird beim Beitritt nicht verlangt. Die **Resident-E-Mail**
> (`Account.email` des Resident-Accounts, zu unterscheiden von der Pflicht-**Household-E-Mail**
> des Haushalts-Admin-Accounts) ist nach dem Beitritt jederzeit in den persönlichen
> Einstellungen nachpflegbar — mit zurückhaltender Aufforderung dazu auf dem Dashboard
> (§4.1.13), nicht als weiteres Pflichtfeld im Beitrittsformular. Kerngedanke: Der Weg von
> Onboarding bis zur ersten Stimmabgabe bleibt so kurz, streamlined und unobstructed wie
> möglich — jedes Feld, das nicht zur ersten `Vote` beiträgt, gehört danach, nicht davor.

- Passwort ist die primäre und universelle Methode (P-2, ADR-007) und das einzige neben dem
  Namen zwingend erforderliche Feld. Passkey wird **nach** der Registrierung als optionaler
  Komfort angeboten und ist jederzeit abschaltbar
- Wird eine E-Mail-Adresse angegeben, läuft ihre Verifikation nachgelagert und blockiert die
  erste Abstimmung nicht; wird keine angegeben, entfällt dieser Schritt einfach
- Direkt nach dem Beitritt führt der Weg **in den Screening-Durchlauf**, nicht in ein
  Profil oder eine Übersicht — es sei denn, es gibt keine offene Bewerbung
- **Das PWA-Install-Banner und die Resident-E-Mail-Nachfrage gehören nicht in diesen Pfad.**
  Beide sind Dashboard-Elemente und erscheinen erst danach auf dem Start-Bildschirm
  (§4.1.13) — nicht als zusätzlicher Bildschirm oder zusätzliches Feld zwischen Beitritt und
  erster Stimme

> **Der Preis des Beitritts ohne E-Mail — bewusster Tauschhandel, kein Versehen (neu, K-18).**
> Ohne E-Mail kann eine Person ihr Passwort nicht selbst zurücksetzen. Die Verwaltung kann es
> stattdessen zurücksetzen — das **ist** eine Zugriffsmöglichkeit auf ein fremdes Profil
> einschließlich seiner Stimmen, und wird bewusst in Kauf genommen: Ohne diesen Ausweg würde
> ein vergessenes Passwort das Profil dauerhaft unzugänglich machen. **Die Lücke schließt sich
> selbst**, sobald die Person eine eigene E-Mail hinterlegt (§4.1.13) — ab diesem Moment läuft
> die Wiederherstellung über diese Adresse, und die Verwaltung kann das Passwort nicht mehr
> zurücksetzen. **Solange die Lücke besteht, bleibt sie sichtbar:** Jeder Reset durch die
> Verwaltung erzeugt einen `ActivityEvent` im Feed aller Bewohnenden und beendet die
> bestehenden Sitzungen des betroffenen Profils. Dieselbe Linie wie überall im Produkt: E-03
> sagt bereits, die Trennung Verwaltung/Bewohner sei **keine Sicherheitsgrenze** — auch dieser
> Reset wird nicht als Härtung dargestellt.

**Akzeptanzkriterien §4.1.1**

- [ ] Vom Öffnen des Beitrittslinks bis zur ersten möglichen `Vote` sind maximal zwei Bildschirme zu durchlaufen — **unverändert gültig**, auch nach Ergänzung von Install-Banner und E-Mail-Nachfrage, weil beide ausschließlich auf dem Start-Bildschirm erscheinen (§4.1.13)
- [ ] Ein Passwort-Reset durch die Verwaltung ist nur möglich, solange das betroffene Profil keine eigene E-Mail hinterlegt hat; danach läuft die Wiederherstellung über diese E-Mail
- [ ] Jeder Passwort-Reset durch die Verwaltung erzeugt einen `ActivityEvent` im Feed aller Bewohnenden und beendet alle bestehenden Sitzungen des betroffenen Profils
- [ ] Der Beitritt verlangt keine Angabe, die für die Stimmabgabe nicht benötigt wird
- [ ] Das Beitrittsformular verlangt ausschließlich Name und Passwort; das E-Mail-Feld ist als optional erkennbar und lässt sich leer abschicken
- [ ] Das Kontrollkästchen „Auf diesem Gerät angemeldet bleiben" ist vorbelegt und abwählbar
- [ ] Ein abgelaufener oder widerrufener Code zeigt einen Zustand, der benennt, wen die Person kontaktieren soll — nicht „ungültig"
- [ ] Passkey wird nie während der Registrierung angeboten
- [ ] Weder das PWA-Install-Banner noch die Resident-E-Mail-Nachfrage erscheinen im Beitrittsformular oder auf einem Zwischenbildschirm davor
- [ ] **Geändert ggü. V0.5 (U-22):** Die Bewohnerliste ist für ein frisch beigetretenes Bewohner-Profil auf keinem Weg erreichbar. Erreichbar ist die **Teilnehmendenliste** (nur Namen der Runden-Teilnehmenden, keine Handlungen) über den Beteiligungsstand auf dem Start-Bildschirm — nicht unmittelbar nach dem Beitritt als eigener Schritt
- [ ] Ein neuer Beitritt erzeugt einen `ActivityEvent`, der im Feed aller Bewohnenden erscheint

#### 4.1.2 Start — ersetzt „Rundenkopf" (Startbildschirm für Bewohnende)

> **Grundlegend neu gefasst ggü. V0.5 (U-1, U-9).** Der bisherige „Rundenkopf" hatte **genau
> einen** Handlungsaufruf vorgesehen — die Realität hat mehrere: Stimmen laufen pro
> `Application`, nicht pro Runde, und ein Bewohner kann gleichzeitig offen haben: Stimmen der
> ersten Runde, Stimmen der zweiten, Verfügbarkeit, Slot-Reaktionen, eine Casting-Notiz. Welche
> zuerst dran ist, stand nirgends. **Das Aufgabenmodell und die Sortierregel nach Zeitdruck
> sind vollständig in `07-Screen-Inventar.md` §2 ausformuliert (S-48) — dieser Abschnitt
> zitiert nur.**

Beantwortet in einem Blick, ohne Erinnerung an die letzte Nutzung: **Was steht an, und warum
zuerst?**

| Element | Inhalt |
|---------|--------|
| Phasenanzeige | Berechnet aus der am weitesten fortgeschrittenen `Application` der Runde, **nie ohne die zugehörige Phase gezeigt** — Formel und Verteilungszeile in `07-Screen-Inventar.md` §3 (löst B-1: `phase_hint` bekommt hier seine Berechnungsregel; verbindliche Quelle bleibt `04-Domaenenmodell.md`) |
| Zimmerstand | „3 Zimmer · 1 vergeben" |
| **Primärer CTA** | **genau einer**, mit konkreter Zahl, direktem Ziel und genanntem Grund (z. B. „Notiz zu Lea schreiben — 4 andere warten darauf"). Sortiert nach **Zeitdruck** (`CastingRound.phase_deadline_at` wo vorhanden, S-44), nicht nach fester Rangliste — Details Screen-Inventar §2 |
| Weitere Aufgaben | bis zu drei Zeilen darunter, Rest eingeklappt als „und N weitere" |
| Beteiligungsstand | **„5 von 7 haben abgestimmt"** (Nenner ohne `moved_out`, E-14) |
| Seit dem letzten Besuch | ausschließlich `outcome`-Ereignisse (§4.1.12), maximal fünf Zeilen, mit „alles ansehen" ins Activity Center |
| **Moderations-Brücke** (nur mit Rechten) | **eine** Zeile am Fuß, nie in die persönliche Aufgabenliste gemischt: „N Dinge brauchen deine Moderation →" (U-5) |
| **PWA-Install-Band** (S-45) | eigenes, optisch abgesetztes Band **unter** dem primären CTA — sichtbar und wiederkehrend, aber **nie** auf dem CTA-Platz und nie über einer fristgebundenen Aufgabe (löst B-2, Konflikt 2 aus dem Plan V5; korrigiert `04-Domaenenmodell.md`, siehe Nachzug dort) |
| Resident-E-Mail-Nachfrage (optional) | siehe §4.1.13 |

**Ist nichts offen**, steht dort der Rundenstand — nie eine leere Fläche (unverändert ggü. V0.5).

**Akzeptanzkriterien §4.1.2**

- [ ] **Geändert ggü. V0.5:** Es existiert genau **ein** primärer CTA, nicht mehr eine feste Formulierung „N offene Bewerbungen warten auf dich" — welche Aufgabe das ist, ergibt sich aus der Sortierung nach Zeitdruck (Screen-Inventar §2), nicht aus einer festen Priorität
- [ ] Jede Aufgabe mit `CastingRound.phase_deadline_at` erscheint vor Aufgaben ohne Datum; unter den datierten steht die nächstfällige zuoberst
- [ ] Ist keine Frist gesetzt, fallen Stimmaufgaben in die feste Reihenfolge zurück (Screen-Inventar §2)
- [ ] Eine `Application` mit `became_resident_id == aktives Profil` erzeugt keine Stimmaufgabe für dieses Profil
- [ ] Die Phasenanzeige erscheint nie ohne ihre Frist und nie eine Frist ohne ihre Phase; nach einem Phasenwechsel ist eine stehengebliebene Frist als „aus der vorherigen Phase" gekennzeichnet (Screen-Inventar §3)
- [ ] Eine abgelaufene `phase_deadline_at` blockiert keine Handlung — sie ändert nur Sortierung und Text (analog S-13, §4.2.4)
- [ ] Der Beteiligungsstand nennt Zähler und Nenner und schließt `moved_out`-Profile aus **beiden** aus
- [ ] Der Beteiligungsstand nennt keine Namen der Personen, die noch nicht abgestimmt haben
- [ ] Gibt es keine offene Handlung, erscheint ein Leerzustand mit dem aktuellen Rundenstand — keine leere Fläche
- [ ] Der Bildschirm ist ohne Vorkenntnis der letzten Sitzung verständlich (keine Formulierung, die auf „wie beim letzten Mal" verweist)
- [ ] Die Moderations-Brücke erscheint ausschließlich für Profile mit entsprechenden Rechten und nie vermischt mit der persönlichen Aufgabenliste
- [ ] Das PWA-Install-Band steht **nie** auf dem CTA-Platz und **nie** über einer Aufgabe mit gesetzter Frist — auch dann nicht, wenn die Frist heute abläuft und die App nicht installiert ist

#### 4.1.3 Bewerbung erfassen — Formular und Einfügen

Zwei Wege, **ein** Ergebnis: ein `Application`-Objekt, unabhängig vom Eingangskanal
(P-1, S-08, ADR-009).

*Weg A — Formular:* `name` ist das einzige Pflichtfeld. Optional: Kontaktangaben, Alter,
Freitext-Bewerbungsnachricht, weitere freie Angaben. Keine einladenden Strukturfelder für
besondere Kategorien nach Art. 9 (§4.6).

*Weg B — Einfügen:* Nachricht in ein Feld einfügen; ein **regelbasierter** Parser schlägt
Name, Alter, Kontakt und Nachrichtentext vor. Der Vorschlag erscheint als **vorbelegtes
Formular**, das ein Mensch bestätigt. Erkennt der Parser nichts, ist das Ergebnis ein leeres
Formular mit dem Text im Freitextfeld — kein Fehler.

##### Zwei Achsen, nicht eine (S-38)

Der **technische Pfad** und die **Erhebungsquelle** sind zwei getrennte Angaben, weil die
zweite über Art. 13 gegen Art. 14 DSGVO entscheidet — und damit im Dritterhebungsfall über
eine Pflicht, die betroffene Person **binnen eines Monats** zu informieren.

| Feld | Werte | Herkunft |
|------|-------|----------|
| `Application.source` | `manual_form` · `paste_parser` · `availability_link` · `portal_import` | wird vom System gesetzt (technischer Pfad, speist die Metrik aus SRD §6) |
| `Application.collected_from` | `data_subject` · `third_party` | **wird von einem Menschen gesetzt**, nicht aus `source` hergeleitet |

**Interaktion:** `data_subject` ist **sichtbar vorausgewählt** — nicht implizit —, daneben
eine einzelne Checkbox:

> ☐ Diese Bewerbung wurde mir von einer dritten Person weitergeleitet.

Ein Blick, keine Friktion. Wird sie gesetzt, zeigt die Anwendung einen Hinweis auf die
Informationspflicht binnen eines Monats und stellt den entsprechenden
Copy-Paste-Textbaustein bereit — als **Hilfsmittel für den Haushalt**, der Verantwortlicher
ist; die Anwendung informiert niemanden selbst (S-16).

> **Warum das nicht aus `source` abgeleitet werden darf:** Der Regelfall ist Art. 13 — hat
> die bewerbende Person ihre Bewerbung selbst geschickt (Portal-Nachricht, WhatsApp, Mail),
> sind die Daten *bei der betroffenen Person erhoben*; dass die WG sie danach eintippt,
> ändert die Erhebungsquelle nicht. `paste_parser` heißt also **nicht** Dritterhebung.
> Art. 14 greift nur bei echter Weiterleitung durch Dritte. Die Achsen sind orthogonal.

##### Absätze verwerfen, bevor gespeichert wird (S-39)

Freitext-Bewerbungen enthalten unvermeidlich Angaben nach Art. 9 (Gesundheit, Religion,
sexuelle Orientierung, Herkunft), für die keine saubere Rechtsgrundlage existiert. Der
**Erfassungsmoment ist die einzige Stelle**, an der sich das ohne Zusatzaufwand entschärfen
lässt.

Im Paste-Parser-Schritt wird die Rohnachricht daher **absatzweise** dargestellt. Zu jedem
Absatz steht eine Handlung „diesen Absatz nicht übernehmen". Verworfene Absätze gehen
**nicht** in die `Application` ein — sie werden nicht gespeichert, nicht ausgegraut
gespeichert und nicht protokolliert.

- Standard ist **übernehmen**: die Anwendung verwirft nichts von selbst
- Bewusst **keine** automatische Erkennung oder Vorauswahl sensibler Absätze — eine
  maschinelle Bewertung von Text über Personen wäre nahe an P-5
- Beim Formularweg (Weg A) entfällt der Schritt, weil dort ohnehin nur eingegeben wird, was
  eingegeben werden soll

**Akzeptanzkriterien §4.1.3**

- [ ] Beide Wege erzeugen ein `Application`-Objekt mit identischer Struktur; im Objekt ist der Erfassungsweg als `source` vermerkt (für die Metrik aus SRD §6)
- [ ] Der Parser speichert **nie** ohne menschliche Bestätigung
- [ ] Jedes vom Parser vorbelegte Feld ist als Vorschlag erkennbar und einzeln überschreibbar
- [ ] Erkennt der Parser nichts, erscheint kein Fehlerzustand, sondern das Formular mit dem eingefügten Text im Freitextfeld
- [ ] `name` ist das einzige Pflichtfeld; eine `Application` ist ausschließlich mit einem Namen speicherbar
- [ ] Es existiert kein Feld, das Herkunft, Religion, Gesundheit, sexuelle Orientierung, politische oder gewerkschaftliche Zugehörigkeit erfragt oder als Auswahl anbietet (P-5, Art. 9)
- [ ] Der Erfassungspfad funktioniert vollständig ohne Beteiligung der bewerbenden Person (P-1)
- [ ] `collected_from` ist im Erfassungsformular **sichtbar** mit `data_subject` vorbelegt; der Wert ist nicht nur implizit gesetzt
- [ ] `collected_from` wird **nicht** aus `Application.source` hergeleitet; `paste_parser` führt nicht automatisch zu `third_party`
- [ ] Wird die Checkbox „von einer dritten Person weitergeleitet" gesetzt, erscheint ein Hinweis auf die Informationspflicht binnen eines Monats und ein Copy-Paste-Textbaustein
- [ ] Die Anwendung versendet auch in diesem Fall **keine** Nachricht an die bewerbende Person
- [ ] `collected_from` ist an der `Application` später einsehbar und korrigierbar; eine Korrektur erzeugt einen `ActivityEvent`
- [ ] Im Paste-Parser-Schritt ist jeder erkannte Absatz der Rohnachricht einzeln verwerfbar
- [ ] Ein verworfener Absatz erscheint nach dem Speichern in keinem Feld der `Application`, in keinem Export und in keiner Datenauskunft
- [ ] Die Anwendung wählt keinen Absatz von selbst zum Verwerfen vor und markiert keinen als sensibel
- [ ] Der Standardzustand jedes Absatzes ist „übernehmen"; wer den Schritt ohne Eingriff bestätigt, verliert nichts

#### 4.1.4 Screening-Durchlauf — der wichtigste Bildschirm

Eine Karte, eine Frage, vier Antworten (S-09, S-10). Dies ist der Bildschirm, an dem die
Kernmetrik entschieden wird.

**Aufbau:** eine Karte pro `Application` mit Name, Alter (falls vorhanden), Bewerbungstext
und optionalen Angaben. Darunter vier Schaltflächen in fester Reihenfolge:

| Stufe | Wert | UI-Hinweis |
|-------|:----:|-----------|
| Nein | 0 | |
| Eher nicht | 1 | |
| Finde gut | 3 | |
| **Unbedingt** | 5 | „= dein Favorit" — es gibt keinen zweiten Durchlauf für Favoriten (E-07) |

Die **Stufenwerte sind sichtbar** — nicht in einer Hilfeseite, sondern am Bildschirm
abrufbar, mit einem Satz zur Nichtlinearität („die Entscheidungsgrenze liegt zwischen *Eher
nicht* und *Finde gut*"). Das ist P-3, nicht Transparenz-Kosmetik.

- Stimmen sind **während des Durchlaufs frei und jederzeit revidierbar** (E-08). Kein
  Budget, kein Zähler, keine Warnung
- Fortschritt sichtbar („3 von 11")
- Zurückblättern jederzeit möglich

**Akzeptanzkriterien §4.1.4**

- [ ] Die vier Stufen erscheinen immer in derselben Reihenfolge mit denselben Bezeichnungen
- [ ] Die Stufenwerte 0 / 1 / 3 / 5 sind vom Bildschirm aus einsehbar, ohne ihn zu verlassen
- [ ] Jede Stufe ist zusätzlich zur Farbe durch Symbol und Text unterscheidbar (§6.3)
- [ ] Während des Durchlaufs erscheint kein Budgethinweis, kein Zähler verbleibender Punkte und keine Warnung wegen zu vieler „Unbedingt"
- [ ] **Terminologie geändert ggü. V0.5 (Screen-Inventar §3):** Eine bereits abgegebene `Vote` ist innerhalb des laufenden `Vote.stage` (`invite`/`offer`) änderbar. Der frühere Begriff für einen Rundenzustand wird hier und in §4.1.6/§4.2.4 nicht mehr verwendet, weil er einen Zustand suggeriert, den es nicht gibt: `CastingRound.status` kennt nur `draft/open/paused/closed/archived`, jede `Application` hat ihren eigenen Fortschritt. Was gemeint ist, ist immer `stage`
- [ ] Der Durchlauf enthält **keine** `Application` mit `became_resident_id == aktives Profil`
- [ ] Der Durchlauf zeigt für das aktive Profil an keiner Stelle Stimmen, Aggregate oder Notizen anderer zur aktuellen Karte, solange die eigene Stimme fehlt und `reveal_before_own_vote` aktiv ist
- [ ] Der Durchlauf ist vollständig per Tastatur bedienbar
- [ ] Nach der letzten Karte folgt entweder der zweite Durchlauf (§4.1.5) oder die Rangliste — nie ein leerer Bildschirm

#### 4.1.5 Zweiter Durchlauf — ersetzt den eigenen Feinschliff-Screen (S-47)

> **Grundlegend geändert ggü. V0.5 (K-1/U-10).** Der bisher als eigener Bildschirm geplante
> Feinschliff mit den Unbedingt-Kandidaten in einer gemeinsamen Vergleichsansicht entfällt als
> **eigene** Interaktion. Der review-log führte ihn als „die einzige wirklich neue Interaktion
> des Produkts" mit fehlender Gestaltungsspezifikation (🔴). Statt die Lücke zu füllen,
> **entfällt die Neuheit**: ein zweiter, kurzer Durchlauf **im selben Kartenmuster** wie das
> Screening (§4.1.4) — niemand lernt eine zweite Bedienweise. Vollständig ausgestaltet in
> `07-Screen-Inventar.md` §9; **E-08 bleibt unverändert gültig** (die Korrektur passiert dort,
> wo alle Karten bekannt sind).

Erscheint **nur**, wenn nach dem Durchlauf `Anzahl eigener Unbedingt > budget` und der
zweite Durchlauf in `HouseholdSettings` aktiv ist (E-08, S-11/S-47), mit

```text
budget = max(1, ceil(offene Zimmer × 1,5))
```

> **Warum der Boden `max(1, …)` nötig ist:** Sind alle Zimmer belegt, die Runde aber noch
> offen, wird `ceil(0 × 1,5) = 0` — dann könnte niemand mehr „Unbedingt" vergeben, und der
> Schritt würde fordern, *alles* herabzustufen. „Dann soll die Runde eben schließen" reicht
> als Antwort nicht, weil Zimmer nach P-4 wieder freigegeben werden können und die Runde in
> diesem Zustand legitim weiterläuft. **Unverändert ggü. V0.5** — die Formel ändert sich durch
> S-47 nicht, nur die Darstellung.

**Ablauf (Screen-Inventar §9):**

1. Letzte Karte des Screening-Durchlaufs ist bewertet
2. Nur falls das Budget überschritten ist: ein Zwischenschritt mit **einem** Satz — „Du hast
   8-mal *Unbedingt* vergeben. Bei 3 Zimmern helfen höchstens 5. Noch einmal durchgehen?" mit
   den zwei Handlungen „Durchgehen" und „Überspringen"
3. Bei „Durchgehen": **derselbe Kartenstapel** wie im Screening, nur mit den eigenen
   Unbedingt-Karten, **dieselben vier Stufen**, Fortschritt „2 von 8"
4. Danach die Rangliste

- Zeigt **ausschließlich** die eigenen Unbedingt-Kandidaten, eine Karte nach der anderen —
  **nicht** mehr in einer gemeinsamen Vergleichsansicht (das war die V0.5-Darstellung, jetzt durch das Kartenmuster ersetzt)
- Das Budget ist **nur dann sichtbar**, wenn es überschritten ist — nicht als Dauerzähler
- Ist der zweite Durchlauf abgeschaltet, erscheint stattdessen nur der Hinweis „deine Stimmen
  differenzieren wenig"
- **Kein Zwang:** Der Schritt ist bei „Überspringen" oder jederzeit während des Durchgehens
  abbrechbar; die Stimmen bleiben dann unverändert

**Akzeptanzkriterien §4.1.5**

- [ ] Bei 3 offenen Zimmern gilt `budget = max(1, ceil(3 × 1,5)) = 5`; der Zwischenschritt erscheint daher ab der **6.** eigenen „Unbedingt"-Stimme und bei 5 oder weniger niemals
- [ ] Die Schwelle rechnet mit den **noch offenen** Zimmern, nicht mit der ursprünglichen Zimmerzahl der Runde
- [ ] Bei **0 offenen Zimmern und offener Runde** ist `budget = 1`: eine „Unbedingt"-Stimme bleibt möglich, und der Zwischenschritt erscheint erst ab der zweiten
- [ ] In diesem Fall fordert der Durchlauf nie, alle „Unbedingt"-Stimmen herabzustufen
- [ ] Wird ein `Room` wieder freigegeben, steigt `budget` beim nächsten Aufruf entsprechend — ohne bestehende `Vote`s zu verändern
- [ ] Der zweite Durchlauf zeigt ausschließlich die eigenen „Unbedingt"-Kandidaten, keine fremden Stimmen und kein Aggregat
- [ ] Der Zwischenschritt trägt genau einen Satz und zwei Handlungen: „Durchgehen" und „Überspringen"
- [ ] Der zweite Durchlauf verwendet **dieselben vier Stufen** wie das Screening (§4.1.4) — kein eigenes Bedienmuster, keine eigene Geste
- [ ] Der Fortschritt im zweiten Durchlauf ist relativ zur Zahl der eigenen Unbedingt-Karten sichtbar (z. B. „2 von 8"), unabhängig vom Fortschritt des ersten Durchlaufs
- [ ] Der Schritt ist ohne Änderung verlassbar; die Stimmen bleiben dann unverändert
- [ ] Bei abgeschaltetem zweiten Durchlauf erscheint der Zwischenschritt nicht, sondern ausschließlich der Hinweistext
- [ ] Das Herabstufen im zweiten Durchlauf erzeugt dieselbe `Vote`-Änderung wie im ersten Durchlauf, ohne Sonderpfad
- [ ] T-6 (zweiter Durchlauf als Aufgabe, Screen-Inventar §2) erscheint nie gleichzeitig mit der Stimmaufgabe der ersten Runde, da er deren Folgeschritt ist

#### 4.1.6 Rangliste und Kandidaten-Einzelansicht

**Rangliste:** `Application`s der Runde mit Score (Mittelwert auf 0–100), sortierbar. Unter
der Rangliste ein **eigener, sichtbar getrennter Abschnitt „Warten auf Stimmen (3 von 7)"**
für Kandidaten unter Quorum (E-10, S-13). Diese erscheinen **nicht** in der Rangliste und
tragen keinen Rangplatz.

**Einzelansicht (S-12):** Sachprofil, gestapelter **4-Farben-Stimmungsbild-Balken**
(Verteilung der vier Stufen), Stimmenzahl, Notizen, Statushandlungen. Der Balken hat eine textliche
Entsprechung („2× Unbedingt, 3× Finde gut, 1× Eher nicht").

**Verdeckte Ergebnisse (Standard an, E-09):** Solange das aktive Profil im laufenden
`Vote.stage` keine `Vote` zu dieser `Application` abgegeben hat, sind Score, Balken,
Stimmenzahl und Rangplatz verdeckt — mit Erklärung und direktem Weg zur Stimmabgabe.

**Selbst-Redaktion (E-12, S-31):** Ist `became_resident_id == aktives Profil`, zeigt die
Einzelansicht **nur** das Sachprofil, mit einem ehrlichen Hinweis:

> „Das ist deine eigene Bewerbung. Stimmen, Notizen und Bewertungen dazu sind für dich
> dauerhaft ausgeblendet — auch nach Abschluss der Runde."

**Akzeptanzkriterien §4.1.6**

- [ ] Der Score ist der **Mittelwert** der `Vote`-Werte, linear auf 0–100 skaliert (`Nein = 0`, `Eher nicht = 20`, `Finde gut = 60`, `Unbedingt = 100`), nicht die Summe
- [ ] Die Score-Formel und die Stufenwerte sind aus der Rangliste heraus einsehbar (P-3)
- [ ] Eine `Application` unterhalb des Quorums erscheint ausschließlich im Abschnitt „Warten auf Stimmen" und trägt keinen Rangplatz und keinen Score
- [ ] Der Abschnitt „Warten auf Stimmen" nennt Zähler und Nenner („3 von 7")
- [ ] Das Erreichen oder Nichterreichen des Quorums blockiert **keinen** Zustandsübergang (S-13)
- [ ] Bei aktivem `reveal_before_own_vote` sind Score, Stimmungsbalken, Stimmenzahl **und** Rangplatz verdeckt, bis das aktive Profil in diesem `Vote.stage` eine `Vote` zu dieser `Application` abgegeben hat
- [ ] Die verdeckte Darstellung nennt den Grund und führt mit einer Handlung in den Durchlauf
- [ ] **Sichtbarkeitsinvariante:** Für eine `Application` mit `became_resident_id == aktives Profil` liefert die Einzelansicht keine `Vote`, kein Aggregat, keinen Score, keinen Rangplatz, keine `Veto`-Information und keine `CastingNote` — **auch nicht in der API-Antwort**, nicht nur in der Darstellung
- [ ] Diese Ausblendung gilt unabhängig davon, ob die Runde `open`, `closed` oder wiedereröffnet ist
- [ ] Diese `Application` erscheint für das betroffene Profil auch nicht in der Rangliste, nicht im Abschnitt „Warten auf Stimmen" und nicht in einer Sortierung, aus der sich ihr Rangplatz ableiten ließe
- [ ] Der Stimmungsbalken hat eine textliche Entsprechung, die von einem Screenreader vollständig erfasst wird

#### 4.1.7 Pipeline (Statusverwaltung)

Alle `Application`s der Runde nach Zustand gruppiert, mit Anzahl je Spalte. Zustandswechsel
sind eine sichtbare Handlung auf dem Objekt, kein Ziehen als einziger Weg.

**Rückwärtsübergänge sind normale Handlungen** (P-4, S-15): erreichbar auf derselben Ebene
wie Vorwärtsübergänge, mit Angabe des Ziels („zurück auf *eingeladen*") und mit
Begründungsfeld, wenn der Übergang aus einem Endzustand herausführt.

##### Frühere Bewerbungen derselben Person zuordnen (S-40) — keine Komfortfunktion

> **Das ist die prozessuale Hälfte einer Datenschutzinvariante.** Die Selbst-Redaktion
> (§4.2.5) schützt nur **verknüpfte** `Application`s: `Application.became_resident_id` ist
> n:1 und wird **manuell** gesetzt. Wer sich vor zwei Jahren erfolglos beworben hat und
> diesmal einzieht, hat zwei `Application`s im System — und die alte trägt `Vote`s und
> `CastingNote`s über dieselbe Person. Ist nur die neue verknüpft, leckt die alte genau das,
> was die Invariante verhindern soll. Der Fehler tritt **ohne Fehlermeldung** ein und fällt
> beim Testen mit frischen Daten nie auf.

##### Bevorzugter Weg: automatischer Einladungslink bei `moved_in` (S-42)

Erreicht eine `Application` den Zustand `moved_in`, erzeugt die Anwendung **automatisch**
einen einmalig verwendbaren Einladungslink — Entität `ApplicationInviteToken`
(`application_id`, `token_hash`, `expires_at`, `used_at`, `revoked_at`). Registriert sich die
eingezogene Person über diesen Link, wird `Application.became_resident_id` **automatisch**
gesetzt — ohne den manuellen Zuordnungsschritt unten. Das ist der bevorzugte, weil
fehlerfreie Weg: Die Verknüpfung entsteht aus derselben Handlung, die die Person ohnehin
ausführt (sich registrieren), statt aus einer zusätzlichen, leicht vergessenen Handaktion.

Der im Folgenden beschriebene **manuelle** Weg bleibt für alle übrigen Fälle bestehen: kein
Token (mehr) vorhanden — abgelaufen, bereits verbraucht, widerrufen, oder die `Application`
stammt aus einer Zeit vor diesem Flow —, oder es handelt sich um eine spätere Korrektur.

Zwei Stellen, an denen die Anwendung das aktiv adressiert:

1. **Aktion an der Bewerberkarte:** „Diese frühere Bewerbung derselben Person zuordnen" —
   dauerhaft verfügbar und **beim Übergang nach `moved_in` prominent angeboten**. Sie
   verknüpft eine ältere `Application` mit demselben `ResidentProfile`.
2. **Sichtbarer Hinweis beim Anlegen eines `ResidentProfile` aus einer `Application`:**
   > „Gibt es frühere Bewerbungen dieser Person? Nicht zugeordnete bleiben für sie sichtbar."
   Der Hinweis ist kein Erfolgshinweis und keine Bestätigung, sondern eine Frage mit direktem
   Weg zur Zuordnung.

**Bewusst kein automatischer Abgleich** über Namen, Kontaktdaten oder Ähnlichkeit: Das wäre
ein Personenabgleich über Datensätze hinweg — heikel, fehleranfällig in beide Richtungen
(zwei verschiedene „Lea Müller" zu verschmelzen wäre schlimmer als die Lücke) und rechtlich
schwerer zu begründen als eine bewusste menschliche Handlung. Der Einladungslink oben ist
davon nicht betroffen — er verknüpft nicht anhand einer Ähnlichkeitsvermutung, sondern weil
die Person denselben, ihr exklusiv zugestellten Token verwendet.

**Fehlerfall: bereits registrierte Person klickt den Token.** Ist die klickende Person
**bereits registriert und angemeldet** — sie hat also schon einen `Account`/ein
`ResidentProfile` —, endet der Vorgang mit einer erklärten Fehlermeldung: „Du bist bereits
als Bewohner:in registriert." Es findet **keine** stille Verknüpfung und **keine**
Überschreibung eines bestehenden Profils statt. Doppelregistrierung und Merge zweier
Identitäten sind ausdrücklich keine Lösungswege dieses Fehlerfalls.

**Akzeptanzkriterien §4.1.7**

- [ ] Jeder in der Zustandstabelle (§4.2.1) erlaubte Rückwärtsübergang ist in der Oberfläche in maximal zwei Handlungen erreichbar
- [ ] Ein Rückwärtsübergang ist nicht als Warnung oder Fehlerdialog gestaltet und trägt keine abschreckende Formulierung
- [ ] Jeder Zustandswechsel — vorwärts und rückwärts — erzeugt einen `ActivityEvent` mit `Account`, handelndem Profil, Ausgangs- und Zielzustand
- [ ] Ein Übergang, der in der Tabelle nicht deklariert ist, wird serverseitig abgelehnt und erscheint in der Oberfläche nicht als Möglichkeit
- [ ] `moved_in → offer_made` und `moved_in → declined_by_applicant` sind ohne Datenverlust möglich; bereits gesetzte `became_resident_id` bleibt bestehen (§4.2.5)
- [ ] Der Übergang auf `invited` erzeugt den Copy-Paste-Text inklusive Datenschutzhinweis (S-16), versendet aber **nichts**
- [ ] Die Anwendung versendet an keiner Stelle eine Nachricht an eine bewerbende Person
- [ ] Der Übergang einer `Application` auf `moved_in` erzeugt automatisch genau einen einmalig verwendbaren `ApplicationInviteToken` für diese `Application`
- [ ] Registriert sich eine Person über einen gültigen, noch nicht verbrauchten und nicht widerrufenen `ApplicationInviteToken`, wird `became_resident_id` automatisch gesetzt (`used_at` wird belegt), ohne dass die manuelle Zuordnungsaktion nötig ist
- [ ] Ein abgelaufener, bereits verwendeter oder widerrufener Token zeigt einen erklärten Fehlerzustand statt eines stillen Fehlschlags
- [ ] Klickt eine **bereits registrierte, angemeldete** Person den Einladungslink, endet der Vorgang mit der erklärten Fehlermeldung „Du bist bereits als Bewohner:in registriert" — keine stille Verknüpfung, keine Überschreibung eines bestehenden Profils, keine Doppelregistrierung, kein Merge
- [ ] Die Aktion „diese frühere Bewerbung derselben Person zuordnen" ist an jeder Bewerberkarte erreichbar und wird beim Übergang nach `moved_in` sichtbar angeboten — unabhängig davon, ob zusätzlich ein Einladungslink existiert
- [ ] Beim Anlegen eines `ResidentProfile` aus einer `Application` erscheint der Hinweis auf möglicherweise vorhandene frühere Bewerbungen mit direktem Weg zur Zuordnung
- [ ] Die Zuordnung setzt `became_resident_id` der älteren `Application` auf dasselbe `ResidentProfile` und erzeugt einen `ActivityEvent`
- [ ] Nach der Zuordnung liefert die ältere `Application` für dieses Profil keine `Vote`, kein Aggregat, keine `CastingNote` und kein `Veto` mehr — geprüft auf API-Ebene (§6.5)
- [ ] Eine Zuordnung ist rücknehmbar (Fehlzuordnung), und die Rücknahme wird protokolliert
- [ ] Die Anwendung schlägt **keine** Zuordnung automatisch anhand von Namen, Kontaktdaten oder Ähnlichkeit vor und führt keine automatisch aus

#### 4.1.8 Verfügbarkeitsraster und Terminfindung

**Raster:** Wochenraster mit Zeitspalten. Bewohnende tragen `AvailabilityWindow` als „kann /
kann nicht" ein; das Raster zeigt eine **Heatmap** („4/7 können"). Zusätzlich der
**Freitext→Zeitfenster-Parser** („Di 16–19", „dienstags ab 16", „nur abends", „am 3.9.
nachmittags") — regelbasiert, Vorschlag **immer** bestätigungspflichtig (E-16, S-17).

> **Zwei Pfade, klar geschnitten (S-17, SRD O-08).** Die **manuelle Eingabe** strukturierter
> „kann / kann nicht"-Fenster inklusive Freitext-Parser ist **v1 und vollwertig** — P-1
> verlangt sie ohnehin, und sie ist der einzige Pfad, der ohne Mitwirkung der bewerbenden
> Person funktioniert. Der **Token-Link** für Bewerbende ist der Komfortpfad darüber: sein
> **Datenmodell liegt in v1**, die **bewerberseitige Seite in v1.1**. Damit entsteht keine
> Nacharbeit, falls sie vorgezogen wird (offener Punkt, Nutzerentscheidung).

**Feasibility-Schicht (ohne Solver, S-18):** Für eine ausgewählte `Application` werden Slots
ausgegraut, die ihre Wunschzeiten verletzen. Reine Pro-Person-Prüfung, immer verfügbar.

**„Vorschlag berechnen" (S-19):** Nutzt Haushalts-Präferenzen als Gewichte und Constraints:
„erst ab 18:00", „max. N Castings pro Tag", „parallel erlaubt / nicht erlaubt", „mindestens
X Bewohnende pro Casting", Mindestpuffer.

**Erklärbarkeit als Pflicht-Feature (P-3, S-20):**

- Zu **jedem** vorgeschlagenen `Slot`: die nachgerechnete Begründung („Di 17:00 — 5/7
  können, Puffer eingehalten, 2. Casting an diesem Tag")
- Bei **Unlösbarkeit**: harte Constraints in der **festen Relaxationsreihenfolge H6 → H1**
  aus `04-Domaenenmodell.md` einzeln lockern und den Grund benennen — „keine Lösung: Lea kann
  nur Di 16–19, dort können nur 2 von 7 (mindestens 4 gefordert)". Nie „keine Lösung
  gefunden" ohne Angabe. Die Reihenfolge ist fest, damit die Erklärung reproduzierbar ist (P-3)
- **Am Zeitlimit** (§6.1): Die **beste bis dahin gefundene zulässige Lösung** wird
  zurückgegeben und **als solche gekennzeichnet** — „unter Zeitdruck gefunden, möglicherweise
  nicht optimal". Nie ein stiller Fehlschlag, nie eine leere Antwort. Wurde im Zeitbudget
  *keine* zulässige Lösung gefunden, greift die Unlösbarkeits-Erklärung mit derselben
  Relaxationsreihenfolge

**Slot-Reaktionen (S-21):** Bewohnende reagieren auf **einzelne** `Slot`s (👍 / „kann
nicht"). Es wird **nicht** über ganze Termin-Konfigurationen abgestimmt. Die moderierende
Person bestätigt den `Appointment`.

**Akzeptanzkriterien §4.1.8**

- [ ] Verfügbarkeiten sind vollständig manuell erfassbar, ohne dass eine bewerbende Person einen Link öffnet (P-1)
- [ ] Der Zeitfenster-Parser speichert nie ohne Bestätigung; der erkannte Zeitraum wird vor der Übernahme im Klartext angezeigt („verstanden als: Dienstag, 16:00–19:00")
- [ ] Die Feasibility-Prüfung funktioniert, wenn der Solver nicht verfügbar ist
- [ ] Jeder berechnete Vorschlag zeigt zu jedem Slot die Zahl der verfügbaren Bewohnenden und die berücksichtigten Präferenzen
- [ ] Zwei Berechnungen mit identischer Eingabe liefern denselben Vorschlag (Determinismus, ADR-005)
- [ ] Bei Unlösbarkeit nennt die Anwendung mindestens einen konkreten blockierenden Constraint mit den betroffenen Personen und Zeiten
- [ ] Die Relaxationsreihenfolge ist fest (H6 → H1) und bei identischer Eingabe identisch — die Erklärung ist damit reproduzierbar
- [ ] Wird das Zeitbudget erreicht und existiert eine zulässige Lösung, wird sie zurückgegeben und sichtbar als „unter Zeitdruck gefunden, möglicherweise nicht optimal" gekennzeichnet
- [ ] Wird das Zeitbudget erreicht und existiert **keine** zulässige Lösung, erscheint die Unlösbarkeits-Erklärung — nicht eine leere Antwort und keine reine Zeitüberschreitungsmeldung
- [ ] Es gibt keinen Pfad, auf dem „Vorschlag berechnen" ohne Ergebnis und ohne Erklärung endet
- [ ] Es existiert keine Ansicht, in der über eine Menge von Terminen als Gesamtpaket abgestimmt wird
- [ ] Ein `Slot`, der die Wunschzeiten der ausgewählten `Application` verletzt, ist als nicht buchbar erkennbar und trägt eine Begründung
- [ ] Der Moderator kann einen `Appointment` auch gegen die Empfehlung bestätigen; die Anwendung blockiert nicht

#### 4.1.9 Casting-Notizen

Adressiert Schritt 8 der Belegkette — der zentrale Schmerzpunkt. **Strukturierte Prompts
statt leerem Kasten** (S-22, Inhaltsregeln in §4.6). Sichtbar über dem Eingabebereich:

> „Schreib so, als könnte die Person es lesen."

Notizen sind für alle `RoundParticipation`-Teilnehmenden lesbar — mit Ausnahme der
Selbst-Redaktion.

**Auslöser und Adressaten (ergänzt, S-46).** Wer diese Notiz schreiben soll, ist jetzt an
`AppointmentAttendance` festgemacht, nicht mehr allein am Casting-Termin: Die Erinnerung
`casting.note_reminder_due` geht nach dem Übergang `scheduled → interviewed` an alle
`AppointmentAttendance`-Einträge mit `attended = true` — vollständig beschrieben in §4.6.4.
Diese Aufgabe erscheint auf dem Start-Bildschirm als T-1 (Screen-Inventar §2), mit dem
konkreten Fälligkeitsgrund „seit gestern fällig" statt eines allgemeinen Hinweises.

**Akzeptanzkriterien §4.1.9**

- [ ] Der Notizbereich zeigt strukturierte Prompts, nicht ein einzelnes leeres Textfeld
- [ ] Der Hinweis „schreib so, als könnte die Person es lesen" ist beim Schreiben sichtbar, nicht in einer Hilfeseite
- [ ] Der Hinweis ist ein Hinweis: Er blockiert kein Speichern und prüft keinen Inhalt
- [ ] Eine `CastingNote` zu einer `Application` mit `became_resident_id == aktives Profil` wird für dieses Profil nicht ausgeliefert
- [ ] Existieren keine Notizen, erscheint für Abwesende ein Leerzustand, der das benennt, statt eines leeren Eingabefelds
- [ ] Jede `CastingNote` trägt Verfasser (Profil), Zeitpunkt und Bezug zur `Application`
- [ ] Notizen unterliegen der 180-Tage-Aufbewahrung und erscheinen in der Datenauskunft (S-33, S-34)
- [ ] Die Aufgabe „Notiz schreiben" erscheint auf dem Start-Bildschirm ausschließlich für Profile mit `AppointmentAttendance.attended = true` zu dieser `Application` und ohne bereits geschriebene `CastingNote` (§4.6.4)

#### 4.1.10 Runde 2 und Veto

Zweite Abstimmung über gecastete Bewerbende (`interviewed`), **gleiche vierstufige Skala**.
Zusätzlich das `Veto` (E-11, S-24):

- Einstellbar in `HouseholdSettings`: Begründungspflicht (Standard **an**), Budget pro Runde
  (Standard **1**), Anonymität als **Opt-in** (Standard **aus**)
- Ein `Veto` rankt den Kandidaten tief, **löscht ihn nicht**
- **Hinweis beim Schreiben der Begründung** — dieselbe Ehrlichkeitslinie wie beim
  Anonymitätshinweis:
  > „Diese Begründung kann der Person auf Auskunftsverlangen offengelegt werden — und lässt
  > möglicherweise auf dich schließen."
  Grund: Der Inhalt **wird** offengelegt (§4.3). Dass eine Begründung in einer Fünfer-WG
  faktisch auf ihre Urheberin schließen lässt, ist kein Grund zurückzuhalten — es ist ein
  Grund, vorher zu warnen
- **Ehrlichkeitshinweis, wenn Anonymität aktiviert wird oder werden soll:**
  > „In einer WG dieser Größe ist ein anonymes Veto mit Begründungspflicht praktisch nicht
  > anonym. Wer es liest, wird meist erraten, von wem es kommt."
  Der Hinweis nennt die konkrete Zahl der Stimmberechtigten
- Vetos sind ab `offer_made` gesperrt (Phasengrenze)

**Akzeptanzkriterien §4.1.10**

- [ ] Runde 2 verwendet dieselben vier Stufen mit denselben Werten wie Runde 1
- [ ] `Vote`s aus Runde 1 und Runde 2 sind getrennt gespeichert und werden nicht vermischt
- [ ] Ein `Veto` verändert die Rangposition, entfernt die `Application` aber nicht aus der Liste und ändert ihren Zustand nicht
- [ ] Bei erschöpftem Veto-Budget ist die Handlung nicht verfügbar und der Zähler wird genannt („1 von 1 Veto verbraucht")
- [ ] Bei aktiver Begründungspflicht ist ein `Veto` ohne Text nicht speicherbar
- [ ] Wird Anonymität aktiviert, erscheint der Ehrlichkeitshinweis mit der konkreten Zahl der Stimmberechtigten
- [ ] Nach dem Übergang auf `offer_made` ist kein neues `Veto` mehr setzbar; bestehende bleiben sichtbar
- [ ] Ein `Veto` zu einer `Application` mit `became_resident_id == aktives Profil` wird für dieses Profil nicht ausgeliefert — auch nicht als bloße Existenzangabe („1 Veto vorhanden")

#### 4.1.11 Kalender

`Appointment`s und Einzugstermine der Runde in Monats- und Listenansicht. Sprung auf die
zugehörige `Application` bzw. das `Room`.

**Anwesenheit wird angenommen, nicht erfasst (neu, U-23, S-51).** Bestätigt die moderierende
Person einen `Appointment`, entstehen `AppointmentAttendance`-Zeilen aus
`expected_attendee_profile_ids` mit **`attended = true`** — ohne Handgriff. Die Moderation
tut im Normalfall **nichts**. Zwei Ausnahmefälle, beide klein und selten:

- **Vor dem Termin:** Die Terminerinnerung an eine erwartete Person trägt die Handlung **„Ich
  kann doch nicht"** — eine kurzfristige Absage der **einzelnen** Person, nicht des ganzen
  `Appointment`s. Das ist eine Selbstauskunft, keine Moderationshandlung
- **Danach:** „War jemand doch nicht da?" — eine Korrektur, für die Moderation erreichbar,
  aber **nie erforderlich**. Sie existiert für den Ausnahmefall, dass jemand ohne vorherige
  Absage nicht erschienen ist

Diese Umkehrung senkt Organisationsaufwand, statt ihn zu erzeugen (PB-2, K-13) — die
Information, wer teilnehmen wollte, liegt bereits über `expected_attendee_profile_ids` vor.
Sie speist außerdem T-1 (Casting-Notiz) und die Erinnerung aus §4.1.9/§4.6.4: Nur wer
`attended = true` hat, bekommt die Notiz-Erinnerung.

> **Offener Punkt für `04-Domaenenmodell.md` (B-3, S-51):** Die kurzfristige Absage einer
> einzelnen Person ist dort bisher **nicht modelliert** — `Appointment.status` kennt nur
> Zustände für den ganzen Termin (`cancelled`, `no_show`). Dieser Abschnitt setzt das
> entsprechende Feld/den entsprechenden Übergang auf `AppointmentAttendance` voraus; die
> verbindliche Modellierung liegt bei der Domänenmodell-Sitzung.

**Akzeptanzkriterien §4.1.11**

- [ ] Der Kalender zeigt `Appointment`s und Einzugstermine unterscheidbar
- [ ] Ein Kalendereintrag, dessen `Application` durch Selbst-Redaktion betroffen ist, erscheint mit Sachbezug (Termin, Zimmer, eigener Name), aber ohne jeden Beratungsinhalt
- [ ] Zeiten werden in der lokalen Zeitzone des Betrachters angezeigt
- [ ] Ohne Termine erscheint ein Leerzustand mit Verweis auf die Terminfindung
- [ ] Nach Bestätigung eines `Appointment`s entstehen `AppointmentAttendance`-Zeilen für alle `expected_attendee_profile_ids` mit `attended = true`, ohne dass die Moderation etwas tut
- [ ] Die Handlung „Ich kann doch nicht" ist an der Terminerinnerung der betroffenen Person erreichbar und ändert die Anwesenheit **nur für diese eine Person**, nicht für den ganzen `Appointment`
- [ ] Im Normalablauf einer Runde ohne Absagen enthält die Organisationsfläche **keine** Aufgabe zur Anwesenheit — die Korrektur erscheint nur, wenn tatsächlich jemand ohne Absage gefehlt hat
- [ ] Die Anwesenheitskorrektur ist für die Moderation jederzeit erreichbar, aber an keiner Stelle als Pflichtschritt vor der Notiz-Erinnerung oder dem Rundenfortschritt vorausgesetzt

#### 4.1.12 Aktivitäts-Feed und Benachrichtigungszentrum

Der Feed ist die Antwort auf „was ist passiert, während ich weg war" und speist die
`Notification`s (E-21, E-22, S-27, S-28).

- Chronologisch, gruppiert nach Tag, jeweils mit Urheber (Profilname bzw. **„Verwaltung"**)
- Das Benachrichtigungszentrum listet die eigenen `Notification`s, darunter der Unterpunkt
  **„Alle Aktivitäten"** mit dem vollständigen `ActivityEvent`-Log (Activity Center, U-4)
- **Digest ist der Standard**, nicht Einzelbenachrichtigung
- Ereignisauswahl auf **zwei** Ebenen: `HouseholdSettings` (was der Haushalt grundsätzlich
  verschickt) und persönliche Einstellungen (was ich davon erhalte)

**Zwei Ereignisklassen (neu, U-3/U-4, löst auf, wie „Seit deinem letzten Besuch" und das
Activity Center sich unterscheiden — abgeleitet aus `ActivityEvent.event_type`, gleiche
Bauform wie `phase_hint`, vollständige Zuordnungstabelle in `07-Screen-Inventar.md` §5):**

- **`outcome`** — für mich feststehende Dinge, die ich nicht selbst ausgelöst habe: bestätigter
  Termin, erteilte Zusage, Einzugsdatum, Rundenschluss, neue Mitbewohnende. Speist
  ausschließlich „Seit deinem letzten Besuch" auf dem Start-Bildschirm (§4.1.2), maximal fünf
  Zeilen
- **`process`** — alles Übrige: einzelne Statuswechsel, Codeausgaben, Notizanlagen. **Nur** im
  Activity Center, nicht auf dem Start-Bildschirm

**Kanalreihenfolge (geändert ggü. V0.5, S-28 — Web Push jetzt v1 statt v1.1):** **Push → E-Mail
(nur falls hinterlegt) → In-App.** Für ein Profil ohne E-Mail (Normalfall nach S-03) und ohne
erteilte Push-Berechtigung ist das **Start-Dashboard der einzige Kanal** — siehe §4.1.15 für
den Zeitpunkt der Push-Berechtigungsanfrage und §6.2 für das Rückfallverhalten.

**Akzeptanzkriterien §4.1.12**

- [ ] Der Standardwert für neue Profile ist der Digest, nicht Einzelbenachrichtigung
- [ ] Persönliche Einstellungen können die Haushaltsauswahl weiter einschränken, aber nicht erweitern
- [ ] Kein `ActivityEvent` und keine `Notification` enthält einen Beratungsinhalt über die empfangende Person — geprüft für Betreff, Vorschautext und Inhalt
- [ ] Der Feed nennt bei Handlungen aus dem Verwaltungskontext „Verwaltung" und keinen Personennamen
- [ ] Der Feed enthält Beitritte, Zustandswechsel, Terminbestätigungen, Rundenwechsel, Löschläufe und Aufbewahrungsverlängerungen
- [ ] Ein `moved_out`-Profil erhält keine weitere `Notification`, einschließlich bereits geplanter Digests
- [ ] Vor abgeschlossener E-Mail-Verifikation wird keine `Notification` per E-Mail versendet
- [ ] „Seit deinem letzten Besuch" auf dem Start-Bildschirm enthält ausschließlich `outcome`-Ereignisse, nie das vollständige Aktivitätsprotokoll
- [ ] Jedes `ActivityEvent` ist eindeutig genau einer der beiden Klassen zugeordnet — keins erscheint in keiner oder in beiden
- [ ] Das Activity Center zeigt beide Klassen; „Seit deinem letzten Besuch" zeigt ausschließlich `outcome`
- [ ] Für ein Profil ohne aktive `PushSubscription` und ohne hinterlegte E-Mail ist jedes zustellbare Ereignis über das Start-Dashboard erreichbar, ohne dass eine externe Erinnerung vorausgesetzt wird

#### 4.1.13 Weitere Bildschirme (v1)

> **Bildschirmliste gestrafft ggü. V0.5 (K-10, K-19/U-22).** Zwei Verdichtungen: **„Persönliche
> Einstellungen" und „Passwort/Passkey" werden zu einem** Bildschirm „Einstellungen" mit
> Abschnitten — kein eigenes Ziel mehr für Passwort oder Kontowechsel. Und die **Bewohnerliste
> wird in zwei Bildschirme getrennt**, weil „wer macht bei dieser Runde mit" und „wer wohnt im
> Haushalt" unterschiedliche Fragen mit unterschiedlichen Rechten sind (Details:
> `07-Screen-Inventar.md` §7–8).

| Bildschirm | Zweck | Klasse |
|-----------|-------|--------|
| Registrierung (Haushalt) | `Household` + `Account` anlegen, Hinweis auf gemeinsam genutzte Adresse | Organisation |
| Organisation → Haushalt | Zimmer, Beitrittscode, Aufbewahrung, Abstimmungsverfahren — **kein** Zugriff auf Runden ohne eigenes `ResidentProfile` (S-50/U-20) | Organisation |
| **Teilnehmendenliste** (ersetzt „Bewohnerliste" für Bewohnende) | Information — wer nimmt an dieser Runde teil; **nur Namen**, keine Handlungen, keine Angabe, wer schon abgestimmt hat. Einstieg über den Beteiligungsstand auf dem Start-Bildschirm (K-11) | Beteiligung |
| **Bewohnerliste** (ersetzt „Bewohnerliste" für Verwaltung/Moderation) | Verwaltung — wer gehört zum Haushalt: Name, Beitrittsdatum, Kontakt, Status. **Geändert ggü. V0.5 (U-22):** Verwaltung voll, Moderator lesend, Bewohnende **gar nicht** — bisher „für alle sichtbar, Duplikatsschutz S-05"; die Begründung von S-05/E-06 wird in `02-SRD.md` nachgezogen | Organisation |
| **Einstellungen** (ersetzt „Haushalts-Einstellungen" + „Persönliche Einstellungen") | *Ein* Bildschirm mit Abschnitten: Benachrichtigungen (inkl. Push und E-Mail nachtragen), Konto (Passwort, Passkey), Abmelden — siehe §4.3 für die Haushalts-seitigen Einstellungen, die in Organisation → Haushalt bleiben | Beteiligung |
| Aufbewahrungs-/Datenauskunftsansicht | siehe §4.3 | Organisation |

##### Neue Dashboard-Elemente (S-45): kein eigener Bildschirm, zwei Einblendungen

PWA-Install-Banner und Resident-E-Mail-Nachfrage sind **keine eigenen Bildschirme im
Beitrittsflow** (§4.1.1 bleibt davon unberührt) — beide erscheinen als Einblendungen auf dem
Start-Bildschirm (§4.1.2), **nachdem** die erste `Vote` möglich ist. Zwei getrennte
Botschaften, bewusst unterschiedlich zurückhaltend:

| Element | Botschaft | Beharrlichkeit |
|---------|-----------|-----------------|
| **PWA-Install-Banner** | Aufforderung, die App zu installieren | **Sichtbar und wiederkehrend, aber nie auf dem CTA-Platz und nie über einer Aufgabe mit gesetzter Frist (geändert ggü. V0.5, U-19/Konflikt 2).** Ein eigenes, optisch abgesetztes Band **unter** dem primären CTA (§4.1.2). Grund der Änderung: Das Domänenmodell hatte den Hinweis „weiter oben einsortiert, aus demselben Grund wie eine näher rückende Rundenfrist" vorgesehen (B-2) — das ist falsch, weil der Hinweis keine Aufgabe im Castingprozess ist, nie im Sinne einer Runde „erledigt" wird und echte Aufgaben sonst dauerhaft verdrängen würde. S-45 fordert Sichtbarkeit, nicht den ersten Rang. Diese Korrektur ist auch in `04-Domaenenmodell.md` nachzuziehen |
| **Resident-E-Mail-Nachfrage** | Führt mit **„Zugang wiederherstellen, falls Passwort verloren geht"** — **nicht** mit Benachrichtigungs-Komfort | **Bleibt zurückhaltend.** Die Resident-E-Mail ist optional und jederzeit in den Einstellungen nachpflegbar (§4.1.1); wer die Einblendung übergeht, wird nicht erneut gedrängt |

**Verzahnung mit dem E-Mail-Fallback (§6.2):** Sobald für ein Profil tatsächlich eine
Fallback-E-Mail versendet wird — weil keine aktive `PushSubscription` vorliegt —, trägt
**genau diese E-Mail** zusätzlich den Installations-Nudge: „Installiere die App, um direkt
benachrichtigt zu werden und dein Postfach zu schonen", mit Link zur Installationsanleitung.
Web-Push-Zustellungen und reine In-App-Benachrichtigungen tragen diesen Nudge nicht — er
gehört an die Stelle, an der das Fehlen der Installation gerade spürbar wird.

**Akzeptanzkriterien (Dashboard-Elemente)**

- [ ] Weder das PWA-Install-Banner noch die Resident-E-Mail-Nachfrage erscheinen im Beitrittsformular oder auf einem Bildschirm zwischen Beitritt und erster `Vote` (§4.1.1)
- [ ] Beide Elemente erscheinen ausschließlich auf dem Start-Bildschirm (§4.1.2)
- [ ] Das PWA-Install-Banner ist nicht dauerhaft wegklickbar, solange die App nicht installiert ist
- [ ] **Geändert ggü. V0.5:** Das PWA-Install-Banner steht nie auf dem primären-CTA-Platz und nie über einer Aufgabe mit gesetzter `phase_deadline_at` — auch dann nicht, wenn die Frist heute abläuft und die App nicht installiert ist (U-19)
- [ ] Die Resident-E-Mail-Nachfrage führt mit der Zugangswiederherstellung, nicht mit einem Benachrichtigungsargument
- [ ] Die Resident-E-Mail-Nachfrage ist übergehbar, ohne die Nutzung der Anwendung einzuschränken, und wird nach dem Übergehen nicht bei jedem Aufruf erneut prominent gezeigt
- [ ] Eine tatsächlich versendete Fallback-E-Mail (§6.2, kein aktives `PushSubscription`) trägt den Installations-Nudge mit Link zur Installationsanleitung
- [ ] Eine Web-Push-Zustellung oder eine reine In-App-`Notification` trägt diesen Installations-Nudge **nicht**
- [ ] Ein reines Bewohner-Profil erreicht die Bewohnerliste auf keinem Weg; die Teilnehmendenliste zeigt keine Stimmstände und keine Handlungen
- [ ] Es existiert genau ein Bildschirm „Einstellungen"; Passwort, Passkey und E-Mail-Nachtrag sind Abschnitte darin, keine eigenen Ziele

#### 4.1.14 Plattformunterschiede

> **Angeglichen ans neue Rahmenwerk (geändert ggü. V0.5, U-2/§4.1.0).** Die Navigationszeile
> ist auf **2 Tabs + Kopfzeile** verkürzt; „Pipeline" liegt jetzt als Abschnitt „Bewerbungen"
> in der Organisationsfläche, nicht mehr als eigenständiger Navigationspunkt.

| Dimension | Telefon | Ab Tablet / Desktop |
|-----------|---------|---------------------|
| Navigation | untere Leiste (*Start · Casting*) + Kopfzeile (Glocke · Avatar) | seitliche Navigation mit denselben zwei Punkten plus Organisationseinstieg |
| Screening-Durchlauf | eine Karte bildschirmfüllend | eine Karte zentriert, Tastaturbedienung |
| Rangliste | Kartenliste mit Score-Pille | Tabelle mit sortierbaren Spalten |
| Verfügbarkeitsraster | vereinfachte Tagesansicht, wischbar | vollständiges Wochenraster mit Heatmap |
| Terminvorschlag mit Begründung | Vorschläge als Liste, Begründung ausklappbar | Vorschlag im Raster, Begründung daneben |
| Organisation → Bewerbungen (ersetzt „Pipeline") | Zustandsliste mit Anzahl, Wechsel über Objekthandlung | Spaltenansicht |
| Casting-Notizen | Prompts sequenziell | Prompts als Formular |

**Akzeptanzkriterium**

- [ ] Keine Kernhandlung (abstimmen, Veto, Slot-Reaktion, Notiz schreiben, Status ändern, Termin bestätigen, Vorwarnung beantworten) ist ausschließlich auf einer Plattformklasse verfügbar

---

#### 4.1.15 Drei neue Bildschirme aus dem Spec-Update (neu ggü. V0.5)

Drei Bildschirme, die das Spec-Update vom 02.09. nötig gemacht hat und die in V0.5 noch
fehlten. Die fachliche Regel steht jeweils bereits an anderer Stelle — hier folgt die
Bildschirm-Perspektive, damit die Liste in §3 vollständig ist.

**Einladungstoken einlösen (S-42).** Der Bildschirm, an dem eine zugesagte Person aus einer
`Application` ein `ResidentProfile` wird. Vier unterscheidbare Ausgänge, jeder mit einem
eigenen nächsten Schritt — Regel und Texte in §4.1.7: Erfolg (Registrierung, danach direkt in
den Screening-Durchlauf) · bereits eingelöst (`used_at` gesetzt) · abgelaufen oder
zurückgezogen (`expires_at`/`revoked_at`) · bereits als Bewohner:in registriert (kein Merge,
keine stille Überschreibung). Der Bildschirm benennt außerdem, dass ab diesem Moment die
Selbst-Redaktion für die eigene Bewerbung greift (§4.2.5) — sonst wirkt die eigene Bewerbung
unerklärt anders als die der anderen.

**Push-Berechtigung erteilen (S-28).** Ein eigener Bildschirm, **kein** Systemdialog
nebenbei. Erscheint **nach** der ersten abgegebenen `Vote`, nicht davor — vorher gibt es
nichts zu benachrichtigen, und jede Hürde vor der ersten Stimme wirkt gegen die Kernmetrik
(dieselbe Begründung wie beim Beitritt ohne E-Mail, §4.1.1). Erteilte oder verweigerte
Berechtigung ändert nichts an der Kanalreihenfolge aus §4.1.12 — bei Verweigerung greift der
E-Mail-Fallback bzw. In-App als letzte Ebene (§6.2).

**PWA-Install-Band.** Kein eigener Bildschirm, sondern ein Element des Start-Bildschirms —
vollständig beschrieben in §4.1.2 und §4.1.13 (U-19, löst B-2/Konflikt 2). An dieser Stelle
nur der Vollständigkeit halber aufgeführt: Sichtbar und wiederkehrend bis zur Installation,
aber **nie** auf dem primären-CTA-Platz und **nie** über einer Aufgabe mit gesetzter Frist.

**Akzeptanzkriterien §4.1.15**

- [ ] Der Einlöse-Bildschirm unterscheidet alle vier Ausgänge mit je eigenem Text und eigenem nächsten Schritt (§4.1.7)
- [ ] Der Push-Berechtigungsbildschirm erscheint frühestens nach der ersten `Vote` des Profils, nie vor dem Beitritt und nie im Beitrittsformular
- [ ] Eine verweigerte Push-Berechtigung blockiert keine Funktion und erzeugt keinen wiederholten Zwangsdialog
- [ ] Das PWA-Install-Band ist auf keinem Bildschirm ein eigenständiger Navigationspunkt oder eigener Screen — es existiert ausschließlich als Element des Start-Bildschirms

---

### 4.2 Daten- und Geschäftslogik

> Verbindliche Quelle für Felder, Typen und Kardinalitäten ist `04-Domaenenmodell.md`. Die
> hier festgelegten **Regeln** sind fachlich verbindlich; die Feldnamen sind Vorschläge.

#### 4.2.1 Zustandsmaschine `Application`

```text
 new ──▶ screened ──▶ invited ──▶ scheduled ──▶ interviewed ──▶ offer_made ──▶ moved_in
  │         │            │            │              │              │              │
  └─────────┴────────────┴────────────┴──────────────┴──────────────┴──────────────┘
                    Rückwärtsübergänge erlaubt und auditiert (P-4)

 Seitenzustände (aus mehreren Zuständen erreichbar, rückkehrbar):
   rejected_by_household · declined_by_applicant · withdrawn · archived
```

| Regel | Festlegung |
|-------|------------|
| Deklaration | **Alle** erlaubten Übergänge stehen in *einer* Tabelle. Kein Zustandswechsel entsteht aus einer Bedingung im Code (ADR-002, S-15) |
| Rückwärts | Erlaubt und **auditiert**. Jeder Rückwärtsübergang erzeugt einen `ActivityEvent` mit Ausgangs- und Zielzustand, Profil und Zeitpunkt |
| Endzustände | Es gibt keinen technisch endgültigen Zustand außer `archived`. Auch `moved_in` ist verlassbar — der Rücktritt nach Zusage ist der Normalfall, nicht der Fehlerfall (E-20) |
| Quorum | **Kein** Zustandsübergang hängt am Erreichen eines Quorums (S-13) |
| Automatik | Kein Übergang erfolgt automatisch ohne menschliche Handlung. Ausnahme: Löschung nach Ablauf der Aufbewahrung (§4.2.6), die kein Statuswechsel, sondern eine Entfernung ist |
| Weitere Zustandsmaschinen | `CastingRound` (`draft → open → closed`, mit Wiedereröffnung `closed → open`) und `Room` (frei → vorgesehen → vergeben, rückwärts erlaubt) — Details in `04-Domaenenmodell.md` |

#### 4.2.2 `CastingRound` und `RoundParticipation`

| Regel | Festlegung |
|-------|------------|
| Teilnehmer-Snapshot | Beim Übergang `draft → open` werden die aktiven Bewohnenden als `RoundParticipation` festgeschrieben. Danach **explizit** hinzufügbar und entfernbar (E-13) |
| Rundensichtbarkeit | Ein Profil sieht ausschließlich Runden, in denen es `RoundParticipation` hat |
| Neu eintretendes Profil | Sieht die Runde **inklusive Historie zu anderen Kandidaten** — Kontext ist nötig. Den heiklen Teil deckt die Selbst-Redaktion ab (§4.2.5) |
| **Parallele Runden (Entscheidung zu SRD O-04)** | Technisch sind mehrere gleichzeitig offene `CastingRound`s je `Household` **erlaubt** — der Vermieter-Fall und Sonderlagen brauchen das. In v1 wird der Fall **in der Oberfläche nicht angeboten**: es gibt eine als „aktiv" markierte Runde, weitere sind nur über eine Rundenliste erreichbar, und der Rundenkopf zeigt immer genau eine Runde. Begründung: Ein Screening-Durchlauf über zwei Runden hinweg wäre nicht erklärbar, und der Beteiligungsstand hätte zwei Nenner |
| Wiedereröffnung | `closed → open` ist erlaubt, auditiert und setzt die Aufbewahrungsuhr zurück; die Rücksetzung wird protokolliert |
| Verfahrenssperre | Änderungen am Abstimmungsverfahren (Stufenwerte, Feinschliff-Schwelle, Quorum-Regel, Veto-Einstellungen) sind bei einer offenen Runde **blockiert**; erfolgt eine Änderung dennoch über einen Verwaltungsweg, wird sie als `ActivityEvent` **laut protokolliert** und in der Runde sichtbar vermerkt (E-25, S-35) |

#### 4.2.3 Abstimmung und Score

| Regel | Festlegung |
|-------|------------|
| Stufen | `Nein = 0`, `Eher nicht = 1`, `Finde gut = 3`, `Unbedingt = 5` — nicht-linear, weil die Entscheidungsgrenze zwischen *Eher nicht* und *Finde gut* liegt (E-07, ADR-008) |
| Score | **Mittelwert** der abgegebenen `Vote`-Werte, linear auf 0–100 skaliert: `score = (Σ values / (n × 5)) × 100`. Nicht die Summe — sonst wäre eine Bewerbung mit mehr Stimmen automatisch besser |
| Offenlegung | Stufenwerte und Formel sind in der Oberfläche einsehbar (P-3). Es existiert kein verstecktes Gewicht, kein Bonus und kein Malus |
| Asymmetrie | „Ein starkes Nein wiegt mehr" ist **nicht** in die Gewichte kodiert. Diese Funktion trägt ausschließlich das `Veto` in Runde 2 (E-11) |
| Runden getrennt | `Vote`s aus Runde 1 und Runde 2 werden getrennt gespeichert und getrennt ausgewertet |
| Revidierbarkeit | Eine `Vote` ist innerhalb des laufenden `Vote.stage` änderbar; jede Änderung erzeugt einen `ActivityEvent` |
| **Stimmen Ausgezogener — auch bei Auszug während einer offenen Runde** | Die abgegebene `Vote` **bleibt im Score**, in offenen wie in abgeschlossenen Runden, und wird als „ehemaliges Mitglied" markiert („1 Stimme von einem ehemaligen Mitglied"). Die Person fällt aus **Zähler und Nenner** der Beteiligungs- und Quorum-Anzeige (§4.2.4). Begründung: Die Stimme wurde gültig abgegeben; sie rückwirkend zu entfernen ändert eine Grundlage, die andere schon gesehen und eingerechnet haben, und ließe die Rangliste **ohne sichtbaren Anlass springen** — P-3 (E-14) |
| Verdeckte Ergebnisse | `reveal_before_own_vote` (Standard: verdeckt). Die Durchsetzung erfolgt **serverseitig** — verdeckte Werte werden nicht mitgeliefert (S-36) |

#### 4.2.4 Quorum (Entscheidung zu SRD O-01)

| Regel | Festlegung |
|-------|------------|
| Nenner | Anzahl der `RoundParticipation`-Teilnehmenden mit `is_resident = true` und **ohne** `moved_out` |
| Zähler | Anzahl der **aktiven** Profile mit mindestens einer `Vote` zu dieser `Application` im laufenden `Vote.stage`. Stimmen von `moved_out`-Profilen zählen hier **nicht** mit (§4.2.3) |
| **Schwelle** | **`quorum_share = 0,5`, einstellbar in `HouseholdSettings`.** Ein Kandidat erscheint in der Rangliste, sobald `Zähler ≥ ceil(quorum_share × Nenner)` — also **mindestens die Hälfte** der Stimmberechtigten abgestimmt hat: bei 7 Stimmberechtigten 4, bei 6 genau 3. **Nicht** „mehr als die Hälfte" — bei geradem Nenner ist es genau die Hälfte |
| Begründung der 0,5 | Eine höhere Schwelle (z. B. 2/3) wurde ausgeschlagen: Eine Rangliste, die erst ab hoher Beteiligung erscheint, ist in den ersten Tagen leer — und **eine leere Rangliste demotiviert genau die Beteiligung, die sie voraussetzt.** Die Schwelle ist bewusst **nicht** an der Kernmetrik von 80 % ausgerichtet; die ist ein Ziel, keine Zugangsbedingung |
| Wirkung | **Anzeige, keine Sperre.** Unterhalb der Schwelle erscheint die `Application` im Abschnitt „Warten auf Stimmen (x von y)" statt in der Rangliste, ohne Rangplatz und ohne Score. Zustandsübergänge bleiben uneingeschränkt möglich |
| Änderung während laufender Runde | Blockiert (§4.2.2, Verfahrenssperre) |

#### 4.2.5 Sichtbarkeit — die Invariante

> **Niemand darf Beratungsinhalte über sich selbst lesen — dauerhaft, unabhängig vom
> Rundenstatus.** (E-12, S-31)

| Regel | Festlegung |
|-------|------------|
| Marker | Wird eine `Application` zum Bewohner, gilt `Application.became_resident_id = ResidentProfile.id` |
| Prädikat | Jedes **Beratungsartefakt** mit `became_resident_id == aktives Profil` ist für dieses Profil unsichtbar — für immer |
| Umfang „Beratungsartefakt" | `Vote` · `Veto` (auch die bloße Existenzangabe) · `CastingNote` · **jedes Aggregat** (Score, Stimmungsbalken, Stimmenzahl) · **Ranglistenposition** · jede Sortierung oder Zählung, aus der sich eines davon ableiten ließe |
| Nicht erfasst | Das **Sachprofil** der eigenen Bewerbung (Name, Kontakt, Bewerbungstext, Termin, Zimmer, Einzugsdatum) bleibt sichtbar, mit ehrlichem Hinweis |
| Alle Ausgabekanäle | Die Invariante gilt für Oberfläche, API-Antworten, `Notification`-Inhalte (Betreff, Vorschautext, Inhalt), `ActivityEvent`-Feed, Digest und Exporte — **nicht nur für die Darstellung** |
| Doppelte Durchsetzung | Zentrale Policy-Objekte **und** Row-Level-Security in der Datenhaltung (ADR-004, S-36). Eine vergessene Bedingung in der Anwendungsschicht muss an der Datenhaltung scheitern |
| Unabhängig vom Status | Die Regel prüft **nicht** den Rundenzustand. Die früher angedachte „offen/abgeschlossen"-Heuristik ist verworfen, weil sie bei wiedereröffneten Runden und Wiederbewerbungen leckt |
| **Grenze der Invariante — und ihre prozessuale Hälfte (S-40)** | `became_resident_id` ist **n:1 und wird manuell gesetzt**. Die Invariante schützt daher **nur verknüpfte** `Application`s. Eine ältere, nicht verknüpfte Bewerbung derselben Person trägt `Vote`s und `CastingNote`s über sie und **leckt genau das, was die Invariante verhindern soll** — ohne Fehlermeldung. Die Gegenmaßnahme ist deshalb keine Komfortfunktion, sondern Teil der Invariante: die ausdrückliche Zuordnungs-Aktion und der Hinweis beim Anlegen eines `ResidentProfile` aus einer `Application` (§4.1.7). **Kein automatischer Personenabgleich** |
| Wiederbewerbung (SRD O-03) | Bewirbt sich eine Person erneut, die inzwischen `ResidentProfile` ist, greift die Invariante über `became_resident_id` unabhängig von Runde und Zustand — sofern die `Application` verknüpft ist. Die Verknüpfung erfolgt über die Aktion aus §4.1.7 |
| Rückwärtsübergang | Verlässt eine `Application` den Zustand `moved_in`, bleibt `became_resident_id` gesetzt, solange das `ResidentProfile` existiert. **Die Invariante wird durch einen Rückwärtsübergang nicht aufgehoben** |
| Getrennte Regel | Die Rundensichtbarkeit über `RoundParticipation` (§4.2.2) ist eine **eigene** Regel und wird nicht mit dieser kombiniert (E-13) |

#### 4.2.6 Aufbewahrung und Löschung

| Regel | Festlegung |
|-------|------------|
| Rechtsgrundlage | Art. 5 Abs. 1 lit. e + Art. 17 Abs. 1 lit. a DSGVO (Speicherbegrenzung) — **nicht** Art. 15. Frist am AGG-abgeleiteten 6-Monats-Richtwert orientiert (E-18) |
| Frist | **180 Tage** nach Rundenabschluss für `Application`, `Vote`, `CastingNote` |
| **Verlängern** | Pro Runde, **+180 Tage**, mit **Begründungsfeld**, protokolliert. Die **einzige** Handlung, die die Löschuhr verändert. Nicht unbegrenzt, nicht stillschweigend |
| **Archivieren** | **Ein reiner Sichtbarkeitszustand: die Runde verschwindet aus der Standardansicht, die Löschuhr läuft unverändert weiter.** Kein Begründungsfeld, keine Fristwirkung |
| Kürzung | Der Haushalt kann die Frist auf **30 / 90 / 180** Tage kürzen, aber nicht über 180 hinaus voreinstellen |
| Vorwarnung | **14 Tage** vor Ablauf an den Moderator, mit drei Handlungen: „verlängern / jetzt löschen / archivieren". Die drei sind **nicht gleichartig** — siehe die beiden Zeilen oben |
| Keine stille Löschung | Ohne Reaktion wird erneut hingewiesen; die Löschung erfolgt nach Ablauf und erzeugt einen `ActivityEvent`. Ein ausgefallener Löschlauf ist über die ausgebliebene Vorwarnung erkennbar |
| Manuell | Löschen pro `Application` und pro `CastingRound` ist jederzeit möglich |
| **Atomarität** | Jede Löschung einer `Application` entfernt `Vote`s, `Veto`s, `CastingNote`s und `subject_statement` in **einer** Transaktion. Kein Artefakt hat einen eigenen Aufbewahrungszeitgeber — Begründung in §4.6 C-9 |
| Datenauskunft | „Datenauskunft erzeugen" pro `Application`: Export aller zu dieser Person gespeicherten Daten (S-34, E-19) |
| Deklarationspflicht | Jedes personenbezogene Feld steht mit Zweck, Rechtsgrundlage, Aufbewahrung und Kategorie in `data-inventory.yml`; ein CI-Check bricht bei nicht deklarierter Spalte (ADR-010, S-37) |

#### 4.2.7 Weitere Datenregeln

| Regel | Festlegung |
|-------|------------|
| Ereignisurheberschaft | Jeder `ActivityEvent` speichert **`Account` und handelndes Profil** (E-21). Anzeige: Profilname, oder ehrlich „Verwaltung" |
| Append-only (ADR-003) | `ActivityEvent`s werden nicht geändert und nicht gelöscht, solange die Bezugsdaten existieren. Wird ein Bezugsobjekt gelöscht, wird die personenbezogene Nutzlast des Ereignisses entfernt und der Eintrag auf „gelöscht" reduziert (offener Punkt SRD O-02) |
| Zeitzonen | Speicherung in UTC, Anzeige in der lokalen Zeitzone des Betrachters |
| Reiner Domänenkern | Score-Berechnung, Quorum, Zustandsübergänge, Termin-Kostenmodell und Zeitfenster-Parser sind pure Funktionen ohne Datenbankzugriff (E-26) — Voraussetzung dafür, dass sie als geschützte Tests prüfbar sind |
| Löschen eines `ResidentProfile` | `Vote`s werden auf „ehemaliges Mitglied" umgestellt, nicht gelöscht — abgeschlossene Entscheidungen bleiben nachvollziehbar. Setzt eine Löschung des Profils dessen Bewerbungshistorie zurück, bleibt `became_resident_id` bestehen, um die Invariante nicht zu brechen |
| Keine Cross-Context-Joins | Zugriffe zwischen den Kontexten `identity` · `casting` · `deliberation` · `scheduling` · `notifications` · `audit` laufen über Domain-Events, nicht über Joins (ADR-001, per Import-Boundary-Lint erzwungen) |

---

### 4.3 Organisation → Haushalt — Einstellungen und Compliance-Werkzeuge

> **Umbenannt ggü. V0.5:** Diese Fläche heißt jetzt **Organisation → Haushalt** und ist nur für
> ein Konto ohne `ResidentProfile` auf genau die hier gelisteten Bereiche beschränkt — der
> Bereich „Abstimmung" bleibt zwar hier (er ist eine Verfahrenseinstellung, kein
> Casting-Inhalt), Runde/Bewerbungen/Termine/Notizen sind für ein solches Konto dagegen **nicht
> erreichbar** (S-50/U-20, §4.0.1).

| Bereich | Einstellungen |
|---------|---------------|
| **Haushalt** | Name, UI-Label (v1 fest „WG"), Zimmer (`Room`s) mit Status, Beitrittscode erzeugen und widerrufen |
| **Beitrittscode absichern (neu, S-49/U-12)** | **Warnhinweis an der Stelle, wo der Link kopiert wird:** „Teile diesen Link nur direkt mit deinen Mitbewohnenden — niemals öffentlich. Wer ihn hat, kann mitstimmen." · **Ablauf** `join_code_expires_at` (Vorschlag 7 Tage, mit einem Tippen verlängerbar) · **Nutzungsgrenze** `join_code_max_uses` (vorbelegt mit der Zahl fehlender Bewohnender) — alle drei sitzen auf der Teilen-Seite, **keine** davon auf dem Beitrittsweg selbst (§4.1.1 bleibt unberührt). Grund der Dringlichkeit: Seit U-22 sehen Bewohnende die Bewohnerliste nicht mehr und können niemanden entfernen — der Einladungslink ist damit die **letzte verbliebene Kontrolle** gegen Missbrauch (E-06 wird entsprechend im SRD nachgezogen) |
| **Mitglieder** | `ResidentProfile` anlegen (aus dem Verwaltungskontext), Moderator ernennen, einzelne Berechtigungen vergeben, auf `moved_out` setzen, reaktivieren |
| **Abstimmung** | Zweiter Durchlauf an/aus (ersetzt „Feinschliff an/aus", S-47) · verdeckte Ergebnisse an/aus (Standard an) · Quorum-Schwelle `quorum_share` (Standard `0,5`) · Veto: Begründungspflicht (Standard an), Budget (Standard 1), Anonymität (Standard aus) — **alle bei offener Runde gesperrt** (§4.2.2) |
| **Terminfindung** | Frühester Beginn · maximale Castings pro Tag · parallel erlaubt/nicht erlaubt · minimale Zahl anwesender Bewohnender pro Casting · Mindestpuffer zwischen Terminen |
| **Benachrichtigungen** | Welche Ereignisse der Haushalt grundsätzlich versendet (persönliche Einstellungen können nur weiter einschränken) |
| **Aufbewahrung** | Frist 30 / 90 / 180 Tage (Standard 180) · laufende Fristen je Runde mit Restlaufzeit · **„verlängern"** (+180 Tage, mit Begründung, protokolliert — verändert die Löschuhr) · **„jetzt löschen"** · **„archivieren"** (nimmt die Runde nur aus der Standardansicht; die Löschuhr läuft weiter) |
| **Betroffenenrechte** | „Datenauskunft erzeugen" pro `Application` · manuelles Löschen pro `Application` und pro `CastingRound` · **Gegendarstellung (`subject_statement`) — Datenmodell in v1, Oberfläche in v1.1** (S-41). **Für ein Konto ohne `ResidentProfile`: Export ohne Einsicht** — der Export wird angestoßen, die Inhalte erscheinen nicht im Bildschirm (S-50/U-20, §4.0.1) |

**Akzeptanzkriterien §4.3**

- [ ] Der Warnhinweis auf der Teilen-Seite erscheint bei jedem Kopieren oder Anzeigen des Beitrittscodes, nicht nur beim ersten Erzeugen
- [ ] `join_code_expires_at` und `join_code_max_uses` sind in Organisation → Haushalt einstellbar; nach Ablauf oder Erreichen der Nutzungsgrenze ist der Code ungültig und ein neuer muss erzeugt werden
- [ ] Keiner der drei Sicherungspunkte (Warnhinweis, Ablauf, Nutzungsgrenze) erscheint auf dem Beitrittsweg der beitretenden Person (§4.1.1)
- [ ] Löst ein Konto ohne `ResidentProfile` „Datenauskunft erzeugen" aus, liefert die Anwendung eine Exportdatei, zeigt aber an keiner Stelle der Bedienoberfläche den Inhalt der `Application` an dieses Konto
- [ ] Bei offener `CastingRound` sind alle Einstellungen des Bereichs „Abstimmung" nicht änderbar, und der Grund wird benannt
- [ ] Eine Verlängerung der Aufbewahrung ist ohne Begründungstext nicht speicherbar
- [ ] Jede Verlängerung, Kürzung und Löschung erzeugt einen `ActivityEvent`
- [ ] Die Aufbewahrungsansicht zeigt je Runde die Restlaufzeit in Tagen
- [ ] **„Archivieren" verändert die Restlaufzeit nicht.** Eine archivierte Runde zeigt weiterhin dieselbe Restlaufzeit und wird nach deren Ablauf gelöscht wie jede andere
- [ ] „Archivieren" verlangt kein Begründungsfeld und wird nicht als Fristhandlung dargestellt
- [ ] Die Vorwarnung beschreibt die drei Handlungen ausdrücklich unterschiedlich: „verlängern" nennt die neue Frist, „archivieren" nennt ausdrücklich, dass die Löschung dennoch stattfindet
- [ ] Nach „archivieren" erscheint die 14-Tage-Vorwarnung erneut, falls sie noch nicht ausgelöst war — Archivieren unterdrückt sie nicht
- [ ] Die 14-Tage-Vorwarnung erreicht den Moderator über die eingestellten Kanäle und erscheint zusätzlich in der Anwendung
- [ ] Reagiert niemand auf die Vorwarnung, erfolgt keine Löschung vor Ablauf der Frist, und die Löschung nach Ablauf erzeugt einen `ActivityEvent`
- [ ] „Datenauskunft erzeugen" liefert alle zu dieser Person gespeicherten Daten, einschließlich `Vote`-Werten, `Veto`-Begründungen und `CastingNote`s
- [ ] **Die Datenauskunft gibt die Inhalte vollständig heraus** und nennt **nicht** die Namen der bewertenden Personen: Art. 15 Abs. 4 schützt die *Identität* der bewertenden Person, nicht den *Inhalt*. Der Inhalt ist personenbezogenes Datum der betroffenen Person
- [ ] Beim Schreiben einer `Veto`-Begründung erscheint der Hinweis: „Diese Begründung kann der Person auf Auskunftsverlangen offengelegt werden — und lässt möglicherweise auf dich schließen."
- [ ] Derselbe Hinweis erscheint beim Schreiben einer `CastingNote` in der Form aus §4.6 („schreib so, als könnte die Person es lesen")
- [ ] Der Haushalt kann die Aufbewahrungsfrist nicht über 180 Tage hinaus voreinstellen

---

### 4.4 Backend- und Schnittstellenbedarf

**Fachliche Ebene:**

- Authentifizierung: Registrierung (Haushalt), Beitritt per Code, Anmeldung, Passwort
  zurücksetzen, Sitzung; Passkey als optionaler Zusatz; E-Mail-Verifikation nachgelagert
- Beitrittscode: einer pro `Household`, erzeugbar und widerrufbar
- `Household`, `Room`, `Membership`, `ResidentProfile`: Verwaltung inklusive `moved_out`
  und Reaktivierung
- `CastingRound`: anlegen, öffnen (mit `RoundParticipation`-Snapshot), schließen,
  wiedereröffnen; Teilnehmende explizit ändern
- `Application`: anlegen (Formular und Einfügen), bearbeiten, Zustandsübergänge vorwärts und
  rückwärts gegen die Übergangstabelle, löschen, Datenauskunft erzeugen
- Paste-Parser und Zeitfenster-Parser: **regelbasiert**, liefern **Vorschläge**, speichern nie
- `Vote` und `Veto`: abgeben, ändern, zurückziehen; Aggregation und Quorum serverseitig;
  verdeckte Werte werden **nicht ausgeliefert**
- `CastingNote`: anlegen, bearbeiten, lesen nach Policy
- `AvailabilityWindow`, `Slot`, `Appointment`: Erfassung, Feasibility-Prüfung je
  `Application` (solverfrei), Vorschlagsberechnung hinter einem **Solver-Port** mit
  Begründungsdaten, Slot-Reaktionen, Terminbestätigung
- `ActivityEvent`: append-only, Fan-out zu `Notification`; Feed nach Policy gefiltert
- `Notification`: In-App und Web Push primär, E-Mail als Fallback ohne aktive
  `PushSubscription`, Digest-Bündelung, zwei Ebenen der Ereignisauswahl
- Aufbewahrung: Fristberechnung, 14-Tage-Vorwarnung, protokollierte Verlängerung,
  Löschlauf mit Ereignis
- Autorisierung: eine zentrale Policy-Schicht, durch die **jede** Abfrage läuft, plus
  Row-Level-Security in der Datenhaltung

> ⚠️ **Technische Ausgestaltung gehört nicht in dieses Dokument.** Endpunkte, Datenschema,
> Transportweg, Solver-Anbindung als Kindprozess, Row-Level-Security-Umsetzung, Deployment
> und EU-Hosting sind in **`05-ADRs.md`** (insbesondere ADR-001, ADR-004, ADR-005, ADR-006)
> und **`04-Domaenenmodell.md`** festgelegt.

---

> **Zu §4.5 Mehrsprachigkeit / Lokalisierung:** nicht aktiviert. Die Oberfläche ist in v1
> ausschließlich deutsch (Beachhead: deutschsprachige WGs und Wohnprojekte). Der Abschnitt
> wird bewusst leer gelassen statt künstlich gefüllt. **Zu beachten für v2:** Bewerbungstexte
> können in jeder Sprache eintreffen — der regelbasierte Paste-Parser ist auf deutsche
> Muster ausgelegt, und das ist eine bekannte Grenze, kein Fehler.

### 4.6 Inhaltsregeln für Freitext und Notizen

**Aktivierte optionale Sektion.** Dieser Abschnitt ist die produktseitige Antwort auf den
ersten Risikoposten aus `02-SRD.md` §7: *Flatmate.io erzeugt eine Auskunftspflicht, die der
WhatsApp-Status-quo nicht hatte.* Er ist keine Formatvorgabe, sondern eine
Risikominderung — und zugleich das, was die Notizen für Abwesende überhaupt brauchbar macht.

#### 4.6.1 Grundregeln

| # | Regel | Warum |
|---|-------|-------|
| **C-1** | **Kein leerer Kasten.** Jedes Freitextfeld für Beurteilungen wird durch **strukturierte Prompts** ersetzt | Ein leeres Feld lädt zur Charakterbeschreibung ein. Ein Prompt fragt nach Beobachtungen |
| **C-2** | **Prompts fragen nach Beobachtbarem, nicht nach Urteilen** | Beobachtbare Notizen sind rechtlich unproblematischer **und** für Abwesende nützlicher. Beide Ziele zeigen in dieselbe Richtung |
| **C-3** | **Sichtbarer Hinweis beim Schreiben: „Schreib so, als könnte die Person es lesen."** Nicht in einer Hilfeseite, nicht als einmaliger Dialog | Art. 15 erfasst auch subjektive Beurteilungen; der Hinweis ist ehrlich, nicht abschreckend gemeint |
| **C-4** | **Der Hinweis blockiert nichts.** Keine Inhaltsprüfung, keine Wortliste, keine Freigabe | Eine Prüfung wäre eine Bewertung von Text über Personen — Nähe zu P-5 — und würde falsch-positiv das Schreiben verhindern |
| **C-5** | **Keine einladenden Strukturfelder für besondere Kategorien nach Art. 9.** Kein Feld, keine Auswahl, kein Prompt zu Herkunft, Religion, Gesundheit, sexueller Orientierung, politischer oder gewerkschaftlicher Zugehörigkeit | Freitext-Bewerbungen enthalten solche Angaben unvermeidlich; das Produkt darf sie nicht **erfragen** und damit nicht strukturieren |
| **C-6** | **Freitext hat immer eine Frist.** Notizen und Bewerbungstexte unterliegen der 180-Tage-Aufbewahrung; es gibt keinen „dauerhaft aufbewahren"-Weg | Speicherbegrenzung ist der Löschgrund (§4.2.6) |
| **C-7** | **Jeder Freitext ist auskunftsfähig.** Notizen, Veto-Begründungen und Bewerbungstexte erscheinen in der Datenauskunft (S-34) | Wenn der Inhalt herausgegeben werden muss, muss das beim Schreiben bekannt sein — genau darum steht C-3 dort |
| **C-8** | **Kein Bewerber-Freitext an ein Modell** ohne Rechtsgrundlage und AVV — in v1 gar nicht (Parser sind regelbasiert), in v2 nur unter den Bedingungen aus E-15 | P-5 und `GUARDRAILS.md` |
| **C-9** | **Eine Gegendarstellung stirbt mit dem, worauf sie sich bezieht.** `subject_statement` erhält **keinen eigenen Aufbewahrungszeitgeber**, sondern erbt die Frist der `Application` und wird in **derselben Transaktion** gelöscht wie `Vote`s, `Veto`s und `CastingNote`s | Der Zweck der Gegendarstellung ist, die Beurteilungen zu **kontextualisieren**; fallen die weg, entfällt der Zweck (Art. 5 Abs. 1 lit. e) — die Person hat ihre eigene Fassung ohnehin. **Und die Reihenfolge ist gefährlich:** Bleibt die Gegendarstellung auch nur kurz übrig, steht dort ein Dokument der Form *„Ich widerspreche der Aussage, ich sei unpünktlich gewesen"* — **ohne** die Aussage. Das ist verräterischer als jedes der beiden Stücke allein, weil es den gelöschten Inhalt rekonstruierbar macht. Zwei getrennte Aufbewahrungsjobs würden genau dieses Fenster erzeugen |
| **C-10** *(neu, K-12/K-14/K-16)* | **Oberflächentexte dürfen werbend über den Prozess sprechen, nie wertend über die Person.** Die Grenze liegt nicht bei „nüchtern vs. lebendig", sondern zwischen **Prozess** und **Person**. Erlaubt: „Alle haben abgestimmt — ihr könnt jetzt entscheiden, wen ihr einladet" · „Die Castings sind gelaufen. Jetzt geht's um die Zusage" · „Lea hat die meisten Punkte bekommen". **Nie:** „3 vielversprechende Kandidaten" · „Lea passt gut zu euch" · „Wir empfehlen Lea". Jede Aussage über mehrere Kandidaten muss sich einer **tatsächlich existierenden** Schwelle zuordnen lassen (`quorum_share`, Favoriten-Budget, Veto-Budget, Rundenfrist) — keine erfundene „Eignungsschwelle" — und per Tippen nachrechenbar sein (P-3) | **P-5 verbietet dies nicht**, wie in V0.5 fälschlich angenommen: P-5 untersagt, dass **KI** Bewertungen, Rankings oder Empfehlungen über Personen erzeugt. Die Anwendung rankt zulässig — Score und Rangliste sind menschliche Stimmen nach offengelegten Regeln (E-07, S-12) —, und ein von Hand geschriebener Oberflächensatz ist ohnehin keine KI-Ausgabe. Vollständig hergeleitet in `07-Screen-Inventar.md` §7–8 |

#### 4.6.2 Notiz-Prompts für `CastingNote` (Vorschlag)

Gerichtet an Abwesende — das ist der Zweck (Schritt 8 der Belegkette):

| Prompt | Zweck |
|--------|-------|
| „Worüber habt ihr gesprochen?" | Gesprächsinhalt, für Abwesende der wichtigste Teil |
| „Was hat die Person über sich erzählt (Arbeit/Studium, Alltag, Vorstellungen vom Wohnen)?" | Sachinformation, die im Bewerbungstext meist fehlt |
| „Was ist offen geblieben oder unklar?" | Erzeugt die nützlichste Notizart und formuliert Zweifel als Frage statt als Urteil |
| „Gibt es etwas, das für die Abwesenden wichtig ist zu wissen?" | Auffangfeld — bewusst als Frage nach Information, nicht nach Eindruck |

Bewusst **nicht** vorgesehen: „Wie war der Gesamteindruck?", „Passt die Person zu uns?",
Sternebewertungen, Persönlichkeitsmerkmale als Auswahl. Der Gesamteindruck ist die
Abstimmung — dafür existiert die vierstufige Skala. Eine zweite, unstrukturierte
Eindrucksebene wäre die rechtlich heikelste und produktseitig unnötigste Verdopplung.

#### 4.6.3 Freitext an der `Application`

| Feld | Regel |
|------|-------|
| Bewerbungsnachricht | Beliebiger Text, wie eingegangen. **Nicht** in Kategorien zerlegt |
| Weitere Angaben | Freie Notizen zur Person (Hobbys, Alter, Kontext) ohne vorgegebene Kategorien — bewusst kein Kategoriensystem, damit nicht Art.-9-Merkmale strukturiert werden (C-5) |
| Veto-Begründung | Freitext, bei aktiver Begründungspflicht erforderlich. Trägt zusätzlich zum Hinweis nach C-3 den **Offenlegungshinweis** aus §4.1.10: „Diese Begründung kann der Person auf Auskunftsverlangen offengelegt werden — und lässt möglicherweise auf dich schließen." |
| `subject_statement` | Gegendarstellung der betroffenen Person am Datensatz (S-41). **Datenmodell in v1, Oberfläche in v1.1.** Sachlich die richtige Antwort auf Art. 16, weil sich eine subjektive Beurteilung nicht *berichtigen* lässt, man ihr aber eine Stellungnahme beistellen kann. Erscheint in der Datenauskunft (C-7); ändert oder löscht **keine** fremden `Vote`s, `Veto`s oder `CastingNote`s. **Aufbewahrung: siehe C-9 — kein eigener Zeitgeber, atomare Löschung** |

#### 4.6.4 Erinnerung ans Notizenschreiben (S-46)

Nach dem `Application`-Übergang `scheduled → interviewed` (Schritt 15 in §4.0.2) versendet
die Anwendung automatisch eine Erinnerungs-Notification (`casting.note_reminder_due`, S-46)
an alle `AppointmentAttendance`-Einträge mit `attended = true` — also an genau die Personen,
die beim Casting persönlich dabei waren und deshalb etwas für die Abwesenden festhalten
können. Der Text lehnt sich an die strukturierten Prompts aus §4.6.2 an (S-22), statt einen
neuen, unstrukturierten Aufruf zu formulieren:

> „Wie lief das Casting mit X? Schreib ein paar Sätze für alle, die nicht dabei waren."

**Selbst-Redaktion greift auch hier:** Ist die betreffende `Application` für die Empfängerin
oder den Empfänger selbst-redigiert (`became_resident_id` der Empfängerin/des Empfängers,
Invariante V-1, §4.2.5), wird an diese Person **keine** Erinnerung verschickt — dieselbe
Invariante, die ihr auch keine `CastingNote` zu dieser `Application` ausliefert, darf nicht
durch eine Erinnerungs-Notification unterlaufen werden, deren Betreff bereits preisgibt, dass
es um „ihr" Casting geht.

**Erfolgsmetrik:** Kein eigenes Telemetrie-Ereignis für den Trigger. Das bereits bestehende
`note_created` (§5.1) bleibt die Erfolgsmetrik — es misst, ob die Erinnerung tatsächlich zu
einer geschriebenen `CastingNote` führt.

**Akzeptanzkriterien §4.6.4**

- [ ] Der Übergang `scheduled → interviewed` löst für jeden `AppointmentAttendance`-Eintrag mit `attended = true` genau eine `casting.note_reminder_due`-Notification an das zugehörige `resident_profile_id` aus
- [ ] Der Text der Erinnerung nennt die gecastete Person und lehnt sich an die Prompts aus §4.6.2 an, statt einen unstrukturierten Eindrucksaufruf zu formulieren
- [ ] Ist die betroffene `Application` für die Empfängerin oder den Empfänger selbst-redigiert (`became_resident_id`, §4.2.5), wird an diese Person **keine** Erinnerung verschickt
- [ ] Ein `AppointmentAttendance`-Eintrag mit `attended = false` löst keine Erinnerung aus
- [ ] `note_created` (§5.1) bleibt die Erfolgsmetrik dieses Triggers; es wird kein separates Telemetrie-Ereignis für die Erinnerung selbst eingeführt

**Akzeptanzkriterien §4.6**

- [ ] Es existiert in der gesamten Anwendung kein leeres Freitextfeld für Beurteilungen ohne Prompt oder Hinweis
- [ ] Der Hinweis „schreib so, als könnte die Person es lesen" ist beim Schreiben von `CastingNote` und `Veto`-Begründung sichtbar
- [ ] Kein Prompt fragt nach einem Gesamteindruck, einer Eignung oder einer Persönlichkeitseinschätzung
- [ ] Es existiert kein Eingabefeld und keine Auswahl zu Herkunft, Religion, Gesundheit, sexueller Orientierung, politischer oder gewerkschaftlicher Zugehörigkeit
- [ ] Kein Freitextinhalt wird an ein Sprachmodell oder einen externen Dienst übermittelt (v1)
- [ ] Alle Freitextinhalte erscheinen in der Datenauskunft nach S-34
- [ ] Alle Freitextinhalte unterliegen der Aufbewahrungsfrist; es existiert keine Einstellung „dauerhaft aufbewahren"
- [ ] Der Hinweis verhindert kein Speichern und es findet keine Inhaltsprüfung statt
- [ ] **`subject_statement` hat kein eigenes Fristfeld und keinen eigenen Aufbewahrungsjob** — die Frist wird ausschließlich von der `Application` abgeleitet
- [ ] Beim Löschen einer `Application` verschwinden `Vote`s, `Veto`s, `CastingNote`s **und** `subject_statement` in **derselben Transaktion**; es existiert kein Zeitpunkt, an dem eine Gegendarstellung ohne ihre Bezugsdaten abrufbar ist
- [ ] Bricht die Löschtransaktion ab, bleibt der Zustand **vollständig unverändert** — kein Teillöschzustand, in dem die Beurteilungen weg und die Gegendarstellung noch da ist
- [ ] Eine Kürzung der Aufbewahrungsfrist (30/90/180) verkürzt die Frist der Gegendarstellung mit, ohne dass sie eigens angepasst werden muss
- [ ] **Neu (C-10):** Kein Oberflächentext über mehrere Kandidaten enthält ein Werturteil über eine Person („vielversprechend", „passt gut", „wir empfehlen") — geprüft gegen den Textkatalog aus `07-Screen-Inventar.md` §7–8
- [ ] Jede werbende Aussage über den Prozess lässt sich per Tippen einer tatsächlich existierenden Schwelle zuordnen (`quorum_share`, Favoriten-Budget, Veto-Budget, Rundenfrist) — keine Aussage beruft sich auf eine erfundene Schwelle

---

## 5. Datenerfassung

### 5.1 Telemetrie

Bewusst minimal, in der eigenen Datenhaltung, keine externen Analysedienste. Jedes Ereignis
dient genau einer Kennzahl aus `02-SRD.md` §6.

| Ereignis | Nutzlast | Bezug zur Kennzahl |
|----------|----------|--------------------|
| `round_started` | `round_id`, Anzahl Zimmer, Anzahl Teilnehmende | Nenner der Beteiligungsquote; Runden pro Haushalt und Jahr |
| `round_closed` | `round_id`, Dauer | Abgeschlossene / gestartete Runden |
| `vote_cast` | `round_stage`, Stufe, ob Änderung einer bestehenden `Vote` | **Kernmetrik Beteiligungsquote**; Medianzahl Stimmen pro Bewerbung |
| `resident_activated` | `household_id` | Aktivierte Bewohnende pro Haushalt — trennt „Onboarding kaputt" von „Abstimmen unattraktiv" |
| `application_created` | Erfassungsweg (`form` / `paste`) | Bewerbungen pro Runde; rechtfertigt den Paste-Parser |
| `parser_suggestion_corrected` | Art (`applicant` / `time_window`), Anzahl korrigierter Felder | Korrekturquote — entscheidet über die Dringlichkeit des KI-Parsings in v2 |
| `refinement_shown` | ausgelöst ja/nein, Anzahl „Unbedingt", Zimmerzahl | Prüft die Schwelle `ceil(Zimmer × 1,5)` |
| `veto_cast` | mit/ohne Begründung, anonym ja/nein | Anteil Runden mit mindestens einem `Veto` |
| `appointment_confirmed` | Herkunft (`solver` / `manual`) | Rechtfertigt den Solver — die teuerste Architekturentscheidung |
| `solver_infeasible` | relaxierter Constraint-Typ | Belegt, ob die Erklärbarkeit bei Unlösbarkeit trägt |
| `status_transition` | von, nach, Richtung (`forward` / `backward`) | Anzahl Rückwärtsübergänge je Runde — belegt oder widerlegt P-4 als Praxisbedarf |
| `note_created` | `application_id`, Anzahl gefüllter Prompts | Anteil Castings mit mindestens einer `CastingNote` (Notizkultur-Risiko) |
| `retention_extended` | `round_id`, Begründung vorhanden ja/nein | Anteil Runden mit Verlängerung — prüft die 180-Tage-Frist |
| `disclosure_generated` | `application_id` | Nutzung des Datenauskunft-Features |

**Akzeptanzkriterien §5.1**

- [ ] Kein Telemetrie-Ereignis enthält den Inhalt einer `CastingNote`, einer `Veto`-Begründung oder eines Bewerbungstexts
- [ ] Kein Telemetrie-Ereignis enthält den Namen einer bewerbenden Person
- [ ] `vote_cast` erlaubt die Berechnung der Beteiligungsquote je Runde, ohne die Stimme einer Person offenzulegen, für die verdeckte Ergebnisse gelten
- [ ] Telemetrie ist abschaltbar, ohne dass Kernfunktionen ausfallen
- [ ] Jedes Telemetriefeld ist in `data-inventory.yml` deklariert (S-37)

### 5.2 A/B-Testing

> ⚠️ **Nicht anwendbar in v1** — begründet in `02-SRD.md` §8.2: kein Traffic vor dem Launch,
> und eine Aufteilung *innerhalb* eines Haushalts würde das Abstimmungsverfahren
> beschädigen statt es zu messen. Zwei Einstellungen sind bewusst als bewusster Schalter
> statt als Experiment gebaut: verdeckte Ergebnisse (§4.2.3) und der zweite Durchlauf (§4.1.5).
> Ersatz sind die Metriken zweiter Ordnung und die Ein-Frage-Rückmeldung nach jeder Runde
> (`02-SRD.md` §8.1).

---

## 6. Nichtfunktionale Anforderungen

### 6.1 Leistung

- Start-Bildschirm interaktiv in **< 1,5 s** bei 60 `Application`s in der Runde
- Kartenwechsel im Screening-Durchlauf **< 150 ms** — der Durchlauf muss sich wie Blättern
  anfühlen, nicht wie Laden; die nächste Karte wird vorgeladen
- `Vote` speichern **< 300 ms** serverseitig; die Oberfläche quittiert optimistisch und
  macht bei Fehler sichtbar rückgängig
- Feasibility-Prüfung des Rasters **< 500 ms** für 10 Bewerbende × 7 Bewohnende × 1 Woche
- „Vorschlag berechnen": Zeitbudget **10 s**. Am Limit wird die **beste bis dahin gefundene
  zulässige Lösung** zurückgegeben und als „unter Zeitdruck gefunden, möglicherweise nicht
  optimal" gekennzeichnet; existiert keine zulässige Lösung, greift die
  Unlösbarkeits-Erklärung mit der festen Relaxationsreihenfolge H6 → H1 (§4.1.8).
  **Kein Pfad endet ohne Ergebnis und ohne Erklärung.** Bei der erwarteten Problemgröße
  liegt die Rechenzeit deutlich darunter; die Reserve trägt die Determinismus-Auflage
  „ein Worker" (ADR-005). Größenordnung der Grenzwerte: SRD O-06
- Zielgröße je Instanz: 200 `Household`s, 500 `CastingRound`s, 30 000 `Application`s ohne
  spürbaren Abfall

### 6.2 Ausfallsicherheit und Rückfallverhalten

| Ausfall | Verhalten |
|---------|-----------|
| **Solver nicht verfügbar** (Prozessstart fehlgeschlagen, kein Ergebnis) | Raster, Heatmap, Feasibility-Prüfung und manuelles Legen bleiben **voll nutzbar**. Nur „Vorschlag berechnen" ist deaktiviert, mit Begründung und Wiederholung. Die Terminfindung darf nie am Solver hängen (SRD §7) |
| **Solver erreicht das Zeitbudget** | **Kein Ausfall, sondern ein gekennzeichnetes Ergebnis:** beste gefundene zulässige Lösung mit dem Vermerk „unter Zeitdruck gefunden, möglicherweise nicht optimal". Ohne zulässige Lösung: Unlösbarkeits-Erklärung mit fester Relaxationsreihenfolge. Nie ein stiller Fehlschlag, nie eine leere Antwort |
| **Verbindungsverlust im Screening-Durchlauf** | Abgegebene `Vote`s werden lokal gepuffert und nachgesendet; sichtbarer Offline-Hinweis. Keine Stimme geht verloren — höchste Priorität, weil ein verlorener Stimmabgabe-Versuch direkt die Kernmetrik trifft. Der Sendepuffer ist die **einzige benannte Ausnahme** von der Regel in der folgenden Zeile; seine vier erzwungenen Eigenschaften stehen darunter |
| **Offline-Fähigkeit hat eine harte Grenze** | **Der Service Worker cacht ausschließlich die App-Hülle** — Markup, Skripte, Stile, Icons. **Niemals** Bewerber- oder Beratungsdaten. „Offline" heißt: *die App startet ohne Netz* und zeigt einen erklärenden Zustand — **nicht**: *die Daten sind ohne Netz da*.<br>**Warum das eine Datenschutzanforderung und keine Optimierung ist:** Ein Cache mit `Application`-Daten legt personenbezogene Daten auf die Geräte der Bewohnenden — **außerhalb der Reichweite der 180-Tage-Löschautomatik**. Ein Löschjob auf dem Server erreicht keinen Gerätecache; was dort liegt, erscheint in keiner Datenauskunft und überlebt jede Fristkürzung. Der wahrscheinliche Implementierungsfehler ist ein großzügiger Runtime-Cache, der API-Antworten „für die Performance" mitnimmt (S-30, ADR-011, § 25 TDDDG) |
| **Der Sendepuffer für `Vote`s — die benannte, begrenzte Ausnahme** | Der Puffer ist **keine gespeicherte Kopie, sondern eine noch nicht abgeschlossene Transaktion**: die Nutzlast einer Handlung, die die Person selbst ausgelöst hat und die noch läuft. § 25 TDDDG deckt genau das als „unbedingt erforderlich für den ausdrücklich gewünschten Dienst" — und **stärker** als das Caching der App-Hülle, weil hier eine konkret angeforderte Aktion sonst verlorengeht.<br>**Verworfene Begründung — bewusst dokumentiert, nicht gestrichen:** Diese Ausnahme stand zunächst auf dem Argument *„es ist kein fremdes Datum betroffen, nur die eigene Stimme"*. Das ist **falsch**: Eine `Vote` besteht aus `application_id` plus Wert und ist damit ihrem Wesen nach eine **Beurteilung über eine dritte Person** — eine Stimme ist immer über jemand anderen. Der Satz bleibt hier stehen, weil eine Entscheidung, die aus dem falschen Grund richtig ist, brüchig bleibt: Wer „keine fremden Daten betroffen" als tragendes Argument liest, **erweitert die Ausnahme per Analogie** und hält als nächstes einen lokalen Notizentwurf für ebenso unproblematisch — und der ist es nicht. Die Ausnahme trägt allein deshalb, weil der Puffer den Versand **nicht überleben kann** — und das muss eine erzwungene Eigenschaft sein, keine Erwartung. Vier Zusicherungen:<br>**(1) Harte Höchstlebensdauer von 7 Tagen**, unabhängig vom Versanderfolg. Danach wird der Eintrag verworfen und die Person informiert („deine Stimme zu … konnte nicht gesendet werden"). Ohne diese Grenze trägt ein Gerät, das offline geht und Monate später zurückkommt, eine Beurteilung über eine Bewerbung, deren Daten serverseitig längst gelöscht sind — **dasselbe Leck durch die Hintertür**.<br>**(2) Keine Anzeigedaten:** nur `application_id`, Wert und Rundenstufe. **Kein Name, kein Profiltext, keine denormalisierte Karte.** Sobald der Puffer speichert, *wem* die Stimme galt, um es anzeigen zu können, ist er eine Datenkopie und keine Warteschlange mehr — und das ist die naheliegendste Bequemlichkeit, die die ganze Konstruktion kippt.<br>**(3) Verwerfen statt Wiederholen bei Ablehnung:** Wurde die `Application` oder die `CastingRound` inzwischen serverseitig gelöscht, lehnt der Server ab und der Client verwirft **still**. Kein Wiederholungsversuch; in der Meldung erscheint kein Bewerbername, weil er dem Client nach (2) nicht bekannt ist.<br>**(4) Leerung bei Abmeldung und Sitzungsentzug** — die WG-Realität ist ein geteilter Laptop im Wohnzimmer |
| **Kein Web Push zustellbar** (keine aktive `PushSubscription` für das Profil) | **E-Mail ist jetzt selbst der Rückfall, nicht mehr der Primärkanal.** Kanalreihenfolge: Web Push → E-Mail-Fallback → nur In-App. Die Fallback-E-Mail trägt zusätzlich den Installations-Nudge (§4.1.13), damit der Rückfall selten bleibt |
| **E-Mail-Versand (als Fallback) fehlgeschlagen** | **In-App-`Notification` ist die letzte Ebene** und bleibt unberührt; Fehler wird protokolliert und dem Moderator angezeigt. Keine Wiederholung, die eine Beratungsinhalt-Mail an die falsche Adresse riskiert |
| **Löschlauf fehlgeschlagen** | Kein stiller Fehlschlag: Es wird protokolliert und beim nächsten Lauf nachgeholt. Die ausgebliebene Vorwarnung ist das erkennbare Signal (§4.2.6) |
| **Parser liefert Unsinn** | Kein Fehlerzustand — Formular mit dem Rohtext, Vorschläge verworfen. Der Parser darf nie ein Speichern verhindern |
| **Policy-Prüfung nicht auflösbar** | **Zugriff verweigern, nicht gewähren.** Fehler beim Auflösen des Sichtbarkeitskontexts führt zu leerem Ergebnis mit Erklärung, nie zu ungefiltertem Inhalt |

### 6.3 Barrierefreiheit

- Die vier Abstimmungsstufen nie allein über Farbe: Symbol **und** Text, in jeder Ansicht
- Der gestapelte 4-Farben-Stimmungsbalken hat eine vollständige textliche Entsprechung
  („2× Unbedingt, 3× Finde gut, 1× Eher nicht, 0× Nein") und ist für Screenreader erfasst
- Screening-Durchlauf, zweiter Durchlauf und Runde 2 vollständig per Tastatur bedienbar
- Kontrastverhältnis ≥ 4,5:1; durchgängig sichtbarer Fokusindikator
- Ziele für Fingerbedienung mindestens 44 × 44 px — die Stimmabgabe findet einhändig statt
- Heatmap-Werte im Verfügbarkeitsraster zusätzlich als Zahl, nicht nur als Farbintensität
- Statusänderungen und Speicherquittungen als `aria-live="polite"`
- Fehler- und Leerzustände nennen den Grund im Text, nicht über ein Symbol allein

### 6.4 SEO

**Weitgehend irrelevant und bewusst nicht künstlich gefüllt.** Die Anwendung liegt
vollständig hinter der Anmeldung; es gibt keine öffentlich indexierbare Inhaltsseite und
ausdrücklich kein Interesse an der Indexierung von Bewerberdaten. Zwei Anforderungen bleiben:

- Die öffentliche Startseite (Erklärung, Spendenhinweis, Datenschutzerklärung) ist
  indexierbar und beschreibt die Anwendung
- **Alle** angemeldeten Bereiche sowie die Token-Seite für Verfügbarkeiten (v1.1) sind von
  der Indexierung ausgeschlossen — das ist keine SEO-Maßnahme, sondern eine
  Datenschutzanforderung

### 6.5 Sicherheit und Datenschutz

- **Autorisierung ausschließlich serverseitig und zweifach:** zentrale Policy-Objekte plus
  Row-Level-Security in der Datenhaltung. Jede Abfrage prüft `Household`-Zugehörigkeit,
  `RoundParticipation` und die Selbst-Redaktion (ADR-004, S-36)
- **Verdeckte Werte werden nicht ausgeliefert**, nicht clientseitig ausgeblendet
- Passwörter mit einem starken, speicherharten Verfahren gehasht; Ratenbegrenzung bei
  Anmeldung und Beitrittscode-Eingabe
- Beitrittscode widerrufbar; die Token-Seite für Verfügbarkeiten (v1.1) trägt ein
  ablaufendes Token, sammelt **keine** weiteren Daten und trägt den Art.-13-Hinweis
- Freitext wird bei der Darstellung strikt bereinigt (kein rohes HTML)
- Nur eine unbedingt erforderliche Sitzungs-Cookie; **kein Geräte-Fingerprinting**
  (§ 25 TDDDG, E-06)
- **Keine personenbezogenen Daten im Gerätespeicher:** Der Service Worker cacht ausschließlich
  die App-Hülle; `Application`-, `Vote`-, `Veto`- und `CastingNote`-Daten werden **nie**
  persistent auf dem Gerät abgelegt. Grund: Was auf dem Gerät liegt, erreicht die
  Löschautomatik nicht (§6.2, S-30)
- **Einzige Ausnahme: der Sendepuffer für noch nicht übertragene `Vote`s** — begründet als
  **unabgeschlossene Transaktion** im Sinne des ausdrücklich gewünschten Dienstes (§ 25 TDDDG).
  Die **verworfene Begründung** „kein fremdes Datum betroffen" ist in §6.2 ausdrücklich als
  solche dokumentiert, damit die Ausnahme nicht per Analogie aus ihr erweitert wird. Gebunden
  an vier erzwungene Eigenschaften: Höchstlebensdauer 7 Tage, keine Anzeigedaten, Verwerfen
  statt Wiederholen bei serverseitiger Ablehnung, Leerung bei Abmeldung (§6.2). Die Ausnahme
  ist als solche auch in ADR-011 zu vermerken, damit die Dokumente sich nicht widersprechen
- Datenhaltung und Verarbeitung in der EU (ADR-006); kein Freitext an externe Dienste
- **Keine echten Personendaten** in Tests, Seeds oder Fixtures (`GUARDRAILS.md`)
- **Geschützte Tests**, die nicht gelöscht oder abgeschwächt werden dürfen: die
  Selbst-Redaktions-Invariante über alle Ausgabekanäle, die Quorum-Berechnung, die
  Zustandsübergangstabelle und der Solver-Determinismus

**Akzeptanzkriterien §6.5 — Sichtbarkeitsinvariante (geschützte Prüfungen)**

- [ ] Ruft Profil A die API-Antwort einer `Application` mit `became_resident_id == A` ab, enthält die Antwort kein `Vote`-Objekt, kein Aggregat, keinen Score, keinen Rangplatz, keine `Veto`-Angabe und keine `CastingNote` — geprüft auf der API-Ebene, nicht in der Oberfläche
- [ ] Dieselbe Prüfung besteht bei `open`, bei `closed` und bei wiedereröffneter Runde
- [ ] Dieselbe Prüfung besteht für die Rangliste (die `Application` fehlt vollständig), den Abschnitt „Warten auf Stimmen", jede Sortierung und jede Zählung
- [ ] Dieselbe Prüfung besteht **kanalneutral**: bei E-Mail für Betreff, Vorschautext und Inhalt, beim Web-Push-Payload für Titel und Body (kein „Betreff", aber dieselbe Prüfpflicht) — sowie für den Digest
- [ ] Dieselbe Prüfung besteht für den `ActivityEvent`-Feed und für jeden Export
- [ ] Wird die Bedingung in der Anwendungsschicht künstlich entfernt, liefert die Datenhaltung dennoch keine Zeilen (Row-Level-Security als zweite Schicht)
- [ ] Profil A eines Haushalts erhält unter keiner Abfrage Daten eines anderen `Household`s — auch wenn die Anwendungsschicht die Bedingung auslässt
- [ ] Ein Profil ohne `RoundParticipation` erhält für diese Runde keine Daten
- [ ] Ein `moved_out`-Profil erhält für keine Runde Daten
- [ ] **Mehrfachbewerbung (S-40, geschützte Prüfung):** Existieren zwei `Application`s derselben Person aus verschiedenen Runden und sind **beide** über `became_resident_id` mit ihrem `ResidentProfile` verknüpft, liefert **keine** von beiden Beratungsinhalte an dieses Profil — geprüft auf API-Ebene für Rangliste, Einzelansicht, Feed, `Notification` und Export
- [ ] Ist nur die neuere `Application` verknüpft, dokumentiert der Test die Lücke der älteren ausdrücklich als **erwartetes Verhalten des Datenmodells** — und belegt damit, dass die Zuordnungs-Aktion aus §4.1.7 der einzige Schutz ist. Der Test darf nicht so umgeschrieben werden, dass die Lücke unsichtbar wird
- [ ] Beim Anlegen eines `ResidentProfile` aus einer `Application` wird der Hinweis auf frühere Bewerbungen erzeugt — geprüft als eigener Testfall, nicht nur visuell

**Akzeptanzkriterien §6.5 — Quorum und Zustandsübergänge (geschützte Prüfungen)**

- [ ] Zähler und Nenner der Quorum-Anzeige enthalten keine `moved_out`-Profile und keine Profile ohne `RoundParticipation`
- [ ] Nach `moved_out` eines Profils sinken Zähler und Nenner offener Runden um jeweils 1, und der **Score bleibt in offenen wie abgeschlossenen Runden unverändert**
- [ ] Bei `Nenner = 7` liegt die Schwelle bei `ceil(0,5 × 7) = 4`; bei `Nenner = 6` bei `3` — also genau die Hälfte, nicht mehr als die Hälfte
- [ ] Kein Zustandsübergang wird durch ein nicht erreichtes Quorum verhindert
- [ ] Ein Übergang, der nicht in der Übergangstabelle deklariert ist, wird serverseitig abgelehnt
- [ ] Jeder deklarierte Rückwärtsübergang ist ausführbar und erzeugt einen `ActivityEvent` mit Ausgangs- und Zielzustand
- [ ] `moved_in → offer_made` ist ausführbar, ohne `became_resident_id` zu löschen
- [ ] Nach einem Rückwärtsübergang aus `moved_in` bleibt die Selbst-Redaktion für das betroffene Profil wirksam
- [ ] Zwei Solver-Aufrufe mit identischer Eingabe liefern identische Ergebnisse

**Akzeptanzkriterien §6.5 — Gerätespeicher (geschützte Prüfungen)**

- [ ] Die Cache-Liste des Service Workers enthält ausschließlich statische Hüllen-Ressourcen (Markup, Skripte, Stile, Icons) und **kein** API-Muster
- [ ] Es existiert **keine** Runtime-Caching-Regel, die Antworten von Datenendpunkten speichert — auch nicht mit kurzer Gültigkeitsdauer und auch nicht „nur als Fallback"
- [ ] Nach dem Laden einer Runde, anschließendem Trennen der Verbindung und Neustart der App sind im Gerätespeicher (Cache Storage, IndexedDB, Local Storage) **keine** Bewerber- oder Beratungsdaten auffindbar
- [ ] Der Sendepuffer enthält ausschließlich die eigenen, noch nicht gesendeten `Vote`s und ist nach erfolgreichem Nachsenden leer
- [ ] Ein Löschlauf auf dem Server führt zu keiner Inkonsistenz auf dem Gerät, weil dort keine zu löschenden Daten liegen

**Akzeptanzkriterien §6.5 — Sendepuffer (die benannte Ausnahme, geschützte Prüfungen)**

- [ ] **Höchstlebensdauer:** Ein Puffereintrag wird **spätestens 7 Tage** nach seiner Entstehung verworfen — unabhängig davon, ob ein Versand versucht wurde, fehlschlug oder nie möglich war
- [ ] Die Höchstlebensdauer greift auch dann, wenn das Gerät zwischenzeitlich nie online war; sie hängt an der Entstehungszeit des Eintrags, nicht an einem Versandversuch

> **Diese eine Zusicherung trägt die gesamte Ausnahme.** Ohne erzwungenes Höchstalter ist
> „Sekunden bis Minuten" eine Erwartung, und ein Gerät, das nach Monaten zurückkommt,
> transportiert eine Beurteilung über eine Bewerbung, deren Daten serverseitig längst gelöscht
> sind — genau das Leck, das die Service-Worker-Regel schließen soll. Die **Höchstlebensdauer
> gehört daher als maschinell erzwingbare Regel nach `GUARDRAILS.md`** und nicht nur in dieses
> Dokument. Die drei übrigen Zusicherungen begrenzen den Schaden; diese verhindert ihn.
- [ ] Wird ein Eintrag wegen Zeitablaufs verworfen, wird die Person darüber informiert („deine Stimme zu … konnte nicht gesendet werden")
- [ ] Ein Puffereintrag enthält ausschließlich `application_id`, Wert und Rundenstufe — **kein** Name, **kein** Profiltext, **keine** denormalisierten Anzeigedaten
- [ ] Kein Text in der Anwendung, der auf einen ausstehenden Puffereintrag hinweist, nennt einen Bewerbernamen — er ist dem Client nicht bekannt
- [ ] Lehnt der Server einen Puffereintrag ab (`Application` oder `CastingRound` inzwischen gelöscht), verwirft der Client ihn **ohne Wiederholungsversuch**
- [ ] Bei Abmeldung und bei Sitzungsentzug wird der Puffer vollständig geleert — geprüft auf einem Gerät mit zwei aufeinanderfolgenden Anmeldungen verschiedener Profile
- [ ] Der Puffer ist die **einzige** Stelle, an der eine `Vote` auf dem Gerät liegt; es existiert kein zweiter lokaler Speicher für Abstimmungsdaten

---

## 7. Auslieferungsstrategie

### 7.1 Phasenschnitt

Übernommen aus `02-SRD.md` §5.4 — hier nicht neu geschnitten:

| Stufe | Inhalt | Vorführbar als |
|-------|--------|----------------|
| **v1** | S-01 bis S-40 sowie das **Datenmodell** von S-41 (inkl. `Application.collected_from`, Absatzverwerfung, Zuordnung früherer Bewerbungen, Datenmodell des Verfügbarkeits-Tokens), dazu **S-42** (Einladungstoken bei `moved_in`) · **S-44** (weiche Rundenfrist) · **S-45** (PWA-Install-Hinweis, Web Push jetzt v1 statt v1.1) · **S-46** (Erinnerungs-Notification nach Casting-Termin) · **ergänzt aus dem UX-Nachzug: S-47** (zweiter Durchlauf statt Feinschliff-Screen) · **S-48** (Aufgabenmodell mit Vorrangregel) · **S-49** (Einladungslink absichern: Warnhinweis, Ablauf, Nutzungsgrenze) · **S-50** (Verwaltung ohne Bewohnerprofil erreicht keine Castings) · **S-51** (Anwesenheit angenommen statt erfasst, inkl. Absage einzelner Personen) | „Ein echter Haushalt führt eine vollständige Runde von der ersten `Application` bis `moved_in` durch, ohne nach WhatsApp auszuweichen" |
| **v1.1** | **Bewerberseitige Token-Seite** für Verfügbarkeiten (Datenmodell liegt bereits in v1 — SRD O-08, Nutzerentscheidung, ob vorgezogen) · **Oberfläche für `subject_statement`** (S-41) · Punkte-Budget als Option · Textbausteine · **S-43** einmalige Spenden-E-Mail an die Household-E-Mail nach der 3.–4. abgeschlossenen `CastingRound` (löst O-05) | „Der Komfort kommt nach" — jedes Feature ist eine Bequemlichkeit über einem vollständigen manuellen Pfad (P-1). Ausnahme mit eigener Begründung: `subject_statement` ist kein Komfort, sondern ein Betroffenenrecht, dessen Datenmodell deshalb bereits in v1 steht |
| **v1.2** | Nutzerinitiierte Browser-Extension für Portal-Import | „Erfassungsarbeit sinkt, ohne API und ohne Scraping" |
| **v2** | Kalender-Sync · KI-Parsing (nur Extraktion, P-5) · Vermieter-Persona **nach** AGG- und AI-Act-Prüfung · Freemium | Produktoption |

### 7.2 Abhängigkeiten und Reihenfolge innerhalb von v1

Nach Abhängigkeit geordnet, nicht nach Attraktivität:

1. **Autorisierungsschicht und Row-Level-Security** (S-36) — blockiert alles, weil jede
   Abfrage sie voraussetzt
2. **Datenbestandsverzeichnis mit CI-Gate** (S-37) — muss vor der ersten personenbezogenen
   Spalte stehen, sonst wird es nie nachgezogen
3. **Zustandsmaschine und Übergangstabelle** (S-15) — bestimmt die Datenstruktur
4. **Identität und Onboarding** (S-01 bis S-05)
5. **`CastingRound`, `Room`, `RoundParticipation`** (S-06, S-07)
6. **`Application`-Erfassung** (S-08)
7. **`Vote`, Score, Quorum, Selbst-Redaktion** (S-09 bis S-14, S-31, S-32) — die
   Selbst-Redaktion entsteht **mit** den Stimmen, nicht danach
8. **`ActivityEvent`-Log** (S-27) — vor den Benachrichtigungen, weil es sie speist
9. **Pipeline-Oberfläche** (S-15, S-16)
10. **Verfügbarkeiten, Raster, Feasibility** (S-17, S-18) — solverfrei nutzbar
11. **Solver-Port, Vorschlag, Erklärbarkeit** (S-19, S-20)
12. **Slot-Reaktionen, `Appointment`, Kalender** (S-21, S-26)
13. **`CastingNote`s** (S-22)
14. **Runde 2 und `Veto`** (S-23, S-24, S-25)
15. **`Notification` und Digest** (S-28, S-29)
16. **PWA** (S-30)
17. **Aufbewahrungsautomatik und Datenauskunft** (S-33, S-34)

**Zwei Reihenfolgeentscheidungen, die begründet werden müssen:** Punkte 1 und 2 stehen vor
allem Fachlichen, obwohl sie nichts Sichtbares liefern. Grund ist das
AI-Implementierungsrisiko aus `02-SRD.md` §7: nachträglich eingezogen müsste jede
bestehende Abfrage angefasst werden, und genau dort entsteht die vergessene Bedingung. Die
Aufbewahrungsautomatik (17) steht am Ende, weil sie erst mit echten Daten prüfbar ist —
nicht weil sie optional wäre.

### 7.3 Freigabe

- Auslieferung als versionierte Fassung, Rücknahme durch Zurücksetzen auf die vorherige
- Datenbankmigrationen **additiv und rückwärtskompatibel**; destruktive Migrationen nur mit
  menschlicher Freigabe (`GUARDRAILS.md`)
- Kein Stufenrollout in v1 — es gibt zu wenige Haushalte, damit er etwas bedeuten würde
- **Freigabebedingungen für v1** (alle müssen erfüllt sein):
  - [ ] Alle Akzeptanzkriterien aus §6.5 (Sichtbarkeitsinvariante, Quorum,
        Zustandsübergänge, Solver-Determinismus) sind als automatisierte, geschützte Tests
        vorhanden und grün
  - [ ] Jede personenbezogene Spalte ist in `data-inventory.yml` deklariert; das CI-Gate ist
        aktiv
  - [ ] Eine vollständige Runde ist auf Testdaten von `new` bis `moved_in` und einmal
        vollständig rückwärts durchlaufen
  - [ ] Die Löschautomatik ist mit verkürzter Frist einmal echt durchlaufen, einschließlich
        Vorwarnung und protokollierter Verlängerung — und einmal mit „archivieren", wobei die
        Löschung nach Ablauf **trotzdem** stattgefunden hat
  - [ ] Der Mehrfachbewerbungs-Fall (S-40) ist auf Testdaten durchlaufen: zwei
        `Application`s derselben Person, Zuordnung über die Aktion, danach kein
        Beratungsinhalt aus der älteren
  - [ ] Der Gerätespeicher ist nach dem Laden einer Runde und Trennen der Verbindung
        auf Bewerber- und Beratungsdaten geprüft und leer (§6.5)
  - [ ] „Datenauskunft erzeugen" ist an einer Bewerbung mit Stimmen, Veto und Notizen erprobt
  - [ ] Click-Through-AVV, TOM-Liste und Datenschutzerklärung liegen vor
        (`06-Compliance-Anhang.md`)
  - [ ] Die Baseline-Erhebung im Testhaushalt (`02-SRD.md` §8.3) ist **vor** dem ersten
        Einsatz durchgeführt

---

## 8. Offene Punkte

| # | Punkt | Warum wichtig | Vorschlag / Zuständigkeit |
|---|-------|---------------|---------------------------|
| ~~SRD O-01~~ | ~~Quorum-Schwelle~~ | — | **Entschieden (§4.2.4):** `quorum_share = 0,5`, konfigurierbar; Schwelle `ceil(0,5 × Nenner)` = **mindestens die Hälfte** (bei 7 → 4, bei 6 → 3). Wirkung ausschließlich als Anzeige. Eine höhere Schwelle wurde ausgeschlagen, weil eine anfangs leere Rangliste die Beteiligung dämpft, die sie voraussetzt |
| ~~SRD O-04~~ | ~~Parallele Runden~~ | — | **Hier entschieden (§4.2.2):** technisch erlaubt, in v1 in der Oberfläche nicht angeboten |
| ~~P-O-01~~ | ~~Identitätsfeststellung bei Wiederbewerbung~~ | — | **Geschlossen:** manuelle Zuordnung durch den Moderator über die Aktion „diese frühere Bewerbung derselben Person zuordnen" (§4.1.7), plus Hinweis beim Anlegen eines `ResidentProfile` aus einer `Application`. **Kein** automatischer Abgleich. Als **S-40** in `02-SRD.md` aufgenommen und mit eigenem Risikoposten versehen, weil die Invariante ohne diesen Schritt nur verknüpfte Bewerbungen schützt |
| ~~P-O-02~~ | ~~Umfang der Datenauskunft bei Art. 15 Abs. 4~~ | — | **Geschlossen (§4.3):** Der **Inhalt wird offengelegt** — er ist personenbezogenes Datum der betroffenen Person, und Abs. 4 schützt die *Identität* der bewertenden Person, nicht den Inhalt. Namen der bewertenden Personen werden nicht ausgegeben. Dass eine Begründung in einer kleinen WG faktisch auf ihre Urheberin schließen lässt, ist kein Grund zurückzuhalten, sondern ein Grund, **vorher zu warnen** → Offenlegungshinweis beim Schreiben der `Veto`-Begründung (§4.1.10). Nicht mehr an `06-Compliance-Anhang.md` delegiert |
| ~~P-O-03~~ | ~~Mehrere `moved_in` auf dasselbe `Room`~~ | — | **Geschlossen in `04-Domaenenmodell.md`** (I-8 bis I-10): Die Room-Kopplung ist dort geregelt, `not_available` wird bei anhängender Bewerbung **abgelehnt** statt kaskadiert |
| **P-O-04** | Wortlaut aller Hinweistexte (Selbst-Redaktion, Anonymitätshinweis, „Verwaltung", Copy-Paste-Datenschutzhinweis) | Diese Texte sind das Produkt, nicht Beiwerk — sie tragen die Ehrlichkeitszusage aus `02-SRD.md` §10 | Nach dem Screen-Inventar, dann als Textkatalog. Der Copy-Paste-Datenschutzhinweis ist mit `06-Compliance-Anhang.md` abzustimmen. **Ergänzt um C-10** (Prozess-vs-Person-Grenze, §4.6) — derselbe Textkatalog deckt jetzt auch die werbenden Prozess-Sätze ab |
| ~~P-O-05~~ | ~~Verhalten des Screening-Durchlaufs, wenn während des Durchlaufs neue `Application`s eintreffen~~ | — | **Geschlossen (Screen-Inventar §2, S-48):** Der Durchlauf arbeitet auf der beim Start festgehaltenen Menge; neu eintreffende Bewerbungen erscheinen erst beim nächsten Öffnen als neue Aufgabe (T-5) auf dem Start-Bildschirm (§4.1.2) — nicht mehr „Rundenkopf" |
| **P-O-06** | Grenzwerte des Solvers — ab welcher Problemgröße greift das 10-s-Budget regelmäßig? (auch SRD O-06) | Bestimmt, ob das Budget in der Praxis die Ausnahme oder der Normalfall ist | **Das Abbruchverhalten ist geklärt** (§4.1.8, §6.1, §6.2: beste zulässige Lösung, gekennzeichnet; sonst Unlösbarkeits-Erklärung). Offen bleibt allein die Größenordnung → `05-ADRs.md` (ADR-005) |
| **P-O-07** | Wird die bewerberseitige Token-Seite für Verfügbarkeiten aus v1.1 nach v1 vorgezogen? (= SRD O-08) | Der `00-Session-Brief.md` ist hier in sich inkonsistent: Entscheidungsteil führt die hybride Erfassung als v1, die Phasentabelle stellt den Link nach v1.1 | **Auflösung ohne Nacharbeit unter beiden Lesarten:** Datenmodell in v1, Seite in v1.1 (§4.1.8, §7.1). Die manuelle Eingabe ist v1 und vollwertig — P-1 verlangt sie ohnehin. **Nutzerentscheidung** |
| **P-O-08** *(neu, aus dem UX-Nachzug)* | Dauer der „auf diesem Gerät angemeldet bleiben"-Sitzung (§4.1.1) | Ohne obligatorische E-Mail ist diese Sitzung für viele Profile der einzige dauerhafte Zugang | Vorschlag aus dem Plan: 90 Tage mit gleitender Verlängerung; endet bei Passwortwechsel und bei `moved_out`. Bei der Umsetzung zu bestätigen; Feldmodellierung (`Session`) liegt bei `04-Domaenenmodell.md` |
| **P-O-09** *(neu, aus dem UX-Nachzug)* | Wer setzt und verlängert `CastingRound.phase_deadline_at` (S-44), und gibt es eine Voreinstellung? | Bestimmt direkt die Sortierung des Start-Bildschirms (§4.1.2, Screen-Inventar §2) | Vorschlag: die moderierende Person, **ohne Voreinstellung** — eine automatisch gesetzte Frist wäre eine Erwartung, die niemand vereinbart hat. Fehlt die Frist, fällt die Aufgabe in die feste Reihenfolge zurück |

---

## 9. Verantwortungsmatrix

Bei Solo-Entwicklung trägt eine Person alle Rollen — die Spalten benennen die Perspektive,
die beim Prüfen des jeweiligen Abschnitts einzunehmen ist.

| Abschnitt | Produkt | Design | Entwicklung | Compliance |
|-----------|:-------:|:------:|:-----------:|:----------:|
| 2. Hintergrund | **R** | C | I | I |
| 3. Überblick | **R** | C | C | I |
| 4.0.1 Nutzergruppen | **R** | C | C | C |
| 4.0.2 Nutzerflüsse | **R** | **R** | C | I |
| 4.1 Frontend | C | **R** | C | I |
| 4.2 Daten- und Geschäftslogik | **R** | I | **R** | C |
| 4.3 Verwaltung / Compliance-Werkzeuge | **R** | C | C | **R** |
| 4.4 Backend | C | I | **R** | C |
| 4.6 Inhaltsregeln | **R** | C | I | **R** |
| 5. Datenerfassung | **R** | I | C | C |
| 6.1 Leistung | C | C | **R** | I |
| 6.2 Ausfall / Rückfall | C | C | **R** | I |
| 6.3 Barrierefreiheit | C | **R** | C | I |
| 6.4 SEO | **R** | I | C | C |
| 6.5 Sicherheit und Datenschutz | I | I | **R** | **R** |
| 7. Auslieferung | **R** | I | C | C |

R = verantwortlich · C = mitprüfend · I = informiert

---

## 10. Nächster Schritt

→ **`04-Domaenenmodell.md`** (verbindliche Feld- und Zustandsnamen, drei Zustandsmaschinen,
Sichtbarkeitsregeln als Prädikate, Rangberechnung und Termin-Kostenmodell als Pseudocode)
und **`05-ADRs.md`** (ADR-001 bis ADR-012) · **`06-Compliance-Anhang.md`** (Rollenanalyse,
Art.-13/14/15-Abgrenzung, Datenkategorien mit Rechtsgrundlage und Frist, Betroffenenrechte,
offene Rechtsfragen) · **`GUARDRAILS.md`** (maschinell durchsetzbare Regeln gegen
AI-Implementierungsrisiken) · **`review-log.md`** (Querprüfung der Kette:
PRD-Feature → SRD-Scope-Zeile → Problem-Framing-Feld).

**`07-Screen-Inventar.md`** ist bereits erstellt (V0.1) und dieser Nachzug setzt seine
Entscheidungen um (U-1…U-26) — kein Mockup in v1 (U-8).
