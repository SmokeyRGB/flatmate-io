# SRD — Flatmate.io

### Solution Requirements Document · Casting-Prozess für WGs und Wohnprojekte

> **Version:** V0.5 — *Änderung ggü. V0.4, zwei Nachträge in einem Schritt, weil der erste bisher
> ohne Versionszeile blieb:*
> *(a) Nachgetragen aus dem Spec-Update vom 01.09.2026 (Commit `15e1fa0`), das fünf Scope-Zeilen,
> die Neufassung von **S-28/S-03** und die **§5.4**-Phasentabelle geändert hatte, ohne die
> Versionszeile mitzuziehen: neue Scope-Zeilen **S-42** (Einladungstoken `ApplicationInviteToken`,
> setzt `became_resident_id` automatisch), **S-43** (einmalige Spendenmail nach der 3.–4.
> abgeschlossenen Runde, löst O-05), **S-44** (weiche Rundenfrist `phase_deadline_at`), **S-45**
> (PWA-Install-Hinweis, zurückhaltender Resident-E-Mail-Pitch), **S-46** (Notiz-Erinnerung nach
> dem Casting); **S-28/S-03** neu gefasst auf das Kanalmodell Push → E-Mail (falls hinterlegt) →
> In-App und optionale E-Mail beim Beitritt.*
> *(b) UX-Schicht-Nachzug nach dem Plan „ich-habe-zahlreiche-anforderungen-quiet-dusk.md" (V5):
> neue Scope-Zeilen **S-47** (zweiter Durchlauf statt eigenem Feinschliff-Bildschirm — reine
> UI-Musterentscheidung, ergänzt **S-11**, das die Schwellenlogik weiterhin trägt), **S-48**
> (Aufgabenmodell mit Vorrangregel — die Regel selbst steht in `07-Screen-Inventar.md` §2), **S-49**
> (Einladungslink: Ablauf, Nutzungsgrenze, Warnhinweis — seit dem Wegfall der für Bewohnende
> sichtbaren Bewohnerliste **Voraussetzung, nicht Verbesserung**), **S-50** (Verwaltung ohne
> `ResidentProfile` erreicht keine Castings, zwei benannte Ausnahmen), **S-51** (Anwesenheit gilt
> als angenommen statt erfasst, inklusive des bisher nicht modellierten Absagefalls einzelner
> Personen) · **S-05** korrigiert: „für alle sichtbare Bewohnerliste" und „jedes Mitglied kann
> entfernen" entfallen (Bewohnerliste jetzt Verwaltung voll / Moderator lesend / Bewohnende ohne
> Zugriff, K-19/U-22) · **S-11** von „Feinschliff"-Screen auf „zweiter Durchlauf" umformuliert ·
> §6 um eine Beobachtungsmetrik zum Moderationsaufwand sowie eine Umformulierung ergänzt · §10 um
> zwei UI/UX-Prinzipien ergänzt.*
> V0.4 — *Änderung ggü. V0.3: Die Begründung der Sendepuffer-Ausnahme in **S-30**
> und §7 korrigiert — sie stand auf „kein fremdes Datum betroffen", was falsch ist: eine `Vote`
> ist `application_id` plus Wert und damit eine Beurteilung **über eine dritte Person**. Sie
> steht jetzt auf „unabgeschlossene Transaktion" (§ 25 TDDDG, ausdrücklich gewünschter Dienst)
> und ist an vier erzwungene Eigenschaften gebunden statt an eine Erwartung.*
> V0.3 — *Änderung ggü. V0.2: **S-30** um die Service-Worker-Grenze ergänzt
> (nur App-Hülle, niemals Bewerber- oder Beratungsdaten — ein Gerätecache liegt außerhalb der
> Reichweite der Löschautomatik) · **S-41** um die atomare Löschung ohne eigenen
> Aufbewahrungszeitgeber ergänzt · §7 um den Risikoposten „personenbezogene Daten auf
> Endgeräten" erweitert.*
> V0.2 — *Änderung ggü. V0.1: vier Scope-Zeilen **S-38 bis S-41** aus der
> Querprüfung mit `04-Domaenenmodell.md` und `06-Compliance-Anhang.md` aufgenommen
> (Art.-13/14-Weiche, Absatzverwerfung im Paste-Parser, Zuordnung früherer Bewerbungen,
> `subject_statement`) · **S-13** Quorum-Wortlaut auf „mindestens die Hälfte" korrigiert ·
> **S-17** Verfügbarkeits-Link als Datenmodell-in-v1 / Seite-in-v1.1 aufgelöst ·
> **S-20** Verhalten am Solver-Zeitlimit ergänzt · **S-32** Semantik bei Auszug während
> einer offenen Runde präzisiert · §5.4, §7 und §11 entsprechend nachgezogen.*
> V0.1: Erstfassung auf Basis `00-Session-Brief.md` und `01-Problem-Framing.md`
> **Datum:** 2026-09-02
> **Autor:** Samuel Zink (@SmokeyRGB)
> **Vorgänger:** `01-Problem-Framing.md`
> **Nachfolger:** `03-PRD.md` · `04-Domaenenmodell.md` → `05-ADRs.md` ·
> `06-Compliance-Anhang.md` → `GUARDRAILS.md` · `review-log.md`

> **Nummerierungshinweis.** Diese Kette folgt der logischen Reihenfolge
> **Problem Framing → SRD → PRD**: `01` → `02-SRD.md` → `03-PRD.md`. Das weicht bewusst von
> `Ideas/Notella/` ab (dort PRD `02`, SRD `03`). Das SRD schneidet Scope, Phasen, Metriken
> und Risiken; das PRD spezifiziert innerhalb dieses Schnitts.

> **Dieses Dokument bleibt lösungsneutral.** Es benennt **Eigenschaften**, die die Lösung
> haben muss — nicht Produkte, Bibliotheken oder Frameworks. Die Technologieentscheidungen
> liegen bewusst in **`05-ADRs.md`** (ADR-001 bis ADR-012) und sind dort ausdrücklich als
> *Vorschlag — anfechtbar* gekennzeichnet. Wo dieses Dokument eine technische Eigenschaft
> als Anforderung formuliert, verweist es auf den zuständigen ADR statt auf ein Produkt.

> **Sprachregelung.** Dokument deutsch, alle Bezeichner englisch (ADR-012). UI-Label für
> `Household` ist in v1 durchgängig **„WG"** (E-02).

---

## 1. Customer

**Primär (Beachhead): WGs und Wohnprojekte mit 5+ Bewohnenden.** Erst ab dieser Größe
werden gemeinsame Terminorganisation und regelmäßiger Bewohnerwechsel zur Last — und erst
dort finden Castings **mehrmals pro Jahr** statt (bei acht Personen und ~2 Jahren
Wohndauer ≈ vier Wechsel/Jahr).

**Nutzungsprofil — die härteste Randbedingung dieses Produkts:** ~5–10 Personen nutzen es
in **Schüben von ~2–3 Wochen**, danach monatelang nicht. Das Werkzeug wählt der Haushalt
dabei in der Regel informell: eine organisierende Person — selbst Bewohnende:r — schlägt es
vor, der Rest stimmt zumindest stillschweigend zu, bevor sich irgendwer registriert; nur im
Einzelfall entscheidet sie über den Kopf der WG hinweg. Das unterscheidet Bewohnende von
Bewerbenden, die zu keinem Zeitpunkt gefragt werden (`Application` in
`04-Domaenenmodell.md`) — aber eine informelle, beiläufige Zustimmung ist kein Investment in
die Nutzung. Das hat drei Konsequenzen, die durch das ganze Dokument tragen:

1. **Onboarding ist ein Feature, nicht ein Schritt.** Wer sich in Runde 1 nicht in unter
   einer Minute registriert, stimmt nie ab.
2. **Wiedereinstieg nach Monaten muss ohne Erinnerung funktionieren.** Kein Feature darf
   voraussetzen, dass jemand weiß, wie er beim letzten Mal funktionierte.
3. **Aktivierung lohnt sich einmal, nicht jedes Mal.** Bei vier Runden pro Jahr trägt ein
   einmal registrierter Haushalt über Jahre — das ist die Grundlage dafür, dass ein
   Spenden- oder späteres Freemium-Modell überhaupt plausibel ist.

**Sekundär (Roadmap, nicht v1-Positionierung): Vermietende**, die Nachmieterprozesse für
mehrere Wohnungen organisieren, während Bewohnende Präferenzen einbringen und die Castings
durchführen. Fällt architektonisch kostenlos heraus (`Household` ist gegenüber WG,
Wohnprojekt und Vermietungsobjekt neutral: Objekt registrieren, kein `ResidentProfile`
anlegen, Bewohnende treten per Code bei und stimmen ab). In v1 **nicht positioniert**, weil
dort AGG § 19 und der EU AI Act anders greifen — siehe §7 und `06-Compliance-Anhang.md`.

**Systemrollen (Details in `03-PRD.md` §4.0.1):** Haushalts-Account · Moderator ·
Bewohnender · ehemaliger Bewohnender · Bewerbender ohne Konto. Die Rollen entstehen nicht
aus einer Hierarchie, sondern aus orthogonalen `Membership`-Attributen (`is_resident`,
`role`) plus einzeln vergebbaren Berechtigungen.

**Betreiber-Kunde:** Der Betrieb liegt beim Vorhaben selbst (nicht self-hosted). Damit ist
der **Haushalt der Verantwortliche im Sinne der DSGVO und Flatmate.io der
Auftragsverarbeiter** — eine Rollenverteilung, die Produktanforderungen erzeugt (§9,
`06-Compliance-Anhang.md`), nicht nur Vertragsanforderungen.

---

## 2. Job to be Done

> Als WG oder Wohnprojekt **gemeinsam und nachvollziehbar entscheiden, wer einzieht** —
> ohne dass die Arbeit an einer Person hängen bleibt, ohne dass jemand außen vor bleibt,
> weil er gerade nicht im Chat war, und ohne dass am Ende jemand mitliest, der es nicht
> dürfte.

Der entscheidende Zusatz gegenüber jedem Terminwerkzeug und jedem Chat: **die Beteiligung
muss steigen, nicht nur die Organisationsarbeit sinken.** Ein Werkzeug, das der
moderierenden Person Arbeit spart, aber die übrigen sechs Bewohnenden weiter nicht
erreicht, hat den Job nicht erledigt — es hat ihn nur verlagert.

---

## 3. Benefit

### 3.1 Kundennutzen

| Nutzen | Konkret |
|--------|---------|
| Abstimmen kostet zwei Minuten statt einer Recherche | Karten-Screening mit vier Stufen (Nein / Eher nicht / Finde gut / Unbedingt); „Unbedingt" ist zugleich das Favoriten-Signal, ein zweiter Durchlauf entfällt (E-07) |
| Der Stand ist jederzeit sichtbar | „5 von 7 haben abgestimmt" am Bildschirm statt in 200 Chatnachrichten; Kandidaten unter Quorum getrennt unter „Warten auf Stimmen (3 von 7)" (E-10) |
| Abwesenheit schließt niemanden aus | `CastingNote`s und `ActivityEvent`-Feed beantworten „was ist passiert, während ich weg war" auf einem Bildschirm — adressiert Schritt 8 der Belegkette |
| Unverzerrte Meinungsbildung | Ergebnisse bleiben bis zur eigenen Stimmabgabe verdeckt (Standard an) — schützt vor Anker- und Bandwagon-Effekt und ist gleichzeitig der Beteiligungsanreiz (E-09) |
| Ein starkes Nein ohne Blockade | `Veto` in Runde 2 rankt tief, löscht nicht; Begründungspflicht und Budget einstellbar (E-11) |
| Nachrechenbare Terminvorschläge | „Di 17:00 — 5/7 können"; bei Unlösbarkeit wird der Grund benannt, nicht eine Fehlermeldung gezeigt (P-3, E-17) |
| Niemand wird durch Kanal oder Gerät ausgeschlossen | Alles ist von Hand einpflegbar (P-1); Passwort als universelle Auth-Methode, installierbare PWA statt App-Store (P-2) |
| Man liest nie eine Beurteilung über sich selbst | Dauerhaft und unabhängig vom Rundenstatus, als Invariante statt als Einstellung (E-12) |
| Der Prozess ist umkehrbar | Rücktritt nach erteilter Zusage ist ein normaler Rückwärtsübergang, kein Datenchaos (P-4, E-20) |
| Dauerhaft kostenlos für Bewohnende | Non-Profit / spendenfinanziert; das Casten ist stressig genug (E-23) |

