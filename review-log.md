# Review-Log — Requirements Flatmate.io

## Durchgang 1 — 2026-08-19

**Geprüfter Stand:** `01` V0.2 · `02` V0.4 · `03` V0.5 · `04` V0.3 · `05` V0.5 · `06` V0.6 ·
`GUARDRAILS.md` V0.6 — zusammen ~8700 Zeilen in neun Dateien. Entstanden aus fünf Fragerunden
(Ergebnis: `00-Session-Brief.md`) und vier Querprüfungsrunden mit drei parallel arbeitenden
Sub-Chats.

> **Zum Zustand dieser Zeile.** Sie stand bis zuletzt auf „SRD V0.1, PRD V0.1, ~7960 Zeilen",
> während weiter unten die Lehre notiert war, dass Versionszeilen nicht mitwandern. Damit ist der
> Defekt dreimal aufgetreten — in `01`, in `03` und hier — und das dritte Mal in dem Dokument, das
> ihn beschreibt. Behoben, aber stehengelassen als Beleg: **die Regel „Versionszeile mitziehen" ist
> genau die Sorte Zusicherung, die ohne Mechanismus nicht hält**, und sie ist damit ein viertes
> Beispiel für den Befund weiter unten.

### Maschinell geprüft

Alle Befunde per `grep` gegen die Dateien, nicht aus den Selbstauskünften der Sub-Chats übernommen.
Die Spalte „Nachlauf" hält fest, was die Querprüfung geschlossen hat.

