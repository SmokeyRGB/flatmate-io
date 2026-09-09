> **Quelle:** `../07-Screen-Inventar.md` §1–§6, §11, §12 (Stand V0.1, eingefroren 2026-09-09)
> **Gilt für alle Bildschirme.**
> **Schema-Autorität:** Alle Feld-, Zustands- und Entitätsnamen sind aus `../domain/`
> zitiert, nie neu erfunden.

## §1 — Kontext

Die Anforderungskette für Flatmate.io ist dicht (`01-Problem-Framing` → `02-SRD` → `03-PRD` →
`04-Domaenenmodell` → `05-ADRs` → `06-Compliance-Anhang` → `GUARDRAILS`, ~210 Akzeptanzkriterien),
beschreibt aber nirgends, wie sich das als Oberfläche anfühlt. Drei Befunde erklären, warum das
mehr als ein fehlendes Artefakt ist:

1. **Der Rundenkopf hat einen Handlungsaufruf, die Realität hat mehrere.** `03-PRD.md` §4.1.2
   definiert „4 offene Bewerbungen warten auf dich". Aber Stimmen laufen **pro Bewerbung**, nicht
   pro Runde ([`Vote.stage`](../04-Domaenenmodell.md:674)). Ein Bewohner kann gleichzeitig offen
   haben: Stimmen der ersten Runde · Stimmen der zweiten · Verfügbarkeit · Slot-Reaktionen ·
   Casting-Notizen. Welche zuerst dran ist, steht nirgends — das ist die eigentliche Ursache und
   der Gegenstand von §2.
2. **Die Phasenanzeige hat keine Formel.** `phase_hint` ist „abgeleitet, nicht gespeichert"
   geführt, ohne Berechnungsregel — Gegenstand von §3.
3. **Die Navigation ist objektorientiert.** Fünf Tabs (Runde · Bewerbungen · Termine · Feed · Ich)
   spiegeln das mentale Modell des Moderators, nicht des Bewohners, der erst entscheiden muss, wo
   er nachsieht — aufgelöst in §4.

**Struktur dieses Dokuments.** §2–§6 legen die vier tragenden Regeln fest, auf die das
Bildschirmverzeichnis (§7–§8) aufbaut — mit Absicht in dieser Reihenfolge: §3 (Phasenanzeige) muss
vor §2 (Aufgabenmodell) geklärt sein, weil die neue Rundenfrist `phase_deadline_at` sich auf eine
Phase beruft, die erst durch §3 einen Namen bekommt. §9 und §10 vertiefen zwei einzelne Abläufe,
die mehr Erklärung brauchen, als eine Tabellenzeile trägt. §11–§15 schließen mit Sichtbarkeit,
Barrierefreiheit, der Abweichungsliste gegen die bestehende Kette, offenen Punkten und dem
nächsten Schritt.

---

## §2 — Das Aufgabenmodell

**Das Problem in einem Satz.** Ein Bewohner kann mehrere offene Aufgaben gleichzeitig haben, und
bisher legt nichts fest, welche zuerst dran ist.

### 2.1 Sechs Aufgabenarten

Jede mit einer Bedingung, wann sie überhaupt auftaucht:

| # | Aufgabe | Taucht auf, wenn … |
|---|---|---|
| T-1 | Casting-Notiz schreiben | `AppointmentAttendance.attended = true` und `note_written = false` — die Person war bestätigt dabei und hat noch nichts geschrieben (S-46) |
| T-2 | Auf einen Terminvorschlag reagieren | es gibt `Slot`s, zu denen sich das Profil noch nicht geäußert hat |
| T-3 | Verfügbarkeit eintragen | die Terminfindung läuft und die eigenen Zeiten fehlen |
| T-4 | Stimme zur Zusage (`stage = offer`) | jemand ist gecastet und zur Zusage liegt noch keine Stimme vor |
| T-5 | Stimme zur Einladung (`stage = invite`) | es liegen Bewerbungen vor, zu denen noch nicht gestimmt wurde |
| T-6 | Zweiter Durchlauf | T-5 ist erledigt und zu oft „Unbedingt" wurde vergeben (§9) |

