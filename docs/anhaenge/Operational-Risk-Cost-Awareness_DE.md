# Operational Risk & Cost Awareness

Datum: 2026-08-19  
Basis: Spezifikation 01-06

## Worum es hier geht

Viele AI-Produkte scheitern nicht an Ethik, sondern an Betrieb:
- zu teuer
- zu langsam
- zu instabil
---

## 1) Die 5 Haupt-Risiken (einfach erklaert)

1. API-Rate-Limits
- Bedeutung: Externe Dienste erlauben nur eine bestimmte Zahl an Anfragen pro Minute/Stunde.
- Risiko: Bei Lastspitzen bekommst du 429-Fehler.

2. Model-Verfuegbarkeit (spaeter in v2)
- Bedeutung: Der KI-Dienst ist zeitweise nicht erreichbar.
- Risiko: Parser/Zusammenfassung faellt aus.

3. Latenz
- Bedeutung: Antworten dauern zu lange.
- Risiko: Nutzer springen ab und gehen wieder zu WhatsApp.

4. Pay-as-you-go Kosten
- Bedeutung: Du zahlst pro Anfrage/Token/Nachricht.
- Risiko: Bei 10x Nutzung explodieren Kosten.

5. Rechenlast durch CP-SAT Solver
- Bedeutung: Die Terminplanung nutzt einen rechenintensiven Constraint Solver.
- Risiko: Bei vielen gleichzeitigen Anfragen steigen CPU-Last, Wartezeit und Timeout-Rate.

---

## 2) Antworten auf die Pflichtfragen

### Was passiert bei 10x Nutzung?

Typisch passiert:
1. Mehr 429-Fehler bei externen APIs.
2. Warteschlangen fuer E-Mails/Jobs wachsen.
3. CP-SAT Jobs stauen sich (lange Solver-Queue).
4. Seiten werden langsamer.
5. Beteiligung sinkt.

### Was passiert, wenn die API ausfaellt?

- AI/Model API aus: auf manuell + regelbasiert umschalten.
- E-Mail API aus: In-App Notifications weiter nutzen, E-Mails spaeter nachholen.
- Wichtig: Kernfluss (abstimmen, Status aendern) darf nie vom Modell abhaengen.

### Was kostet eine Aktion / ein Nutzer?

Einfache Formel:
- Kosten pro Aktion = (Infra + externe APIs + E-Mail + Monitoring) / erfolgreiche Aktionen
- Kosten pro aktivem Nutzer = Gesamtkosten Runde / aktive Bewohner in Runde

Wenn spaeter Modellaufrufe kommen:
- Kosten pro Parse = Input-Token-Kosten + Output-Token-Kosten + Retry-Kosten

### Wann wird es untragbar?

Setze klare Schwellwerte, z. B.:
- Gruen: <= 20% deines Monatsbudgets
- Gelb: 20-35%
- Rot: > 35% in 2 Monaten hintereinander

Auch rot:
- Retry-Anteil > 20%
- P95 Latenz > 2.5s bei Kernaktionen

---

## 3) Konkreter Mini-Plan (Cost Controls + Fallback + Monitoring)

### A) Cost Controls

- Monatliches Budget-Limit je Anbieter setzen.
- Doppelte Requests verhindern (Idempotency Keys).
- Nicht-kritische Features bei Budgetstress automatisch abschalten.
- Digest als Standard behalten (weniger E-Mail-Kosten).
- Pro Haushalt/Obergrenze fuer gleichzeitige Solver-Aufrufe setzen.

### B) Fallback-Strategien

- Modell down -> manueller Modus.
- E-Mail down -> In-App + Retry Queue.
- Solver zu langsam/down -> manuelle Slot-Planung (ist in deiner Spezifikation schon angelegt).
- Wenn Solver-Queue zu lang oder CPU zu hoch: Solver temporaer abschalten und nur Feasibility + manuelle Planung anbieten.

### C) Monitoring-Signale

- Fehlerquote (gesamt + pro externer API)
- 429-Rate
- Warteschlangen-Laenge
- Solver-Queue-Tiefe und Wartezeit pro Solver-Job
- P50/P95 Latenz wichtiger Endpunkte
- CPU-Auslastung waehrend Solver-Spitzen und Solver-Timeout-Rate
- Tageskosten pro Anbieter
- Kosten pro abgeschlossener Casting-Runde

