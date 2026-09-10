> **Quelle:** `../07-Screen-Inventar.md` §7–§8 (Legende und Übersichtstabelle 7.0) (Stand V0.1, eingefroren 2026-09-09)
> **Schema-Autorität:** Alle Feld-, Zustands- und Entitätsnamen sind aus `../domain/`
> zitiert, nie neu erfunden.

## §7–§8 — Bildschirmverzeichnis (41 Bildschirme)

### Legende

| Kürzel | Bedeutung |
|---|---|
| **B / O / V(alle)** | Bewohner (jedes `ResidentProfile`) / Organisation (nach `role`/`permissions`, §4.2) / vor der Anmeldung |
| **v1 / v1.1** | Phase — v1.1 nur, wo eine Zeile das ausdrücklich markiert; alles andere ist v1 |
| ⚡ | Kernbildschirm — hier entscheidet sich das Produkterlebnis |

**Vier Pflichtzustände je Bildschirm** (§6): Laden · Leer · Fehler · Keine Berechtigung. Nur
einzeln ausgeführt, wo sie inhaltlich vom Standard abweichen.

### 7.0 Übersichtstabelle

| # | Bildschirm | Rollen | Fläche | ⚡ |
|---|---|:--:|---|:--:|
| **A — Zugang** |
| A1 | Registrierung (Haushalt) | alle | Zugang | |
| A2 | Anmeldung | alle | Zugang | |
| A3 | Beitritt per Code | alle | Zugang | |
| A4 | Einladungstoken einlösen | alle | Zugang | |
| **B — Start** |
| B1 | Start — „Was ist dran?" | B | Bewohner | ⚡ |
| B2 | Benachrichtigungszentrum | B | Bewohner | |
| B3 | Activity Center — „Alle Aktivitäten" | B | Bewohner | |
| B4 | Teilnehmendenliste | B | Bewohner | |
| **C — Beteiligung** |
| C1 | Screening-Durchlauf | B | Bewohner | ⚡ |
| C2 | Zweiter Durchlauf | B | Bewohner | |
| C3 | Runde 2 — Zusage-Abstimmung | B | Bewohner | |
| C4 | Casting-Notiz schreiben | B | Bewohner | |
| C5 | Verfügbarkeit eintragen | B | Bewohner | |
| C6 | Slot-Reaktion | B | Bewohner | |
| C7 | Push-Berechtigung erteilen | B | Bewohner | |
| C8 | „Ich kann doch nicht" — Terminabsage | B | Bewohner | |
| **D — Casting-Tab** |
| D1 | Rangliste — „Warten auf Stimmen" | B | Bewohner | ⚡ |
| D2 | Kandidaten-Einzelansicht | B | Bewohner | |
| D3 | Eigene Bewerbung | B | Bewohner | |
| D4 | Termine | B | Bewohner | |
| **E — Einstellungen** |
| E1 | Einstellungen | B | Bewohner | |
| **O — Organisation** |
| O1 | Orga-Dashboard | O | Organisation | ⚡ |
| O2 | Runde anlegen | O | Organisation | |
| O3 | Bewerbung erfassen | O | Organisation | |
| O4 | Pipeline | O | Organisation | |
| O5 | Statuswechsel + Copy-Paste-Text | O | Organisation | |
| O6 | Frühere Bewerbung zuordnen | O | Organisation | v0.2 |
| O7 | Verfügbarkeitsraster / Heatmap | O | Organisation | |
| O8 | Bewerber-Verfügbarkeit eintragen | O | Organisation | |
| O9 | Terminvorschlag | O | Organisation | |
| O10 | Terminbestätigung | O | Organisation | |
| O11 | Anwesenheit korrigieren | O | Organisation | |
| O12 | Zusage erteilen + Einladungstoken erzeugen | O | Organisation | |
| O13 | Rückmeldung einpflegen | O | Organisation | |
| O14 | Zimmer | O | Organisation | |
| O15 | Rundenfrist setzen / verlängern | O | Organisation | |
| O16 | Mitglieder | O | Organisation | |
| O17 | Aufbewahrung | O | Organisation | |
| O18 | Aufbewahrungs-Vorwarnung | O | Organisation | |
| O19 | Datenauskunft | O | Organisation | |
| O20 | Haushalt-Einstellungen | O (nur `household_admin`) | Organisation | |