### 2.2 Sortierung nach Zeitdruck, nicht nach fester Rangliste

Jede offene Aufgabe bekommt, wo das Modell eines hergibt, ein echtes Datum:

| Aufgabe | Woher das Datum kommt |
|---|---|
| T-4, T-5 Stimmen | `CastingRound.phase_deadline_at` (S-44) — die weiche Frist der Runde, falls gesetzt. Angezeigt als „Stimme ab bis X" bzw. „noch 2 Tage" |
| T-2 Slot-Reaktion | der Termin selbst — danach ist die Reaktion wertlos |
| T-1 Casting-Notiz | der Tag nach dem Casting; danach verblasst die Erinnerung |
| T-3 Verfügbarkeit | sobald jemand eingeladen ist: das Zeitfenster, in dem gecastet werden soll |
| T-6 zweiter Durchlauf | kein Datum |

Sortiert wird: **Aufgaben mit Datum zuerst, die nächstfällige zuoberst.** Aufgaben ohne Datum
danach, in der festen Reihenfolge T-1 · T-2 · T-3 · T-4/T-5 · T-6.

> **Was S-44 hier vereinfacht.** Ohne eine gesetzte Frist müsste die Dringlichkeit einer
> Abstimmung aus dem Einzugsdatum hergeleitet werden. Mit `phase_deadline_at` setzt der Haushalt
> sie stattdessen selbst — und weil er sie setzt, ist sie auch erklärbar, ohne dass das System
> etwas unterstellt. Ist keine Frist gesetzt, fallen T-4 und T-5 in die zweite Gruppe zurück, und
> die feste Reihenfolge greift wie zuvor.
>
> **Und was sie nicht tut.** Die Frist blockiert nichts. Nach Ablauf bleibt die Runde
> entscheidungsfähig — genauso wie das Quorum nur anzeigt und nicht sperrt (S-13). Eine
> abgelaufene Frist verändert nur die Sortierung und den Text („seit 2 Tagen überfällig"), niemals
> die Verfügbarkeit einer Handlung.

**Zwei Dinge erzeugen Zeitdruck:**

1. **Eine harte Frist.** Es gibt ein Datum, nach dem die Aufgabe nichts mehr nützt: der Termin ist
   vorbei, das Veto ist gesperrt, der Einzug hat stattgefunden.
2. **Andere hängen an mir.** Solange eine Person nicht handelt, kommt die Gruppe nicht weiter.
   Ohne Verfügbarkeit lässt sich kein Termin rechnen. Ohne Notiz können Abwesende bei der Zusage
   gar nicht mitentscheiden — Schritt 16 der Belegkette (`03-PRD.md` §4.0.2), als
   zentraler Schmerzpunkt markiert.

**Die App nennt den Grund.** Neben jeder Aufgabe steht, warum sie dran ist: „Termin morgen 17:00"
· „Einzug in 9 Tagen" · „4 andere warten auf deine Notiz". Die Reihenfolge ist damit nicht nur
richtig, sondern nachvollziehbar (P-3).

**Beispiel.** Ein Bewohner öffnet die App am Montag. Offen sind: 3 neue Bewerbungen (T-5, kein
Datum) · eine Notiz vom Casting am Samstag (T-1, fällig seit Sonntag) · eine Slot-Reaktion für
Mittwoch (T-2). Reihenfolge: **Notiz** (überfällig) → **Slot** (in 2 Tagen) → **Bewerbungen** (kein
Datum). Der primäre CTA lautet „Notiz zu Lea schreiben — 4 andere warten darauf".

### 2.3 Darstellungsregel

Genau **ein** primärer CTA mit konkreter Zahl und direktem Ziel · darunter bis zu **drei** Zeilen
· der Rest eingeklappt als „und N weitere". Ist nichts offen, steht dort der Rundenstand — nie eine
leere Fläche. T-6 erscheint nie neben T-5, weil es dessen Folgeschritt ist.

**Moderations-Brücke.** Eine einzelne Zeile am Fuß der Aufgabenliste, nur sichtbar für Profile mit
Rechten, nie in die persönliche Liste gemischt: „3 Dinge brauchen deine Moderation →" (U-5). Führt
direkt in die Organisationsfläche (§4.2), nicht in eine Übersicht.

**Schließt P-O-05** (`03-PRD.md` §8): Der Durchlauf arbeitet auf der Menge, die
beim Öffnen feststand; T-5 rechnet beim nächsten Öffnen neu.

---

## §3 — Die Phasenanzeige

**Das Problem.** Oben in der App soll stehen, wo die Runde gerade steht — etwa „Abstimmung
Runde 1". Diese Rundenphase gibt es als Zustand aber nicht: Jede Bewerbung hat ihren eigenen
Zustand, gleichzeitig kann eine bei „Interview", eine bei „Zusage" und eine neu eingegangen sein.
Kein einzelner Zustand stimmt für die ganze Runde.

### 3.1 Berechnungsregel

Die Anzeige wird aus der Bewerbung berechnet, die **am weitesten fortgeschritten** ist:

| Weiteste Bewerbung steht bei … | Anzeige |
|---|---|
| noch keine Bewerbung da | „Warten auf Bewerbungen" |
| `new` / `screened` | „Abstimmung Runde 1" |
| `invited` / `scheduled` | „Terminfindung" |
| `interviewed` | „Abstimmung Runde 2" |
| `offer_made` / `moved_in` | „Zusage läuft" |

**Seitenzustände zählen nicht als Fortschritt.** `rejected_by_household`, `declined_by_applicant`,
`withdrawn` und `archived` sind Sackgassen, keine Stationen auf dem Hauptpfad — eine Bewerbung
darin ist nicht „am weitesten fortgeschritten", sie ist aus der Berechnung heraus. Sind **alle**
Bewerbungen einer Runde in einem Seitenzustand, gilt dieselbe Anzeige wie bei noch keiner
Bewerbung: „Warten auf Bewerbungen". (Wortgleich mit der Regel in
[04-Domaenenmodell.md §8.6](../04-Domaenenmodell.md), dort als `MAIN_PATH_ORDER`-Pseudocode geführt —
zwei Fassungen derselben Regel, keine zwei Regeln.)

