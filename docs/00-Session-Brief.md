# 00 — Session-Brief: Flatmate.io

### Entscheidungsprotokoll der Anforderungs-Session · 2026-08-19 · historisch

> ⚠️ **Nicht mehr die maßgebliche Quelle.** Dieses Protokoll war der gemeinsame Kontrakt, aus dem
> die Kette geschrieben wurde. Seither ist die Kette auf V0.5/V0.6 gewachsen, und die
> Fachdokumente haben es an mindestens einer Stelle **überstimmt**: `02-SRD.md` §11 (O-08) und
> `03-PRD.md` §8 (P-O-07) stellen beide fest, dass dieses Protokoll beim Verfügbarkeits-Link
> *„in sich inkonsistent"* ist. Ein Dokument, das die Spezifikation bereits überstimmt hat, kann
> nicht der Stichentscheid sein. **Die Vorrangordnung steht in `README.md` der Dokumentenkette.**
> Was hier steht, bleibt wertvoll als *Begründung* — nicht als Vorschrift.

> **Status:** historisches Entscheidungsprotokoll · Stand 2026-08-19
> **Autor:** Samuel Zink (@SmokeyRGB)
> **Entstanden aus:** `Initial-Claude-Prompt.md` + fünf Fragerunden (Requirement-Writer-Session)
> **Redigiert 2026-09-09:** Sitzungs-IDs der drei Sub-Chats und lokale Pfade entfernt; die
> Entscheidungen selbst sind unverändert. Die Datei ist seit demselben Datum versioniert —
> vorher war sie über `.gitignore` aus dem Repository ausgeschlossen, obwohl sechs
> Dokumentenköpfe sie als verbindliche Quelle benannten.
> **Nachfolger:** `01-Problem-Framing.md` → `02-SRD.md` → `03-PRD.md` ·
> `04-Domaenenmodell.md` → `05-ADRs.md` · `06-Compliance-Anhang.md` → `GUARDRAILS.md` ·
> `review-log.md`

> **Zweck dieser Datei.** Sie ist die **gemeinsame Quelle** für die drei Sub-Chats, die die
> Fachdokumente schreiben. Alle hier getroffenen Entscheidungen sind **bereits verhandelt** und
> werden beim Schreiben der Dokumente **nicht neu aufgerollt**. Wer eine Entscheidung für falsch
> hält, meldet das zurück, statt sie eigenmächtig zu ändern.
>
> **Ausnahme:** `04-Domaenenmodell.md` und `05-ADRs.md` sind ausdrücklich als *unverbindlich und
> anfechtbar* zu kennzeichnen — sie sind ein erster Einstiegspunkt für die Projektplanung, keine
> finalen Constraints.

> **Sprachregelung.** Dokumente auf **Deutsch**. Bezeichner, Schema-, Feld- und Zustandsnamen auf
> **Englisch**, weil der spätere Code englisch entsteht.

> **Rechtlicher Vorbehalt.** Die Regulatorik-Abschnitte sind recherchiert und mit Quellen belegt,
> aber **keine Rechtsberatung**. Die Rollen- und AVV-Konstruktion sowie die Tragfähigkeit der
> Haushaltsausnahme gehören vor einem echten Launch anwaltlich geprüft.

---


## Context

Samuel Zink (@SmokeyRGB) startet die Entwicklung von **Flatmate.io**, einer Webanwendung, die den
Casting-Prozess für neue Mitbewohner:innen in größeren WGs zusammenführt. Heute verteilt sich
dieser Prozess über 13 manuelle Schritte auf Anzeigenportal, WhatsApp-Gruppe, Doodle und Zettel —
mit dem Ergebnis, dass die Organisationsarbeit bei einer Person hängenbleibt und die Beteiligung
der übrigen Bewohnenden einbricht.

Diese Session hatte das Ziel, **durchdachte Rahmenbedingungen** zu erarbeiten, nicht Code:
Problem, Scope, Architekturrichtung, Regulatorik und AI-Guardrails. In fünf Runden wurden alle
Produkt- und Architekturentscheidungen verhandelt — teils gegen den ersten Vorschlag der Beratung,
teils gegen die ursprüngliche Spezifikation. Dieser Brief hält sie fest, damit sie beim Schreiben
der Dokumente nicht neu verhandelt werden.

Ergebnis dieser Session ist die Dokumentenkette in diesem Ordner, konsistent zur Konvention der
bestehenden Ideen-Ordner (vgl. `Ideas/Notella/`): numerierte Dateien, Status- und
Änderungsbanner im Kopf.

**Sprachregelung:** Spezifikationsdokumente auf **Deutsch** (für das eigene Verständnis), aber
**Code, Identifier, Schema- und Feldnamen später auf Englisch**. Das Domänenmodell führt daher
englische Bezeichner mit deutscher Erläuterung. **Autor: Samuel Zink (@SmokeyRGB)** — kein
Institutionsbezug.

---

## Rechercheergebnisse (belegt — gehen als Benchmark und Risiko in die Dokumente ein)

### Wettbewerb — kein direkter Wettbewerber für den Beratungs- und Entscheidungsteil
- `besichtigungstermine.com` — kostenlos, DE, wirbt explizit mit „WG-Casting": Slot-Link,
  Buchung, Bestätigungen, Dashboard. Deckt Schritte 5–7 ab, kein Voting, keine Pipeline.
  **Ist auf den Link angewiesen** → Kanalneutralität (P-1) ist die Differenzierung.
- WG-Gesucht-Postfach — Tags, Dokumentenversand. Deckt Schritte 1–3, aber nur für **eine**
  Person. **Keine offizielle öffentliche API** (nur inoffizielle Login-Clients und Scraper).
- Doodle/When2meet (Schritt 6), Notion/Trello/Excel (alles, schlecht).
- **Der reale Wettbewerber ist WhatsApp plus Sprachnachricht.** Nutzungsprofil: ~5–10 Personen,
  die das Tool nicht ausgesucht haben, in Schüben von ~2–3 Wochen. **Frequenz korrigiert:** in
  Wohnprojekten und größeren WGs finden Castings **mehrmals pro Jahr** statt (bei acht Personen
  und ~2 Jahren Wohndauer ≈ vier Wechsel/Jahr), nicht alle 18 Monate. Das verschiebt zwei Dinge
  zum Besseren: Aktivierung lohnt sich *einmal* statt jedes Mal neu, und ein Spenden- oder
  Freemium-Modell wird überhaupt plausibel.