### 3.2 Geschäftsnutzen

Non-Profit-/spendenfinanziertes Vorhaben mit Portfolio-Charakter und späterer
Produktoption:

| Ziel | Messgröße |
|------|-----------|
| **Kernnachweis: Beteiligung steigt** | **Beteiligungsquote > 80 %** der stimmberechtigten Bewohnenden pro Runde (§6) |
| Fachlicher Nachweis | Eine vollständige Runde von der ersten `Application` bis `moved_in` läuft in einem echten Haushalt ohne Ausweichen nach WhatsApp |
| Aktivierungsnachweis | Anteil der Bewohnenden eines Haushalts, die ein `ResidentProfile` aktiviert haben |
| Compliance-by-Design als Artefakt | Löschautomatik, Datenauskunft pro `Application`, maschinenlesbares Datenbestandsverzeichnis als CI-Gate (ADR-010) — vorhanden und vorführbar, nicht als Rückstand |
| Vorzeigbarkeit | `05-ADRs.md` und `06-Compliance-Anhang.md` als dokumentierte Entscheidungs- und Rechtsgrundlage |
| Optionswert | Vermieter-Fall architektonisch offen, ohne v1-Aufwand. **Vermerk:** Genau auf dieser Ebene greifen AGG § 19 Abs. 5 und der EU AI Act — die zahlende Stufe finanziert die Compliance, die sie selbst auslöst |

### 3.3 Markenwirkung

Für v1 nur in einer Hinsicht relevant, aber dort entscheidend: **Vertrauen ist die
Eintrittskarte.** Das Produkt bittet fünf bis zehn Menschen, ihre Urteile über andere
Menschen in ein System zu schreiben, dessen Nutzung eine organisierende Person — selbst
Bewohnende:r — dem Haushalt vorgeschlagen hat und dem der Rest höchstens stillschweigend
zugestimmt hat: eine informelle, beiläufige Zustimmung, kein Investment in die Nutzung. Die
Positionierungsaussage lautet deshalb nicht „schneller casten", sondern:

> **„Das Werkzeug, das die WG entscheiden lässt — nicht die drei, die zufällig online
> waren."**

Zwei Eigenschaften tragen diese Aussage und dürfen daher nie als Nebensache kommuniziert
werden: die Sichtbarkeitsinvariante (E-12) und die Erklärbarkeit von Rangliste und
Terminvorschlag (P-3).

> ⚠️ TBD — Eine darüber hinausgehende Markenarbeit (Name, Wortmarke, visuelle Identität,
> Spendenkommunikation) ist vor dem Launch nicht sinnvoll zu spezifizieren und wird
> nachgezogen, sobald ein realer Haushalt eine Runde abgeschlossen hat.

---

## 4. Problem

Ausführlich in `01-Problem-Framing.md`, inklusive der 13 Ist-Prozessschritte als
Belegkette. Verdichtet:

| # | Problem | Beobachtbare Folge |
|---|---------|--------------------|
| PB-1 | Der Prozess hat 13 Schritte und kein Zuhause | Vier Werkzeuge, keines kennt den Zustand des Ganzen |
| PB-2 | Die Organisationsarbeit hängt an einer Person | Fällt sie aus, steht der Prozess |
| PB-3 | Beteiligung bricht ein, weil Mitmachen unbequem ist | Zwei bis drei Personen entscheiden für sieben |
| PB-4 | Abwesende können nicht mitentscheiden | Nach dem Casting fehlt der Hälfte die Grundlage |
| PB-5 | Offene Meinungsäußerung verzerrt das Ergebnis | Anker- und Bandwagon-Effekt; abweichende Meinungen bleiben unausgesprochen |
| PB-6 | Terminfindung ist ein Planungsproblem, das geraten wird | Termine platzen, Slots passen nicht, Absagen häufen sich |
| PB-7 | Neu Eingezogene sähen die Beratung über sich selbst | Im Nachrichtenstrom strukturell unlösbar |
| PB-8 | Ausgezogene behalten Zugriff | Aus einer Chatgruppe wird niemand zuverlässig entfernt |

**Drei Schmerzmomente:** (1) wenn die Bewerbungswelle eintrifft; (2) wenn abgestimmt werden
soll und man drei Tage nicht mitgelesen hat; (3) nach einem Casting, an dem man nicht
teilnehmen konnte.

---

## 5. Solution

### 5.1 Benchmark-Analyse

**Es gibt keinen direkten Wettbewerber für den Beratungs- und Entscheidungsteil.** Für
Anzeigenverwaltung und Terminbuchung existieren Werkzeuge; für die kollaborative
Bewertung von Bewerbenden in einer WG existiert keines. Alle Angaben recherchiert und
belegt am 2026-08-19 (Quellen in `00-Session-Brief.md` und `06-Compliance-Anhang.md`).

| Produkt | Was es gut kann | Deckt Schritte | Was fehlt (unsere Lücke) |
|---------|-----------------|----------------|--------------------------|
| **`besichtigungstermine.com`** — kostenlos, DE, wirbt explizit mit „WG-Casting" | Slot-Link, Buchung durch Bewerbende, Bestätigungen, Dashboard | 5–7 | Kein Voting, keine Pipeline, keine Notizen, keine zweite Runde. **Ist auf den Link angewiesen** — wer per WhatsApp anfragt, fällt heraus. Genau hier differenziert P-1 |
| **WG-Gesucht-Postfach** | Tags, Dokumentenversand, Verwaltung eingehender Anfragen | 1–3 | Nur für **eine** Person nutzbar — der Kern des Problems (PB-2) bleibt unberührt. **Keine offizielle öffentliche API**; es existieren nur inoffizielle Login-Clients und Scraper (→ Portal-Anbindung in v1 ausgeschlossen, E-15) |
| **Doodle / When2meet** | Verfügbarkeitsabfrage in einer Gruppe | 6 | Kennt keine Bewerbenden, keine Kandidaten-Constraints, keine Haushaltsregeln („erst ab 18:00", „max. 2 pro Tag"). Ein Doodle pro Bewerbenden skaliert nicht |
| **Notion / Trello / Excel** | Beliebig strukturierbar | theoretisch alle | Erfordert, dass eine Person das Modell baut und pflegt — verschärft PB-2. Kein Quorum, keine verdeckten Stimmen, keine Löschautomatik, keine Sichtbarkeitsinvariante |
| **Roomi / Badi (Matching-Plattformen)** | Bewerbende und Angebote zusammenbringen | 1–2 | **Falsche strukturelle Analogie.** Sie lösen *Matching*, nicht *Gremienentscheidung*. Es gibt keine Gruppe, die gemeinsam abstimmt |
| **Ashby / Greenhouse (ATS-Muster)** | Strukturierte Scorecards, verdeckte Stimmen bis zur eigenen Abgabe, Pipeline-Zustände, kollaborative Kandidatenbewertung | 2–4, 8–9 | **Der richtige Benchmark — aber für Unternehmen.** Preis, Komplexität, Rollenmodell und Sprache sind für eine 7er-WG unbrauchbar. Keine Terminfindung gegen Mitbewohner-Kalender, kein Zimmerbezug |
| **WhatsApp + Sprachnachricht** | Bereits installiert, null Registrierung, null Lernkosten, alle sind drin | alle, schlecht | Kein Zustand, kein Quorum, kein Nachlesen, keine Sichtbarkeitsgrenzen, keine Löschung. **Und trotzdem: der reale Wettbewerber** |

**Kernaussage der Benchmark — zwei Sätze, die den Rest des Dokuments bestimmen:**

> **Der reale Wettbewerber ist WhatsApp plus Sprachnachricht.** Nicht `besichtigungstermine.com`,
> nicht Doodle, nicht Notion. Jedes Feature konkurriert gegen ein Werkzeug mit null
> Einstiegskosten, das bereits auf jedem Gerät liegt und in dem alle Bewohnenden bereits
> sind. **Der Vergleich gilt für die Casting-bezogenen Vorgänge** — Bewerbungserfassung,
> Abstimmung, Terminfindung —, **nicht für die WG-Kommunikation insgesamt:** Flatmate.io
> tritt nicht an, WhatsApp als Kommunikationsmittel der WG zu ersetzen, sondern nur die
> Stellen, an denen WhatsApp heute den Casting-Prozess trägt.
>
> **Flatmate.io ist strukturell ein Mini-ATS für WGs.** Der Benchmark für kollaborative
> Kandidatenbewertung ist das Ashby/Greenhouse-Muster — strukturierte Bewertung, verdeckte
> Stimmen bis zur eigenen Abgabe, explizite Pipeline-Zustände — **nicht** Roomi/Badi.

Daraus folgen zwei asymmetrische Anforderungen:

- **Gegen WhatsApp gewinnt man nicht mit Funktionsumfang, sondern mit Einstiegskosten.**
  Ein-Schritt-Registrierung über einen Haushalts-Code, Passwort als universelle Methode,
  keine App-Store-Hürde (E-05, P-2, ADR-011). Jedes zusätzliche Onboarding-Feld ist ein
  Risiko für die Kernmetrik.
- **Gegen die ATS-Welt gewinnt man mit Weglassen.** Keine Scorecards mit sieben Kriterien,
  keine Interview-Kits, keine Rollenhierarchie — vier Stufen, ein Quorum, ein Veto.

**Die vier Elemente, die zusammen kein anderes Produkt hat:**

1. **Kollaborative Bewertung mit sichtbarem Quorum und verdeckten Zwischenständen** in
   einem Laien-Kontext
2. **Terminfindung, die Kandidaten-Constraints, Bewohner-Verfügbarkeit und Haushaltsregeln
   gleichzeitig kennt** — und ihre Vorschläge erklärt
3. **Kanalneutralität als Prinzip** (P-1, ADR-009): kein Feature setzt voraus, dass die
   bewerbende Person einen Link anklickt
4. **Die Sichtbarkeitsinvariante** (E-12): niemand liest Beratungsinhalte über sich selbst,
   dauerhaft, doppelt erzwungen

### 5.2 Vorher / Nachher

