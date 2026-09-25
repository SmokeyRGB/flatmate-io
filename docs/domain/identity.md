> **Quelle:** `../04-Domaenenmodell.md` §2.1 (Stand V0.4, eingefroren 2026-09-09)
> **Kontext:** `identity`
> **Schema-Autorität:** Diese Datei. Weicht ein Bezeichner anderswo ab, gilt der hier.
> **Abweichung von der Quelle:** Seit 2026-09-11 weicht diese Datei in der Sache von der
> eingefrorenen Fassung ab — **ADR-013** (eine feste Identität je Sitzung) und **ADR-006**
> (Supabase Auth). Die Sammeldatei beschreibt weiter den Wechsel innerhalb einer Sitzung und ein
> eigenes `password_hash`-Feld; beides gilt nicht mehr. Maßgeblich ist diese Datei.

### 2.1 Kontext `identity`

#### `Account` — der Zugang

Ein Login. **Nicht** identisch mit „Person" und nicht identisch mit „bewohnender Person": eine
Person kann mehrere Accounts führen, und der Haushalts-Account gehört keiner einzelnen Person.

**Ein Account bedient genau eine Identität** (ADR-013): entweder den Haushalt
(`Membership.is_resident = false`, stimmt nicht ab) oder ein Bewohner-Profil. Welche, entscheidet
sich bei der Anmeldung und gilt für die ganze Sitzung. Wer die Identität wechseln will, meldet sich
ab und neu an — es gibt keinen Wechsel innerhalb einer Sitzung.

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `email` | `text?` | 🟠 | **Pflicht beim Haushalts-Admin-Account** (der erste, bei der Registrierung angelegte Account, `Membership.is_resident = false`) — eindeutig, dort als **gemeinsam genutzte Adresse** empfohlen (Hinweis im Registrierungsformular), damit das Eigentum am Zugang beim Auszug nicht mitwandert. **Nullable bei Resident-Accounts** (`Membership.is_resident = true`, angelegt beim Beitritt per Code): nicht mehr Pflichtfeld im Beitrittsformular, nach dem Onboarding optional nachpflegbar — Voraussetzung dafür, dass `web_push` als bevorzugter Kanal tragfähig ist (§2.5). Nicht zu verwechseln mit `Household.contact_email` oben, das davon unberührt bleibt |
| `email_verified_at` | `timestamptz?` | 🟠 | Verifikation ist **nachgelagert** und blockiert die erste Abstimmung nicht — aber Voraussetzung für jeden Benachrichtigungsversand und für Mailinhalte mit Beratungsbezug. **Die alleinige Autorität für die Zustellung**, siehe Kasten „Anmeldung beim Anbieter" |
| `password_changed_at` | `timestamptz?` | ⚙️ | Zeitpunkt der letzten Passwortänderung, in der Uhr der Datenbank. Gesetzt bei jeder eigenen Passwortänderung und beim Einlösen eines Reset-Links (O-16, Kasten unten). Eine Anmeldung, deren Passwortprüfung **vor** diesem Zeitpunkt begann, legt keine `Session` mehr an — sonst überlebte eine mit dem alten Passwort begonnene Anmeldung den Reset, der alle Sitzungen beendet |
| `passkey_enabled` | `bool` | ⚙️ | optionaler Komfort-Aufsatz, jederzeit abschaltbar (ADR-007) |
| `locale` | `text` | ⚙️ | v1 nur `de` |
| `last_seen_at` | `timestamptz?` | 🟠 | speist „was ist passiert, während ich weg war" |
| `created_at` | `timestamptz` | ⚙️ | |
| `deleted_at` | `timestamptz?` | ⚙️ | Soft-Delete; harte Löschung über das Löschkonzept |

