# Flatmate.io — Korrekturrunde nach dem Prototyp-Test

Ich habe alle sechs Abschnitte verstanden und arbeite sie in genau deiner Reihenfolge ab.
Zuerst die Punkte, wo das Repo widerspricht.

## Konflikte mit dem Repo (Repo gewinnt, bitte entscheide)

1. **Einladungslink / Beitrittscode (Abschnitt 2 + 5).** `backlog/README.md` listet
   „Round 2, `Veto`, the offer, move-in, **invite token**" ausdrücklich unter *"What is
   deliberately NOT in the MVP"* → v0.2. Auch Risiko **R3** rechnet damit, dass der reguläre
   Pfad (Invite-Token, S-42) erst in v0.2 kommt, und nennt den offenen `/auth`-Beitritt einen
   *bekannten* Kompromiss für synthetische Daten.
   → Vorschlag: ich baue ihn trotzdem, aber als bewusstes Vorziehen von S-40/S-42. Sag Bescheid,
   wenn er stattdessen draußen bleiben soll.
2. **Favoriten-Budget in den Regeln (Abschnitt 5).** ADR-008 stellt das Budget
   (`ceil(offene Zimmer × 1,5)`) auf, aber der Feinschliff-Screen ist v0.2 und der Backlog
   streicht „Second pass over your own Must-have cards". Ich nehme den **Wert** in die
   Regeln-Seite auf (gespeichert, im Rundensnapshot eingefroren), baue aber **keinen**
   Feinschliff-Screen.
3. **Kein Konflikt, nur Bestätigung:** Alle Copy-Texte (Einladung, Drittquellen-Hinweis) bleiben
   reiner Kopiertext ohne Sende-Knopf — das deckt sich mit P-1 (manueller Pfad zuerst) und
   P-5 (die App urteilt und schreibt nie selbst über Menschen).

## 1) Zugriffsrechte (zuerst)

- WG-Konto serverseitig wie „ehemalige Bewohner:in" behandeln: `getHome`, `getDeck`,
  `getRanking` liefern `round: null` und leere Listen, `castVote` wird abgelehnt. Die
  Round-Nutzlast (Settings, Quorum, Gewichte, Zimmer) verlässt den Server gar nicht erst.
- Navigation auf zwei Tabs: **Start** und **Casting** (Sehen + Rangliste als Unterbereiche
  einer Casting-Seite). „Organisation" wandert in ein Konto-Menü oben rechts und erscheint dort
  nur mit Moderator- oder WG-Konto-Recht.
- Mitgliederliste: WG-Konto zeigt „Verwaltet die WG · stimmt nicht" statt „Stimmberechtigt".
- Beitritt lehnt belegte Namen ab — verglichen wird getrimmt und kleingeschrieben, geprüft
  serverseitig gegen aktive Mitglieder (plus Unique-Index auf dem normalisierten Namen).

## 2) Registrieren und Anmelden

- Neuer Tab „WG gründen": E-Mail + Passwort, legt WG, WG-Konto-Profil und Rollen an. Über dem
  Absenden steht der Hinweis, dass die E-Mail künftigen WG-Admins sichtbar ist.
- Beitrittsformular: nur **Name** und **Passwort** Pflicht, E-Mail wirklich optional
  (ohne E-Mail: technische Kennung, Hinweis „Passwort-Zurücksetzen dann nicht möglich").
- Checkbox „Auf diesem Gerät angemeldet bleiben", vorausgewählt.
- Der echte WG-Name steht über dem Formular: „Du trittst WG Sonnenallee 12 bei".
- „Kurzinfo (optional)" entfällt.
- Beitritt nur noch über Einladungslink (siehe 5); ohne gültigen Code kein Beitritt.

## 3) Sehen (Screening)

- Die vier Stufen werden eine Radiogruppe: Pfeiltasten und Zifferntasten 1–4 wechseln die
  Auswahl, Enter/Leertaste bestätigt, sichtbarer Fokusring.
- Nach der letzten Karte führt „Weiter" auf die Rangliste.
- Wer nichts Offenes hat, sieht sofort „Nichts wartet mehr auf dich — alles gesehen." (gleicher
  Text wie auf Start) mit Link zur Rangliste; Bearbeiten bleibt über die Fortschrittspunkte
  möglich.

