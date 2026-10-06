> **Quelle:** `../07-Screen-Inventar.md` §7–8, Gruppe D (Stand V0.1, eingefroren 2026-09-09)
> **Gruppe:** D — Casting-Tab (Gruppenstand lesen)
> **Schema-Autorität:** Alle Feld-, Zustands- und Entitätsnamen sind aus `../domain/`
> zitiert, nie neu erfunden.

### D — Casting-Tab

#### D1 · Rangliste ⚡

| | |
|---|---|
| **Zweck** | Bewerbungslage überblicken und in eine Bewerbung einsteigen |
| **Zugang** | Unterer Tab „Casting" |

**Kernelemente**

- **Drei Gruppen** auf einer Rangliste (Menschenentscheidung Q-3, 2026-10-05, und Rundgang
  2026-10-06; vormals: eine Liste mit einem Etikett „Eingeladen" je Zeile). Eine Gruppe ohne Zeile
  erscheint nicht; der leere Zustand nur, wenn alle drei leer sind:
  - **„Score"** (Bewerbungen `new`/`screened`): Zeilen mit Quorum zuerst, jede mit einem
    **Kreis-Fortschrittsring** (Score in der Mitte) und „aus x Stimmen"; kein Rangplatz, keine
    Verteilung (die steht in D2, Q-10).
    - Die ersten N Zeilen **dieser Gruppe**, N = Zahl der offenen Zimmer der Runde, tragen eine
      leise, langsam wandernde Hervorhebung (R-6/Q-15); bei reduzierter Bewegung eine statische
      Tönung. In den anderen Gruppen gibt es keine Hervorhebung.
    - Zeilen unter Quorum **unten**, älteste Bewerbung zuerst, ohne Score und ohne Ring, mit dem
      Hinweis, der die echte Schwelle nennt („Noch kein Score — für ein faires Bild braucht es
      mindestens {n} Stimmen (bisher {k}).").
  - **„Eingeladen"** (Bewerbungen `invited`, Menschenentscheidung 2026-10-06): dieselbe Zeile mit
    Ring, aber ohne Hervorhebung. Wer eingeladen ist, wird nicht mehr entschieden. Die Gruppe kann
    später ein eigener Reiter werden (siehe die Idee „Casting-Tab nach Stufe unterteilt" im
    Register).
  - **„Verdeckt"**: Zeilen **grau darunter**, mit durchgestrichenem Auge (eye-off) und dem einen
    Hinweis „Verdeckt — du hast hier nicht abgestimmt" (R-7, neu gefasst 2026-10-06): verdeckt sind
    nur noch Bewerbungen in `new`/`screened`, auf die die Person nicht abgestimmt hat. Hat eine
    Bewerbung diese Zustände verlassen, sieht jede teilnehmende Person ihr Ergebnis; eine pausierte
    Runde deckt nichts auf.
  - Ein bildschirmweites „(?)" nennt die eingefrorenen Gewichte, die Formel und die
    Quorum-Regel mit den echten Zahlen (P-3).
  - *Sortierumschalter (FR-5.14) und die Markierung „seit deiner Stimme geändert" folgen mit F5
    Änderung 5; die Einzelansicht mit Rechenweg und „5 von 7" mit Änderung 2.*
- **Teilnahme-Abschnitt (neu, 2026-09-16, Prototype-User-Test):** sobald die betrachtende Person
  mindestens eine eigene Stimme in der laufenden Runde abgegeben hat, zeigt D1 zusätzlich, welche
  stimmberechtigten `RoundParticipation`-Teilnehmenden bereits abgestimmt haben — nur Teilnahme,
  nie der Inhalt der Stimme. Ausnahme von der „kein Pranger"-Regel aus `02-SRD.md` §10, dort mit
  Begründung dokumentiert. B4 (Teilnehmendenliste) bleibt davon unberührt und zeigt weiterhin
  keinen Abstimmungsstatus.
- Zugriff auf D2, ~~D3~~, D4 *(D3 gestrichen, Q-9)*
- Einstieg in B4 über „5 von 7 haben abgestimmt"

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Leer | Noch keine Bewerbung in dieser Runde — ein Satz, der die Runde nennt, plus ein Weg zurück zu Start (human-approved 2026-10-06; Rundenstand aus §3 statt einer leeren Liste, analog B1). Eine Rangliste, die nur durch die eigene Bewerbung leer ist, zeigt denselben leeren Zustand, nie einen Grund, der auf einen versteckten Eintrag schließen ließe (F-5) |
| Eigene Stimme fehlt | **Behandelt die Weiterleitung nach C1** (Menschenentscheidung Q-2, 2026-10-05): solange irgendetwas in einer offenen Runde auf die eigene Stimme wartet, führt der Casting-Tab in den Durchlauf. Die Rangliste ist daher erst erreichbar, wenn nichts mehr wartet, und braucht keinen Hinweis. **Der frühere Anspruch bleibt der Maßstab:** der Hinweis darf nie als statischer Untertitel unabhängig vom Abstimmungsfortschritt stehen bleiben (im Prototyp beobachteter Fehler, 2026-09-16) |

---

#### D2 · Kandidaten-Einzelansicht

| | |
|---|---|
| **Zweck** | Detailansicht einer Bewerbung mit Stimmen, Notizen und Aggregat |
| **Zugang** | Aus D1 |

**Kernelemente**

- Lädt Stimmen, Notizen und Aggregat erneut mit Policy-Prüfung — übernimmt nichts ungeprüft aus D1
- Zugriff auf C4 (Notiz schreiben/lesen)
- Verteilung der vier Stufen als Aggregat (`03-PRD.md` §4.1.6), Rechenweg des Scores und „5 von 7" je Bewerbung (Q-5, Q-10; F5 Änderungen 2 und 3). **Optional, Haushaltseinstellung
  `reveal_vote_authorship` (Default aus, `domain/identity.md`):** zeigt zusätzlich zum Aggregat je
  Stimme den Namen der abstimmenden Person. Selbst-Redaktion (G-D1) hat in jedem Fall Vorrang —
  die Einstellung ändert nichts an den Leseregeln für die eigene, verknüpfte Bewerbung. Der
  Auskunftsexport (G-D6) bleibt unabhängig von dieser Einstellung immer ohne Urheberschaft.

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Selbst-Redaktion greift | Kann für die betroffene Person nicht auftreten — die eigene Bewerbung wird wie eine nicht vorhandene verweigert (Q-9; vormals: führte auf D3) |
| Eigene Stimme zu diesem Kandidaten fehlt (V-4) | Score, Balken, Stimmenzahl und Rangplatz verdeckt, mit Erklärung und direktem Weg zur Stimmabgabe (`03-PRD.md` §4.1.6). Bisher nur für D1 in der Zusammenfassungstabelle geführt — gilt identisch auch hier |

---

#### ~~D3 · Eigene Bewerbung~~ — gestrichen

> **Gestrichen 2026-10-05, Menschenentscheidung Q-9 (F5 V1.1).** Die eigene Bewerbung existiert für
> die betroffene Person nicht: Rangliste und Einzelansicht verweigern sie wie eine nicht vorhandene.
> Es gibt keine eigene Karte und keinen Hinweistext. Die ID D3 bleibt vergeben; die eingefrorene
> `07-Screen-Inventar.md` führt D3 weiter, diese lebende Datei hat Vorrang.

| | |
|---|---|
| ~~**Zweck**~~ | ~~Die einzige benannte Ausnahme vom „existiert nicht" der Selbst-Redaktion (§6) — Sachprofil ohne Beratungsinhalte~~ |
| ~~**Zugang**~~ | ~~Aus D1, sobald die eigene Bewerbung `became_resident_id` gesetzt hat~~ |

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
