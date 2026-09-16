# Flatmate.io — Korrekturrunde 2

Ich habe alle sechs Abschnitte verstanden. Zwei Punkte berühren das Repo, siehe unten.

## Abgleich mit dem Repo

1. **Einladungscode dauerhaft sichtbar (2).** Der Code liegt heute nur als Hash in der Datenbank,
   darum die Einmal-Anzeige. Damit er jederzeit abrufbar ist, muss er im Klartext gespeichert
   werden — lesbar ausschließlich für Moderation und WG-Konto derselben WG. Das ist bewusst
   schwächer als ein Hash, aber angemessen für einen Beitrittscode, der wochenlang weitergegeben
   wird. Das Repo verbietet das nicht (Invite-Token ist dort ohnehin v0.2, von uns vorgezogen).
2. **Demo-Reset (5).** Ein Zurücksetzen-Knopf ist im Repo-Backlog nicht vorgesehen; er ist ein
   reines Test-Werkzeug. Ich baue ihn nur für die Demo-WG sichtbar und hinter einer Bestätigung,
   damit er nicht als Produktfunktion missverstanden wird.

Kein weiterer Konflikt: die Punkte 1, 3, 4 und 6 sind Umsetzungen bzw. Korrekturen von FR-4.12,
den Screen-Beschreibungen und dem „Keine Berechtigung"-Muster aus `08-UX-Entscheidungen.md` §6.

## 1) WG gründen reparieren (blockierend)

- Ursache: direkt nach der Registrierung hat das Konto noch kein Profil, also greift die Leseregel
  für WGs nicht — das Anlegen bricht mit einem Rechtefehler ab.
- Die Gründung läuft künftig komplett serverseitig als ein Vorgang: WG, WG-Konto-Profil und Rollen
  werden zusammen angelegt, nachdem der Server die Anmeldung geprüft hat. Wenn ein Schritt
  scheitert, wird die halbfertige WG wieder entfernt.
- Fehlertexte: eine gemeinsame Übersetzungsschicht wandelt Server- und Anmeldefehler in deutsche
  Sätze — nie wieder „[object Object]". Enthalten sind u. a. schwaches Passwort
  („Dieses Passwort taucht in bekannten Datenlecks auf — nimm bitte ein anderes."),
  bereits vergebene E-Mail, zu kurzes Passwort, ungültige Adresse.
- Dieselbe Übersetzung greift auch beim Beitreten und Anmelden.

## 2) Einladungscode jederzeit sichtbar

- Der Code wird zusätzlich im Klartext gespeichert (Lesen nur Moderation/WG-Konto der WG).
- Auf „Mitglieder" zeigt jede aktive Einladung Code und fertigen Link mit Kopierknopf, plus
  Ablauf, Nutzungen und den bestehenden Warntext. Zurückgezogene/abgelaufene Einladungen zeigen
  den Code nicht mehr.
- Der Hinweis „Diesen Code siehst du nur jetzt" entfällt.

## 3) Sehen-Screen auf dem Handy

- Die vier Stufen stehen in einer Zeile nebeneinander (auf sehr schmalen Geräten 2×2).
- Diese Leiste ist am unteren Bildschirmrand fixiert und immer sichtbar; nur Name, Alter, Text und
  Kontakt scrollen darunter durch.
- Die Umschaltung „Sehen / Rangliste" verschwindet. „Sehen" ist die Casting-Seite; die Rangliste
  bekommt einen eigenen Menüpunkt und bleibt über „Zur Rangliste" am Ende des Durchlaufs
  erreichbar.

## 4) Tastaturbedienung

- Echte Radiogruppe mit wanderndem Fokus: Pfeiltasten wechseln die Auswahl **und** speichern die
  Stimme sofort (wie ein Klick), 1–4 wählen direkt, Enter und Leertaste bestätigen die fokussierte
  Stufe.
- Die Tastenhinweise bleiben stehen, weil sie dann stimmen; geprüft wird mit einem Tastatur-
  Durchlauf im Browser.

## 5) Testdaten

- Neuer Knopf „Demo-WG zurücksetzen" (nur Moderation/WG-Konto, mit Bestätigung, die die Folgen
  nennt): löscht Bewerbungen, Stimmen, Ereignisse, Runden, Einladungen und Testmitglieder und legt
  den Ausgangszustand neu an.
- Der Seed bekommt sechs bis acht Bewerbungen mit ausführlichen Texten (wer, warum, etwas
  Persönliches) im Umfang des Lisa-Petersen-Beispiels, dazu gestreute Stimmen, damit Rangliste und
  „Wartet noch auf Stimmen" beide gefüllt sind.
- Die Altlasten aus früheren Testläufen werden einmalig entfernt.

## 6) Kleinigkeiten

- „Einladen" erzeugt nach der Bestätigung denselben Kopiertext-Block wie die Drittquellen-Erfassung
  — Einladungstext samt Datenschutzhinweis, mit Kopierknopf, ohne Sende-Knopf.
- Gesperrte Seiten nennen die zuständigen Personen: „Organisation machen die Moderator:innen —
  frag Lena oder Jonas, wenn du das Recht brauchst."
- „Neue Runde" ist weiterhin gesperrt, erklärt sich aber per Tooltip und Notiz darunter:
  „Schließe zuerst ‚…', dann geht eine neue Runde."
- Abgelaufene und aufgebrauchte Einladungen behalten jeweils eigene Texte (bereits vorhanden) —
  ich prüfe alle drei Fälle im Browser gegen.

## Technisches

- Migration: `invites.code` (Klartext, nur Moderation lesbar), Datenbereinigung, neuer Demo-Seed.
- Serverfunktionen: `createHousehold` über den privilegierten Pfad mit Rücknahme bei Fehlern,
  `resetDemoHousehold`, Einladungen liefern den Code mit.
- Neue Route `/rangliste`; `/casting` wird zur reinen Sehen-Seite ohne Tabs.
- Fehlerübersetzung in `src/lib/fm/errors.ts`, überall dort verwendet, wo heute `String(err)` steht.
- Playwright-Durchlauf: Gründung einer frischen WG, Beitritt über den nachträglich kopierten Code,
  Tastatur-Voting, Reset.