> **Anmeldung beim Anbieter — warum hier kein `password_hash` mehr steht (ADR-006).**
> Anmeldedaten liegen seit ADR-006 bei **Supabase Auth**: Passwort-Hash, Zurücksetzen,
> Ratenbegrenzung, Brute-Force-Schutz und die Ausgabe der Anmelde-Token. Das Feld `password_hash`
> entfällt damit aus diesem Modell — was man nicht speichert, kann man nicht verlieren. Der
> Sitzungs- und Profilkontext bleibt vollständig hier (`Session`, unten): ADR-004 wird davon nicht
> berührt.
>
> **Ein Resident-Account hat keine E-Mail, der Anbieter verlangt aber eine eindeutige Kennung.**
> Jeder Resident-Account wird deshalb intern auf eine **abgeleitete, nicht zustellbare Adresse**
> abgebildet. Drei Regeln, und jede trägt:
>
> 1. **Abgeleitet aus der Profil-`uuid`, nie aus dem `display_name`.** Der Anzeigename ist nur unter
>    Profilen eindeutig, die weder `moved_out` noch `removed` sind — nach einem Auszug oder einer
>    endgültigen Entfernung wird er wieder vergeben, und die Nutzertabelle des Anbieters kennt weder
>    `moved_out` noch `removed`. Eine aus dem Namen gebildete Adresse würde mit der des ausgezogenen
>    oder entfernten Profils kollidieren. Sie trüge außerdem einen Personennamen in die Tabelle eines
>    Auftragsverarbeiters, ohne dass das irgendetwas brächte.
> 2. **Diese Adresse gilt beim Anbieter als bestätigt und ist niemals zustellbar.** „Bestätigt" ist
>    dort eine technische Vorbedingung für den Anmeldeweg, keine Aussage über ein Postfach.
> 3. **`Account.email_verified_at` bleibt `null` und bleibt die alleinige Autorität für den
>    Benachrichtigungsversand.** Die beiden Kennzeichen laufen bewusst auseinander. Wer die
>    Zustellung an das Kennzeichen des Anbieters hängt, verschickt Mail an eine Adresse, die es
>    nicht gibt.
>
> Trägt eine Person später eine **echte** `email` nach, ersetzt sie beim Anbieter die abgeleitete
> Kennung — von da an meldet sich die Person auch mit dieser Adresse und ihrem Passwort an (O-12).
> `email_verified_at` bleibt davon unberührt die alleinige Autorität für den Benachrichtigungsversand
> (Regel 3 oben). Mit der hinterlegten Adresse greift die Selbst-Wiederherstellung (Kasten unten) —
> eine Rücksetz-Mail belegt den Besitz der Adresse im Moment ihrer Nutzung und setzt deshalb keine
> vorherige Bestätigung voraus; erst eine **bestätigte** Adresse schaltet den Passkey frei (§2.1,
> `PasskeyCredential`).