- Strukturelle Analogie: **Mini-ATS für WGs.** Benchmark für kollaborative Kandidatenbewertung =
  Ashby/Greenhouse-Muster (strukturierte Scorecards, verdeckte Stimmen bis zur eigenen Abgabe),
  **nicht** Roomi/Badi (Matching, nicht Gremienentscheidung).

### Regulatorik — geprüfte Fassung
- **Haushaltsausnahme** Art. 2 Abs. 2 lit. c DSGVO trägt hier mit hoher Wahrscheinlichkeit
  **nicht** (eng ausgelegt; bei privaten Vermietenden wurde Anwendbarkeit bereits angenommen).
  Rollenverteilung: **Haushalt = Verantwortlicher** für die Bewerberdaten, **Flatmate.io =
  Auftragsverarbeiter**; Flatmate.io ist zusätzlich Verantwortlicher für die eigenen
  Plattform-/Accountdaten. Folge: Click-Through-AVV, TOM-Liste, Art.-30-Verzeichnis, Löschkonzept.
- **Art. 15 erfasst auch Notizen — bestätigt.** Der EuGH legt „personenbezogene Daten" weit aus:
  auch subjektive Informationen in Form von **Stellungnahmen oder Beurteilungen**, solange es
  Informationen *über* die Person sind. BFH und BGH (2025) haben bestätigt, dass der
  Auskunftsanspruch **grundsätzlich auch interne Vermerke, Aktennotizen und interne Kommunikation**
  erfasst. Klare Grenze nur bei der *rechtlichen Bewertung* selbst (kein personenbezogenes Datum);
  „Lea wirkte unpünktlich" ist keine rechtliche Bewertung. Art. 15 Abs. 4 schützt Rechte Dritter —
  taugt zum Schutz der *Identität* bewertender Personen, nicht des Inhalts.
- **Die entscheidende Trennlinie ist „Küchentisch vs. System", nicht „Notiz vs. Fakt".**
  WhatsApp-Nachrichten zwischen Privatpersonen fallen unter die Haushaltsausnahme → DSGVO gilt
  dort nicht → kein Auskunftsanspruch. Dieselben Sätze in einem strukturierten Dateisystem einer
  Plattform: DSGVO gilt. **Flatmate.io erzeugt damit eine Compliance-Pflicht, die der
  WhatsApp-Status-quo nicht hatte** → eigener Risikoposten im SRD §7, nicht Fußnote. Zugleich das
  Designargument für strukturierte Notiz-Prompts, den Hinweis „schreib so, als könnte die Person
  es lesen" und knappe Fristen.
- **Auskunftspflichtig ist der Haushalt, nicht Flatmate.io.** Als Auftragsverarbeiter besteht nur
  eine Unterstützungspflicht (Art. 28 Abs. 3 lit. e) → Feature **„Datenauskunft erzeugen" pro
  Bewerbung** (Export aller zu dieser Person gespeicherten Daten). Klein, hoher Compliance-Wert.
- **Art. 14 — frühere Darstellung korrigiert, das befürchtete Problem existiert so nicht:**
  (1) **Für Auftragsverarbeiter gilt Art. 14 nicht** — kein eigener Verarbeitungszweck, die
  Informationspflicht bleibt beim Verantwortlichen. Flatmate.io muss niemanden informieren.
  (2) Im Regelfall ist es **Art. 13, nicht Art. 14**: hat die bewerbende Person ihre Bewerbung
  selbst geschickt (Portal-Nachricht, WhatsApp, Mail), sind die Daten *bei der betroffenen Person
  erhoben*; dass die WG sie danach eintippt, ändert die Erhebungsquelle nicht. Art. 14 greift nur
  bei echter Dritterhebung — Scraping (ausgeschlossen) oder Weiterleitung durch Dritte.
  (3) Der Copy-Paste-Textbaustein bleibt sinnvoll, aber als **Hilfsmittel für die WG**, nicht als
  eigene Pflichterfüllung.
- **Art. 9:** Freitext-Bewerbungen enthalten unvermeidlich besondere Kategorien → keine
  KI-Bewertung, keine einladenden Strukturfelder, strenge Aufbewahrung.
- **Speicherbegrenzung, Art. 5 Abs. 1 lit. e + Art. 17 Abs. 1 lit. a** — *das* ist der Löschgrund,
  nicht Art. 15. Eine Löschautomatik ist im Prinzip nicht optional, die **Frist** ist
  Auslegungssache. Belastbarster Anker: bei Bewerbungen gelten **~6 Monate** als Richtwert,
  abgeleitet aus AGG-Fristen (2 Monate Geltendmachung § 15 Abs. 4 AGG + 3 Monate Klagefrist
  § 61b Abs. 1 ArbGG + Puffer). Arbeitsrecht, nicht Mietrecht — aber der etablierteste
  Referenzwert und damit die Begründung für 180 Tage.
- **EU AI Act:** Hochrisiko-Regime seit 02.08.2026 in Kraft. Anhang III erfasst KI für den Zugang
  zu wesentlichen Diensten; wohnungsbezogene Entscheidungen und Mieter-Screening werden in diese
  Richtung eingeordnet, Profiling bleibt auch unter engen Ausnahmen hochrisikobehaftet.
  **Entscheidung: dieses Minenfeld wird nicht betreten.**
- **§ 25 TDDDG:** Geräte-Fingerprinting als Duplikatsschutz ist einwilligungspflichtig und damit
  praktisch unbrauchbar. Login-Session-Cookie ist unbedingt erforderlich, unproblematisch.
- **AGG § 19 Abs. 5:** bei WG-Zimmern besteht ein besonderes Nähe-/Vertrauensverhältnis →
  weitgehend ausgenommen. Bei mehreren Wohneinheiten (Vermieter) greift die Ausnahme **nicht**.

### Solver-Landschaft (auf explizite Nachfrage recherchiert)
- `munkres-js` (Hungarian, O(n³)) — **reicht nicht**: parallele Castings mit
  Mitglieder-Abdeckung, „max. N pro Tag", Mindestpuffer und „Person X muss dabei sein" sind
  **gekoppelte** Zuweisungen, die eine 1:1-bipartite Zuordnung grundsätzlich nicht ausdrücken kann.
- `or-tools-wasm` — **nicht von Google gepflegt**, Community-Rekompilierung. Google unterstützt
  OR-Tools für C++/Python/Java/.NET, nicht für JS/WASM.
