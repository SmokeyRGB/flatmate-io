# Compliance-Checkliste (DE) - Flatmate.io

## Wichtiger Hinweis
Diese Datei ist eine Lern- und Arbeitsgrundlage fuer Produkt- und Architekturentscheidungen.
Sie ist keine Rechtsberatung.
---

## 0) Wie du mit der Checkliste arbeiten kannst

Nutze pro Punkt eine Ampel:
- Gruen: aktuell plausibel und belegbar
- Gelb: plausibel, aber unvollstaendig dokumentiert
- Rot: unklar, widerspruechlich oder rechtlich riskant

Und immer dieselben 3 Fragen:
1. Was behaupten wir?
2. Welcher Beleg steht in den Specs?
3. Welche Luecke bleibt offen?

---

## 1) Welche personenbezogenen Daten verarbeitet Flatmate.io?

### Kurzantwort
Ja, viele personenbezogene Daten. Direkt und indirekt.

### Direkt verarbeitet
- Bewerbende: Name, Alter, Kontaktwege, Bewerbungsnachricht
- Bewertungsdaten: Stimmen, Veto, Notizen
- Termin- und Verfuegbarkeitsdaten
- Bewohnerdaten: Account, Rollen, Mitgliedschaften
- Aktivitaets- und Statusprotokolle

### Indirekt verarbeitet (abgeleitet)
- Score und Rangplatz
- Beteiligungsmuster und Reaktionsverhalten

### Besonderes Risiko
Freitext kann sensible Daten enthalten (Gesundheit, Religion, Herkunft usw.).
Das ist ein rechtlich heikler Punkt.

### Wie bestaetigen/widerlegen?
- Bestaetigen: In den Specs gibt es eine Felderliste mit Datenkategorien und Aufbewahrungsfristen.
- Widerlegen: Falls ein Feld in Modell/Code auftaucht, aber nicht im Dateninventar dokumentiert ist, ist die Compliance-Aussage unvollstaendig.

Statusvorschlag: Gelb (gut dokumentiert, aber sensibler Freitext bleibt Risiko)

---

## 2) Wem gehoert der generierte Output?

### Kurzantwort
Fachlich sind Verantwortlichkeiten beschrieben, aber IP-Eigentum ist noch nicht sauber festgelegt.

### Bereits klar
- Fuer Bewerbungsentscheidungen: Haushalt als Verantwortlicher
- Fuer Plattformbetrieb: Flatmate.io als eigener Verantwortlicher

### Noch unklar
- Wem gehoeren rechtlich erzeugte Artefakte (z. B. Exporte, aggregierte Bewertungen) im Sinne von Nutzungsrechten/IP?

### Wie bestaetigen/widerlegen?
- Bestaetigen: Rollenmodell ist in den Specs klar beschrieben.
- Widerlegen: Wenn es keine klaren Klauseln in Terms/AVV gibt, fehlt die Eigentums- und Nutzungsregel.

Statusvorschlag: Gelb

---

## 3) Welche Lizenzen gelten?

### Training-Daten
- v1: kein ML-Training vorgesehen (regelbasierte Parser + Optimierung)
- v2-Idee: falls KI-Parsing kommt, nur mit EU-Verarbeitung, AVV und ohne Training auf Nutzdaten

### Generierter Code
- Aktuell keine sichtbare Projekt-Lizenzdatei im Flatmate.io-Ideenordner.
- Ohne Lizenz gilt standardmaessig Urheberrecht (nicht automatisch Open Source).

### Wie bestaetigen/widerlegen?
- Bestaetigen: In den Specs steht klar, dass v1 keine KI-Bewertung nutzt.
- Widerlegen: Wenn doch ein Modell Daten speichert/trainiert oder keine Lizenz festgelegt ist, sind Aussagen zu schwach.

Statusvorschlag: Gelb

---

## 4) Wer haftet, wenn KI Schaden verursacht?

### Kurzantwort
In v1 soll KI keine Personen bewerten. Das reduziert KI-Haftungsrisiko stark.

### Laut Spezifikation
- Haushalt: Hauptverantwortung fuer Bewerberdaten (Controller-Pflichten)
- Flatmate.io: Processor-Pflichten fuer Bewerberdaten + eigene Controller-Pflichten fuer Plattformdaten

