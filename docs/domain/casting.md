> **Quelle:** `../04-Domaenenmodell.md` §2.2 (Stand V0.4, eingefroren 2026-09-09)
> **Kontext:** `casting`
> **Schema-Autorität:** Diese Datei. Weicht ein Bezeichner anderswo ab, gilt der hier.

### 2.2 Kontext `casting`

#### `Room` — das Zimmer als eigene Entität

Zimmer sind **nicht** ein Zähler auf der Runde, sondern eigene Objekte mit eigenem Status. Grund:
„drei Zimmer, eines schon vergeben, die Runde läuft weiter" ist der Normalfall in Wohnprojekten und
mit einem Zähler nicht darstellbar. Zustandsmaschine in §3.3.

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `household_id` | `uuid` | ⚙️ | |
| `label` | `text` | ⚙️ | z. B. „Zimmer 3, hinten links" |
| `size_sqm` | `numeric?` | ⚙️ | |
| `rent_amount` | `numeric?` | ⚙️ | |
| `status` | `enum(planned, open, promised, occupied, on_hold, not_available)` | ⚙️ | §3.3 |
| `available_from` | `date?` | ⚙️ | |
| `current_resident_profile_id` | `uuid?` | 🟠 | wer aktuell darin wohnt |
| `promised_to_application_id` | `uuid?` | 🔴 | gesetzt, solange eine Zusage für dieses Zimmer aussteht |
| `created_at` · `deleted_at` | `timestamptz` · `timestamptz?` | ⚙️ | |

