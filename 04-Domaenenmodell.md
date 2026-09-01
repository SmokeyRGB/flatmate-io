# 04 — Domänenmodell: Flatmate.io

### Entitäten · Zustandsmaschinen · Bounded Contexts · Sichtbarkeitsinvarianten · Rechenmodelle

> **Version:** V0.3 — *Änderung ggü. V0.2: Rückläufer aus `06-Compliance-Anhang.md` und `03-PRD.md`.
> **Neue Felder in `Household`:** `contact_email` sowie die vier `privacy_notice_*`-Felder (§2.1) —
> Flatmate.io **erzeugt** die Datenschutzseite, veröffentlichen muss der Verantwortliche.
> **`Application.subject_statement`** erbt die Frist der Bewerbung, kein eigener Zeitgeber, Löschung
> in derselben Transaktion (§2.2, §7). Feldsumme 52 (§9).*
>
> *Ggü. V0.1: Querprüfung gegen `06-Compliance-Anhang.md` eingearbeitet. Neue Felder
> `Application.collected_from`, `Application.subject_statement` (§2.2); neue Entitäten `Session`,
> `PasskeyCredential` (§2.1), `AvailabilityToken` (§2.4); entschieden O-2 (§5.3), O-3 (§8.3),
> O-4 (§2.1), O-6, O-9 (§9.3); `Membership.role` und `.permissions` von ⚙️ auf 🟠 umklassifiziert.*
> **Datum:** 2026-08-19
> **Autor:** Samuel Zink (@SmokeyRGB)
> **Vorgänger:** `00-Session-Brief.md` · `01-Problem-Framing.md` · `02-SRD.md` · `03-PRD.md`
> **Nachfolger:** `05-ADRs.md` · `06-Compliance-Anhang.md` · `GUARDRAILS.md`

---

> # ⚠️ Status: unverbindlich, anfechtbar, erster Einstiegspunkt für die Projektplanung — keine finalen Constraints.
>
> Dieses Dokument ist **kein Schema-Beschluss und kein Migrationsplan.** Es hält fest, was in der
> Anforderungs-Session besprochen wurde, damit es beim Aufsetzen des Implementierungs-Repos nicht
> verlorengeht. Jede Entität, jedes Feld, jeder Zustand und jede Formel darf beim ersten
> Kontakt mit dem Code umgeworfen werden.
>
> Deshalb ist jede Entscheidung hier **mit ihrer Begründung** notiert — nicht „so wird es gemacht",
> sondern „so schlagen wir es vor, **weil** …, und das gibt man auf, **wenn** …". Wer eine Zeile
> ändern will, braucht dann nur das Weil zu widerlegen, nicht das ganze Dokument neu zu lesen.
>
> **Zwei Ausnahmen von der Unverbindlichkeit**, weil andere Dokumente parallel darauf verweisen:
> die **Entitätsnamen** (§2) und die **Nummerierung der Sichtbarkeitsregeln** (§5) sind
> Bezeichner-Kontrakt. Wer sie ändert, muss `03-PRD.md`, `05-ADRs.md`, `06-Compliance-Anhang.md`
> und `GUARDRAILS.md` mitziehen.

---

## 0. Lesehinweise

### 0.1 Sprachregelung

Erläuterungstext **deutsch**, alle Bezeichner — Entitäten, Felder, Zustände, Enum-Werte, Funktionen
— **englisch**, weil der Code später englisch entsteht (siehe ADR-012). `Household` heißt im UI
in v1 durchgängig **„WG"**; das Label ist Präsentation, nicht Domäne.

### 0.2 Typnotation

Absichtlich datenbanknah, aber nicht Drizzle-spezifisch — das Domänenmodell soll auch dann noch
lesbar sein, wenn der Datenzugriff getauscht wird.

| Notation | Bedeutung |
|---|---|
| `uuid` | Primär- und Fremdschlüssel |
| `text`, `int`, `bool`, `numeric` | Skalare |
| `timestamptz`, `date`, `time` | Zeitpunkte immer mit Zone, Kalendertage ohne |
| `enum(a, b, c)` | geschlossene Wertemenge, im Code als Union-Typ |
| `jsonb` | offene Struktur; nur dort, wo Felder nutzerdefiniert oder Payload sind |
| `uuid[]`, `text[]` | Feld mit Mehrfachwert |
| Suffix `?` | nullable / optional |
| Kursiv im Feldnamen | **abgeleitet, nicht gespeichert** (berechnete Projektion) |

### 0.3 Datenschutz-Klassen

Jedes Feld trägt eine Klasse. Sie ist die Brücke zum `data-inventory.yml` (ADR-010) und zum
Compliance-Anhang: **jedes mit 🔴, 🟠 oder ⚫ markierte Feld braucht dort eine Zeile** mit Zweck,
Rechtsgrundlage, Kategorie und Frist. §9 listet sie noch einmal geschlossen auf.

| Klasse | Bedeutung | Folge |
|:--:|---|---|
| 🔴 | personenbezogen, **Bewerbende** — Dritte, die die App nicht nutzen und sie nicht gewählt haben | Aufbewahrungsfrist, Auskunftsexport, Löschautomatik |
| 🟠 | personenbezogen, **Bewohnende / Account** — Nutzende mit eigenem Zugang | Betroffenenrechte, Auth-Härtung |
| ⚫ | personenbezogen **und Beratungsinhalt über eine Person** — Stimmen, Vetos, Notizen, Aggregate | zusätzlich Selbst-Redaktion **V-1**, strengste Klasse |
| ⚙️ | nicht personenbezogen (technisch, Konfiguration, Zeitraster) | keine Inventarzeile nötig |

> ⚫ ist keine Alternative zu 🔴/🟠, sondern eine Verschärfung: ein ⚫-Feld ist immer auch
> personenbezogen. Der Unterschied ist, dass es zusätzlich **vor der betroffenen Person selbst**
> verborgen werden muss — das ist der schwierigste Teil des Produkts (§5).

### 0.4 Was dieses Dokument nicht enthält

Keine Indizes, keine Migrationen, keine API-Verträge, keine Screen-Zuordnung. Die
Aufwandsschätzung steht in `02-SRD.md`, der Stack in ADR-006, die Rechtsanalyse der markierten
Felder in `06-Compliance-Anhang.md`.

---

## 1. Landkarte

```text
                            ┌──────────────────────────────────────┐
      identity              │  Account ──owns──▶ Household         │
                            │   │  │                  │            │
                            │   │  ├─▶ Session        │            │
                            │   │  └─▶ PasskeyCredential           │
                            │   │                HouseholdSettings │
                            │   ▼                     │            │
                            │  Membership ◀───────────┘            │
                            │     │  (is_resident, role, perms)    │
                            │     ▼                                │
                            │  ResidentProfile                     │
                            └──────┬───────────────────────────────┘
                                   │ referenziert (nie join über Grenze)
      casting              ┌───────▼──────────────────────────────┐
                           │  CastingRound ──has──▶ Room          │
                           │     │  │                             │
                           │     │  └──▶ RoundParticipation ──▶ ResidentProfile
                           │     ▼                                │
                           │  Application  ──became_resident_id──▶ ResidentProfile
                           └───┬───────────────────────┬──────────┘
                               │                       │
      deliberation  ┌──────────▼─────────┐   scheduling ▼────────────────────┐
                    │  Vote              │   │  AvailabilityWindow           │
                    │  Veto              │   │  AvailabilityToken            │
                    │  CastingNote       │   │  Slot ──▶ Appointment         │
                    │  ⟨Ranking, pure⟩   │   │        (Solver-Port)          │
                    │                    │   │  ⟨Kostenmodell, pure⟩         │
                    └──────────┬─────────┘   └───────────┬───────────────────┘
                               │  Domain-Events          │
      audit                    ▼─────────────────────────▼
                            ┌──────────────────────────────────────┐
                            │  ActivityEvent  (append-only)        │
                            └──────────────┬───────────────────────┘
      notifications                        ▼
                            ┌──────────────────────────────────────┐
                            │  Notification  (Fan-out, gefiltert)  │
                            └──────────────────────────────────────┘
```

Zwei Dinge sind an dieser Karte wichtiger als die Kästen:

1. **`Application.became_resident_id` ist der einzige Pfeil, der aus `casting` zurück in
   `identity` zeigt** — und er trägt die gesamte Selbst-Redaktion (§5.1). Er ist damit das
   sensibelste Feld des Modells.
2. **`Notification` hängt hinter `ActivityEvent`, nicht neben den Fachkontexten.** Der Fan-out
   liest Ereignisse und fragt sichtbarkeitsgefilterte Projektionen ab; er greift nie direkt in
   `deliberation`. Sonst wäre der Benachrichtigungspfad der bequemste Weg, die
   Sichtbarkeitsregeln zu umgehen — historisch das häufigste Leck in solchen Systemen.

---

## 2. Entitäten

Die **17 Namen** aus dem Bezeichner-Kontrakt sind verbindlich (siehe Statusbanner).

**Drei weitere Entitäten sind in V0.2 aus der Querprüfung mit `06-Compliance-Anhang.md`
hinzugekommen:** `Session`, `PasskeyCredential`, `AvailabilityToken`. Sie sind technisch notwendig —
der Compliance-Anhang stützt Aussagen darauf, die im Modell kein Gegenstück hatten. Sie sind
aber **nicht** Teil des ursprünglichen Kontrakts: ihre Namen dürfen beim Aufsetzen des Auth- bzw.
Scheduling-Moduls noch geändert werden, ohne dass Verweise brechen.

Reihenfolge nach Bounded Context.

### 2.1 Kontext `identity`

#### `Account` — der Zugang

Ein Login. **Nicht** identisch mit „Person" und nicht identisch mit „bewohnender Person": ein
Account kann sowohl den Verwaltungskontext des Haushalts als auch ein Bewohner-Profil bedienen und
zwischen beiden wechseln.

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `email` | `text?` | 🟠 | **Pflicht beim Haushalts-Admin-Account** (der erste, bei der Registrierung angelegte Account, `Membership.is_resident = false`) — eindeutig, dort als **gemeinsam genutzte Adresse** empfohlen (Hinweis im Registrierungsformular), damit das Eigentum am Zugang beim Auszug nicht mitwandert. **Nullable bei Resident-Accounts** (`Membership.is_resident = true`, angelegt beim Beitritt per Code): nicht mehr Pflichtfeld im Beitrittsformular, nach dem Onboarding optional nachpflegbar — Voraussetzung dafür, dass `web_push` als bevorzugter Kanal tragfähig ist (§2.5). Nicht zu verwechseln mit `Household.contact_email` oben, das davon unberührt bleibt |
| `password_hash` | `text` | 🟠 | Argon2id. Passwort ist die **primäre und universelle** Methode (P-2, ADR-007) |
| `email_verified_at` | `timestamptz?` | 🟠 | Verifikation ist **nachgelagert** und blockiert die erste Abstimmung nicht — aber Voraussetzung für jeden Benachrichtigungsversand und für Mailinhalte mit Beratungsbezug |
| `passkey_enabled` | `bool` | ⚙️ | optionaler Komfort-Aufsatz, jederzeit abschaltbar (ADR-007) |
| `locale` | `text` | ⚙️ | v1 nur `de` |
| `last_seen_at` | `timestamptz?` | 🟠 | speist „was ist passiert, während ich weg war" |
| `created_at` | `timestamptz` | ⚙️ | |
| `deleted_at` | `timestamptz?` | ⚙️ | Soft-Delete; harte Löschung über das Löschkonzept |

#### `Session` — die angemeldete Sitzung

**Neu in V0.2** (Querprüfung). Login-Sessions sind personenbezogen und nach **§ 25 Abs. 2 Nr. 2
TDDDG einwilligungsfrei**, weil sie zur Erbringung des Dienstes unbedingt erforderlich sind — genau
darauf stützt sich `06-Compliance-Anhang.md` §10.1. Das Modell muss sie deshalb führen, statt sie
dem Auth-Modul zu überlassen.

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `token_hash` | `text` | 🟠 | **nur der Hash.** Ein Session-Token im Klartext in der Datenbank ist ein Passwortäquivalent |
| `account_id` | `uuid` | 🟠 | |
| `acting_profile_id` | `uuid?` | 🟠 | **hier lebt der Profilwechsel.** `null` = Verwaltungskontext, gesetzt = Bewohnerkontext |
| `expires_at` | `timestamptz` | ⚙️ | |
| `user_agent` | `text?` | 🟠 | zur Wiedererkennung eigener Geräte in einer Sitzungsliste |
| `created_at` | `timestamptz` | ⚙️ | |
| `revoked_at` | `timestamptz?` | ⚙️ | „überall abmelden" nach einem Passwortwechsel |

> **`acting_profile_id` ist die technische Heimat von V-1.** Der Sitzungskontext aus §5 — `account_id`
> plus `profile_id` — wird aus dieser Zeile gefüllt und pro Request per `SET LOCAL` an Postgres
> übergeben (ADR-004). Und weil die Selbst-Redaktion am **Account** hängt und nicht am aktiven Profil,
> ist ein Wechsel von `acting_profile_id` **kein** Weg an V-1 vorbei: `redaction_subjects()` sammelt
> alle Profile des Accounts, unabhängig davon, welches gerade gesetzt ist.
>
> Daraus folgt eine harte Regel für den Auth-Baustein: `acting_profile_id` darf nur auf ein Profil
> zeigen, für das eine gültige `Membership` desselben Accounts existiert. Ohne diese Prüfung wäre der
> Profilwechsel eine Rechteausweitung.