### Kritischer Vorbehalt
Wenn Behoerden oder Gerichte auf gemeinsame Verantwortlichkeit (Joint Controller) kommen, aendert sich die Haftungslogik deutlich.

### Wie bestaetigen/widerlegen?
- Bestaetigen: Rollen, Prozesse und Auskunftswege sind in den Specs konsistent beschrieben.
- Widerlegen: Wenn reale Produktsteuerung faktisch zentral bei Flatmate.io liegt, kann Joint Controllership naheliegen.

Statusvorschlag: Gelb bis Rot (je nach juristischer Pruefung)

---

## 5) Was fragt ein Regulator oder Anwalt zuerst?

1. Ist die Rollenaufteilung (Haushalt vs. Flatmate.io) wirklich tragfaehig?
2. Greift die Haushaltsausnahme hier vielleicht doch?
3. Reicht die Click-Through-AVV wirklich aus?
4. Wie wird mit sensiblen Daten in Freitext rechtlich sauber umgegangen?
5. Ist eine Datenschutz-Folgenabschaetzung (DPIA/DSFA) noetig?
6. Sind Loeschung und Fristen technisch wirklich durchgesetzt (auch in Logs/Backups)?
7. Kann technisch bewiesen werden, dass keine verbotene KI-Bewertung stattfindet?

---

# Compliance-Checklist (Open Risks, Assumptions, Unknowns)

## A) Open Risks (offene Risiken)
- Hoch: Rollenmodell koennte als gemeinsame Verantwortlichkeit eingestuft werden.
- Hoch: Sensible Daten in Freitext (Art.-9-Thema) bleiben juristisch angreifbar.
- Hoch: Risiko von Feature-Drift in Richtung KI-Empfehlung/Bewertung.
- Mittel: 180-Tage-Frist koennte im WG-Kontext angezweifelt werden.
- Mittel: Tombstone/Redaction im Audit-Log koennte mit Loeschanspruechen kollidieren.
- Mittel: Re-Identifikation in kleinen WGs trotz Anonymisierungslogik moeglich.
- Mittel: Vermieter-Use-Case erhoeht AGG- und AI-Act-Risiko deutlich.

## B) Assumptions (Annahmen)
- Haushalt ist Verantwortlicher fuer Bewerbungsentscheidungsdaten.
- Flatmate.io ist Auftragsverarbeiter fuer diese Daten und eigener Verantwortlicher fuer Plattformdaten.
- v1 bleibt strikt ohne KI-Bewertung von Personen.
- Parser bleiben strukturierend, nicht bewertend.
- Kein Tracking/Fingerprinting, nur notwendige Session-Mechanik.

## C) Unknowns (Unbekanntes)
- Keine klare Eigentums-/Nutzungsrechtsklausel fuer generierte Outputs.
- Keine finale Projekt-Lizenz im Ordner festgelegt.
- Subprozessorenliste (Hosting, E-Mail) noch nicht final benannt.
- DSFA/DPIA-Pflicht noch nicht final entschieden.
- Endgueltige juristische Position zu Haushaltsausnahme und Art.-9-Inzidenten offen.
- Fuer v2: Modellanbieter-Vertraege und No-Training-Zusagen noch nicht vertraglich fixiert.

---

## Schneller Selbsttest fuer dich (Junior-friendly)

Wenn du in 10 Minuten pruefen willst, ob ihr auf Kurs seid:
1. Gibt es fuer jedes personenbezogene Feld Zweck + Frist + Rechtsgrundlage in den Specs?
2. Ist im Produkt klar nachweisbar: keine KI-Bewertung, keine KI-Rangempfehlung?
3. Ist Loeschung technisch automatisiert und getestet?
4. Gibt es eine klare Liste externer Dienstleister (Subprozessoren)?
5. Gibt es mindestens eine offene Liste fuer anwaltliche Klaerung vor Launch?

Wenn 4 oder mehr mit Ja beantwortet sind: guter Zwischenstand.
Wenn 2 oder mehr mit Nein beantwortet sind: vor Launch nacharbeiten.

---

## Empfohlene naechste Schritte
1. Eine 1-seitige Launch-Entscheidungsvorlage mit Ampelstatus erstellen (Go/No-Go).
2. Fuer jede rote Position einen Besitzer, eine Frist und einen Nachweis definieren.
3. Vor Produktivbetrieb eine juristische Kurzpruefung auf Q1 bis Q4 aus dem Compliance-Anhang durchfuehren.