---

## 4) Praktische Audit-Anleitung (So pruefst du meine Aussagen)

Nutze diese Checkliste, um jede Aussage zu bestaetigen oder zu widerlegen.

### Schritt 1: Abhaengigkeiten inventarisieren

Prueffrage:
- Welche externen APIs nutzt v1 wirklich?

Praktischer Test:
- Erstelle eine Tabelle: Dienst, Zweck, kritisch ja/nein, Kostenmodell, Rate Limit bekannt ja/nein.
- Wenn ein kritischer Dienst keine bekannten Limits hat -> Risiko bestaetigt.

Ergebnis:
- Bestaetigt/widerlegt Risiko "unbekannte Rate Limits".

### Schritt 2: 10x Last simulieren

Prueffrage:
- Bricht der Kernfluss bei Last?

Praktischer Test:
- Simuliere 10x typische Requests fuer:
  - Runde laden
  - Vote abgeben
  - Rangliste abrufen
  - Terminvorschlag ausloesen
- Miss Fehlerquote, P95 Latenz, Queue-Lag, Solver-Queue-Wartezeit und CPU-Last.

Ergebnis:
- Wenn Fehlerrate steigt oder P95 > Zielwert -> Risiko "Skalierung" bestaetigt.

### Zusatztest: CP-SAT-Solver unter Last

Prueffrage:
- Ist die Terminfindung unter Last noch nutzbar?

Praktischer Test:
- Starte viele gleichzeitige "Terminvorschlag berechnen" Requests.
- Miss:
  - mittlere Solver-Laufzeit
  - P95 Solver-Laufzeit
  - Solver-Timeout-Rate
  - maximale Queue-Wartezeit
  - CPU-Auslastung
- Definiere Abbruchschwelle, z. B.:
  - P95 Solver > 5s oder Timeout-Rate > 5% -> Degraded Mode aktivieren.

Ergebnis:
- Wenn diese Schwelle erreicht wird, ist das Risiko "CP-SAT Rechenengpass" bestaetigt und die Fallback-Regel muss automatisch greifen.

### Schritt 3: API-Ausfall ueben (Game Day)

Prueffrage:
- Funktioniert Fallback wirklich?

Praktischer Test:
- Schalte testweise je einen Dienst aus:
  - Modell/API
  - E-Mail
- Pruefe, ob Kernaktionen weitergehen.
- Pruefe, ob Nutzer einen klaren Hinweis sehen.

Ergebnis:
- Wenn Kernfluss stoppt -> harte Abhaengigkeit, Risiko bestaetigt.

### Schritt 4: Kosten pro Aktion messen

Prueffrage:
- Kennst du echte Unit Economics?

Praktischer Test:
- Fuer 1 Woche erfassen:
  - Gesamtkosten/Tag
  - Anzahl erfolgreicher Votes
  - Anzahl abgeschlossener Runden
- Rechne:
  - Kosten pro Vote
  - Kosten pro Runde

Ergebnis:
- Wenn Zahlen unbekannt oder stark schwankend -> Risiko "Kostenblindflug" bestaetigt.

### Schritt 5: Unsustainability-Schwelle testen

Prueffrage:
- Weisst du, wann du Features drosseln musst?

Praktischer Test:
- Lege harte Schwellwerte fest (Gruen/Gelb/Rot).
- Simuliere einen Monat mit 2x und 5x Kostenanstieg.
- Definiere konkrete Reaktion je Stufe (z. B. Feature-Flag aus).

Ergebnis:
- Wenn es keine automatische Reaktion gibt -> Risiko "zu spaetes Gegensteuern" bestaetigt.

---

## 5) Ergebnis in einem Satz

Flatmate.io ist in v1 vergleichsweise robust, weil der Kernprozess ohne Modell-API funktioniert. Entscheidend ist jetzt, dass du Kosten- und Ausfallkontrollen vor v2 messbar und testbar machst.

---

## 6) Kurzvorlage fuer deine eigene Audit-Doku

- Annahme:
- Test:
- Messwert:
- Bewertung (bestaetigt/widerlegt):
- Naechste Massnahme:
