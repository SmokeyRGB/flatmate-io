> **Quelle:** `../07-Screen-Inventar.md` §7–8, Gruppe B (Stand V0.1, eingefroren 2026-09-09)
> **Gruppe:** B — Start (Bewohner-Startfläche)
> **Schema-Autorität:** Alle Feld-, Zustands- und Entitätsnamen sind aus `../domain/`
> zitiert, nie neu erfunden.

### B — Start

#### B1 · Start — „Was ist dran?" ⚡

| | |
|---|---|
| **Zweck** | Beantwortet die Kernfrage beim Öffnen: was steht an. Trägt das Aufgabenmodell aus §2 |
| **Zugang** | Standard-Landeseite für jedes `ResidentProfile` |

**Kernelemente**

- Primärer CTA nach der Sortierung aus §2.2, mit genanntem Grund
- Bis zu drei weitere Aufgabenzeilen, Rest eingeklappt als „und N weitere"
- Phasenanzeige aus §3, nie ohne ihre Frist, falls gesetzt
- „Seit deinem letzten Besuch" — nur `outcome`-Ereignisse (§5), höchstens fünf Zeilen
- **PWA-Install-Band** (S-45) — eigenes, optisch abgesetztes Element **unter** dem primären CTA,
  nie auf dessen Platz und nie über einer fristgebundenen Aufgabe (§13, Konflikt 2)
- Moderations-Brücke am Fuß, nur mit Rechten (§2.3)

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Leer (keine Aufgabe offen) | Rundenstand aus §3 füllt die Fläche — nie leer |

---

#### B2 · Benachrichtigungszentrum

| | |
|---|---|
| **Zweck** | Zugriff auf einzelne Benachrichtigungen und den Einstieg ins vollständige Protokoll |
| **Zugang** | Glocke in der Kopfzeile |

**Kernelemente**

- Liste einzelner `Notification`s, ungelesen hervorgehoben
- Unterpunkt „Alle Aktivitäten" → B3
- Jede Notification führt direkt auf ihr Ziel (Bewerbung, Termin, Runde), nie auf eine
  Zwischenübersicht

---

#### B3 · Activity Center — „Alle Aktivitäten"

| | |
|---|---|
| **Zweck** | Das vollständige `ActivityEvent`-Log — löst U-3/U-4 auf: Start zeigt nur Ergebnisse, hier steht alles |
| **Zugang** | Aus B2 |

**Kernelemente**

- Chronologische Liste beider Ereignisklassen (§5), `process` und `outcome` gemeinsam
- Sichtbarkeitspolicy identisch zu B1 (V-1, G-C6) — Redigiertes erscheint nicht (§6)

---

#### B4 · Teilnehmendenliste

| | |
|---|---|
| **Zweck** | Beantwortet „wer sind die sieben?" — nicht „wer wohnt hier?" (zweite, getrennte Frage: O16) |
| **Zugang** | Tippen auf „5 von 7 haben abgestimmt" auf B1 oder D1 |

**Kernelemente**

- Nur Namen der `RoundParticipation`-Teilnehmenden dieser Runde
- Keine Handlungen — reine Information
- **Zeigt ausdrücklich nicht**, wer schon abgestimmt hat und wer nicht (kein „Pranger"; bereits
  heute Akzeptanzkriterium und SRD §10)

> **Unterschied zu O16 Mitglieder.** „Wer macht gerade mit" und „wer wohnt hier" sind nicht
> dieselbe Frage (K-11, U-22, siehe Vergleichstabelle in §7-Einleitung zu O16).

---