**Warum das allein nicht reicht.** Bei 20 Bewerbungen, von denen erst eine bei „Zusage" steht, wäre
„Zusage läuft" irreführend. Deshalb steht **darunter immer die tatsächliche Verteilung**: „7 in
Sichtung · 2 im Termin · 1 gecastet".

**Was die Anzeige nicht ist: ein Tor.** Sie sperrt nichts und verbirgt nichts. Eine Bewerbung
weiterzuschieben ist immer möglich, unabhängig davon, was oben steht.

> **Verworfene Alternative:** „wo die Masse liegt" statt „am weitesten". Verworfen, weil dann die
> dringendste Entscheidung der Runde unsichtbar würde, sobald sie nur eine Bewerbung betrifft.

### 3.2 Geltungsbereich der Rundenfrist

`phase_deadline_at` ist ein **einzelnes** Feld auf der Runde und heißt „Frist der aktuellen
Rundenphase". Daraus folgt zwingend: Es gibt **immer nur eine Frist gleichzeitig**, und sie gehört
zu genau der Phase, die die Berechnungsregel oben nennt. Die moderierende Person setzt sie; wenn
die Phase wechselt, setzt sie eine neue — automatisch geschieht nichts (O-E).

Die Frist wird deshalb **nie allein angezeigt**, sondern immer zusammen mit ihrer Phase:
„Abstimmung Runde 1 — noch 2 Tage" statt „noch 2 Tage". Zwei Regeln sichern das:

- **Wechselt die Phase, während eine Frist läuft**, bleibt die alte Frist stehen und wird als „aus
  der vorherigen Phase" gekennzeichnet, bis jemand sie ändert oder löscht. Sie still zu übernehmen
  wäre falsch (sie war für etwas anderes gedacht), sie still zu löschen ebenso (eine Absprache
  verschwände ohne Anlass).
- **Die Organisationsfläche weist darauf hin**, wenn die Phase gewechselt hat und die Frist noch
  die alte ist — als Aufgabe, nicht als Warnung.

> **Warum §3 vor §2 geklärt sein muss.** `phase_deadline_at` beruft sich auf „die aktuelle
> Rundenphase" — ohne die Berechnungsregel oben ist nicht bestimmt, wofür genau die Frist gilt und
> wann sie wechselt. Das war vorher ein Schönheitsfehler der Anzeige; jetzt hängt ein Datenfeld
> daran, das die Sortierung in §2 direkt speist.

---

## §4 — Rahmenwerk: drei Flächen

### 4.1 Übersicht

| Fläche | Rahmenwerk | Wer |
|---|---|---|
| **Zugang** | keine Navigation | vor der Anmeldung |
| **Bewohner** | untere Leiste *Start · Casting* · Kopfzeile *Glocke · Avatar* | jedes `ResidentProfile` |
| **Organisation** | eigene Fläche, kein Tab | wer laut Rechtematrix Rechte hat |

Zwei Tabs statt fünf (K-3): „Runde · Bewerbungen · Termine · Feed · Ich" spiegelte das mentale
Modell des Moderators. Ein Bewohner entscheidet sich nicht zwischen fünf Objekten, sondern
zwischen „was steht an" (Start, §2) und „wie steht die Bewerbungslage" (Casting, §7.4).

**Zwei Wege in die Organisation** — kein eigenes Icon in der Kopfzeile (K-6):

1. **Avatar-Menü** → „In Moderation wechseln"
2. **CTA aus der Benachrichtigung** bzw. aus der Moderations-Brücke im Dashboard (§2.3) — direkt
   auf die Handlung, nicht auf eine Übersicht

### 4.2 Identitätswechsel und Rechte

Der Identitätswechsel wohnt im selben Avatar-Menü. Eine frühere Formulierung — „ist
`acting_profile_id` `null`, handelt man als Verwaltung" — war irreführend: Sie liest sich, als
verliehe ein Null-Wert Rechte. Richtig ist:

- **`Session.acting_profile_id = null`** heißt **nur** „für diese Sitzung ist kein Bewohnerprofil
  aktiv". Mehr nicht.
- **Die Rechte kommen aus `Membership.role`** (`household_admin` · `moderator` · `member`) **und
  `Membership.permissions`** (`manage_settings`, `manage_members`, `close_round`, …). Ein Konto mit
  `role = member` bekommt durch `null` **nichts** dazu — es verliert nur seine Stimmidentität.

**Regel fürs Inventar:** Welche Abschnitte der Organisationsfläche erscheinen, entscheidet
**allein `role`/`permissions`** — nie, ob `acting_profile_id` gesetzt ist (U-21).

> **Geschützter Test (für `GUARDRAILS.md`):** Ein Konto ohne `household_admin` sieht den Abschnitt
> „Haushalt" auch dann nicht, wenn `acting_profile_id` `null` ist.

### 4.3 Verwaltung erreicht keine Castings

Ein ohne Bewohnerprofil angemeldetes Konto erreicht **nur** Haushaltsverwaltung: Zimmer,
Mitglieder, Beitrittscode, Verfahrensregeln, Aufbewahrung (U-20). Runden, Bewerbungen, Termine und
Notizen setzen ein `ResidentProfile` voraus.

Was das löst:

1. **Jede Casting-Handlung trägt einen Namen.** Bisher kann die Verwaltung Bewerbungen anlegen,
   Status ändern, Termine bestätigen und löschen — protokolliert als „Verwaltung", ohne Person. In
   einem Produkt, dessen Versprechen Legitimität ist (P-3), ist das eine Lücke.
2. **Die Sichtbarkeitsregeln werden kleiner.** Wer Beratungsinhalte sehen kann, ist ab jetzt immer
   ein Profil mit `RoundParticipation`.

**Zwei Ausnahmen bleiben bei der Verwaltung** — Pflichten des Verantwortlichen, die nicht an der
Bewohnerlage hängen dürfen: **Aufbewahrung** (verlängern, kürzen, löschen, archivieren) und
**„Datenauskunft erzeugen"**. Letzteres liest zwangsläufig Beratungsinhalte, deshalb als **Export
ohne Einsicht**: die Verwaltung stößt den Export an, sieht die Inhalte aber nicht im Bildschirm.
Jeder Export erzeugt einen `ActivityEvent`.

