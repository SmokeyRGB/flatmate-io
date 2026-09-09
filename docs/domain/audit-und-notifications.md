> **Quelle:** `../04-Domaenenmodell.md` §2.5 (Stand V0.4, eingefroren 2026-09-09)
> **Kontexte:** `audit` und `notifications` — im Quelldokument gemeinsam geführt
> **Schema-Autorität:** Diese Datei. Weicht ein Bezeichner anderswo ab, gilt der hier.

### 2.5 Kontexte `audit` und `notifications`

#### `ActivityEvent` — das Ereignis-Log

**Append-only.** Kein `UPDATE`, kein `DELETE` außer durch das Löschkonzept. Speist Aktivitäts-Feed,
Benachrichtigungs-Fan-out, „was ist passiert, während ich weg war", Undo und Rechenschaftspflicht
(ADR-003).

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `household_id` | `uuid` | ⚙️ | RLS-Anker |
| `round_id` | `uuid?` | ⚙️ | |
| `event_type` | `text` | ⚙️ | z. B. `application.state_changed`, `vote.cast`, `settings.changed`, `retention.extended`, `casting.note_reminder_due` |
| `subject_type` · `subject_id` | `text` · `uuid` | ⚙️ | worauf sich das Ereignis bezieht |
| `actor_account_id` | `uuid?` | 🟠 | `null` bei Systemereignissen (Aufbewahrungsautomatik) |
| `actor_profile_id` | `uuid?` | 🟠 | `null` = **im Verwaltungskontext gehandelt** → Feed sagt ehrlich „Verwaltung hat Lea eingeladen" statt einen Namen zu erfinden |
| `payload` | `jsonb` | 🔴 / ⚫ | siehe Kasten |
| `occurred_at` | `timestamptz` | ⚙️ | |
| `correlation_id` | `uuid?` | ⚙️ | bündelt Ereignisse einer Aktion (z. B. Solver-Lauf legt zwölf Termine) |
| `reverses_event_id` | `uuid?` | ⚙️ | Rückwärtsübergänge und Undo verweisen auf das Ereignis, das sie zurücknehmen (P-4) |
| `visibility_scope` | `enum(household, round_participants, actor_only)` | ⚙️ | Vorfilter; die eigentliche Prüfung bleiben V-1 bis V-4 |
| *`audience_class`* | *abgeleitet* | ⚙️ | **Neu**, löst U-3/U-4 auf. `enum(outcome, process)` aus `event_type` berechnet — **nicht gespeichert**, gleiche Bauform wie `phase_hint` und `Vote.weight`. Formel und Zuordnungstabelle in §8.8 |

> **Die Payload ist die zweite Stelle, an der Beratungsinhalte lecken können.** Ein Ereignis
> `vote.cast` mit `{value: "no"}` im Payload macht das Log zum bequemen Umweg um V-1. Vorschlag:
> Payloads für Beratungsereignisse enthalten **nur Referenzen und Zähler**, keine Werte —
> `{application_id, stage, voter_profile_id}`, nicht `{value}`. Wer den Wert braucht, fragt
> `deliberation` über den Query-Port und passiert damit die Policy.
>
> Und: **das append-only-Log ist von der Löschautomatik nicht ausgenommen.** Ein Log, das
> Bewerberdaten über die Frist hinaus hält, unterläuft das Löschkonzept. Vorschlag: Payload-Felder
> mit 🔴/⚫ werden zum Fristende **redigiert** (Struktur bleibt, Inhalt wird `null`), damit die
> Rechenschaftskette erhalten bleibt, ohne die Speicherbegrenzung zu verletzen.
>
> ⚠️ Offener Punkt (O-5) — diese Redaktionsregel gehört mit einer Zeile in `06-Compliance-Anhang.md` und als
> überprüfbare Regel in `GUARDRAILS.md`.

#### `PushSubscription` — die aktive Web-Push-Berechtigung

**Neu in diesem Update.** Web Push wird vorgezogen und wird der **bevorzugte** Kanal, E-Mail der
Fallback (§2.1, `Account.email`) — ohne eine geführte Subscription lässt sich nicht auflösen,
welcher Kanal greift, siehe `Notification.channel` unten.

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `account_id` | `uuid` | 🟠 | mehrere Subscriptions pro Account sind möglich (mehrere Geräte), analog zu `PasskeyCredential` |
| `endpoint` | `text` | 🟠 | vom Push-Dienst des Browsers/Betriebssystems vergeben, geräte- und accountbezogen |
| `keys` | `jsonb` | 🟠 | öffentliche Verschlüsselungsschlüssel für den Push-Versand (`p256dh`, `auth`) — kein Geheimnis der Gegenseite, aber accountbezogen wie `PasskeyCredential.public_key` |
| `created_at` | `timestamptz` | ⚙️ | |
| `revoked_at` | `timestamptz?` | ⚙️ | Abmelden vom Push-Kanal |

> **Widerrufen einer `PushSubscription` darf nie die Benachrichtigung als Ganzes entziehen** —
> dasselbe Prinzip wie bei `PasskeyCredential` (§2.1): sie ist ein Kanal, keine Voraussetzung.
> Fällt die letzte aktive Subscription weg, greift die Auflösungsreihenfolge in
> `Notification.channel` und die Person bekommt Benachrichtigungen weiter per E-Mail oder `in_app`.

