> **Status:** Bestätigt — verbindlich für v0.1
> **Quelle:** Miro-Board „Tech-Stack-Review", 2026-09-10 — außerhalb des Repos entschieden, hier
> zum ersten Mal als Record nachgezogen. Kein Eintrag in `../05-ADRs.md` (dort eingefroren seit
> V0.8, vor diesem Datum) — diese Lücke ist der Anlass für diesen Record.
> **Nummer:** ADR-0015 — dauerhaft. Nummern werden nie neu vergeben.

## ADR-0015 — Styling: Tailwind CSS + shadcn/ui (Radix-Primitives)

### Kontext

ADR-006 legt Next.js/TypeScript als Stack fest, aber keine Aussage zu CSS oder Komponenten.
`../09-Design-System.md` definiert seither visuelle Tokens (Farben, Typografie, Abstände,
Komponenten) — aber Tokens sind kein Rendering-Mechanismus; irgendetwas muss sie in echtes CSS
und echte Komponenten übersetzen. Diese Wahl wurde am 2026-09-10 im Rahmen des Tech-Stack-Reviews
getroffen, aber nie als Record dokumentiert — genau die Lücke, die `README.md` §3 (ID-Register)
verhindern soll: eine Entscheidung ohne maßgebliche Quelle ist für jeden späteren Leser unsichtbar.

`prototype/` implementiert bereits Tailwind (siehe `../09-Design-System.md` Zeile 45/47: die
Farbtabellen wurden gegen die Tailwind-CSS-Variablen des Prototyps pixelgenau abgeglichen). Das ist
laut `README.md` §6 (Vorrangkette) **kein** Implementierungsentscheid — der Prototyp ist
ausschließlich visuelle Referenz. Dass die spätere Wahl trotzdem auf dieselbe Bibliothek fällt, ist
Zufall der Ausgangslage, keine Ableitung aus dem Prototyp.

### Betrachtete Optionen

| Option | Begründung dafür | Begründung dagegen |
|---|---|---|
| **Tailwind CSS + shadcn/ui** | Utility-Klassen bilden Tokens (Farbe, Abstand, Radius) nahezu 1:1 aus `09-Design-System.md` ab, ohne eine eigene CSS-Abstraktionsschicht zu erfinden. shadcn/ui liefert unstyled Radix-Primitives (Dialog, Popover, Select) **als Quelltext im eigenen Repo**, nicht als npm-Abhängigkeit — keine Bibliotheks-Blackbox, volle Kontrolle über Markup und Barrierefreiheit, was P-2 (Geräteneutralität) direkt zugutekommt | Utility-Klassen im JSX gelten manchen als unübersichtlich; shadcn/ui-Komponenten müssen im Repo gepflegt werden statt per `npm update` |
| **CSS Modules / Vanilla CSS** | Kein Build-Overhead, keine Klassennamen-Konventionen zu lernen | Jede Komponente (Dialog, Select, Popover) müsste barrierefreiheitsseitig von Hand gebaut werden — bei einem Solo-Projekt der teuerste Posten |
| **Komponenten-Bibliothek mit eigenem Styling (MUI, Chakra)** | Komponenten sofort nutzbar, keine Recherche zu Radix-Primitives nötig | Eigenes Theming-System konkurriert mit `09-Design-System.md`s Tokens statt sie direkt abzubilden; schwerer, das „Apartment-Notebook"-Aussehen exakt zu treffen; zusätzliche Laufzeit-Abhängigkeit mit eigenem Versionszyklus |

### Entscheidung

**Tailwind CSS** für Utility-Styling, **shadcn/ui** (Radix-UI-Primitives, als Quelltext ins Repo
kopiert, nicht als Paket-Abhängigkeit) für interaktive Komponenten mit eingebauter
Barrierefreiheit (Fokus-Management, ARIA, Tastaturnavigation).

`../09-Design-System.md` bleibt die maßgebliche Quelle für Tokens (Farben, Typografie, Abstände,
Komponenten-Auswahl); dieser Record legt nur fest, **womit** sie umgesetzt werden. Bei Konflikt
gilt weiterhin `README.md` §6: `07`/`08` korrigieren `09`, nie umgekehrt, und `09` bindet nie Scope
oder Flows.

### Konsequenzen

**Positiv**

- Tokens aus `09-Design-System.md` übersetzen sich direkt in eine Tailwind-Konfiguration (Farben,
  Radien, Abstände als Theme-Werte) — keine zweite, konkurrierende Quelle für dieselben Werte.
- shadcn/ui-Komponenten liegen als Quelltext im eigenen Repo — keine Laufzeit-Abhängigkeit, deren
  Breaking Changes ein Solo-Projekt treffen könnten, und volle Kontrolle über Barrierefreiheit statt
  Vertrauen in eine fremde Blackbox.
- Radix-Primitives lösen Fokus-Management, ARIA-Attribute und Tastaturnavigation für Dialog,
  Select, Popover — Bausteine, die sonst von Hand nachgebaut werden müssten.

**Negativ**

- shadcn/ui-Komponenten werden bei einem Update **manuell** nachgezogen (Copy-Paste, kein
  `npm update`) — Pflegeaufwand, der bei einer klassischen Abhängigkeit entfiele.
- Tailwind-Utility-Klassen im JSX sind gewöhnungsbedürftig gegenüber benannten CSS-Klassen; kein
  neuer Aufwand, aber ein Stilbruch für Leser, die klassisches CSS erwarten.
- Diese Wahl war zwischen 2026-09-10 und heute (2026-09-18) an keiner Stelle im Repo nachlesbar —
  acht Tage, in denen jeder Leser der Doku von einer offenen Frage statt einer getroffenen
  Entscheidung hätte ausgehen müssen. Der Record existiert jetzt; die Lücke selbst bleibt als
  Beleg dafür stehen, dass ein Record erst mit dem Schreiben existiert, nicht mit dem Entschluss.

> **Das gibt man auf, wenn** shadcn/uis manuelles Update-Modell bei wachsendem Komponentenbestand
> mehr Pflegeaufwand erzeugt, als eine klassische Bibliotheksabhängigkeit gekostet hätte, oder wenn
> Tailwinds Utility-Klassen bei wachsender Komponentenzahl unübersichtlicher werden als eine
> CSS-Modules-Alternative. Beides ist mit dem heutigen Umfang (`07-Screen-Inventar.md`) nicht
> erwartbar — v0.1 hat keine Komponentenmenge, die dieses Argument trägt.

**Status: Bestätigt — verbindlich für v0.1**

> **Entschieden am 2026-09-10** (Samuel Zink, außerhalb des Repos, Miro-Board „Tech-Stack-Review").
> **Als Record nachgezogen am 2026-09-18** (Samuel Zink) — verbindlich für v0.1 ab dem
> ursprünglichen Entscheidungsdatum, nicht erst ab dem Datum dieser Datei.
> **Aufgabebedingung:** siehe „Das gibt man auf, wenn" oben.
> **Was ein späterer Widerspruch kostet:** jede bereits gebaute Komponente und ihre
> Tailwind-Klassen — vergleichbar mit einem CSS-Framework-Wechsel in jedem anderen Projekt, aber
> ohne Datenmodell-Auswirkung (kein Bestandsverzeichnis-Bezug, im Gegensatz zu ADR-006).
> Status wechselt auf `Angenommen`, sobald die erste Komponente aus `07-Screen-Inventar.md` damit
> gebaut und gegen `09-Design-System.md` abgeglichen ist.