> **Womit meldet sich ein Resident-Account ohne E-Mail an — entschieden (O-D → O-12, §10.2).**
> `email` ist nullable, aber eine Anmeldekennung fehlte bis hierher. **`(Household, `display_name`) +
> Passwort.** Beim Anmeldeformular wird zuerst der Haushalt gewählt (typischerweise bereits durch das
> Gerät bekannt, siehe „angemeldet bleiben" bei `Session`), danach der eigene Anzeigename und das
> Passwort — kein zweites Feld, keine zweite Kennung.
>
> **Voraussetzung ist eine Eindeutigkeit, die es bisher nicht gab:** `ResidentProfile.display_name`
> muss innerhalb eines Haushalts unter den Profilen, die weder `moved_out` noch `removed` sind,
> eindeutig sein — sonst ist die Anmeldung nicht auflösbar. Bisher war `display_name` reine
> Feed-Beschriftung ohne Eindeutigkeitsanspruch; mit dieser Entscheidung wird daraus eine Invariante.
> Kollidiert ein neuer Beitritt mit einem bestehenden Namen, verlangt das Beitrittsformular eine
> Unterscheidung (z. B. „Lea" → „Lea K.") — dieselbe Lösung, die Messenger-Apps für denselben Fall
> verwenden.
>
> **Was das für den Haushalts-Account nicht ändert:** Er bleibt bei `email` + Passwort (Pflichtfeld,
> siehe oben) — die neue Anmeldekennung betrifft ausschließlich Resident-Accounts ohne `email`.
>
> **Trägt ein Resident-Account eine eigene `email` ein** — beim Beitritt angegeben oder nachträglich
> hinterlegt (Kasten oben) —, kann sich die Person zusätzlich mit dieser Adresse und ihrem Passwort
> anmelden. Die Anmeldung über `(Household, display_name) + Passwort` bleibt daneben immer möglich;
> das Passwort bleibt die universelle Methode (P-2).

> **Passwort-Reset ohne E-Mail — ein bewusster Tauschhandel, kein Versehen (O-16, §10.2; vormals
> Plan-O-A).** Ohne
> `email` gibt es **keine Wiederherstellung durch die Person selbst**. Auflösung: Die Verwaltung
> (`Membership.is_resident = false`, `manage_members`) kann für ein aktives `ResidentProfile` ohne
> `email` einen **einmal verwendbaren Link** ausstellen, über den die Person selbst ein neues
> Passwort setzt — und verschafft sich damit, solange der Link nicht eingelöst ist, Zugang zu
> diesem Profil, einschließlich seiner Stimmen. Das ist der Preis dafür, dass ein Beitritt ohne
> E-Mail überhaupt möglich ist **und** ein vergessenes Passwort nicht zum dauerhaften Verlust des
> Profils führt.
>
> **Nicht als Härtung darstellen** — dieselbe Regel wie beim Verwaltungskontext selbst (§2.1,
> Kasten „Klarstellung"): E-03 hält fest, dass die Trennung Verwaltung/Bewohner keine
> Sicherheitsgrenze ist, und ein Passwort-Reset-Recht der Verwaltung ändert daran nichts.
>
> **Die Lücke schließt sich selbst**, sobald eine Person eine eigene `email` hinterlegt: ab diesem
> Moment läuft die Wiederherstellung über diese Adresse, und die Verwaltung kann keinen Reset-Link
> mehr für dieses Profil ausstellen — ein bereits ausgestellter, noch nicht eingelöster Link wird
> damit ungültig. Das ist das eigentliche Argument dafür, die E-Mail später zu erfragen — nicht
> Benachrichtigungs-Komfort.
>
> **Solange die Lücke besteht, bleibt sie sichtbar:** jedes Einlösen eines Reset-Links erzeugt einen
> `ActivityEvent` im Feed aller Bewohnenden (`account.password_reset_by_admin`) und beendet **alle**
> aktiven `Session`s des betroffenen Profils (§2.1, `Session.revoked_at`) — keine stille
> Zugriffsübernahme.

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
| `acting_profile_id` | `uuid?` | 🟠 | **hier lebt die handelnde Identität** eines Requests: jede Policy-Prüfung liest dieses Feld, nie ein anderes. `null` = Sitzung eines Haushalts-Accounts, gesetzt = Sitzung eines Resident-Accounts. **Wird bei der Anmeldung gesetzt und danach nie wieder beschrieben** (ADR-013) |
| `remember_me` | `bool` | ⚙️ | Default `true` (K-9/S-03 — beim Erstbeitritt vorbelegt). Steuert nur die `expires_at`-Dauer, siehe unten |
| `expires_at` | `timestamptz` | ⚙️ | **`remember_me = false`:** kurze Sitzung (Vorschlag 12 h). **`remember_me = true`:** lange Sitzung (Vorschlag **90 Tage**, gleitend verlängert bei Aktivität) — Auflösung O-13, damit „auf diesem Gerät angemeldet bleiben" (§10 des Plans) ein Feld hat, nicht nur eine Checkbox in der UI |
| `user_agent` | `text?` | 🟠 | zur Wiedererkennung eigener Geräte in einer Sitzungsliste |
| `created_at` | `timestamptz` | ⚙️ | |
| `revoked_at` | `timestamptz?` | ⚙️ | **drei Auslöser, nicht einer:** „überall abmelden" nach einem Passwortwechsel (das gilt weiterhin) · Passwort-Reset durch die Verwaltung (§2.1, Kasten „Passwort-Reset") · `ResidentProfile.status` wechselt zu `moved_out` oder zu `removed` — eine ausgezogene oder entfernte Person behält sonst eine bereits lange Sitzung trotz V-3 |

> **`acting_profile_id` trägt die handelnde Identität — und ist seit ADR-013 innerhalb einer Sitzung
> unveränderlich.** Der Sitzungskontext aus §5 — `account_id` plus `profile_id` — wird aus dieser
> Zeile gefüllt und pro Request per `SET LOCAL` (oder gleichwertig `set_config(…, true)`) an
> Postgres übergeben (ADR-004). Das Feld wird bei
> der Anmeldung gesetzt und danach nie wieder beschrieben: `null` in der Sitzung eines
> Haushalts-Accounts, genau ein Profil in der Sitzung eines Resident-Accounts.
>
> **V-1 hängt trotzdem am `Account` und nicht an diesem Feld** — und seit ADR-013 ist das der
> wichtigere Satz, nicht der überflüssige. Die frühere Begründung („sonst wäre der Profilwechsel der
> Umweg") ist entfallen; die Verankerung bleibt aus zwei anderen Gründen:
>
> 1. **Sie ist vom Sitzungskontext unabhängig.** `redaction_subjects()` wird aus `account_id` und
>    `Membership` abgeleitet und liest `acting_profile_id` gar nicht. Eine Sitzung, deren Kontext
>    fehlt oder falsch gesetzt ist, hebelt V-1 damit **nicht** aus — die einzige der vier
>    Invarianten, für die das gilt. Genau das ist der Fehlerfall aus **G-C8**.
> 2. **Ein Account trägt über die Zeit mehr als ein Profil.** Auszug und Wiedereinzug erzeugen ein
>    `moved_out`-Profil neben einem aktuellen; die Beratung über die frühere Bewerbung bleibt
>    redigiert.
>
> Daraus folgt eine harte Regel für den Auth-Baustein: `acting_profile_id` darf **nur beim Anlegen
> der `Session`** gesetzt werden, und nur auf ein Profil, für das eine gültige `Membership`
> desselben Accounts existiert. Ein Schreibpfad auf dieses Feld nach der Anmeldung ist ein Fehler,
> kein Feature — er unterläuft ADR-013.
>
> **Und, weil die Verwechslung naheliegt (U-21): `acting_profile_id = null` verleiht nichts.** Eine
> frühere Formulierung dieses Plans las sich so, als würde `null` Verwaltungsrechte *verleihen* — das
> ist falsch und wurde korrigiert. `acting_profile_id = null` heißt ausschließlich „für diese Sitzung
> ist kein Bewohnerprofil aktiv". Sämtliche Rechte kommen aus `Membership.role`
> (`household_admin`/`moderator`/`member`) und `Membership.permissions`, nie aus dem Sitzungsfeld.
> Ein Konto mit `role = member` bekommt durch `acting_profile_id = null` nichts dazu — es verliert
> nur seine Stimmidentität.
>
> Seit ADR-013 entsteht `acting_profile_id = null` nur noch in der Sitzung eines Haushalts-Accounts.
> Die Regel bleibt trotzdem stehen: Sie macht eine Aussage über die **Quelle** der Rechte, nicht über
> den Account-Typ.
>
> Für `GUARDRAILS.md` als geschützter Test, kein Kommentar: **„Welche Abschnitte der
> Organisationsfläche ein Konto sieht, entscheidet ausschließlich `Membership.role`/`.permissions`.
> Ein Konto ohne `household_admin` sieht den Abschnitt ‚Haushalt' auch dann nicht, wenn
> `acting_profile_id` `null` ist."**

#### `PasskeyCredential` — der optionale Passkey

**Neu in V0.2** — löst den offenen Punkt O-6 auf. ADR-007 hängt daran: Passkey ist ein **optionaler
Aufsatz nach der Registrierung**, jederzeit abschaltbar, nie Voraussetzung (P-2).

> **Ein Passkey setzt eine hinterlegte und bestätigte `email` voraus (ADR-006).** Supabase Auth gibt
> eine Passkey-Anmeldung nur für Konten mit bestätigter E-Mail oder Telefonnummer aus; die
> abgeleitete Kennung eines Resident-Accounts ohne eigene Adresse erfüllt das nicht. **Beide bleiben
> optional, eines schaltet das andere frei** — und das passt zu dem Weg, den das Modell ohnehin
> vorzeichnet: Eine eigene `email` nachzutragen beendet die Reset-Vollmacht der Verwaltung (O-16,
> Kasten oben) **und** eröffnet den Passkey. Das ist ein Angebot, keine Hürde: Wer keine Adresse
> hinterlegt, meldet sich weiter mit `(Household, display_name) + Passwort` an — P-2 bleibt
> unberührt, weil das Passwort die universelle Methode bleibt.

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
| `entity_label` | `enum(wg, wohnprojekt, haus, objekt)` | ⚙️ | in v1 fest `wg`, später pro Objekt wählbar |
| `created_at` | `timestamptz` | ⚙️ | |
| `deleted_at` | `timestamptz?` | ⚙️ | |

> **Geändert 2026-09-21 (O-18 aufgelöst) — fünf Felder haben diese Tabelle verlassen.**
> `join_code`, `join_code_rotated_at`, `join_code_expires_at`, `join_code_max_uses` und
> `join_code_uses` standen bis dahin hier, weil ein Haushalt genau einen rotierenden Code trug.
> Ein Haushalt stellt seither **mehrere** Einladungslinks aus, jeder mit eigener Frist, eigener
> Grenze und eigenem Zähler — sie liegen an der neuen Entität **`JoinCodeIssuance`** weiter
> unten. *(Bei der Gelegenheit entfernt: `entity_label` stand seit V0.4 doppelt in dieser
> Tabelle.)*

> **Klarstellung, die im Modell sichtbar bleiben muss.** Jede bewohnende Person kann sich
> theoretisch im Haushalts-Account anmelden, wenn E-Mail und Passwort bekannt sind. Die Trennung
> zwischen Haushalts- und Resident-Account dient **ausschließlich der Klarheit** — nur Bewohnende
> stimmen ab, um Verwirrung zu vermeiden. Sie ist **keine Härtung** und darf in keinem Dokument als
> solche dargestellt werden. Seit ADR-013 kostet dieser Weg eine Abmeldung und eine zweite
> Anmeldung statt eines Menüeintrags: eine Hürde, keine Grenze.
>
> Konsequenz für §5.1, und sie ist nicht kosmetisch: die Selbst-Redaktion hängt am **Account** und
> nicht am Sitzungsfeld `acting_profile_id` — sie greift damit auch dann, wenn der Sitzungskontext
> unvollständig oder falsch gefüllt wurde (**G-C8**). Was sie **nicht** leistet, steht offen in
> ADR-013: Meldet sich dieselbe Person mit dem **zweiten** Account an — dem des Haushalts —, ist das
> ein anderer `account_id` und damit eine andere `redaction_subjects()`-Menge. Praktisch ändert das
> wenig, weil ein Haushalts-Account ohne eigenes `ResidentProfile` nach **S-50**/**U-20** ohnehin
> keinen Zugriff auf Runden, Bewerbungen, Notizen und Termine hat; die einzige Ausnahme ist der
> Datenauskunft-Export ohne Einsicht, und die bestand vorher genauso.

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

> **`JoinCodeIssuance.code`: fünf Auflagen, keine Empfehlungen** (drei entschieden in der
> Querprüfung, O-9 Grenzfall 2; zwei neu, S-49). Der Code identifiziert einen **Haushalt, keine
> Person** — deshalb ⚙️ und keine Zeile im Art.-30-Verzeichnis. Er gehört stattdessen in die
> **TOM-Liste**, denn wer ihn hat, kommt an Beratungsinhalte. Die Auflagen galten bis 2026-09-21
> dem einen `Household.join_code` und gelten seither unverändert **jedem einzelnen ausgestellten
> Link**. Daraus folgt:
>
> 1. **Entwertbar** durch die organisierende Person, jederzeit und je Link. Das Entwerten
>    **entwertet ausstehende Einladungen** — das ist der ganze Zweck. *(Geändert 2026-09-21: bis
>    dahin hieß dieser Punkt „Rotierbar", weil ein Haushalt nur einen Code trug und ein neuer
>    Wert den alten überschrieb. Mit `JoinCodeIssuance` ist das Entwerten eines Links von der
>    Ausstellung eines neuen unabhängig; wer alle aktiven Links löscht, erreicht genau das, was
>    Rotation früher erzwang. **G-A5** bleibt in der Sache unverändert.)*
> 2. **Niemals in einem Log**, auch nicht im Zugriffslog. Der Einladungslink trägt den Code im
>    **Pfad**, also braucht genau diese Route **Pfad-Redaktion** im Zugriffslog.
> 3. **Niemals in einem Query-String.**
> 4. **Ablauf** (`JoinCodeIssuance.expires_at`). **Neu und keine Zugabe:** Seit `Account.email` bei
>    Resident-Accounts nullable ist und die E-Mail-Pflicht im Beitrittsformular entfällt (S-03), gibt
>    es **keine zweite Zugangskontrolle** mehr — weder E-Mail-Verifikation noch ein zweiter Faktor.
>    Der Code trägt die gesamte Absicherung allein, und ein Code ohne Ablauf ist dann ein
>    Passwortäquivalent ohne Verfallsdatum.
> 5. **Nutzungsgrenze** (`JoinCodeIssuance.max_uses`/`.uses`). Derselbe Grund wie 4: ohne Grenze
>    kann derselbe Code beliebig oft eingelöst werden, auch nachdem alle erwarteten Bewohnenden
>    bereits beigetreten sind. Standard seit O-15 (aktualisiert 2026-09-16): **1**. *(Die
>    Gründungs-Link-Ausnahme bleibt als Vorschlagswert bestehen, wird in v0.1 aber nicht gebaut —
>    niemand erhebt die Zahl der erwarteten Bewohnenden. Entscheidung vom 2026-09-21,
>    `review-log.md` §Offene-Punkte-Register.)*
>
> **Sechste Auflage, neu 2026-09-21 — der Code muss von Hand eingebbar sein.** **P-1
> (Kanalneutralität)** verlangt, dass alles, was per Link ankommen kann, auch von Hand eingegeben
> werden kann. Ein `uuid` genügt dem nicht: niemand tippt 36 Zeichen von einem Zettel ab. Der Code
> ist deshalb **kurz, großgeschrieben, in zwei Gruppen gesetzt und aus einem verwechslungsarmen
> Alphabet gezogen** (Bauform: `UAMPN-QACVZ`). Das ist keine Kosmetik, sondern die Bedingung dafür,
> dass der Link auch am Telefon oder auf einem Zettel funktioniert.
>
> **Und die Auflage, die unmittelbar daraus folgt: Versuchsbegrenzung.** Ein kurzer Code hat
> weniger Entropie als ein `uuid`, und die Prüfung eines Codes ist ein **Orakel für den gesamten
> Bestand** — ein Rateversuch wird gegen alle lebenden Links geprüft, nicht gegen einen. Der
> Suchraum teilt sich damit durch die Zahl der ausgestellten Links. Bei einem Haushalt ist das
> belanglos, bei zehntausend nicht mehr. Die Einlöseroute braucht deshalb eine Begrenzung der
> Versuche je Quelle. Sie ist Teil der Entscheidung, den Code zu kürzen — nicht ein späterer
> Zusatz, den man auch weglassen könnte.
>
> **Ergänzung, entschieden 2026-09-16 — Speicherformat.** Die Auflagen oben legen Umgang, nicht
> Speicherformat fest. Entscheidung: `JoinCodeIssuance.code` darf **im Klartext gespeichert und dauerhaft
> (nicht nur einmalig) angezeigt werden**, lesbar ausschließlich für Moderation und
> Haushalts-Account desselben Haushalts. Begründung: wer diese Ansicht erreicht, ist bereits
> authentifiziertes Mitglied mit entsprechenden Rechten — dauerhafte Klartext-Lesbarkeit erhöht
> das Risiko gegenüber einer Einmal-Anzeige nicht wesentlich. Das ersetzt keine der fünf Auflagen
> oben, insbesondere nicht Punkt 2/3 (Log- und Query-String-Verbot, G-A5 bleibt unverändert
> gültig).
>
> Punkt 2 ist die unbequemste: „nicht ins Anwendungslog schreiben" ist trivial, „das Zugriffslog des
> Webservers für eine Route redigieren" ist eine Konfigurationsaufgabe, die man vergisst. Sie gehört
> als überprüfbare Regel in `GUARDRAILS.md`, nicht als Hinweis.
>
> **Was Punkt 4/5 ausdrücklich nicht ersetzen** (G-A5 bleibt gültig, siehe Plan „Nicht angefasst"):
> sie **ergänzen** das Entwerten, sie **ersetzen** es nicht — eine organisierende Person, die einen
> falsch verschickten Link sofort entwerten will, **löscht ihn**, statt auf den Ablauf zu warten.
> *(Bis 2026-09-21 stand hier „rotiert weiterhin"; Rotation als eigener Mechanismus ist mit
> `JoinCodeIssuance` entfallen.)*

#### `JoinCodeIssuance` — ein einzelner ausgestellter Einladungslink

**Neu 2026-09-21**, löst **O-18** auf. Bis dahin trug `Household` genau einen rotierenden Code mit
einem Zähler. Das Modell konnte damit zwei Fragen nicht beantworten, die die Moderationsfläche
(O16) stellt: *„welche Links sind gerade offen"* und *„wer hat sich über diesen Link registriert"*.
Ein Haushalt stellt deshalb **mehrere** Links aus — jeder mit eigener Frist, eigener Nutzungsgrenze,
eigenem Zähler und eigenem Lebensende.

| Feld | Typ | Klasse | Erläuterung |
|---|---|:--:|---|
| `id` | `uuid` | ⚙️ | |
| `household_id` | `uuid` | ⚙️ | |
| `code` | `text` | ⚙️ | der Code selbst. **Über alle Haushalte eindeutig**, denn die Einlösung kennt beim Nachschlagen noch keinen Haushalt — der Code ist die einzige Eingabe. Sechs Auflagen, Kasten oben bei `Household` |
| `expires_at` | `timestamptz` | ⚙️ | Vorschlag: Ausstellung + 7 Tage. **Mit einem Tippen um weitere 7 Tage verlängerbar** (O-15) — auf O16 als eine Handlung, nicht als Datumsfeld |
| `max_uses` | `int` | ⚙️ | wie oft dieser Link eingelöst werden darf. Default **1** (O-15, aktualisiert 2026-09-16). `0` ist erlaubt und bedeutet „geschlossen" |
| `uses` | `int` | ⚙️ | Default `0`, hochgesetzt bei jedem erfolgreichen Beitritt über **diesen** Link. Wird nie zurückgesetzt — ein neuer Link ist eine neue Zeile, kein zurückgedrehter Zähler |
| `created_at` | `timestamptz` | ⚙️ | |
| `created_by_account_id` | `uuid` | 🟠 | wer den Link ausgestellt hat. **`NOT NULL`**, dieselbe Begründung wie bei **O-17**: „kein Wert" und „vom System" dürfen nicht gleich aussehen |
| `deleted_at` | `timestamptz?` | ⚙️ | gesetzt durch **„Löschen"** auf O16. Sofort ungültig, bleibt aber in der Historie sichtbar — das ist der Unterschied zwischen „entwerten" und „vergessen" |
| `resident_profile_id` | `uuid?` | 🟠 | **Neu (menschliche Entscheidung, 2026-09-22).** `null` ist der gewöhnliche Link, wie oben beschrieben — seine Einlösung **erzeugt** ein neues `ResidentProfile`. Ein gesetzter Wert **bindet** den Link an ein bereits vorbereitetes (`prepared`) `ResidentProfile` desselben Haushalts; seine Einlösung **übernimmt** dieses Profil, statt ein zweites anzulegen, und die besuchende Person wird namentlich begrüßt statt den Namen selbst zu wählen. Sonst ändert sich an einem Link nichts: Frist, Nutzungsgrenze, Zähler, Löschbarkeit und die einzige Ablehnungsmeldung (FR-2.8) gelten unverändert für beide Arten |

> **Vier Zustände, und nur einer davon ist ein Zustandsfeld.** Ein Link ist **aktiv**, wenn
> `deleted_at` leer ist, `expires_at` in der Zukunft liegt und `uses < max_uses` gilt. Er ist
> **abgelaufen**, **aufgebraucht** oder **gelöscht**, sobald eine dieser drei Bedingungen kippt.
> Bewusst kein `status`-Enum: die drei Gründe sind aus den Daten ablesbar, und ein zusätzliches
> Feld könnte ihnen widersprechen. Die Oberfläche darf den Grund nennen — die **Einlösung nicht**,
> siehe `F2-requirements.md` **FR-2.8**.
>
> **Löschen berührt keine Mitgliedschaft.** Wer über einen Link beigetreten ist, bleibt Mitglied,
> wenn der Link gelöscht wird — `screens/O-organisation.md` O16 sagt das ausdrücklich. Der Link ist
> eine Eintrittskarte, kein Aufenthaltstitel.
>
> **Warum die Historie bleibt und nicht aufgeräumt wird.** Sie ist der Grund, aus dem es diese
> Entität gibt: der Prototyp-Test wollte je aufgebrauchtem Link sehen, wer darüber hereinkam. Das
> beantwortet `Membership.joined_via_issuance_id`. Eine gelöschte Zeile würde die Antwort mit
> löschen. Aufbewahrung folgt dem Haushalt, nicht einer eigenen Frist — der Code ist ⚙️, keine
> personenbezogene Angabe (O-9).
>
> **Was diese Entität ausdrücklich nicht ist: eine Einladung pro Person.** **FR-2.1** verbietet,
> dass das System einen Code je Person *verlangt*; es verbietet der organisierenden Person nicht,
> mehrere Links auszustellen. Der Unterschied ist der Zweck von **US-2.1**: niemand soll gezwungen
> sein, Codes zu verwalten — ein einziger Link für den Gruppenchat muss immer genügen. Die
> personengebundene Einladung einer **zugesagten Bewerbung** ist etwas anderes und liegt in v0.2:
> `ApplicationInviteToken`, S-42.

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
| `reveal_vote_authorship` | `bool` | ⚙️ | **Neu (2026-09-16, Prototype-User-Test).** Default `false`. Wenn aktiv, zeigt die Kandidaten-Einzelansicht (D2) zusätzlich zur aggregierten Verteilung, welche Person wie gestimmt hat. Selbst-Redaktion (G-D1, deckt „alle Lesepfade auf Vote" ab) und der Auskunftsexport-Anonymitätsschutz (G-D6, betrifft nur den Export an Bewerbende) gelten unverändert und unabhängig von dieser Einstellung |
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
| `display_name` | `text` | 🟠 | Anzeigename im Feed („Jonas hat Lea eingeladen"). **Seit O-12 (§2.1) zusätzlich die Anmeldekennung** für Resident-Accounts ohne E-Mail — deshalb **eindeutig pro Haushalt unter Profilen, die weder `moved_out` noch `removed` sind**, nicht mehr nur Beschriftung |
| `status` | `enum(prepared, active, moved_out, removed)` | ⚙️ | `prepared` = vom Haushalts-Account angelegt, noch von keinem Account übernommen. `removed` ist U-27's harter Entfernen-Schritt: endgültig, kein Übergang führt heraus, in der Datenbank per Trigger erzwungen (Menschliche Entscheidung, 2026-09-22) |
| `moved_in_on` | `date?` | 🟠 | |
| `moved_out_on` | `date?` | 🟠 | setzt `status = moved_out` → **sofortiger Zugriffsentzug** (V-3) |
| `room_id` | `uuid?` | ⚙️ | aktuell bewohntes Zimmer |
| `created_at` | `timestamptz` | ⚙️ | |

**Warum `prepared` ein eigener Zustand ist — und warum das seit ADR-013 wichtiger wird, nicht
weniger wichtig:** Der Haushalts-Account **legt Bewohner-Profile an, besetzt sie aber nie.** Er kann
ein Profil anlegen und direkt zum Moderator ernennen; wer es benutzt, meldet sich mit einem eigenen
Resident-Account an. „Profil ohne verknüpften Account" ist damit nicht mehr der Randfall, sondern
der **reguläre Zwischenzustand** jedes so angelegten Profils. Ohne `prepared` müsste man ihn
implizit erschließen — genau die Art impliziten Zustands, die ADR-002 abschaffen will.

Das ist zugleich der **Moderator-Wiederherstellungspfad**: Fällt der letzte Moderator aus, bleibt
die Verwaltung handlungsfähig, indem sie ein Profil anlegt und einen Moderator ernennt — ohne selbst
in dieses Profil zu schlüpfen.

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
| `resident_profile_id` | `uuid?` | ⚙️ | gesetzt, wenn dieser Account als Bewohner-Profil handelt; `null` = Haushalts-Account. Seit ADR-013 entscheidet dieses Feld zugleich den Account-Typ — ein Account mit `is_resident = false` trägt hier dauerhaft `null` |
| `is_resident` | `bool` | ⚙️ | **Stimmberechtigung.** Der Haushalts-Account hat `false` und **kann nicht abstimmen** |
| `role` | `enum(household_admin, moderator, member)` | 🟠 | orthogonal zu `is_resident`. **In V0.2 von ⚙️ auf 🟠 umklassifiziert** — siehe Kasten |
| `permissions` | `text[]` | 🟠 | **einzeln vergebbar**, Werte siehe unten. Ebenfalls 🟠 |
| `notification_event_mask` | `jsonb?` | ⚙️ | persönliche Ebene; überschreibt die Haushalts-Ebene |
| `joined_via_issuance_id` | `uuid?` | ⚙️ | **welcher ausgestellte Link verwendet wurde** — speist den Feed und beantwortet auf O16 „wer hat sich über diesen Link registriert". *(Geändert 2026-09-21, O-18: hieß `joined_via_code` und trug den Code als Text. Ein Verweis statt einer Kopie — sonst trüge diese Zeile den Code selbst, was Auflage 2/3 unterläuft. `null` bei Mitgliedschaften, die nicht über einen Link entstanden sind: Gründung und von der Verwaltung angelegte Profile)* |
| `joined_at` | `timestamptz` | ⚙️ | Beitritte erscheinen im Aktivitäts-Feed (struktureller Duplikatsschutz). Zweiter Zweck: ein von `became_resident_id` unabhängiges Kriterium für moderierende Sichtbarkeit, z. B. Zugriff auf die Rundenhistorie zu Auditzwecken |
| `revoked_at` | `timestamptz?` | ⚙️ | **Korrigiert (U-22):** nicht mehr „jedes Mitglied kann entfernen" — das galt für den durch E-06 vorausgesetzten strukturellen Schutz, der mit der getrennten Bewohnerliste entfällt (§10.2). Setzbar nur über `manage_members`; die genaue Rechteabstufung zwischen Verwaltung und Moderator ist Sache der Rechtematrix in `03-PRD.md` |

Vergebbare Werte in `permissions` (Vorschlag, erweiterbar):
`create_application` · `change_application_state` · `close_round` · `confirm_appointment` ·
`manage_rooms` · `manage_settings` · `manage_members` · `extend_retention` · `delete_data` ·
`export_subject_access`.

> **`manage_rooms` ist neu (P-O-10, 2026-09-14)** und trägt die **Verfügbarkeit** eines Zimmers:
> anlegen, `planned → open`, `on_hold`, `not_available` (`zustandsmaschinen.md` §3.3). Vorbelegt bei
> `household_admin` **und** `moderator`.
>
> **Warum ein eigenes Recht und nicht `manage_settings`:** Die Verfügbarkeit eines Zimmers ist eine
> Entscheidung der **laufenden Runde** — die moderierende Person merkt als Erste, dass ein Zimmer
> doch nicht frei wird —, und sie wirkt unmittelbar auf das Favoriten-Budget, das nur `open`-Zimmer
> zählt (`rechenmodelle.md` §8.2). `manage_settings` bündelt dagegen Verfahrensregeln und die
> Freigabe der Datenschutzseite. Hinge die Verfügbarkeit daran, müsste eine moderierende Person ohne
> dieses Recht mitten in der Runde die Verwaltung holen, um ein Zimmer auf `on_hold` zu setzen.
>
> **Nicht** von `manage_rooms` gedeckt: `promised` und `occupied` samt Rückwegen — die sind Folge
> einer Bewerbung und hängen an `change_application_state` — sowie `occupied → open` beim Auszug,
> das an `manage_members` hängt.

> **`close_round` ist die zweite Rolle-Vorbelegung (menschliche Entscheidung, 2026-09-22).** Bis
> dahin erhielt sie stattdessen automatisch die **erste beigetretene Bewohner-Mitgliedschaft** eines
> Haushalts (`claimResidentProfile`) — eine Annäherung an die Empfehlung aus
> `backlog/requirements/F1-requirements.md` §8 Punkt 1 (*„the household account's own resident
> profile holds it initially"*), die daneben lag, sobald eine Mitbewohnerin vor der registrierenden
> Person selbst beitrat, und die einem Profil eine für alle anderen unsichtbare Sonderstellung gab.
> Jetzt gilt dasselbe Muster wie bei `manage_rooms` oben: **Vorbelegt bei `household_admin` und
> `moderator`.** Wer eine Runde eröffnen, öffnen oder schließen will, muss dafür zur Moderation
> ernannt werden — das ist sichtbar und nachvollziehbar, der frühere Automatismus war es nicht.
>
> **Abgabebedingung, in dieser Notiz selbst getragen:** zwei benannte Rolle-Vorbelegungen sind noch
> kein Vorlagensystem — der **dritte** wäre es. Bevor ein weiteres Recht auf diese Weise vorbelegt
> wird, muss **S-04**s Ausschluss von `Berechtigungsvorlagen` (`02-SRD.md` §5.3) neu aufgemacht
> werden, statt ein weiteres Mal gedehnt zu werden.

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
`Product-Audit-Hypotheses.md` §H-F5 (S-42). Er erweitert diesen Vorschlag um die dort offen
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