**Was es kostet — eine Stelle, und die ist lösbar.** „Der Haushalt darf nicht handlungsunfähig
werden", wenn der letzte Moderator auszieht, bleibt wahr — über einen Zwischenschritt: Die
Verwaltung kann sich jederzeit selbst ein `ResidentProfile` anlegen und Moderatoren ernennen
(§7.20, Abschnitt „Haushalt"). Der Weg ist einen Schritt länger und liefert am Ende einen
benannten Handelnden.

> **Nicht als Härtung darstellen.** Die Trennung ist keine Sicherheitsgrenze — wer die
> Haushaltszugangsdaten kennt, kann sich ein Profil anlegen und handeln. Was sich ändert, ist
> **Zurechenbarkeit**, nicht Zugriffsschutz: jede Casting-Handlung hat danach einen Namen.

**Zur Selbst-Redaktion:** Sie hängt am `Account`, nicht am aktiven Profil
(`redaction_subjects()` sammelt alle Profile des Accounts). Ein Identitätswechsel ist deshalb kein
Weg an der Invariante vorbei.

### 4.4 Abschnitte der Organisationsfläche

Runde · Bewerbungen · Termine · Zimmer · Mitglieder · Aufbewahrung · **Haushalt** (nur `Account`:
`ResidentProfile` anlegen, Moderator ernennen, Abstimmungsverfahren, Datenschutzseite freigeben —
G-C9).

---

## §5 — Ereignisklassen

Zwei Klassen, aus `ActivityEvent.event_type` **abgeleitet, nicht gespeichert** — gleiche Bauform
wie `phase_hint` (§3) und `Vote.weight`:

- **`outcome`** — Dinge, die für ein Profil feststehen und nicht selbst ausgelöst wurden:
  bestätigter Termin, erteilte Zusage, Einzugsdatum, Rundenschluss, neue Mitbewohnende. Speist
  „Seit deinem letzten Besuch" auf dem Start-Bildschirm, höchstens fünf Zeilen (§7.6).
- **`process`** — alles Übrige: einzelne Statuswechsel, Codeausgaben, Notizanlagen. Nur im
  Activity Center (§7.7).

Die Zuordnungstabelle für alle Ereignistypen liegt im Domänenmodell (§8, Rechenmodelle). Die
Sichtbarkeitspolicy gilt für beide Klassen unverändert (V-1, G-C6) — einschließlich
`Notification.suppressed_reason = self_redaction` für die Notiz-Erinnerung aus S-46 (G-D13).

**Der Kanal ist eine zweite Achse (S-28).** Reihenfolge: **Push → E-Mail (nur falls hinterlegt) →
In-App.** Zwei Folgen:

1. **Der Normalfall nach dem Beitritt ist „nur In-App".** Wer nach S-03 ohne E-Mail beitritt und
   Push noch nicht erlaubt hat, erreicht keine Benachrichtigung außerhalb der App. Für diese
   Person ist der Start-Bildschirm der einzige Kanal — er muss also ohne jede Erinnerung von außen
   funktionieren.
2. **Push-Berechtigung ist ein eigener Bildschirm** (§7.9), kein Systemdialog nebenbei. Er
   erscheint **nach** der ersten abgegebenen Stimme, nicht davor — vorher gibt es nichts zu
   benachrichtigen, und jede Hürde vor der ersten Stimme geht gegen die Kernmetrik.

---

## §6 — Die vier Pflichtzustände (kein fünfter)

Redigiertes braucht keinen eigenen Zustand — es soll einfach nicht da sein. Ein Feed-Eintrag,
dessen Ziel unsichtbar ist, erscheint für dieses Profil überhaupt nicht, und die eigene Bewerbung
taucht weder in der Rangliste noch unter „Warten auf Stimmen" auf.

**Regel im Inventar:** Redigiertes existiert für dieses Profil nicht. Kein Platzhalter, keine
Lücke, kein Hinweis, keine Zählung, aus der man zurückrechnen könnte.

**Genau eine benannte Ausnahme:** die Detailseite der *eigenen* Bewerbung (§7.13). Dorthin darf
man, weil das Sachprofil sichtbar bleibt (Name, Kontakt, Termin, Zimmer, Einzugsdatum) — und nur
dort wäre die Leere sonst als Ladefehler lesbar. Dort steht der Satz aus
`03-PRD.md` §4.2.5.

Es bleiben **vier** Zustände: **Laden · Leer · Fehler · Keine Berechtigung.**
Standardverhalten zentral:

| Zustand | Standard |
|---|---|
| **Laden** | Skeleton in der Form des erwarteten Inhalts. Nie Vollbild-Spinner, nie Layoutsprung |
| **Leer** | Ein Satz, was hier normalerweise steht, plus die eine sinnvolle Handlung — oder die Erklärung, warum es noch nichts gibt. Nie ohne Anschlusshandlung |
| **Fehler** | Was schiefging in einem Satz ohne Fachjargon, „Erneut versuchen", und die Zusicherung, dass nichts verloren ging |
| **Keine Berechtigung** | Erklärung **warum** plus wer helfen kann, statt einer bloßen Sperre |

Je Bildschirm in §7–§8 nur ausgeschrieben, wo es vom Standard abweicht.

---

## §11 — Sichtbarkeit als Anzeigeregeln

Jeder Bildschirm mit Beratungsinhalt notiert, was V-1 und V-4 ausblenden — nach der Regel aus §6:
Ausgeblendetes existiert nicht, statt leer zu erscheinen.

| Regel | Prädikat | Betroffene Bildschirme |
|---|---|---|
| **V-1 — Selbst-Redaktion** | Beratungsinhalte über die eigene Bewerbung sind für die betroffene Person dauerhaft unsichtbar, unabhängig vom Rundenstatus | D1 (Ausschluss aus Rangliste/„Warten auf Stimmen"), D2 (führt stattdessen auf D3), B3 (Feed-Eintrag erscheint nicht), C4 (eigene Notizen anderer bleiben unsichtbar) |
| **V-2 — Rundensichtbarkeit** | Beratungsinhalte nur für Profile mit `RoundParticipation` an dieser Runde | C1–C4, D1, D2, O4, O5 |
| **V-3 — Entzug bei `moved_out`** | Sofortiger Zugriffsentzug, Quorum-Nenner sinkt | alle Beteiligungs- und Casting-Tab-Bildschirme |
| **V-4 — Ergebnisse verdeckt bis zur eigenen Stimme** | Score und Rangliste bleiben verdeckt, bis die Person selbst gestimmt hat | D1 |

Für jeden Bildschirm mit Beratungsinhalt in §7–§8 ist das über die Spalte „Abweichende Zustände"
bzw. den Fließtext ausgeschrieben, wo eine Regel greift; die Standardregel gilt sonst stillschweigend.

---

## §12 — Barrierefreiheit

- **Nie Farbe allein.** Zustandskennzeichnungen (Bewerbungsstatus, Slot-Zusagen, Quorum-Fortschritt)
  immer Symbol **und** Text.
- **Textentsprechung der vierstufigen Skala** (C1, C2, C3): Stufen sind benannt („Nein" · „Eher
  nicht" · „Finde gut" · „Unbedingt"), nie nur als Balken oder Farbverlauf dargestellt.
- **Tastaturbedienung des Durchlaufs** (C1–C3): ↑/↓ oder Zifferntasten zwischen den vier Stufen,
  Enter bestätigt, kein Bildschirm setzt Hover voraus (§4.1.0-Kriterium bleibt gültig).
- **Fokusreihenfolge** folgt der visuellen Reihenfolge auf allen Beteiligungs-Bildschirmen; der
  primäre CTA auf B1/O1 ist das erste fokussierbare Element nach der Kopfzeile.
- **Fehlertexte ohne Fachjargon** (§6) sind zugleich eine Barrierefreiheits-Anforderung: sie dürfen
  keine Modellbegriffe ohne Übersetzung (§8.6) enthalten.

---
