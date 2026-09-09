> **Quelle:** `../04-Domaenenmodell.md` §3 (Stand V0.4, eingefroren 2026-09-09)
> **Schema-Autorität:** Diese Datei. Weicht ein Bezeichner anderswo ab, gilt der hier.

## 3. Zustandsmaschinen

Drei Stück: `Application`, `CastingRound`, `Room`. Das gemeinsame Prinzip steht in **ADR-002** —
explizite Zustände statt Boolean-Flags, alle Übergänge in **einer** deklarativen Tabelle, jeder
Übergang erzeugt ein `ActivityEvent`.

> ### Rückwärtsübergänge sind erlaubt und auditiert (P-4)
>
> Das ist keine Nachlässigkeit, sondern die zentrale Anforderung: **„Neue Mitbewohnerin" ist nicht
> in Stein gemeißelt.** Zusagen werden zurückgezogen, Einzüge platzen, jemand entscheidet sich
> anders. Ein Modell, das nur vorwärts kann, zwingt die Moderation dazu, Datensätze zu löschen und
> neu anzulegen — und damit ist die Historie weg, auf der Feed, Digest und Rechenschaftspflicht
> beruhen.
>
> Deshalb gilt für **jeden** Übergang in allen drei Maschinen:
> 1. Er ist als Zeile in der Übergangstabelle **deklariert** — auch der Rückweg. Was nicht in der
>    Tabelle steht, ist nicht möglich; ein nicht deklarierter Übergang ist ein Fehler, kein
>    Sonderfall.
> 2. Er erzeugt ein `ActivityEvent` mit `actor_account_id`, `actor_profile_id`, Vor- und
>    Nachzustand.
> 3. Rücknahmen tragen `reverses_event_id` und, wo sinnvoll, ein Begründungsfeld.
> 4. **Rückwärtsübergänge sind im Feed als solche erkennbar** („Jonas hat Lea von *Zusage erteilt*
>    zurück auf *interviewt* gesetzt") — nicht still korrigiert.

### 3.1 `Application`

Elf Zustände: sieben auf dem Hauptpfad, vier Seitenzustände.

```text
  new ──▶ screened ──▶ invited ──▶ scheduled ──▶ interviewed ──▶ offer_made ──▶ moved_in
   │         │            │            │              │              │             │
   │         │            └────────────┴──────────────┴──────┬───────┘             │
   │         │                                              │                      │
   └─────────┴──────────────▶ rejected_by_household         │                      │
                                                            ▼                      │
                                       declined_by_applicant ◀─────────────────────┘
   (jederzeit, durch die bewerbende Person) ──▶ withdrawn
   (aus jedem Endzustand, nach Fristablauf oder von Hand) ──▶ archived
```

**Hauptpfad** — Vorwärtsübergänge:

| Von | Nach | Wer darf | Was protokolliert / bewirkt wird |
|---|---|---|---|
| — | `new` | jede Person mit `create_application`, oder Token-Link-Eingang | `application.created` mit `source`; setzt `retention_until = created_at + retention_days` |
| `new` | `screened` | `change_application_state`; **oder System**, sobald das Quorum in `stage = invite` erreicht ist | `application.screened`; ab hier erscheint die Bewerbung in der Rangliste (V-4 bleibt unberührt) |
| `screened` | `invited` | `change_application_state` | `application.invited`; erzeugt den **Copy-Paste-Text inklusive Datenschutzhinweis** als Hilfsmittel für den Haushalt (Art. 13 liegt beim Verantwortlichen, nicht bei Flatmate.io) |
| `invited` | `scheduled` | `confirm_appointment` | `appointment.confirmed` + `application.scheduled`; setzt `Appointment.status = confirmed` |
| `scheduled` | `interviewed` | `change_application_state` | `application.interviewed`; setzt `Appointment.status = completed`; **öffnet `stage = offer`** für Stimmen und Vetos; Notizen sind ab hier der erwartete Inhalt |
| `interviewed` | `offer_made` | `change_application_state` | `application.offer_made`; verlangt `assigned_room_id`; setzt `Room.status = promised`; **sperrt alle Vetos dieser Bewerbung** (`Veto.locked_at`) |
| `offer_made` | `moved_in` | `change_application_state` | `application.moved_in`; setzt `Room.status = occupied`; erzeugt oder verknüpft ein `ResidentProfile` und setzt **`became_resident_id`** → **ab diesem Moment greift V-1 dauerhaft** |

**Seitenzustände** — Abbrüche:

| Von | Nach | Wer darf | Was protokolliert / bewirkt wird |
|---|---|---|---|
| `new` … `offer_made` | `rejected_by_household` | `change_application_state` | `application.rejected`; optionales `rejection_reason` (⚫); gibt ein ggf. reserviertes Zimmer frei (`promised → open`) |
| `invited` … `moved_in` | `declined_by_applicant` | `change_application_state` | `application.declined`; **der häufigste Rückweg in der Praxis** — Zusage erteilt, danach doch abgesagt; gibt das Zimmer frei |
| `new` … `offer_made` | `withdrawn` | `change_application_state`, auf Wunsch der bewerbenden Person | `application.withdrawn`; fachlich getrennt von `rejected_by_household`, weil die Initiative eine andere war und die Statistik das nicht vermischen darf |
| `rejected_by_household`, `declined_by_applicant`, `withdrawn`, `moved_in` | `archived` | `change_application_state`, **oder System** bei Fristablauf | `application.archived`; Vorwarnung 14 Tage vorher an die moderierende Person mit „verlängern / jetzt löschen / archivieren" — **keine stille Löschung** |

**Rückwärtsübergänge** — vollständig deklariert, nicht als Sonderfall behandelt:

| Von | Nach | Wer darf | Was protokolliert / bewirkt wird |
|---|---|---|---|
| `screened` | `new` | `change_application_state` | `application.state_reverted`, `reverses_event_id` gesetzt |
| `invited` | `screened` | `change_application_state` | dito; der bereits erzeugte Copy-Paste-Text wird **nicht** zurückgenommen (er ist verschickt — das wäre eine Lüge im Log) |
| `scheduled` | `invited` | `confirm_appointment` | setzt `Appointment.status = cancelled`, gibt den `Slot` frei |
| `interviewed` | `scheduled` | `change_application_state` | schließt `stage = offer` wieder; **abgegebene Stimmen bleiben erhalten** und werden nicht gelöscht |
| `offer_made` | `interviewed` | `change_application_state` | gibt das Zimmer frei (`promised → open`); **hebt die Veto-Sperre wieder auf** (`locked_at = null`) — sonst wäre eine wiedereröffnete Entscheidung ohne Einspruchsmöglichkeit |
| `moved_in` | `offer_made` | `change_application_state`, zusätzlich `manage_members` | siehe Kasten unten — der teuerste Rückweg im Modell |
| `rejected_by_household`, `declined_by_applicant`, `withdrawn` | letzter Hauptpfad-Zustand | `change_application_state` | `application.reopened` mit Begründungsfeld |
| `archived` | vorheriger Zustand | `change_application_state` | nur solange die Daten noch nicht gelöscht sind — nach dem Löschen ist der Rückweg **nicht** verfügbar, und das ist beabsichtigt |

> **Der Rückweg `moved_in → offer_made` und was er *nicht* tut.**
>
> Er nimmt `became_resident_id` **nicht** zurück.
>
> Das ist die wichtigste einzelne Regel dieses Dokuments. Wer eingezogen ist und wieder auszieht,
> hat die Beratungsinhalte über sich selbst deswegen nicht weniger verdient nicht zu sehen — und
> das Profil existiert weiter. Ein Rücksetzen von `became_resident_id` würde V-1 lautlos abschalten
> und die Person hätte plötzlich Lesezugriff auf die Stimmen über sie.
>
> Der Übergang setzt stattdessen: `Room.status = occupied → promised`,
> `ResidentProfile.status = active → moved_out` (falls das Profil nur wegen dieses Einzugs
> entstand), und erzeugt `application.move_in_reverted`.
>
> Für `GUARDRAILS.md`: **„`became_resident_id` wird nie auf `null` gesetzt"** ist ein
> geschützter Test, kein Kommentar.

**Invarianten** (als Unit-Tests formulierbar, unabhängig von der Tabelle):

| # | Invariante |
|---|---|
| I-1 | Ein nicht in der Tabelle deklarierter Übergang wirft — kein stilles Durchfallen, kein „unbekannter Zustand" |
| I-2 | Jeder Zustandswechsel schreibt genau ein `ActivityEvent`; kein Wechsel ohne Ereignis |
| I-3 | `became_resident_id` ist nach dem Setzen **unveränderlich** und wird nie geleert |
| I-4 | `offer_made` verlangt ein `assigned_room_id`, dessen `Room.status` auf `promised` steht |
| I-5 | Eine Bewerbung im Zustand `moved_in` hat genau ein `ResidentProfile` und genau ein `Room` |
| I-6 | Vetos können nach `Veto.locked_at` weder erzeugt noch geändert werden |
| I-7 | Wechsel des Verfahrens (`HouseholdSettings.scale_weights`, Quorum, Veto-Regeln) ist bei einer Runde im Status `open` **gesperrt**; das `settings_snapshot` der Runde bleibt maßgeblich |

### 3.2 `CastingRound`

Fünf Zustände. Bewusst dünn — Begründung siehe §2.2.

```text
   draft ──▶ open ──▶ closed ──▶ archived
              ▲ │        │
              │ ▼        │
            paused       │
              ▲──────────┘  (closed → open: Wiedereröffnung, erlaubt und auditiert)
```

| Von | Nach | Wer darf | Was protokolliert / bewirkt wird |
|---|---|---|---|
| — | `draft` | `manage_settings` | `round.created`; Zimmer wählbar, keine Bewerbungen sichtbar |
| `draft` | `open` | `close_round` bzw. `manage_settings` | `round.opened`; **friert `settings_snapshot` ein**, **snapshottet die Teilnehmenden** aus den aktiven Bewohnenden in `RoundParticipation` (`source = snapshot_at_open`) |
| `open` | `paused` | `manage_settings` | `round.paused`; Lesezugriff bleibt, Stimmabgabe gesperrt. Für den realen Fall „wir warten drei Wochen auf Rückmeldungen" |
| `paused` | `open` | `manage_settings` | `round.resumed` |
| `open` | `closed` | `close_round` | `round.closed`; setzt `closed_at` → **Startpunkt der Aufbewahrungsfrist**; friert `quorum_denominator_frozen` ein; Stimmen und Vetos werden schreibgeschützt |
| `closed` | `open` | `close_round` **+ Begründungsfeld** | `round.reopened`; **`settings_snapshot` bleibt das alte**, damit die Bewertung derselben Runde nicht nachträglich das Verfahren wechselt; `retention_until` wird neu berechnet |
| `closed` | `archived` | `close_round`, **oder System** bei Fristablauf | `round.archived`; Vorwarnung 14 Tage vorher |
| `archived` | `closed` | `close_round` | nur solange nicht gelöscht |

**Regel-Sperre (Invariante I-7, hier konkret):** Solange eine Runde `open` oder `paused` ist, sind
Änderungen an Skalengewichten, Quorum, Veto-Budget und Anonymitätsregel **blockiert**. Der
Vorschlag ist die harte Variante (blockieren) und nicht die weiche (erlauben und laut
protokollieren), weil eine Verfahrensänderung mitten in einer Abstimmung die Legitimität des
Ergebnisses zerstört (P-3) — und Legitimität ist hier das Produkt.

> **Das gibt man auf, wenn** sich in der Praxis zeigt, dass Haushalte während ihrer ersten Runde
> merken, dass die Voreinstellung nicht passt, und dann die Runde abbrechen müssen. Weiche
> Alternative für diesen Fall: Änderung erlaubt, aber sie erzeugt eine **neue Rundenversion** mit
> eigenem Snapshot und die Rangliste weist beide aus.

### 3.3 `Room`

Sechs Zustände.

```text
   planned ──▶ open ──▶ promised ──▶ occupied
                 │▲         │            │
                 ││         └────────────┘  (Rückwege: Zusage zurückgezogen, Einzug geplatzt)
                 ▼│
            on_hold │
                    └──▶ not_available
```

| Von | Nach | Wer darf | Was protokolliert / bewirkt wird |
|---|---|---|---|
| — | `planned` | `manage_settings` | `room.created`; Zimmer erfasst, aber noch nicht Teil einer Runde |
| `planned` | `open` | `manage_settings` | `room.opened`; zählt ab jetzt in `open_rooms` und damit ins **Favoriten-Budget** (§8.2) |
| `open` | `promised` | `change_application_state` (Folge von `offer_made`) | `room.promised`; setzt `promised_to_application_id` |
| `promised` | `occupied` | `change_application_state` (Folge von `moved_in`) | `room.occupied`; setzt `current_resident_profile_id` |
| `promised` | `open` | `change_application_state` | Folge von `declined_by_applicant` oder `offer_made → interviewed`; leert `promised_to_application_id` |
| `occupied` | `promised` | `change_application_state` | Folge von `moved_in → offer_made` |
| `occupied` | `open` | `manage_members` | Auszug der bewohnenden Person; setzt `available_from` |
| `open` | `on_hold` | `manage_settings` | `room.on_hold`; „wir wissen noch nicht, ob das Zimmer frei wird" — zählt **nicht** ins Budget |
| `on_hold` | `open` / `not_available` | `manage_settings` | |
| `open`, `on_hold` | `not_available` | `manage_settings` | `room.withdrawn`; das Zimmer fällt aus der laufenden Runde, **die Runde läuft weiter** — der Fall, für den `Room` überhaupt eine eigene Entität ist |

**Kopplungsinvarianten zwischen den Maschinen:**

| # | Invariante |
|---|---|
| I-8 | `Room.status = promised` ⟺ genau eine `Application` mit `assigned_room_id = room.id` im Zustand `offer_made` |
| I-9 | `Room.status = occupied` ⟺ genau eine `Application` im Zustand `moved_in` **oder** ein historisch eingezogenes `ResidentProfile` ohne Bewerbung (Gründungsbewohnende, Vermieter-Fall) |
| I-10 | Ändert sich `Room.status` in `not_available`, während eine Bewerbung darauf zeigt, wird der Übergang **abgelehnt** — nicht kaskadiert. Die Moderation muss erst die Bewerbung umsetzen. Kaskaden sind hier gefährlicher als Reibung |

### 3.4 Warum `Appointment` und `Vote` keine eigene Zustandsmaschine haben

Bewusste Auslassung, damit sie nicht als Vergessen gelesen wird.

`Appointment.status` ist ein **Statusfeld ohne deklarierte Übergangstabelle**: sein Lebenszyklus ist
vollständig eine Folge von `Application`-Übergängen (`scheduled`, `interviewed`, Rückwege). Eine
zweite Maschine daneben würde nur eine zweite Wahrheit erzeugen, die auseinanderlaufen kann.

`Vote` und `Veto` haben überhaupt keinen Status, nur `withdrawn_at` und `locked_at`. Eine Stimme
ist entweder abgegeben oder nicht — jeder weitere Zustand wäre erfunden.

> **Das gibt man auf, wenn** Termine eigene Prozesse bekommen, die nichts mit der Bewerbung zu tun
> haben (Raumbuchung, Zu-/Absagen einzelner Bewohnender, Erinnerungsketten). Dann verdient
> `Appointment` eine echte Maschine — und `Application` muss aufhören, sie mitzusteuern.

---
