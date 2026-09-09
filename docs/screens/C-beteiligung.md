> **Quelle:** `../07-Screen-Inventar.md` §7–8, Gruppe C (Stand V0.1, eingefroren 2026-09-09)
> **Gruppe:** C — Beteiligung (eigene Aufgaben)
> **Schema-Autorität:** Alle Feld-, Zustands- und Entitätsnamen sind aus `../domain/`
> zitiert, nie neu erfunden.

### C — Beteiligung

Alle acht Bildschirme dieser Gruppe sind **vollständig auf dem Telefon bedienbar, einhändig, ohne
Querformat** — eine Handlung pro Bildschirm, keine horizontal scrollende Tabelle.

#### C1 · Screening-Durchlauf ⚡

| | |
|---|---|
| **Zweck** | Die häufigste Handlung der Anwendung: Stimme zur Einladung (`stage = invite`) |
| **Zugang** | Direkt nach A3/A4, sonst aus dem primären CTA (T-5) |

**Kernelemente**

- Karte für Karte eine der vier Stufen wählen: Nein / Eher nicht / Finde gut / Unbedingt (E-07)
- Jederzeit revidierbar, solange die Runde offen ist
- Fortschrittsanzeige „2 von 8"
- Nach der letzten Karte: falls eigene „Unbedingt" > `budget`, Übergang zu C2 — sonst direkt zur
  Rangliste (D1)

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Leer | „Nichts wartet auf dich" — keine offene Bewerbung |

---

#### C2 · Zweiter Durchlauf

| | |
|---|---|
| **Zweck** | Ersetzt den früher geplanten eigenen Feinschliff-Bildschirm (§9) — reduziert eigene „Unbedingt"-Stimmen auf ein umsetzbares Maß |
| **Zugang** | Nur nach C1, nur falls `Unbedingt-Zahl > budget` |

**Kernelemente**

- Zwischenschritt mit **einem** Satz: „Du hast 8-mal *Unbedingt* vergeben. Bei 3 Zimmern helfen
  höchstens 5. Noch einmal durchgehen?" — „Durchgehen" / „Überspringen"
- Bei „Durchgehen": derselbe Kartenstapel, nur die eigenen Unbedingt-Karten, dieselben vier Stufen
- Jederzeit abbrechbar, Stimmen bleiben dann unverändert

Details zu `budget` und der Ablaufsequenz: §9.

---

#### C3 · Runde 2 — Zusage-Abstimmung

| | |
|---|---|
| **Zweck** | Stimme zur Zusage (`stage = offer`), optional mit `Veto` |
| **Zugang** | Aus dem primären CTA (T-4), nach Casting einer Bewerbung |

**Kernelemente**

- Gleiche vierstufige Skala wie C1, andere Karten-Menge (nur gecastete Bewerbungen)
- `Veto`-Option mit Pflicht-Begründung
- Veto-Budget-Zähler sichtbar, wenn nahezu erschöpft

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Veto gesetzt | Kandidat rankt tief, wird **nicht** gelöscht (E-11) |
| Veto-Budget erschöpft | Hinweis mit Zähler, Stimme ohne Veto bleibt möglich |

---

#### C4 · Casting-Notiz schreiben

| | |
|---|---|
| **Zweck** | Strukturierte Eindrücke zu einem Casting festhalten — Grundlage für Runde 2 der Abwesenden |
| **Zugang** | Aus T-1 im primären CTA, oder direkt von der Kandidaten-Einzelansicht (D2) |

**Kernelemente**

- Strukturierte Prompts statt freiem Textfeld
- Für alle Rundenteilnehmenden lesbar (nicht selbst-redigiert für Dritte)
- Setzt `AppointmentAttendance.note_written = true` (S-46)

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Leer (fremde Notizen, Kandidaten-Ansicht) | „Keine Notizen vorhanden" statt eines leeren Felds, wenn niemand geschrieben hat |

---

#### C5 · Verfügbarkeit eintragen

| | |
|---|---|
| **Zweck** | Eigene `AvailabilityWindow`s für die Terminfindung angeben |
| **Zugang** | Aus T-3 im primären CTA |

**Kernelemente**

- Raster oder Freitext mit Bestätigung
- Speist die Heatmap in O7

---

#### C6 · Slot-Reaktion

| | |
|---|---|
| **Zweck** | Auf einen Terminvorschlag reagieren: 👍 oder „kann nicht" |
| **Zugang** | Aus T-2 im primären CTA |

**Kernelemente**

- Ein `Slot`, eine binäre Antwort
- Ergebnis speist das Zustimmungsbild in O9/O10

---

#### C7 · Push-Berechtigung erteilen

| | |
|---|---|
| **Zweck** | Web-Push aktivieren — eigener Bildschirm, kein Systemdialog nebenbei (S-28) |
| **Zugang** | Nach der ersten abgegebenen Stimme, einmalig |

**Kernelemente**

- Erklärt in einem Satz, wofür Push genutzt wird, bevor der Systemdialog erscheint
- Erst **nach** der ersten `Vote` gezeigt — vorher gibt es nichts zu benachrichtigen, und jede
  Hürde davor geht gegen die Kernmetrik

---

#### C8 · „Ich kann doch nicht" — Terminabsage

| | |
|---|---|
| **Zweck** | Kurzfristige Absage einer einzelnen Person zu einem Termin, an dem sie eigentlich teilnehmen wollte (U-23) |
| **Zugang** | Aus der Terminerinnerung vor einem `Appointment` |

**Kernelemente**

- Ein Knopf, eine Bestätigung — kein Formular
- Setzt die Person auf „nicht anwesend" für diesen Termin, ohne den ganzen `Appointment.status` zu
  ändern

> **Datenmodell-Lücke, nicht Oberflächen-Lücke.** Die kurzfristige Absage einer einzelnen Person
> ist heute in `04-Domaenenmodell.md` nicht modelliert — `Appointment.status` gilt nur für den
> ganzen Termin (B-3 im Sprint-Log). Dieser Bildschirm setzt das Feld voraus, das die
> Domänenmodell-Sitzung dafür ergänzt; siehe §13.

---