## 4) Rangliste

- Zwei Abschnitte: **Rangliste** (Quorum erreicht, mit Platz, Score, Verteilung) und
  **Wartet noch auf Stimmen** (nur „3 von 4 Stimmen" — kein Score, kein Platz).
- Jede Karte zeigt den Namen und öffnet eine Detailansicht mit Vier-Farben-Verteilung, Score-
  Erklärung in Worten und aktuellem Status. Sichtbarkeitsinvariante (eigene Bewerbung,
  Hidden-Results) gilt auch dort serverseitig.

## 5) Organisation

- Startseite wird eine **Aufgabenliste**: eine Hauptaufgabe oben mit Begründung, bis zu drei
  weitere darunter, alles Übrige hinter „Mehr anzeigen".
- **Zimmer-Seite**: Liste mit Status, anlegen und bearbeiten.
- **Regeln-Seite**: Gewichte, Quorum-Anteil, Ergebnisse-verdeckt, Favoriten-Budget. Bei offener
  Runde serverseitig abgelehnt mit „Solange ‚Casting Herbst 2026' offen ist, bleiben die Regeln
  unverändert."
- **Mitglieder**: Einzugsdatum und Kontakt je Person, „Wieder aktiv setzen" für Ausgezogene.
- **Einladungslink** (siehe Konflikt 1): Warntext, Ablaufdatum (7 Tage, mit einem Tipp
  verlängerbar), Nutzungslimit. Der Code steht nie in der URL-Query — er wird als Pfadsegment
  mit sofortigem Austausch gegen eine Server-Sitzung eingelöst.
- **Bewerbung erfassen**: Pflichtfeld „Woher stammen die Angaben?" mit genau zwei sichtbaren
  Optionen — „Von der Person selbst" (vorausgewählt) oder „Von dritter Seite". Bei dritter Seite
  erscheint der Ein-Monats-Hinweis plus fertiger Kopiertext. Kein Sende-Knopf.
- **Einladen**: Bestätigungsschritt wie bei allen anderen Übergängen; danach ein Kopiertext mit
  Einladung inklusive Datenschutzhinweis. Kein Sende-Knopf.
- **Löschen** einer Bewerbung in jedem Status, mit Bestätigung, die den Namen nennt (S-33,
  manueller Pfad).
- **Runde schließen** bekommt eine Bestätigung, **Runde wieder öffnen** funktioniert
  (`closed → open`, protokolliert).
- Alle Status- und Rundenwechsel laufen über denselben Bestätigungsdialog.

## 6) Kleinigkeiten

- „Stimmen insgesamt" zählt alle Stimmen der Runde (serverseitige Aggregation, nicht die eigenen).
- „5 von 7 haben abgestimmt" öffnet eine reine Namensliste der Teilnehmenden — ohne Aktionen und
  ohne Angabe, wer schon gestimmt hat.
- Ehemalige Bewohner:innen sehen auf der Rangliste nur noch eine Meldung.
- „Eröffnen" nennt den fehlenden Punkt: „Wähle mindestens ein Zimmer."

## Technisches

- Serverseitige Sperren in `src/lib/fm/functions.ts` plus RLS-Policies: WG-Konto wird in
  `applications`, `votes`, `rounds`-Lesepfaden ausgeschlossen (doppelte Durchsetzung, S-36).
- Migration: `invites`-Tabelle (Code-Hash, Ablauf, Limit, Zähler), `households.settings`-Felder
  fürs Favoriten-Budget, `profiles.contact`, normalisierter Unique-Index auf Anzeigenamen,
  `rounds`-Reopen-Event.
- Routen neu: `/casting` (Sehen + Rangliste), `/casting/$applicationId`, `/teilnehmende`,
  `/organisation/zimmer`, `/organisation/regeln`, `/organisation/mitglieder`, `/beitritt/$code`.
- Jeder Zustandswechsel schreibt weiterhin nur über `application_events` (append-only).

## Reihenfolge

1 → 2 → 3 → 4 → 5 → 6, mit einem Playwright-Durchlauf je Abschnitt (WG-Konto, Bewohner:in,
Moderator:in, Ehemalige).
