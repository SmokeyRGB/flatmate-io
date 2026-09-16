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
- **Teilnahme-Abschnitt (neu, 2026-09-16, Prototype-User-Test):** sobald die betrachtende Person
  mindestens eine eigene Stimme in der laufenden Runde abgegeben hat, zeigt D1 zusätzlich, welche
  stimmberechtigten `RoundParticipation`-Teilnehmenden bereits abgestimmt haben — nur Teilnahme,
  nie der Inhalt der Stimme. Ausnahme von der „kein Pranger"-Regel aus `02-SRD.md` §10, dort mit
  Begründung dokumentiert. B4 (Teilnehmendenliste) bleibt davon unberührt und zeigt weiterhin
  keinen Abstimmungsstatus.
- Zugriff auf D2, D3, D4
- Einstieg in B4 über „5 von 7 haben abgestimmt"

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Leer | Noch keine Bewerbung in dieser Runde — Rundenstand aus §3 statt einer leeren Liste (analog B1) |
| Eigene Stimme fehlt | Ergebnisse verdeckt mit Erklärung, Sprung in C1/C3. **Der Hinweis ist bildschirmweit an den Zustand gebunden, nicht an einzelne Kandidatenkarten:** solange irgendeine eigene Stimme in der Runde fehlt, erscheint er; sobald die letzte eigene Stimme abgegeben ist, verschwindet er vollständig — er darf nicht als statischer Untertitel unabhängig vom Abstimmungsfortschritt stehen bleiben (im Prototyp beobachteter Fehler, 2026-09-16) |

---

#### D2 · Kandidaten-Einzelansicht

| | |
|---|---|
| **Zweck** | Detailansicht einer Bewerbung mit Stimmen, Notizen und Aggregat |
| **Zugang** | Aus D1 |

**Kernelemente**

- Lädt Stimmen, Notizen und Aggregat erneut mit Policy-Prüfung — übernimmt nichts ungeprüft aus D1
- Zugriff auf C4 (Notiz schreiben/lesen)
- Verteilung der vier Stufen als Aggregat (`03-PRD.md` §4.1.6). **Optional, Haushaltseinstellung
  `reveal_vote_authorship` (Default aus, `domain/identity.md`):** zeigt zusätzlich zum Aggregat je
  Stimme den Namen der abstimmenden Person. Selbst-Redaktion (G-D1) hat in jedem Fall Vorrang —
  die Einstellung ändert nichts an den Leseregeln für die eigene, verknüpfte Bewerbung. Der
  Auskunftsexport (G-D6) bleibt unabhängig von dieser Einstellung immer ohne Urheberschaft.

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Selbst-Redaktion greift | Kann für die betroffene Person nicht auftreten — die eigene Bewerbung führt stattdessen auf D3 |
| Eigene Stimme zu diesem Kandidaten fehlt (V-4) | Score, Balken, Stimmenzahl und Rangplatz verdeckt, mit Erklärung und direktem Weg zur Stimmabgabe (`03-PRD.md` §4.1.6). Bisher nur für D1 in der Zusammenfassungstabelle geführt — gilt identisch auch hier |

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
