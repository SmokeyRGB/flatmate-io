> **Quelle:** `../07-Screen-Inventar.md` §9, §10, §13–§15 (Stand V0.1, eingefroren 2026-09-09)
> **Schema-Autorität:** Alle Feld-, Zustands- und Entitätsnamen sind aus `../domain/`
> zitiert, nie neu erfunden.

## §9 — Der zweite Durchlauf statt eines Feinschliff-Screens

Statt eines eigenen Vergleichsbildschirms (bisher `03-PRD.md` §4.1.5, „Unbedingt"-
Kandidaten **nebeneinander, direkt herabstufbar") ein zweiter kurzer Durchlauf über die eigenen
„Unbedingt"-Karten, im selben Muster wie das Screening (C1/C2).

**Warum das die Design-Lücke schließt, statt sie zu füllen.** Der `review-log.md` nennt den
Feinschliff „die einzige wirklich neue Interaktion des Produkts" und markiert das fehlende Design
🔴. Ein zweiter Durchlauf **beseitigt die Neuheit**, statt sie zu gestalten — niemand lernt eine
zweite Bedienweise. Damit fällt die Lücke weg, statt offen zu bleiben.

**Ablauf:**

1. Letzte Karte des Screenings (C1) ist bewertet
2. Nur falls eigene „Unbedingt" > `budget`: Zwischenschritt (C2, Schritt 2) — „Durchgehen" oder
   „Überspringen"
3. Bei „Durchgehen": derselbe Kartenstapel, nur die eigenen Unbedingt-Karten, dieselben vier
   Stufen, Fortschritt „2 von 8"
4. Danach die Rangliste (D1)

**Was bleibt:** `budget = max(1, ceil(offene Zimmer × 1,5))` · nur sichtbar, wenn überschritten ·
jederzeit abbrechbar, Stimmen bleiben dann unverändert · in `HouseholdSettings` abschaltbar.

E-08 selbst bleibt gültig — seine Begründung („die Korrektur passiert dort, wo alle Karten bekannt
sind") trägt den zweiten Durchlauf genauso wie das nebeneinanderliegende Layout, das er ersetzt.

---

## §10 — Erstbeitritt: so wenig wie möglich, aber ehrlich über das Risiko

**Der Weg.** S-03 schreibt „nur Name und Passwort als Pflichtfelder" und verbietet ein
E-Mail-Pflichtfeld im Beitrittsformular ausdrücklich. Beitrittslink öffnen → **ein** Bildschirm mit
**zwei** Feldern (Name, Passwort) → direkt in den Screening-Durchlauf. Dazu ein Kontrollkästchen
„Auf diesem Gerät angemeldet bleiben", vorbelegt. Kein Passkey während der Registrierung, keine
Verifikation, kein Zwischenbildschirm (A3, §7).

**Zwei Wege hinein, nicht einer:**

| Weg | Wer | Was dabei passiert |
|---|---|---|
| **Haushalts-Beitrittscode** (`join_code`, S-03, A3) | bestehende Mitbewohnende | `ResidentProfile` + `Membership` entstehen; **keine** Verknüpfung zu einer Bewerbung |
| **Einladungstoken** (`ApplicationInviteToken`, S-42, A4) | wer gerade zugesagt hat und einzieht | einmalig verwendbar; setzt `became_resident_id` automatisch — der reguläre Weg |

O6 (frühere Bewerbung zuordnen) bleibt trotzdem nötig, aber in kleinerer Rolle: für alle Fälle
**ohne** Token — ältere Bewerbungen derselben Person, nachträgliche Korrekturen. Das Inventar
trennt beide Wege (A4 vs. O6), sonst wirkt O6 wie eine überflüssige Dopplung.

**Was das kostet — und wie es aufgefangen wird:**

| Folge | Auffangen |
|---|---|
| Ohne E-Mail keine Wiederherstellung durch die Person selbst | Die Verwaltung kann das Passwort zurücksetzen (E1, Kasten) — ein bewusster, dokumentierter Tauschhandel |
| Ohne E-Mail keine E-Mail-`Notification`, Push braucht erst eine Erlaubnis (S-28) | E-Mail wird später angeboten (E1), wo sie nützt — nie als Sperre |
| `Account.email` sollte optional werden | Bereits erledigt: das Feld ist `text?` — Pflicht beim Haushalts-Admin-Account (A1), nullable bei Resident-Accounts. Offen bleibt die Anmeldekennung für Resident-Accounts ohne E-Mail (O-D, siehe A2) |

**Sicherheit des Einladungslinks — jetzt tragend, nicht ergänzend.** „Sicherheit durch gezielte
Einladung" macht den `join_code` zur **einzigen** Zugangskontrolle: keine E-Mail, keine
Verifikation, kein zweiter Faktor. Wer ihn hat, kann beitreten und mitstimmen. Die drei Auflagen
auf O16 (Warnhinweis, Ablauf, Nutzungsgrenze) sind deshalb keine Zugabe, sondern das, was die
Formel überhaupt trägt — Details dort.

Von den vier ursprünglichen strukturellen Missbrauchsschutz-Elementen aus E-06 fallen zwei mit der
Trennung in Teilnehmendenliste (B4) und Bewohnerliste (O16) weg: Bewohnende sehen die volle Liste
nicht mehr und können niemanden mehr entfernen. Übrig bleiben der Feed-Eintrag „X ist beigetreten"
und die Bewohnerzahl im Nenner. Die drei O16-Auflagen sind damit nicht mehr Ergänzung zur sozialen
Kontrolle, sondern weitgehend ihr Ersatz — und keine davon steht dem beitretenden Bewohner im Weg,
sie wirken alle auf O16, nie auf A3/A4.

---

## §13 — Abweichungsliste gegen die bestehende Kette

> **Der Status offener Punkte steht ausschließlich im Register in `review-log.md`.** Dieser
> Abschnitt führt die Frage und ihre Begründung; ob sie offen ist, entscheidet das Register.
> Geschlossene Zeilen bleiben durchgestrichen stehen — die Begründung ist der wertvollere Teil.

Diese Liste ist die Arbeitsvorlage für die drei parallelen Nachzug-Dokumente
(`02-SRD.md`, `03-PRD.md`, `04-Domaenenmodell.md`). Jede Zeile nennt die Stelle in der bestehenden
Kette, die diesem Inventar widerspricht oder die es voraussetzt.

| # | Abweichung | Betroffenes Dokument | Auflösung hier | Status |
|---|---|---|---|---|
| AW-1 | Fünf Tabs (Runde · Bewerbungen · Termine · Feed · Ich) | `03-PRD.md` §4.1.0 | §4.1 — zwei Tabs + Kopfzeile | ✅ nachgezogen in `03-PRD.md` V0.6 |
| AW-2 | „Rundenphase" als Begriff, den es als Zustand nicht gibt | 03-PRD.md §4.1.4/§4.1.6/§4.2.4 | §3.1 — Terminologie auf `stage` (`invite`/`offer`) korrigiert | ✅ nachgezogen in `03-PRD.md` V0.6 |
| AW-3 | `phase_deadline_at` beruft sich auf eine Rundenphase ohne Berechnungsregel | 04-Domaenenmodell.md (B-1 im Sprint-Log) | §3.1 liefert die fehlende Formel — **Korrektur am Domänenmodell**, nicht nur am Inventar | ✅ nachgezogen in `04-Domaenenmodell.md` V0.4 |
| AW-4 | PWA-Install-Hinweis „weiter oben einsortiert, aus demselben Grund wie eine näher rückende Rundenfrist" | 04-Domaenenmodell.md (B-2 im Sprint-Log) | §2.3/§7.6 — eigenes Band unter dem CTA, nie Teil der Aufgabensortierung. **Bestätigter Fehler im Domänenmodell**, dort zu korrigieren | ✅ nachgezogen in `04-Domaenenmodell.md` V0.4 |
| AW-5 | Feinschliff-Bildschirm mit „Unbedingt"-Kandidaten nebeneinander, direkt herabstufbar | 03-PRD.md §4.1.5 | §9 — zweiter Durchlauf ersetzt den eigenen Bildschirm | ✅ nachgezogen in `03-PRD.md` V0.6 |
| AW-6 | „acting_profile_id = null" als Auslöser von Verwaltungsrechten (frühere Planformulierung) | — (in diesem Dokument selbst korrigiert) | §4.2 — Rechte kommen ausschließlich aus `role`/`permissions` | ✅ in diesem Dokument selbst korrigiert |
| AW-7 | Bewohnerliste als eine Liste, für alle sichtbar, jedes Mitglied kann entfernen | 02-SRD.md S-05 | §7 (B4/O16) — zwei getrennte Listen mit unterschiedlichen Rechten. `01-Problem-Framing.md` E-06 bleibt als historischer Beschluss unverändert stehen — spätere Festlegungen leben laut eigener Regel des Dokuments als S-Zeilen im SRD; nur dessen Begründung ist durch U-22 teilweise überholt | ✅ in diesem Dokument selbst korrigiert |
| AW-8 | `join_code` nur mit Rotation, kein Ablauf, keine Nutzungsgrenze | 04-Domaenenmodell.md (B-4 im Sprint-Log) | §7.16 (O16) — Ablauf und Nutzungsgrenze als Pflicht ergänzt, Rotation bleibt (G-A5 unverändert gültig) | ✅ nachgezogen in `04-Domaenenmodell.md` V0.4 |
| AW-9 | Kurzfristige Absage einer einzelnen Person zu einem Termin nicht modelliert | 04-Domaenenmodell.md (B-3 im Sprint-Log) | §7 (C8/O11) setzt das Feld voraus — Domänenmodell-Sitzung muss es ergänzen | ✅ nachgezogen in `04-Domaenenmodell.md` V0.4 |
| AW-10 | Anwesenheit „von der moderierenden Person nach dem Termin gesetzt" | 04-Domaenenmodell.md `AppointmentAttendance.attended` | §7.11/§7.10 (O10/O11) — Richtung umgekehrt: `attended` startet `true`, Moderation korrigiert nur Ausnahmen | ✅ nachgezogen in `04-Domaenenmodell.md` V0.4 |
| AW-11 | Verwaltung mit vollem Zugriff auf Runden, Bewerbungen, Termine, Notizen | 03-PRD.md §4.0.1 (Rechtematrix) | §4.3 — Verwaltung ohne `ResidentProfile` erreicht keine Castings, zwei benannte Ausnahmen | ✅ nachgezogen in `03-PRD.md` V0.6 |
| AW-12 | „rein deskriptiv, nie empfehlend" als UI-Textregel unter Berufung auf P-5 | — (frühere Planformulierung) | §7 (Organisation-Einleitung) — Grenze liegt bei Prozess vs. Person, nicht bei beschreibend vs. werbend | ✅ in diesem Dokument selbst korrigiert |
| AW-13 | Bildschirmliste in 03-PRD.md §4.1.13 nennt „Persönliche Einstellungen" und „Passwort/Passkey" als getrennte Ziele | 03-PRD.md §4.1.13 | §7 (E1) — ein Bildschirm mit Abschnitten | ✅ nachgezogen in `03-PRD.md` V0.6 |

> **Stand 2026-09-09 — alle dreizehn Abweichungen sind abgearbeitet.** Die Statusspalte oben
> hält das fest. Eine frühere Fassung dieses Hinweises führte sechs davon noch als offen bzw.
> bewusst stehengelassen (AW-6, AW-7, AW-8, AW-11, AW-12, AW-13) — das war veraltet.

Nummern S-47 bis S-51 (SRD, vergeben laut `Session-Sprint-Log.md` §1) werden in diesem Dokument
zitiert, nicht neu definiert: **S-47** zweiter Durchlauf (§9) · **S-48** Aufgabenmodell mit
Vorrangregel (§2) · **S-49** Einladungslink absichern (§7.16/O16) · **S-50** Verwaltung ohne
Casting-Zugriff (§4.3) · **S-51** Anwesenheit angenommen plus Absage einzelner Personen
(§7.11/§7.24, O10/O11/C8).

---

## §14 — Offene Punkte

> **Der Status offener Punkte steht ausschließlich im Register in `review-log.md`.** Dieser
> Abschnitt führt die Frage und ihre Begründung; ob sie offen ist, entscheidet das Register.
> Geschlossene Zeilen bleiben durchgestrichen stehen — die Begründung ist der wertvollere Teil.

| # | Punkt | Vorschlag | Betrifft |
|---|---|---|---|
| ~~O-A~~ | ~~Passwort-Rücksetzung für Bewohnende ohne E-Mail~~ | Durch den Haushalts-`Account`, mit sichtbarem `ActivityEvent` und Beendigung bestehender Sitzungen | **Geklärt:** `04-Domaenenmodell.md` §10.2 (O-16) — Passwort-Reset über den Haushalts-`Account` |
| ~~O-B~~ | ~~Standardwerte Einladungslink~~ | Ablauf 7 Tage · Nutzungsgrenze = fehlende Bewohnende, beides in `HouseholdSettings` änderbar | **Geklärt:** `04-Domaenenmodell.md` §10.2 (O-15) — Ablauf 7 Tage, Nutzungsgrenze = fehlende Bewohnende |
| ~~O-C~~ | ~~Dauer der „angemeldet bleiben"-Sitzung~~ | Vorschlag 90 Tage mit gleitender Verlängerung; endet bei Passwortwechsel und bei `moved_out` | **Geklärt:** `04-Domaenenmodell.md` §10.2 (O-13) — 90 Tage, gleitend |
| ~~O-D~~ | ~~Womit meldet sich ein Resident-Account ohne E-Mail an? `Account.email` ist bereits nullable, die Anmeldekennung ist nirgends bestimmt~~ | Vorschlag: Haushalt + Anzeigename + Passwort, Eindeutigkeit `(household_id, display_name)` | **Geklärt:** `04-Domaenenmodell.md` §10.2 (O-12) — Haushalt + Anzeigename + Passwort |
| ~~O-E~~ | ~~Wer setzt und verlängert `phase_deadline_at`, gibt es eine Voreinstellung?~~ | Die moderierende Person, ohne Voreinstellung | **Geklärt:** `04-Domaenenmodell.md` §10.2 (O-14) — die moderierende Person, ohne Voreinstellung |
| ~~O-F~~ *(neu)* | ~~Kurzfristige Absage einer einzelnen Person (AW-9) — welches Feld trägt das?~~ | Vorschlag an die Domänenmodell-Sitzung: eine `AppointmentAttendance`-eigene Markierung statt einer Änderung an `Appointment.status`, damit die Notiz-Erinnerung (S-46) korrekt zwischen „war nicht da" und „war da, hat aber nicht geschrieben" unterscheidet | **Geklärt:** `04-Domaenenmodell.md` §10.2 (O-7) — eigene Markierung an `AppointmentAttendance`; schließt S-51, folgt U-23 |

---

## §15 — Nächster Schritt

Dieses Dokument ist das vollständige Deliverable dieses Vorhabens (U-8) — kein Mockup ist
beauftragt. Damit die Kette widerspruchsfrei bleibt, sind drei Anschlüsse nötig, parallel in
Arbeit laut `Session-Sprint-Log.md`:

1. `02-SRD.md` auf V0.5 — Scope-Zeilen S-47 bis S-51, S-11 umformulieren, S-05 ändern (AW-7),
   §6 um eine Beobachtungsmetrik für U-14 ergänzen.
2. `03-PRD.md` auf V0.6 — Navigationsmodell (AW-1), Terminologie `stage` (AW-2), Bildschirmliste
   nach §7–§8 angleichen, neue Inhaltsregel C-10 (Organisation-Einleitung in §7).
3. `04-Domaenenmodell.md` — `phase_hint`-Berechnungsregel als Pseudocode (AW-3), PWA-Hinweis aus
   der Aufgabensortierung herausnehmen (AW-4), `AppointmentAttendance` umdrehen (AW-10),
   kurzfristige Einzelabsage modellieren (AW-9/O-F), `join_code`-Grenzen ergänzen (AW-8),
   Rechteableitung als geschützter Test (§4.2).

Danach: `review-log.md` — Eintrag „Durchgang 2 — Nachlauf Design", die drei 🎨-Lücken schließen,
mit dem Vermerk, dass die 🔴-Lücke (Feinschliff) durch Wegfall der Interaktion geschlossen wurde,
nicht durch ihre Spezifikation (§9). Diese beiden letzten Schritte liegen bei der Koordinationssitzung.

Ein klickbares Low-Fi-Mockup der vier Kernbildschirme (B1, C1, D1, O1) — nach dem Vorbild
dem Screen-Inventar des Schwesterprojekts Notella, Abschnitt „Für das Mockup ausgewählte Bildschirme" (liegt außerhalb dieses Ordners und ist deshalb nicht verlinkt)
— ist ein möglicher, aber nicht beauftragter weiterer Schritt.