#### `Notification` — die Benachrichtigung

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `household_id` · `account_id` | `uuid` | ⚙️ | Empfänger ist der **Account** (er hat die E-Mail) |
| `resident_profile_id` | `uuid?` | ⚙️ | in welchem Kontext sie gilt — entscheidend für V-1 |
| `event_id` | `uuid?` | ⚙️ | auslösendes `ActivityEvent` |
| `type` | `text` | ⚙️ | z. B. `new_application`, `vote_pending`, `appointment_confirmed`, `retention_warning`, `casting.note_reminder_due`, `pwa_install_prompt_due` |
| `channel` | `enum(in_app, email, web_push)` | ⚙️ | **`web_push` ist jetzt der bevorzugte Kanal** (vorgezogen, vormals als „erst v1.x" vermerkt), mit dokumentiertem iOS-Vorbehalt (ADR-011) (nur für zur Startseite hinzugefügte PWAs). Auflösungslogik siehe Kasten unten |
| `state` | `enum(pending, batched, sent, read, suppressed, failed)` | ⚙️ | |
| `digest_batch_id` | `uuid?` | ⚙️ | Digest ist **Default**, Einzelversand die Ausnahme |
| `payload` | `jsonb` | 🔴 / ⚫ | derselbe Redaktionsvorbehalt wie beim Ereignis-Log |
| `suppressed_reason` | `enum(self_redaction, unverified_email, muted_by_mask, not_participant)?` | ⚙️ | **explizit protokollieren, warum nicht zugestellt wurde** — sonst ist ein Sichtbarkeitsfehler von einem Zustellfehler nicht unterscheidbar |
| `scheduled_for` · `sent_at` · `read_at` | `timestamptz` | ⚙️ | |

> **Kanal-Auflösung für `channel`, in dieser Reihenfolge:**
> 1. `web_push`, wenn für den empfangenden `Account` eine aktive `PushSubscription`
>    (`revoked_at = null`) vorliegt.
> 2. sonst `email`, wenn `Account.email` gesetzt **und** `email_verified_at` gesetzt ist.
> 3. sonst nur `in_app` — die Benachrichtigung wartet im Feed, es wird nichts aktiv zugestellt.
>
> Das dreht die bisherige v1-Reihenfolge um: **E-Mail war der Standardkanal, jetzt ist sie der
> Fallback.** Betrifft vor allem Resident-Accounts, deren `email` jetzt nullable ist (§2.1) — ohne
> aktive `PushSubscription` **und** ohne E-Mail bleibt nur `in_app`. Genau diesen Fall deckt die
> PWA-Install-Erinnerung unten ab.

> **Benachrichtigungen unterliegen derselben Sichtbarkeitspolicy wie die Anwendung.** Die
> Prüfung erfolgt **beim Versand**, nicht beim Erzeugen — zwischen Erzeugen und Zustellen kann eine
> Person ausziehen oder zur bewohnenden Person werden. `suppressed_reason = self_redaction` ist
> deshalb ein normaler, erwarteter Zustand und kein Fehler.
>
> **Konkret für `casting.note_reminder_due`:** die Erinnerung bezieht sich auf eine `Application`;
> ist deren `became_resident_id` beim Versand auf das eigene Profil der Empfängerin/des Empfängers
> gesetzt, wird sie wie jede andere Benachrichtigung zu dieser Bewerbung mit
> `suppressed_reason = self_redaction` unterdrückt. Das ist keine neue Regel, sondern dieselbe
> Prüfung, hier nur für diesen Typ ausdrücklich benannt.

**PWA-Install-Erinnerung — Trigger nach demselben Muster wie die Aufbewahrungs-Vorwarnung** (§7,
`retention_warning`):

```text
erster Login eines Accounts, keine aktive PushSubscription vorhanden
                                            →  Notification(type = 'pwa_install_prompt_due')
                                               an diesen Account, Kanal in_app,
                                               zeigt das PWA-Install-Banner
                                               ("zum Startbildschirm hinzufügen")

PushSubscription danach angelegt           →  Trigger feuert für diesen Account nicht erneut
```

> **Korrektur (U-19, K-1 der zweiten Runde): kein Teil der CTA-Sortierung.** Eine vorherige Fassung
> dieses Satzes behauptete, ein Account ohne aktive `PushSubscription` sehe den Install-Hinweis „weiter
> oben einsortiert, aus demselben Grund wie eine näher rückende Rundenfrist" — als wäre er eine
> fristgebundene Aufgabe wie T-4/T-5 (§8.7). **Das ist ein bestätigter Fehler, kein Stilurteil:**
> `pwa_install_prompt_due` wird nie „erledigt" im Sinne einer Runde und würde, weil er bis zur
> Installation wiederkehrt, echte Aufgaben **dauerhaft** verdrängen — genau das, was §8.7 ausschließen
> soll.
>
> **Stattdessen:** ein eigenes, optisch abgesetztes Band **unterhalb** des primären CTA aus §8.7.
> Sichtbar und wiederkehrend, wie S-45 verlangt, aber **nie auf dem CTA-Platz und nie über einer
> Aufgabe mit Frist**. S-45 fordert Sichtbarkeit, nicht den ersten Rang. `pwa_install_prompt_due`
> nimmt an der Sortierfunktion aus §8.7 **nicht teil** — es ist ein Element neben der Aufgabenliste,
> nicht ihr Bestandteil.

---