| Prüfung | Erstbefund | Nachlauf |
|---|---|---|
| Alle SRD-Scope-Zeilen im PRD referenziert | ✅ 37 von 37 | ✅ **41 von 41.** Der PRD-Chat hat S-38 bis S-41 für die vier Nachträge selbst angelegt, weil die Kette sonst genau daran gerissen wäre — nicht beauftragt. Akzeptanzkriterien von 149 auf 210 |
| **PWA gegen Löschkonzept** | ❌ Erst in der dritten Runde aufgefallen, beim Prüfen von § 25 TDDDG: **eine PWA, die Bewerberdaten offline vorhält, legt personenbezogene Daten auf die Geräte der Bewohnenden — außerhalb der Reichweite der 180-Tage-Löschautomatik.** ADR-011 hätte das Löschkonzept unterlaufen, ohne dass es irgendwo auffällt | ✅ Entschieden: der Service Worker cacht ausschließlich die App-Hülle, niemals Bewerber- oder Beratungsdaten. Offline heißt „die App startet ohne Netz", nicht „die Daten sind ohne Netz da". Als Bedingung in ADR-011, als Grenze des Löschkonzepts in `06` §5, als Guardrail |
| **Gegendarstellung mit eigener Frist** | ❌ `subject_statement` unter derselben 180-Tage-Regel ist richtig, aber ein *eigener* Zeitgeber hätte ein Fenster geöffnet, in dem „Ich widerspreche der Aussage, ich sei unpünktlich gewesen" ohne die Aussage dasteht — und damit den Inhalt der gelöschten Beurteilung **rekonstruierbar** macht | ✅ Kein eigener Zeitgeber, erbt die Frist der `Application`, Löschung in derselben Transaktion |
| Offline-Puffer für Stimmen gegen die Service-Worker-Grenze | ❌ Folgekollision der Service-Worker-Entscheidung: das PRD hatte einen Offline-Puffer für abgegebene Stimmen, der per Definition ⚫-Daten aufs Gerät legt. Die zunächst angebotene Begründung („kein fremdes Datum betroffen") war **falsch** — ein `Vote` ist `application_id` plus Wert und damit eine Beurteilung über eine dritte Person | ✅ Ausnahme bleibt, Begründung ersetzt: **unabgeschlossene Transaktion, keine gespeicherte Kopie** (§ 25 Abs. 2 Nr. 2 TDDDG deckt das stärker als App-Hüllen-Caching). Tragend ist die **harte Höchstlebensdauer unabhängig vom Versanderfolg** — ohne sie trägt ein Gerät, das Monate später zurückkommt, eine Beurteilung über eine längst gelöschte Bewerbung, also dasselbe Leck durch die Hintertür. Dazu: keine Anzeigedaten im Puffer, Verwerfen statt Wiederholen, Leeren bei Abmeldung |
| Divergenz in der **umgekehrten** Richtung | ❌ Im dritten Durchgang führte `06` drei Felder ein, die `04` nicht kannte (`Household.contact_email`, `privacy_notice_state`, `privacy_notice_published_*`) | ✅ an `04` weitergegeben. Lehre siehe Retrospektive |
| Alle zwölf ADR-Nummern in den Fachdokumenten referenziert | ✅ vollständig. ADR-006 fehlt im SRD — korrekt, das SRD bleibt lösungsneutral | — |
| 17 verbindliche Entitätsnamen unverändert | ✅ keine Abwandlung | — |
| P-1…P-5 namentlich referenziert, nicht umformuliert | ✅ in allen sechs Fachdokumenten | — |
| **Feldnamen** einheitlich | ❌ ~17 Divergenzen zwischen `04` und `06` (`applicant_name`/`display_name`, `state`/`status`, `retention_until`/`deletion_due_at`, `can_vote`/`is_eligible_to_vote`, `actor_profile_id`/`acting_profile_id` …) | ✅ angeglichen, `04` ist Schema-Autorität. **Restposten:** `moved_out_at` gegen `moved_out_on` — beim Umbenennen durchgerutscht, nachgemeldet |
| ADR-003 in `GUARDRAILS.md` referenziert | ❌ null Treffer — die Ereignis-Log-Regeln standen als Architektur- und Rechtsaussage da, aber nicht als prüfbare Zusicherung | ✅ G-D7 bis G-D10 nachgetragen (kein Wert im Payload, Redaktion zum Fristende, `became_resident_id` nie `null`, Pool-Wiederverwendungstest) |
| Vier fehlende Modellbestandteile | ❌ `collected_from`, `AvailabilityToken`, `subject_statement`, `PasskeyCredential` fehlten im Domänenmodell | ✅ alle vier modelliert |
| **Klassen-Notation** zwischen `04` und `06` abbildbar | ❌ `04` klassifiziert 🔴/🟠/⚫/⚙️, `06` nach Verarbeitungszweck (`META`/`KONFIG`). Substanziell deckungsgleich, aber die Gegenprobe „jedes 🔴/🟠/⚫-Feld hat eine Zeile" ist ohne Abbildungstabelle nicht mehr maschinell prüfbar | ✅ `06` §6.0 als Brücke nachgetragen |
| Überprüfbare Negativaussage stichprobenartig gegengeprüft | ✅ Behauptung „Quorum-Schwelle kommt in `06` und `GUARDRAILS.md` nicht vor" trifft zu (0 Treffer) | — |
| Datenschutzseite je Haushalt: erzeugt **und** freigegeben? | ❌ „von Flatmate.io erzeugt, im Namen des Haushalts veröffentlicht" wäre eine rechtliche Erklärung im Namen eines Dritten — als Auftragsverarbeiter darf man sie vorbereiten, freigeben muss der Verantwortliche | ✅ `06` §4.5 um `draft` → `published` als ausdrückliche Handlung erweitert, plus Guardrail G-C9 |
| Zwei rechtliche TBDs, die keine sein mussten | ❌ Zuständige Aufsichtsbehörde und Postanschrift des `Household` standen als offen, hätten aber eine Ortsangabe erzwungen, die es nicht gibt | ✅ `06` §4.6: Art. 13 Abs. 2 lit. d verlangt nur das *Bestehen* des Beschwerderechts, nicht die Benennung der Behörde; und die Haushalts-E-Mail ist die verhältnismäßige Kontaktangabe — eine WG, die Bewerbenden ihre Postanschrift offenlegt, erzeugt das Gegenteil dessen, was die Pflicht bezweckt |

---

### Multi-Rollen-Review

**🎯 Produkt**

| Prüfpunkt | Befund |
|-----------|--------|
| Problem klar? | ✅ Belegkette „Ist-Prozess in 13 Schritten" mit Spalte „was kaputt geht", verdichtet auf sechs Aufgabenarten; jeder Schritt im PRD-Hauptfluss zugeordnet |
| Kennzahlen messbar? | ✅ Beteiligungsquote > 80 % als Kern, sechs Beobachtungs- und sieben Zweitordnungsmetriken |
| Scope abgegrenzt? | ✅ 37 einzeln zitierbare In/Out-Zeilen plus Phasenschnitt v1 / v1.1 / v1.2 / v2 |
| Wettbewerb belegt? | ✅ `besichtigungstermine.com` als reale Teilüberlappung benannt, WhatsApp als eigentlicher Wettbewerber, Ashby/Greenhouse als Benchmark, Roomi/Badi ausdrücklich als falsche Analogie |
| Regulatorik im Produktrisiko verankert? | ✅ Der Art.-15-Posten steht als **erster** Eintrag in SRD §7, nicht als Fußnote |
| **Lücke** | 🔴 **Keine Aufwandsschätzung, nirgends.** Der v1-Scope wurde festgelegt, ohne dass die verfügbare Zeit je zur Sprache kam — bei Zustandsmaschine, doppelter Autorisierung, CP-SAT-Solver, PWA und Löschautomatik ist das die größte offene Produktfrage. Siehe Retrospektive |
| **Lücke** | ⚠️ Baseline-Erhebung (SRD O-07) noch nicht durchgeführt; sie muss **vor** dem Ersteinsatz im Testhaushalt stattfinden, sonst ist der Vorher/Nachher-Vergleich verloren |
| **Lücke** | ⚠️ Das Geschäftsmodell (Spenden, Vermieter-Freemium ab v2) ist eine Haltung, keine Rechnung. Hostingkosten pro Haushalt sind nirgends geschätzt |

**🎨 Design**

| Prüfpunkt | Befund |
|-----------|--------|
| Szenarien konkret genug? | ✅ 23-Schritt-Hauptfluss mit Ist-Schritt-Zuordnung, Datenübergabe und sechs Nebenflüssen |
| Nutzergruppen differenziert? | ✅ fünf Gruppen mit Rechtematrix und Wechsel-/Herabstufungslogik |
| Akzeptanzkriterien prüfbar? | ✅ 210 Checkboxen, insbesondere für die Sichtbarkeitsinvariante |
| Inhaltsregeln für Freitext? | ✅ C-1…C-8 plus vier konkrete Notiz-Prompts **und** eine Negativliste („Wie war der Gesamteindruck?", Sterne, Persönlichkeitsmerkmale) |
| **Lücke** | ⚠️ **Kein Screen-Inventar** — bewusst abgewählt. Folge: Leer-, Lade- und Fehlerzustände existieren nur als nichtfunktionale Anforderung, nicht je Screen; visuelle Sprache ist undefiniert |
| **Lücke** | 🔴 Der **Feinschliff-Screen** ist die einzige wirklich neue Interaktion des Produkts und hat keine Gestaltungsspezifikation. Genau an ihm hängt, ob das Budget als Hilfe oder als Gängelung erlebt wird — der Einwand, der die vierstufige Skala überhaupt erzeugt hat |
| **Lücke** | ⚠️ Onboarding beim allerersten Beitritt nicht beschrieben, obwohl Aktivierungsfriktion als Hauptrisiko benannt ist |

**🔧 Engineering**

| Prüfpunkt | Befund |
|-----------|--------|
| Datenmodell klar? | ✅ 20 Entitäten (17 aus dem Bezeichner-Kontrakt, drei — `Session`, `AvailabilityToken`, `PasskeyCredential` — ausdrücklich als Erweiterung *außerhalb* des Kontrakts markiert, damit ihre Namen beim Aufsetzen der Module noch änderbar sind), drei Zustandsmaschinen, I-1…I-10 als Invarianten, **52 personenbezogene Felder in 16 der 20 Entitäten** klassifiziert (10 ⚫ · 14 🔴 · 28 🟠). Ohne Inventarzeile bleiben nur `HouseholdSettings`, `CastingRound`, `RoundParticipation`, `Slot` |
| Klassifizierung belastbar? | 🟡 Die Summe musste **zweimal** nachgezogen werden: V0.1 war falsch gerechnet (33 statt 35), dann 50 → 52 durch die Nachträge. Beide Male vom Sub-Chat selbst gemeldet. Der Schluss daraus ist der eigentliche Befund: **die Feldtabellen sind maßgeblich, nicht die Summe** — und dass ein sorgfältig geschriebenes Dokument seine eigene Summe zweimal nachziehen musste, ist das stärkste Argument für ADR-010, das diese Session produziert hat. Belegt statt behauptet: ein Datenbestandsverzeichnis muss ein CI-Gate sein, weil eine Zahl in einem Dokument verlässlich veraltet |
| Sichtbarkeitsregeln implementierbar? | ✅ V-1…V-4 als Prädikate, mit Arbeitsteilung: V-1/V-2/V-3 zusätzlich als RLS, **V-4 ausdrücklich nicht** (eine Zeilen-Policy auf `votes` würde dem Aufrufer den Mittelwert verfälschen) |
| Nichtfunktionale Anforderungen? | 🟡 vorhanden, aber die Zielwerte sind gesetzt, nicht abgeleitet (< 1,5 s Rundenkopf, < 10 s Solver-Abbruch, 200 Haushalte / 30 000 Bewerbungen) |
| Technische Risiken? | ✅ Solver-Determinismus, Solver-Ausfall, Invarianten-Leckpfade, AI-Implementierung — jeweils mit Gegenmaßnahme |
| Guardrails durchsetzbar? | ✅ 64 Regeln auf 61 Positionen in 13 Klassen (44 🟢, 5 🟡, 7 gemischt, 5 🔴), jede mit Durchsetzungsklasse **und einer Bilanztabelle, die die fünf rein prosaischen Positionen namentlich als Grenze des Dokuments ausweist** |
| Subtilster technischer Fund? | ✅ **G-C8** — `SET LOCAL` nur innerhalb einer Transaktion. Sonst haftet der Wert an der *Verbindung* statt an der Transaktion: Anfrage B erbt den Haushaltskontext von A, RLS arbeitet dann völlig korrekt mit dem falschen Haushalt, und bei einer einzigen Testverbindung fällt es nie auf. Ein Leck **durch** die Sicherheitsmaßnahme hindurch. Erst durch G-D10 (Pool-Wiederverwendungstest) überhaupt durchsetzbar |
| Vier Folgefunde aus V0.2 | ✅ Beim Modellieren der drei Nachtragsentitäten fielen vier Regeln an, die vorher niemand formuliert hatte: **`Session.acting_profile_id` darf nur auf ein Profil mit gültiger `Membership` desselben Accounts zeigen** — ohne die Prüfung ist der Profilwechsel eine Rechteausweitung; **die Seite hinter dem `AvailabilityToken` zeigt nur Zeitraster und Art.-13-Hinweis, keinen Namen** — wer den Link abfängt, sieht ein leeres Raster; **`subject_statement` ist 🔴 und ausdrücklich *nicht* V-1-geschützt**, weil es die Aussage der betroffenen Person über sich selbst ist und sie ihre eigene Gegendarstellung lesen darf; **das Löschen des letzten Passkeys entzieht nie den Zugang** — sonst kippt ADR-007 vom Aufsatz in eine Abhängigkeit und verletzt genau das P-2, das er schützen soll |
| Benannte Kehrseite von ADR-010 | ✅ Ehrlich mitgeschrieben statt verschwiegen: **vier Verbraucher aus einer Quelle heißt, ein Generierungsfehler wirkt an vier Stellen gleichzeitig.** Eine falsch als ⚙️ deklarierte Spalte fehlt dann nicht nur im Verzeichnis, sondern auch in Log-Redaktion, Fehler-Tracker-Filter, Auskunftsexport und Löschung |
| **Lücke** | ⚠️ Kein Teststrategie-Kapitel. Die sechs geschützten Tests (G-D1…G-D6, in V0.2 auf zehn erweitert) decken die Invarianten, aber nicht die Frage, was sonst getestet wird und wie |
| **Lücke** | ⚠️ Sicherung und Wiederherstellung (RPO/RTO) offen, hängt an ADR-006. Bei einem Werkzeug mit Löschautomatik ist ein Backup, das die Frist überlebt, zugleich ein Compliance-Problem — dieser Zusammenhang ist nirgends ausgeschrieben |
| **Lücke** | ⚠️ Der Python-Kindprozess aus ADR-005 hat keine Paketierungs- und Auslieferungsskizze über die Entscheidung hinaus |

---

### Retrospektive

**Dünnste Abschnitte und warum**

1. **Aufwandsschätzung** — existiert nicht. Echte Lücke, nicht bewusste Auslassung. Siehe unten.
2. **Design-Perspektive** — dünn, weil das Screen-Inventar abgewählt wurde. Bewusste Entscheidung
   des Autors; die Folge (Feinschliff-Screen ohne Spezifikation) ist trotzdem real.
3. **SRD §3.3 Markenwirkung** — TBD. Für ein spendenfinanziertes Vorhaben ohne Marktziel gibt es
   dazu ehrlicherweise nichts zu sagen.
4. **SRD §8.2 A/B-Testing** — begründetes TBD, und die Begründung wurde im Schreiben besser als
   meine: nicht nur „kein Traffic", sondern fachlich — eine Aufteilung *innerhalb* eines Haushalts
   beschädigt das Verfahren, statt es zu messen.
5. **Rechtliche Abschnitte** — 14 offene Fragen, vier davon launch-blockierend. Dünn von Natur aus,
   korrekt als solche markiert und nicht weggeschrieben. Q-4 (Art.-9-Daten im Freitext ohne
   tragfähige Rechtsgrundlage) ist der ehrlichste Abschnitt der ganzen Dokumentation.

**Welche Fragen hätten früher gestellt werden sollen**

| Was zu spät kam | Wirkung | Lehre |
|-----------------|---------|-------|
| **Das Zeitbudget wurde nie erfragt** | Der v1-Scope steht ohne jede Aufwandsgegenprobe. Zustandsmaschine plus doppelte Autorisierung plus CP-SAT plus PWA plus Löschautomatik ist für ein Solo-Vorhaben viel | Genau diese Lehre steht schon im Review-Log von Notella: *„Bei Solo-Vorhaben gehört ‚wie viel Zeit hast du wirklich?' in die erste Fragerunde."* Sie wurde nicht angewendet. **Ein Review-Log, das nicht vor der nächsten Session gelesen wird, ist Dekoration** |
| Der Bezeichner-Kontrakt fixierte **Entitäten, nicht Felder** | ~17 Feldnamen liefen in paralleler Arbeit auseinander; eine Korrekturrunde. Und die Divergenz kam in der **dritten** Runde erneut, nur umgekehrt: `06` führte drei `Household`-Felder ein, die `04` nicht kannte | Beim Parallelisieren muss der Kontrakt so tief sein wie die Kopplung — Entitätsnamen koppeln nicht, Felder tun es. Die Wiederholung zeigt aber die eigentliche Lehre: **es genügt nicht, eine Autorität zu benennen; es braucht einen Weg, auf dem eine Neuanlage sie erreicht.** Sonst erzeugt jede Runde neue Divergenz in der Richtung, aus der gerade geschrieben wird |
| Die Wechselwirkung PWA gegen Löschautomatik wurde nie gestellt | Zwei Entscheidungen des Briefs (ADR-011 und die 180-Tage-Frist) widersprachen sich, und es fiel erst in der dritten Querprüfungsrunde beim Prüfen einer *dritten* Norm auf | Nach jeder Entscheidung fragen: *welche andere Entscheidung berührt sie?* Zwei je einzeln richtige Festlegungen können zusammen falsch sein — und genau diese Paare stehen in keiner Checkliste |
| Die Phasentabelle des Briefs widersprach dem Entscheidungsteil (Verfügbarkeits-Link v1 gegen v1.1) | Fiel erst auf, als ein Sub-Chat den Token modellieren musste | Eine Phasentabelle darf nicht *neben* der Entscheidungsliste geschrieben werden, sondern muss aus ihr abgeleitet und gegengeprüft werden |
| Der Quorum-Standardwert wurde nie entschieden | Drei Chats mussten ihn erfinden; einer fand eine bessere Begründung als ich (eine leere Rangliste demotiviert genau die Beteiligung, die sie voraussetzt) | Nach jeder Entscheidung fragen: *welche Parameter impliziert sie?* Ein Verfahren ohne Schwellenwert ist keine Entscheidung |
| Art. 14 wurde behauptet, bevor er geprüft war | Eine alarmistische Fehldarstellung — Scraping-Panik plus die Aussage, die Informationspflicht treffe die Plattform. Für Auftragsverarbeiter gilt Art. 14 gar nicht, und im Regelfall greift Art. 13 | Rechtsaussagen **vor** der Behauptung verifizieren, nicht nach dem Widerspruch. Die Rückfrage des Autors hat hier einen Fehler in meiner Analyse gefunden |
| V-1 wurde als „harte, testbare Invariante" verkauft | Sie ist prosaisch weich: `became_resident_id` wird **manuell** gesetzt, und eine Person mit zwei Bewerbungen leckt über die alte. Drei Chats fanden das unabhängig | Wenn ich eine Invariante als hart bezeichne, muss die Anschlussfrage lauten: *wer setzt das Feld, und was passiert, wenn es niemand tut?* |

**Zur Methode: drei parallele Sub-Chats mit gemeinsamem Vertrag**

Das war die Neuheit dieser Session, und sie hat sich gerechnet — aber nicht aus dem Grund, den ich
erwartet hatte. Der Gewinn war nicht die Geschwindigkeit, sondern die **redundante Lesung**: drei
Chats lasen denselben Brief mit unterschiedlicher Fachbrille und fanden drei Dinge, die der Brief
nicht hatte.

- Der **Compliance-Blick** entdeckte, dass die Art.-13/14-Achse im Domänenmodell gar nicht
  darstellbar war: `Application.source` ist der technische Pfad, nicht die Erhebungsquelle.
- Der **Modell-Blick** entdeckte, dass das append-only Ereignis-Log ein bequemer Umweg um die
  Selbst-Redaktion ist, wenn Payloads Werte statt Referenzen tragen — ein Sicherheitsleck, kein
  Compliance-Punkt. Und er fand die V-1-Verknüpfungslücke.
- Der **PRD-Blick** entdeckte, dass eine Veto-Begründung ihre Urheberin verrät, Art. 15 Abs. 4
  also nicht schützt, was er zu schützen scheint.

Kosten der Methode: die ~17 Feldnamen-Divergenzen, und zwei Chats meldeten fertig, **bevor** meine
Nachtragsnachrichten bei ihnen ankamen — Nachrichten kreuzten sich, weil ich die Querprüfung erst
nach der ersten Rückmeldung startete. Lehre: bei parallelen Agenten die Querprüfung beginnen,
sobald die **ersten** Artefakte auf der Platte liegen, nicht wenn der erste Bericht eintrifft.

**Der eigentliche Grund, warum sich die Parallelität gerechnet hat**, ist aber ein anderer als
„drei Blickwinkel" — und die schärfste Fassung dazu kam am Ende vom Compliance-Chat selbst:

> Die wertvollsten Funde waren nicht die Regeln, die beim ersten Schreiben getroffen wurden,
> sondern die vier Stellen, an denen die Querprüfung etwas fand, das in **keinem** Einzeldokument
> falsch war: die ADR-003-Lücke, der `SET LOCAL`-Fall, die Wechselwirkung zwischen
> `subject_statement` und ihrer Bezugsaussage, und der Service Worker gegen das Löschkonzept.
> **Alle vier lagen *zwischen* zwei richtigen Entscheidungen.**

Das ist ein Argument für parallele Bearbeitung *mit* Querprüfung und gegen ein einzelnes, in sich
konsistentes Dokument: ein kohärenter Text kann diese Fehlerklasse nicht enthalten — und deshalb
auch nicht sichtbar machen. Erst wenn zwei je richtige Festlegungen in getrennten Dateien stehen und
jemand beide gleichzeitig liest, fällt der Widerspruch auf. Redundanz war nicht der Preis der
Methode, sondern ihr Wirkmechanismus.

Konsequent dazu die einzige nicht erzwingbare Regel, die trotzdem in `GUARDRAILS.md` aufgenommen
wurde: **„Was passiert damit beim Profilwechsel?"** — als 🔴 gekennzeichnete Prüffrage für jede neue
zustandsbehaftete Komponente, begründet damit, dass genau diese Frage zwei reale Lecks gefunden hat
(V-1 am Account statt am Profil, Leeren des Stimmpuffers beim Wechsel), beide durch Querprüfung und
keines durch einen Mechanismus. Eine Frage in einem Regelwerk zu dokumentieren ist unüblich; hier
ist es richtig, weil ihre Trefferquote belegt ist.

**Was gut lief**

- **Der Widerspruch war produktiv, in beide Richtungen.** Vier Vorschläge des Autors haben meine
  geschlagen: die vierstufige Skala („Unbedingt" *ist* das Favoriten-Signal und spart den zweiten
  Screening-Durchlauf), der Haushalts-Account als echtes Login mit Profilwechsel, CP-SAT statt
  Hungarian (parallele Castings mit Bewohner-Abdeckung sind gekoppelte Zuweisungen), und die
  Absage an Passkey-only. Vier Vorschläge der Sub-Chats ebenso: `quorum_share = 0.5`, V-1 am
  Account statt am aktiven Profil, zweiphasige Zielfunktion statt gewichteter Summe, feste
  Relaxationsreihenfolge.
- **Zwei Rechtsbehauptungen wurden auf Nachfrage geprüft, eine davon korrigiert.** Art. 15 hielt
  (BFH und BGH 2025, weite EuGH-Auslegung), Art. 14 nicht.
- **Die Unverbindlichkeit von `04` und `05` war die richtige Vorgabe.** Weil jeder ADR
  „Vorschlag — anfechtbar" trägt, wurden Aufgabebedingungen mitgeschrieben („das gibt man auf,
  wenn …") statt falscher Gewissheit.
- **Die S-Nummern haben die Querprüfung von Lesen auf `grep` reduziert.** Eigenentscheidung des
  PRD-Chats, nicht Vorgabe — und die nützlichste der Session.
- **Eine neue Gattung geschützter Test ist entstanden.** Der PRD-Chat hat für die S-40-Lücke einen
  Test formuliert, der eine **bekannte Grenze als erwartetes Verhalten dokumentiert** und
  ausdrücklich nicht so umgeschrieben werden darf, dass die Grenze verschwindet. Ein normaler
  geschützter Test sichert eine Zusicherung — dieser sichert ein *Eingeständnis*. Bei
  AI-geschriebenem Code ist genau das nötig, weil ein Agent eine dokumentierte Lücke sonst als Bug
  behandelt und „behebt", indem er den Test anpasst.
- **Zwei Begründungen der Sub-Chats waren besser als meine.** Gegen den automatischen
  Personenabgleich: *zwei verschiedene „Lea Müller" zu verschmelzen wäre schlimmer als die Lücke* —
  ein Falsch-Positiv zeigt Person A die Beurteilungen über Person B, also ein größeres Leck als
  das, das es schließen soll. Und G-C9 als **Typ** statt als Prüfung: ein
  `PublishedPrivacyNotice`, der nur aus einem freigegebenen Datensatz konstruierbar ist, ist der
  Unterschied zwischen einer Regel, die man befolgen muss, und einer, die man nicht brechen kann.
- **Die Sub-Chats haben gegen sich selbst gearbeitet, nicht nur für sich.** Einer fand und
  korrigierte seinen eigenen Zählfehler; einer schrieb die Kehrseite seiner eigenen Verschärfung
  mit; einer wies die Grenze seines eigenen geschützten Tests aus, mit dem Satz, dass ein Test,
  der eine Teilmenge prüft und Vollständigkeit suggeriert, schlimmer ist als kein Test. Das war
  nicht beauftragt.
- **Entschiedene offene Punkte behalten ihre Nummer.** `04` §10 ist in „in V0.2 entschieden" und
  „weiter offen" geteilt, statt erledigte Punkte zu löschen — Querverweise aus PRD, `06` und
  `GUARDRAILS.md` treffen weiter. Kleine Konvention, große Wirkung bei sechs Dokumenten, die sich
  gegenseitig zitieren.

**Das erste Dokument der Kette ist das wahrscheinlichste Einstiegs- *und* Veraltungsdokument**

`01-Problem-Framing.md` stand nach vier Revisionsrunden noch auf V0.1, und `03-PRD.md` ebenso —
Revisionen wandern nach unten, Versionszeilen nicht mit. Der eigentliche Fund war aber nicht die
Zahl: **die E-Tabelle in `01` liest sich wie das vollständige Entscheidungsverzeichnis des
Vorhabens, ist es aber nicht.** E-01…E-27 hält die Beschlüsse der Anforderungs-Session, während
fünf Festlegungen mit dem höchsten Compliance-Gewicht als S-38…S-41 im SRD entstanden sind:
Art.-13/14-Weiche, Absatzverwerfung im Erfassungsmoment, Zuordnung früherer Bewerbungen,
Gegendarstellung, Service-Worker-Grenze. Wer nur das Problem Framing liest — und das ist bei einem
Problem-Framing-Dokument der wahrscheinlichste Einstieg — hält den Stand für vollständig.

Gelöst wurde es richtig: ein Hinweis vor der Tabelle, der die Lücke ausspricht, die fünf Punkte
benennt, begründet warum sie nicht dort stehen (sie sind keine Beschlüsse der Session) und
weiterschickt. **Nicht** durch Nachtragen als E-28 ff. — das hätte die Tabelle als Sitzungsprotokoll
entwertet.

**Lehre:** Bei einer Dokumentenkette gehört in das *erste* Dokument ein Satz darüber, was es
**nicht** enthält. Vollständigkeit ist dort keine Eigenschaft, sondern eine Behauptung, die mit
jeder Revision weiter unten falscher wird.

**Der Profilwechsel ist zweimal die Stelle gewesen, an der Annahmen brechen**

Erst bei V-1: die Selbst-Redaktion musste am **Account** hängen und nicht am aktiven Profil, sonst
wäre der Wechsel der Umweg um die Invariante gewesen. Dann eine Schicht tiefer beim Sendepuffer:
meine vier Zusicherungen stellten auf Abmeldung und Sitzungsentzug ab — der Profilwechsel ist
keines von beidem, der Puffer überlebt ihn, und dann hält der Kontext von Profil B die Stimmen von
Profil A. Beide Male derselbe Fehlertyp, beide Male von einem Sub-Chat gefunden, nicht von mir.

**Warum es kein Zufall ist** — die Formulierung stammt vom ADR-Chat und ist die tragende:

> Der Profilwechsel ist der **einzige Vorgang im Produkt, der die handelnde Identität ändert, ohne
> die Sitzung zu beenden.** Jede Regel, die „pro angemeldeter Person" gedacht ist, gehört gegen ihn
> geprüft.

Bei V-1 war es **Lesezugriff**, beim Stimmpuffer **Schreibzugriff** — beide Male war die
naheliegende Annahme „eine Sitzung = eine Person", und beide Male lag die richtige Antwort auf der
weniger naheliegenden Seite. Der übertragbare Teil ist deshalb nicht „zweimal denselben Fehler
gefunden", sondern eine **benannte Prüffrage für alles, was danach kommt**: entsteht im Repo eine
dritte Regel, die pro Person denkt, ist der Profilwechsel der erste Test, nicht der letzte.

Dazu ein zweiter Befund derselben Runde, der die Kategorie einer Regel verschiebt: eine doppelt
eingespielte Stimme ist **kein Zählfehler, sondern ein falsches Datum über eine Person** — es
verschiebt Score und Quorum-Nenner, beides auskunftspflichtig, und die betroffene Person bekäme es
in einer Auskunft nach Art. 15 zu sehen. Damit wandert Idempotenz von „saubere Arithmetik" zu
Art. 5 Abs. 1 lit. d, mit einem Berichtigungsanspruch nach Art. 16 auf eine Stimme, die niemand
zweimal abgegeben hat.

**Das stärkste wiederkehrende Muster: Spezifikationsdichte ist nicht Durchsetzung**

Dreimal in vier Runden stand eine Regel ausführlich und mehrfach in den Spezifikationsdokumenten —
und fehlte in `GUARDRAILS.md`:

1. **ADR-003** (Ereignis-Log): null Referenzen in den Guardrails, obwohl die Payload-Regel in `04`
   und `06` je einen eigenen Block hatte.
2. **Die Pfad-Redaktion des Beitrittscodes** im Zugriffslog: musste zwischen zwei Chats
   weitergetragen werden, weil keiner Schreibrecht in der Datei des anderen hatte.
3. **Die Höchstlebensdauer des Stimmen-Puffers**: fünfmal in `03`, zweimal in `05`, einmal in `06` —
   nullmal als Regel. Und von den vier Zusicherungen der Puffer-Ausnahme ist genau diese die
   einzige, die sie überhaupt trägt.

Der dritte Fall ist der lehrreichste, weil er nicht aus Nachlässigkeit entstand: die Regel war
gründlich beschrieben, an drei Stellen, mit Begründung. Sie konnte trotzdem keinen Build brechen.

**Lehre:** Bei jeder Regel, die als Zusicherung formuliert ist, ist die Anschlussfrage nicht „steht
sie im Dokument?", sondern **„welche Datei bricht, wenn sie verletzt wird?"** Wo die Antwort „keine"
lautet, ist sie eine Absicht. Das ist genau die Unterscheidung, die die Durchsetzungsklassen
🟢/🟡/🔴 leisten sollen — sie greift aber nur für Regeln, die es überhaupt in die Datei geschafft
haben. Bei getrennten Schreibrechten braucht es dafür einen Weg, keinen guten Willen.

Der Compliance-Chat hat daraus den **Mechanismus** formuliert, und der ist der brauchbarere Teil:
*Prosa-Zusicherungen in Fachdokumenten brauchen **beim Entstehen** einen Guardrail-Verweis, sonst
entsteht die Lücke systematisch und wird nur zufällig gefunden.* Alle drei Fälle oben wurden durch
eine Querprüfung entdeckt, nicht durch einen Mechanismus — das ist Glück, nicht Prozess.

**Und eine Einschränkung meiner eigenen Prüfmethode**, die dabei sichtbar wurde: die Querprüfung
lief über `grep` nach Begriffen. Das prüft **Vokabular-Konsistenz, nicht semantische Anwesenheit.**
Wo das Vokabular selbst der Gegenstand ist — die 17 Feldnamen, die ADR-Nummern, die S-Zeilen —
trifft die Methode zuverlässig. Eine Regel, die unter einem anderen Wort steht, liest sie als
abwesend: die Höchstlebensdauer hieß im PRD zunächst „spätestens 7 Tage", war also vorhanden und
nur unter diesem einen Suchwort unsichtbar. Ich habe hier mit drei Synonymen gesucht und damit
Glück gehabt. Ein viertes Wort wäre durchgefallen. Wer so prüft, muss die tragenden Begriffe vorher
festlegen — dann ist es eine Prüfung und keine Stichprobe.

**Wo der Review-Durchgang bewusst endet**

Die dritte und vierte Querprüfungsrunde haben je einen echten Fund gebracht — die PWA gegen das
Löschkonzept, dann den Stimmen-Puffer gegen die eben beschlossene Service-Worker-Grenze. Beide
waren **Folgekollisionen**: jede geschlossene Lücke hat eine neue Berührung erzeugt. Das kann
prinzipiell weiterlaufen, und irgendwann korrigiert man Dokumente statt ein Produkt.

Der Durchgang endet hier, weil die verbleibenden Fragen nicht mehr durch Nachlesen entschieden
werden können, sondern durch Bauen: ob die Höchstlebensdauer des Puffers sieben Tage oder einer
ist, ob das Zeitbudget des Solvers reicht, ob der Feinschliff-Screen als Hilfe erlebt wird. Das
sind Fragen an einen Prototyp, nicht an eine Spezifikation. Die offenen Punkte sind numeriert und
auffindbar — O-1 bis O-11 in `04`, O-01 bis O-08 in `02`, Q-1 bis Q-14 in `06` — und das ist die
richtige Form, in der sie auf die Implementierung warten.

**Der übertragbare Teil: drei Bauformen gegen eine Fehlerklasse**

Vorschlag des PRD-Chats, und der beste Kandidat für etwas, das über dieses Projekt hinaus taugt.
Aus vier Runden Gegenprüfung sind drei Dokumentationsbauformen entstanden, die in keiner Vorlage
stehen und alle gegen **dieselbe** Fehlerklasse gerichtet sind: eine Regel, die **formal erfüllt
ist und ihren Zweck verfehlt**.

| Bauform | Beispiel | Wogegen sie schützt |
|---|---|---|
| **Test, der eine bekannte Grenze als erwartetes Verhalten festschreibt** — und ausdrücklich nicht so umgeschrieben werden darf, dass die Grenze verschwindet | S-40 / G-D1: V-1 schützt nur *verknüpfte* Bewerbungen | Ein Agent behandelt eine dokumentierte Lücke als Bug und „behebt" sie, indem er den Test anpasst. Ein normaler geschützter Test sichert eine Zusicherung — dieser sichert ein **Eingeständnis** |
| **Dokumentierte verworfene Begründung für eine angenommene Entscheidung** | PRD §6.2 „Verworfene Begründung — bewusst dokumentiert, nicht gestrichen": *nicht* „kein fremdes Datum betroffen" | Nicht der Wiederaufbau des falschen Grunds, sondern die **Erweiterung per Analogie** daraus: wer das falsche Argument als tragend liest, hält als nächstes einen lokalen Notizentwurf für ebenso unproblematisch — und der ist es nicht. Ein ADR hält verworfene *Optionen*; das ist die Ebene darunter |
| **Zusicherung an einen Ankerpunkt gebunden statt an eine Erwartung** | Höchstlebensdauer des Puffers hängt an der **Entstehungszeit**, nicht am letzten Versandversuch | „7 Tage seit dem letzten Versuch" ist eine zulässige Lesart derselben Worte und verlängert sich bei jedem Aufwachen des Geräts beliebig weit. Meine Fassung war nicht falsch, sondern **unterspezifiziert** — und genau das ist die gefährlichere Sorte, weil sie sich richtig liest |

Die dritte Zeile ist auch die genauere Attribution: der PRD-Chat hat darauf bestanden, das als
*Präzisierung* zu führen und nicht als Fund, weil „unabhängig vom Versanderfolg" die Verlängerung
inhaltlich schon ausschließt und nur der Ankerpunkt fehlte. Ebenso hat er den Verdienst am
Puffer-Konflikt relativiert: wer eine fremde Regel in ein Dokument einarbeitet, das er selbst
geschrieben hat, stolpert zwangsläufig über den Widerspruch — bemerkenswert wäre gewesen, ihn zu
finden, ohne beide Zeilen nebeneinander zu sehen. Beide Korrekturen sind zutreffend und stehen
hier, weil ein Review-Log, das Beiträge großzügiger zuschreibt als sie waren, seinen Zweck verliert.

**Nächster Schritt**

Vor der ersten Zeile Code: Aufwandsgegenprobe des v1-Scope (die 🔴-Lücke oben), Baseline-Erhebung
im Testhaushalt (SRD O-07, danach nicht rekonstruierbar), und Klärung von Q-1 bis Q-4 aus
`06-Compliance-Anhang.md`.