**41 Bildschirme:** 4 Zugang · 4 Start · 8 Beteiligung · 4 Casting-Tab · 1 Einstellungen ·
20 Organisation. Davon 4 Kernbildschirme (⚡).

---

---

## Aufteilung dieses Ordners

`../07-Screen-Inventar.md` ist eingefroren. Gepflegt wird hier.

| Datei | Inhalt |
|---|---|
| **`rahmenwerk.md`** | §1–§6, §11, §12 — Aufgabenmodell, Phasenanzeige, die drei Flächen, Ereignisklassen, **die vier Pflichtzustände**, Sichtbarkeit als Anzeigeregeln, Barrierefreiheit. **Gilt für alle 41 Bildschirme** |
| `A-zugang.md` | A1–A4 · vor der Anmeldung |
| `B-start.md` | B1–B4 · Bewohner-Startfläche (**B1 ⚡**) |
| `C-beteiligung.md` | C1–C8 · eigene Aufgaben (**C1 ⚡**) |
| `D-casting-tab.md` | D1–D4 · Gruppenstand lesen (**D1 ⚡**) |
| `E-einstellungen.md` | E1 · ein Bildschirm mit Abschnitten (U-15) |
| `O-organisation.md` | O1–O20 · Organisation und Moderation (**O1 ⚡**) |
| `abweichungen-und-offene-punkte.md` | §9, §10, §13–§15 — Abweichungsliste samt Statusspalte, offene Punkte, nächster Schritt |

> **§6s vier Pflichtzustände stehen nur in `rahmenwerk.md`** und werden nicht in die Gruppendateien
> kopiert. Sie gelten für jeden Bildschirm; **G-N6** in `../GUARDRAILS.md` prüft das.

> ⚠️ **Fehlender Verweis, neu gefunden.** Der Kopf des Quelldokuments und §12 verweisen beide auf
> eine **„Übersetzungstabelle in §8.6"** — das UI-Vokabular, das U-24 verlangt. **Diese Tabelle
> existiert nicht:** `07-Screen-Inventar.md` führt überhaupt keinen Abschnitt §8.x, und
> `04-Domaenenmodell.md` §8.6 ist `phase_hint`, also etwas anderes. Geführt als offener Punkt
> **O-G** im Register in `../review-log.md`. Die Tabelle wurde hier **nicht erfunden** — sie ist
> Spezifikationsarbeit, nicht Umbauarbeit.

---

## Kopf der Quelldatei — hier übernommen

Diese vier Angaben standen nur im Kopf der eingefrorenen Sammeldatei und fehlten in diesem
Ordner:

> **Stand:** V0.1 · 2026-09-02 · Samuel Zink (@SmokeyRGB)

> **Zweck.** `../review-log.md` benennt drei Design-Lücken: kein Screen-Inventar, der
> Feinschliff-Bildschirm ohne Gestaltungsspezifikation, das Onboarding beim Erstbeitritt nicht
> beschrieben. Diese Schicht schließt alle drei — die mittlere, indem sie die Interaktion
> **beseitigt** statt sie zu gestalten (§9). Sie ist die fehlende Schicht zwischen der
> Anforderungskette und einer Umsetzung: wie sich das Modell als Oberfläche anfühlt.

> **Schema-Autorität.** Alle Feld-, Zustands- und Entitätsnamen sind aus `../domain/` zitiert,
> nie neu erfunden. Weicht ein Name hier ab, gilt `../domain/` — diese Dateien sind dann zu
> korrigieren, außer die Abweichung ist in
> `abweichungen-und-offene-punkte.md` §13 ausdrücklich als **Korrektur am Domänenmodell**
> markiert.

> **Sprachregelung.** Dokument deutsch, alle Bezeichner englisch (ADR-012). UI-Label für
> `Household` ist in v1 durchgängig **„WG"** (E-02). Sichtbarer Text auf den Bildschirmen folgt
> zusätzlich der UI-Vokabular-Übersetzung nach U-24 — **die als Tabelle noch fehlt, siehe die
> Notiz zu O-G weiter oben.**

> **Herkunft.** Setzt die Entscheidungen **U-1 bis U-26** aus `../08-UX-Entscheidungen.md` um.
