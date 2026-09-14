> **Status:** Bestätigt — verbindlich für v0.1
> **Quelle:** `../05-ADRs.md` §ADR-006 (Stand V0.8, eingefroren 2026-09-09)
> **Nummer:** ADR-006 — dauerhaft. Nummern werden nie neu vergeben.
> **Abweichung von der Quelle:** Seit 2026-09-11 weicht dieser Record in den Zeilen
> *Authentifizierung*, *Hosting* und *Auslieferung* von der eingefrorenen Fassung in `../05-ADRs.md`
> ab. Die eingefrorene Fassung bleibt als historischer Stand stehen; **maßgeblich ist diese Datei.**

## ADR-006 — Stack: Next.js/TypeScript, Postgres, Drizzle, Supabase (EU) mit Supabase Auth

> ### Änderung 2026-09-11 — Auth wechselt von self-hosted zu Supabase Auth
>
> Die ursprüngliche Festlegung lautete *self-hosted, Credentials-Provider, Argon2id*. Sie wird
> ersetzt. **Der Anlass ist die Aufgabebedingung dieses Records selbst** („…wenn self-hosted Auth
> mehr Zeit kostet als die gesamte Casting-Pipeline"): für ein Solo-Projekt mit AI-gestützter
> Implementierung ist die Anmeldesicherheit der teuerste Ort für einen plausibel aussehenden Fehler.
>
> **Was die Entscheidung ausdrücklich *nicht* begründet:** „RLS käme mit `auth.uid()` gratis." Das
> ist für dieses Modell falsch und wurde bei der Prüfung verworfen — siehe *Konsequenzen, negativ*,
> erster Punkt. Wer diesen Record später liest, soll den Irrtum nicht erneut machen.
>
> Unberührt bleiben: Next.js, TypeScript, Postgres, Drizzle, EU-Verarbeitung, kein Serverless.
> Unberührt bleibt ebenfalls **ADR-007** — Passwort primär, Passkey optional ist eine Aussage über
> die *Methode*, nicht über den *Betreiber*.

### Kontext

Solo-Projekt, AI-gestützte Implementierung, Non-Profit ohne Budget für bezahlte Dienste, Nutzung in
Schüben, mobile-first. Die Daten sind personenbezogen und teils besonders sensibel (Art.-9-Risiko in
Freitextbewerbungen). `02-SRD.md` bleibt bewusst lösungsneutral — diese Entscheidung liegt hier.

Zwei Anforderungen wirken direkt auf den Stack: **RLS** (ADR-004) verlangt eine Datenbank, die es
kann, und ein Datenzugriff, der Sitzungsvariablen setzen kann. **Der Solver-Kindprozess** (ADR-005)
verlangt eine Laufzeit, die Kindprozesse starten darf — was viele Serverless-Umgebungen ausschließt.

### Betrachtete Optionen

| Ebene | Empfehlung | Begründung | Verworfene Alternative |
|---|---|---|---|
| **Sprache** | TypeScript durchgängig (Ausnahme: Solver-Adapter in Python) | Ein Typsystem für Schema, API und UI. Für AI-gestützte Arbeit ist ein durchgehendes Typsystem das billigste Korrektiv gegen falsche Annahmen | Python-Backend: sinnvoll, wenn die Solver-Pipeline zentral wäre — sie ist ein Knopf unter vielen |
| **Frontend + Backend** | **Next.js (App Router)**, Server Actions und Route Handlers | Ein Deployment-Artefakt, eine Codebasis, gemeinsame Typen. Server Components halten Autorisierung und Sichtbarkeitsfilterung serverseitig — bei V-1 bis V-4 ein Sicherheitsgewinn, nicht nur Bequemlichkeit | Getrenntes SPA + eigenes API-Backend: sauberere Schichtung, doppelte Infrastruktur, doppelte Typpflege |
| **Datenbank** | **PostgreSQL 16+** | **Row-Level-Security ist die Bedingung, unter der ADR-004 überhaupt existiert.** Dazu `jsonb` für `attributes` und Payloads, Bereichstypen und Ausschluss-Constraints für Zeitfenster und Slot-Exklusivität | MySQL/SQLite: kein RLS → ADR-004 fällt. Damit ist die Wahl keine Vorliebe, sondern Folge |
| **Datenzugriff** | **Drizzle ORM** | Nah an SQL — bei RLS entscheidend, weil man sehen muss, welches Statement wirklich läuft. Typsichere Migrationen, kein verstecktes Verhalten, `SET LOCAL` unkompliziert | Prisma: bequemer, aber mehr Magie zwischen Code und Statement. Genau die Magie, die bei RLS-Debugging und bei AI-generiertem Code teuer wird |
| **Authentifizierung** | **Supabase Auth (GoTrue)** für Anmeldedaten und Anmeldevorgang. **Der Sitzungs- und Profilkontext bleibt in der eigenen `Session`-Tabelle** — ADR-004 wird davon nicht berührt | Abgegeben wird genau der „Rattenschwanz" aus ADR-007: Zurücksetzen, Ratenbegrenzung, Brute-Force-Schutz, Hash-Parameter, Token-Ausgabe. Das ist der Teil, an dem ein Solo-Projekt am teuersten falsch liegt, und er geht an den Anbieter, der **ohnehin schon die gesamte Datenbank verarbeitet** — kein neuer Dritter, kein zusätzlicher AVV | **self-hosted, Credentials-Provider, Argon2id** (bis 2026-09-11 die Festlegung): volle Kontrolle, volle Portabilität, aber die gesamte Anmeldesicherheit in eigener Verantwortung. Clerk/Auth0: ein *zusätzlicher* Anbieter **neben** dem Hoster — genau der Nachteil, den Supabase Auth nicht hat, weil es derselbe Anbieter ist |
| **Hosting** | **Supabase, EU-Region**, mit AVV | Der Haushalt ist Verantwortlicher, Flatmate.io Auftragsverarbeiter — die Kette muss lückenlos in der EU liegen. Supabase **ist** Postgres, kein Derivat: RLS, `FORCE ROW LEVEL SECURITY`, `SET LOCAL` und Drizzle laufen unverändert | Nicht-EU-Hosting: Drittlandtransfer mit Zusatzaufwand, den ein Non-Profit nicht tragen will. Selbst betriebenes Postgres: keine fremde Verarbeitung, aber Sicherung, Einspielung von Aktualisierungen und Wiederherstellung in Eigenregie |
| **Auslieferung** | Docker-Image (App + Python-Solver); **Postgres als verwalteter Dienst daneben, nicht im selben Image** | Ein Artefakt, reproduzierbar, Rücknahme über das vorherige Image. Der Solver bleibt Kindprozess im Container — die Bedingung aus ADR-005 gilt unverändert | Serverless: **schließt den Solver-Kindprozess aus** (ADR-005) und macht dauerhafte Verbindungen mit `SET LOCAL` unangenehm |
| **Datenbankverbindung** | **Direkte Verbindung (Session-Modus)**, nicht der Transaktions-Pooler | Der Sitzungskontext aus ADR-004 wird per `SET LOCAL` gesetzt. Wer versehentlich über den Transaktions-Pooler verbindet, verschiebt die Lebensdauer dieses Kontexts — und ein Sitzungskontext, der nicht zur Anweisung passt, ist ein **stiller** RLS-Fehler, kein lauter | Transaktions-Pooler als Standardverbindung: mehr Verbindungen, aber die Kontextsetzung wird zur Fußangel |

### Entscheidung

Wie oben. Zwei Punkte sind keine Vorlieben, sondern **Folgen anderer Records** und daher nicht
einzeln verhandelbar, ohne diese mitzuverhandeln:

- **Postgres** folgt aus ADR-004 (ohne RLS kein zweiter Zaun).
- **Kein Serverless** folgt aus ADR-005 (ohne Kindprozess kein lokaler Solver).

**Die Grenze der Auslagerung — der wichtigste Satz dieses Records.** Supabase Auth besitzt die
*Anmeldung*, nicht die *Autorisierung*:

| | Wer besitzt es |
|---|---|
| Anmeldedaten, Passwort-Hash, Zurücksetzen, Ratenbegrenzung, Brute-Force-Schutz | **Supabase Auth** |
| `Session.acting_profile_id` (bei der Anmeldung vergeben, danach unveränderlich — ADR-013), `SET LOCAL app.account_id / app.profile_id / app.household_id` | **eigener Code** (ADR-004) |
| Policy-Objekte und RLS-Policies | **eigener Code** (ADR-004) |

Die beiden Pflichtprüfungen aus ADR-004 bleiben damit **vollständig in eigener Verantwortung**:
`acting_profile_id` darf nur auf ein Profil mit gültiger `Membership` desselben Accounts zeigen, und
`app_redaction_subjects()` sammelt weiterhin alle Profile des Accounts. Supabase Auth nimmt diese
Arbeit nicht ab und kann sie nicht abnehmen.

### Konsequenzen

**Positiv**

- Eine Codebasis, ein Typsystem, ein Deployable, eine Migrationskette.
- Autorisierung serverseitig, ohne Client-Vertrauen.
- **Die AVV-Kette wird durch diese Entscheidung nicht länger.** Auth und Datenbank liegen beim
  *selben* Auftragsverarbeiter; die Liste der Unterauftragsverarbeiter
  (`06-Compliance-Anhang.md` §98) bekommt einen Namen, keinen zusätzlichen Eintrag.
- **Der fehleranfälligste Teil der Anmeldung liegt bei einem Anbieter mit Sicherheitsteam.** Genau
  die Punkte, die ADR-007 als Negativkonsequenz aufzählt, sind nicht mehr selbst gebaut.
- **Keine eigenen Passwort-Hashes mehr im eigenen Bestand.** Was man nicht speichert, kann man nicht
  verlieren — der Bestand schrumpft um das sensibelste Feld von `Account`.

**Negativ**

- **`auth.uid()` deckt ein Drittel des Sitzungskontexts ab — nicht mehr.** ADR-004 verlangt
  `app.account_id`, `app.profile_id` **und** `app.household_id`. Supabase Auth liefert die
  Identität des *Accounts* — und nur sie. Für die beiden anderen gibt es dort kein Gegenstück:
  `app.profile_id` ist `Session.acting_profile_id`, seit **ADR-013** bei der Anmeldung fest
  vergeben und innerhalb der Sitzung unveränderlich, aber eben ein Feld **unseres** Modells und
  nicht des Anmeldedienstes; `app.household_id` ist eine Beziehung über `Membership`, die der
  Anmeldedienst gar nicht kennt. Dass die Identität nicht mehr wechselt, macht das Füllen des
  Kontexts **nicht überflüssig, nur vorhersagbar**: Er muss weiterhin pro Request innerhalb der
  Transaktion per `SET LOCAL` gesetzt werden, weil RLS ihn pro Transaktion liest (**G-C8**). Wer
  diesen Record mit der Erwartung liest, RLS werde dadurch einfacher, liest ihn falsch: der Aufwand
  für den Sitzungskontext bleibt **unverändert**.
- **Zwei Sitzungsbegriffe nebeneinander.** Supabase Auth führt eigene Sitzungen (Token, Erneuerung);
  das Modell führt `Session` mit `token_hash`, `user_agent` und eigenen Invalidierungsregeln. Beide
  müssen zusammenpassen — seit **ADR-013** vor allem **an der Abmeldung**, weil sie der einzige Weg
  zu einer anderen Identität ist: `Session.revoked_at`, „überall abmelden" und der administrative
  Passwort-Reset müssen die Sitzung des Anmeldedienstes mit beenden, und der Client muss darauf den
  Offline-Stimmpuffer leeren (G-B7, Zusicherungen 4 und 5). Das ist die teuerste Stelle dieser
  Entscheidung.
- **`Account.password_hash` verlässt den eigenen Bestand.** Damit ändert sich das Domänenmodell
  (`04-Domaenenmodell.md` §2.1 und §Bestandsverzeichnis) und, weil das Bestandsverzeichnis ein
  **CI-Gate** ist (ADR-010), auch `data-inventory.yml`. Das ist keine Umformulierung, sondern eine
  Migration mit Gate-Wirkung. Die Angabe *Argon2id* entfällt; die TOM-Tabelle in
  `06-Compliance-Anhang.md` §11.2 weist das Hashing seit 2026-09-11 dem Auftragsverarbeiter zu. Die
  Anforderung „speicherhart, Parameter dokumentiert" bleibt bestehen — der tatsächlich verwendete
  Algorithmus ist beim Anbieter zu erheben und dort namentlich einzutragen.
- **Passkeys sind ein offener Punkt, kein gelöster.** ADR-007 verlangt `PasskeyCredential` mit
  mehreren Credentials pro Account, Bezeichnung, Löschbarkeit — und der harten Regel, dass das
  Löschen des letzten Passkeys **nie** den Zugang entzieht. Ob Supabase Auth WebAuthn in genau
  dieser Form trägt, ist **vor der Umsetzung zu prüfen**. Trägt es sie nicht, wird der Passkey-Teil
  doch selbst gebaut, und die Ersparnis dieser Entscheidung fällt kleiner aus als angenommen.
- **Die E-Mail-Bestätigung muss bewusst entschärft werden.** ADR-007 verlangt Ein-Schritt-
  Registrierung und „E-Mail-Verifikation blockiert die erste Abstimmung nicht". Ein Anmeldedienst,
  der standardmäßig erst nach Bestätigung eine Sitzung ausgibt, verletzt P-2, wenn man die
  Voreinstellung übernimmt. Das ist Konfiguration, aber **keine, die man vergessen darf.**
- **Abhängigkeit vom Anbieter genau dort, wo der Wechsel am teuersten ist.** Die Datenbank ist
  portabel — Postgres bleibt Postgres. Der Anmeldedienst ist es weniger: Hashes lassen sich
  exportieren, Sitzungs- und Token-Verhalten nicht einfach nachbauen. Die Entscheidung tauscht
  Eigenverantwortung gegen eine Bindung, die bei einem Umzug zuerst weh tut.
- **„Ohne Budget für bezahlte Dienste" steht im Kontext dieses Records und bleibt zu prüfen.** Die
  Bedingungen kostenloser Stufen ändern sich und enthalten regelmäßig Einschränkungen, die einem
  dauerhaft laufenden Produkt widersprechen. Was die gewählte Stufe zusichert — Verfügbarkeit,
  Sicherungen, Aufbewahrungsfristen —, gehört **vor** der Umsetzung geprüft und in
  `06-Compliance-Anhang.md` festgehalten, nicht nach dem ersten Ausfall.
- **Next.js ist ein bewegliches Ziel.** App Router, Server Actions und Caching-Verhalten haben sich
  wiederholt geändert. Ein Projekt mit langem Atem zahlt Migrationsaufwand. Gegenmittel:
  Fachlogik im puren Kern, damit ein Framework-Wechsel die Domäne nicht anfasst.
- **Kein Serverless heißt Betriebskosten** — ein laufender Container statt Skalierung auf Null. Bei
  einem spendenfinanzierten Projekt eine dauerhafte Position.
- **Drizzle ist weniger verbreitet als Prisma**, also weniger Trainingsmaterial für AI-Agenten und
  mehr falsch geratene API-Aufrufe. Deshalb die `GUARDRAILS.md`-Regel „keine Bibliotheks-API ohne
  Verifikation gegen die installierte Version".
- **Ein Image mit Node *und* Python** ist größer, langsamer gebaut und hat zwei
  Sicherheitsaktualisierungsketten.
- **Zwangsbedingung aus ADR-005.** Die Hostingumgebung muss einen lokalen Python-Kindprozess mit
  Zeitlimit und fixem Seed ausführen können. Eine Umgebung ohne langlebige Prozesse ist damit
  ausgeschlossen — auch wenn der Solver erst in v1.1 gebaut wird. Wer diese Bedingung beim
  Aufsetzen übergeht, verliert ADR-005, ohne es zu bemerken.

> **Das gibt man auf, wenn** die Betriebskosten das Spendenmodell übersteigen (dann: Solver als
> separater, bedarfsgestarteter Dienst und die App serverless — aber erst, wenn ADR-005 entsprechend
> angepasst ist).
>
> **Für die Auth-Entscheidung gilt eine eigene Aufgabebedingung:** Man geht zu einem selbst
> betriebenen Anmeldedienst zurück, wenn Supabase Auth die Anforderungen aus ADR-007 nicht trägt —
> namentlich Passkeys in der geforderten Form oder eine Registrierung, die ohne vorherige
> E-Mail-Bestätigung eine Sitzung ausgibt — oder wenn der Abgleich der beiden Sitzungsbegriffe zur
> häufigsten Fehlerquelle des Projekts wird. In beiden Fällen ist der Grund derselbe: Die
> Auslagerung lohnt nur, solange sie *weniger* Arbeit ist als das, was sie ersetzt.

**Status: Bestätigt — verbindlich für v0.1**

> **Bestätigt am 2026-09-09** (Samuel Zink) — verbindlich für v0.1.
> · **Geändert am 2026-09-11** (Samuel Zink): Authentifizierung von *self-hosted, Argon2id* auf
> **Supabase Auth** umgestellt, Hosting auf **Supabase (EU)** benannt, Verbindungsart als
> *direkt, Session-Modus* festgeschrieben. Ausgelöst durch die Aufgabebedingung dieses Records.
> · **Aufgabebedingung:** Betriebskosten über dem Spendenmodell (dann: Solver als separater,
> bedarfsgestarteter Dienst und die App serverless — aber erst, wenn ADR-005 entsprechend angepasst
> ist). Für Auth gesondert: siehe Kasten oben.
> · **Was ein späterer Widerspruch kostet:** Praktisch die gesamte Codebasis. Dies ist der teuerste
> Record dieser Liste, und der einzige, dessen Widerspruch zugleich ADR-005 mitnimmt
> · Status wechselt auf `Angenommen`, sobald im Code umgesetzt und überprüft.
>
> **Folgearbeiten aus der Änderung von 2026-09-11 — Stand 2026-09-11:**
>
> 1. ✅ **Passkey-Prüfung** (ADR-007): Supabase Auth trägt `PasskeyCredential` in der geforderten
>    Form — mehrere Credentials, eigene Bezeichnung, einzelnes Löschen, Einrichtung nur aus
>    bestehender Sitzung, eigenständiger Anmeldeweg. **Mit einer Bedingung:** Passkey setzt ein Konto
>    mit bestätigter E-Mail voraus, also bei Resident-Accounts eine nachgetragene eigene Adresse.
>    Ergebnis und die beiden verbleibenden Vorbehalte stehen in ADR-007.
> 2. ✅ **`Account.password_hash` aus dem Modell entfernt** — `../domain/identity.md` und
>    `../domain/personenbezogene-felder.md` (Summe 59 → 58). Das `data-inventory.yml` existiert noch
>    nicht; die Folge ist dort beim Anlegen zu berücksichtigen (CI-Gate, ADR-010).
> 3. 🟡 **`06-Compliance-Anhang.md`:** Supabase ist als Unterauftragsverarbeiter für **beide** Zwecke
>    — Datenbank und Anmeldedienst — namentlich eingetragen (§1.3). **Weiterhin offen und bewusst
>    nicht erfunden:** Firma und Sitz, Verarbeitungsort samt EU-Nachweis, Stand der eigenen AVV, die
>    Unterauftragsverarbeiter des Anbieters. Bleibt Blocker für v0.2.
> 4. 🟡 **TOM-Tabelle** (§11.2): auf „Hashing liegt beim Auftragsverarbeiter" umgeschrieben. Der
>    tatsächlich verwendete Algorithmus ist beim Anbieter zu erheben und dort namentlich einzutragen.
> 5. ✅ **Titelverweise nachgezogen:** `../adr/README.md` und `../GUARDRAILS.md` nennen den Record
>    jetzt korrekt. `../05-ADRs.md` bleibt als eingefrorene Momentaufnahme unverändert — dort steht
>    weiter „self-hosted Auth", und das ist beabsichtigt.
