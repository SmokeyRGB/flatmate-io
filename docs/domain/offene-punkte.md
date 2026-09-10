> **Quelle:** `../04-Domaenenmodell.md` §10 (Stand V0.4, eingefroren 2026-09-09)
> **Schema-Autorität:** Diese Datei. Weicht ein Bezeichner anderswo ab, gilt der hier.

## 10. Offene Punkte

> **Ob ein Punkt offen ist, entscheidet das Register in `review-log.md` — und nur dort.** Dieser
> Abschnitt führt die Frage und ihre Begründung; ob sie offen ist, entscheidet das Register.
> Geschlossene Zeilen bleiben durchgestrichen stehen — die Begründung ist der wertvollere Teil.

> **Achtung, zwei Nummernräume.** Dieses Dokument nummeriert `O-1` … `O-16`, `02-SRD.md`
> nummeriert `O-01` … `O-08`. „O-6" hier und „O-06" dort sind **verschiedene Fragen**. Ein
> Verweis nennt deshalb immer die Datei mit.

Geschlossene Liste, damit die offenen Stellen beim Aufsetzen des Repos nicht einzeln gesucht werden
müssen. Die Nummerierung ist stabil: **entschiedene Punkte behalten ihre Nummer** und verschwinden
nicht, damit Querverweise aus den Nachbardokumenten weiter treffen.

### 10.1 In V0.2 entschieden (Querprüfung mit `06-Compliance-Anhang.md`)

| # | Punkt | Entscheidung | Fundstelle |
|---|---|---|---|
| ✅ O-2 | Stimmen einer Person, die **während einer offenen Runde** auszieht | **Stimme bleibt im Score, Person fällt aus Zähler und Nenner.** UI markiert „1 Stimme von einem ehemaligen Mitglied" | §5.3 |
| ✅ O-3 | Default für `settings.quorum_share` | **`0.5`** = mindestens die Hälfte der Stimmberechtigten, konfigurierbar. Quorum ist eine **Anzeigeschwelle**, keine Beschlussfähigkeitsgrenze | §8.3 |
| ✅ O-4 | Doppelte Statusführung `ResidentProfile` vs. `Membership` | **Beibehalten, ohne `residency_period`:** Wohn-Tatsachen am Profil, Zugang an der Membership. `residency_period` ist der **v2-Aufstiegspfad** für Aus- und Wiedereinzug | §2.1 |
| ✅ O-6 | Passkey-Credentials nicht modelliert | **`PasskeyCredential` modelliert.** Löschen des letzten Passkeys entzieht nie den Zugang (P-2) | §2.1 |
| ✅ O-9 | Klassifizierung `Membership.role`/`.permissions` und `Household.join_code` | **`role`/`permissions` → 🟠** (gegen den V0.1-Vorschlag). **`join_code` → ⚙️** plus drei Auflagen, TOM-Liste statt Art.-30-Verzeichnis (seit V0.4 fünf, siehe O-15) | §2.1, §9.3 |

### 10.2 In diesem Update entschieden (CastingNote-Erinnerung, Einladungstoken, Push-Kanal — Spec-Update 02.09.; UX-Nachzug aus `07-Screen-Inventar.md`)

| # | Punkt | Entscheidung | Fundstelle |
|---|---|---|---|
| ✅ O-7 | `Appointment.expected_attendee_profile_ids` als Array statt Verknüpfungstabelle | **Verknüpfungstabelle `AppointmentAttendance`** (`appointment_id`, `resident_profile_id`, `attended`, `note_written`) ergänzt, bewusst im `casting`-Kontext, weil sie die CastingNote-Erinnerung speist. `expected_attendee_profile_ids` bleibt für die reine Teilnahme-Absicht bestehen. **`attended` seit V0.4 umgedreht (U-23):** entsteht mit `true`, die betroffene Person sagt selbst ab, die Moderation korrigiert nur Ausnahmen — schließt zugleich die kurzfristige Einzelabsage (S-51), die zuvor weder Feld noch Weg hatte | §2.2 |
| ✅ O-12 | Anmeldekennung für Resident-Accounts ohne `email` (vormals Plan-O-D) | **`(Household, ResidentProfile.display_name)` + Passwort.** Voraussetzung: `display_name` wird pro Haushalt eindeutig (unter `status != moved_out`) | §2.1 |
| ✅ O-13 | Dauer der „angemeldet bleiben"-Sitzung (vormals Plan-O-C) | **`Session.remember_me`** steuert `expires_at`: 90 Tage gleitend statt kurzer Sitzung. Endet bei Passwortwechsel, Admin-Reset **und** `moved_out_on` | §2.1 |
| ✅ O-14 | Wer setzt/verlängert `CastingRound.phase_deadline_at`, gibt es eine Voreinstellung? (vormals Plan-O-E) | **Die moderierende Person, ohne Voreinstellung.** Eine automatisch gesetzte Frist wäre eine Erwartung, die niemand vereinbart hat | §2.2 |
| ✅ O-15 | Standardwerte für `join_code_expires_at`/`.max_uses` (vormals Plan-O-B) | **Ablauf 7 Tage, Nutzungsgrenze = Zahl der noch fehlenden Bewohnenden** — beides nur Vorschlagswerte beim Setzen, jederzeit über `Household.join_code_expires_at`/`.join_code_max_uses` änderbar, kein hartcodierter Wert | §2.1 |
| ✅ O-16 | Passwort-Rücksetzung für Bewohnende ohne `email` (vormals Plan-O-A) | **Durch den Haushalts-`Account`** (`manage_members`), mit sichtbarem `ActivityEvent` (`account.password_reset_by_admin`) und Beendigung aller aktiven `Session`s des betroffenen Profils. Schließt sich selbst, sobald die Person eine eigene `email` hinterlegt | §2.1 |

