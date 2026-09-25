> **Status:** Bestätigt — verbindlich für v0.1
> **Quelle:** `../05-ADRs.md` §ADR-006 (Stand V0.8, eingefroren 2026-09-09)
> **Nummer:** ADR-006 — dauerhaft. Nummern werden nie neu vergeben.
> **Abweichung von der Quelle:** Seit 2026-09-11 weicht dieser Record in den Zeilen
> *Authentifizierung*, *Hosting* und *Auslieferung* von der eingefrorenen Fassung in `../05-ADRs.md`
> ab; seit 2026-09-16 zusätzlich in der Entscheidung selbst (**kein Serverless** entfällt) sowie in
> den Zeilen *Auslieferung* und *Datenbankverbindung*. Die eingefrorene Fassung bleibt als
> historischer Stand stehen; **maßgeblich ist diese Datei.**

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
> Unberührt bleiben: Next.js, TypeScript, Postgres, Drizzle, EU-Verarbeitung. **Kein Serverless**
> wird durch die folgende Änderung aufgehoben — siehe unten.
> Unberührt bleibt ebenfalls **ADR-007** — Passwort primär, Passkey optional ist eine Aussage über
> die *Methode*, nicht über den *Betreiber*.

> ### Änderung 2026-09-16 — App-Hosting wechselt zu Vercel (Serverless); Solver zieht in ADR-005 um
>
> Die ursprüngliche Festlegung — **kein Serverless**, ein Docker-Image mit App und Solver zusammen —
> wird ersetzt durch: **App auf Vercel** (Serverless/Edge, Hobby-Tarif, EU-Region `fra1`), **Solver
> als eigener Dienst** (siehe ADR-005s Änderung vom selben Tag). Der Anlass war ursprünglich der
> Wunsch nach kostenlosem Hosting; der eigentliche Auslöser für die *Bestätigung* war der Vergleich
> der Optionen in dieser Konversation, dokumentiert unter dem entsprechenden offenen Punkt in
> `review-log.md`.
>
> **Was diese Änderung nicht mehr begründet:** „Kein Serverless folgt aus ADR-005" — das war richtig,
> solange der Solver ein Kindprozess **im selben Prozess wie die App** war. Seit ADR-005 den Solver
> in einen eigenen Dienst verschiebt, entfällt genau diese Kopplung. Der zweite, unabhängige Grund
> aus diesem Record — dass Serverless „dauerhafte Verbindungen mit `SET LOCAL` unangenehm macht" —
> entfällt **nicht** automatisch mit; er wird unten in der Zeile *Datenbankverbindung* neu
> adressiert, nicht stillschweigend übergangen.
>
> **Neu, ungelöst und ausdrücklich benannt statt verschwiegen:** die Sicherheit des
> RLS-Sitzungskontexts unter Serverless hängt jetzt vollständig von der Disziplin ab, die FR-0.3/
> FR-0.4 (`backlog/requirements/F0-requirements.md`) ohnehin schon verlangen — `SET LOCAL` und die davon
> abhängige Abfrage in **derselben** Transaktion, durch **einen** Transaktions-Helfer, nie über
> getrennte Verbindungen aus dem eigenen Verbindungspool. Unter einem langlebigen Container war das
> eine Empfehlung mit komfortablem Sicherheitsabstand (wenige, lange lebende Verbindungen). Unter
> Serverless mit Supabases Transaktions-Pooler ist dieselbe Disziplin **die einzige** Absicherung,
> nicht mehr eine von mehreren. Der geschützte Test **G-D10 / AC-0.7** (zwei Haushalte, dieselbe
> physische Verbindung nacheinander, zweiter sieht nichts vom ersten) ist damit nicht mehr nur ein
> Test unter vielen, sondern der Beleg, dass dieser Wechsel sicher ist — **vor** der ersten Policy zu
> schreiben, nicht danach (Minimal-Gate-Reihenfolge, `MINIMAL-GATE.md` Punkt 7 gilt unverändert und
> jetzt schärfer).

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
| **Auslieferung** *(seit 2026-09-16)* | **Vercel** (App, Serverless/Edge, EU-Region `fra1`) **+ AWS Lambda** (Solver-Dienst, `eu-central-1`, ADR-005) — zwei Deployables statt einem | Kostenloses App-Hosting, sobald der Solver kein Kindprozess der App mehr ist (ADR-005). Der Solver-Port trägt die Trennung | War bis 2026-09-16: ein Docker-Image (App + Python-Solver), verworfen zugunsten kostenlosen Hostings, siehe Konsequenzen für den Preis dieser Wahl |
| **Datenbankverbindung** *(seit 2026-09-16)* | **Supabases Transaktions-Pooler**, mit derselben `SET-LOCAL`-in-einer-Transaktion-Disziplin wie zuvor, nur jetzt ohne das Sicherheitspolster einer langlebigen Verbindung | Serverless kann keine dauerhafte Direktverbindung halten; der Transaktions-Pooler ist die einzige Option, die zu vielen kurzlebigen Funktionsaufrufen passt. Die Absicherung ist FR-0.3/FR-0.4s einziger Transaktions-Helfer plus der geschützte Test G-D10/AC-0.7 — **kein neuer Mechanismus, aber jetzt die einzige Verteidigungslinie statt einer von zweien** | War bis 2026-09-16: direkte Verbindung (Session-Modus), verworfen mit derselben Begründung wie die Auslieferung — siehe die Änderungsnotiz oben für das, was dabei *nicht* stillschweigend übergangen wird |