#### `PasskeyCredential` — der optionale Passkey

**Neu in V0.2** — löst den offenen Punkt O-6 auf. ADR-007 hängt daran: Passkey ist ein **optionaler
Aufsatz nach der Registrierung**, jederzeit abschaltbar, nie Voraussetzung (P-2).

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `account_id` | `uuid` | 🟠 | mehrere Credentials pro Account sind erlaubt (Handy **und** Rechner) |
| `credential_id` | `text` | 🟠 | vom Authenticator vergeben, eindeutig |
| `public_key` | `text` | 🟠 | öffentlicher Schlüssel — kein Geheimnis, aber accountbezogen |
| `sign_count` | `int` | ⚙️ | Klonschutz; muss monoton steigen |
| `label` | `text?` | 🟠 | von der Person gesetzt („iPhone", „Laptop") |
| `created_at` · `last_used_at` | `timestamptz` · `timestamptz?` | 🟠 | |

> **Löschen eines Passkeys darf nie den Zugang entziehen.** Das Passwort bleibt die universelle
> Methode; `Account.passkey_enabled` ist eine Anzeige, keine Bedingung. Wer den letzten Passkey
> entfernt, ist weiter angemeldet und kann sich weiter anmelden — sonst kippt ADR-007 vom
> „optionalen Aufsatz" in eine Abhängigkeit und verletzt P-2.

#### `Household` — der Haushalt

Neutral gegenüber WG, Wohnprojekt, Haus und Vermieter-Objekt. UI-Label in v1 durchgängig „WG".

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `name` | `text` | ⚙️ | frei, z. B. „Hausprojekt Nordstadt" |
| `owner_account_id` | `uuid` | ⚙️ | der Account, der registriert hat. **Keine Sicherheitsgrenze** (Klarstellung unten), nur Zuordnung |
| `contact_email` | `text` | 🟠 | **die nach außen genannte Kontaktangabe** für Art. 13 Abs. 1 lit. a. **Bewusst nicht dasselbe Feld wie `Account.email`**, auch wenn beide dieselbe Adresse enthalten können — siehe Kasten |
| `privacy_notice_state` | `enum(draft, published)` | ⚙️ | Zustand der haushaltseigenen Datenschutzseite. Default `draft` |
| `privacy_notice_version` | `int` | ⚙️ | jede Veröffentlichung erhöht die Version; frühere Fassungen bleiben nachweisbar |
| `privacy_notice_published_at` | `timestamptz?` | ⚙️ | |
| `privacy_notice_published_by_account_id` | `uuid?` | 🟠 | **wer veröffentlicht hat** — die Erklärung wird im Namen des Verantwortlichen abgegeben, also braucht sie einen Urheber |
| `join_code` | `text` | ⚙️ | **ein Code für den ganzen Haushalt**, nicht pro Person. Drei Auflagen, siehe Kasten unten |
| `join_code_rotated_at` | `timestamptz?` | ⚙️ | |
| `entity_label` | `enum(wg, wohnprojekt, haus, objekt)` | ⚙️ | in v1 fest `wg`, später pro Objekt wählbar |
| `created_at` | `timestamptz` | ⚙️ | |
| `deleted_at` | `timestamptz?` | ⚙️ | |

> **Klarstellung, die im Modell sichtbar bleiben muss.** Jede bewohnende Person kann sich
> theoretisch im Haushalts-Account anmelden, wenn E-Mail und Passwort bekannt sind. Die Trennung
> zwischen Verwaltungs- und Bewohnerkontext dient **ausschließlich der Klarheit** — nur Bewohnende
> stimmen ab, um Verwirrung zu vermeiden. Sie ist **keine Härtung** und darf in keinem Dokument als
> solche dargestellt werden.
>
> Konsequenz für §5.1, und sie ist nicht kosmetisch: die Selbst-Redaktion muss am **Account**
> hängen, nicht nur am gerade aktiven Profil. Sonst wäre der Profilwechsel der einfachste Weg, die
> Invariante zu umgehen.

> **`contact_email` ist nicht `Account.email` — auch wenn beide dieselbe Adresse enthalten.**
>
> `Account.email` ist die **Anmeldeadresse**. `Household.contact_email` ist die **nach außen genannte
> Kontaktangabe**, die im Datenschutzhinweis an Bewerbende steht (Art. 13 Abs. 1 lit. a). Sie fallen
> in der Praxis meist zusammen und trotzdem sind es zwei Dinge: die Anmeldeadresse zu ändern darf den
> veröffentlichten Datenschutzhinweis nicht still umschreiben, und umgekehrt darf eine öffentlich
> genannte Kontaktadresse nicht implizit ein Login sein.
>
> **Und ausdrücklich keine Postanschrift** (entschieden in `06-Compliance-Anhang.md` §4.6): eine
> WG-E-Mail ist die verhältnismäßige Kontaktangabe. Eine WG, die Bewerbenden ihre Postanschrift
> offenlegt, erzeugt ein Datenschutzproblem **für die Bewohnenden selbst** — man würde eine Pflicht
> gegenüber Bewerbenden mit einem Risiko für Bewohnende bezahlen. Das Modell führt deshalb kein
> Adressfeld, und das ist eine Entscheidung, keine Lücke.

> **Die vier `privacy_notice_*`-Felder: Flatmate.io erzeugt, der Verantwortliche veröffentlicht.**
>
> Die tragende Regel dahinter ist eine Rollenregel, nicht eine Komfortfrage: **als
> Auftragsverarbeiter darf man eine rechtliche Erklärung im Namen eines Dritten vorbereiten, aber
> nicht abgeben.** Flatmate.io kann die Datenschutzseite eines Haushalts vollständig generieren — den
> Schritt „das gilt jetzt für uns" muss der Haushalt als Verantwortlicher selbst tun.
>
> `06-Compliance-Anhang.md` setzt das über einen Typ **`PublishedPrivacyNotice`** durch, der **nur aus
> einem freigegebenen Datensatz konstruierbar** ist (Guardrail G-C9): ein `draft` passt nicht in den
> Typ und ist damit nicht auslieferbar.
>
> **Warum diese Bauform besser ist als die naheliegende.** Die naheliegende Variante wäre eine Prüfung
> in der Route: „wenn `privacy_notice_state != 'published'`, dann 404". Die kann man vergessen — an
> einer neuen Route, in einem Export, in der Vorschau. Ein Typ, den man ohne Freigabe nicht bauen
> kann, lässt sich nicht vergessen, weil der Compiler die Stelle findet. Dieselbe Logik wie bei
> ADR-004: der wahrscheinlichste Fehler ist eine vergessene Prüfung, also gehört die Absicherung in
> eine Schicht, die man nicht übergehen kann.
>
> `privacy_notice_version` ist dabei kein Zierrat: der Nachweis, **welche Fassung** einer bewerbenden
> Person zu einem Zeitpunkt gezeigt wurde, ist genau das, was im Streitfall zählt.

> **`join_code`: drei Auflagen, keine Empfehlungen** (entschieden in der Querprüfung, O-9 Grenzfall 2).
> Der Code identifiziert einen **Haushalt, keine Person** — deshalb ⚙️ und keine Zeile im
> Art.-30-Verzeichnis. Er gehört stattdessen in die **TOM-Liste**, denn wer ihn hat, kommt an
> Beratungsinhalte. Daraus folgt:
>
> 1. **Rotierbar** durch die organisierende Person. Rotation **entwertet ausstehende Einladungen** —
>    das ist der ganze Zweck.
> 2. **Niemals in einem Log**, auch nicht im Zugriffslog. Der Einladungslink trägt den Code im
>    **Pfad**, also braucht genau diese Route **Pfad-Redaktion** im Zugriffslog.
> 3. **Niemals in einem Query-String.**
>
> Punkt 2 ist die unbequemste: „nicht ins Anwendungslog schreiben" ist trivial, „das Zugriffslog des
> Webservers für eine Route redigieren" ist eine Konfigurationsaufgabe, die man vergisst. Sie gehört
> als überprüfbare Regel in `GUARDRAILS.md`, nicht als Hinweis.

#### `HouseholdSettings` — Verfahrensregeln des Haushalts

1:1 zum `Household`. Bewusst **eine** Entität statt verstreuter Flags: das Abstimmungsverfahren ist
ein zusammenhängender Vertrag, dessen Änderung während einer laufenden Runde gesperrt bzw. laut
protokolliert wird (Regel-Sperre, §3.2).

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `household_id` | `uuid` | ⚙️ | PK und FK |
| **Abstimmung** | | | |
| `scale_weights` | `jsonb` | ⚙️ | Default `{no: 0, rather_not: 1, good: 3, definitely: 5}` — **in der UI offengelegt** (P-3) |
| `favorite_budget_enabled` | `bool` | ⚙️ | Default `true` |
| `favorite_budget_factor` | `numeric` | ⚙️ | Default `1.5`; Budget `= ceil(open_rooms × factor)` |
| `hide_results_until_voted` | `bool` | ⚙️ | Default `true` (Anker- und Bandwagon-Effekt, V-4) |
| `quorum_share` | `numeric` | ⚙️ | **Default `0.5`** (entschieden, §8.3): mindestens die Hälfte der stimmberechtigten Teilnehmenden, bevor eine Bewerbung in der Rangliste erscheint |
| **Veto** | | | |
| `veto_budget_per_round` | `int` | ⚙️ | Default `1` |
| `veto_requires_reason` | `bool` | ⚙️ | Default `true` |
| `veto_anonymous_allowed` | `bool` | ⚙️ | **Opt-in**, Default `false` |
| **Termine** | | | |
| `appointment_duration_minutes` | `int` | ⚙️ | Default `45` |
| `earliest_time_of_day` | `time` | ⚙️ | z. B. „erst ab 18:00" |
| `latest_time_of_day` | `time` | ⚙️ | |
| `max_appointments_per_day` | `int?` | ⚙️ | harter Constraint H3 |
| `parallel_appointments_allowed` | `bool` | ⚙️ | Default `false`, siehe H2 |
| `max_parallel_appointments` | `int` | ⚙️ | nur wirksam, wenn parallel erlaubt |
| `min_buffer_minutes` | `int` | ⚙️ | Mindestpuffer zwischen Terminen, H4 |
| `min_residents_per_appointment` | `int` | ⚙️ | H6 |
| **Aufbewahrung** | | | |
| `retention_days` | `enum(30, 90, 180)` | ⚙️ | Default `180`. Der Haushalt kann **kürzen, nicht verlängern** |
| `retention_warning_days` | `int` | ⚙️ | Default `14` — keine stille Löschung |
| **Benachrichtigungen** | | | |
| `notification_event_mask` | `jsonb` | ⚙️ | Haushalts-Ebene; die persönliche Ebene liegt am `Membership` |
| `digest_mode` | `enum(digest, immediate)` | ⚙️ | Default `digest` |
| `digest_schedule` | `text` | ⚙️ | z. B. `daily_19h` |
| **Notizen** | | | |
| `note_prompts_enabled` | `bool` | ⚙️ | strukturierte Prompts statt leerem Kasten — Risikominderung zu Art. 15 |
| `updated_at` · `updated_by_account_id` | `timestamptz` · `uuid` | ⚙️ | jede Änderung erzeugt ein `ActivityEvent` |

#### `ResidentProfile` — die handelnde Person im Haushalt