### 10.3 Weiter offen

**Sortiert nach Dringlichkeit** — O-1 sollte vor der ersten Migration adressiert sein, weil es das
Kernversprechen betrifft.

| # | Offener Punkt | Fundstelle | Warum jetzt |
|---|---|---|---|
| O-1 | **Dokumentationsteil erledigt:** `03-PRD.md` §4.1.7 baut die verpflichtende Rückfrage samt eigenem Testfall, `06-Compliance-Anhang.md` §3.4 trägt das Risiko samt **Q-14**, `GUARDRAILS.md` **G-D1** benennt die Grenze. **Offen bleibt das Prozessrisiko:** Frühere Bewerbungen derselben Person werden nur manuell mit dem Profil verknüpft. Wer die Zuordnung vergisst, erzeugt genau das Leck, das V-1 verhindern soll. Automatischer Personenabgleich bleibt **ausgeschlossen**. **Entschieden:** Das PRD baut die **Rückfrage**; der **Ähnlichkeitsvorschlag** aus Q-14 ist eine andere Funktion mit anderer Rechtslage und bleibt bei der anwaltlichen Prüfung. | §2.2 | V-1 ist das Kernversprechen. **Harte Vorbedingung:** Keine zweite echte Runde auf echten Daten, bevor der S-40-Prompt implementiert und durch den in `03-PRD.md` §4.1.7 verlangten eigenen Testfall gedeckt ist. |
| ~~O-5~~ | ~~**Redaktionsregel für `ActivityEvent.payload`** am Fristende — Struktur bleibt, 🔴/⚫-Inhalte werden `null`~~ | — | **Geklärt:** Bereits erfüllt — `GUARDRAILS.md` **G-D7** prüft die Nutzlast gegen eine Schlüssel-Allowlist je `event_type`, mit Test, der Freitext erwartungsgemäß abweist; **G-D8** deckt die Redaktion am Fristende. Beide 🟢. Maßgeblich: `GUARDRAILS.md` §G-D. |
| O-8 | **Rangfolge (Abstimmungsergebnis) als Solver-Eingabe** — offene Entwurfsoption: die Terminplanung nach dem Abschneiden einer Bewerbung in der Rangliste priorisieren | §4 | Zwei Fragen entscheiden es: **(a)** verkompliziert es den Ablauf für die Nutzenden? **(b)** verschlechtert es die Solver-Laufzeit so weit, dass es sich nicht mehr lohnt? Kein Beschluss jetzt nötig — automatisches Lösen liegt in v1.1. `05-ADRs.md` ADR-005 hält fest, dass der Solver-Port eine zusätzliche Gewichtung je Bewerbung nicht ausschließen darf. |
| ~~O-10~~ | ~~**`Application.subject_statement`: Einreichungsweg nicht entschieden.** Modell in v1, UI in v1.1 — aber die bewerbende Person hat kein Konto (P-1)~~ | — | **Geklärt:** Betrifft nur die Oberfläche, nicht das Schema — der Einreichungsweg wird festgelegt, wenn die Oberfläche in v1.1 gebaut wird. Als Implementierungspflicht im Register geführt. |
| ~~O-11~~ | ~~**Verfügbarkeits-Link: v1 oder v1.1?** Der Session-Brief ist in sich widersprüchlich (Entscheidungsteil v1, Phasentabelle v1.1). Auflösung: `AvailabilityToken` in v1 modelliert, bewerberseitige Seite v1.1~~ | — | → **`02-SRD.md` O-08.** Dort entschieden: bleibt v1.1. |

---
