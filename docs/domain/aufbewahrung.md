> **Quelle:** `../04-Domaenenmodell.md` §7 (Stand V0.4, eingefroren 2026-09-09)
> **Schema-Autorität:** Diese Datei. Weicht ein Bezeichner anderswo ab, gilt der hier.

## 7. Aufbewahrung, Löschung, Datenauskunft

Modelliert, nicht angeflanscht — Begründung in ADR-010, Rechtsanalyse in `06-Compliance-Anhang.md`.

**Rechtsgrund ist Art. 5 Abs. 1 lit. e in Verbindung mit Art. 17 Abs. 1 lit. a (Speicherbegrenzung),
nicht Art. 15.** Der Auskunftsanspruch ist ein anderer Sachverhalt und kein Löschgrund; das
vermischt man leicht.

| Was | Frist | Anker | Feld |
|---|---|---|---|
| `Application` inkl. `message_raw`, `attributes`, Kontaktdaten | **180 Tage** | `created_at` | `Application.retention_until` |
| `Application.subject_statement` | **geerbt**, kein eigener Zeitgeber | — | **Löschung in derselben Transaktion** wie die Bezugsdaten — sonst ist die gelöschte Beurteilung aus ihrer Erwiderung rekonstruierbar (§2.2) |
| `Vote`, `Veto`, `CastingNote` | **180 Tage** | `CastingRound.closed_at` | `CastingNote.retention_until`, sonst über die Runde |
| `CastingRound` als Ganzes | 180 Tage | `closed_at` | `CastingRound.retention_until` |
| `ActivityEvent`-Payload mit 🔴/⚫ | Frist der Bezugsentität | — | Redaktion statt Löschung, siehe §2.5 |
| `Account`, `ResidentProfile` | keine automatische Frist | — | Nutzende löschen selbst |

**Die 180 Tage sind kein Bauchwert.** Belastbarster Anker für Bewerbungsunterlagen sind ~6 Monate,
abgeleitet aus AGG-Fristen: zwei Monate Geltendmachung (§ 15 Abs. 4 AGG) plus drei Monate Klagefrist
(§ 61b Abs. 1 ArbGG) plus Puffer. Das ist **Arbeitsrecht, nicht Mietrecht** — aber der etablierteste
Referenzwert, und damit die Begründung, die im Streitfall verteidigbar ist. Die Frist ist
Auslegungssache, die **Existenz** einer Löschautomatik ist es nicht.

Ablauf am Fristende — als Zustandsübergänge, nicht als Cronjob-Nebenwirkung:

```text
retention_until − retention_warning_days   →  Notification(type = 'retention_warning')
                                              an alle mit Berechtigung `extend_retention`,
                                              mit drei Handlungen:
                                                 „verlängern"  → +180 Tage, Begründung PFLICHT,
                                                                 Eintrag in retention_extensions,
                                                                 ActivityEvent 'retention.extended'
                                                 „jetzt löschen" → sofortige harte Löschung
                                                 „archivieren"   → Application/Round → archived

retention_until erreicht, keine Handlung   →  harte Löschung der 🔴/⚫-Felder,
                                              Redaktion der Ereignis-Payloads,
                                              ActivityEvent 'retention.executed' bleibt bestehen
```

Drei Regeln, die das Modell absichern:

1. **Keine stille Löschung.** Ohne vorausgegangene Vorwarnung wird nicht gelöscht. Wenn die
   Vorwarnung nicht zustellbar war (`suppressed_reason = unverified_email`), verschiebt sich die
   Löschung, statt lautlos zu laufen.
2. **Verlängern ist protokolliert und begründungspflichtig, Kürzen nicht.** Kürzen ist immer
   datenschutzfreundlicher, Verlängern immer erklärungsbedürftig. Der Haushalt kann `retention_days`
   auf 30 oder 90 senken, aber nicht über 180 heben.
3. **`retention_extensions` ist eine Liste, keine Zahl.** Wer dreimal verlängert hat, hat drei
   Einträge mit drei Begründungen — „unbegrenzt verlängerbar" wäre eine Löschautomatik, die keine ist.

**Datenauskunft erzeugen** (`export_subject_access`) ist eine eigene Funktion pro `Application`:
Export aller zu dieser Person gespeicherten Daten, inklusive `CastingNote` und `Veto.reason` — denn
der Auskunftsanspruch erfasst auch **subjektive Beurteilungen und interne Vermerke**. Nicht
enthalten ist die **Identität** der bewertenden Personen (Art. 15 Abs. 4 schützt Rechte Dritter);
enthalten ist deren **Inhalt**. Auskunftspflichtig ist der **Haushalt** als Verantwortlicher —
Flatmate.io ist Auftragsverarbeiter und hat nur eine Unterstützungspflicht (Art. 28 Abs. 3 lit. e).
Genau die erfüllt diese Funktion.

> Das ist der Grund, warum `CastingNote.body` als ⚫ markiert ist und die UI dauerhaft „schreib so,
> als könnte die Person es lesen" anzeigt. Es ist keine Höflichkeitsformel, sondern die
> Zusammenfassung der Rechtslage.

---
