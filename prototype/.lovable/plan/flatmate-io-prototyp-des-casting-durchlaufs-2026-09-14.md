# Flatmate.io — Prototyp des Casting-Durchlaufs

Ein klickbarer Prototyp mit echtem gemeinsamem Datenstand: mehrere Bewohner:innen melden sich an, sehen dieselbe Runde, dieselben Bewerbungen und stimmen wirklich zusammen ab. Oberfläche komplett auf Deutsch, per Du, "WG" statt "Haushalt".

## Die Screens

1. **Start / Anmeldung** (öffentlich)
   Kurze Erklärung, Login mit E-Mail + Passwort, und der Beitritts-Weg: "In die WG einsteigen" mit nur zwei Feldern (Name + Zimmer/Kurzinfo). Kein Bestätigungs-Mail-Schritt, keine Installation.

2. **B1 — Zuhause: "Was ist jetzt dran"** (Kernscreen)
   Eine einzige klare nächste Aufgabe oben ("3 Bewerbungen warten auf deine Stimme"), darunter der Stand der Runde, wie viele schon abgestimmt haben, und Kurzlinks zu Casting und Ranking.

3. **C1 — Screening / Abstimmen** (Kernscreen)
   Bewerbungen einzeln als Karte, vier Stufen: Nein / Eher nicht / Passt gut / Unbedingt. Große Tap-Flächen, sofort die nächste Karte, Fortschrittsanzeige, "Zurück"-Möglichkeit für die letzte Stimme.

4. **D1 — Ranking** (Kernscreen)
   Ergebnisse bleiben verdeckt, bis du selbst abgestimmt hast (echte Einstellung, standardmäßig an). Bewerbungen mit zu wenigen Stimmen stehen getrennt unter "Wartet noch auf Stimmen". Der Wert ist ein schlichter Mittelwert der vierstufigen Stimmen, auf 0–100 skaliert und offen erklärt ("78 von 100 Punkten, Mittelwert aus 5 Stimmen").

5. **O1 — Organisation / Dashboard** (Kernscreen)
   Runde anlegen: welche Zimmer, ab wann, wie viele Stimmen nötig sind, Ergebnisse-verdeckt-Schalter. Übersicht der Bewerbungen mit Status, Statuswechsel (auch rückwärts, mit Protokoll), Mitbewohner:innen verwalten (Moderationsrecht geben, jemanden als ausgezogen markieren).

6. **O3 — Bewerbung von Hand erfassen**
   Einfaches Formular: Name, Alter, Kontakt, Freitext. Danach direkt für alle sichtbar. Nichts an dieser Stelle setzt voraus, dass die bewerbende Person die App benutzt.

Nebensächliche Seiten (Profil, Impressum-Platzhalter) bleiben minimal.

## Datenmodell (Kurzfassung)

- **WG** — Name, Adresse, Einstellungen der WG
- **Mitglied** — Person + Rolle (WG-Konto, Moderation, Bewohner:in, ehemalig) + Ein-/Auszugsdatum
- **Zimmer** — gehört zur WG, frei ab Datum
- **Runde** — welche Zimmer, Status (Entwurf/offen/geschlossen), Mindeststimmen, "Ergebnisse verdeckt"
- **Bewerbung** — Name, Alter, Kontakt, Nachricht, Status (vollständige Statusliste, Rückschritte erlaubt und protokolliert)
- **Stimme** — Mitglied + Bewerbung + Wert 0 · 1 · 3 · 5 (Nein · Eher nicht · Finde gut · Unbedingt), eine Stimme pro Person, änderbar
- **Protokoll** — fortlaufende Liste aller Zustandswechsel, nur anhängend

Regeln, die von Anfang an mitlaufen: ehemalige Bewohner:innen verlieren sofort den Zugang, ihre alten Stimmen bleiben gespeichert, zählen aber nicht mehr zum Quorum. Wer inzwischen eingezogen ist, sieht die Bewertungen über sich selbst nicht.

## Abgleich mit der Feature-Liste im Repo

Deckt F1 (Runde eröffnen), F2 (Beitritt in zwei Feldern), F3 (Bewerbung von Hand), F4 (Screening mit vier Stufen), F5 (verdecktes Ranking) und die vier Kernscreens B1, C1, D1, O1 ab. Aus "Feature 0" übernehme ich das, was später nicht nachrüstbar ist: vollständige Statusliste mit protokollierten Rückschritten, das anhängende Protokoll und die Sichtbarkeitsregel. Bewusst weggelassen (wie im Prompt und im Backlog): Terminplanung, zweite Runde, Angebote, Benachrichtigungen, Installier-App, Löschautomatik, Datenexport, jede Art von KI.

## Technisches

Gültigkeitsquelle: Das Repo (https://github.com/SmokeyRGB/dl-school-repo/tree/dev/flatmate-plan-sprint-v0.2/Ideas/Flatmate.io/docs) ist die zentrale Anlaufstelle — wann immer bei der Implementierung Fragen oder Unsicherheiten aufkommen, wird es erneut konsultiert, bevor eine Entscheidung fällt.


- Lovable Cloud als Datenbasis; E-Mail/Passwort-Login, geschützter Bereich hinter dem Auth-Gate.
- Tabellen: `households`, `memberships` (Rolle in eigener Tabelle, kein Rollenfeld am Profil), `rooms`, `rounds`, `round_rooms`, `applications`, `application_events`, `votes`; RLS-Policies pro WG-Zugehörigkeit, Rollenprüfung über `has_role`-artige Security-Definer-Funktion.
- Schreib-/Lesepfade über `createServerFn` mit `requireSupabaseAuth`; Ranking-Durchschnitt wird serverseitig berechnet und mit Stimmenzahl zurückgegeben, damit er erklärbar bleibt.
- Demo-Datensatz (eine WG, 6 Bewohner:innen, 2 Zimmer, 8 Bewerbungen) kommt als feste Startdaten in der Migration, damit die Runde sofort etwas zeigt.
- Mobile-first, deutschsprachige Oberfläche, eigenes Farb-/Schriftsystem statt Standard-Look.

## Reihenfolge

1. Cloud aktivieren, Schema + Startdaten anlegen
2. Anmeldung/Beitritt und Auth-Gate
3. B1 Startscreen
4. C1 Screening
5. D1 Ranking
6. O1 Organisation + O3 Bewerbungsformular
7. Durchlauf einmal komplett testen