- Offizielles `ortools`-Python-Paket — Google first-party, gleiche CP-SAT-Engine. **Gewählt.**
- Timefold Solver (Apache 2.0, Original-OptaPlanner-Team) — hat die *Recommended Fit API*;
  verworfen wegen zweiter Runtime und eigener DSL.
- `timetabling-solver` (genetisch) — **ausgeschlossen**: nichtdeterministisch, nicht erklärbar.
- CP-SAT ist nur deterministisch bei fixem Seed **und** einem Solver-Worker.

---

## Designprinzipien

- **P-1 Kanalneutralität** — jede Information, die über einen Link hereinkommen kann, muss auch
  von Hand einpflegbar sein; alle Erfassungspfade erzeugen dasselbe Domänenobjekt. Kein Feature
  darf einen Link voraussetzen. Bewerbende werden nie in die App gezwungen.
- **P-2 Geräteneutralität** — kein Bewohnender darf durch sein Gerät ausgeschlossen werden.
  Mobile-first, installierbare PWA in v1, kein App-Store, Passwort als universelle Auth-Methode.
- **P-3 Legitimität vor Optimalität** — Ranglisten und Terminvorschläge müssen erklärbar sein.
  Keine versteckten Formeln, keine nichtdeterministischen Verfahren.
- **P-4 Reversibilität** — jeder Pipeline-Zustand ist rückwärts erreichbar und auditiert;
  „Neuer Bewohner" ist nicht in Stein gemeißelt.
- **P-5 Keine KI in wohnungsbezogenen Entscheidungen** — KI erzeugt niemals Bewertungen,
  Rankings, Empfehlungen oder Entscheidungen über Personen. Zulässig ist ausschließlich
  **strukturierende Textverarbeitung** (Zusammenfassen, Extrahieren von Zeitfenstern). Ziel ist
  ausdrücklich, außerhalb der Hochrisiko-Einordnung von Anhang III zu bleiben.

---

## Getroffene Entscheidungen

### Zielgruppe und Nutzen
- **Beachhead: WGs und Wohnprojekte mit 5+ Bewohnenden.** Erst ab dieser Größe werden gemeinsame
  Terminorganisation und regelmäßiger Bewohnerwechsel zur Last — und dort finden Castings
  mehrmals pro Jahr statt.
- **Sekundär (Roadmap, nicht v1-Positionierung): Vermieter**, die Nachmieterprozesse für mehrere
  Wohnungen organisieren, während Bewohnende Präferenzen einbringen und die Castings durchführen.