### Entscheidung

Wie oben. Ein Punkt ist keine Vorliebe, sondern **Folge eines anderen Records** und daher nicht
einzeln verhandelbar, ohne diesen mitzuverhandeln:

- **Postgres** folgt aus ADR-004 (ohne RLS kein zweiter Zaun).

**Kein Serverless** folgte bis 2026-09-16 aus ADR-005 (ohne Kindprozess **im selben Prozess** kein
lokaler Solver) — seit ADR-005 den Solver in einen eigenen Dienst verschiebt, entfällt diese
Kopplung, und Serverless-App-Hosting ist wieder verhandelbar. Siehe die Änderungsnotiz 2026-09-16
oben für das, was dabei ausdrücklich *nicht* automatisch mit-gelöst wird.

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

> **Ergänzung 2026-09-16 — UI-Text als Tabelle, nicht als Inline-String.** Aus dem Prototyp-Abgleich
> (Screening der UI-Vokabular-Lücke O-G, `screens/rahmenwerk.md` §8.6): v0.1 liefert nur ein
> deutsches UI-Vokabular, aber es soll als **Schlüssel→Text-Tabelle** strukturiert werden, nicht als
> Text inline in Next.js-Komponenten. Grund: englischsprachige Bewohner:innen in deutschsprachigen
> WGs sind ein plausibler späterer Bedarf. Das ist **keine** Festlegung auf ein bestimmtes i18n-Paket
> und **kein** Auftrag, Mehrsprachigkeit in v0.1 zu bauen — nur eine Randbedingung, die verhindert,
> dass die spätere Erweiterung eine Textsuche-und-Ersetze-Migration wird.

### Konsequenzen

**Positiv**

- Eine Codebasis, ein Typsystem, eine Migrationskette. *(Bis 2026-09-16: „ein Deployable" — seit
  der Trennung von App (Vercel) und Solver (ADR-005, AWS Lambda) sind es zwei; siehe Negativ.)*
- Autorisierung serverseitig, ohne Client-Vertrauen.
- **Kostenloses App-Hosting** *(seit 2026-09-16)*, sobald der Solver kein Kindprozess der App mehr
  ist — siehe ADR-005s Änderung vom selben Tag.
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
  Transaktion per `SET LOCAL` (oder gleichwertig `set_config(…, true)`) gesetzt werden, weil RLS ihn
  pro Transaktion liest (**G-C8**). Wer
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
- **Serverless heißt: der RLS-Sitzungskontext hat nur noch eine Verteidigungslinie** *(seit
  2026-09-16, ersetzt die alte Betriebskosten-Zeile — die entfällt, weil Vercels Hobby-Tarif
  kostenlos ist)*. Unter dem alten Docker-Container war die `SET-LOCAL`-Disziplin aus FR-0.3/FR-0.4
  eine von zwei Absicherungen (wenige, langlebige Verbindungen als zusätzliches Polster). Unter
  Supabases Transaktions-Pooler ist sie die **einzige**. Siehe die Änderungsnotiz oben und
  `G-D10`/`AC-0.7`.
- **AWS wird ein neuer Unterauftragsverarbeiter** — nicht durch diese Entscheidung selbst, sondern
  durch ADR-005s Solver-Dienst, der dieselbe Entkopplung erst ermöglicht hat. Siehe ADR-005s eigene
  Konsequenzen und `06-Compliance-Anhang.md` §4 für die AVV-Pflicht (G-B4).