Die Einheit, die **abstimmt, Notizen schreibt und Termine zusagt.** Alle Beratungsartefakte zeigen
auf ein `ResidentProfile`, nie auf einen `Account` — weil der Account den Kontext wechseln kann,
Stimmen aber einer Person zurechenbar bleiben müssen.

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `household_id` | `uuid` | ⚙️ | |
| `display_name` | `text` | 🟠 | Anzeigename im Feed („Jonas hat Lea eingeladen") |
| `status` | `enum(prepared, active, moved_out)` | ⚙️ | `prepared` = vom Haushalts-Account angelegt, noch von keinem Account übernommen |
| `moved_in_on` | `date?` | 🟠 | |
| `moved_out_on` | `date?` | 🟠 | setzt `status = moved_out` → **sofortiger Zugriffsentzug** (V-3) |
| `room_id` | `uuid?` | ⚙️ | aktuell bewohntes Zimmer |
| `created_at` | `timestamptz` | ⚙️ | |

**Warum `prepared` ein eigener Zustand ist:** Der Haushalts-Account kann ein Bewohner-Profil
anlegen, es direkt zum Moderator ernennen und danach nie wieder in den Bewohnerkontext wechseln.
Ohne `prepared` müsste man aus „Profil ohne verknüpften Account" implizit schließen — genau die Art
impliziten Zustands, die ADR-002 abschaffen will.

#### `Membership` — Zugang, Rolle, Rechte

Verbindet `Account` × `Household`. **Orthogonale Attribute statt Rollenhierarchie:** `is_resident`
und `role` sind unabhängig, weil sonst zwei Fälle in eine Hierarchie gepresst werden müssten, in
die sie nicht passen — der Vermieter-Fall (Objekt ohne eigenes Bewohner-Profil) und der Normalfall
„bewohnende Person ist zugleich Moderator".

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `household_id` | `uuid` | ⚙️ | |
| `account_id` | `uuid` | ⚙️ | |
| `resident_profile_id` | `uuid?` | ⚙️ | gesetzt, wenn dieser Account als Bewohner-Profil handeln darf; `null` = reiner Verwaltungskontext |
| `is_resident` | `bool` | ⚙️ | **Stimmberechtigung.** Der Haushalts-Account hat `false` und **kann nicht abstimmen** |
| `role` | `enum(household_admin, moderator, member)` | 🟠 | orthogonal zu `is_resident`. **In V0.2 von ⚙️ auf 🟠 umklassifiziert** — siehe Kasten |
| `permissions` | `text[]` | 🟠 | **einzeln vergebbar**, Werte siehe unten. Ebenfalls 🟠 |
| `notification_event_mask` | `jsonb?` | ⚙️ | persönliche Ebene; überschreibt die Haushalts-Ebene |
| `joined_via_code` | `text?` | ⚙️ | welcher `join_code` verwendet wurde — speist den Feed |
| `joined_at` | `timestamptz` | ⚙️ | Beitritte erscheinen im Aktivitäts-Feed (struktureller Duplikatsschutz). Zweiter Zweck: ein von `became_resident_id` unabhängiges Kriterium für moderierende Sichtbarkeit, z. B. Zugriff auf die Rundenhistorie zu Auditzwecken |
| `revoked_at` | `timestamptz?` | ⚙️ | jedes Mitglied kann entfernen |

Vergebbare Werte in `permissions` (Vorschlag, erweiterbar):
`create_application` · `change_application_state` · `close_round` · `confirm_appointment` ·
`manage_settings` · `manage_members` · `extend_retention` · `delete_data` ·
`export_subject_access`.

> **`role` und `permissions` sind 🟠, nicht ⚙️** — entschieden in der Querprüfung gegen
> `06-Compliance-Anhang.md` (O-9 Grenzfall 1), **gegen** den ursprünglichen Vorschlag dieses
> Dokuments. Begründung: Art. 4 Nr. 1 DSGVO ist weit, und „X ist Moderator" ist eine Information
> **über eine identifizierte Person**, nicht bloß Konfiguration. Folge: Zeile im
> Datenbestandsverzeichnis, **keine** automatische Frist, aber **auf Auskunftsverlangen
> offenzulegen.** Es kostet eine Zeile, und sie auszulassen wäre falsch gewesen.

> **Zwei Statusfelder mit Absicht — jetzt entschieden (O-4), ohne `residency_period`.**
>
> Die Arbeitsteilung ist bewusst und beide Seiten sind nötig:
>
> - `ResidentProfile.moved_in_on` / `.moved_out_on` (plus `status`) tragen die **Wohn-Tatsachen**.
> - `Membership.role` / `.permissions` / `.revoked_at` tragen den **Zugang**.
>
> Eine ausgezogene Person hat einen **beendeten Wohnzeitraum** *und* **entzogenen Zugang** — das sind
> zwei verschiedene Aussagen, und eine davon aus der anderen abzuleiten würde die jeweils andere
> unaussprechbar machen. V-3 hängt deshalb weiter **am Profilstatus** und nicht am Zugang: die
> Sichtbarkeit folgt der Wohnsituation, nicht der Rechteverwaltung.
>
> Verworfen wurde die Alternative, die Wohnsituation aus einer `residency_period`-Tabelle abzuleiten.
> Für v1 genügt **eine** Periode pro Profil, und eine Tabelle für eine Zeile ist Aufwand ohne
> Gegenwert.
>
> **Das gibt man auf, wenn** Aus- und Wiedereinzug modelliert werden muss — in Wohnprojekten kommt
> das vor (jemand zieht für ein Jahr weg und kommt zurück). Dann ist `residency_period` der
> **v2-Aufstiegspfad**, und die beiden Datumsfelder werden zu abgeleiteten Werten über der jüngsten
> Periode. Der Umbau ist überschaubar, solange V-3 weiter gegen den Profilstatus prüft und nicht
> gegen die Datumsfelder direkt — das ist die Bedingung, unter der dieser Aufstiegspfad billig bleibt.

#### `ApplicationInviteToken` — der Link „diese Bewerbung wird jetzt Bewohner:in"

**Neu in diesem Update.** Der Mechanismus stand bisher nur als Vorschlag in
`Product-Audit-Hypotheses.md:537–591` (S-42). Er erweitert diesen Vorschlag um die dort offen
gelassene Frage, was passiert, wenn eine **bereits registrierte** Person auf den Link klickt —
siehe Kasten.

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `application_id` | `uuid` | 🔴 | die Bewerbung, die eingelöst werden soll. Reiner Fremdschlüssel zum Nachschlagen, kein Join über die Kontextgrenze (wie z. B. `Notification.event_id`) — der Token identifiziert eine bewerbende Person, ist also personenbeziehbar |
| `token_hash` | `text` | ⚙️ | **nur der Hash** — dasselbe Muster wie bei `Session.token_hash` und `AvailabilityToken.token_hash`: ein Klartext-Token in der Datenbank ist ein Passwortäquivalent |
| `expires_at` | `timestamptz` | ⚙️ | kurze Lebensdauer, analog `AvailabilityToken` |
| `used_at` | `timestamptz?` | ⚙️ | erste Einlösung |
| `revoked_at` | `timestamptz?` | ⚙️ | |

> „Ein Invite-Token wird nur verarbeitet, wenn `Session.account_id` noch kein `ResidentProfile` in
> diesem Haushalt hat — sonst Fehler (‚Du bist bereits als Bewohner:in registriert'), kein Merge,
> keine Überschreibung von `became_resident_id`."
>
> Das ist die **Prozess-Ebene zu I-3** (§3.1): `became_resident_id` ist nach dem Setzen technisch
> unveränderlich, aber I-3 verhindert nur das stille Überschreiben, nicht den Versuch selbst. Ohne
> eine explizite Prüfung bliebe offen, was beim Klick passiert — stillschweigendes Nichtstun wäre
> verwirrend, ein Merge zweier Profile wäre eine eigene, riskante Entscheidung. Der erklärte Fehler
> ist deshalb die einzige Antwort, die mit I-3 konsistent bleibt.
>
> Für `GUARDRAILS.md`: der Satz oben ist ein geschützter Test, kein Kommentar.

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
| `phase_deadline_at` | `timestamptz?` | ⚙️ | optionale weiche Frist der aktuellen Rundenphase (S-44), sichtbar als „Stimme ab bis X" / „X Tage/Stunden übrig". **Blockiert nichts** — nach Ablauf bleibt die Runde entscheidungsfähig, die moderierende Person entscheidet aktiv weiter oder verlängert. Speist nur die CTA-Sortierung im Dashboard, analog zur bloß anzeigenden Rolle von `opened_at`/`closed_at` in dieser Tabelle |
| `closed_at` | `timestamptz?` | ⚙️ | **Ankerpunkt der Aufbewahrungsfrist** |
| `quorum_denominator_frozen` | `int?` | ⚙️ | beim Schließen eingefroren, damit abgeschlossene Runden nachträglich nicht ihre Quoten verändern |
| `retention_until` | `date?` | ⚙️ | `closed_at + retention_days`, verlängerbar (siehe unten) |
| `retention_extensions` | `jsonb` | ⚙️ | Liste `{extended_at, by_account_id, reason}` — **protokollierter** Verlängerungsknopf, nicht unbegrenzt |
| `retention_warned_at` | `timestamptz?` | ⚙️ | 14-Tage-Vorwarnung an die moderierende Person |
| *`phase_hint`* | *abgeleitet* | ⚙️ | für die UI aus den Bewerbungszuständen berechnet — **nicht gespeichert**, Begründung unten |

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
| `attended` | `bool` | 🟠 | von der moderierenden Person nach dem Termin gesetzt |
| `note_written` | `bool` | ⚫ | ob diese Person zu dieser Bewerbung bereits eine `CastingNote` verfasst hat — dieselbe Beratungs-Sensibilität wie `CastingNote.author_profile_id` |

> **Warum eine eigene Tabelle und kein weiteres Feld auf `Appointment`.** Beides — Anwesenheit und
> Notizstatus — ist eine Aussage **pro Teilnehmenden**, nicht pro Termin: ein Termin mit vier
> eingeladenen Bewohnenden kann drei Anwesende und eine Notiz von nur zweien haben.
> `expected_attendee_profile_ids` kann diese Kombination nicht tragen, ohne selbst zu einer
> verkappten Tabelle zu werden — genau das war die Lücke, die O-7 benannte. Die Tabelle steht im
> `casting`-Kontext statt bei `Appointment` in `scheduling`, weil ihr eigentlicher Zweck die
> CastingNote-Erinnerung ist, nicht die Terminverwaltung.

### 2.3 Kontext `deliberation`

Alles in diesem Kontext ist ⚫ — Beratungsinhalt über eine Person.

#### `Vote` — eine Stimme

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `round_id` · `application_id` | `uuid` · `uuid` | ⚙️ | |
| `resident_profile_id` | `uuid` | ⚫ | wer gestimmt hat |
| `stage` | `enum(invite, offer)` | ⚙️ | Runde 1 (Einladen) und Runde 2 (Zusage) nutzen **dieselbe** Skala und dieselbe Tabelle |
| `value` | `enum(no, rather_not, good, definitely)` | ⚫ | vierstufig (ADR-008) |
| `created_at` · `updated_at` | `timestamptz` | ⚙️ | Stimmen sind während des Screenings **frei revidierbar** |
| `withdrawn_at` | `timestamptz?` | ⚙️ | zurückgezogene Stimmen zählen nicht, bleiben aber im Protokoll |
| *`weight`* | *abgeleitet* | ⚙️ | `settings_snapshot.scale_weights[value]` — nie gespeichert, damit Gewichtsänderungen nachvollziehbar bleiben |
| *`cast_by_former_member`* | *abgeleitet* | ⚙️ | `profile.status == moved_out` — speist die Kennzeichnung „ehemaliges Mitglied" |

Eindeutigkeit: `(application_id, resident_profile_id, stage)`.

#### `Veto` — der Einspruch

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `round_id` · `application_id` | `uuid` · `uuid` | ⚙️ | |
| `resident_profile_id` | `uuid` | ⚫ | **auch bei anonymem Veto gespeichert** — für Budgetzählung und Missbrauchsprüfung; die Anzeige verbirgt es, die Datenhaltung nicht |
| `reason` | `text?` | ⚫ | Pflicht, wenn `veto_requires_reason` |
| `is_anonymous` | `bool` | ⚙️ | nur wählbar, wenn `veto_anonymous_allowed` |
| `stage` | `enum(offer)` | ⚙️ | v1: Veto nur in Runde 2 |
| `created_at` | `timestamptz` | ⚙️ | |
| `withdrawn_at` | `timestamptz?` | ⚙️ | |
| `locked_at` | `timestamptz?` | ⚙️ | Vetos werden an der Phasengrenze gesperrt — **kein Veto nach `offer_made`** |

> **Anonymitäts-Ehrlichkeit als Anforderung, nicht als Einstellung.** In einer Fünfer-WG ist ein
> anonymes Veto mit Begründungspflicht nicht anonym — der Schreibstil verrät die Person. Die UI
> **muss** das an der Stelle sagen, an der die Einstellung gesetzt wird. Default ist deshalb Veto
> mit Begründung **und** Zuordnung: die ehrlichere Variante.

#### `CastingNote` — die Notiz zum Casting

Der rechtlich heikelste Inhalt im ganzen Produkt (siehe `06-Compliance-Anhang.md`, „Küchentisch vs.
System"): dieselben Sätze, die in einer WhatsApp-Gruppe unter die Haushaltsausnahme fielen, sind
hier auskunftspflichtige personenbezogene Daten.

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `application_id` | `uuid` | ⚙️ | |
| `appointment_id` | `uuid?` | ⚙️ | wenn die Notiz zu einem konkreten Termin gehört |
| `author_profile_id` | `uuid` | ⚫ | |
| `author_account_id` | `uuid` | ⚙️ | Ereignis speichert Account **und** handelndes Profil |
| `prompt_key` | `text?` | ⚙️ | bei strukturierten Notiz-Prompts, z. B. `fit_shared_spaces`, `open_questions` |
| `body` | `text` | ⚫ | Freitext. UI zeigt dauerhaft den Hinweis **„schreib so, als könnte die Person es lesen"** |
| `created_at` · `updated_at` | `timestamptz` | ⚙️ | |
| `retention_until` | `date` | ⚙️ | 180 Tage nach Rundenabschluss |
| `deleted_at` | `timestamptz?` | ⚙️ | |

### 2.4 Kontext `scheduling`

#### `AvailabilityWindow` — ein Zeitfenster

**Eine** Entität für Bewohnende und Bewerbende, weil das Kostenmodell beide gleich behandelt.
Kanalneutral (P-1): Rasterklick, Freitext-Parser, Token-Link und manuelle Eingabe erzeugen
denselben Datensatz.

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `household_id` · `round_id` | `uuid` · `uuid?` | ⚙️ | |
| `subject_kind` | `enum(resident, applicant)` | ⚙️ | |
| `resident_profile_id` | `uuid?` | 🟠 | gesetzt bei `subject_kind = resident` |
| `application_id` | `uuid?` | 🔴 | gesetzt bei `subject_kind = applicant` |
| `polarity` | `enum(can, cannot)` | ⚙️ | „kann" und „kann nicht" sind **beide** explizit — ein fehlendes Fenster heißt „unbekannt", nicht „kann nicht" |
| `starts_at` · `ends_at` | `timestamptz` | ⚙️ | |
| `source` | `enum(grid, text_parse, token_link, manual)` | ⚙️ | |
| `raw_input` | `text?` | 🔴 | der Freitext, aus dem geparst wurde („Di 16–19", „dienstags ab 16", „nur abends") — bleibt erhalten, damit ein Fehlparse nachvollziehbar ist |
| `confirmed_by_profile_id` | `uuid?` | ⚙️ | **Parser-Vorschläge sind immer bestätigungspflichtig, nie stillschweigend** (P-3) |
| `created_at` | `timestamptz` | ⚙️ | |

> **Der Token-Link ist bewusst minimal.** Eine Seite, ein Zeitraster, kein Konto, keine weiteren
> Daten, und er trägt den Art.-13-Hinweis. Er ist ein **Komfortpfad**, kein Voraussetzungspfad:
> jede Angabe muss auch von Hand einpflegbar sein (P-1). Bewerbende werden nie in die App gezwungen.

#### `AvailabilityToken` — der Zugang zur Bewerberseite

**Neu in V0.2** (Querprüfung). `AvailabilityWindow.source = token_link` verwies auf einen Token, den
das Modell nirgends geführt hat.

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `token_hash` | `text` | ⚙️ | **nur der Hash.** Der Klartext existiert genau einmal — im Link, den der Haushalt verschickt |
| `application_id` | `uuid` | 🔴 | der Token identifiziert eine bewerbende Person, ist also personenbeziehbar |
| `round_id` | `uuid` | ⚙️ | |
| `expires_at` | `timestamptz` | ⚙️ | **kurze Lebensdauer** — Vorschlag 14 Tage |
| `used_at` | `timestamptz?` | ⚙️ | erste Nutzung; der Token bleibt danach bis `expires_at` gültig, damit Korrekturen möglich sind |
| `created_by_profile_id` | `uuid?` | 🟠 | `null` = im Verwaltungskontext erzeugt |
| `revoked_at` | `timestamptz?` | ⚙️ | |

> **Das ist die zweite unauthentifizierte Fläche des Produkts** — die erste ist die Anmeldeseite. Sie
> ist gefährlicher, als sie aussieht, weil hinter dem Token ein personenbezogener Datensatz steht,
> ohne dass jemand ein Passwort eingibt. Drei Konsequenzen:
>
> 1. **Nicht erratbare Tokens** (kryptografisch zufällig, ausreichend lang) und nur der Hash in der
>    Datenbank. Ein Token ist ein Passwortäquivalent mit Ablaufdatum.
> 2. **Kurze Lebensdauer**, und `revoked_at`, damit ein falsch verschickter Link entwertet werden kann.
> 3. Die Seite dahinter zeigt **ausschließlich** das Zeitraster und den Art.-13-Hinweis — **keine**
>    Bewerbungsdaten, **keinen** Namen, **keine** anderen Bewerbenden, und selbstverständlich nichts
>    aus `deliberation`. Wer den Link abfängt, sieht ein leeres Raster.

> ⚠️ Offener Punkt (O-11) — **eine Inkonsistenz im Session-Brief, in der Querprüfung aufgelöst.**
> Der Entscheidungsteil des Briefs führt den Verfügbarkeits-Link als v1-Bestandteil („hybrid"), die
> Phasentabelle stellt ihn nach v1.1.
>
> **Auflösung, damit unter beiden Lesarten keine Migration nötig wird: `AvailabilityToken` wird in v1
> modelliert, die bewerberseitige Seite bleibt v1.1.** Das Modell kostet eine Tabelle, das Vorziehen
> der Seite kostet dann nur noch UI. Ob sie nach v1 vorgezogen wird, entscheidet der Nutzer.
>
> Bis dahin trägt die **vollwertige manuelle Eingabe** den Pfad allein — was ohnehin die Bedingung
> aus P-1 ist und nicht ein Rückfall.

#### `Slot` — ein Platz im Raster

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `round_id` | `uuid` | ⚙️ | |
| `starts_at` · `ends_at` | `timestamptz` | ⚙️ | |
| `capacity` | `int` | ⚙️ | `1`, außer parallele Castings sind erlaubt |
| `is_blocked` | `bool` | ⚙️ | manuell gesperrt |
| `origin` | `enum(grid, solver, manual)` | ⚙️ | |
| *`available_resident_count`* | *abgeleitet* | ⚙️ | Heatmap „4/7 können" — reine Aggregation über `AvailabilityWindow` |

#### `Appointment` — der Casting-Termin

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `round_id` · `application_id` · `slot_id` | `uuid` | ⚙️ | |
| `status` | `enum(proposed, confirmed, cancelled, completed, no_show)` | ⚙️ | **keine eigene Zustandsmaschine** — die Prozesswahrheit liegt in `Application.state`; siehe §3.4 |
| `location` | `text?` | ⚙️ | |
| `expected_attendee_profile_ids` | `uuid[]` | 🟠 | wer teilnehmen wollte |
| `confirmed_by_profile_id` | `uuid?` | ⚙️ | moderierende Person bestätigt — **nie der Solver** |
| `solver_run_id` | `uuid?` | ⚙️ | Rückverweis auf den Lauf, aus dem der Vorschlag stammt |
| `explanation` | `jsonb?` | ⚙️ | verletzte Soft-Terme im Klartext, z. B. `[{term: "resident_coverage", detail: "5/7 können"}]` — Erklärbarkeit ist Pflicht (P-3, §8.4) |
| `created_at` · `cancelled_at` | `timestamptz` · `timestamptz?` | ⚙️ | |

> **O-7 — entschieden** (§10.2): `expected_attendee_profile_ids` als Array bleibt für die reine
> Teilnahme-*Absicht* stehen. Für Anwesenheit und Notizstatus gibt es jetzt die eigene
> Verknüpfungstabelle **`AppointmentAttendance`** (§2.2, bewusst im `casting`-Kontext, weil sie die
> CastingNote-Erinnerung speist, nicht die Terminverwaltung) — Feldtabelle und Begründung dort.

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

Speist **dieselbe CTA-Sortierung im Dashboard** wie `CastingRound.phase_deadline_at` (§2.2, S-44):
ein Account ohne aktive `PushSubscription` sieht den Install-Hinweis weiter oben einsortiert, aus
demselben Grund wie eine näher rückende Rundenfrist — beides sind zeitkritische Hinweise, die die
Sortierung, aber keine Berechtigung beeinflussen.

---

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

## 4. Bounded Contexts

Sechs Kontexte in **einem** Deployable (modularer Monolith, ADR-001). Die Grenzen sind keine
Netzwerkgrenzen, sondern Importgrenzen — durchgesetzt per Lint, nicht per Absprache.

| Kontext | Besitzt | Darf importieren aus | Darf **nicht** |
|---|---|---|---|
| `identity` | `Account`, `Household`, `HouseholdSettings`, `ResidentProfile`, `Membership` | — | nichts; `identity` ist die Wurzel und kennt kein Casting |
| `casting` | `Room`, `CastingRound`, `RoundParticipation`, `Application` | `identity` | `deliberation`, `scheduling`, `notifications` |
| `deliberation` | `Vote`, `Veto`, `CastingNote`, Ranking-Funktionen | `casting`, `identity` | `scheduling`, `notifications` |
| `scheduling` | `AvailabilityWindow`, `Slot`, `Appointment`, Solver-Port | `casting`, `identity` | **`deliberation`** — siehe Kasten |
| `audit` | `ActivityEvent` | — | alles; `audit` **empfängt** nur |
| `notifications` | `Notification` | `audit`, plus veröffentlichte Query-Ports aller Kontexte | direkter Tabellenzugriff auf `deliberation` oder `casting` |

```text
                     ┌──────────┐
                     │ identity │  ◀── Wurzel, kennt niemanden
                     └────▲─────┘
                          │
                     ┌────┴─────┐
                     │ casting  │
                     └──▲────▲──┘
                        │    │
          ┌─────────────┘    └─────────────┐
   ┌──────┴───────┐                 ┌──────┴──────┐
   │ deliberation │   ✗ keine Kante │ scheduling  │
   └──────┬───────┘  ◀────────────▶ └──────┬──────┘
          │  Domain-Events                 │
          └──────────────┬─────────────────┘
                         ▼
                    ┌─────────┐         ┌───────────────┐
                    │  audit  │ ──────▶ │ notifications │
                    └─────────┘         └───────────────┘
```

**Zwei harte Regeln:**

1. **Keine Cross-Context-Joins.** Ein SQL-Statement fasst nie Tabellen zweier Kontexte an. Lesen
   über die Grenze geht über einen **Query-Port**, der ein DTO liefert — kein ORM-Objekt, keine
   Relation. Der Preis ist ein zweiter Roundtrip; der Gegenwert ist, dass eine Kontextgrenze
   nachträglich zu einer Prozessgrenze werden kann, ohne dass die Fachlogik es merkt.
2. **`audit` und `notifications` schreiben nie in Fachtabellen.** Sie sind Senken.

> **Warum `scheduling` nicht in `deliberation` schauen darf — die interessanteste Kante des Modells.**
>
> Die Versuchung ist groß: „lade die bestbewerteten Bewerbenden zuerst ein", „gib der
> höchstgerankten Person den bequemsten Slot". Technisch trivial, fachlich ein Bruch.
>
> Erstens ist es eine **Sichtbarkeitslücke**: der Terminvorschlag würde die Rangfolge implizit
> preisgeben — auch gegenüber Personen, die noch nicht abgestimmt haben (V-4) oder für die V-1
> greift. Zweitens verletzt es **P-3**: ein Terminvorschlag, der sich aus einer Bewertung ableitet,
> ist nicht mehr aus dem Kalender erklärbar. Drittens ist es genau die Sorte Kopplung, die man in
> zwei Jahren nicht mehr rückbaut.
>
> Der Solver kennt deshalb ausschließlich Zeitfenster, Slots und Haushalts-Präferenzen. Rangfolge
> ist **kein** Eingabewert.
>
> ⚠️ Offener Punkt (O-8) — falls das später doch gewollt ist, gehört es als **explizite, abschaltbare
> Haushaltseinstellung** ins Modell und in den Compliance-Anhang, nicht als stille Solver-Gewichtung.

**Eine dokumentierte Ausnahme:** Die RLS-Policies in §5.5 referenzieren notwendigerweise Tabellen
mehrerer Kontexte (eine Policy auf `votes` muss `applications` und `memberships` lesen). Das ist
kein Bruch von Regel 1, weil Policies in Migrationen leben und nicht im Anwendungscode — aber es ist
eine echte Kopplung, die bei einer späteren Kontextaufspaltung zuerst wehtut. Der Lint-Check
schließt das Migrationsverzeichnis deshalb bewusst aus, und dieser Satz ist der Grund, damit
niemand ihn später für einen Fehler hält.

---

## 5. Sichtbarkeitsregeln als Prädikate

Der schwierigste Teil und das Herz des Produkts. Vier Regeln, **V-1** bis **V-4**. Ihre Nummerierung
ist Kontrakt (Verweise aus `03-PRD.md` und `GUARDRAILS.md`).

Alle vier sind absichtlich so formuliert, dass sie **zweimal** implementiert werden können — einmal
als pure Funktion im Domänenkern (Unit-Test) und einmal als Postgres-RLS-Policy (ADR-004). Wenn
eine Formulierung nur auf einer der beiden Seiten funktioniert, ist die Formulierung falsch, nicht
die Regel.

Sitzungskontext, den beide Seiten kennen:

```text
Session = {
  account_id   : uuid          // immer gesetzt
  profile_id   : uuid | null   // null = im Verwaltungskontext gehandelt
  household_id : uuid          // aktiver Haushalt
}
```

### 5.1 V-1 — Selbst-Redaktion (dauerhaft, unabhängig vom Rundenstatus)

> **Niemand darf Beratungsinhalte über sich selbst lesen — dauerhaft, unabhängig vom Rundenstatus.**

```text
// Alle Profile, die zum handelnden Account gehören. NICHT nur das aktive Profil —
// sonst ist der Profilwechsel der Umweg um die Invariante (siehe Klarstellung in §2.1).
redaction_subjects(session) :=
    { m.resident_profile_id
      | m ∈ Membership,
        m.account_id = session.account_id,
        m.resident_profile_id ≠ null }

is_self_subject(session, application) :=
    application.became_resident_id ≠ null
    ∧ application.became_resident_id ∈ redaction_subjects(session)

// Die Regel selbst:
can_read_deliberation(session, artifact) :=
    ¬ is_self_subject(session, application_of(artifact))
```

**Was `artifact` umfasst — vollständig, weil Lückenhaftigkeit hier das Risiko ist:**

| Artefakt | Wirkung von V-1 |
|---|---|
| `Vote` | einzelne Stimmen unsichtbar |
| `Veto` inklusive `reason` | unsichtbar |
| `CastingNote` | unsichtbar |
| `Application.decision_note`, `Application.rejection_reason` | unsichtbar |
| **Aggregate** — `score`, Stimmungsbild-Balken, Stimmenzahl, „3 von 7 haben abgestimmt" | unsichtbar. Ein Aggregat über zwei Stimmen ist keine Anonymisierung |
| **Ranglistenposition** | unsichtbar — und zwar so, dass die **Zeile ganz fehlt**, nicht mit verdecktem Wert dargestellt wird. Eine Lücke zwischen Platz 2 und Platz 4 ist eine Information |
| `ActivityEvent` mit Beratungsbezug | aus dem Feed gefiltert |
| `Notification` | wird mit `suppressed_reason = self_redaction` unterdrückt, nicht zugestellt |

**Was die Person stattdessen sieht:** ihre eigene Karte mit dem **Sachprofil** (Name, Alter,
Kontakt, eingereichter Text, Zimmer, Einzugsdatum) und einem **ehrlichen Hinweis** in der Art
„Beratungsinhalte zu deiner eigenen Bewerbung sind für dich dauerhaft ausgeblendet." Kein leerer
Kasten, keine Notlüge über nicht vorhandene Daten — die Person weiß, dass abgestimmt wurde.

**Warum genau diese Formulierung und keine der naheliegenden Alternativen:**

| Verworfene Variante | Warum sie leckt |
|---|---|
| „Abgeschlossene Bewerbungen sind für neue Mitglieder unsichtbar, offene sichtbar" (ursprüngliche Annahme) | Leckt bei **wiedereröffneten Runden** (`closed → open`) und bei **Wiederbewerbungen**. Der Status ist außerdem an fünf Stellen abfragbar und an vier davon vergessbar |
| Prüfung nur gegen `session.profile_id` | Leckt über den **Profilwechsel** in den Verwaltungskontext |
| Filterung in der Anwendungsschicht ohne DB-Fence | Leckt bei jedem vergessenen `WHERE` — der wahrscheinlichste AI-Fehlermodus (ADR-004) |
| Nur einzelne Stimmen verbergen, Aggregate zeigen | Leckt bei kleinen Gremien fast vollständig: bei fünf Stimmen ist der Mittelwert nahezu invertierbar |

**Das gibt man auf, wenn** ein Haushalt ausdrücklich Transparenz will („wir zeigen jeder Person
hinterher, wie über sie abgestimmt wurde"). Dann wäre V-1 eine Voreinstellung statt einer
Invariante — und das Produkt ein anderes. Die Session hat sich bewusst für die Invariante
entschieden: das Versprechen „du siehst nie, wie über dich geredet wurde" ist nur belastbar, wenn
es nicht abschaltbar ist.

### 5.2 V-2 — Rundensichtbarkeit

```text
can_see_round(session, round) :=
    round.household_id = session.household_id
  ∧ (
      // Bewohnerkontext: nur eigene Runden
      ( session.profile_id ≠ null
        ∧ ∃ p ∈ RoundParticipation :
              p.round_id = round.id
            ∧ p.resident_profile_id = session.profile_id
            ∧ p.removed_at = null
            ∧ profile(p).status = 'active' )
      ∨
      // Verwaltungskontext: sieht alle Runden des Haushalts, darf aber nicht abstimmen
      ( session.profile_id = null
        ∧ ∃ m ∈ Membership :
              m.account_id = session.account_id
            ∧ m.household_id = round.household_id
            ∧ m.role = 'household_admin'
            ∧ m.revoked_at = null )
    )
```

Und daraus abgeleitet die Stimmberechtigung, die getrennt bleibt:

```text
can_vote(session, round, stage) :=
    can_see_round(session, round)
  ∧ session.profile_id ≠ null
  ∧ ∃ p ∈ RoundParticipation : p.round_id = round.id
        ∧ p.resident_profile_id = session.profile_id
        ∧ p.removed_at = null ∧ p.can_vote = true
  ∧ round.status = 'open'
  ∧ stage_open(round, stage)
```

**Der Verwaltungskontext sieht Beratungsinhalte** — er muss, um moderieren zu können. Er stimmt
aber nicht ab (`Membership.is_resident = false`), und V-1 greift auch für ihn über
`redaction_subjects`. Das ist konsistent mit der Klarstellung in §2.1: die Trennung ist Klarheit,
keine Härtung.

**Neu eintretende Profile** werden per `RoundParticipation` mit `source = added_manually`
hinzugefügt und sehen die Runde **inklusive Historie zu anderen Kandidaten**. Das ist gewollt: ohne
Kontext ist keine sinnvolle Mitentscheidung möglich. Der heikle Teil — Beratung über die Person
selbst — ist durch V-1 abgedeckt und nicht durch einen Zugriffsschnitt.

**Für bereits abgeschlossene Runden gilt dasselbe, hier ausdrücklich als Feature benannt:** eine
neu eingetretene Person bekommt vor ihrem eigenen `RoundParticipation`-Eintritt **keine automatische
Sichtbarkeit** auf **abgeschlossene** Runden — `can_see_round` fragt oben nie nach `round.status`,
sondern ausschließlich nach einem aktiven `RoundParticipation`-Eintrag. Das folgt bereits implizit
aus der Formel; wer die Vergangenheit einer geschlossenen Runde sehen soll, braucht weiterhin einen
expliziten `source = added_manually`-Eintrag, keine Nebenfolge des bloßen Beitritts zum Haushalt.

### 5.3 V-3 — Entzug bei `moved_out`, inklusive Quorum-Nenner

Zwei Dinge, die man leicht in einen Topf wirft und die getrennt gehören: **Zugriff** und
**Zählbarkeit**.

```text
// (a) Zugriff — sofort, auf alle Runden, ohne Übergangsfrist:
profile.status = 'moved_out'  ⟹  can_see_round(...) = false  für jede Runde
                              ⟹  can_vote(...)     = false
```

```text
// (b) Zählbarkeit — differenziert:

// Stimmen bleiben erhalten und werden als "ehemaliges Mitglied" gekennzeichnet.
// Sie werden NICHT gelöscht: eine abgeschlossene Entscheidung muss nachvollziehbar bleiben.
score_votes(application, stage) :=
    { v ∈ Vote | v.application_id = application.id
               ∧ v.stage = stage
               ∧ v.withdrawn_at = null }        // ehemalige Mitglieder eingeschlossen

// Das Quorum misst Beteiligung der HEUTE Stimmberechtigten — dort werden sie herausgerechnet:
quorum_denominator(round) :=
    if round.status = 'closed' ∨ round.status = 'archived'
       then round.quorum_denominator_frozen          // beim Schließen eingefroren
       else count( p ∈ RoundParticipation
                   | p.round_id = round.id
                   ∧ p.removed_at = null
                   ∧ p.can_vote  = true
                   ∧ profile(p).status = 'active' )  // moved_out fällt heraus

quorum_numerator(application, stage) :=
    count( v ∈ score_votes(application, stage)
           | profile(v).status = 'active'
           ∧ ∃ p ∈ RoundParticipation : p.resident_profile_id = v.resident_profile_id
                 ∧ p.round_id = round_of(application).id ∧ p.removed_at = null )
```

**Warum Nenner *und* Zähler angepasst werden und nicht nur der Nenner.** Rechnet man nur den Nenner
herunter, bleiben die Stimmen ausgezogener Personen im Zähler — und die Beteiligungsquote kann über
100 % steigen. Das ist nicht bloß hässlich: die Kernmetrik des Produkts ist die
**Beteiligungsquote**, und eine Metrik, die 114 % anzeigen kann, ist keine.

Die Stimme bleibt trotzdem **im Score** (`score_votes`), weil der Score die Meinung des Gremiums
zum Zeitpunkt der Beratung abbildet. Beides zugleich ist kein Widerspruch, sondern die Trennung von
*„was wurde geurteilt"* und *„wie viele der heute Zuständigen haben sich beteiligt"*.

**Beim Schließen einfrieren** verhindert den umgekehrten Effekt: zieht ein halbes Jahr später jemand
aus, dürfen sich die Quoten einer abgeschlossenen Runde nicht rückwirkend ändern.

> **Auszug während einer offenen Runde — entschieden** (vormals O-2, Querprüfung V0.2):
> **die Stimme bleibt im Score, die Person fällt aus Zähler und Nenner.** Genau die Rechnung oben.
>
> Die Gegenposition — Stimme in offenen Runden ebenfalls herausrechnen, weil die Person die
> Entscheidung nicht mehr mitträgt — wurde aus drei Gründen verworfen:
>
> 1. **Die Stimme wurde gültig abgegeben**, als die Person bewohnend war. Sie rückwirkend zu entfernen
>    ändert eine Entscheidungsgrundlage, die andere bereits **gesehen und in ihre eigene Stimme
>    eingerechnet** haben.
> 2. **Die Rangliste würde ohne sichtbaren Anlass springen** — ein Auszug ist für die übrigen
>    Abstimmenden kein Ereignis der Bewerbung. Eine Rangfolge, die sich ohne erkennbaren Grund
>    umsortiert, verletzt **P-3** unmittelbar.
> 3. Praktisch kann das Entfernen von Stimmen Kandidaten **unter das Quorum drücken** und sie sichtbar
>    aus der Rangliste reißen — für die Betroffenen ein Rückschritt ohne Ursache.
>
> **UI-Anforderung daraus:** die Einzelansicht markiert „1 Stimme von einem ehemaligen Mitglied".
> Sichtbarkeit statt Korrektur — dieselbe Logik wie beim Veto (absenken, nicht löschen).

### 5.4 V-4 — Ergebnisse verdeckt bis zur eigenen Stimmabgabe

```text
can_see_results(session, application, stage) :=
    can_see_round(session, round_of(application))
  ∧ ¬ is_self_subject(session, application)                 // V-1 hat Vorrang
  ∧ (
      ¬ settings_of(round).hide_results_until_voted          // Einstellung aus
      ∨ ¬ can_vote(session, round_of(application), stage)    // wer nicht stimmen darf, wartet nicht
      ∨ ∃ v ∈ Vote : v.application_id = application.id
            ∧ v.stage = stage
            ∧ v.resident_profile_id = session.profile_id
            ∧ v.withdrawn_at = null
    )
```

Drei Details, die leicht falsch laufen:

1. **Der Ausschluss für Nicht-Stimmberechtigte ist notwendig, nicht kulant.** Ohne ihn würde der
   Haushalts-Account (der nicht abstimmen kann) die Ergebnisse **nie** sehen — und könnte nicht
   moderieren. Dasselbe gilt für ehemalige Mitglieder in abgeschlossenen Runden, sofern sie
   überhaupt noch Zugriff hätten (haben sie nach V-3 nicht).
2. **`stage`-Granularität.** Wer in Runde 1 abgestimmt hat, hat damit **nicht** die Ergebnisse von
   Runde 2 freigeschaltet. Die Prüfung läuft pro `stage`, nicht pro Bewerbung.
3. **Zurückziehen der eigenen Stimme verdeckt die Ergebnisse wieder** (`withdrawn_at = null` in der
   Bedingung). Sonst wäre „abstimmen, gucken, zurückziehen, neu abstimmen" der Umweg — und genau
   den soll die Regel verhindern.

Der Doppelnutzen ist beabsichtigt: die Regel schützt vor Anker- und Bandwagon-Effekten **und** ist
der stärkste eingebaute Beteiligungsanreiz, den das Produkt hat (Kernmetrik Beteiligungsquote).

### 5.5 Dieselben vier Regeln als RLS-Policies

Skizze, kein fertiges Migrationsskript. Sie zeigt, dass die Prädikate DB-seitig ausdrückbar sind —
das ist die Bedingung, unter der ADR-004 überhaupt trägt.

```sql
-- Sitzungskontext, von der Anwendung pro Request gesetzt.
-- SET LOCAL, damit er die Verbindung nicht überlebt (Connection Pooling!).
-- SET LOCAL app.account_id   = '…';
-- SET LOCAL app.profile_id   = '…';   -- leer im Verwaltungskontext
-- SET LOCAL app.household_id = '…';

CREATE FUNCTION app_account_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.account_id', true), '')::uuid $$;

CREATE FUNCTION app_profile_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.profile_id', true), '')::uuid $$;

-- V-1: alle Profile des handelnden Accounts (nicht nur das aktive).
CREATE FUNCTION app_redaction_subjects() RETURNS setof uuid LANGUAGE sql STABLE AS $$
  SELECT m.resident_profile_id
  FROM memberships m
  WHERE m.account_id = app_account_id()
    AND m.resident_profile_id IS NOT NULL
$$;

-- V-1 auf Stimmen. Analog für vetoes, casting_notes und jede Aggregat-View.
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes FORCE ROW LEVEL SECURITY;      -- gilt auch für den Tabelleneigentümer

CREATE POLICY votes_self_redaction ON votes FOR SELECT USING (
  NOT EXISTS (
    SELECT 1 FROM applications a
    WHERE a.id = votes.application_id
      AND a.became_resident_id IS NOT NULL
      AND a.became_resident_id IN (SELECT app_redaction_subjects())
  )
);

-- V-2 auf Stimmen: nur Runden, in denen das aktive Profil Teilnehmer ist.
CREATE POLICY votes_round_participation ON votes FOR SELECT USING (
  app_profile_id() IS NULL                       -- Verwaltungskontext: V-2 greift oben
  OR EXISTS (
    SELECT 1 FROM round_participations p
    JOIN resident_profiles rp ON rp.id = p.resident_profile_id
    WHERE p.round_id = votes.round_id
      AND p.resident_profile_id = app_profile_id()
      AND p.removed_at IS NULL
      AND rp.status = 'active'                   -- V-3: sofortiger Entzug bei moved_out
  )
);

-- V-4 gehört NICHT in eine RLS-Policy auf votes:
-- "Ergebnis verdeckt" heißt "Aggregat verbergen", nicht "Zeilen verbergen" —
-- die Stimmen müssen serverseitig weiter zählbar bleiben, sonst rechnet der Score falsch.
-- V-4 lebt daher in der Policy-Schicht und in der Aggregat-View, nicht in der Zeilen-Policy.
```

> **Der letzte Kommentar ist die wichtigste Zeile dieses Abschnitts.** „Zweifach erzwungen"
> (ADR-004) heißt nicht „identisch zweimal". V-1, V-2 und V-3 sind **Zeilenregeln** und gehören in
> RLS. V-4 ist eine **Aggregatregel** und gehört es nicht — eine RLS-Policy, die dem Aufrufer
> Stimmen versteckt, würde ihm auch den Mittelwert verfälschen. Wer das verwechselt, baut einen
> Score, der je nach Betrachtenden anders ausfällt: der schlimmstmögliche Fehler in einem Produkt,
> dessen Versprechen Legitimität ist.

**Vier Regeln, vier geschützte Testgruppen** (Vormerkung für `GUARDRAILS.md` — diese Tests dürfen
nicht gelöscht oder abgeschwächt werden):

| Regel | Muss-Test |
|---|---|
| V-1 | Eingezogene Person sieht **keine** Stimme, kein Veto, keine Notiz, **kein Aggregat** und **keine Ranglistenzeile** zu ihrer eigenen Bewerbung — auch nicht im Verwaltungskontext desselben Accounts, auch nicht in einer wiedereröffneten Runde |
| V-2 | Profil ohne `RoundParticipation` sieht die Runde nicht; nachträglich hinzugefügtes Profil sieht sie inklusive Historie **anderer** Kandidaten |
| V-3 | `moved_out` entzieht sofort; Stimme bleibt im Score, fällt aus Zähler und Nenner; abgeschlossene Runde ändert ihre Quote nicht mehr |
| V-4 | Ergebnisse unsichtbar vor eigener Stimme, sichtbar danach, **wieder unsichtbar nach Zurückziehen**, pro `stage` getrennt; nicht stimmberechtigte Rollen sind ausgenommen |

---

## 6. Reiner Domänenkern

Fünf Dinge sind **pure Funktionen ohne Datenbankzugriff** — Eingabe rein, Ergebnis raus, kein
`await`, kein Repository, keine Uhr:

| Baustein | Signatur (skizziert) | Warum pur |
|---|---|---|
| Zustandsübergänge | `transition(state, event, ctx) → state \| Error` | Die Übergangstabelle ist eine Datenstruktur. Sie zu testen darf keine Migration brauchen |
| Voting-Mathematik | `score(votes, weights) → 0…100` | Der Score ist das Legitimitätsversprechen (P-3). Er muss in einem Testfall mit sechs Zeilen nachrechenbar sein |
| Rangfolge | `rank(applications, votes, vetoes, settings) → Ranking` | Tie-Breaker sind nur überprüfbar, wenn man sie ohne Datenbank durchspielen kann |
| Termin-Kostenmodell | `cost(assignment, windows, prefs) → int` | Muss **unabhängig vom Solver** nachrechenbar sein — genau das ist die Erklärbarkeitsanforderung (§8.4) |
| Zeitfenster-Parser | `parse("Di 16–19", ref_date) → AvailabilityWindow[]` | Regelbasiert, kein Modell (P-5). Testbar als Tabelle aus Eingabe und Erwartung |

Die Uhr ist dabei ein Eingabewert, kein Seiteneffekt: jede Funktion, die „jetzt" braucht, bekommt
es übergeben. Sonst sind Fristenlogik und Terminvorschläge nicht reproduzierbar testbar.

> **Der Nutzen ist nicht Eleganz, sondern Angreifbarkeit.** Alle fünf Bausteine sind Stellen, an
> denen dieses Dokument bewusst Vorschläge macht, die falsch sein können. Als pure Funktionen kann
> man sie widerlegen, ohne die Anwendung zu starten — und ersetzen, ohne sie umzubauen.

---

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

## 8. Rechenmodelle als Pseudocode

Zwei Rechnungen entscheiden darüber, ob das Produkt als legitim empfunden wird: die **Rangfolge**
und der **Terminvorschlag**. Beide sind hier so notiert, dass man sie mit Papier nachrechnen kann —
das ist die Betriebsbedingung von **P-3**, nicht ein Dokumentationsluxus.

### 8.1 Score

```text
// Stufenwerte aus HouseholdSettings.scale_weights, in der UI offengelegt.
// Default, absichtlich nicht-linear:
WEIGHTS = { no: 0, rather_not: 1, good: 3, definitely: 5 }

function score(application, stage, round) -> int | NO_SCORE
    weights = round.settings_snapshot.scale_weights     // NICHT die aktuellen Settings
    votes   = score_votes(application, stage)           // §5.3 (b): ehemalige Mitglieder inklusive
    if |votes| = 0:
        return NO_SCORE                                 // kein Score, keine 0 — das ist nicht dasselbe
    mean = ( Σ_{v ∈ votes} weights[v.value] ) / |votes|
    return round_half_up( mean / max(weights.values) × 100 )   // 0…100
```

**Warum Mittelwert und nicht Summe.** Die Summe belohnt **Aufmerksamkeit**, nicht Zustimmung: eine
Bewerbung, die sieben Leute gesehen haben, schlägt eine, die vier Leute begeistert fanden — obwohl
die zweite besser bewertet ist. Der Mittelwert trennt beides. Die *Abdeckung* wird separat
ausgedrückt, durch das **Quorum** (§8.3), und ist damit sichtbar statt in den Score eingerechnet.

**Warum die Gewichte nicht-linear sind (0 · 1 · 3 · 5).** Die Entscheidungsgrenze liegt zwischen
„Eher nicht" und „Finde gut" — dort ist der größte Sprung (1 → 3). Zwischen „Nein" und „Eher nicht"
liegt praktisch keine Entscheidung, zwischen „Finde gut" und „Unbedingt" ein Grad. Eine lineare
Skala (0 · 1 · 2 · 3) würde behaupten, alle Übergänge seien gleich viel wert; das stimmt nicht.
Die Gewichte stehen deshalb **in der UI**, nicht in einer Konstantendatei (P-3).

**Warum keine z-Score-Normalisierung.** Es wäre statistisch besser: manche Menschen sind
begeisterungsfähiger als andere, und eine Normalisierung pro abstimmender Person würde das
ausgleichen. Verworfen, weil der Score dann nicht mehr aus den abgegebenen Stimmen ablesbar ist —
und ein Ranking, das niemand nachrechnen kann, wirkt nicht legitim, selbst wenn es fairer ist. **P-3
schlägt hier Genauigkeit.** Das Gegenmittel gegen unterschiedliche Begeisterungsfähigkeit ist
stattdessen das Favoriten-Budget (§8.2), das über **Knappheit** statt über Mathematik normalisiert.

**Darstellung**, weil sie Teil der Rechnung ist: Listenansicht zeigt den Score und ist sortierbar;
die Einzelansicht zeigt **keinen** Score allein, sondern einen gestapelten Balken über alle vier
Stufen. Ein Score von 60 aus „drei mal Unbedingt, drei mal Nein" ist etwas völlig anderes als 60 aus
„sechs mal Finde gut" — und die Einzelansicht ist der Ort, an dem dieser Unterschied entschieden
wird.

### 8.2 Favoriten-Budget und Feinschliff

```text
function favorite_budget(round) -> int
    open = count( r ∈ rooms(round) | r.status = 'open' )   // on_hold und not_available zählen nicht
    return ceil( open × settings.favorite_budget_factor )  // Default-Faktor 1.5

function needs_refinement(profile, round) -> bool
    settings.favorite_budget_enabled
    ∧ count( v ∈ Vote | v.stage = 'invite'
                      ∧ v.resident_profile_id = profile.id
                      ∧ v.value = 'definitely'
                      ∧ v.withdrawn_at = null )
      > favorite_budget(round)
```

Ablauf, und die Reihenfolge ist der eigentliche Entscheid:

```text
1. Screening läuft:  Stimmen frei und jederzeit revidierbar.
                     Budget wird NICHT angezeigt, NICHT erzwungen.
2. Nach der letzten Karte:
   if needs_refinement(profile, round):
        → Feinschliff-Screen: nur die eigenen 'definitely'-Kandidaten nebeneinander,
          jede Karte direkt herabstufbar. Budget sichtbar, weil überschritten.
   else:
        → nichts. Kein Screen, kein Hinweis.
3. Budget abgeschaltet (favorite_budget_enabled = false):
        → statt Feinschliff nur der Hinweis „deine Stimmen differenzieren wenig".
          Keine Sperre.
```

**Warum das Budget erst *nach* dem Screening greift.** Ein Budget während der Vergabe hemmt: man
kennt das Feld noch nicht und spart „Unbedingt" für später auf, das dann nie kommt. Die ersten
Bewerbungen werden dadurch systematisch schlechter bewertet als die letzten — ein Reihenfolgeeffekt,
den niemand bemerkt und der das ganze Ranking verzieht. Nachgelagert kennt man das Feld und
entscheidet vergleichend.

**Warum Knappheit besser normalisiert als eine Punkteskala.** Die ursprüngliche Idee war ein
Punkte-Budget (0–10 Punkte, insgesamt begrenzt). Das ist rechnerisch feiner, aber es zwingt jede
abstimmende Person, ihre Zustimmung als Zahl zu kalibrieren — und dabei gewinnt, wer taktisch
rechnet. „Unbedingt ist knapp" ist die gleiche Normalisierung ohne Taktik: es gibt nur eine
Entscheidung zu treffen, nämlich welche Kandidaten die knappen Plätze bekommen.

**Warum es ein eigenes Signal spart.** „Unbedingt" **ist** das Favoriten-Signal. Ohne die vierte
Stufe bräuchte man einen zweiten Screening-Durchlauf („und jetzt markiert eure Favoriten") — der in
der Praxis nicht stattfindet, weil die Beteiligung schon beim ersten Durchlauf bröckelt.

> **Das gibt man auf, wenn** sich zeigt, dass der Feinschliff-Screen als Bestrafung erlebt wird
> („ich habe zu viele gut gefunden und muss jetzt jemanden herabstufen"). Dann wird aus dem Screen
> eine reine Anzeige ohne Aufforderung. Die Punkte-Budget-Variante ist ohnehin für v1.1 als
> **Option** vorgesehen, nicht als Ersatz.

### 8.3 Rangfolge, Quorum und Veto

```text
function quorum_reached(application, stage, round) -> bool
    quorum_numerator(application, stage)                       // §5.3 (b)
      >= ceil( settings.quorum_share × quorum_denominator(round) )

function veto_penalty(application, stage) -> int
    // 1, sobald mindestens ein nicht zurückgezogenes Veto vorliegt. Kein Zählwert:
    // zwei Vetos sind nicht "doppelt so tief" — die Absenkung ist eine Kategorie, keine Menge.
    count( x ∈ Veto | x.application_id = application.id
                    ∧ x.stage = stage
                    ∧ x.withdrawn_at = null ) > 0  ?  1 : 0

function rank(applications, stage, round) -> { ranked, pending }
    pending = [ a ∈ applications | ¬ quorum_reached(a, stage, round) ]
    ranked  = [ a ∈ applications |   quorum_reached(a, stage, round) ]

    sort ranked by the tuple, ascending:
      ( veto_penalty(a, stage),                  // 1. Veto-Block nach unten
        − score(a, stage, round),                // 2. Score absteigend
        − count_value(a, stage, 'definitely'),   // 3. mehr "Unbedingt" gewinnt
          count_value(a, stage, 'no'),           // 4. weniger "Nein" gewinnt
        − |score_votes(a, stage)|,               // 5. breitere Stimmbasis gewinnt
          a.created_at,                          // 6. wer früher da war
          a.id )                                 // 7. rein technischer Determinismus-Anker

    sort pending by ( − quorum_numerator(a, stage), a.created_at, a.id )
    return { ranked, pending }
```

**Kandidaten unter Quorum erscheinen nicht in der Rangliste.** Sie stehen in einem eigenen Abschnitt
darunter — **„Warten auf Stimmen (3 von 7)"**. Grund: ein Score aus zwei Stimmen neben einem Score
aus sieben Stimmen in derselben Liste ist eine Falschaussage, egal wie man ihn beschriftet. Der
getrennte Abschnitt ist zugleich der konkreteste Beteiligungsanreiz im Produkt: er zeigt namentlich,
worauf gewartet wird.

**Jeder Tie-Breaker mit Begründung**, weil eine unbegründete Reihenfolge bei Gleichstand genau die
Willkür ist, die P-3 verhindern soll:

| # | Kriterium | Warum an dieser Stelle |
|---|---|---|
| 1 | Veto-Block | Veto senkt ab, **löscht nicht** — siehe unten |
| 2 | Score | die eigentliche Aussage |
| 3 | Anzahl `definitely` | bei gleichem Mittelwert gewinnt, wer **jemanden begeistert** hat — Konsens ohne Begeisterung ist der schwächere Kandidat für eine WG |
| 4 | Anzahl `no` | bei gleichem Score und gleicher Begeisterung gewinnt, wer **weniger Ablehnung** hat. Das ist die eine Stelle, an der die Asymmetrie „ein starkes Nein wiegt mehr" berücksichtigt wird — sie ist bewusst **nicht** in die Gewichte kodiert, dafür ist das Veto zuständig |
| 5 | Anzahl Stimmen | breitere Basis ist verlässlicher |
| 6 | `created_at` | wer sich früher bewarb, wurde länger hingehalten |
| 7 | `id` | damit die Sortierung total ist. Ohne dieses Kriterium wäre die Reihenfolge bei vollständigem Gleichstand von der Datenbank abhängig — und das Ranking damit nicht reproduzierbar |

**Wie das Veto absenkt.** Kandidaten mit Veto bilden einen eigenen Block **unterhalb** aller
Kandidaten ohne Veto, innerhalb des Blocks nach denselben Kriterien sortiert. Sie behalten ihren
sichtbaren Score und ihre Kennzeichnung.

| Verworfene Variante | Warum |
|---|---|
| Bewerbung bei Veto **löschen** oder ausblenden | Zerstört den Diskussionsraum. Der realistische Fall ist „sechs Leute sind überzeugt, eine Person hat ein Veto" — das ist ein Gespräch, kein Automatismus |
| Fester Score-Abzug (z. B. −30) | Die Zahl ist erfunden und nicht erklärbar. Außerdem kann ein Veto dann von genug Begeisterung **unsichtbar überstimmt** werden — die Person, die das Veto gesetzt hat, sieht es im Ranking nicht mehr wieder |
| Veto als weitere Skalenstufe („Nein!") | Vermischt zwei verschiedene Sprechakte: „ich finde die Person nicht gut" und „ich lege Einspruch ein". Der zweite verlangt Begründung, Budget und eine Phasengrenze — die Skala nicht |

> **`settings.quorum_share` = `0.5` — entschieden** (vormals O-3, Querprüfung V0.2), konfigurierbar.
>
> **Genauer Wortlaut:** `ceil(0.5 × n)` bedeutet **mindestens die Hälfte** der Stimmberechtigten, nicht
> *mehr als* die Hälfte — bei geradem `n` ist es genau die Hälfte (`ceil(0.5 × 8) = 4` von 8), bei
> ungeradem die aufgerundete (`ceil(0.5 × 7) = 4` von 7).
>
> Begründung gegen den naheliegenden höheren Wert (2/3, „damit die Reihenfolge trägt"): die Kernmetrik
> zielt auf > 80 % Beteiligung, aber eine Rangliste, die erst ab hoher Beteiligung überhaupt
> **erscheint**, ist in den ersten Tagen leer — und eine leere Rangliste demotiviert genau die
> Beteiligung, die sie voraussetzt. Das Quorum ist hier eine **Anzeigeschwelle**, keine
> Beschlussfähigkeitsgrenze; die eigentliche Entscheidung trifft ohnehin ein Mensch.
>
> **Das gibt man auf, wenn** Haushalte berichten, dass Ranglisten bei halber Beteiligung als
> irreführend erlebt werden. Der Wert ist einstellbar, also ist das eine Voreinstellungsfrage, keine
> Modelländerung.

### 8.4 Termin-Kostenmodell

Zwei Schichten, und die Trennung ist wichtiger als das Modell selbst:

| Schicht | Was sie tut | Braucht sie den Solver? |
|---|---|---|
| **Feasibility** | Graut pro Bewerbenden die nicht buchbaren Slots aus | **Nein** — reine Pro-Person-Prüfung gegen `AvailabilityWindow` |
| **Vorschlag** | Belegt mehrere Bewerbende gleichzeitig unter gekoppelten Bedingungen | Ja (ADR-005) |

Die Feasibility-Schicht wird ohnehin gebraucht — für das Raster, die Heatmap („4/7 können") und das
manuelle Legen von Terminen. Sie ist damit **kein** Solver-Vorprodukt, sondern ein eigenständiges
Feature, das auch dann funktioniert, wenn der Solver ausfällt.

```text
EINGABE
  A          = Bewerbungen im Zustand 'invited', die einen Termin brauchen
  S          = Slots (origin = 'grid', is_blocked = false), nach id sortiert
  can(x, s)  = x hat ein AvailabilityWindow mit polarity 'can',    das s abdeckt
  cannot(x,s)= x hat ein AvailabilityWindow mit polarity 'cannot', das s überlappt
  R          = Profile mit RoundParticipation (removed_at = null, status = 'active')
  P          = HouseholdSettings des Rundensnapshots

ENTSCHEIDUNGSVARIABLE
  x[a, s] ∈ {0, 1}      // Bewerbung a wird auf Slot s gelegt
```

**Harte Constraints** — ihre Verletzung macht die Lösung ungültig, nicht schlechter:

| # | Constraint | Formel |
|---|---|---|
| H1 | **Zeitfenster der bewerbenden Person** | `x[a,s] = 1 ⟹ can(a,s) ∧ ¬cannot(a,s)`. Umgesetzt als **Domänenbeschneidung**: unmögliche `x[a,s]` existieren nicht. Das ist exakt dieselbe Rechnung wie die Feasibility-Schicht |
| H2 | **Slot-Exklusivität** | für jeden Zeitpunkt `t`: `Σ x[a,s]` über alle `s ∋ t` `≤ (P.parallel_appointments_allowed ? P.max_parallel_appointments : 1)` |
| H3 | **max. N pro Tag** | für jeden Kalendertag `d`: `Σ_{a, s ∈ d} x[a,s] ≤ P.max_appointments_per_day` |
| H4 | **Mindestpuffer** | zwei gewählte, nicht parallele Termine am selben Tag haben `≥ P.min_buffer_minutes` Abstand. Modelliert als Nicht-Überlappung um `min_buffer_minutes` verlängerter Intervalle |
| H5 | **Tageszeit** | Slots außerhalb `[P.earliest_time_of_day, P.latest_time_of_day]` werden **vor** dem Modellaufbau entfernt |
| H6 | **Mindestbesetzung** | `x[a,s] = 1 ⟹ available_residents(s) ≥ P.min_residents_per_appointment`, mit `available_residents(s) = |{ r ∈ R : can(r,s) ∧ ¬cannot(r,s) }|` |
| H7 | **Pflichtteilnahme** | „Person X muss dabei sein": `x[a,s] = 1 ⟹ can(X,s) ∧ ¬cannot(X,s)` |
| H8 | **Höchstens ein Termin je Bewerbung** | `Σ_s x[a,s] ≤ 1` |

**Soft-Terme** — sie machen eine gültige Lösung besser oder schlechter. Alle Gewichte sind
**Ganzzahlen**; siehe §8.5.

```text
S1  Bewohner-Abdeckung    missing(s) = |R| − available_residents(s)
                          cost += W_COVERAGE × Σ x[a,s] × missing(s)

S2  Tages-/Zeitpräferenz  cost += W_DAYPREF × Σ x[a,s] × daypref_penalty(s)
                          // daypref_penalty aus expliziten Haushalts-Präferenzen,
                          // z. B. "Wochenende unerwünscht" = 1, sonst 0

S3  Bündelung             cost += W_BUNDLE_DAYS × |{ Tage mit ≥ 1 Termin }|
                          cost += W_BUNDLE_GAPS × (Leerlaufminuten zwischen Terminen desselben Tags / 15)
                          // "so viele Castings an einem Tag wie möglich" ist zwei Wünsche:
                          // wenige Tage UND wenig Wartezeit dazwischen. Getrennt gewichtet,
                          // weil sie sich widersprechen können.
```

**Zielfunktion in zwei Phasen** — nicht als eine gewichtete Summe:

```text
Phase 1:  maximize  Σ_{a,s} x[a,s]                      // so viele Bewerbende wie möglich
Phase 2:  fix       Σ_{a,s} x[a,s] = Ergebnis aus Phase 1
          minimize  W_COVERAGE·ΣS1 + W_DAYPREF·ΣS2 + W_BUNDLE·ΣS3
```

**Warum zwei Phasen und nicht ein Gewicht.** Presst man „Anzahl Termine" als Soft-Term mit großem
Gewicht in dieselbe Summe, muss dieses Gewicht größer sein als jede erreichbare Soft-Kosten-Summe —
und diese Grenze verschiebt sich mit der Anzahl Bewerbender und Slots. Irgendwann kippt es
unbemerkt: der Solver lässt eine Bewerbung unbesetzt, um Bündelung zu optimieren. Zwei Phasen machen
die Priorität zu einer Aussage („erst alle einladen, dann optimieren") statt zu einer Zahl, die
niemand nachprüft.

**Die beiden Erklärbarkeits-Ausgaben (P-3, Pflicht-Feature):**

```text
// (a) Verletzte Soft-Terme benennen — nachgerechnet, NICHT vom Solver erfragt.
function explain_solution(assignment, inputs) -> Explanation[]
    for each (a, s) with x[a,s] = 1:
        reasons = []
        if missing(s) > 0:
            reasons += "{available_residents(s)}/{|R|} können"          // → "Di 17:00 — 5/7 können"
        if daypref_penalty(s) > 0:
            reasons += "außerhalb der bevorzugten Zeiten"
        if gap_minutes_around(s) > 0:
            reasons += "{gap} Minuten Leerlauf davor"
        emit { application: a, slot: s, reasons }
```

Die Erklärung wird von der **puren Kostenfunktion** (§6) neu berechnet, nicht aus der Solver-Ausgabe
gelesen. Damit ist sie unabhängig davon, welcher Solver hinter dem Port steht — und sie gilt auch für
**manuell** gelegte Termine, für die es überhaupt keinen Solver-Lauf gibt.

```text
// (b) Bei Unlösbarkeit den blockierenden harten Constraint identifizieren.
// Fest dokumentierte Reihenfolge: von "unser eigener Wunsch" zu "nicht unsere Entscheidung".
RELAX_ORDER = [ H6, S3-als-hart, H4, H3, H2, H5, H7, H1 ]

function explain_infeasibility(model, inputs) -> Diagnosis
    for c in RELAX_ORDER:
        if solve(model without c) is feasible:
            return { blocking: c, witness: witness_for(c, inputs) }
    return { blocking: 'H1', witness: narrowest_applicant_window(inputs) }

// witness_for(H1) formuliert im Klartext:
//   "keine Lösung: Lea kann nur Di 16–19, dort können nur 2 von 7"
```

**Warum die Relaxationsreihenfolge fest und dokumentiert ist.** Wenn mehrere harte Bedingungen
zugleich blockieren, hängt die Antwort von der Reihenfolge ab. Eine wechselnde Reihenfolge würde für
dieselbe Eingabe verschiedene Erklärungen liefern — und eine Erklärung, die sich beim zweiten Klick
ändert, ist schlimmer als keine. `H1` steht am Ende, weil das Zeitfenster der bewerbenden Person das
einzige ist, das der Haushalt **nicht** verhandeln kann; wenn es das ist, muss man nachfragen, nicht
nachjustieren.

### 8.5 Determinismus

Fünf Bedingungen, alle notwendig, keine verhandelbar (Begründung in ADR-005):

| # | Bedingung | Warum |
|---|---|---|
| 1 | **Fester `random_seed`** | ohne ihn ist CP-SAT nicht reproduzierbar |
| 2 | **Genau ein Solver-Worker** (`num_search_workers = 1`) | CP-SAT ist multi-threaded **nicht** reproduzierbar: der Wettlauf der Worker entscheidet, welche gleichwertige Lösung gewinnt. Das kostet Rechenzeit und wird bezahlt |
| 3 | **Stabile Eingabereihenfolge** | Slots und Bewerbungen werden vor dem Modellaufbau nach `id` sortiert. Sonst variiert die Modellstruktur mit der Zeilenreihenfolge der Datenbank |
| 4 | **Nur ganzzahlige Gewichte** | Gleitkommagewichte erzeugen plattformabhängige Rundung und damit unterschiedliche Optima bei gleichwertigen Lösungen |
| 5 | **Kein Wanduhr-Limit als Abbruchkriterium** | ein Zeitlimit macht das Ergebnis von der Maschinenlast abhängig. Falls ein Limit nötig ist, ein **deterministisches**; und `solver_run_id` speichert Eingabe-Hash, Seed und Parameter, damit ein Lauf nachvollzogen werden kann |

> **Warum Determinismus hier ein Produktmerkmal ist und keine Vorliebe.** Zwei Klicks auf „Vorschlag
> berechnen" müssen denselben Vorschlag liefern. Sonst lernt der Haushalt, dass Nochmal-Drücken
> vielleicht ein besseres Ergebnis bringt — und aus einem erklärbaren Werkzeug wird ein Automat, dem
> man nicht glaubt. Das ist genau der Grund, warum genetische Verfahren ausgeschlossen sind (P-3,
> ADR-005).

---

## 9. Anhang — personenbezogene Felder (Querprüfungsliste)

**Zweck dieser Liste:** Sie ist die Übergabe an `06-Compliance-Anhang.md` und an
`data-inventory.yml` (ADR-010). **Jede Zeile hier braucht dort eine Zeile** mit Zweck,
Rechtsgrundlage, Datenkategorie und Löschfrist. Fehlt eine, bricht der CI-Check.

Sortiert nach Klasse, weil die Klasse den Aufwand bestimmt.

### 9.1 Klasse ⚫ — personenbezogen **und** Beratungsinhalt (10 Felder)

Strengste Klasse: unterliegt zusätzlich **V-1** und ist im Auskunftsexport enthalten.

| Entität | Feld | Betroffene Person | Bemerkung |
|---|---|---|---|
| `Application` | `decision_note` | Bewerbende | vorläufige Beschlüsse der WG |
| `Application` | `rejection_reason` | Bewerbende | |
| `Vote` | `resident_profile_id` | Abstimmende | *wer* gestimmt hat, ist Beratungsinhalt über beide Seiten |
| `Vote` | `value` | Bewerbende | die Bewertung selbst |
| `Veto` | `resident_profile_id` | Einlegende | auch bei anonymem Veto gespeichert; Anzeige verbirgt, Datenhaltung nicht |
| `Veto` | `reason` | Bewerbende | Freitext, häufig wertend |
| `CastingNote` | `author_profile_id` | Schreibende | Art. 15 Abs. 4 schützt die **Identität**, nicht den Inhalt |
| `CastingNote` | `body` | Bewerbende | **der rechtlich heikelste Inhalt des Produkts** |
| `ActivityEvent` | `payload` (Beratungsereignisse) | beide | Vorschlag: nur Referenzen, keine Werte — §2.5 |
| `Notification` | `payload` (Beratungsereignisse) | beide | dito |

### 9.2 Klasse 🔴 — personenbezogen, Bewerbende (14 Felder)

Dritte, die das Produkt nicht gewählt haben. **180-Tage-Frist, Löschautomatik, Auskunftsexport.**

| Entität | Feld | Bemerkung |
|---|---|---|
| `Application` | `applicant_name` | einziges Pflichtfeld |
| `Application` | `age` | |
| `Application` | `contact_email` | |
| `Application` | `contact_phone` | |
| `Application` | `contact_other` | Portal-Handle, Messenger-Name |
| `Application` | `message_raw` | **enthält unvermeidlich Art.-9-Kategorien** → keine KI-Bewertung (P-5) |
| `Application` | `attributes` (`jsonb`) | freie Zusatzangaben; **keine einladenden Strukturfelder** für Art. 9 |
| `Application` | `planned_move_in_on` | |
| `Application` | `subject_access_exported_at` | Nachweis der Unterstützungspflicht nach Art. 28 Abs. 3 lit. e |
| `Application` | `subject_statement` | Gegendarstellung der betroffenen Person (Art. 16). **Nicht ⚫**: eigene Aussage über sich selbst, unterliegt daher **nicht** V-1. **Frist geerbt, Löschung atomar** (V0.3) |
| `Room` | `promised_to_application_id` | Verknüpfung, personenbeziehbar |
| `AvailabilityWindow` | `application_id`, `raw_input` | `raw_input` ist der Originalfreitext („Di 16–19", „nur abends") |
| `AvailabilityToken` | `application_id` | **neu in V0.2** — der Token identifiziert eine bewerbende Person |

### 9.3 Klasse 🟠 — personenbezogen, Bewohnende und Accounts (28 Felder)

Nutzende mit eigenem Zugang. Betroffenenrechte gelten, aber **keine** automatische Löschfrist —
Nutzende löschen selbst.

| Entität | Feld | Bemerkung |
|---|---|---|
| `Account` | `email` | Login-Identität; beim Haushalts-Account bewusst eine **gemeinsam genutzte** Adresse |
| `Account` | `password_hash` | Argon2id |
| `Account` | `email_verified_at` | Voraussetzung für Versand |
| `Account` | `last_seen_at` | speist „was ist passiert, während ich weg war" |
| `Household` | `contact_email` | **neu in V0.3** — nach außen genannte Kontaktangabe für Art. 13 Abs. 1 lit. a. **Nicht** `Account.email`; **keine Postanschrift** (`06` §4.6) |
| `Household` | `privacy_notice_published_by_account_id` | **neu in V0.3** — wer die Datenschutzseite des Haushalts veröffentlicht hat. Die übrigen drei `privacy_notice_*`-Felder sind ⚙️ |
| `Session` | `token_hash`, `account_id`, `acting_profile_id`, `user_agent` | § 25 Abs. 2 Nr. 2 TDDDG einwilligungsfrei. `acting_profile_id` ist die technische Heimat des Profilwechsels (V0.2) |
| `PasskeyCredential` | `account_id`, `credential_id`, `public_key`, `label`, `created_at`, `last_used_at` | **neu in V0.2** — optionaler Aufsatz (ADR-007), löschbar ohne Zugangsverlust |
| `Membership` | `role`, `permissions` | **in V0.2 von ⚙️ auf 🟠 umklassifiziert** — „X ist Moderator" ist eine Information über eine identifizierte Person (Art. 4 Nr. 1). Keine automatische Frist, aber **auf Auskunftsverlangen offenzulegen** |
| `ResidentProfile` | `display_name` | Anzeigename im Feed |
| `ResidentProfile` | `moved_in_on`, `moved_out_on` | Wohnsituation; `moved_out_on` löst V-3 aus |
| `Application` | `became_resident_id` | **Verknüpfung Bewerbung ↔ Person.** Technisch ein Schlüssel, faktisch die Aussage „diese Person ist eingezogen" — und der Träger von V-1 |
| `Room` | `current_resident_profile_id` | wer aktuell darin wohnt |
| `AvailabilityWindow` | `resident_profile_id` | Verfügbarkeit ist ein Verhaltensdatum |
| `Appointment` | `expected_attendee_profile_ids` | wer teilnehmen wollte |
| `AvailabilityToken` | `created_by_profile_id` | **neu in V0.2**; `null` = im Verwaltungskontext erzeugt |
| `ActivityEvent` | `actor_account_id`, `actor_profile_id` | Handelnde; `null` = im Verwaltungskontext gehandelt |

**Summe: 52 Felder** (10 ⚫ · 14 🔴 · 28 🟠) in **16 der 20 Entitäten.**

Ohne Inventarzeile: `HouseholdSettings`, `CastingRound`, `RoundParticipation`, `Slot` — sie enthalten
Konfiguration, Zeitraster und Verknüpfungen, aber keine Aussage über eine Person. **`Household` ist in
V0.3 aus dieser Liste herausgefallen**, weil `contact_email` und
`privacy_notice_published_by_account_id` hinzugekommen sind.

> **Korrektur gegenüber V0.1:** dort stand „33 Felder in 11 der 17 Entitäten". Die Zahl war falsch
> gezählt — die richtige Summe für V0.1 wäre **35** gewesen (10 ⚫ · 12 🔴 · 13 🟠). Der Zuwachs auf
> 50 in V0.2 kam aus `Session`, `PasskeyCredential`, `AvailabilityToken`,
> `Application.subject_statement` und der Umklassifizierung von `Membership.role`/`.permissions`; die
> zwei weiteren in V0.3 aus `Household`. **Maßgeblich sind die Tabellen, nicht die Summe** — genau
> deshalb ist das Datenbestandsverzeichnis ein CI-Gate (ADR-010) und nicht eine Zahl in einem Dokument.
> Dass dieses Dokument seine eigene Summe zweimal nachziehen musste, ist das beste Argument dafür.

> **Die beiden Grenzfälle aus V0.1 sind entschieden** (Querprüfung mit `06-Compliance-Anhang.md`):
>
> 1. **`Membership.role` / `.permissions`: 🟠, nicht ⚙️** — **gegen** den Vorschlag von V0.1.
>    Art. 4 Nr. 1 DSGVO ist weit; „X ist Moderator" ist eine Information über eine identifizierte
>    Person. Inventarzeile ja, keine automatische Frist, auf Auskunftsverlangen offenzulegen. Es
>    kostet eine Zeile, und sie auszulassen wäre falsch gewesen.
> 2. **`Household.join_code`: ⚙️, TOM-Liste statt Art.-30-Verzeichnis** — Vorschlag von V0.1
>    angenommen. Der Code identifiziert einen Haushalt, keine Person. Dazu drei **Auflagen**
>    (rotierbar, niemals in einem Log inklusive Zugriffslog, niemals in einem Query-String) —
>    ausgeführt in §2.1 und als überprüfbare Regel an `GUARDRAILS.md` gemeldet.

---

## 10. Offene Punkte

Geschlossene Liste, damit die offenen Stellen beim Aufsetzen des Repos nicht einzeln gesucht werden
müssen. Die Nummerierung ist stabil: **entschiedene Punkte behalten ihre Nummer** und verschwinden
nicht, damit Querverweise aus den Nachbardokumenten weiter treffen.

### 10.1 In V0.2 entschieden (Querprüfung mit `06-Compliance-Anhang.md`)

| # | Punkt | Entscheidung | Fundstelle |
|---|---|---|---|
| O-2 | Stimmen einer Person, die **während einer offenen Runde** auszieht | **Stimme bleibt im Score, Person fällt aus Zähler und Nenner.** UI markiert „1 Stimme von einem ehemaligen Mitglied" | §5.3 |
| O-3 | Default für `settings.quorum_share` | **`0.5`** = mindestens die Hälfte der Stimmberechtigten, konfigurierbar. Quorum ist eine **Anzeigeschwelle**, keine Beschlussfähigkeitsgrenze | §8.3 |
| O-4 | Doppelte Statusführung `ResidentProfile` vs. `Membership` | **Beibehalten, ohne `residency_period`:** Wohn-Tatsachen am Profil, Zugang an der Membership. `residency_period` ist der **v2-Aufstiegspfad** für Aus- und Wiedereinzug | §2.1 |
| O-6 | Passkey-Credentials nicht modelliert | **`PasskeyCredential` modelliert.** Löschen des letzten Passkeys entzieht nie den Zugang (P-2) | §2.1 |
| O-9 | Klassifizierung `Membership.role`/`.permissions` und `Household.join_code` | **`role`/`permissions` → 🟠** (gegen den V0.1-Vorschlag). **`join_code` → ⚙️** plus drei Auflagen, TOM-Liste statt Art.-30-Verzeichnis | §2.1, §9.3 |

### 10.2 In diesem Update entschieden (CastingNote-Erinnerung, Einladungstoken, Push-Kanal)

| # | Punkt | Entscheidung | Fundstelle |
|---|---|---|---|
| O-7 | `Appointment.expected_attendee_profile_ids` als Array statt Verknüpfungstabelle | **Verknüpfungstabelle `AppointmentAttendance`** (`appointment_id`, `resident_profile_id`, `attended`, `note_written`) ergänzt, bewusst im `casting`-Kontext, weil sie die CastingNote-Erinnerung speist. `expected_attendee_profile_ids` bleibt für die reine Teilnahme-Absicht bestehen | §2.2 |

### 10.3 Weiter offen

**Sortiert nach Dringlichkeit** — O-1 sollte vor der ersten Migration adressiert sein, weil es das
Kernversprechen betrifft.

| # | Offener Punkt | Fundstelle | Warum jetzt |
|---|---|---|---|
| O-1 | **Frühere Bewerbungen derselben Person werden nur manuell mit dem Profil verknüpft.** Wer die Zuordnung vergisst, erzeugt genau das Leck, das V-1 verhindern soll. Automatischer Personenabgleich bleibt **ausgeschlossen** | §2.2 | V-1 ist das Kernversprechen. Die Lücke ist prozessual, nicht technisch: sie braucht eine **verpflichtende UI-Aktion** im PRD („diese frühere Bewerbung derselben Person zuordnen"), einen Risikoposten in `06` und eine **benannte Grenze** des geschützten Tests in `GUARDRAILS.md` |
| O-5 | **Redaktionsregel für `ActivityEvent.payload`** am Fristende — Struktur bleibt, 🔴/⚫-Inhalte werden `null` | §2.5, ADR-003 | Maßgebliche Fassung; `06` §5.6 richtet sich danach. Braucht in `GUARDRAILS.md` noch die prüfbare Zusicherung **„kein Freitext in `ActivityEvent.payload`"** — dort bisher keine Referenz auf ADR-003 |
| O-8 | **Rangfolge als Solver-Eingabe** ist bewusst ausgeschlossen; falls später gewollt, als abschaltbare Einstellung modellieren, nicht als stille Gewichtung | §4 | Nur als Warnschild — jetzt nichts zu tun |
| O-10 | **`Application.subject_statement`: Einreichungsweg nicht entschieden.** Modell in v1, UI in v1.1 — aber die bewerbende Person hat kein Konto (P-1) | §2.2 | Betrifft nur die UI, nicht das Schema. Kandidaten: Token-Link analog `AvailabilityToken`, oder Eintragung durch den Haushalt auf Zuruf |
| O-11 | **Verfügbarkeits-Link: v1 oder v1.1?** Der Session-Brief ist in sich widersprüchlich (Entscheidungsteil v1, Phasentabelle v1.1). Auflösung: **`AvailabilityToken` in v1 modelliert, bewerberseitige Seite v1.1** | §2.4 | Unter dieser Auflösung ist unter beiden Lesarten **keine Migration** nötig. Ob die Seite nach v1 vorgezogen wird, entscheidet der Nutzer |

---

## 11. Verweise

| Ziel | Wofür |
|---|---|
| `00-Session-Brief.md` | verbindliches Entscheidungsprotokoll; alles hier ist daraus abgeleitet |
| `02-SRD.md` | Scope, Metriken, Risiken, Aufwand — lösungsneutral |
| `03-PRD.md` | Nutzerflüsse und Akzeptanzkriterien, insbesondere zur Sichtbarkeitsinvariante |
| `05-ADRs.md` | ADR-001 bis ADR-012 — die Architekturentscheidungen hinter diesem Modell |
| `06-Compliance-Anhang.md` | Rechtsanalyse und Art.-30-Verzeichnis zu §9 |
| `GUARDRAILS.md` | geschützte Tests zu V-1 bis V-4, I-1 bis I-10 und zum Solver-Determinismus |

---

> **Zum Schluss noch einmal der Rahmen:** Dieses Dokument ist ein **Vorschlag**. Es ist ausführlich,
> weil ein ausführlicher Vorschlag angreifbar ist und ein knapper nur autoritativ wirkt. Die
> nützlichste Reaktion darauf ist nicht Zustimmung, sondern eine Liste der Stellen, an denen die
> Begründung nicht trägt.
