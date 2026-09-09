> **Quelle:** `../07-Screen-Inventar.md` §7–8, Gruppe D (Stand V0.1, eingefroren 2026-09-09)
> **Gruppe:** D — Casting-Tab (Gruppenstand lesen)
> **Schema-Autorität:** Alle Feld-, Zustands- und Entitätsnamen sind aus `../domain/`
> zitiert, nie neu erfunden.

### D — Casting-Tab

#### D1 · Rangliste — „Warten auf Stimmen" ⚡

| | |
|---|---|
| **Zweck** | Bewerbungslage überblicken und in eine Bewerbung einsteigen |
| **Zugang** | Unterer Tab „Casting" |

**Kernelemente**

- Sortierbare Rangliste mit Score (nach eigener Stimme sichtbar, Standard V-4)
- Abschnitt „Warten auf Stimmen" getrennt von der Rangliste
- Zugriff auf D2, D3, D4
- Einstieg in B4 über „5 von 7 haben abgestimmt"

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Leer | Noch keine Bewerbung in dieser Runde — Rundenstand aus §3 statt einer leeren Liste (analog B1) |
| Eigene Stimme fehlt | Ergebnisse verdeckt mit Erklärung, Sprung in C1/C3 |

---

#### D2 · Kandidaten-Einzelansicht

| | |
|---|---|
| **Zweck** | Detailansicht einer Bewerbung mit Stimmen, Notizen und Aggregat |
| **Zugang** | Aus D1 |

**Kernelemente**

- Lädt Stimmen, Notizen und Aggregat erneut mit Policy-Prüfung — übernimmt nichts ungeprüft aus D1
- Zugriff auf C4 (Notiz schreiben/lesen)

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Selbst-Redaktion greift | Kann für die betroffene Person nicht auftreten — die eigene Bewerbung führt stattdessen auf D3 |

---

#### D3 · Eigene Bewerbung

| | |
|---|---|
| **Zweck** | Die einzige benannte Ausnahme vom „existiert nicht" der Selbst-Redaktion (§6) — Sachprofil ohne Beratungsinhalte |
| **Zugang** | Aus D1, sobald die eigene Bewerbung `became_resident_id` gesetzt hat |

**Kernelemente**

- Sachprofil: Name, Kontakt, Termin, Zimmer, Einzugsdatum
- **Keine** Stimmen, Notizen oder Score — mit dem Satz aus `03-PRD.md` §4.2.5, damit
  die Leere nicht als Ladefehler gelesen wird

---

#### D4 · Termine

| | |
|---|---|
| **Zweck** | Einzugstermin und `Appointment`s der Runde überblicken |
| **Zugang** | Aus D1 oder dem Terminhinweis auf B1 |

**Kernelemente**

- Übersicht aller Runden-Termine, chronologisch

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Leer | Kein Termin geplant |

---