| Dimension | Heute | Mit Flatmate.io |
|-----------|-------|-----------------|
| Bewerbung erfassen | Von Hand in den Chat kopieren, Format zerfällt | Formular oder Paste-Parser; ein `Application`-Objekt unabhängig vom Eingangskanal (P-1) |
| Abstimmen | Reaktionen und Sprachnachrichten im Verlauf, Auszählen von Hand | Vier Stufen pro Karte, Score als offengelegter Mittelwert, Rangliste automatisch |
| „Haben alle abgestimmt?" | Unbeantwortbar | „5 von 7" am Bildschirm; Kandidaten unter Quorum getrennt ausgewiesen |
| Meinungsbildung | Wer später antwortet, hat die anderen gelesen | Ergebnisse bis zur eigenen Stimmabgabe verdeckt (Standard) |
| Terminfindung | Doodle pro Bewerbenden oder Raten | Ein Raster mit Heatmap, Feasibility je Bewerbenden, „Vorschlag berechnen" mit Begründung |
| Termin platzt / keine Lösung | Trial and Error im Chat | Harte Constraints werden einzeln relaxiert und der Grund benannt („Lea kann nur Di 16–19, dort können nur 2 von 7") |
| Nach dem Casting | „Wie war sie?" abends in der Küche | `CastingNote` mit strukturierten Prompts, für alle Rundenteilnehmer lesbar |
| „Was ist passiert, während ich weg war?" | Chatverlauf durchscrollen | Ein `ActivityEvent`-Feed, plus Digest |
| Ein starkes Nein äußern | Sozial teuer, deshalb selten | `Veto` mit Begründung, rankt tief statt zu löschen |
| Bewerbende sagt nach Zusage ab | Prozess bricht, Zustand unklar | Rückwärtsübergang `moved_in → offer_made → …`, auditiert (P-4) |
| Ein Zimmer ist vergeben, die Runde läuft weiter | Verwirrung, mehrfach zugesagt | `Room` mit eigenem Zustand; die `CastingRound` läuft für die übrigen Zimmer weiter |
| Neue Person zieht ein, Runde läuft | Sie liest die Beratung über sich selbst | Selbst-Redaktion greift dauerhaft; sie sieht die Historie zu *anderen* Kandidaten |
| Person zieht aus | Bleibt in der Gruppe | `moved_out` entzieht sofort den Zugriff, Stimmen bleiben gültig, Quorum-Nenner schrumpft |
| Alte Bewerbungen | Liegen für immer im Chatverlauf | Löschautomatik nach 180 Tagen mit 14 Tagen Vorwarnung, keine stille Löschung |
| Bewerbende fragt „welche Daten habt ihr über mich?" | Niemand kann es beantworten | „Datenauskunft erzeugen" pro `Application` |

### 5.3 Scope

Jede Zeile links ist eine v1-Anforderung, auf die sich jedes Feature in `03-PRD.md`
zurückführen lassen muss. Die Phasenzuordnung steht in §5.4.

| In Scope (v1) | Out of Scope |
|---------------|--------------|
| **S-01** `Household`-Registrierung (E-Mail + Passwort, Hinweis auf gemeinsam genutzte Adresse); Haushalts-`Account` verwaltet und **stimmt nicht ab** | Organisationen über Haushalten, SSO, Eigentumsübertragung als eigener Mechanismus |
| **S-02** `ResidentProfile` anlegen und Kontextwechsel Verwaltung ↔ Bewohner aus dem Haushalts-Account heraus | Mehrere Haushalte pro `Account` in einer Oberfläche |
| **S-03** **Ein** Beitrittscode/-Link für den ganzen Haushalt; Ein-Schritt-Registrierung mit **nur Name und Passwort als Pflichtfelder** — `Account.email` ist beim Beitritt für Resident-Accounts **optional** und später im Profil nachpflegbar (analog zum bestehenden Präzedenzfall „Passkey wird nie während der Registrierung angeboten", `03-PRD.md`); Passwort primär und universell; Passkey als optionaler, abschaltbarer Aufsatz; E-Mail-Verifikation, falls eine Adresse hinterlegt ist, nachgelagert und nicht abstimmungsblockierend | Einladung pro Person, Magic-Link-Login (verworfen: nicht gerätegebunden), SMS-Verifikation, E-Mail-Pflichtfeld im Beitrittsformular |
| **S-04** `Membership` mit orthogonalen `is_resident` / `role` plus einzeln vergebbare Berechtigungen (Bewerber anlegen, Status ändern, Runde schließen, Termine bestätigen) | Rollenhierarchie, frei definierbare Rollen, Berechtigungsvorlagen |
| **S-05** Struktureller Duplikatsschutz — von den ursprünglich vier Mechanismen tragen nach dem Wegfall der für Bewohnende sichtbaren Bewohnerliste und ihres Entfernen-Rechts (K-19/U-22, `07-Screen-Inventar.md` §7–8) nur noch zwei: Beitritte im `ActivityEvent`-Feed, Quorum gegen die Bewohnerzahl. Die Bewohnerliste (Namen, Beitrittsdatum, Kontakt, Status; entfernen/`moved_out`/reaktivieren/Code) bleibt der Verwaltung voll und dem Moderator lesend vorbehalten; eine separate Teilnehmendenliste (nur Namen der Rundenteilnehmenden, keine Handlungen) bleibt allen Bewohnenden sichtbar. Die Absicherung des Einladungslinks (**S-49**) ist damit nicht mehr Ergänzung, sondern Voraussetzung dieses Schutzes | Geräte-Fingerprinting (§ 25 TDDDG), Identitätsprüfung, Entfernen-Recht für Bewohnende |
| **S-06** `CastingRound` mit mehreren `Room`s, eigener Zustandsmaschine und `RoundParticipation`-Snapshot der Teilnehmenden beim Start | Mehrere gleichzeitig laufende Runden pro Haushalt als beworbener Anwendungsfall (technisch nicht ausgeschlossen) |
| **S-07** `Room` als eigene Entität mit eigenem Status — „3 Zimmer, eines vergeben, Runde läuft weiter" | Zimmerpläne, Grundrisse, Miethöhen, Mietverträge |
| **S-08** `Application` erfassen: manuelles Formular (Name Pflicht; Kontakt, Alter, Freitext, weitere Angaben optional) **und** regelbasierter Paste-Parser mit Pflichtbestätigung durch einen Menschen | KI-Parsing (v2, nur Extraktion), Portal-API, Scraping, Anhänge/Dateiupload |
| **S-09** Karten-Screening-Durchlauf über alle offenen `Application`s der Runde | Wischgesten als einziger Weg, Stapelbewertung |
| **S-10** Abstimmung Runde 1: vierstufige Skala (0/1/3/5), Gewichte in der UI offengelegt, revidierbar innerhalb derselben `Vote.stage`, solange die `CastingRound` `open` ist | Punkte-Budget als Abstimmungsverfahren (v1.1 als **Option**), 0–10-Skala, Ja/Nein-Skala |
| **S-11** Bei Überschreiten der Budgetschwelle (`Anzahl Unbedingt > ceil(Zimmer × 1,5)`) ein zweiter, kürzerer Durchlauf ausschließlich über die eigenen „Unbedingt"-Karten, gleiche vierstufige Skala; Budget nur sichtbar wenn überschritten; jederzeit abbrechbar ohne Stimmenänderung; abschaltbar | Erzwungene Herabstufung, Budget während des ersten Durchlaufs, ein eigens gestalteter Vergleichsbildschirm (→ **S-47**) |
| **S-12** Rangliste: Score als Mittelwert auf 0–100, sortierbar; Einzelansicht mit gestapeltem 4-Farben-Stimmungsbild | Gewichtete Stimmen je Person, Delegation, Enthaltung als eigene Stufe |
| **S-13** Quorum-Anzeige und Trennung: Ein Kandidat erscheint in der Rangliste, sobald **mindestens die Hälfte** der Stimmberechtigten abgestimmt hat (`quorum_share = 0,5`, konfigurierbar); darunter steht er im eigenen Abschnitt „Warten auf Stimmen (3 von 7)". **Quorum ist Anzeige, keine Sperre** | Quorum als harte Blockade eines Zustandsübergangs; eine hohe Schwelle (z. B. 2/3), die die Rangliste in den ersten Tagen leer lässt |
| **S-14** Verdeckte Ergebnisse bis zur eigenen Stimmabgabe (Einstellung, Standard an) | Dauerhaft anonyme Abstimmung, Ergebnisse dauerhaft verborgen |
| **S-15** Vollständige `Application`-Zustandsmaschine (ADR-002) `new → screened → invited → scheduled → interviewed → offer_made → moved_in` mit Seitenzuständen `rejected_by_household`, `declined_by_applicant`, `withdrawn`, `archived`; **Rückwärtsübergänge erlaubt und auditiert** | Frei konfigurierbare Pipeline-Stufen, Automatikübergänge ohne Bestätigung |
| **S-16** Copy-Paste-Text beim Markieren als `invited` (inkl. Datenschutzhinweis) als **Hilfsmittel für den Haushalt** | Versand durch die Anwendung, Portal-Batch-Kontaktierung, KI-formulierte Antworten |
| **S-17** `AvailabilityWindow`-Erfassung: strukturierte „kann / kann nicht"-Fenster für Bewohnende und Bewerbende, **manuell vollwertig einpflegbar in v1** (P-1 verlangt das ohnehin), plus regelbasierter Freitext→Zeitfenster-Parser mit Pflichtbestätigung. Das **Datenmodell** für den Token-Link liegt in v1; die **bewerberseitige Token-Seite** ist der Komfortpfad darüber und liegt in v1.1 (offener Punkt O-08) | Kalender-Sync (CalDAV/Google, v2), automatische Verfügbarkeitsableitung |
| **S-18** Verfügbarkeits-Raster mit Heatmap („4/7 können"), manuelles Legen von `Slot`s, **Feasibility-Prüfung je Bewerbenden ohne Solver** (Ausgrauen nicht-buchbarer Slots) | — |
| **S-19** „Vorschlag berechnen": deterministisches Constraint-Verfahren hinter einem austauschbaren **Solver-Port**; Haushalts-Präferenzen als Gewichte und Constraints („erst ab 18:00", „max. N pro Tag", „parallel erlaubt/nicht erlaubt", „mindestens X Bewohnende pro Casting", Mindestpuffer) | Nichtdeterministische Verfahren (genetisch/heuristisch — ausgeschlossen, P-3), Abstimmung über ganze Termin-Konfigurationen |
| **S-20** Erklärbarkeit als Pflicht-Feature: (a) verletzte Soft-Terme nachrechnen („Di 17:00 — 5/7 können"); (b) bei Unlösbarkeit harte Constraints in **fester Reihenfolge** einzeln relaxieren und den Grund benennen; (c) **am Zeitlimit** wird die beste bis dahin gefundene zulässige Lösung zurückgegeben und als solche gekennzeichnet — nie ein stiller Fehlschlag, nie eine leere Antwort | Black-Box-Score, „keine Lösung gefunden" ohne Begründung, Abbruch ohne Ergebnis |
| **S-21** Slot-Reaktionen: Bewohnende reagieren auf einzelne `Slot`s (👍 / „kann nicht"), moderierende Person bestätigt den `Appointment` | Selbstbuchung durch Bewerbende in v1 (Link-Variante: v1.1) |
| **S-22** `CastingNote`s mit **strukturierten Prompts** statt leerem Kasten, sichtbarer Hinweis „schreib so, als könnte die Person es lesen" | Freitextfeld ohne Struktur, Audioaufnahme, Transkription |
| **S-23** Abstimmung Runde 2 über gecastete Bewerbende, gleiche vierstufige Skala | Abweichendes Verfahren je Runde |
| **S-24** `Veto`: rankt tief statt zu löschen; einstellbar Begründungspflicht, Budget pro Runde (Standard 1), Anonymität als **Opt-in** mit ehrlichem Hinweis zur Gruppengröße; Sperre an der Phasengrenze `offer_made` | Veto mit Löschwirkung, dauerhaft anonymes Veto ohne Hinweis |
| **S-25** Zimmer-, Einzugstermin- und Zusagedetails am `Application`-Objekt festhalten (auch vorläufig) | Mietvertrags-Erstellung, Kautionsverwaltung, Zahlungen |
| **S-26** Kalenderansicht über `Appointment`s und Einzugstermine | Kalender-Sync, Einladungsdateien an Externe, Erinnerungen per SMS |
| **S-27** `ActivityEvent`-Feed (append-only, ADR-003), jedes Ereignis mit `Account` **und** handelndem Profil — „Jonas hat Lea eingeladen" bzw. ehrlich „Verwaltung hat Lea eingeladen" | Volles Event-Sourcing als Datenhaltung, Kommentare/Diskussion am Feed |
| **S-28** `Notification`-Kanalauflösung über `PushSubscription`: **Web Push bevorzugt** (wenn eine aktive `PushSubscription` vorliegt), sonst **E-Mail als Fallback** (nur wenn `Account.email` gesetzt ist — bei Resident-Accounts nicht garantiert), sonst **In-App**. In-App und Web Push sind die primären Kanäle (Web Push jetzt v1 statt v1.1); **Digest als Standard**, Ereignisauswahl in `HouseholdSettings` **und** persönlichen Einstellungen; Inhalte unterliegen derselben Sichtbarkeitspolicy | Verifikationsfreier Mailversand, Benachrichtigung an Bewerbende, SMS |
| **S-29** Beteiligungs-Loop als First-Class-Feature: „5 von 7 haben abgestimmt", Badge „4 offene Bewerbungen warten auf dich", Digest | Gamification, Ranglisten unter Bewohnenden, Erinnerungsdruck an Einzelne |
| **S-30** Installierbare PWA, mobile-first. **Der Service Worker cacht ausschließlich die App-Hülle** (Markup, Skripte, Stile, Icons) — niemals Bewerber- oder Beratungsdaten. Offline-Fähigkeit heißt „die App startet ohne Netz", nicht „die Daten sind ohne Netz da". **Eine benannte Ausnahme:** ein Sendepuffer für die eigenen, noch nicht übertragenen `Vote`s — begrenzt durch harte Höchstlebensdauer, ohne Anzeigedaten, verworfen statt wiederholt bei serverseitiger Ablehnung, geleert bei Abmeldung. Als Ausnahme auch in ADR-011 zu vermerken, damit die Dokumente sich nicht widersprechen | Native App, App-Store-Auslieferung. **Ausdrücklich ausgeschlossen: ein Runtime-Cache, der API-Antworten mit personenbezogenen Daten mitnimmt** — er würde Bewerberdaten auf die Geräte der Bewohnenden legen, außerhalb der Reichweite der 180-Tage-Löschautomatik (S-33): ein Löschjob auf dem Server erreicht keinen Gerätecache. Ebenso ausgeschlossen: ein Sendepuffer **ohne** Höchstlebensdauer oder **mit** denormalisierten Anzeigedaten — er wäre eine Datenkopie und damit dasselbe Leck durch die Hintertür |
| **S-31** **Sichtbarkeitsinvariante** über `Application.became_resident_id`, doppelt erzwungen (Policy-Schicht + Row-Level-Security); erfasst `Vote`, `Veto`, `CastingNote`, Aggregat und Ranglistenposition; die eigene Karte zeigt nur das Sachprofil mit ehrlichem Hinweis | Statusabhängige Sichtbarkeitsheuristik (verworfen: leckt bei wiedereröffneten Runden und Wiederbewerbungen) |
| **S-32** Rundensichtbarkeit über `RoundParticipation`; `moved_out` entzieht sofort den Zugriff. **Auch bei Auszug während einer offenen Runde bleibt die abgegebene Stimme im Score**, die Person fällt aber aus **Zähler und Nenner** der Beteiligungs- und Quorum-Anzeige. Die UI markiert das („1 Stimme von einem ehemaligen Mitglied"). Begründung: Die Stimme wurde gültig abgegeben; sie rückwirkend zu entfernen ändert eine Grundlage, die andere schon gesehen und eingerechnet haben, und ließe die Rangliste ohne sichtbaren Anlass springen (P-3) | Nachträgliche Löschung oder Neutralisierung der Stimmen Ausgezogener; unmarkierte Fortführung im Nenner |
| **S-33** Aufbewahrungsautomatik: 180 Tage für `Application`, `Vote`, `CastingNote`; protokollierter Verlängerungsknopf (+180 Tage, mit Begründung); **14 Tage Vorwarnung** mit „verlängern / jetzt löschen / archivieren"; Haushalt kann kürzen (30/90/180); manuelles Löschen pro `Application` und pro `CastingRound` jederzeit | Unbegrenzte Verlängerung, stille Löschung, Papierkorb mit unbefristeter Wiederherstellung |
| **S-34** „Datenauskunft erzeugen" pro `Application`: Export aller zu dieser Person gespeicherten Daten | Automatisierte Beantwortung von Betroffenenanfragen, Auskunftsportal für Bewerbende |
| **S-35** Regel-Sperre: Änderung des Abstimmungsverfahrens während einer laufenden `CastingRound` blockiert bzw. laut protokolliert | Nachträgliche Neuberechnung nach Verfahrenswechsel |
| **S-36** Autorisierung **zweifach erzwungen**: zentrale Policy-Objekte plus Row-Level-Security in der Datenhaltung (ADR-004) | Autorisierung im Frontend, Sichtbarkeit durch Ausblenden |
| **S-37** Maschinenlesbares Datenbestandsverzeichnis (`data-inventory.yml`) mit Zweck, Rechtsgrundlage, Aufbewahrung und Kategorie je personenbezogenem Feld; CI-Check bricht bei nicht deklarierter Spalte (ADR-010, dient als Art.-30-Verzeichnis) | Manuell gepflegtes Verzeichnis außerhalb des Repos |
| **S-38** **Zwei Achsen bei der Erfassung:** neben dem technischen Pfad (`Application.source`) wird die **Erhebungsquelle** erfasst (`Application.collected_from`: `data_subject` / `third_party`). Davon hängt Art. 13 gegen Art. 14 ab — und damit im Dritterhebungsfall eine Informationspflicht **binnen eines Monats**. Vorauswahl `data_subject`, sichtbar und nicht implizit; bei Dritterhebung Hinweis auf die Frist plus Copy-Paste-Textbaustein | Automatische Herleitung der Erhebungsquelle aus dem technischen Pfad; stiller Default |
| **S-39** **Absätze verwerfen vor dem Speichern:** im Paste-Parser-Schritt kann der Haushalt einzelne Absätze der Rohnachricht verwerfen („diesen Absatz nicht übernehmen"), bevor die `Application` entsteht | Automatische Erkennung oder Filterung sensibler Inhalte (wäre eine Bewertung von Text über Personen — Nähe zu P-5) |
| **S-40** **Zuordnung früherer Bewerbungen derselben Person** als ausdrückliche Handlung: Aktion an der Bewerberkarte und Hinweis beim Anlegen eines `ResidentProfile` aus einer `Application`. **Prozessuale Hälfte von S-31** — die Invariante schützt nur *verknüpfte* `Application`s, und `became_resident_id` wird manuell gesetzt. Beim regulären Weg über das Einladungstoken (**S-42**) setzt sich `became_resident_id` bereits bei der Registrierung selbst; S-40 bleibt der Weg für alle übrigen Fälle — Zuordnung ohne Token, spätere Korrektur | Automatischer Personenabgleich über Namen, Kontaktdaten oder Ähnlichkeit (wäre ein Personenabgleich und damit heikel) |
| **S-41** **`Application.subject_statement`** — eigene Gegendarstellung der betroffenen Person am Datensatz. Sachlich die richtige Antwort auf Art. 16, weil sich eine subjektive Beurteilung nicht *berichtigen* lässt, man ihr aber eine Stellungnahme beistellen kann. **Datenmodell in v1, Oberfläche in v1.1.** **Keine eigene Aufbewahrungsfrist:** das Feld erbt die Frist der `Application` und wird in **derselben Transaktion** gelöscht wie die Bezugsdaten | Änderung oder Löschung fremder `Vote`s, `Veto`s oder `CastingNote`s durch die betroffene Person. **Ein eigener Aufbewahrungszeitgeber** — er würde ein Fenster erzeugen, in dem die Gegendarstellung ohne die Aussage dasteht, gegen die sie sich richtet, und damit den gelöschten Inhalt rekonstruierbar machen |
| **S-42** `ApplicationInviteToken`: einmalig verwendbares Einladungstoken je `Application` bei Erreichen von `moved_in`, setzt bei Registrierung `became_resident_id`, widerrufbar. Klickt eine bereits registrierte, angemeldete Person den Token, endet der Vorgang mit einer erklärten Fehlermeldung („Du bist bereits als Bewohner:in registriert") statt einer stillen Verknüpfung oder Überschreibung — keine Doppelregistrierung | Automatische Verknüpfung ohne Bestätigung, Mehrfachverwendung des Tokens, stille Überschreibung eines bestehenden `ResidentProfile` |
| **S-44** Optionale weiche Frist je Rundenphase (`CastingRound.phase_deadline_at`), sichtbar als „Stimme ab bis X" / „X Tage/Stunden übrig". Blockiert nichts (analog Quorum S-13) — nach Ablauf bleibt die Runde entscheidungsfähig, der Moderator entscheidet aktiv weiter oder verlängert. Speist die CTA-Sortierung im Dashboard: Runden/Bewerbungen mit näher rückender Frist werden dort weiter oben angezeigt | Harte Frist, die einen Zustandsübergang blockiert oder automatisch auslöst |
| **S-45** PWA-Install-Hinweis: sichtbar und beharrlich — das ist Voraussetzung für zuverlässige Beteiligung an notwendigen Schritten, nicht bloß Komfort. Beim Beitritt überspringbar, danach eine gut sichtbare, wiederkehrende Dashboard-Einblendung bis zur Installation. Die Resident-E-Mail-Abfrage bleibt dagegen zurückhaltend: der Pitch führt mit „Zugang wiederherstellen, falls Passwort verloren geht" — nicht mit Benachrichtigungs-Komfort. Wird tatsächlich eine Fallback-E-Mail verschickt (S-28), trägt sie den Installations-Nudge „Installiere die App, um direkt benachrichtigt zu werden und dein Postfach zu schonen" mit Link zur Installationsanleitung | Erzwungene Installation, Blockade der Nutzung ohne installierte PWA, E-Mail-Pflichtfeld beim Beitritt |
| **S-46** Erinnerungs-Notification an `AppointmentAttendance`-Teilnehmende mit tatsächlicher Anwesenheit, ausgelöst beim Übergang `scheduled → interviewed` (`casting.note_reminder_due`): „Wie lief das Casting mit X? Schreib ein paar Sätze für alle, die nicht dabei waren" — Text in Anlehnung an die Prompts aus S-22. Wird nicht verschickt, wenn die betroffene `Application` für die Empfängerin/den Empfänger selbst-redigiert ist (V-1) | Automatisch vorformulierter Notiztext, Erinnerung an Personen ohne bestätigte Anwesenheit |
| **S-47** Der zweite Durchlauf (S-11) nutzt dasselbe Kartenmuster wie das erste Screening — kein eigens gestalteter Vergleichs- oder Feinschliff-Bildschirm. Löst die im `review-log.md` als 🔴 geführte Lücke „Feinschliff-Screen ohne Gestaltungsspezifikation" durch **Wegfall der Interaktion**, nicht durch ihre Spezifikation (Details in `07-Screen-Inventar.md` §9) | Ein eigenständiges Vergleichs-UI (Nebeneinanderstellung, Drag-Herabstufung), eine zweite Bedienlogik, die Bewohnende neu lernen müssten |
| **S-48** Genau eine Vorrangregel entscheidet, welche von mehreren gleichzeitig offenen Bewohner-Aufgaben (Stimmen R1/R2, Slot-Reaktion, Verfügbarkeit eintragen, Casting-Notiz, zweiter Durchlauf) zuerst angezeigt wird: Aufgaben mit einem echten Fälligkeitsdatum zuerst und nach Fälligkeit sortiert (S-44 liefert das Datum für Stimmen), Aufgaben ohne Datum danach in fester Reihenfolge. Die Regel selbst und die Datumsherkunft je Aufgabenart sind in `07-Screen-Inventar.md` §2 definiert — diese Zeile schneidet nur den Scope, wiederholt die Regel nicht | Eine feste, situationsunabhängige Rangliste der Aufgabenarten; eine automatisch gelernte oder KI-gestützte Priorisierung |
| **S-49** `join_code` erhält zusätzlich zur bestehenden Rotation (G-A5 — ergänzt sie, ersetzt sie nicht) einen Ablauf (`join_code_expires_at`, Vorschlag 7 Tage) und eine Nutzungsgrenze (`join_code_max_uses`, vorbelegt mit der Zahl fehlender Bewohnender), beide in `HouseholdSettings` änderbar, sowie einen Warnhinweis auf der Teilen-Seite („nur direkt mit Mitbewohnenden teilen — wer ihn hat, kann mitstimmen"). Seit **S-03** die E-Mail-Pflicht beim Beitritt gestrichen hat und mit **S-05** die für Bewohnende sichtbare Bewohnerliste samt Entfernen-Recht entfällt, ist der Link die **einzige verbliebene Zugangskontrolle** — diese Absicherung ist deshalb Voraussetzung, nicht Verbesserung | Verifikation, zweiter Faktor, Geräte-Fingerprinting (§ 25 TDDDG) |
| **S-50** Ein Konto ohne aktives `ResidentProfile` (Verwaltung) erreicht ausschließlich Haushaltsverwaltung — Zimmer, Mitglieder, Beitrittscode, Verfahrensregeln, Aufbewahrung; `CastingRound`, `Application`, `Slot`, `Appointment` und `CastingNote` setzen ein `ResidentProfile` voraus. Zwei benannte Ausnahmen bleiben bei der Verwaltung: Aufbewahrung (verlängern/kürzen/löschen/archivieren) und Datenauskunft **als Export ohne Einsicht**. Wird der letzte Moderator handlungsunfähig, kann sich die Verwaltung jederzeit selbst ein `ResidentProfile` anlegen und Moderatoren ernennen — ein benannter Handelnder statt direktem Zugriff. **Keine Sicherheitsgrenze:** wer die Haushaltszugangsdaten kennt, kann sich weiterhin ein Profil anlegen und handeln; was sich ändert, ist Zurechenbarkeit, nicht Zugriffsschutz | Verwaltung mit direktem Lese- oder Schreibzugriff auf Beratungsinhalte; ein zweiter, undokumentierter Zugriffspfad |
| **S-51** `AppointmentAttendance` startet bei Terminbestätigung mit `attended = true` für alle `expected_attendee_profile_ids` — die Moderation setzt an dieser Stelle nichts aktiv. Eine betroffene Person kann sich vor dem Termin kurzfristig für sich allein absagen; dieses Feld/Ereignis existiert im Domänenmodell bisher nicht und wird dort ergänzt. Die Moderation korrigiert `attended` nur im Ausnahmefall danach. Die Notiz-Erinnerung (S-46) geht ausschließlich an Profile mit `attended = true` | Anwesenheit als verpflichtender Erfassungsschritt der Moderation nach jedem Termin; eine Absage im Namen einer anderen Person |
| — | **Dauerhaft ausgeschlossen:** jede KI-gestützte Bewertung, Rangbildung, Empfehlung oder Entscheidung über Personen (P-5) · Profiling · automatisierte Vorauswahl · Portal-Scraping · Geräte-Fingerprinting |

### 5.4 Phasenplanung

**Aktiviert** — das Vorhaben ist mehrphasig, und der Schnitt ist bereits verhandelt.

| Phase | Umfang | Ziel | Abhängigkeit |
|-------|--------|------|--------------|
| **v1** | S-01 bis S-40 sowie das **Datenmodell** von S-41, dazu S-42, S-44, S-45, S-46, **S-47 bis S-51**: Haushalts- und Bewohner-Onboarding (E-Mail beim Beitritt optional, S-03; Einladungslink mit Ablauf und Nutzungsgrenze, S-49) · `CastingRound` mit `Room`s und optionaler weicher Rundenfrist (S-44) · Bewerbererfassung (Formular + regelbasierter Paste-Parser, mit Art.-13/14-Weiche und Absatzverwerfung) · Zuordnung früherer Bewerbungen · Einladungstoken bei `moved_in` (S-42) · Aufgaben-first-Dashboard mit Vorrangregel (S-48) · Card-Screening · Abstimmung R1 mit zweitem Durchlauf statt eigenem Feinschliff-Bildschirm (S-47) · Rangliste + Quorum · Status-Pipeline komplett · Verwaltungsfläche ohne Casting-Zugriff (S-50) · Verfügbarkeits-Raster + Feasibility + Solver-Knopf · `CastingNote`s mit angenommener statt erfasster Anwesenheit (S-51) und Erinnerungs-Notification nach dem Termin (S-46) · Abstimmung R2 + `Veto` · Kalenderansicht · `ActivityEvent`-Feed · In-App-/Web-Push-/E-Mail-Fallback-`Notification` mit dokumentiertem iOS-Vorbehalt für Web Push (S-28) · PWA mit Install-Hinweis (S-45) · Aufbewahrungsautomatik mit Vorwarnung · Datenauskunft-Export | **„Ein echter Haushalt führt eine vollständige Runde von der ersten `Application` bis `moved_in` durch, ohne nach WhatsApp auszuweichen."** Die Beteiligungsquote wird hier zum ersten Mal messbar | — |
| **v1.1** | **Bewerberseitige Token-Seite** für Verfügbarkeiten (Zeitraster, kein Konto — Datenmodell liegt bereits in v1, S-17, O-08) · **Oberfläche für `subject_statement`** (S-41) · Punkte-Budget-Variante als wählbare Option · Textbausteine für die Kontaktaufnahme · **S-43** Spenden-E-Mail an die Household-E-Mail nach der 3.–4. abgeschlossenen `CastingRound` eines Haushalts, außerhalb des In-App-Flows (löst O-05) — bedingt durch H-V4 aus dem Audit, erst nach der Concierge-Runde geprüft | „Der Komfort kommt nach, ohne dass v1 davon abhängig war." Jedes v1.1-Feature ist bewusst eine **Bequemlichkeit über einem vollständigen manuellen Pfad** (P-1) | v1 |
| **v1.2** | Nutzerinitiierte Browser-Extension für den Portal-Import | „Erfassungsarbeit sinkt weiter, ohne API und ohne Scraping." | v1.1 |
| **v2** | Kalender-Sync (CalDAV/Google) · leichtgewichtiges KI-Parsing unstrukturierter Texte (**nur Extraktion, nie Bewertung** — P-5, mit EU-Verarbeitung und AVV) · Vermieter-Persona mit vorgeschalteter AGG- und AI-Act-Prüfung · Freemium | Produktoption | v1.2 |

**Warum die Sichtbarkeitsinvariante (S-31) und die Autorisierungsschicht (S-36)
vollständig in v1 liegen:** Beide bestimmen jede Abfrage im System. Nachträglich eingezogen
müsste jede bestehende Abfrage angefasst werden — und bei AI-gestützter Implementierung ist
genau das der Weg, auf dem eine vergessene Bedingung zum Datenleck wird. Dasselbe gilt für
die Zustandsmaschine (S-15): Rückwärtsübergänge nachzurüsten heißt, Boolean-Flags in
Zustände zu migrieren.

**Warum der Verfügbarkeits-Link erst v1.1 ist, obwohl er offensichtlich wirkt:** Weil P-1
ihn zur Bequemlichkeit degradiert. Der manuelle Pfad muss ohnehin vollständig existieren —
also existiert er zuerst. Ein Produkt, das mit dem Link startet, baut den manuellen Pfad
nie fertig.

---

## 6. Success Metrics

Kernmetrik und Verzicht auf A/B-Tests folgen aus **E-24**.

| Art | Kennzahl | Zielwert | Erhebung / Definition |
|-----|----------|----------|------------------------|
| **Kern** | **Beteiligungsquote** | **> 80 %** | Anteil der stimmberechtigten Bewohnenden, die in einer `CastingRound` mindestens eine `Vote` abgegeben haben. Nenner sind die aktiven `RoundParticipation`-Teilnehmenden; `moved_out`-Profile werden herausgerechnet (E-14). Erhebung je Runde, nicht je Tag |
| Beobachtung | Aktivierte Bewohnende pro Haushalt | ≥ 5 bzw. ≥ 80 % der bekannten Bewohnerzahl | Anzahl `ResidentProfile` mit erfolgter Erstanmeldung. Trennt „Onboarding kaputt" von „Abstimmen unattraktiv" — beide würden sonst die Kernmetrik gleich aussehen lassen |
| Beobachtung | Abgeschlossene / gestartete Runden | > 70 % | `CastingRound` im Endzustand gegen gestartete. Misst, ob der Prozess in der Mitte abbricht (Abwanderung nach WhatsApp) |
| Beobachtung | Zeit bis Entscheidung | Richtung: sinkend | Zeit vom Rundenstart bis zum ersten `offer_made`. Kein absoluter Zielwert, weil er stark von der Bewerberlage abhängt |
| Beobachtung | Bewerbungen pro Runde | — | Anzahl `Application` je `CastingRound`. Kalibriert die Erwartung an das Screening und begründet die Budgetschwelle des zweiten Durchlaufs (E-08, S-11) |
| Beobachtung | Medianzahl Stimmen pro Bewerbung | ≥ Quorum | Zeigt, ob die Beteiligung sich gleichmäßig verteilt oder sich auf die ersten drei Karten konzentriert |
| Beobachtung | Runden pro Haushalt und Jahr | ≈ 2–4 | Prüft die Kernannahme aus E-01. Liegt der Wert bei 1, war der Beachhead falsch geschnitten und das Spenden-/Freemium-Modell trägt nicht |
| Beobachtung | Handlungen der moderierenden Person je abgeschlossener Runde | Richtung: sinkend | Zählt Statuswechsel, Terminbestätigungen und sonstige Eingriffe der Moderation je Runde (`ActivityEvent`, Klasse `process`, Akteur mit Moderationsrecht). Macht das Ziel „Organisationsaufwand senken ist ein Ziel, keine Nettigkeit" (`07-Screen-Inventar.md`) zum ersten Mal prüfbar |

**Metriken zweiter Ordnung** (ohne Zielwert, als Entscheidungshilfen für v1.1/v2):

| Kennzahl | Was sie entscheidet |
|----------|---------------------|
| Anteil `Application`s über Paste-Parser vs. Formular | Rechtfertigt den Parser — oder macht das KI-Parsing in v2 dringlicher (E-15) |
| Korrekturquote der Parser-Vorschläge (Zeitfenster und Bewerberdaten) | Fällt sie schlecht aus, ist der regelbasierte Ansatz am Ende und v2 wird zur Notwendigkeit, nicht zum Komfort |
| Anteil Runden mit ausgelöstem zweitem Durchlauf (S-47) | Prüft die Schwelle `ceil(Zimmer × 1,5)`. Löst er fast immer aus, ist die Skala zu grob |
| Anteil Runden mit mindestens einem `Veto` | Wird das Veto nie genutzt, ist es teure Mechanik; wird es ständig genutzt, ist die Skala nicht ausdrucksstark genug |
| Anteil `Appointment`s über „Vorschlag berechnen" vs. manuelles Legen | Rechtfertigt den Solver — die teuerste Einzelentscheidung der Architektur (ADR-005) |
| Anzahl Rückwärtsübergänge je Runde | Belegt oder widerlegt, dass P-4 ein Praxisbedarf und nicht eine Vorsichtsmaßnahme ist |
| Anteil Runden mit Aufbewahrungsverlängerung | Fällt er hoch aus, ist die 180-Tage-Frist zu kurz gewählt und die Begründung nachzuschärfen (E-18) |

> Die Beobachtungskennzahlen sind bewusst als **Entscheidungshilfen** formuliert, nicht als
> Erfolgsdruck. Wird das `Veto` nie genutzt, ist das ein Argument, es in v2 zu streichen —
> kein Misserfolg.

> ⚠️ **Grenze der Messbarkeit:** Bei einer erwarteten Nutzerbasis von einem bis wenigen
> Haushalten in v1 ist keine dieser Zahlen statistisch belastbar. Sie ersetzen kein
> Gespräch mit den Bewohnenden (§8.1); sie machen sichtbar, *wonach* zu fragen ist.

---

## 7. Risks & Mitigation

| Art | Risiko | Auswirkung | Gegenmaßnahme |
|-----|--------|-----------|---------------|
| **Regulatorik** | **Flatmate.io erzeugt eine Auskunftspflicht, die der WhatsApp-Status-quo nicht hatte.** Die entscheidende Trennlinie ist **„Küchentisch vs. System", nicht „Notiz vs. Fakt"**: Nachrichten zwischen Privatpersonen fallen unter die Haushaltsausnahme (Art. 2 Abs. 2 lit. c DSGVO) — dort gilt die DSGVO nicht, es gibt keinen Auskunftsanspruch. Dieselben Sätze in einem strukturierten Dateisystem einer Plattform: DSGVO gilt. Und Art. 15 erfasst nach EuGH-Auslegung sowie BFH und BGH (2025) **auch interne Vermerke, Aktennotizen und subjektive Beurteilungen** — „Lea wirkte unpünktlich" ist keine rechtliche Bewertung und damit nicht ausgenommen. Art. 15 Abs. 4 schützt die *Identität* bewertender Personen, nicht den *Inhalt*. | **Das Produkt verbessert den Prozess und verschlechtert gleichzeitig die Rechtsposition des Haushalts.** Eine gut informierte WG könnte daraus ein Argument *gegen* die Einführung machen. Wird es nicht adressiert, ist es zugleich ein Vertrauensrisiko gegenüber Bewerbenden. | **Ehrlich benennen statt verstecken** — dieser Posten steht bewusst an erster Stelle. Produktseitig: **strukturierte Notiz-Prompts statt leerem Kasten** (S-22), sichtbarer Hinweis **„schreib so, als könnte die Person es lesen"**, **knappe Fristen** (S-33: 180 Tage, kürzbar auf 30), **„Datenauskunft erzeugen" pro `Application`** (S-34) — auskunftspflichtig ist der Haushalt als Verantwortlicher, Flatmate.io schuldet als Auftragsverarbeiter nur Unterstützung (Art. 28 Abs. 3 lit. e). Rechtsseitig: Click-Through-AVV, TOM-Liste, Art.-30-Verzeichnis aus `data-inventory.yml` (S-37), Löschkonzept. Vollständige Analyse und Belege in `06-Compliance-Anhang.md`. **Nicht abschließend geklärt:** die Tragfähigkeit der Haushaltsausnahme und die Rollenkonstruktion gehören vor einem echten Launch anwaltlich geprüft |
| **Produkt** | **Adoption durch Nutzende, deren Zustimmung zum Werkzeug höchstens informell und beiläufig war** (R-02 im Problem Framing) — eine organisierende Person, selbst Bewohnende:r, schlägt es vor, der Rest stimmt vorher zumindest stillschweigend zu; nur im Einzelfall entscheidet sie über den Kopf der WG hinweg. Das ist kein Investment in die Nutzung. Der reale Wettbewerber ist WhatsApp: installiert, ohne Registrierung, null Lernkosten. Erschwerend: schubweise Nutzung mit monatelangen Pausen | Zwei von sieben registrieren sich, die Beteiligungsquote fällt **unter** den WhatsApp-Stand, und das Produktversprechen kippt. Das ist das Risiko, an dem dieses Vorhaben am wahrscheinlichsten scheitert | Ein Beitrittscode für den ganzen Haushalt und Ein-Schritt-Registrierung (S-03), Passwort als universelle Methode und keine App-Store-Hürde (P-2, ADR-011), verdeckte Ergebnisse als eingebauter Beteiligungsanreiz (S-14), Beteiligungs-Loop als First-Class-Feature (S-29), Digest statt Einzelbenachrichtigungen (S-28). Jedes zusätzliche Onboarding-Feld ist ausdrücklich als Risiko für die Kernmetrik zu behandeln. Messbar getrennt über „aktivierte Bewohnende pro Haushalt" (§6) |
| **Produkt** | **Beteiligung ist Ziel und Nadelöhr zugleich** (R-03). Quorum, verdeckte Ergebnisse und Veto-Budget setzen Beteiligung voraus — fehlt sie, blockieren genau diese Mechanismen | Die Runde steht, weil drei Stimmen fehlen; der Haushalt weicht nach WhatsApp aus, wo nichts blockiert | **Quorum ist Anzeige, keine Sperre** (S-13) — die Runde bleibt entscheidungsfähig. Ausgezogene werden aus dem Nenner gerechnet (S-32). Verdeckte Ergebnisse und Veto-Budget sind abschaltbar (S-14, S-24). Kein Zustandsübergang hängt an einem erreichten Quorum. **Die weiche Rundenfrist (S-44, `CastingRound.phase_deadline_at`) ist die dafür spezifizierte Gegenmaßnahme**: sie macht säumige Beteiligung sichtbar („Stimme ab bis X") und sortiert im Dashboard nach näher rückender Frist, blockiert aber wie das Quorum nichts — nach Ablauf bleibt die Runde entscheidungsfähig, der Moderator entscheidet aktiv weiter oder verlängert |
| **Regulatorik** | **EU AI Act, Anhang III.** Das Hochrisiko-Regime ist seit 02.08.2026 in Kraft. Anhang III erfasst KI für den Zugang zu wesentlichen Diensten; wohnungsbezogene Entscheidungen und Mieter-Screening werden in diese Richtung eingeordnet, und Profiling bleibt auch unter engen Ausnahmen hochrisikobehaftet | Ein einziges „hilfreiches" KI-Feature — Bewerbungen zusammenfassen *mit Einschätzung*, Kandidaten vorsortieren, „passt gut zur WG" — würde das Vorhaben in ein Regime mit Konformitätsbewertung, Risikomanagementsystem und Registrierungspflicht befördern | **P-5 ist eine nicht verhandelbare Zeile in `GUARDRAILS.md`, kein Designprinzip mit Ermessen.** Entscheidung: das Minenfeld wird nicht betreten. Zulässig ist ausschließlich strukturierende Textverarbeitung (Zusammenfassen ohne Wertung, Extrahieren von Zeitfenstern). In v1 ist auch das nicht enthalten — Paste-Parser und Zeitfenster-Parser sind **regelbasiert** (S-08, S-17). Für das v2-KI-Parsing gelten zwei harte Bedingungen: EU-Verarbeitung mit AVV, und Ausgabe ausschließlich als Extraktion. **Zusätzlich:** Freitext-Bewerbungen enthalten unvermeidlich besondere Kategorien nach Art. 9, für die keine saubere Rechtsgrundlage existiert → keine einladenden Strukturfelder, strenge Aufbewahrung, und als einziger wirksamer produktseitiger Hebel die **Absatzverwerfung im Erfassungsmoment** (S-39): der Paste-Parser-Schritt ist die einzige Stelle, an der sich das ohne Zusatzaufwand entschärfen lässt. Bewusst **kein** automatischer Filter — eine maschinelle Erkennung sensibler Inhalte wäre eine Bewertung von Text über Personen und damit nahe an P-5 |
| **Regulatorik** | **Vermieter-Fall verschiebt die Rechtslage.** Bei WG-Zimmern greift die AGG-Ausnahme § 19 Abs. 5 wegen des besonderen Nähe- und Vertrauensverhältnisses weitgehend. Bei mehreren Wohneinheiten greift sie **nicht** — und dieselbe Software wird zum Mieter-Screening-Werkzeug | Ein Feature, das in v1 harmlos ist, wird in der Vermieter-Persona diskriminierungsrechtlich relevant. Und das ist genau die Stufe, die zahlen soll (E-23) | Vermieter-Persona ist **v2 und ausdrücklich prüfungspflichtig**: keine Positionierung, keine Bewerbung, kein Onboarding-Pfad in v1 — obwohl der Fall technisch bereits funktioniert. Vor der Freischaltung: AGG- und AI-Act-Prüfung als Eingangsvoraussetzung der Phase, dokumentiert in `06-Compliance-Anhang.md` |
| **Technisch** | **Determinismus des Terminvorschlags.** Das gewählte Constraint-Verfahren (ADR-005) liefert nur bei **fixem Seed und einem einzigen Solver-Worker** reproduzierbare Ergebnisse. Mehr Worker sind schneller — und nichtdeterministisch | Zwei Aufrufe mit identischer Eingabe liefern verschiedene Vorschläge. Damit fällt P-3: ein Vorschlag, den man nicht reproduzieren kann, ist nicht erklärbar — und eine WG, die zwei verschiedene „optimale" Termine sieht, verliert das Vertrauen in beide | Determinismus als **Anforderung, nicht als Konfiguration**: fixer Seed und ein Worker sind Teil der Definition of Done, mit einem Test, der zweimal dieselbe Eingabe rechnet und Gleichheit prüft. In `GUARDRAILS.md` als geschützte Regel: **Solver-Determinismus wird nicht „für Performance" geändert.** Nichtdeterministische Verfahren (genetisch) sind ausgeschlossen (S-19). Der Solver liegt hinter einem **Port** — austauschbar, ohne die Erklärbarkeitszusage zu berühren |
| **Technisch** | **Die Feasibility-Schicht muss ohne Solver tragen.** Ist der Solver nicht verfügbar (Prozessstart schlägt fehl, Zeitüberschreitung), darf die Terminfindung nicht ausfallen | Der teuerste Architekturbaustein wird zum Single Point of Failure für den Alltagsfall „Termin von Hand legen" | Feasibility ist eine reine Pro-Person-Prüfung und **grundsätzlich solverfrei** (S-18). Bei Solver-Ausfall bleibt das Raster mit Heatmap und manuellem Legen voll nutzbar; nur der Knopf „Vorschlag berechnen" wird mit Begründung deaktiviert. Als Rückfallverhalten in `03-PRD.md` §6.2 spezifiziert |
| **Technisch** | **AI-Implementierungsrisiko.** Die Umsetzung erfolgt AI-gestützt. Die typischen Fehlermuster sind bekannt und für dieses Produkt spezifisch gefährlich: ein vergessenes `WHERE household_id = …` leckt einen fremden Haushalt; eine abgeschwächte Testbedingung deaktiviert die Sichtbarkeitsinvariante; ein `as any` umgeht die Zustandsmaschine; echte Personendaten wandern in eine Fixture | Vertrauensbruch mit Rechtsfolge. Anders als bei einem Notizwerkzeug sind die betroffenen Daten Urteile über Menschen, die sich nicht wehren können, weil sie von der Verarbeitung nichts wissen | **Nicht Appelle, sondern maschinell erzwungene Regeln** (`GUARDRAILS.md`, ADR-004, ADR-010): Autorisierung **zweifach** — zentrale Policy-Objekte plus Row-Level-Security, sodass eine vergessene Bedingung an der Datenhaltung scheitert (S-36). **Geschützte Tests**, die nicht gelöscht oder abgeschwächt werden dürfen: Selbst-Redaktions-Invariante, Quorum-Berechnung, Zustandsübergänge. **Import-Boundary-Lint** gegen Cross-Context-Joins. **CI-Gate** auf `data-inventory.yml` bei jeder neuen personenbezogenen Spalte (S-37). Keine echten Personendaten in Tests, Seeds und Fixtures. Kein `as any`, keine Lint-Ausnahmen. Destruktive Migrationen nur mit menschlicher Freigabe |
| **Technisch** | **Die Sichtbarkeitsinvariante ist eine Invariante — oder sie ist nichts.** Sie muss an fünf Artefakttypen greifen (`Vote`, `Veto`, `CastingNote`, Aggregat, Ranglistenposition) und zusätzlich in `Notification`-Inhalten, Exporten und dem `ActivityEvent`-Feed | Ein einziger Leckpfad — eine Digest-Mail, ein CSV-Export, eine Feed-Zeile „Jonas hat dich mit ‚Eher nicht' bewertet" — zerstört das Vertrauensversprechen vollständig und irreversibel | **Eine** testbare Regel über `Application.became_resident_id` statt einer Statusabfrage an fünf Stellen (S-31). Aggregate sind ausdrücklich mit erfasst — ein Score ist ein Beratungsinhalt. `Notification`-Inhalte unterliegen derselben Policy (S-28). Der Test läuft gegen alle Ausgabekanäle, nicht nur gegen die API. Die alte statusabhängige Heuristik ist verworfen, weil sie bei wiedereröffneten Runden und Wiederbewerbungen leckt |
| **Technisch / Prozess** | **Die Sichtbarkeitsinvariante schützt nur *verknüpfte* Bewerbungen.** `Application.became_resident_id` ist n:1 und wird **manuell** gesetzt. Wer sich vor zwei Jahren erfolglos beworben hat und diesmal einzieht, hat zwei `Application`s im System — die alte trägt `Vote`s und `CastingNote`s über dieselbe Person. Ist nur die neue verknüpft, leckt die alte genau das, was die Invariante verhindern soll. **Fund aus der Querprüfung mit `04-Domaenenmodell.md`, nicht aus dem Brief** | Die technische Invariante ist korrekt und die Person liest trotzdem eine Beurteilung über sich selbst. Der schlechteste Fall der gesamten Risikoliste, weil er ohne Fehlermeldung eintritt und beim Testen mit frischen Daten nie auffällt | **S-40 ist die prozessuale Hälfte der Invariante, keine Komfortfunktion:** eine ausdrückliche Aktion „diese frühere Bewerbung derselben Person zuordnen" an der Bewerberkarte, erreichbar beim Übergang nach `moved_in`, plus ein sichtbarer Hinweis beim Anlegen eines `ResidentProfile` aus einer `Application` („gibt es frühere Bewerbungen dieser Person? Nicht zugeordnete bleiben für sie sichtbar."). Bewusst **kein** automatischer Abgleich über Namen oder Kontaktdaten — das wäre ein Personenabgleich. Prüfbar als eigenes Akzeptanzkriterium in `03-PRD.md` §6.5 |
| **Produkt** | **Notizkultur.** Strukturierte Prompts und der Hinweis „schreib so, als könnte die Person es lesen" können dazu führen, dass niemand mehr etwas Substanzielles schreibt — und Schritt 8 der Belegkette unbeantwortet bleibt | Die Abwesenden haben weiterhin keine Entscheidungsgrundlage. Ein zentrales Problem gilt formal als gelöst und ist es nicht | Prompts fragen nach **beobachtbaren** Dingen („was hat die Person erzählt?", „was ist offen geblieben?"), nicht nach Urteilen — beobachtbare Notizen sind zugleich rechtlich unproblematischer und für Abwesende nützlicher. Der Hinweis ist ein sichtbarer Hinweis, keine Sperre und keine Prüfung. Beobachtung über den Anteil der Castings mit mindestens einer `CastingNote` |
| **Zeit** | **Solo-Kapazität gegen v1-Umfang.** 37 Scope-Zeilen, darunter drei teure Bausteine: Solver mit Erklärbarkeit, doppelte Autorisierung, Aufbewahrungsautomatik mit Vorwarnung | Das Projekt bleibt unfertig — das häufigste Ende ambitionierter Nebenprojekte | Der Phasenschnitt (§5.4) ist bereits der harte Schnitt: v1.1 enthält ausschließlich Bequemlichkeiten über vollständigen manuellen Pfaden. Innerhalb von v1 ist die Reihenfolge in `03-PRD.md` §7.2 nach Abhängigkeit festgelegt, nicht nach Attraktivität. Aufwandsschätzung und Baureihenfolge gehören in die Architekturdokumente (`05-ADRs.md`) — dieses Dokument bleibt lösungsneutral |
| **Betrieb / Regulatorik** | **Personenbezogene Daten auf Endgeräten liegen außerhalb der Löschautomatik.** Eine PWA, die Bewerberdaten offline vorhält, legt sie auf die Geräte der Bewohnenden. Ein Löschjob auf dem Server erreicht keinen Gerätecache. **Konflikt zwischen zwei bereits getroffenen Entscheidungen** (PWA in v1, ADR-011 · 180-Tage-Automatik, E-18) — aufgeworfen beim Prüfen von § 25 TDDDG, nicht im Brief enthalten | Die Löschautomatik wäre nachweisbar unvollständig, ohne dass es irgendwo auffällt. Zusätzlich: was auf dem Gerät liegt, erscheint in keiner Datenauskunft und überlebt jede Kürzung der Frist | **Der Service Worker cacht ausschließlich die App-Hülle** (S-30). Offline-Fähigkeit heißt „die App startet ohne Netz", nicht „die Daten sind ohne Netz da". Der wahrscheinliche Implementierungsfehler ist ein großzügiger Runtime-Cache, der API-Antworten mitnimmt — deshalb als Zeile in `03-PRD.md` §6.2 **und** als Akzeptanzkriterium formuliert, nicht als Konfigurationsempfehlung. **Eine benannte, begrenzte Ausnahme:** der Offline-Puffer für abgegebene `Vote`s (`03-PRD.md` §6.2). Er ist **keine gespeicherte Kopie, sondern eine noch nicht abgeschlossene Transaktion** — die Nutzlast einer Handlung, die die Person selbst ausgelöst hat und die noch läuft. § 25 TDDDG deckt das als „unbedingt erforderlich für den ausdrücklich gewünschten Dienst", und zwar **stärker** als das Caching der App-Hülle, weil hier eine konkret angeforderte Aktion sonst verlorengeht. **Ausdrücklich nicht** damit begründet, dass keine fremden Daten betroffen wären — eine `Vote` ist `application_id` plus Wert und damit ihrem Wesen nach eine Beurteilung **über eine dritte Person**. Die Ausnahme trägt nur, solange der Puffer den Versand **nicht überleben kann**: harte Höchstlebensdauer, keine Anzeigedaten, Verwerfen statt Wiederholen bei Ablehnung, Leerung bei Abmeldung |
| **Betrieb** | **Löschautomatik schlägt fehl oder feuert zu früh.** Beides ist schlecht: zu spät ist ein Rechtsverstoß, zu früh ist Datenverlust in einer laufenden Nachbesetzung | Verlorene Bewerbungen mitten in einer Runde, oder ein Verstoß gegen die Speicherbegrenzung, den niemand merkt | **Keine stille Löschung** (S-33): 14 Tage Vorwarnung mit drei Handlungsoptionen, Verlängerung protokolliert und begründungspflichtig. Löschläufe erzeugen `ActivityEvent`s und sind damit prüfbar. Fällt ein Lauf aus, ist die ausgebliebene Vorwarnung das Signal — nicht das ausgebliebene Löschen |

---

## 8. Feedback Loops

### 8.1 Stakeholder-Rückmeldung

| Punkt | Festlegung |
|-------|------------|
| **Wer** | (1) **Die Bewohnenden des ersten realen Haushalts** — die einzige belastbare Quelle, weil ihre Zustimmung zum Werkzeug höchstens informell und beiläufig war, kein eigenes Investment in die Nutzung. (2) **Bewerbende**, die eine Absage erhalten haben — die Gruppe mit dem geringsten Einfluss und dem größten Interesse; ihre Sicht ist nur über die WG erreichbar. (3) Fachliche Gegenlesung der Compliance- und Architekturentscheidungen. (4) Später: weitere Haushalte |
| **Wie erfasst** | Nach jeder abgeschlossenen `CastingRound` **eine** feste Frage an jede Person, schriftlich und einzeln (nicht in der WG-Runde, sonst antwortet die lauteste Stimme für alle): **„An welcher Stelle hättest du beinahe wieder WhatsApp benutzt?"** Ergänzend die Metriken aus §6 — die Frage erklärt, was die Zahl bedeutet. Zusätzlich, getrennt erhoben, an die moderierende Person: „Was hast du am Ende doch von Hand gemacht?" |
| **Priorisierung** | (1) Alles, was **Beratungsinhalte an die falsche Person** ausliefern könnte — sofort, vor allem anderen. (2) Alles, was **Beteiligung kostet** (Onboarding-Hürde, unklarer Stand, unnötiger Klick vor der ersten Stimme) — vor der nächsten Runde. (3) Alles, was die moderierende Person zurück in WhatsApp treibt — vor Abschluss von v1. (4) Alles, was Erklärbarkeit schwächt (P-3). (5) Rest in den Rückstand |

### 8.2 A/B-Testing

> ⚠️ **TBD — begründet nicht anwendbar in v1.**
>
> **Warum nicht:** Es existiert kein Traffic vor dem Launch, und danach ist die Nutzerbasis
> ein bis wenige Haushalte mit je fünf bis zehn Personen. Bei dieser Größe ist keine
> Aufteilung in Gruppen statistisch aussagekräftig — und eine Aufteilung *innerhalb* eines
> Haushalts wäre zusätzlich fachlich falsch: Wenn drei Bewohnende verdeckte Ergebnisse
> sehen und vier nicht, ist nicht die Variante gemessen, sondern das Verfahren beschädigt.
> Bei einem gemeinsamen Entscheidungsprozess ist die Gruppe die Einheit, nicht die Person.
>
> **Was stattdessen entscheidet:** die Metriken zweiter Ordnung aus §6 als qualitative
> Entscheidungsgrundlage (Auslösequote des zweiten Durchlaufs, Veto-Nutzung, Solver-Nutzung,
> Parser-Korrekturquote) plus die Ein-Frage-Rückmeldung aus §8.1. Zwei Einstellungen sind
> bewusst als Schalter statt als Experiment gebaut — verdeckte Ergebnisse (S-14) und
> der zweite Durchlauf (S-11) — sodass ein Haushalt sie *bewusst* ändern kann und die Wirkung
> berichtet, statt sie unbemerkt zugeteilt zu bekommen.
>
> **Wann es relevant wird:** ab mehreren Dutzend aktiven Haushalten, dann mit dem
> `Household` als Randomisierungseinheit und der Beteiligungsquote als primärer Kennzahl.
> Vor diesem Punkt ist dieser Abschnitt nicht zu füllen.

### 8.3 Vorher/Nachher-Daten

Es gibt keinen Vorzustand im selben System — der Vorzustand ist WhatsApp. Deshalb wird
**vor** dem ersten Einsatz eine Baseline im Testhaushalt erhoben, einmalig, an die zuletzt
durchgeführte Runde erinnernd:

| Frage | Erhebung | Vergleich nach der ersten Runde mit Flatmate.io |
|-------|----------|--------------------------------------------------|
| Wie viele der Bewohnenden haben beim letzten Casting über mindestens eine Bewerbung eine Meinung abgegeben? | Zählung aus der Erinnerung, plus Chatverlauf wenn zugänglich | **Die Baseline der Kernmetrik.** Ziel: über 80 % und über dem Ausgangswert |
| Wie viele Werkzeuge waren beteiligt? | Zählung | Ziel: Casting-bezogene Vorgänge (Bewerbungserfassung, Abstimmung, Terminfindung) laufen nicht mehr parallel im WhatsApp-Verlauf. Reduktion der Werkzeugzahl ist ein Nebeneffekt, kein Ziel — WhatsApp bleibt WG-interne Kommunikation, WG-Gesucht bleibt Anzeigenportal |
| Wie viele Personen haben organisiert? | Zählung | Ziel: mindestens zwei, oder eine mit spürbar weniger Aufwand |
| Wie lange von der ersten Bewerbung bis zur Zusage? | Schätzung in Tagen | Beobachtung, kein Zielwert — abhängig von der Bewerberlage |
| Wusstest du nach dem Casting, an dem du nicht teilnehmen konntest, wie die Person war? | Ja / teilweise / nein, je Person | Ziel: „ja" steigt. Direkte Messung von Schritt 8 der Belegkette |
| Wie oft musste eine Entscheidung zurückgenommen werden? | Zählung | Kalibriert die Erwartung an Rückwärtsübergänge (P-4) |

> ⚠️ TBD — Die Baseline ist noch nicht erhoben. Sie muss **vor** dem ersten Einsatz
> vorliegen; danach ist sie nicht mehr rekonstruierbar.

---

## 9. Produktanforderungen (Zusammenfassung)

Vollständig in `03-PRD.md`. Kernpunkte, jeweils mit der Scope-Zeile, aus der sie folgen:

- **Fünf Nutzergruppen mit unterschiedlichem Verhalten** (PRD §4.0.1, aus S-01…S-04):
  Haushalts-Account (verwaltet, **stimmt nicht ab**) · Moderator · Bewohnender ·
  ehemaliger Bewohnender (kein Zugriff, Stimmen bleiben) · Bewerbender ohne Konto.
  Die Trennung „verwaltet / stimmt ab" ist ausdrücklich **Klarheit, keine
  Sicherheitsgrenze** — sie ist nicht als Härtung darzustellen.
- **Nutzerflüsse über Seitengrenzen** (PRD §4.0.2, aus S-06…S-26): Registrierung → Beitritt
  → Runde anlegen → Bewerbungen erfassen → Screening → Rangliste → Einladen →
  Verfügbarkeiten → Termin → Casting → Notizen → Runde 2 → Zusage → Rückmeldung → Einzug,
  mit Verzweigungen für jeden Rückwärtsübergang.
- **Drei Zustandsmaschinen** (PRD §4.2, aus S-06, S-07, S-15): `Application`,
  `CastingRound`, `Room` — Übergänge in *einer* Tabelle deklariert, Rückwärtsübergänge
  erlaubt und auditiert (P-4). Details im Domänenmodell (`04-Domaenenmodell.md`).
- **Abstimmungsmathematik offengelegt** (PRD §4.2, aus S-10…S-12): Stufenwerte 0/1/3/5,
  Score als Mittelwert auf 0–100, Gewichte in der UI sichtbar (P-3, ADR-008).
- **Quorum als Anzeige, nicht als Sperre** (PRD §4.2, aus S-13): eigener Abschnitt „Warten
  auf Stimmen", Nenner ohne `moved_out`-Profile.
- **Sichtbarkeitsinvariante** (PRD §4.2 und §6.5, aus S-31): eine Prädikatregel über
  `Application.became_resident_id`, doppelt erzwungen, gültig für alle Ausgabekanäle
  inklusive `Notification` und Export.
- **Kanalneutrale Erfassung** (PRD §4.1, aus S-08, S-17): Formular und Paste-Parser
  erzeugen dasselbe `Application`; Zeitfenster-Parser und Link erzeugen dasselbe
  `AvailabilityWindow`. Parser-Vorschläge sind **immer** bestätigungspflichtig.
- **Zwei Achsen bei der Erfassung** (PRD §4.1, aus S-38): technischer Pfad *und*
  Erhebungsquelle. Letztere entscheidet über Art. 13 gegen Art. 14 und damit über eine
  Monatsfrist — sie darf deshalb nicht aus dem Pfad hergeleitet werden.
- **Absatzverwerfung im Erfassungsmoment** (PRD §4.1, aus S-39) als einziger wirksamer
  Hebel gegen Art.-9-Daten im Freitext.
- **Zuordnung früherer Bewerbungen** (PRD §4.1 und §6.5, aus S-40) als prozessuale Hälfte
  der Sichtbarkeitsinvariante.
- **Gegendarstellung statt Berichtigung** (PRD §7.1, aus S-41): `subject_statement` im
  Datenmodell in v1, Oberfläche in v1.1.
- **Terminfindung zweischichtig mit Erklärungspflicht** (PRD §4.1 und §4.4, aus
  S-18…S-21): Feasibility ohne Solver, Vorschlag mit Solver hinter einem Port,
  nachrechenbare Begründung und Relaxierung bei Unlösbarkeit.
- **Inhaltsregeln für Freitext und Notizen** (PRD §4.6, aus S-08, S-22): strukturierte
  Notiz-Prompts, sichtbarer Hinweis „schreib so, als könnte die Person es lesen", keine
  einladenden Strukturfelder für besondere Kategorien nach Art. 9.
- **Aufbewahrung und Betroffenenrechte als Produktfeatures** (PRD §4.3, aus S-33, S-34):
  Automatik mit 14-Tage-Vorwarnung, protokollierte Verlängerung, Datenauskunft pro
  `Application`.
- **Beteiligungs-Loop** (PRD §4.1, aus S-28, S-29): Quorum-Anzeige, Badge, Digest als
  Standard, Ereignisauswahl auf Haushalts- **und** Personenebene.

---

## 10. UI/UX-Anforderungen (Zusammenfassung)

Vollständig in `03-PRD.md` §4.1 und §6. Die Prinzipien, aus denen sich dort alles ableitet:

| Prinzip | Konsequenz |
|---------|-----------|
| **Mobile-first, nicht mobile-auch** | Die Stimmabgabe findet auf dem Telefon statt, im Bett, drei Minuten vor dem Einschlafen. Der Screening-Durchlauf ist der wichtigste Bildschirm und wird für diese Situation entworfen. Die Moderationsansichten (Raster, Solver, Einstellungen) dürfen Desktop bevorzugen — die Stimmabgabe nie (P-2) |
| **Der Weg zur ersten Stimme ist der kürzeste Weg der Anwendung** | Von Beitrittscode bis zur ersten abgegebenen `Vote` so wenige Schritte wie möglich; E-Mail-Verifikation blockiert die erste Abstimmung nicht. Jedes zusätzliche Feld ist gegen die Kernmetrik zu verteidigen |
| **Nichts Verstecktes, was das Ergebnis beeinflusst** | Stufenwerte, Score-Formel, Quorum-Nenner, verletzte Terminconstraints sind sichtbar — nicht in einer Hilfeseite, sondern dort, wo das Ergebnis steht (P-3) |
| **Ehrlichkeit über Grenzen statt beruhigender Formulierungen** | „In einer Fünfer-WG ist ein anonymes Veto mit Begründung nicht wirklich anonym." · „Das ist deine eigene Bewerbung — Stimmen und Notizen dazu sind für dich dauerhaft ausgeblendet." · „Verwaltung hat Lea eingeladen" statt eines erfundenen Personennamens. Wo das Produkt etwas nicht leisten kann, sagt es das |
| **Fehlende Beteiligung sichtbar, nicht weggerechnet** | „Warten auf Stimmen (3 von 7)" als eigener Abschnitt; „5 von 7 haben abgestimmt" im Rundenkopf. Nie ein Score, der so aussieht, als hätten alle abgestimmt |
| **Ein Zustand pro Bildschirm, eine Frage pro Karte** | Der Screening-Durchlauf stellt genau eine Frage. Der zweite Durchlauf (S-11) ist ein eigener Schritt im selben Kartenmuster, kein Modal im ersten Durchlauf und kein eigens gestalteter Bildschirm (S-47) |
| **Wiedereinstieg ohne Erinnerung** | Nach Monaten Pause muss der Rundenkopf in einem Blick beantworten: Was läuft? Was wird von mir erwartet? Was ist passiert, während ich weg war? |
| **Alle vier Zustände je Bildschirm** | Laden · Leer (mit Handlungsaufforderung) · Fehler (mit Wiederholung) · Keine Berechtigung (mit **Erklärung** statt Sperre — besonders bei greifender Selbst-Redaktion) |
| **Rückwärts ist ein normaler Weg, kein Fehlerdialog** | Zustandsrücknahmen sind sichtbar erreichbar und werden protokolliert, nicht hinter Warnungen versteckt (P-4) |
| **Barrierefreiheit als Pflicht** | Die vier Abstimmungsstufen nie allein über Farbe (Symbol + Text); der gestapelte Stimmungsbalken hat eine textliche Entsprechung; vollständige Tastaturbedienbarkeit des Screening-Durchlaufs; Kontrast ≥ 4,5:1 |
| **Keine Gamification des Sozialen** | Beteiligungsanzeigen benennen den Stand der Gruppe, nicht das Versäumnis Einzelner. Kein Ranking unter Bewohnenden, kein öffentlicher „hat noch nicht abgestimmt"-Pranger |
| **Reihenfolge nach Zeitdruck, mit genanntem Grund** | Offene Aufgaben werden nicht nach einer festen Rangliste, sondern nach echtem Fälligkeitsdatum sortiert, wo eines existiert; jede Aufgabe nennt ihren Grund („Termin morgen 17:00", „4 andere warten auf deine Notiz"). Regel und Datumsherkunft je Aufgabenart in `07-Screen-Inventar.md` §2, gespeist u. a. aus S-44/S-48 |
| **Moderation ist Mehraufwand, kein Nebeneffekt** | Jede Orga-Aufgabe führt direkt auf die Handlung, nie auf eine Liste zum Wiederfinden; was das System selbst weiß, wird keine Aufgabe; kein Zähler ohne Handlung. Trägt das Ziel „Organisationsaufwand senken" (§6) |

---

## 11. Offene Punkte nach diesem SRD

| # | Punkt | Warum wichtig | Vorschlag / Zuständigkeit |
|---|-------|---------------|---------------------------|
| ~~O-01~~ | ~~Quorum-Schwelle~~ | — | **Geklärt:** `quorum_share = 0,5`, konfigurierbar; ein Kandidat erscheint in der Rangliste, sobald **mindestens die Hälfte** der Stimmberechtigten abgestimmt hat (`ceil(0,5 × Nenner)`, bei 7 also 4). Ausgeschlagen wurde eine höhere Schwelle (2/3): eine Rangliste, die erst ab hoher Beteiligung erscheint, ist in den ersten Tagen leer — und eine leere Rangliste demotiviert genau die Beteiligung, die sie voraussetzt. Festlegung in `03-PRD.md` §4.2.4 |
| **O-02** | Aufbewahrungsfrist für `ActivityEvent` und Audit-Einträge | Der Feed enthält personenbezogene Ereignisse; die 180-Tage-Frist (S-33) ist für `Application`, `Vote`, `CastingNote` festgelegt, nicht für das Log. Ein Audit-Log, das mit den Daten gelöscht wird, kann seine Rechenschaftsfunktion nicht erfüllen — eines, das bleibt, hält Beratungsinhalte fest | `06-Compliance-Anhang.md` und `04-Domaenenmodell.md`. Tendenz: Ereignisse behalten, personenbezogene Nutzlast beim Löschen der Bezugsdaten mitlöschen und den Eintrag auf „gelöscht" reduzieren |
| ~~O-03~~ | ~~Verhalten bei Wiederbewerbung derselben Person~~ | — | **Geklärt:** Die Invariante greift über `became_resident_id` unabhängig von Runde und Zustand. Der Fund aus `04-Domaenenmodell.md` ist, dass das **nur für verknüpfte** `Application`s gilt und die Verknüpfung manuell erfolgt → **S-40** als prozessuale Hälfte, Prädikat in `04-Domaenenmodell.md`, Akzeptanzkriterium in `03-PRD.md` §6.5 |
| ~~O-04~~ | ~~Wie viele `CastingRound`s dürfen gleichzeitig offen sein?~~ | — | **Geklärt in `03-PRD.md` §4.2.2:** technisch mehrere erlaubt (Vermieter-Fall braucht das), in v1 in der Oberfläche nicht angeboten — genau eine als aktiv markierte Runde |
| ~~O-05~~ | ~~Spendenkommunikation und ihre Platzierung~~ | — | **Geklärt:** Nach der 3.–4. abgeschlossenen `CastingRound` eines Haushalts (Zählung über bestehende `round_started`/`round_closed`-Events) eine E-Mail an die Household-E-Mail (`Account.email` des Admin-Accounts), außerhalb des In-App-Flows, mit Spendenbitte. Kein In-App-Hinweis während einer laufenden Runde (schützt E-23s Begründung „Casten ist stressig genug"). Neue Scope-Zeile **S-43** im v1.1-Bereich von §5.4 — bedingt durch H-V4 aus dem Audit, geprüft erst nach der Concierge-Runde |
| **O-06** | Grenzwerte des Solvers (Anzahl Bewerbende × Slots × Bewohnende), ab denen die Rechenzeit unzumutbar wird | Bestimmt, ab welcher Problemgröße das Zeitlimit regelmäßig greift | **Das Verhalten am Limit ist geklärt** (S-20c: beste zulässige Lösung, gekennzeichnet; sonst Unlösbarkeits-Erklärung mit fester Relaxationsreihenfolge). Offen bleibt allein die Größenordnung → `05-ADRs.md` (ADR-005), Zeitbudget in `03-PRD.md` §6.1 |
| **O-07** | Baseline-Erhebung im Testhaushalt (§8.3) | Nach dem ersten Einsatz nicht mehr rekonstruierbar | Vor dem ersten Einsatz durchzuführen. Kein Dokumentations-, sondern ein Terminproblem |
| **O-08** | Wird die **bewerberseitige Token-Seite** für Verfügbarkeiten aus v1.1 nach v1 vorgezogen? | Der Entscheidungsteil des `00-Session-Brief.md` führt die hybride Verfügbarkeitserfassung als v1-Bestandteil, die Phasentabelle desselben Briefs stellt den Link nach v1.1 — eine Inkonsistenz der Quelle | **Auflösung ohne Nacharbeit unter beiden Lesarten:** Datenmodell in v1, Seite in v1.1 (S-17). Die manuelle Eingabe strukturierter „kann/kann nicht"-Fenster inklusive Freitext-Parser ist v1 und **vollwertig** — P-1 verlangt sie ohnehin; der Token-Link ist der Komfortpfad darüber. **Nutzerentscheidung**, ob die Seite vorgezogen wird |

---

## 12. Nächster Schritt

→ **`03-PRD.md`** — Funktionsspezifikation innerhalb dieses Schnitts: fünf Nutzergruppen
mit Rechtematrix, Nutzerflüsse über Seitengrenzen, Bildschirme mit einzeln prüfbaren
Akzeptanzkriterien (insbesondere für die Sichtbarkeitsinvariante, das Quorum-Verhalten und
die Rückwärts-Zustandsübergänge), Daten- und Geschäftslogik, Inhaltsregeln für Freitext und
Notizen, nichtfunktionale Anforderungen.

Parallel: **`04-Domaenenmodell.md`** und **`05-ADRs.md`** (Technologieentscheidungen,
Zustandsmaschinen als Tabellen, Sichtbarkeitsregeln als Prädikate) sowie
**`06-Compliance-Anhang.md`** und **`GUARDRAILS.md`**.
