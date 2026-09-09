> **Status:** Vorschlag — anfechtbar
> **Quelle:** `../05-ADRs.md` §ADR-009 (Stand V0.8, eingefroren 2026-09-09)
> **Nummer:** ADR-009 — dauerhaft. Nummern werden nie neu vergeben.

## ADR-009 — Kanalneutralität als Architekturregel, nicht als Feature

### Kontext

Der reale Wettbewerber ist **WhatsApp plus Sprachnachricht**, nicht ein anderes Produkt. Bewerbungen
treffen über Portale, Messenger, E-Mail und Mundpropaganda ein. Verfügbarkeiten kommen als
„dienstags ab 16" in einer Chatnachricht.

Der einzige direkte Wettbewerber im Terminteil — `besichtigungstermine.com`, kostenlos, DE, wirbt
explizit mit „WG-Casting" — **ist auf seinen Link angewiesen**: die bewerbende Person muss ihn
öffnen und dort Slots wählen. Wer nicht klickt, existiert im System nicht.

Das ist die Differenzierung, und sie ist keine Marketingaussage, sondern eine Architekturregel: **wer
einen Link voraussetzt, verliert die Hälfte der Bewerbenden** — und damit die Vollständigkeit, die
den Prozess erst zusammenführt.

### Betrachtete Optionen

| Option | Vorteil | Nachteil | Bewertung |
|---|---|---|---|
| **Kanalneutralität als Invariante: jeder Erfassungspfad erzeugt dasselbe Domänenobjekt** ✅ | Kein Feature bricht, wenn Bewerbende nicht mitspielen. Manuelle Eingabe ist gleichwertig, nicht Notlösung | Jeder Pfad braucht eine vollwertige manuelle Variante — mehr UI, mehr Tests | **Gewählt** |
| Link-first mit manueller Eingabe als Rückfall | weniger Arbeit | „Rückfall" wird in der Praxis zum Hauptweg und ist dann der schlechter gebaute. Genau die Falle, in der der Wettbewerb sitzt | Verworfen |
| Nur manuelle Eingabe | einfachste Umsetzung | Verschenkt echte Erleichterung dort, wo Bewerbende gern mitmachen | Verworfen |
| Portal-Anbindung als Primärpfad (WG-Gesucht) | maximale Automatisierung | **Keine offizielle öffentliche API** — nur inoffizielle Login-Clients und Scraper. Rechtlich und betrieblich unhaltbar als Fundament | Verworfen; nutzerinitiierte Browser-Extension frühestens v1.2 |

### Entscheidung

**P-1 wird eine Architekturregel:** Jede Information, die über einen Link hereinkommen kann, muss
auch von Hand einpflegbar sein, und **alle Erfassungspfade erzeugen dasselbe Domänenobjekt.** Kein
Feature darf einen Link voraussetzen. Bewerbende werden nie in die App gezwungen.

Konkret im Modell:

- `Application.source ∈ {manual_form, paste_parser, availability_link, portal_import}` — **ein**
  Objekt, vier Herkünfte. Alles danach (Screening, Voting, Ranking, Termine) kennt den Unterschied
  nicht.
- `AvailabilityWindow.source ∈ {grid, text_parse, token_link, manual}` — dasselbe für
  Verfügbarkeiten.
- **v1-Erfassung:** manuelles Formular **plus** Paste-Parser (Nachricht einfügen, **regelbasierte**
  Heuristik extrahiert Name, Alter, Kontakt, Text, **Mensch bestätigt**). Kanalunabhängig, null
  Rechtsrisiko, kein Modell (P-5).
- **Verfügbarkeiten hybrid:** schmaler Token-Link zu *einer* Seite mit Zeitraster (kein Konto, keine
  weiteren Daten, trägt den Art.-13-Hinweis) **plus** vollwertige manuelle Eingabe strukturierter
  „kann / kann nicht"-Fenster, inklusive **Freitext→Zeitfenster-Parser** („Di 16–19", „dienstags ab
  16", „nur abends", „am 3.9. nachmittags"), regelbasiert.
- **Parser-Vorschläge sind immer bestätigungspflichtig, nie stillschweigend** (P-3). `raw_input`
  bleibt erhalten, damit ein Fehlparse nachvollziehbar ist.

### Konsequenzen

**Positiv**

- Das Produkt funktioniert vollständig, auch wenn **keine** bewerbende Person je einen Link öffnet.
- Der Unterschied zum stärksten Wettbewerber ist strukturell, nicht featurebasiert — er lässt sich
  nicht in einem Sprint kopieren.
- Kein Rechtsrisiko aus Scraping oder inoffiziellen APIs.
- Der Token-Link bleibt minimal (eine Seite, ein Raster, kein Konto) und damit datenschutzarm.

**Negativ**

- **Jeder Pfad kostet doppelte UI und doppelte Tests.** Das ist der Preis, und er fällt in v1 an,
  nicht später.
- **Der Paste-Parser wird nicht gut sein.** Regelbasierte Extraktion aus freier Prosa trifft
  vielleicht die Hälfte. Der Bestätigungsschritt macht das erträglich, aber die Erwartung muss in der
  UI gedämpft werden — sonst wirkt das Feature kaputt, obwohl es korrekt arbeitet.
- **Der Freitext→Zeitfenster-Parser hat einen langen Schwanz an Formulierungen.** „Ab nächster Woche
  eigentlich immer, außer donnerstags" ist regelbasiert nicht erfassbar. Die manuelle Eingabe muss
  deshalb **wirklich** vollwertig sein, nicht nur vorhanden.
- **KI-Parsing bleibt für v2 verlockend** — und ist der Punkt, an dem P-5 unter Druck kommt. Zwei
  Bedingungen sind vorab festzuhalten: (a) der Eingabetext bleibt personenbezogen, also EU-Verarbeitung
  und AVV mit dem Modellanbieter; (b) die Ausgabe bleibt auf **strukturierende Extraktion** begrenzt,
  **niemals Bewertung**. Nur so bleibt es unter P-5 und außerhalb Anhang III des AI Act. Für den MVP
  genügt nicht-KI-basiertes Parsing.

> **Das gibt man auf** — nicht. Dies ist der Record, der am direktesten die Produktidentität trägt.
> Fällt er, wird Flatmate.io ein besseres `besichtigungstermine.com` statt ein Werkzeug für den
> Beratungs- und Entscheidungsteil.

**Status: Vorschlag — anfechtbar**

---
