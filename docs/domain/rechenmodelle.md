> **Quelle:** `../04-Domaenenmodell.md` §8 (Stand V0.4, eingefroren 2026-09-09)
> **Schema-Autorität:** Diese Datei. Weicht ein Bezeichner anderswo ab, gilt der hier.

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

### 8.6 `phase_hint`

**Bisher unbeziffert — jetzt blockierend**, weil `phase_deadline_at` (§2.2) sich auf „die aktuelle
Rundenphase" beruft und diese Formel bis hierher nirgends stand (Konflikt 1 des Spec-Updates).
**Dieselbe Regel wie `07-Screen-Inventar.md` §3.1**, hier nur als Pseudocode statt in einfacher
Sprache — beide Fassungen sind bewusst dieselbe Regel in zwei Registern, keine zweite Formulierung.
Wer hier ändert, muss §3.1 dort mitziehen (und umgekehrt).

```text
MAIN_PATH_ORDER = [new, screened, invited, scheduled, interviewed, offer_made, moved_in]
// Seitenzustände (rejected_by_household, declined_by_applicant, withdrawn, archived) zählen nicht
// mit — sie sind Sackgassen, kein Fortschritt entlang der Runde.

function phase_hint(round) -> text
    live = [ a ∈ Application | a.round_id = round.id ∧ a.state ∈ MAIN_PATH_ORDER ]
    if |live| = 0:
        return "Warten auf Bewerbungen"

    furthest = argmax( a ∈ live, MAIN_PATH_ORDER.index_of(a.state) )   // am weitesten fortgeschrittene Bewerbung

    return case furthest.state:
        new, screened               -> "Abstimmung Runde 1"
        invited, scheduled          -> "Terminfindung"
        interviewed                 -> "Abstimmung Runde 2"
        offer_made, moved_in        -> "Zusage läuft"

function phase_distribution(round) -> { label: count }
    // dieselbe Bucket-Einteilung wie oben, aber über ALLE `live`, nicht nur die weiteste —
    // speist die Verteilungszeile darunter, z. B. "7 in Sichtung · 2 im Termin · 1 gecastet"
    group_and_count(live, by: bucket_of(a.state))
```

**Warum „am weitesten", nicht „wo die Masse liegt".** Verworfene Alternative: den Bucket zu zeigen,
in dem die meisten Bewerbungen stehen. Verworfen, weil die dringendste Entscheidung der Runde dann
unsichtbar würde, sobald sie nur eine einzige Bewerbung betrifft — bei 20 Bewerbungen, von denen
eine bei `offer_made` steht, ist „Zusage läuft" die richtige Anzeige, nicht „Abstimmung Runde 1"
nur weil die übrigen 19 dort stehen. Die Verteilungszeile fängt die dadurch entstehende Ungenauigkeit
auf, ohne die dringendste Phase zu verschweigen.

**Was diese Formel nicht ist: ein Tor.** Sie sperrt und verbirgt nichts — wer eine Bewerbung
weiterschieben will, kann das unabhängig davon, was `phase_hint` gerade anzeigt (unverändert
gegenüber der Begründung in §2.2, „warum der Rundenzustand absichtlich dünn ist").

### 8.7 CTA-Sortierung (Aufgabenpriorität)

**Bisher unbeziffert.** S-44, S-45, S-46 und S-48 setzen eine Sortierung nach Zeitdruck voraus,
ohne dass eine der Zeilen sie definiert — dieselbe Lücke wie bei `phase_hint`. **Ausformuliert in
`07-Screen-Inventar.md` §2.2** (Aufgabenkatalog T-1…T-6, Bildschirmtexte, in einfacher Sprache);
hier steht die formale Gegenstelle als Pseudocode — dieselbe Regel, nicht umformuliert. Wer hier
ändert, muss §2.2 dort mitziehen. Der Zweck dieser Fassung: alle vier Scope-Zeilen können dieselbe
Funktion zitieren, statt die Sortierung stillschweigend vorauszusetzen.

```text
function task_priority(task) -> sort key
    if task.due_at is not null:
        return (0, task.due_at)        // Gruppe 0: hat ein Datum — aufsteigend, nächstfällige zuerst
    else:
        return (1, task.fixed_rank)    // Gruppe 1: kein Datum — feste Reihenfolge als Fallback
```

**Zwei Dinge erzeugen ein `due_at`, sonst keine drei:**

1. **Eine harte Frist** — ein Datum, nach dem die Aufgabe nichts mehr nützt (Termin vorbei, Veto
   gesperrt, Einzug erfolgt).
2. **Andere hängen von mir ab** — solange ich nicht handle, kommt die Gruppe nicht weiter.

**Welche Felder dieses Modells `due_at` tatsächlich liefern:**

| Aufgabenart (Screen-Inventar) | Datenquelle in diesem Modell |
|---|---|
| Stimmen zu Einladung/Zusage | `CastingRound.phase_deadline_at` (§2.2, S-44) — nur, wenn gesetzt; sonst Gruppe 1 |
| Reaktion auf einen Terminvorschlag | `Slot.starts_at` (§2.4) |
| Casting-Notiz schreiben | ein fester Versatz nach `Appointment`-Abschluss (`interviewed`, §3.1) — Vorschlag: ein Tag |
| Verfügbarkeit eintragen | das Zeitfenster, in dem gecastet werden soll, sobald `Application.state = invited` vorliegt |

**Was diese Regel ausdrücklich nicht tut: blockieren.** Wie `phase_deadline_at` selbst (§2.2) und
das Quorum (S-13) verändert ein abgelaufenes `due_at` nur Sortierung und Anzeigetext, nie die
Verfügbarkeit einer Handlung.

**Was an dieser Regel ausdrücklich nicht teilnimmt: der PWA-Install-Hinweis.** `Notification.type =
'pwa_install_prompt_due'` (§2.5) hat kein `due_at` in diesem Sinne und läuft **nicht** durch
`task_priority` — siehe die Korrektur im Kasten dort (U-19). Er ist ein eigenes Element unterhalb
der sortierten Liste, nicht einer ihrer Einträge.

### 8.8 `ActivityEvent.audience_class`

Löst U-3/U-4 auf: „Seit deinem letzten Besuch" zeigt nur **Ergebnisse**, das vollständige Log liegt
im Activity Center.

```text
OUTCOME_EVENT_TYPES = {
    'appointment.confirmed',   // bestätigter Termin
    'application.offer_made',  // erteilte Zusage
    'application.moved_in',    // Einzugsdatum, "X zieht ein"
    'round.closed',            // Rundenschluss
    'membership.joined',       // neue Mitbewohnende
}

function audience_class(event) -> enum(outcome, process)
    return event.event_type ∈ OUTCOME_EVENT_TYPES  ?  outcome  :  process
```

| Klasse | Bedeutung | Ziel |
|---|---|---|
| `outcome` | steht für mich fest, habe ich nicht selbst ausgelöst | „Seit deinem letzten Besuch" auf dem Start, höchstens fünf Zeilen |
| `process` | alles Übrige — einzelne Statuswechsel, Codeausgaben, Notizanlagen | nur im Activity Center |

**Default ist `process`, nicht `outcome`.** Eine Allowlist statt einer Denylist, weil ein neuer
`event_type` sonst stillschweigend in „Seit deinem letzten Besuch" auftauchen würde — dieselbe
Fehlerrichtung, die bei `collected_from` (§2.2) schon einmal vermieden wurde: **ein Default darf
die Einordnung nicht im Verborgenen entscheiden.**

---
