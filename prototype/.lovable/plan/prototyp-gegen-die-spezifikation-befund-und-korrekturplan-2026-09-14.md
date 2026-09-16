# Prototyp gegen die Spezifikation — Befund und Korrekturplan

Ich habe die acht hochgeladenen Dokumente gegen den laufenden Prototyp geprüft (Zugang,
Start, Beteiligung, Casting-Tab, Organisation, Rahmenwerk, U-Entscheidungen).

**Kurzfassung:** Die tragende Kette (Runde → Beitritt → Bewerbung → Stimme → Rangliste)
steht und hält die harten Regeln ein — Sichtbarkeit, verdeckte Ergebnisse, Selbst-Redaktion,
Rechte serverseitig, jeder Statuswechsel protokolliert. Was fehlt, ist überwiegend die
**Rahmenschicht**: das Aufgabenmodell auf „Start", die Phasenanzeige, die vier Pflichtzustände
und die Sprachregel. Dazu vier kleinere Abweichungen in der Organisation.

---

## 1. Start ist noch keine Aufgabenliste (U-1, §2)

Heute zeigt „Start" eine Rundenkarte plus drei Zahlen. Die Spezifikation verlangt eine
Aufgabenliste: **genau ein** primärer Handlungsaufruf mit genanntem Grund, darunter höchstens
drei weitere Zeilen, der Rest eingeklappt als „und N weitere", und niemals eine leere Fläche.

- Im Prototyp-Umfang gibt es genau eine Aufgabenart: „Stimme zur Einladung" (T-5).
  Sie wird zum primären Aufruf: „4 Bewerbungen warten auf deine Stimme".