- **Geschäftsmodell:** Non-Profit / spendenfinanziert. **Für Bewohnende dauerhaft kostenlos**
  („das Casten ist stressig genug", studentischer Kontext). Freemium erst in späteren Versionen
  für Vermieter mit mehreren Wohnungen. *Vermerk für das SRD: das ist genau die Ebene, auf der
  AGG und AI Act greifen — die zahlende Stufe finanziert die Compliance, die sie auslöst.*
- **Kernmetrik: Beteiligungsquote** — Anteil der stimmberechtigten Bewohnenden, die in einer Runde
  abgestimmt haben; Ziel > 80 %. Beobachtungsmetriken: aktivierte Bewohnende pro Haushalt,
  abgeschlossene / gestartete Runden, Zeit bis Entscheidung, Bewerbungen pro Runde, Medianzahl
  Stimmen pro Bewerbung, Runden pro Haushalt und Jahr.
- **A/B-Testing entfällt** (kein Traffic vor Launch) → SRD §8.2 als begründetes TBD.

### Terminologie
- Domänenbegriff **`Household`** (neutral gegenüber WG, Wohnprojekt, Haus und Vermieter-Fall),
  UI-Label in v1 durchgängig **„WG"**, später pro Objekt wählbar. Dokumente deutsch, Bezeichner
  englisch.

### Identität, Rollen, Onboarding
- **Registrierung erfolgt als Haushalt** (E-Mail + Passwort, Hinweis auf gemeinsam genutzte
  Adresse). Dieser Account ist der übergeordnete Admin-Account und ein **echtes Login**.
- **Der Haushalts-Account kann nicht abstimmen.** Er kann Orga selbst übernehmen oder
  Bewohner-Profile zu **Moderatoren** ernennen.
- Aus dem Haushalts-Account heraus kann ein **Bewohner-Profil** angelegt und zwischen
  Verwaltungs- und Bewohnerkontext **gewechselt** werden; alternativ Profil anlegen, direkt zum
  Moderator ernennen und nicht mehr wechseln.
- **Klarstellung (nicht Sicherheitsgrenze):** Jeder Bewohnende kann sich theoretisch auch im
  Haushalts-Profil anmelden, wenn E-Mail und Passwort bekannt sind. Die Trennung dient
  **ausschließlich der Klarheit** — nur Bewohnende stimmen ab, um Verwirrung zu vermeiden. Sie ist
  in den Dokumenten nicht als Härtung darzustellen.
- **Jedes Ereignis speichert Account *und* handelndes Profil** → Feed zeigt „Jonas hat Lea
  eingeladen" bzw. ehrlich „Verwaltung hat Lea eingeladen".
- **Vermieter-Fall fällt kostenlos heraus:** Objekt registrieren, kein Bewohner-Profil anlegen,
  Bewohnende treten per Code bei und stimmen ab. Architektonisch offen, in v1 nicht positioniert.
- `Membership` mit **orthogonalen Attributen** `is_resident` (bool) und `role`, statt einer
  Rollenhierarchie. Zusätzlich **einzeln vergebbare Berechtigungen** (Bewerber anlegen, Status
  ändern, Runde schließen, Termine bestätigen).
- **Ein Beitrittscode/-Link für den ganzen Haushalt**, nicht pro Person.
- Ein-Schritt-Registrierung für Bewohnende, **Passwort primär und universell** (P-2); Passkey als
  optionaler Komfort-Aufsatz nach der Registrierung, jederzeit abschaltbar. E-Mail-Verifikation
  nachgelagert, blockiert die erste Abstimmung nicht — aber keine sensiblen Inhalte per Mail vor
  Verifikation, und Verifikation vor Benachrichtigungsversand.
- **Duplikatsschutz strukturell, nicht technisch:** Bewohnerliste für alle sichtbar, Beitritte im
  Aktivitäts-Feed, Quorum-Anzeige gegen Bewohnerzahl, jedes Mitglied kann entfernen.
  Geräte-Fingerprinting verworfen (§ 25 TDDDG). **Magic-Link-Ansatz verworfen** (nicht
  gerätegebunden, muss abgespeichert werden).

### Abstimmung Runde 1 (Einladen)
- **Vierstufige Skala: Nein / Eher nicht / Finde gut / Unbedingt.** „Unbedingt" *ist* das
  Favoriten-Signal — dadurch entfällt ein zweiter Screening-Durchlauf.
- **Budget greift erst nach dem Screening:** während des Screenings frei und revidierbar; nach der
  letzten Karte ein **„Feinschliff"-Screen**, falls `Anzahl Unbedingt > ceil(Zimmer × 1,5)` → nur
  die Unbedingt-Kandidaten nebeneinander, direkt herabstufbar. Budget nur sichtbar, wenn
  überschritten. Abschaltbar (dann nur Hinweis „deine Stimmen differenzieren wenig").
- **Stufenwerte Nein 0 · Eher nicht 1 · Finde gut 3 · Unbedingt 5**, nicht-linear (die
  Entscheidungsgrenze liegt zwischen „Eher nicht" und „Finde gut"), Gewichte in der UI offengelegt.
- **Score = Mittelwert**, auf 0–100 skaliert — nicht Summe.
- **Listenansicht:** Score, sortierbar. **Einzelansicht:** gestapelter 4-Farben-Stimmungsbild-Balken.
- **Kandidaten unter Quorum erscheinen nicht in der Rangliste**, sondern in einem eigenen
  Abschnitt „Warten auf Stimmen (3 von 7)" darunter.
- **Ergebnisse verdeckt bis zur eigenen Stimmabgabe** (Anker-/Bandwagon-Effekt); Einstellung,
  Default an. Doppelnutzen: eingebauter Beteiligungsanreiz.
- Asymmetrie („ein starkes Nein wiegt mehr") wird **nicht** in Gewichte kodiert — dafür ist das
  Veto in Runde 2 zuständig.
- **Regel-Sperre:** Änderung des Abstimmungsverfahrens während einer laufenden Runde blockiert
  bzw. laut protokolliert.

### Abstimmung Runde 2 (Zusage) und Veto
- Zweite Runde über gecastete Bewerbende, gleiche Skala.
- **Veto:** Bewerbende mit Veto werden tief geranked, **nicht gelöscht** (Raum für Diskussion).
  Einstellbar: Begründungspflicht, Veto-Budget pro Runde (Default 1), Anonymität als **Opt-in**.
- **Anonymitäts-Ehrlichkeit:** in einer Fünfer-WG ist ein anonymes Veto mit Begründungspflicht
  nicht anonym — die UI muss das sagen. Default: Veto mit Begründung und Zuordnung.
- Vetos werden an einer Phasengrenze gesperrt (kein Veto nach „Zusage erteilt").

### Sichtbarkeit (Kernkonflikt — als harte Invariante gelöst, nicht als Heuristik)
> **Niemand darf Beratungsinhalte über sich selbst lesen — dauerhaft, unabhängig vom Rundenstatus.**

- Wird eine Bewerbung zum Bewohner: `Application.became_resident_id = ResidentProfile.id`. Jedes
  Beratungsartefakt (Stimme, Veto, Notiz, **Aggregat**, Ranglistenposition) mit
  `became_resident_id == aktuelles Profil` ist für dieses Profil unsichtbar — für immer. Die
  eigene Karte zeigt nur das Sachprofil mit ehrlichem Hinweis.
- **Eine** testbare Regel (Unit-Test + DB-seitig via Row-Level-Security) statt einer Statusabfrage,
  die man an fünf Stellen vergessen kann. Ersetzt die ursprünglich angedachte
  „offen/abgeschlossen"-Heuristik, die bei wiedereröffneten Runden und Wiederbewerbungen leckt.
- **Getrennt davon Rundensichtbarkeit:** Profil sieht nur Runden, in denen es Teilnehmer ist.
  Teilnehmer beim Rundenstart aus aktiven Bewohnenden gesnapshottet, danach explizit
  hinzufügbar/entfernbar. Neu eintretendes Profil sieht die Runde inklusive Historie zu *anderen*
  Kandidaten (Kontext nötig); die Selbst-Redaktion deckt den heiklen Teil ab.
- **Ausgezogene Bewohnende:** Zugriff bei `moved_out` sofort auf alle Runden entzogen. Stimmen
  bleiben erhalten, markiert als „ehemaliges Mitglied", **zählen** in abgeschlossenen Runden
  (Entscheidungsintegrität), werden aber aus dem **Quorum-Nenner offener Runden** herausgerechnet.

### Bewerbererfassung
- **v1: manuelles Formular + Paste-Parser** — Nachricht einfügen, **regelbasierte** Heuristik
  extrahiert Name/Alter/Kontakt/Text, Mensch bestätigt. Kanalunabhängig, null Rechtsrisiko.
- **Roadmap-Notiz:** langfristig ist ein **leichtgewichtiges KI-Parsing** denkbar, um
  unstrukturierte Texte zu erfassen, die regelbasiert nicht greifbar sind — strukturierte Eingabe
  ist Bewohnenden nicht immer zuzumuten. Zwei Bedingungen sind im Dokument festzuhalten: (a) der
  Eingabetext bleibt personenbezogen, also EU-Verarbeitung und AVV mit dem Modellanbieter nötig;
  (b) die Ausgabe bleibt auf **strukturierende Extraktion** begrenzt, niemals Bewertung — damit
  bleibt es unter P-5 und außerhalb Anhang III. Für den MVP genügt nicht-KI-basiertes Parsing.
- **WG-Gesucht-API verworfen.** Nutzerinitiierte Browser-Extension frühestens v1.2.
- **Verfügbarkeiten hybrid (P-1):** schmaler Token-Link zu *einer* Seite mit Zeitraster (kein
  Konto, keine weiteren Daten, trägt den Art.-13-Hinweis) **plus** vollwertige manuelle Eingabe
  strukturierter „kann / kann nicht"-Fenster — inklusive **Freitext→Zeitfenster-Parser**
  („Di 16-19", „dienstags ab 16", „nur abends", „am 3.9. nachmittags"), regelbasiert, Vorschlag
  **immer** bestätigungspflichtig, nie stillschweigend.
- Beim Markieren als „Eingeladen" erzeugt die App einen **Copy-Paste-Text** inklusive
  Datenschutzhinweis — als Hilfsmittel für den Haushalt (Art. 13 liegt beim Verantwortlichen).

### Terminfindung
- **Feasibility-Schicht ohne Solver:** Ausgrauen nicht-buchbarer Slots je Bewerbende ist eine
  reine Pro-Person-Prüfung, wird ohnehin gebraucht, unabhängig vom Solver.
- Verfügbarkeits-Raster des Haushalts mit Heatmap („4/7 können"), manuelles Legen, plus
  **„Vorschlag berechnen"**.
- **Solver: offizielles `ortools` (Python, CP-SAT) als lokaler Kindprozess von Node**, JSON über
  stdin/stdout. Ein Deployable, kein Netzwerk-Hop, Daten verlassen den Host nicht, gepflegte
  Engine. Hinter einem **Solver-Port**, damit austauschbar. Determinismus: fixer Seed **und** ein
  Worker. Kosten offen benannt: Docker-Image +~150 MB, Prozessstart 200–500 ms.
- **Nicht** über ganze Termin-Konfigurationen abstimmen (kombinatorisch überladen) — Bewohnende
  reagieren auf einzelne Slots (👍 / „kann nicht"), moderierende Person bestätigt.
- **Erklärbarkeit ist Pflicht-Feature (P-3):** (a) verletzte Soft-Terme nachrechnen →
  „Di 17:00 — 5/7 können"; (b) bei Unlösbarkeit harte Constraints einzeln relaxieren →
  „keine Lösung: Lea kann nur Di 16–19, dort können nur 2 von 7".
- Haushalts-Präferenzen als Gewichte/Constraints: „erst ab 18:00", „max. N pro Tag",
  „parallel erlaubt / nicht erlaubt", „mindestens X Bewohnende pro Casting", Mindestpuffer.

### Aufbewahrung und Löschung (revidiert)
- Begründung ist **Art. 5 Abs. 1 lit. e + Art. 17 Abs. 1 lit. a**, nicht Art. 15. Frist am
  AGG-abgeleiteten 6-Monats-Richtwert orientiert.
- **Notizen und Stimmen: 180 Tage** nach Rundenabschluss (heraufgesetzt von 90 — der Zweck
  „Nachbesetzung und Rückfragen" umfasst auch Notizen). **Bewerberprofile: 180 Tage.**
- **Protokollierter Verlängerungsknopf** pro Runde („Aufbewahrung um 180 Tage verlängern"), nicht
  unbegrenzt, mit Begründungsfeld.
- **14 Tage Vorwarnung** an den Moderator mit „verlängern / jetzt löschen / archivieren". Keine
  stille Löschung.
- Immer verfügbar: manuelles Löschen pro Bewerbung und pro Runde, **„Datenauskunft erzeugen"** pro
  Bewerbung.
- Haushalt kann **kürzen** (30/90/180), nicht beliebig verlängern.
- Notizen-Risikominderung: strukturierte Notiz-Prompts statt leerem Kasten, sichtbarer Hinweis
  „schreib so, als könnte die Person es lesen".

### Benachrichtigungen
- v1: In-App + E-Mail; Ereignisauswahl in Haushalts-Einstellungen **und** persönlichen
  Einstellungen. **Digest statt Einzelbenachrichtigungen** als Default.
- Web Push in v1.x mit dokumentiertem iOS-Vorbehalt (nur für zur Startseite hinzugefügte PWAs).
- Benachrichtigungsinhalte unterliegen derselben Sichtbarkeitspolicy — kein Leak von
  Beratungsinhalten an die falsche Person.

### Architektur („timeless")
1. **Explizite Zustandsmaschine statt Boolean-Flags.** `new → screened → invited → scheduled →
   interviewed → offer_made → moved_in`, Seitenzustände `rejected_by_household`,
   `declined_by_applicant`, `withdrawn`, `archived`. Übergänge in *einer* Tabelle deklariert,
   Rückwärtsübergänge erlaubt und auditiert (P-4). Eigene Zustandsmaschinen für Runde und Zimmer.
2. **Append-only Ereignis-Log** neben den normalen Tabellen (kein volles Event-Sourcing). Speist
   Aktivitäts-Feed, Benachrichtigungs-Fan-out, „was ist passiert, während ich weg war"
   (= Schmerzpunkt 8 der Ursprungsspezifikation), Undo und Rechenschaftspflicht.
3. **Eine Autorisierungsschicht, zweifach erzwungen** — zentrale Policy-Objekte plus Postgres
   Row-Level-Security. Begründung speziell für AI-Code: vergisst ein Agent ein
   `WHERE household_id = …`, liefert die DB trotzdem nichts.
4. **Modularer Monolith, Bounded Contexts, Domain-Events dazwischen:** `identity` · `casting` ·
   `deliberation` · `scheduling` · `notifications` · `audit`. Keine Cross-Context-Joins, per
   Import-Boundary-Lint erzwungen.
5. **Löschung/Aufbewahrung eingebaut:** jedes personenbezogene Feld deklariert in
   maschinenlesbarer `data-inventory.yml` (Zweck, Rechtsgrundlage, Aufbewahrung, Kategorie);
   CI-Check bricht bei nicht deklarierter Spalte. Dient gleichzeitig als Art.-30-Verzeichnis.
6. **Reiner Domänenkern:** Voting-Mathematik, Ranking, Zustandsmaschine, Termin-Kostenmodell und
   Zeitfenster-Parser als pure Funktionen ohne DB.
7. **Zimmer als eigene Entität mit eigenem Status** — nötig für „3 Zimmer, eines schon vergeben,
   Runde läuft weiter".
8. **Beteiligungs-Loop als First-Class-Feature** („5 von 7 haben abgestimmt", Badge „4 offene
   Bewerbungen warten auf dich", Digest).

### Phasenschnitt
| Phase | Inhalt |
|---|---|
| **v1** | Haushalt + Bewohner-Onboarding, Runde mit Zimmern, Bewerbererfassung (Formular + regelbasierter Paste-Parser), Card-Screening, Abstimmung R1 mit Feinschliff, Rangliste + Quorum, Status-Pipeline komplett, Verfügbarkeits-Raster + Feasibility + Solver-Knopf, Casting-Notizen, Abstimmung R2 + Veto, Kalenderansicht, Aktivitäts-Feed, In-App-/E-Mail-Benachrichtigungen, PWA, Aufbewahrungsautomatik mit Vorwarnung, Datenauskunft-Export |
| **v1.1** | Verfügbarkeits-Link für Bewerbende, Web Push, Punkte-Budget-Variante als Option, Textbausteine für Kontaktaufnahme |
| **v1.2** | Nutzerinitiierte Browser-Extension für Portal-Import |
| **v2** | Kalender-Sync (CalDAV/Google), leichtgewichtiges KI-Parsing unstrukturierter Texte (nur Extraktion, nie Bewertung — P-5), Vermieter-Persona mit AGG-/AI-Act-Prüfung, Freemium |

---

## Zu erstellende Dateien

Alle in diesem Ordner. Nummerierung folgt der Skill-Kette (Problem Framing → SRD → PRD);
weicht bewusst von Notella ab (dort PRD `02`, SRD `03`) — wird im Kopf vermerkt. Autor durchgängig
**Samuel Zink (@SmokeyRGB)**.

| Datei | Inhalt |
|---|---|
| `00-Session-Brief.md` | **(in dieser Session)** Inhaltsgleiche Kopie des Sitzungsplans im Projektordner — gemeinsame Vertragsdatei für die drei Sub-Chats und dauerhaftes Entscheidungsprotokoll dieser Session. |
| `01-Problem-Framing.md` | Problem Statement als flüssiger Absatz + Sechs-Feld-Tabelle (WHO / WHAT Problem / WHEN / WHAT Job / Kundennutzen / Geschäftsnutzen). Enthält die 13 Ist-Prozessschritte als Belegkette. |
| `02-SRD.md` | Kapitel 1–10 nach Vorlage. §5.1 Benchmark mit den recherchierten Wettbewerbern, §5.3 Scope In/Out, **§5.4 Phasenplanung aktiviert**, §6 Metriken mit Beteiligungsquote als Kernmetrik, §7 Risiken — darunter als eigener Posten **„Flatmate.io erzeugt eine Auskunftspflicht, die der WhatsApp-Status-quo nicht hatte"**, Adoption, Regulatorik, Solver-Determinismus, AI-Implementierungsrisiko. §8.2 A/B als begründetes TBD. **Bleibt lösungsneutral** — Stack in `05-ADRs.md`. |
| `03-PRD.md` | Kapitel 1–7 nach Vorlage. **Aktivierte optionale Sektionen: §4.0 Nutzerflüsse (Cross-Page)** und **§4.0 Nutzergruppen** (Haushalts-Account / Moderator / Bewohnender / ehemaliger Bewohnender / Bewerbender ohne Konto). §4.6 Inhaltsregeln für Freitext und Notizen. §6 nichtfunktional inkl. Barrierefreiheit, Sicherheit, Ausfallverhalten. Akzeptanzkriterien als prüfbare Checkboxen, insbesondere für die Sichtbarkeitsinvariante. |
| `04-Domaenenmodell.md` | **Status-Banner: unverbindlich, anfechtbar, erster Einstiegspunkt für die Projektplanung — keine finalen Constraints.** Englische Bezeichner mit deutscher Erläuterung: `Household`, `Account`, `ResidentProfile`, `Membership`, `Room`, `CastingRound`, `RoundParticipation`, `Application`, `Vote`, `Veto`, `CastingNote`, `AvailabilityWindow`, `Slot`, `Appointment`, `ActivityEvent`, `Notification`, `HouseholdSettings`. Drei Zustandsmaschinen, Bounded Contexts mit erlaubten Abhängigkeiten, Sichtbarkeitsregeln als Prädikate, Rangberechnung und Termin-Kostenmodell als Pseudocode. |
| `05-ADRs.md` | Numerierte Records (Kontext / Optionen / Entscheidung / Konsequenzen), jeweils **Status: Vorschlag — anfechtbar**. ADR-001 modularer Monolith · 002 Zustandsmaschine statt Flags · 003 Ereignis-Log · 004 Autorisierung zweifach (Policy + RLS) · 005 Solver via offiziellem `ortools` als Kindprozess · 006 Stack (Next.js/TypeScript, Postgres, Drizzle, EU-Hosting, self-hosted Auth) · 007 Passwort primär / Passkey optional · 008 vierstufige Skala + nachgelagertes Budget · 009 Kanalneutralität · 010 Datenbestandsverzeichnis als CI-Gate · 011 PWA statt native App · 012 Deutsch in Dokumenten, Englisch im Code. Hinweis, dass sie beim Repo-Aufsetzen nach `docs/adr/` aufgeteilt werden. |
| `06-Compliance-Anhang.md` | Rollenanalyse (Haushalt = Verantwortlicher, Flatmate.io = Auftragsverarbeiter + eigener Verantwortlicher für Plattformdaten), Haushaltsausnahme, **Art.-15-Analyse inkl. der „Küchentisch vs. System"-Trennlinie mit Belegen**, **korrigierte Art.-13/14-Abgrenzung**, Datenkategorien-Tabelle mit Rechtsgrundlage/Frist/Kategorie (Vorlage Art. 30), Betroffenenrechte-Flüsse Art. 15/16/17/20 inkl. „was sieht die Person bei einer Auskunft?", Art. 9 im Freitext, Speicherbegrenzung mit AGG-Anker, AI-Act-Einordnung mit P-5, TDDDG/Cookies, TOM-Skizze, Vermieter-Szenario mit AGG-/AI-Act-Verschiebung, **offene Rechtsfragen für die anwaltliche Prüfung**. Ausdrücklich keine Rechtsberatung. |
| `GUARDRAILS.md` | Regeln gegen AI-Implementierungsrisiken, **jede möglichst maschinell durchsetzbar** (Lint, CI, Test): Secrets nie im Repo/Log/Fixture (Secret-Scanning); keine echten Personendaten in Tests, Seeds, Fixtures; Policy-Schicht nie umgehen, RLS nie deaktivieren, kein `as any`, keine Lint-Ausnahmen; **geschützte Tests**, die nicht gelöscht oder abgeschwächt werden dürfen (Selbst-Redaktions-Invariante, Quorum, Zustandsübergänge); destruktive Migrationen nur mit menschlicher Freigabe; neue personenbezogene Spalte muss im Datenbestandsverzeichnis stehen; Tests nie schwächen, um CI grün zu bekommen; keine ungefragten Abhängigkeiten, Lizenzprüfung, Lockfile-Pflicht, keine `latest`-Versionen; Kontextgrenzen nicht per Ausnahme aufweichen; keine Bibliotheks-API ohne Verifikation gegen die installierte Version; Solver-Determinismus nicht „für Performance" ändern; **P-5 als nicht verhandelbare Zeile**; kein Bewerber-Freitext an ein Modell ohne Rechtsgrundlage und AVV; Scope-Disziplin. |
| `review-log.md` | **(in dieser Session, nach Rückmeldung aller drei Chats)** Multi-Rollen-Review + Retrospektive nach Notella-Konvention. |

---

## Ausführung — Delegation an drei bestehende Sub-Chats

Die Dokumente werden **nicht in dieser Session geschrieben**, sondern an drei vom Nutzer
vorbereitete Chats delegiert. Alle drei haben `Ideas\Flatmate.io` als Arbeitsverzeichnis und
können direkt in den Zielordner schreiben.

| Ziel-Chat | `sessionId` | Zu erstellen |
|---|---|---|
| **Flatmate.io: Problem Framing, PRD, SRD** | `(Sitzungs-ID entfernt)` | `01-Problem-Framing.md`, `02-SRD.md`, `03-PRD.md` |
| **Flatmate.io: Domänenmodell & ADR** | `(Sitzungs-ID entfernt)` | `04-Domaenenmodell.md`, `05-ADRs.md` |
| **Flatmate.io: Compliance & Guardrails** | `(Sitzungs-ID entfernt)` | `06-Compliance-Anhang.md`, `GUARDRAILS.md` |

### Schritt 0 — gemeinsame Vertragsdatei ✅ ERLEDIGT (= diese Datei)

Der Sitzungsplan lag außerhalb des Arbeitsverzeichnisses der drei Chats. Deshalb wurde er zuerst
als **`00-Session-Brief.md`** in den Projektordner geschrieben — inhaltlich identisch zum Sitzungsplan, aber innerhalb ihres `cwd` lesbar und dauerhaft
als Entscheidungsprotokoll dieser Session erhalten. Diese Datei ist der **gemeinsame Vertrag**:
alle drei Chats lesen sie, keiner verhandelt Entscheidungen neu.

### Schritt 1 — drei Handoff-Nachrichten (parallel)

Jede Nachricht enthält: Verweis auf `00-Session-Brief.md` als verbindliche Quelle, den eigenen
Datei-Scope, die geteilten Konventionen und die Rückmeldepflicht. Parallele Ausführung ist
zulässig, weil der Brief den Kontrakt fixiert.

**Geteilte Konventionen in allen drei Nachrichten:**
- Dokumente **deutsch**, Bezeichner/Schema/Code **englisch**.
- Autor durchgängig **Samuel Zink (@SmokeyRGB)** — kein Institutionsbezug.
- Kopfbanner mit Version, Datum `2026-08-19`, Vorgänger/Nachfolger-Verweisen wie bei Notella.
- Verbindliche Entitätsnamen: `Household`, `Account`, `ResidentProfile`, `Membership`, `Room`,
  `CastingRound`, `RoundParticipation`, `Application`, `Vote`, `Veto`, `CastingNote`,
  `AvailabilityWindow`, `Slot`, `Appointment`, `ActivityEvent`, `Notification`,
  `HouseholdSettings`.
- Verbindliche ADR-Nummerierung ADR-001 bis ADR-012 wie im Brief — damit
  Querverweise aus PRD und Compliance treffen, obwohl parallel geschrieben wird.
- Prinzipien **P-1 bis P-5** namentlich referenzieren, nicht umformulieren.
- **Keine Erfindungen:** Lücken als `> ⚠️ TBD — zu ergänzen` markieren.
- **Rückmeldung an diese Session** nach Fertigstellung: erstellte Dateien, getroffene
  Eigenentscheidungen, offene Punkte.

**Chat-spezifische Zusätze:**
- *Problem Framing / SRD / PRD:* Kette in dieser Reihenfolge schreiben. SRD bleibt
  **lösungsneutral** (kein Stack — der liegt in ADR-006). §5.4 Phasenplanung und die beiden
  optionalen PRD-Sektionen §4.0 (Nutzerflüsse, Nutzergruppen) sind **aktiviert**. Das
  Art.-15-Risiko ist ein **eigener Posten** in SRD §7, keine Fußnote.
- *Domänenmodell / ADR:* Status-Banner **„unverbindlich, anfechtbar, erster Einstiegspunkt —
  keine finalen Constraints"** prominent im Kopf; jeder ADR trägt **Status: Vorschlag —
  anfechtbar**. Drei Zustandsmaschinen, Sichtbarkeitsregeln als Prädikate, Rangberechnung und
  Termin-Kostenmodell als Pseudocode.
- *Compliance / Guardrails:* Ausdrücklich **keine Rechtsberatung**, Default-Positionen mit
  offenen Fragen für die anwaltliche Prüfung. Die geprüfte Fassung der Art.-13/14/15-Analyse aus
  dem Brief übernehmen (Auftragsverarbeiter ist **nicht** informationspflichtig; Regelfall ist
  Art. 13; „Küchentisch vs. System" als Trennlinie). In `GUARDRAILS.md` jede Regel möglichst als
  Lint-, CI- oder Testregel formulieren statt als Prosa-Appell.

### Schritt 2 — Integration in dieser Session

Nach Rückmeldung aller drei: Querprüfung der Kette und der Bezeichner-Konsistenz (Verifikation
3, 5, 6, 7), dann `review-log.md` mit Multi-Rollen-Review und Retrospektive schreiben. Gefundene
Lücken gehen als gezielte Folgenachricht an den jeweiligen Chat zurück, statt hier korrigiert zu
werden — damit bleibt jedes Dokument in der Hand seines Chats.

---

## Verifikation

Es entsteht in dieser Phase **kein Code** — die Verifikation ist dokumentarisch. `review-log.md`
und die Querprüfung erfolgen **in dieser Session**, die Fachdokumente in den drei Sub-Chats:

1. **Completeness-Scoring** nach `references/questioning-guide.md` (Ampel je Pflichtfeld) vor dem
   Generieren. Stand nach fünf Runden: alle Pflichtfelder von Problem Framing, SRD und PRD auf 🟢.
2. **Multi-Rollen-Review** nach Generierung — Produkt (Problem klar? Metriken messbar? Scope
   scharf?), Design (Szenarien konkret? Leer-, Lade- und Fehlerzustände?), Engineering
   (Backend/Schnittstellen klar? Datenquellen? nichtfunktionale Anforderungen?).
3. **Querprüfung der Kette:** jedes PRD-Feature lässt sich auf eine SRD-Scope-Zeile zurückführen,
   jede SRD-Scope-Zeile auf ein Problem-Framing-Feld.
4. **Prüfung gegen P-1 bis P-5:** kein Feature verletzt Kanalneutralität, Geräteneutralität,
   Erklärbarkeit, Reversibilität oder die KI-Grenze. Insbesondere: kein v1-Feature setzt einen Link
   an Bewerbende voraus.
5. **Sprach-Gegenprobe:** Dokumente deutsch, alle Bezeichner im Domänenmodell und in den ADRs
   englisch und untereinander konsistent.
6. **Guardrails-Gegenprobe:** jede identifizierte AI-Fehlerquelle hat eine überprüfbare Regel,
   möglichst als Lint-, CI- oder Testregel statt als Prosa-Appell.
7. **Compliance-Gegenprobe:** jedes personenbezogene Feld im Domänenmodell hat im
   Compliance-Anhang eine Zeile mit Zweck, Rechtsgrundlage und Frist.
8. **Retrospektive** in `review-log.md`: dünnste Abschnitte und welche Fragen früher hätten
   gestellt werden sollen.

---

## Quellen der Recherche

Diese Belege sind in den jeweiligen Fachdokumenten zu zitieren — insbesondere im
Compliance-Anhang und in ADR-005. Alle abgerufen am 2026-08-19.

**Wettbewerb und Portal-Anbindung**
- Besichtigungstermine App — WG-Casting: https://besichtigungstermine.com/de/wg
- WG-Gesucht Help Center (kein öffentliches API-Angebot): https://www.wg-gesucht.de/en/help-center.html
- Inoffizieller WG-Gesucht-Client (Login-basiert, nicht affiliiert): https://github.com/Zero3141/WgGesuchtAPI

**DSGVO — Haushaltsausnahme und Rollen**
- Die Haushaltsausnahme der DSGVO: https://www.dr-datenschutz.de/die-haushaltsausnahme-der-dsgvo/
- DSGVO-Anwendbarkeit auch bei privaten Vermietenden: https://www.datenschutzticker.de/2021/11/auch-bei-einem-privater-vermieter-kann-der-anwendungsbereich-der-dsgvo-eroeffnet-sein/
- Art.-30-Verzeichnis — Pflicht auch für Vermieter: https://www.mieterlink.de/blog/verarbeitungsverzeichnis-nach-art-30-dsgvo-pflicht-auch-fuer-vermieter

**DSGVO — Art. 15 und interne Notizen**
- BFH: Auskunftsrecht erfasst interne Vermerke und Stellungnahmen: https://www.stollfuss.de/blog/BFH-Auskunftsrecht-nach-Art.-15-DSGVO-Einsicht-in-interne-Vermerke-und-Stellungnahmen-2025-05-12
- BGH: Auskunftsanspruch kann Informationen aus internen Vorgängen umfassen: https://www.rechtssicher.info/bgh-auskunftsanspruch-gem-art-15-dsgvo-kann-auch-informationen-aus-internen-vorgaengen-umfassen
- Auskunftsanspruch auch bei Gesprächsnotizen und Telefonvermerken: https://arbeitsrechtanwalt.de/auskunftsanspruch-art-15-eu-dsgvo-auch-gespraechsnotizen-telefonvermerke/
- Reichweite und Grenzen des Auskunftsrechts (Infobrief Uni Würzburg): https://www.jura.uni-wuerzburg.de/fileadmin/0200-ma-netze-direkt/Infoblatt/Infobrief_Art._15_DSGVO.pdf

**DSGVO — Art. 13/14 und Auftragsverarbeiter**
- Informationspflicht bei indirekter Datenerhebung, Art. 14 gilt nicht für Auftragsverarbeiter: https://www.ratgeberrecht.eu/aktuell/informationspflicht-bei-indirekter-datenerhebung-art-14-dsgvo/
- Transparenz im Bewerbungsverfahren: https://www.datenschutz-praxis.de/betroffenenrechte/transparenz-im-bewerbungsverfahren/
- Art. 14 DSGVO im Volltext: https://dejure.org/gesetze/DSGVO/14.html

**DSGVO — Speicherbegrenzung und Löschfristen**
- Grundsatz der Speicherbegrenzung: https://www.dr-datenschutz.de/dsgvo-grundsatz-der-speicherbegrenzung/
- Bewerberdaten: Aufbewahrung und Löschung, AGG-abgeleiteter 6-Monats-Richtwert: https://www.externer-datenschutzbeauftragter-hamburg.de/blog/bewerberdaten-dsgvo-aufbewahrung-loeschung/
- Aufbewahrungsfrist für Bewerbungen: https://www.dr-datenschutz.de/aufbewahrungsfrist-wann-sind-bewerbungen-zu-loeschen/

**EU AI Act**
- Anhang III — Pflichten, Anwendungsbereich, Fristen: https://www.regulation-ai.eu/en/annex-iii/
- Die acht Hochrisiko-Kategorien des Anhangs III: https://casrai.org/dictionary/term/eu-ai-act-annex-iii-high-risk-use-cases
- Hochrisiko-KI-Systeme, Definitionen und Anforderungen: https://www.dpo-consulting.com/blog/high-risk-ai-systems

**Solver (für ADR-005)**
- Offizielles OR-Tools CP-SAT (Google, first-party): https://developers.google.com/optimization/cp/cp_solver
- CP-SAT Primer (Determinismus, Worker, Modellierung): https://d-krupke.github.io/cpsat-primer/01_installation.html
- or-tools-wasm — Community-Rekompilierung, NICHT von Google gepflegt: https://github.com/Axelwickm/or-tools-wasm
- Timefold Solver (Apache 2.0, Nachfolger von OptaPlanner): https://solver.timefold.ai/
- munkres-js (Hungarian, für die Feasibility-Ebene ausreichend, für gekoppelte Constraints nicht): https://www.npmjs.com/package/munkres-js
- timetabling-solver (genetisch — ausdrücklich AUSGESCHLOSSEN, nichtdeterministisch): https://www.npmjs.com/package/timetabling-solver
