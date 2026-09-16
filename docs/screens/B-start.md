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

> **Entschieden (2026-09-15): der Moment nach der letzten eigenen Stimme wird anerkannt, nicht
> nur gemeldet.** Ist der Grund für den leeren Zustand, dass die Person gerade ihre letzte
> offene Bewerbung dieser Runde bewertet hat, bekommt der Rundenstand aus §3 einen kurzen,
> anerkennenden Satz voran — sinngemäß „Stark gemacht — du hast alle Bewerbungen bewertet!",
> genauer Wortlaut offen (vgl. P-O-04). Andere leere Zustände (z. B. noch keine Bewerbung
> eingegangen, oder Runde ohne offene Aufgabe für dieses Profil aus anderem Grund) bekommen
> diesen Satz **nicht** — er gehört zum eigenen Abschluss des Durchlaufs, nicht zur
> allgemeinen Leere. Grund für die Entscheidung: aus einem Usability-Test hervorgegangen, der
> bemängelte, dass die reine Rundenstand-Meldung nach dem letzten Tap keine Rückmeldung über
> die eigene Leistung gibt.

---

#### B2 · Benachrichtigungszentrum

| | |
|---|---|
| **Zweck** | Zugriff auf einzelne Benachrichtigungen und den Einstieg ins vollständige Protokoll |
| **Zugang** | Glocke in der Kopfzeile |

**Kernelemente**

- Liste einzelner `Notification`s, ungelesen hervorgehoben — Text je `Notification.type` aus dem
  UI-Vokabular (`rahmenwerk.md` §8.6), **nie** ein roher `ActivityEvent`-Zustandsübergang
  („Wechselte von X zu Y"). Letzteres ist B3-Sprache, nicht B2-Sprache — beide Kategorien dürfen
  sich nicht vermischen (im Prototyp beobachteter Fehler, 2026-09-16)
- Unterpunkt „Alle Aktivitäten" → B3
- Jede Notification führt direkt auf ihr Ziel (Bewerbung, Termin, Runde), nie auf eine
  Zwischenübersicht
- Ein neu beigetretenes Profil startet mit **leerem** Ungelesen-Zustand — keine Hervorhebung und
  kein Badge für `Notification`s, die vor dem eigenen Beitritt entstanden sind, analog zum
  `RoundParticipation`-Snapshot-Prinzip (E-13)

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