- Ist nichts offen, füllt der Rundenstand die Fläche (nicht „nichts wartet" als Sackgasse).
- **Moderations-Brücke** am Fuß, nur mit Rechten, eine einzelne Zeile: „3 Dinge brauchen deine
  Moderation →". Sie fehlt heute ganz — Organisation ist nur über das Kontomenü erreichbar.
- Die drei Zahlenkacheln wandern unter die Aufgabenliste (sie sind Information, keine Aufgabe).

## 2. Die Phasenanzeige fehlt vollständig (§3)

Nirgends steht, wo die Runde gerade steht. Neu über der Aufgabenliste und auf der Rangliste:

- Eine Zeile aus der **am weitesten fortgeschrittenen** Bewerbung: „Warten auf Bewerbungen" ·
  „Abstimmung Runde 1" · „Terminfindung" · „Abstimmung Runde 2" · „Zusage läuft".
- Sackgassen (abgelehnt, zurückgezogen, archiviert) zählen nicht mit; sind alle Bewerbungen
  dort, gilt „Warten auf Bewerbungen".
- Darunter immer die tatsächliche Verteilung: „7 in Sichtung · 2 im Termin · 1 gecastet".
- Die Anzeige sperrt nichts.

## 3. Sprache: „Quorum" steht ungeklärt im Text (U-24)

Das Wort erscheint auf Start, in der Rangliste-Erklärung, bei den Mitgliedern und in den
Abstimmungsregeln. Die Übersetzungsregel verbietet Fachwörter ohne Erklärung.
Überall ersetzen durch „genug Stimmen" bzw. „3 von 6 Stimmen reichen"; in den
Abstimmungsregeln bleibt der Fachbegriff einmal als Klammerzusatz stehen.

## 4. Die vier Pflichtzustände (§6, §12)

Heute: Ladezustand als grauer Satz, Fehler als roter Satz ohne Ausweg.

- **Laden:** Platzhalter in der Form des erwarteten Inhalts (Kartenskelette), kein Textsatz,
  kein Layoutsprung — auf Start, Sehen, Rangliste, Organisation, Mitglieder, Zimmer.
- **Fehler:** ein Satz ohne Fachwort, Knopf „Erneut versuchen", plus die Zusicherung, dass
  nichts verloren ging.
- **Leer** und **Keine Berechtigung** sind bereits regelkonform.

## 5. Einstellungen fehlen als Bildschirm (E1, U-15)

Es gibt nur „Abmelden" im Kontomenü. Neu: ein Bildschirm mit drei Abschnitten —
**Konto** (Passwort ändern), **E-Mail nachtragen** mit dem vorgeschriebenen Pitch
(„damit du wieder reinkommst, falls du dein Passwort vergisst" — nie als Sperre),
und **Abmelden**. Benachrichtigungen und Passkey entfallen (v0.2).

## 6. Zugang: zwei Lücken (A1)

- Nach der WG-Gründung fehlt der Folgeschritt: Wer selbst mitwohnt, braucht zusätzlich ein
  Bewohner-Profil. Das wird direkt im Anschluss angeboten, statt übersehen zu werden.
- „E-Mail bereits vergeben" führt heute in eine Fehlermeldung; künftig mit direktem Weg
  zur Anmeldung.

## 7. Organisation: vier Abweichungen

- **Nutzungsgrenze des Einladungslinks** ist fest auf 5 vorbelegt; die Vorgabe ist
  „Zahl der noch fehlenden Bewohnenden" (O-15). Wird berechnet vorbelegt, bleibt änderbar.
- **Rundenfrist** (S-44) existiert nirgends. Als einfaches, freiwilliges Datum an der Runde,
  immer zusammen mit der Phase angezeigt („Abstimmung Runde 1 — noch 2 Tage"), nie allein.
  Sie sperrt nichts und sortiert nur.
- **„Neue Runde" bei bereits offener Runde** ist deaktiviert mit Hinweis; die Vorgabe ist
  zusätzlich ein Weg zur bestehenden Runde.
- **Rundenübersicht** wird heute immer eingeklappt mitgeführt; laut Vorgabe füllt sie die
  Fläche nur dann, wenn keine Aufgabe offen ist.

## 8. Stimmberechtigte werden nicht je Runde eingefroren

Der Nenner („3 von 6 Stimmen") wird live aus den aktuell aktiven Bewohnenden gerechnet. Zieht
mitten in der Runde jemand ein oder aus, verschiebt sich rückwirkend, wie viele Stimmen nötig
sind. Die Teilnahme wird beim Eröffnen der Runde festgeschrieben — dasselbe Muster, mit dem
die Abstimmungsregeln schon eingefroren werden.

---

## Navigation: zurück auf zwei Tabs, „Casting" entscheidet selbst

**U-2 verlangt genau zwei Tabs: Start · Casting.** Der Prototyp hat seit der letzten
Korrekturrunde drei Einträge (Start · Sehen · Rangliste). Zurück auf zwei — und „Casting"
zeigt je nach Lage das Richtige:

- Stehen in Runde 1 noch Bewerbungen ohne deine Stimme aus, öffnet „Casting" **zuerst den
  Screening-Durchlauf**.
- Ist alles abgestimmt, landet „Casting" direkt auf der **Rangliste**.
- Nach der letzten Karte geht der Durchlauf wie bisher in die Rangliste über; von dort führt
  „Noch abstimmen" zurück, solange etwas offen ist.

So bleibt der Durchlauf eine Handlung und kein zweiter Ort, und niemand muss selbst wissen,
welcher der beiden Bildschirme gerade der richtige ist.

## Bewusst nicht angefasst (laut Spezifikation v0.2 oder später)

Terminfindung und Verfügbarkeit (C5, C6, O7–O11), Casting-Notizen (C4), zweiter Durchlauf (C2),
Zusage-Runde und Veto (C3), Benachrichtigungen, Push und Activity Center (B2, B3, C7),
Einladungstoken für Bewerbende (A4), Aufbewahrung und Datenauskunft (O17–O19),
Paste-Parser beim Erfassen (O3), Datenschutzseite freigeben (O20).

## Technisches

- `getHome` liefert künftig Aufgabenliste (Typ, Grund, Ziel, Zahl), Phasenanzeige und
  Verteilung; Berechnung serverseitig nach `MAIN_PATH_ORDER`.
- Neue Spalte `rounds.phase_deadline_at`; neue Tabelle `round_participants`
  (round_id, profile_id) beim Eröffnen gefüllt; `round_ranking`/`round_vote_stats` rechnen den
  Nenner daraus.
- Neue Route `/einstellungen`; `updatePassword`/`addEmail` als Serverfunktionen.
- Lade-Skelette als gemeinsame Komponenten; Fehlerdarstellung als ein wiederverwendbarer Block
  mit `refetch`.
- Prüfung im Browser: Aufgabenliste mit 0/1/5 offenen Aufgaben, Phasenanzeige über alle
  Zustände, Frist gesetzt und abgelaufen, Nenner nach Ein- und Auszug während der Runde.
