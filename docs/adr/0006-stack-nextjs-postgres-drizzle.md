> **Status:** Bestätigt — verbindlich für v0.1
> **Quelle:** `../05-ADRs.md` §ADR-006 (Stand V0.8, eingefroren 2026-09-09)
> **Nummer:** ADR-006 — dauerhaft. Nummern werden nie neu vergeben.

## ADR-006 — Stack: Next.js/TypeScript, Postgres, Drizzle, EU-Hosting, self-hosted Auth

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
| **Authentifizierung** | **self-hosted, Credentials-Provider, Argon2id**, Sessions in der Datenbank | Kein externer Dienst, keine Nutzerdaten bei Dritten, kein AVV mehr. Passwort ist die primäre Methode (ADR-007) | Clerk/Auth0: bequem, aber Identitätsdaten außer Haus und ein AVV mehr für ein Non-Profit. Für ein Produkt, dessen Kern Vertrauen ist, das falsche Signal |
| **Hosting** | **EU-Region**, Anbieter mit AVV, Postgres im selben Verbund | Der Haushalt ist Verantwortlicher, Flatmate.io Auftragsverarbeiter — die Kette muss lückenlos in der EU liegen | Nicht-EU-Hosting: Drittlandtransfer mit Zusatzaufwand, den ein Non-Profit nicht tragen will |
| **Auslieferung** | Docker-Image (App + Python-Solver), Postgres daneben | Ein Artefakt, reproduzierbar, Rücknahme über das vorherige Image | Serverless: **schließt den Solver-Kindprozess aus** (ADR-005) und macht dauerhafte Verbindungen mit `SET LOCAL` unangenehm |

### Entscheidung

Wie oben. Zwei Punkte sind keine Vorlieben, sondern **Folgen anderer Records** und daher nicht
einzeln verhandelbar, ohne diese mitzuverhandeln:

- **Postgres** folgt aus ADR-004 (ohne RLS kein zweiter Zaun).
- **Kein Serverless** folgt aus ADR-005 (ohne Kindprozess kein lokaler Solver).

### Konsequenzen

**Positiv**

- Eine Codebasis, ein Typsystem, ein Deployable, eine Migrationskette.
- Autorisierung serverseitig, ohne Client-Vertrauen.
- Keine personenbezogenen Daten bei Dritten außer beim Hoster.

**Negativ**

- **Self-hosted Auth heißt selbst verantwortlich**: Passwort-Zurücksetzen, Ratenbegrenzung,
  Sitzungsinvalidierung, Argon2id-Parameter, Brute-Force-Schutz. Alles gelöste Probleme, aber
  Arbeit — und Stellen, an denen ein AI-Agent plausibel aussehende Fehler baut.
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
> angepasst ist) oder wenn self-hosted Auth mehr Zeit kostet als die gesamte Casting-Pipeline.

**Status: Bestätigt — verbindlich für v0.1**

> **Bestätigt am 2026-09-09** (Samuel Zink) — verbindlich für v0.1.
> · **Aufgabebedingung:** Das gibt man auf, wenn die Betriebskosten das Spendenmodell übersteigen
> (dann: Solver als separater, bedarfsgestarteter Dienst und die App serverless — aber erst, wenn
> ADR-005 entsprechend angepasst ist) oder wenn self-hosted Auth mehr Zeit kostet als die gesamte
> Casting-Pipeline.
> · **Was ein späterer Widerspruch kostet:** Praktisch die gesamte Codebasis. Dies ist der teuerste
> Record dieser Liste, und der einzige, dessen Widerspruch zugleich ADR-005 mitnimmt
> · Status wechselt auf `Angenommen`, sobald im Code umgesetzt und überprüft.