#### `CastingRound` — die Runde

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `household_id` | `uuid` | ⚙️ | |
| `title` | `text` | ⚙️ | z. B. „Nachbesetzung Herbst" |
| `status` | `enum(draft, open, paused, closed, archived)` | ⚙️ | §3.2 |
| `room_ids` | `uuid[]` | ⚙️ | die Zimmer dieser Runde |
| `settings_snapshot` | `jsonb` | ⚙️ | **Kopie der Verfahrensregeln beim Öffnen.** Sichert die Regel-Sperre ab: ändert der Haushalt später die Gewichte, bleibt die laufende Runde nach ihren eigenen Regeln bewertet |
| `opened_at` | `timestamptz?` | ⚙️ | |
| `phase_deadline_at` | `timestamptz?` | ⚙️ | optionale weiche Frist der aktuellen Rundenphase (S-44), sichtbar als „Stimme ab bis X" / „X Tage/Stunden übrig" — **nie ohne die Phase, aus der sie stammt** (siehe Kasten „Geltungsbereich" unten). **Blockiert nichts** — nach Ablauf bleibt die Runde entscheidungsfähig, die moderierende Person entscheidet aktiv weiter oder verlängert. Speist die CTA-Sortierung (§8.7), analog zur bloß anzeigenden Rolle von `opened_at`/`closed_at` in dieser Tabelle. **Gesetzt und verlängert wird sie von der moderierenden Person, ohne Voreinstellung** (O-14) — eine automatisch gesetzte Frist wäre eine Erwartung, die niemand vereinbart hat |
| `closed_at` | `timestamptz?` | ⚙️ | **Ankerpunkt der Aufbewahrungsfrist** |
| `quorum_denominator_frozen` | `int?` | ⚙️ | beim Schließen eingefroren, damit abgeschlossene Runden nachträglich nicht ihre Quoten verändern |
| `retention_until` | `date?` | ⚙️ | `closed_at + retention_days`, verlängerbar (siehe unten) |
| `retention_extensions` | `jsonb` | ⚙️ | Liste `{extended_at, by_account_id, reason}` — **protokollierter** Verlängerungsknopf, nicht unbegrenzt |
| `retention_warned_at` | `timestamptz?` | ⚙️ | 14-Tage-Vorwarnung an die moderierende Person |
| *`phase_hint`* | *abgeleitet* | ⚙️ | für die UI aus den Bewerbungszuständen berechnet — **nicht gespeichert**, Begründung unten, Formel in §8.6 |

> **Warum der Rundenzustand absichtlich dünn ist.** Naheliegend wäre gewesen, die Prozessphasen
> (Screening → Terminfindung → Entscheidung) als Rundenzustände zu modellieren. Wir schlagen das
> **nicht** vor: Phasen laufen **pro Bewerbung** weiter, nicht pro Runde. Realer Normalfall — Lea
> ist im Interview, Jonas wartet auf Einladung, und gleichzeitig trifft eine neue Bewerbung ein.
> Ein Rundenzustand „Terminfindung" wäre dann entweder falsch oder müsste ständig gedrückt werden.
>
> Deshalb: `CastingRound.status` ist nur ein **Lebenszyklus-Tor** (existiert / läuft / ruht /
> abgeschlossen / archiviert), und die Phasenanzeige der UI ist eine Projektion über die
> Bewerbungszustände.
>
> **Das gibt man auf, wenn** sich zeigt, dass Haushalte den Prozess doch phasenweise gemeinsam
> durchlaufen wollen („wir screenen jetzt alle zusammen, dann laden wir zusammen ein"). Dann wird
> `phase_hint` zu einem echten Feld mit eigener Zustandsmaschine — und die Bewerbungszustände
> bekommen ein Tor davor.

> **Geltungsbereich von `phase_deadline_at` — jetzt blockierend, vorher ein Schönheitsfehler.**
> Solange `phase_hint` keine Formel hatte, war unklar, wofür genau `phase_deadline_at` gilt und wann
> sie wechselt (Konflikt 1 des Spec-Updates, siehe Plan). Mit der Formel in §8.6 ist das entschieden:
>
> - **Ein Feld, eine Frist gleichzeitig.** `phase_deadline_at` ist ein einzelnes Feld auf der Runde —
>   es gibt nie zwei Fristen nebeneinander.
> - **Sie gehört zu genau der Phase, die `phase_hint` im selben Moment berechnet.** Wird sie gesetzt,
>   gilt sie für die aktuell angezeigte Phase, nicht für eine kommende.
> - **Wechselt `phase_hint` (weil die am weitesten fortgeschrittene Bewerbung eine neue Phase
>   erreicht), während eine Frist läuft, bleibt die alte Frist stehen** und wird in der UI als „aus
>   der vorherigen Phase" gekennzeichnet, bis die moderierende Person sie ändert oder löscht. Weder
>   still übernehmen (sie war für etwas anderes gedacht) noch still löschen (dann verschwindet eine
>   Absprache ohne Anlass) ist zulässig — beides muss eine sichtbare Handlung sein.
> - **Nie ohne ihre Phase angezeigt** (U-18): „Abstimmung Runde 1 — noch 2 Tage", nie „noch 2 Tage"
>   allein. Sonst bezieht sich ein gespeichertes Datum auf nichts Benanntes.
>
> Die Organisationsfläche zeigt einen Phasenwechsel mit stehengebliebener Frist als **Aufgabe**, nicht
> als Warnung — konsistent mit der CTA-Sortierung in §8.7.

#### `RoundParticipation` — wer an dieser Runde teilnimmt

Trägt **V-2**, die Rundensichtbarkeit. Eine Zeile pro Profil pro Runde.

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `round_id` | `uuid` | ⚙️ | |
| `resident_profile_id` | `uuid` | ⚙️ | |
| `source` | `enum(snapshot_at_open, added_manually)` | ⚙️ | Teilnehmende werden beim Rundenstart aus den aktiven Bewohnenden **gesnapshottet**, danach explizit hinzufügbar und entfernbar |
| `can_vote` | `bool` | ⚙️ | aus `Membership.is_resident` beim Anlegen übernommen, danach eigenständig — damit ein späterer Rollenwechsel eine laufende Runde nicht verändert |
| `added_at` | `timestamptz` | ⚙️ | |
| `removed_at` | `timestamptz?` | ⚙️ | Entfernen ist reversibel und auditiert (P-4) |

> **Neu eintretende Profile sehen die Runde inklusive Historie zu *anderen* Kandidaten.** Das ist
> gewollt: ohne diesen Kontext kann die Person nicht sinnvoll mitentscheiden. Den heiklen Teil deckt
> **V-1** ab (Beratungsinhalte über die Person selbst), nicht eine Zugriffssperre auf die Runde.

#### `Application` — die Bewerbung

Die zentrale personenbezogene Entität, und die einzige, deren Betroffene das Produkt **nicht
gewählt haben.** Entsprechend die strengste Datenhaltung.

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `household_id` | `uuid` | ⚙️ | redundant zur Runde, aber Anker der RLS-Policy (ADR-004) |
| `round_id` | `uuid` | ⚙️ | |
| `applicant_name` | `text` | 🔴 | **Pflichtfeld**, das einzige |
| `age` | `int?` | 🔴 | |
| `contact_email` | `text?` | 🔴 | |
| `contact_phone` | `text?` | 🔴 | |
| `contact_other` | `text?` | 🔴 | Portal-Handle, Messenger-Name — Kanalneutralität (P-1) |
| `message_raw` | `text?` | 🔴 | die eingegangene Bewerbungsnachricht im Original. **Enthält unvermeidlich besondere Kategorien nach Art. 9** → keine KI-Bewertung (P-5), strenge Aufbewahrung |
| `attributes` | `jsonb?` | 🔴 | freie Zusatzangaben (Hobbys, Beruf, Haustiere). **Keine einladenden Strukturfelder** für Art.-9-Kategorien — bewusste Auslassung, nicht Vergessen |
| `source` | `enum(manual_form, paste_parser, availability_link, portal_import)` | ⚙️ | **technischer Pfad.** Jeder Erfassungspfad erzeugt **dasselbe** Domänenobjekt (P-1, ADR-009). `portal_import` ist für v1.2 reserviert |
| `collected_from` | `enum(data_subject, third_party)` | ⚙️ | **Pflichtfeld, kein Default.** *Bei wem* wurden die Daten erhoben — die rechtlich entscheidende Achse. Siehe Kasten unten |
| `subject_statement` | `text?` | 🔴 | **Gegendarstellung der betroffenen Person.** Die Antwort auf Art. 16 bei subjektiven Beurteilungen. **Erbt die Frist der `Application`, kein eigener Zeitgeber, Löschung in derselben Transaktion** — siehe Kasten. Modell in v1, UI in v1.1 |
| `state` | `enum(...)` | ⚙️ | §3.1, elf Werte |
| `state_changed_at` | `timestamptz` | ⚙️ | |
| `became_resident_id` | `uuid?` | 🟠 | **das sensibelste Feld des Modells.** Trägt V-1. Siehe Kasten unten |
| `assigned_room_id` | `uuid?` | ⚙️ | für welches Zimmer die Zusage gilt |
| `planned_move_in_on` | `date?` | 🔴 | |
| `decision_note` | `text?` | ⚫ | vorläufige Beschlüsse der WG („erst Zimmer 2 anbieten") |
| `rejection_reason` | `text?` | ⚫ | |
| `retention_until` | `date` | ⚙️ | Default `created_at + 180 Tage`, siehe §7 |
| `subject_access_exported_at` | `timestamptz?` | 🔴 | wann eine Datenauskunft erzeugt wurde — Nachweis der Unterstützungspflicht |
| `created_by_account_id` | `uuid` | ⚙️ | |
| `created_by_profile_id` | `uuid?` | ⚙️ | `null` = im Verwaltungskontext angelegt |
| `created_at` · `deleted_at` | `timestamptz` · `timestamptz?` | ⚙️ | |

> **`source` und `collected_from` sind zwei Achsen, nicht eine — und ein Feld hätte gebrochen.**
>
> `source` beantwortet: **über welchen technischen Pfad** kam die Bewerbung herein. Produktfrage,
> Analytikfrage, Grundlage für P-1.
>
> `collected_from` beantwortet: **bei wem wurden die Daten erhoben.** Rechtsfrage — und davon hängt
> ab, ob **Art. 13** gilt (Erhebung bei der betroffenen Person) oder **Art. 14** (Dritterhebung, mit
> eigener Informationspflicht und Monatsfrist).
>
> Die beiden Achsen sind **nicht** ineinander übersetzbar, und `paste_parser` ist der Beweis: dieselbe
> eingefügte Nachricht kann von der bewerbenden Person selbst geschrieben worden sein
> (→ `data_subject`, Art. 13) **oder** von einer dritten Person weitergeleitet
> (→ `third_party`, Art. 14). Ein Feld für zwei Fragen hätte hier still die falsche Antwort gegeben.
>
> **Deshalb Pflichtfeld ohne Default.** Ein Default würde die Rechtsfrage im Verborgenen entscheiden —
> und zwar immer in dieselbe Richtung, nämlich die bequemere.
>
> UI-seitig ist es trotzdem ein Blick und keine Friktion: `data_subject` ist **vorausgewählt** (es ist
> der Regelfall), daneben steht eine Checkbox **„diese Bewerbung wurde mir weitergeleitet"**. Wird sie
> gesetzt, löst das den Art.-14-Hinweis für den Haushalt aus.
>
> Zur Erinnerung an die Rollenverteilung: **Flatmate.io ist Auftragsverarbeiter und selbst niemandem
> informationspflichtig** (Art. 14 gilt für Auftragsverarbeiter nicht). Das Feld dient dazu, dem
> **Haushalt** als Verantwortlichem zu sagen, welche Pflicht ihn trifft — es ist ein Hilfsmittel, keine
> eigene Pflichterfüllung.

> **`subject_statement` — warum Berichtigung hier ein eigenes Feld braucht.**
>
> Art. 16 gibt das Recht auf **Berichtigung unrichtiger** Daten. Eine subjektive Beurteilung
> („Lea wirkte unpünktlich") ist aber nicht *unrichtig* — sie ist eine Meinung, und sie zu löschen
> oder umzuschreiben würde die Beratungshistorie verfälschen. Zugleich ist sie ein personenbezogenes
> Datum und auskunftspflichtig.
>
> Die saubere Auflösung ist **Beistellung statt Änderung**: die betroffene Person kann eine eigene
> Gegendarstellung an den Datensatz hängen, und der Auskunftsexport enthält beide.
>
> Wichtig für die Klassifizierung: `subject_statement` ist 🔴, **nicht ⚫** — es ist die Aussage der
> betroffenen Person über sich selbst und unterliegt deshalb **nicht** V-1. Sie darf ihre eigene
> Gegendarstellung natürlich lesen.
>
> **Aufbewahrung: kein eigener Zeitgeber, und die Löschung muss atomar sein.** Das ist eine
> Modelleigenschaft, keine Prozessnotiz — deshalb steht sie hier und nicht nur in §7.
>
> `subject_statement` **erbt die Frist der `Application`** (180 Tage) und wird **in derselben
> Transaktion** gelöscht wie die Beurteilungen, gegen die sie sich richtet. Zwei getrennte
> Aufbewahrungsjobs sind ausdrücklich unzulässig.
>
> **Der Grund ist ein Rekonstruktionsleck, nicht Ordnungsliebe.** Bleibt die Gegendarstellung auch nur
> für die Dauer eines Jobs übrig, nachdem die Beurteilungen gelöscht sind, steht dort
> *„Ich widerspreche der Aussage, ich sei unpünktlich gewesen"* — **ohne die Aussage.** Der Inhalt der
> gelöschten Beurteilung wird dadurch aus ihrer Erwiderung wieder ableitbar. Ein Löschjob, der zuerst
> die Notizen und danach die Gegendarstellung nimmt, öffnet genau dieses Fenster.
>
> Und das ist die Kehrseite der Entscheidung, `subject_statement` von V-1 auszunehmen: es ist das
> **einzige 🔴-Feld, das die betroffene Person selbst lesen darf** — und damit das einzige, bei dem ein
> Löschfenster nach außen sichtbar wäre. Die Ausnahme von V-1 ist richtig, aber sie kostet diese
> zusätzliche Regel.
>
> Der Zweck stützt dieselbe Frist: eine Gegendarstellung dient dazu, die Beurteilungen zu
> **kontextualisieren**, gegen die sie sich richtet. Fallen die weg, entfällt ihr Zweck — eine längere
> Aufbewahrung wäre nach Art. 5 Abs. 1 lit. e nicht begründbar.

> ⚠️ Offener Punkt (O-10): **Modell in v1, UI in v1.1.** Der Weg, über den eine bewerbende Person die
> Gegendarstellung überhaupt einreicht, ist nicht entschieden — sie hat kein Konto (P-1).

> **`became_resident_id` — n:1, nicht 1:1, und das ist die Pointe.**
>
> Wird eine Bewerbung zum Bewohner, verweist sie auf das entstandene `ResidentProfile`. Jedes
> Beratungsartefakt an einer solchen Bewerbung wird für dieses Profil unsichtbar (V-1).
>
> **Mehrere Bewerbungen dürfen auf dasselbe Profil zeigen.** Das ist notwendig, nicht bequem: wer
> sich vor zwei Jahren erfolglos beworben hat und diesmal einzieht, hat **zwei** Bewerbungen im
> System — und die alte enthält Stimmen und Notizen über dieselbe Person. Zeigt nur die neue
> Bewerbung auf das Profil, leckt die alte.
>
> Deshalb: die Verknüpfung ist ein **Feld auf jeder betroffenen Bewerbung**, und die UI braucht eine
> Aktion „diese frühere Bewerbung derselben Person zuordnen".
>
> ⚠️ Offener Punkt (O-1) — offen und wichtig: Diese Zuordnung ist **manuell** und damit unzuverlässig. Wer sie
> vergisst, erzeugt genau das Leck, das V-1 verhindern soll. Automatisches Zusammenführen über
> Name oder E-Mail wäre eine eigene, datenschutzrechtlich nicht triviale Entscheidung
> (Duplikaterkennung über Bewerberdaten). Für `GUARDRAILS.md` vormerken: ein geschützter Test
> deckt V-1 nur bei **verknüpften** Bewerbungen ab; die Lücke ist prozessual, nicht technisch.

#### `AppointmentAttendance` — wer beim Termin da war, und wer schon notiert hat

**Löst O-7 auf** (entschieden, §10.2), Grundlage für die Erinnerungs-Notification aus SRD-Scope-Zeile **S-46**. `Appointment.expected_attendee_profile_ids` (§2.4) trägt nur
die *Absicht* teilzunehmen. Sobald mehr als Absicht festzuhalten ist — war die Person wirklich da,
hat sie schon eine `CastingNote` geschrieben — reicht ein Array nicht mehr: es kann „wollte
teilnehmen, war aber nicht da" nicht von „war da, hat aber noch nichts geschrieben" unterscheiden.
Genau diese Unterscheidung braucht die Erinnerung, die nach `scheduled → interviewed` (§3.1, der
reale „Casting fand statt"-Moment) an noch fehlende Notizen erinnert (`casting.note_reminder_due`,
siehe unten bei `ActivityEvent`/`Notification`).

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `appointment_id` | `uuid` | ⚙️ | |
| `resident_profile_id` | `uuid` | 🟠 | analog zu `Appointment.expected_attendee_profile_ids` |
| `attended` | `bool` | 🟠 | **Umgedreht (U-23), korrigiert gegenüber der vorherigen Fassung.** Entsteht mit `true`, wenn `Appointment.status → confirmed` wechselt (§3.1) — nicht erst danach. Von der **betroffenen Person selbst** vor dem Termin auf `false` änderbar (Absage einer einzelnen Person, siehe Kasten). Von der Moderation **jederzeit korrigierbar**, aber nur als Ausnahmefall gedacht |
| `note_written` | `bool` | ⚫ | ob diese Person zu dieser Bewerbung bereits eine `CastingNote` verfasst hat — dieselbe Beratungs-Sensibilität wie `CastingNote.author_profile_id` |

> **Warum eine eigene Tabelle und kein weiteres Feld auf `Appointment`.** Beides — Anwesenheit und
> Notizstatus — ist eine Aussage **pro Teilnehmenden**, nicht pro Termin: ein Termin mit vier
> eingeladenen Bewohnenden kann drei Anwesende und eine Notiz von nur zweien haben.
> `expected_attendee_profile_ids` kann diese Kombination nicht tragen, ohne selbst zu einer
> verkappten Tabelle zu werden — genau das war die Lücke, die O-7 benannte. Die Tabelle steht im
> `casting`-Kontext statt bei `Appointment` in `scheduling`, weil ihr eigentlicher Zweck die
> CastingNote-Erinnerung ist, nicht die Terminverwaltung.

> **Anwesenheit wird angenommen, nicht erfasst (U-23) — und das schließt zugleich die bisher
> fehlende kurzfristige Einzelabsage (S-51).** Der Grund für die Umkehr: die Information liegt
> ohnehin vor — wer auf den `Slot` reagiert hat und im `Appointment` als Teilnehmender steht, wollte
> da sein. Im Normalfall tut die moderierende Person deshalb **nichts**:
>
> | Wann | Was passiert | Wer handelt |
> |---|---|---|
> | `Appointment.status → confirmed` | `AppointmentAttendance`-Zeilen entstehen aus `expected_attendee_profile_ids`, `attended = true` | niemand |
> | vor dem Termin | Erinnerung an die Teilnehmenden; **„Ich kann doch nicht"** setzt `attended = false` für genau diese Person | die betroffene Person, nur im Ausnahmefall |
> | `scheduled → interviewed` | Notiz-Erinnerung (`casting.note_reminder_due`) geht an alle mit `attended = true` **und** `note_written = false` | niemand |
> | danach | „War jemand doch nicht da?" — Korrektur, erreichbar, aber **nie erforderlich** | Moderation, nur im Ausnahmefall |
>
> **Das schließt die Lücke, die B-3/S-51 benannt hatten:** Vorher kannte `Appointment.status` nur
> Zustände für den **ganzen** Termin (`cancelled`, `no_show`); eine Absage **einer einzelnen** Person
> aus einer Gruppe von Teilnehmenden hatte weder Feld noch Weg. Jetzt trägt `AppointmentAttendance`
> genau das — ohne dass `Appointment` selbst eine eigene Zustandsmaschine braucht (§3.4 bleibt
> gültig: der Fall, der dort als Auslöser für eine echte `Appointment`-Maschine genannt wird, „Zu-/
> Absagen einzelner Bewohnender", ist damit auf Ebene der Attendance-Zeile gelöst, nicht auf Ebene
> des Termins).
>
> **Was ausdrücklich kein neues Feld bekommt:** wer die letzte Änderung an `attended` vorgenommen hat
> (`self` vs. `moderation`). Diese Information trägt bereits `ActivityEvent.actor_profile_id` am
> auslösenden Ereignis — ein zweites Feld dafür wäre eine zweite Wahrheit neben dem Log.