- **Drizzle ist weniger verbreitet als Prisma**, also weniger Trainingsmaterial für AI-Agenten und
  mehr falsch geratene API-Aufrufe. Deshalb die `GUARDRAILS.md`-Regel „keine Bibliotheks-API ohne
  Verifikation gegen die installierte Version".
- **~~Ein Image mit Node *und* Python ist größer, langsamer gebaut~~** *(seit 2026-09-16 nicht mehr
  diese Zeile betreffend — das App-Image trägt kein Python mehr. Die Sorge lebt unverändert in
  ADR-005 weiter, jetzt als Solver-eigenes Image.)*
- **~~Zwangsbedingung aus ADR-005~~** *(seit 2026-09-16 aufgehoben, nicht stillschweigend
  gestrichen: bis 2026-09-16 musste die Hostingumgebung einen lokalen Python-Kindprozess ausführen
  können, was jede Umgebung ohne langlebige Prozesse ausschloss. Seit ADR-005 den Solver in einen
  eigenen Dienst verschiebt, entfällt diese Zwangsbedingung für die App-Hostingwahl — sie gilt
  jetzt nur noch für den Solver-Dienst selbst, dort weiterhin in voller Schärfe.)*

> **Das gibt man auf, wenn** *(seit 2026-09-16, ersetzt die alte Fassung — die Betriebskosten-
> Aufgabebedingung hat bereits ausgelöst)*: die zusätzliche Komplexität aus zwei Deployables, die
> AWS-AVV oder die verschärfte Abhängigkeit von der `SET-LOCAL`-Disziplin sich als teurer erweisen
> als das kostenlose Hosting wert ist. Dann zurück zu einem Docker-Image mit App und Solver
> zusammen — ADR-005s Solver-Port und diese Zeile machen den Rückweg genauso billig wie den Hinweg.
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
> · **Geändert am 2026-09-16** (Samuel Zink): „Kein Serverless" aufgehoben. App-Hosting auf
> **Vercel** (Serverless/Edge, `fra1`) umgestellt; Datenbankverbindung auf **Supabases
> Transaktions-Pooler** umgestellt. Ausgelöst durch die Aufgabebedingung dieses Records
> (Betriebskosten/kostenloses Hosting) und ermöglicht durch ADR-005s Verschiebung des Solvers in
> einen eigenen Dienst — siehe die Änderungsnotiz 2026-09-16 oben.
> · **Aufgabebedingung** *(seit 2026-09-16 neu gefasst)*: siehe „Das gibt man auf, wenn" oben. Für
> Auth gesondert: siehe Kasten oben.
> · **Was ein späterer Widerspruch kostet:** Praktisch die gesamte Codebasis. Dies ist der teuerste
> Record dieser Liste, und der einzige, dessen Widerspruch zugleich ADR-005 mitnimmt
> · Status wechselt auf `Angenommen`, sobald im Code umgesetzt und überprüft — für die 2026-09-16-
> Änderung insbesondere: sobald der geschützte Test G-D10/AC-0.7 unter dem Transaktions-Pooler grün
> ist und die AWS-AVV vorliegt.
>
> **Folgearbeiten aus der Änderung von 2026-09-16 — Stand 2026-09-16:**
>
> 1. 🟡 **G-D10/AC-0.7 unter dem Transaktions-Pooler verifizieren**, vor der ersten Policy
>    (`MINIMAL-GATE.md` Punkt 7). Bisher nur für eine langlebige Direktverbindung gedacht — unter
>    dem Pooler ist der Test die einzige Absicherung, nicht mehr eine von zweien.
> 2. 🟡 **AWS als Unterauftragsverarbeiter in `06-Compliance-Anhang.md` §4 eintragen** und AVV
>    abschließen, bevor der Solver-Dienst live geht (G-B4). Siehe `review-log.md` für den offenen
>    Punkt.
> 3. 🟡 **Die spec-kit-Planungsartefakte für Feature 001 (F0) auf Serverless/Transaktions-Pooler
>    aktualisieren** — waren zwischenzeitlich auf Docker-Container/Direktverbindung korrigiert
>    worden, bevor diese Änderung feststand. Liegt außerhalb der Übergabegrenze dieses Ordners
>    (`README.md` §1) und wird dort, nicht hier, nachgezogen.
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
