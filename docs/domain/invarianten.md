> **Quelle:** `../04-Domaenenmodell.md` §5 (Stand V0.4, eingefroren 2026-09-09)
> **Enthält:** V-1 … V-4 samt den RLS-Policies aus §5.5
> **Schema-Autorität:** Diese Datei. Weicht ein Bezeichner anderswo ab, gilt der hier.

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
