# Problem Framing — Flatmate.io

### Zusammengeführter Casting-Prozess für neue Mitbewohnende in größeren WGs und Wohnprojekten

> **Status:** Entwurf V0.3 · 2026-08-31
> **Autor:** Samuel Zink (@SmokeyRGB)
>
> **Änderung ggü. V0.1:** ADR-009-Verweis an P-1 ergänzt · Hinweis aufgenommen, dass die
> Entscheidungstabelle **E-01…E-27** ausschließlich die Beschlüsse der Anforderungs-Session
> abbildet und **nicht** die späteren Funde der Querprüfung — diese leben als Scope-Zeilen
> **S-38 bis S-41** in `02-SRD.md` §5.3 (Stand dort: V0.4). · E-22 korrigiert (Benachrichtigungskanäle:
> Web Push jetzt v1 statt v1.1, E-Mail wird Fallback-Kanal für Resident-Accounts ohne
> installierte PWA/aktivierten Push) und E-23 um den O-05-Verweis ergänzt, dazu Präzisierungen bei
> WHO-Feld/R-02/R-03 zur informellen Werkzeug-Zustimmung — passend zu den neuen Scope-Zeilen
> **S-42 bis S-46** in `02-SRD.md`.
> **Vorgänger:** `Initial Claude Prompt.md` → `00-Session-Brief.md` (verbindliches Entscheidungsprotokoll)
> **Nachfolger:** `02-SRD.md` → `03-PRD.md` ·
> `04-Domaenenmodell.md` → `05-ADRs.md` · `06-Compliance-Anhang.md` → `GUARDRAILS.md` ·
> `review-log.md`

> **Nummerierungshinweis.** Diese Dokumentenkette folgt der logischen Reihenfolge
> **Problem Framing → SRD → PRD**, also `01` → `02-SRD.md` → `03-PRD.md`. Das weicht
> bewusst von `Ideas/Notella/` ab, wo das PRD `02` und das SRD `03` trägt. Begründung:
> Das SRD schneidet Scope, Phasen, Metriken und Risiken; das PRD spezifiziert innerhalb
> dieses Schnitts. Diese Richtung soll die Nummerierung sichtbar machen.

> **Sprachregelung.** Dokument deutsch. Alle Bezeichner, Schema-, Feld- und Zustandsnamen
> englisch, weil der spätere Code englisch entsteht (ADR-012). Das UI-Label für
> `Household` ist in v1 durchgängig **„WG"**.

---

## Problem Statement

In WGs und Wohnprojekten mit fünf und mehr Bewohnenden ziehen mehrmals im Jahr Menschen
aus und neue ein — bei acht Personen und rund zwei Jahren Wohndauer etwa vier Wechsel
pro Jahr. Jeder dieser Wechsel löst denselben, dreizehnschrittigen Prozess aus: Anzeige
schalten, Bewerbungen entgegennehmen, sie in den gemeinsamen Chat kopieren, abstimmen wer
eingeladen wird, Termine mit mehreren Bewerbenden gegen die Kalender von sieben
Bewohnenden legen, casten, die Abwesenden informieren, erneut abstimmen, zu- oder absagen,
das Ergebnis kommunizieren, den Einzug terminieren. Dieser Prozess verteilt sich heute
über ein Anzeigenportal, eine WhatsApp-Gruppe, ein Terminwerkzeug und Zettel am
Kühlschrank — vier Werkzeuge, von denen keines weiß, dass die anderen existieren.

Die Folge ist doppelt. **Erstens** bleibt die gesamte Organisationsarbeit bei genau einer
Person hängen: derjenigen, die die Anzeige geschaltet hat. Sie kopiert Bewerbungen ab,
zählt Reaktionen aus einem Chatverlauf zusammen, hält nach, wer noch nicht geantwortet
hat, und schreibt am Ende die Nachrichten. **Zweitens** bricht bei allen anderen die
Beteiligung ein, weil Mitmachen nicht unmöglich ist, sondern *unbequem*: Wer drei Tage
nicht in den Chat geschaut hat, findet die Bewerbung nicht mehr, weiß nicht, ob schon
abgestimmt wurde, und schreibt lieber nichts als etwas Falsches. Entscheidungen über die
eigene Wohnsituation werden dann faktisch von drei Leuten getroffen, die zufällig gerade
am Handy waren. Hinzu kommen zwei Nebenwirkungen, die in einem Nachrichtenstrom
strukturell unlösbar sind: Wer neu einzieht, während für weitere Zimmer noch gecastet
wird, sitzt in derselben Gruppe, in der zwei Wochen zuvor über sie oder ihn geurteilt
wurde — und wer ausgezogen ist, liest weiter mit.

**Flatmate.io** führt diese dreizehn Schritte in einer Anwendung zusammen, die den Prozess
als Zustandsverlauf abbildet statt als Nachrichtenstrom: Bewerbungen als Karten,
Abstimmung in einer erklärbaren vierstufigen Skala mit sichtbarem Quorum, Terminfindung
über ein Verfügbarkeitsraster mit nachrechenbaren Vorschlägen, Casting-Notizen für die
Abwesenden, eine zweite Abstimmungsrunde mit Veto, und einen Aktivitäts-Feed, der die
Frage „was ist passiert, während ich weg war?" in einem Bildschirm beantwortet. Zwei
Eigenschaften sind dabei nicht verhandelbar: **Kanalneutralität** — jede Information, die
über einen Link hereinkommen könnte, muss auch von Hand einpflegbar sein, weil Bewerbende
nie in die App gezwungen werden (P-1) — und die **Sichtbarkeitsinvariante**: niemand darf
Beratungsinhalte über sich selbst lesen, dauerhaft und unabhängig vom Rundenstatus.

Für die Bewohnenden bedeutet das: eine Stimme abgeben kostet zwei Minuten statt einer
Recherche im Chatverlauf, und die Organisationsarbeit ist nicht mehr an eine Person
gebunden. Für das Vorhaben bedeutet es einen belastbaren Nachweis, dass ein
Gremienentscheidungsprozess für Laien so gestaltet werden kann, dass die Beteiligung
*steigt* statt zu erodieren — messbar an einer einzigen Kernzahl, der **Beteiligungsquote
von über 80 %** der stimmberechtigten Bewohnenden pro Runde.

---

## Belegkette: Der Ist-Prozess in 13 Schritten

Die folgenden dreizehn Schritte stammen unverändert aus der Ausgangsbeschreibung
(`Initial Claude Prompt.md`) und sind die empirische Grundlage dieses Dokuments. Jede
Zeile benennt, wo der Schritt heute stattfindet und was dabei verloren geht.

| # | Schritt heute | Wo er stattfindet | Was dabei kaputt geht |
|---|---------------|-------------------|-----------------------|
| 1 | Online-Schaltung der Anzeige | Anzeigenportal (z. B. WG-Gesucht) | Eine Person besitzt den Zugang und wird damit unfreiwillig zur Prozesseigentümerin |
| 2 | Eintreffen von Bewerbungen | Portal-Postfach, WhatsApp, Mail, mündlich | Vier Eingangskanäle, kein gemeinsamer Ort. Nichts ist vollständig |
| 3 | Herauskopieren von Bewerbungen in den gemeinsamen Chat | WhatsApp-Gruppe | Reine Fleißarbeit für eine Person; Format zerfällt; nach 20 Bewerbungen ist der Verlauf unlesbar |
| 4 | Voting, wer eingeladen werden soll | WhatsApp (Reaktionen, Sprachnachrichten) | Kein Quorum sichtbar, kein Zwischenstand, Anker- und Bandwagon-Effekt durch offene Meinungsäußerung, Auszählen von Hand |
| 5 | Zusage für einen Casting-Termin an Bewerbende | Portal-Nachricht, WhatsApp, Mail | Wer wurde schon kontaktiert? Wer hat geantwortet? Nur die kontaktierende Person weiß es |
| 6 | Terminfindung (wann können Bewerbende, wann wer aus der WG) | Doodle, When2meet, Chat, Zettel | Kombinatorisch überladen: n Bewerbende × m Bewohnende × Präferenzen. In der Praxis wird geraten |
| 7 | Casting-Termin | vor Ort | Meist ist ein Teil der WG nicht da — bei sieben Personen fast immer |
| 8 | Austausch und Informierung der Abwesenden | WhatsApp, mündlich abends in der Küche | **Der zentrale Schmerzpunkt.** Wer nicht dabei war, entscheidet ohne Grundlage oder gar nicht |
| 9 | Abstimmung: Wie fand man die Person, soll eine Zusage erteilt werden? | WhatsApp | Wie Schritt 4, zusätzlich: kein Weg, ein starkes Nein zu artikulieren, ohne die Gruppe zu blockieren |
| 10 | Nachricht an Bewerbende | Portal, WhatsApp, Mail | Formulierungslast bei einer Person; Absagen bleiben oft ganz aus |
| 11 | Zusage/Absage der Bewerbenden | eingehende Nachricht | Landet im Postfach *einer* Person. Rücktritte nach erteilter Zusage kommen vor und werfen den Prozess zurück |
| 12 | Kommunikation der Rückmeldung an alle | WhatsApp | Information erreicht nicht alle; der Stand ist nirgends abfragbar |
| 13 | Einzugstermin kommunizieren | WhatsApp, Kalender-Screenshot | Kein gemeinsamer Kalender, kein Bezug zwischen Zimmer, Person und Datum |

**Verdichtung:** Die Schritte 1–3 sind Erfassungsarbeit, 4 und 9 sind
Gremienentscheidungen, 5, 10, 11 und 12 sind Kommunikation, 6 ist ein Planungsproblem,
8 ist Wissenstransfer, 7 und 13 sind Termine. Von diesen sechs Aufgabenarten deckt kein
heute verfügbares Werkzeug mehr als zwei ab (Benchmark in `02-SRD.md` §5.1).

---

## Kernfelder

| Feld | Beschreibung |
|------|--------------|
| **WHO** | **Beachhead (v1): WGs und Wohnprojekte mit 5+ Bewohnenden.** Erst ab dieser Größe werden gemeinsame Terminorganisation und Bewohnerwechsel zur Last — und erst dort finden Castings mehrmals pro Jahr statt (bei acht Personen und ~2 Jahren Wohndauer ≈ vier Wechsel/Jahr). Nutzungsprofil: ~5–10 Personen, die das Werkzeug **in der Regel informell als Haushalt** übernehmen — eine organisierende Person (selbst Bewohnende:r) schlägt es vor, der Rest stimmt zumindest stillschweigend zu, bevor sich irgendwer registriert; nur im Einzelfall entscheidet sie über den Kopf der WG hinweg —, in Schüben von ~2–3 Wochen.<br>**Fünf Nutzergruppen** (Details in `03-PRD.md` §4.0.1): **Haushalts-Account** (`Household` + `Account`, verwaltet, stimmt nicht ab) · **Moderator** (`Membership.role`, treibt die Runde) · **Bewohnender** (`ResidentProfile` mit `Membership.is_resident = true`, stimmt ab) · **ehemaliger Bewohnender** (`moved_out`, kein Zugriff, Stimmen bleiben) · **Bewerbender ohne Konto** (`Application`, wird nie zur Registrierung gezwungen — P-1).<br>**Sekundär (Roadmap, nicht v1-Positionierung):** Vermietende, die Nachmieterprozesse für mehrere Wohnungen organisieren, während Bewohnende Präferenzen einbringen und die Castings durchführen. Fällt architektonisch kostenlos heraus (Objekt registrieren, kein `ResidentProfile` anlegen, Bewohnende treten per Code bei), wird in v1 aber nicht beworben — dort greifen AGG § 19 und der EU AI Act anders (siehe `06-Compliance-Anhang.md`). |
| **WHAT Problem** | • **Der Prozess hat 13 Schritte und kein Zuhause.** Er verteilt sich über Anzeigenportal, WhatsApp-Gruppe, Doodle und Zettel; kein Werkzeug kennt den Zustand des Ganzen (Belegkette oben).<br>• **Die Organisationsarbeit hängt an einer Person.** Wer die Anzeige geschaltet hat, kopiert Bewerbungen ab, zählt Reaktionen aus, hält nach und schreibt die Nachrichten. Fällt sie aus, steht der Prozess.<br>• **Die Beteiligung bricht ein, weil Mitmachen unbequem ist.** Im Chatverlauf ist nach drei Tagen nicht mehr auffindbar, worüber gerade abgestimmt wird, ob man selbst schon abgestimmt hat und wie viele noch fehlen. Entscheidungen fallen faktisch durch die zwei bis drei Personen, die zufällig online waren.<br>• **Abwesende können nicht mitentscheiden.** Bei sieben Bewohnenden ist beim Casting fast immer jemand nicht da. Der Austausch danach passiert mündlich und erreicht nicht alle (Schritt 8).<br>• **Meinungsäußerung im offenen Chat verzerrt das Ergebnis.** Wer als Dritte antwortet, hat zwei Meinungen gelesen (Anker- und Bandwagon-Effekt). Ein „ich fand sie schwierig" gegen vier Begeisterte sagt niemand.<br>• **Terminfindung ist ein echtes Planungsproblem, das von Hand geraten wird.** Mehrere Bewerbende mit Wunschzeiten gegen die Kalender von sieben Bewohnenden, plus Haushaltsregeln („erst ab 18:00", „nicht mehr als zwei an einem Tag").<br>• **Neu Eingezogene sitzen in der Runde, in der über sie geurteilt wurde.** Wird für drei Zimmer gecastet und eine Person zieht in eines ein, tritt sie zurecht der laufenden Runde bei — und sähe im Chat die Diskussion über sich selbst.<br>• **Ausgezogene lesen weiter mit.** Aus einer WhatsApp-Gruppe wird niemand zuverlässig entfernt.<br>**Heutiger Workaround:** WhatsApp-Gruppe plus Sprachnachricht plus Doodle plus Zettel, kombiniert mit „einer macht das" — was beide Kernprobleme erzeugt statt löst. |
| **WHEN** | Der Schmerz hat **drei** Momente:<br>**(1) Wenn die Bewerbungswelle eintrifft** — innerhalb von zwei bis drei Wochen kommen Dutzende Nachrichten über vier Kanäle. Genau dann fällt die Entscheidung, ob überhaupt jemand außer der organisierenden Person mitliest.<br>**(2) Wenn abgestimmt werden soll** — die Person hat drei Tage nicht in den Chat gesehen, findet die Bewerbung nicht mehr, weiß nicht, ob es noch relevant ist, und schweigt.<br>**(3) Nach dem Casting, an dem man nicht teilnehmen konnte** — „wie war sie?" wird abends in der Küche beantwortet, für die Hälfte der WG also nie. Direkt danach soll dieselbe Person über eine Zusage abstimmen. |
| **WHAT Job** | Als WG oder Wohnprojekt **gemeinsam und nachvollziehbar entscheiden, wer einzieht** — ohne dass die Arbeit an einer Person hängen bleibt, ohne dass jemand außen vor bleibt, weil er gerade nicht im Chat war, und ohne dass am Ende jemand mitliest, der es nicht dürfte. Der entscheidende Zusatz gegenüber jedem Terminwerkzeug und jedem Chat: **die Beteiligung muss steigen, nicht nur die Organisationsarbeit sinken.** |
| **WHAT benefits for the customer** | • **Eine Stimme kostet zwei Minuten statt einer Recherche.** Karten-Screening mit vier klaren Stufen (Nein / Eher nicht / Finde gut / Unbedingt); „Unbedingt" ist zugleich das Favoriten-Signal, ein zweiter Durchlauf entfällt.<br>• **Der Stand ist jederzeit sichtbar.** „5 von 7 haben abgestimmt" steht am Bildschirm, nicht in 200 Chatnachrichten. Kandidaten unter Quorum erscheinen getrennt unter „Warten auf Stimmen (3 von 7)".<br>• **Niemand wird durch Abwesenheit ausgeschlossen.** `CastingNote`s und der `ActivityEvent`-Feed beantworten „was ist passiert, während ich weg war" auf einem Bildschirm.<br>• **Unverzerrte Meinungsbildung.** Ergebnisse bleiben bis zur eigenen Stimmabgabe verdeckt (Standardeinstellung) — das schützt vor dem Ankereffekt und ist zugleich der eingebaute Beteiligungsanreiz.<br>• **Ein starkes Nein ist artikulierbar, ohne die Gruppe zu blockieren.** Das `Veto` in Runde 2 rankt tief, löscht aber nicht — Raum für Diskussion bleibt.<br>• **Terminvorschläge, die man nachrechnen kann.** „Di 17:00 — 5/7 können"; bei Unlösbarkeit wird der Grund benannt statt eine Fehlermeldung gezeigt (P-3).<br>• **Niemand muss die App benutzen, um berücksichtigt zu werden.** Bewerbende werden nie zur Registrierung gezwungen; alles ist von Hand einpflegbar (P-1). Kein Bewohnender wird durch sein Gerät ausgeschlossen (P-2).<br>• **Man liest nie eine Beurteilung über sich selbst.** Dauerhaft, unabhängig vom Rundenstatus — als Invariante, nicht als Einstellung.<br>• **Dauerhaft kostenlos für Bewohnende.** Das Casten ist stressig genug. |
| **WHAT benefits for the company** | Als **Non-Profit-/spendenfinanziertes Vorhaben** mit Portfolio-Charakter und späterer Produktoption:<br>• **Kernnachweis (primär): Beteiligungsquote > 80 %** — Anteil der stimmberechtigten Bewohnenden, die in einer Runde abgestimmt haben. Das ist die einzige Zahl, an der das Produktversprechen scheitern oder gelingen kann.<br>• **Fachlicher Nachweis:** Ein Gremienentscheidungsprozess — strukturell ein **Mini-ATS für WGs** — lässt sich für Laien so gestalten, dass er ohne Schulung funktioniert, bei Nutzenden, deren Zustimmung zur Werkzeugwahl meist nur informell und beiläufig zustande kommt statt durch ein echtes Investment in die Nutzung.<br>• **Echte Nutzung:** Mindestens ein realer Haushalt führt eine vollständige Runde von der ersten `Application` bis `moved_in` durch, ohne nach WhatsApp auszuweichen.<br>• **Nachweis über Compliance-by-Design:** Löschautomatik, Datenauskunft pro `Application` und maschinenlesbares Datenbestandsverzeichnis als CI-Gate (ADR-010) sind Teil des Produkts, nicht ein nachgelagertes Projekt.<br>• **Optionswert:** Der Vermieter-Fall ist architektonisch offen, weil `Household` gegenüber WG, Wohnprojekt und Vermietungsobjekt neutral ist. Ein späteres Freemium für Mehrfach-Vermietende bleibt möglich, ohne dass v1 dafür Aufwand trägt. **Vermerk:** Genau auf dieser Ebene greifen AGG und AI Act — die zahlende Stufe finanziert die Compliance, die sie selbst auslöst.<br>• **Vorzeigbarkeit:** Dokumentierte Architektur- und Rechtsentscheidungen (`05-ADRs.md`, `06-Compliance-Anhang.md`) als Abschluss- und Portfolioartefakt. |

---

## Designprinzipien

Diese fünf Prinzipien sind im `00-Session-Brief.md` verbindlich festgelegt und werden in
allen Folgedokumenten **namentlich** referenziert, nicht umformuliert. Jedes Feature in
`03-PRD.md` ist gegen sie prüfbar.

| # | Prinzip | Kern |
|---|---------|------|
| **P-1** | **Kanalneutralität** (ADR-009) | Jede Information, die über einen Link hereinkommen kann, muss auch von Hand einpflegbar sein; alle Erfassungspfade erzeugen dasselbe Domänenobjekt. Kein Feature darf einen Link voraussetzen. Bewerbende werden nie in die App gezwungen. |
| **P-2** | **Geräteneutralität** | Kein Bewohnender darf durch sein Gerät ausgeschlossen werden. Mobile-first, installierbare PWA in v1, kein App-Store, Passwort als universelle Auth-Methode. |
| **P-3** | **Legitimität vor Optimalität** | Ranglisten und Terminvorschläge müssen erklärbar sein. Keine versteckten Formeln, keine nichtdeterministischen Verfahren. |
| **P-4** | **Reversibilität** | Jeder Pipeline-Zustand ist rückwärts erreichbar und auditiert; „Neuer Bewohner" ist nicht in Stein gemeißelt. |
| **P-5** | **Keine KI in wohnungsbezogenen Entscheidungen** | KI erzeugt niemals Bewertungen, Rankings, Empfehlungen oder Entscheidungen über Personen. Zulässig ist ausschließlich **strukturierende Textverarbeitung** (Zusammenfassen, Extrahieren von Zeitfenstern). Ziel ist ausdrücklich, außerhalb der Hochrisiko-Einordnung von Anhang III des EU AI Act zu bleiben. |

---

## Bestätigte Rahmenentscheidungen

Diese Punkte sind in fünf Fragerunden geklärt (`00-Session-Brief.md`) und gelten als
Eingangsvoraussetzung für SRD und PRD. Sie werden dort **nicht neu verhandelt**. Die
E-Nummern sind Zitierhilfen dieses Dokuments; die inhaltliche Quelle ist der Brief.

> **Diese Tabelle ist nicht das vollständige Entscheidungsverzeichnis des Vorhabens.** Sie
> hält fest, was in der Anforderungs-Session beschlossen wurde. Später kamen Festlegungen aus
> der Querprüfung mit `04-Domaenenmodell.md` und `06-Compliance-Anhang.md` hinzu — Art.-13/14-Weiche
> bei der Erfassung, Absatzverwerfung im Paste-Parser, Zuordnung früherer Bewerbungen derselben
> Person, Gegendarstellung, Service-Worker-Grenze. Sie leben als **Scope-Zeilen S-38 bis S-41**
> und in den Risiken von `02-SRD.md` §5.3 und §7, nicht hier, weil sie keine Beschlüsse der
> Session sind. Wer den vollständigen Stand sucht, liest das SRD.

| # | Entscheidung | Begründung / Konsequenz |
|---|---|---|
| E-01 | **Beachhead sind WGs und Wohnprojekte mit 5+ Bewohnenden**, nicht WGs allgemein. | Erst dort ist Terminorganisation eine Last und der Wechsel regelmäßig. Korrigiert die Frequenzannahme: mehrmals pro Jahr, nicht alle 18 Monate. Damit lohnt sich Aktivierung *einmal* statt jedes Mal neu — und ein Spenden- oder Freemium-Modell wird überhaupt plausibel. |
| E-02 | **Domänenbegriff `Household`, UI-Label in v1 durchgängig „WG".** | `Household` ist neutral gegenüber WG, Wohnprojekt, Haus und Vermietungsobjekt. Später pro Objekt wählbares Label, in v1 eine feste Bezeichnung ohne Konfigurationsentscheidung. |
| E-03 | **Registrierung erfolgt als Haushalt** (E-Mail + Passwort, Hinweis auf gemeinsam genutzte Adresse). Dieser `Account` ist der übergeordnete Verwaltungszugang und **kann nicht abstimmen**. Aus ihm heraus kann ein `ResidentProfile` angelegt und zwischen Verwaltungs- und Bewohnerkontext gewechselt werden. | Löst den Eigentümerwechsel ohne Übertragungsmechanik: der Zugang hängt an einer WG-Adresse, nicht an einer Person. Die Trennung „verwaltet" / „stimmt ab" dient **ausschließlich der Klarheit** und ist ausdrücklich **keine Sicherheitsgrenze** — wer E-Mail und Passwort kennt, kann sich auch im Haushalts-Profil anmelden. In den Dokumenten daher nicht als Härtung darzustellen. |
| E-04 | **`Membership` mit orthogonalen Attributen** `is_resident` (bool) und `role`, plus einzeln vergebbare Berechtigungen (Bewerber anlegen, Status ändern, Runde schließen, Termine bestätigen) — statt einer Rollenhierarchie. | Deckt Moderator, Bewohnender, Verwaltung und den Vermieter-Fall ohne Sonderlogik ab. Ein `ResidentProfile` kann zum Moderator ernannt werden, ohne das Stimmrecht zu verlieren. |
| E-05 | **Ein Beitrittscode/-Link für den ganzen Haushalt**, nicht pro Person. Ein-Schritt-Registrierung, **Passwort primär und universell**, Passkey als optionaler, jederzeit abschaltbarer Aufsatz (ADR-007). E-Mail-Verifikation nachgelagert — blockiert die erste Abstimmung nicht, aber keine sensiblen Inhalte per Mail und keine Benachrichtigungen vor Verifikation. | P-2: kein Bewohnender scheitert am Gerät. Der Magic-Link-Ansatz wurde verworfen (nicht gerätegebunden, muss abgespeichert werden). |
| E-06 | **Duplikatsschutz strukturell, nicht technisch:** Bewohnerliste für alle sichtbar, Beitritte im `ActivityEvent`-Feed, Quorum-Anzeige gegen die Bewohnerzahl, jedes Mitglied kann entfernen. | Geräte-Fingerprinting ist nach § 25 TDDDG einwilligungspflichtig und damit praktisch unbrauchbar. Soziale Kontrolle in einer 7er-WG ist wirksamer als jede technische Hürde. |
| E-07 | **Vierstufige Skala in beiden Runden: Nein / Eher nicht / Finde gut / Unbedingt**, Stufenwerte 0 · 1 · 3 · 5, Score als **Mittelwert** auf 0–100 skaliert. Gewichte in der UI offengelegt (ADR-008). | „Unbedingt" *ist* das Favoriten-Signal — ein zweiter Screening-Durchlauf entfällt. Die Werte sind nicht-linear, weil die Entscheidungsgrenze zwischen „Eher nicht" und „Finde gut" liegt. Mittelwert statt Summe, damit unterschiedliche Stimmenzahlen vergleichbar bleiben. Offenlegung ist P-3. |
| E-08 | **Budget greift erst nach dem Screening.** Während des Screenings frei und revidierbar; nach der letzten Karte ein „Feinschliff"-Screen, falls `Anzahl Unbedingt > ceil(Anzahl Zimmer × 1,5)` — nur die Unbedingt-Kandidaten nebeneinander, direkt herabstufbar. Budget nur sichtbar, wenn überschritten. Abschaltbar (dann nur der Hinweis „deine Stimmen differenzieren wenig"). | Ein Budget *während* des Durchlaufs erzwingt Entscheidungen ohne Überblick. Die Korrektur passiert dort, wo alle Karten bekannt sind — und nur dann, wenn die Stimmen tatsächlich zu wenig differenzieren. |
| E-09 | **Ergebnisse bleiben bis zur eigenen Stimmabgabe verdeckt** (Einstellung, Standard an). | Schützt vor Anker- und Bandwagon-Effekt und ist gleichzeitig der eingebaute Beteiligungsanreiz — der Doppelnutzen ist der Grund für den Standardwert. |
| E-10 | **Kandidaten unter Quorum erscheinen nicht in der Rangliste**, sondern in einem eigenen Abschnitt „Warten auf Stimmen (3 von 7)" darunter. | Eine Rangliste aus zwei Stimmen ist keine Rangliste. Die Trennung macht den fehlenden Beitrag sichtbar, statt ihn wegzurechnen. |
| E-11 | **`Veto` in Runde 2 rankt tief, löscht nicht.** Einstellbar: Begründungspflicht, Veto-Budget pro Runde (Standard 1), Anonymität als **Opt-in**. Standard: mit Begründung und Zuordnung. Vetos werden an einer Phasengrenze gesperrt (kein Veto nach `offer_made`). | Raum für Diskussion bleibt (sechs Begeisterte, ein Veto). Die Asymmetrie „ein starkes Nein wiegt mehr" wird bewusst **nicht** in die Gewichte kodiert, sondern hier lokalisiert. **Ehrlichkeitspflicht der UI:** in einer Fünfer-WG ist ein anonymes Veto mit Begründungspflicht nicht anonym — das muss dort stehen. |
| E-12 | **Sichtbarkeitsinvariante:** *Niemand darf Beratungsinhalte über sich selbst lesen — dauerhaft, unabhängig vom Rundenstatus.* Umsetzung über `Application.became_resident_id`; jedes Beratungsartefakt (`Vote`, `Veto`, `CastingNote`, Aggregat, Ranglistenposition) mit `became_resident_id == aktuelles Profil` ist für dieses Profil unsichtbar — für immer. Die eigene Karte zeigt nur das Sachprofil mit ehrlichem Hinweis. | **Eine** testbare Regel statt einer Statusabfrage, die man an fünf Stellen vergessen kann — doppelt erzwungen über Policy-Schicht und Row-Level-Security (ADR-004). Ersetzt die ursprünglich angedachte „offen/abgeschlossen"-Heuristik, die bei wiedereröffneten Runden und Wiederbewerbungen leckt. |
| E-13 | **Rundensichtbarkeit getrennt von E-12:** ein Profil sieht nur Runden, in denen es über `RoundParticipation` Teilnehmer ist. Teilnehmer werden beim Rundenstart aus den aktiven Bewohnenden gesnapshottet, danach explizit hinzufügbar und entfernbar. | Ein neu eintretendes Profil braucht die Historie zu den *anderen* Kandidaten als Kontext; den heiklen Teil deckt E-12 ab. Zwei getrennte Regeln sind hier einfacher und testbarer als eine kombinierte. |
| E-14 | **Ausgezogene Bewohnende (`moved_out`) verlieren sofort den Zugriff auf alle Runden.** Ihre `Vote`s bleiben erhalten, werden als „ehemaliges Mitglied" markiert, **zählen** in abgeschlossenen Runden und werden aus dem **Quorum-Nenner offener Runden** herausgerechnet. | Entscheidungsintegrität (eine abgeschlossene Entscheidung wird nicht rückwirkend verändert) gegen Beteiligungsrealität (ein Quorum, das auf Ausgezogene wartet, blockiert). |
| E-15 | **Bewerbererfassung in v1: manuelles Formular + regelbasierter Paste-Parser.** Nachricht einfügen, Heuristik extrahiert Name/Alter/Kontakt/Text, **Mensch bestätigt immer**. Keine WG-Gesucht-API (es existiert kein offizielles öffentliches Angebot), nutzerinitiierte Browser-Extension frühestens v1.2. | Kanalunabhängig (P-1) und ohne Rechtsrisiko. **Roadmap-Notiz (v2):** leichtgewichtiges KI-Parsing unstrukturierter Texte ist denkbar, weil strukturierte Eingabe Bewohnenden nicht immer zuzumuten ist — unter zwei Bedingungen: (a) der Eingabetext bleibt personenbezogen, also EU-Verarbeitung und AVV mit dem Modellanbieter; (b) die Ausgabe bleibt **strukturierende Extraktion**, niemals Bewertung (P-5). |
| E-16 | **Verfügbarkeiten hybrid (P-1):** schmaler Token-Link zu *einer* Seite mit Zeitraster (kein Konto, keine weiteren Daten, trägt den Art.-13-Hinweis) **plus** vollwertige manuelle Eingabe strukturierter „kann/kann nicht"-Fenster als `AvailabilityWindow`, inklusive regelbasiertem Freitext→Zeitfenster-Parser („Di 16–19", „dienstags ab 16", „nur abends", „am 3.9. nachmittags"). Vorschläge sind **immer** bestätigungspflichtig, nie stillschweigend. | Der Link ist Komfort, nicht Voraussetzung. Der Parser darf nie stillschweigend interpretieren, weil eine falsch verstandene Verfügbarkeit einen Termin platzen lässt. |
| E-17 | **Terminfindung zweischichtig:** (a) **Feasibility ohne Solver** — Ausgrauen nicht-buchbarer `Slot`s je Bewerbende ist eine reine Pro-Person-Prüfung und wird ohnehin gebraucht; (b) **„Vorschlag berechnen"** über ein deterministisches Constraint-Verfahren hinter einem austauschbaren Solver-Port (ADR-005). **Nicht** über ganze Termin-Konfigurationen abstimmen — Bewohnende reagieren auf einzelne `Slot`s (👍 / „kann nicht"), die moderierende Person bestätigt den `Appointment`. | Über Konfigurationen abzustimmen ist kombinatorisch überladen. Die Feasibility-Schicht trägt den Alltag auch dann, wenn der Solver nicht verfügbar ist. **Erklärbarkeit ist Pflicht-Feature (P-3):** verletzte Soft-Terme nachrechnen („Di 17:00 — 5/7 können") und bei Unlösbarkeit harte Constraints einzeln relaxieren („keine Lösung: Lea kann nur Di 16–19, dort können nur 2 von 7"). |
| E-18 | **Aufbewahrung: 180 Tage** für `Application`, `Vote` und `CastingNote` nach Rundenabschluss. Protokollierter Verlängerungsknopf pro Runde (+180 Tage, mit Begründungsfeld), **14 Tage Vorwarnung** an den Moderator mit „verlängern / jetzt löschen / archivieren". Der Haushalt kann **kürzen** (30/90/180), nicht beliebig verlängern. Keine stille Löschung. Manuelles Löschen pro `Application` und pro `CastingRound` ist immer verfügbar. | Rechtsgrundlage ist **Art. 5 Abs. 1 lit. e + Art. 17 Abs. 1 lit. a DSGVO** (Speicherbegrenzung), nicht Art. 15. Die Frist folgt dem AGG-abgeleiteten 6-Monats-Richtwert für Bewerbungen. Details in `06-Compliance-Anhang.md`. |
| E-19 | **„Datenauskunft erzeugen" pro `Application`** als eigenes Feature: Export aller zu dieser Person gespeicherten Daten. | Auskunftspflichtig ist der **Haushalt** als Verantwortlicher; Flatmate.io ist Auftragsverarbeiter und schuldet nur Unterstützung (Art. 28 Abs. 3 lit. e). Klein im Bau, hoch im Compliance-Wert. |
| E-20 | **Explizite Zustandsmaschine statt Boolean-Flags** (ADR-002): `new → screened → invited → scheduled → interviewed → offer_made → moved_in`, Seitenzustände `rejected_by_household`, `declined_by_applicant`, `withdrawn`, `archived`. Übergänge in *einer* Tabelle deklariert, **Rückwärtsübergänge erlaubt und auditiert** (P-4). Eigene Zustandsmaschinen für `CastingRound` und `Room`. | Bewerbende sagen nach erteilter Zusage ab; Zimmer werden einzeln vergeben, während die Runde weiterläuft. Beides ist der Normalfall, nicht der Fehlerfall. |
| E-21 | **Append-only `ActivityEvent`-Log** neben den normalen Tabellen (kein volles Event-Sourcing), ADR-003. Jedes Ereignis speichert **`Account` *und* handelndes Profil**. | Speist Aktivitäts-Feed, Benachrichtigungs-Fan-out, „was ist passiert, während ich weg war" (Schritt 8 der Belegkette), Undo und Rechenschaftspflicht. Die Doppelspeicherung erlaubt „Jonas hat Lea eingeladen" bzw. ehrlich „Verwaltung hat Lea eingeladen". |
| E-22 | **Benachrichtigungen in v1: primär In-App + Web Push** (vorgezogen aus v1.1), **Digest als Standard.** Ereignisauswahl in `HouseholdSettings` **und** persönlichen Einstellungen, dokumentierter iOS-Vorbehalt bleibt bestehen (nur für zur Startseite hinzugefügte PWAs). **E-Mail ist in v1 kein Standardkanal mehr**, sondern Fallback für Resident-Accounts ohne installierte PWA/aktivierten Push. Household-E-Mail (Registrierung, Passwort-Reset, Verifikation) bleibt für den Haushalts-Admin-Account Pflicht; Resident-E-Mail ist optional und wird nach dem Onboarding nachgereicht. `Notification`-Inhalte unterliegen derselben Sichtbarkeitspolicy wie die Anwendung. | Einzelbenachrichtigungen bei Dutzenden Bewerbungen erzeugen Abschaltung statt Beteiligung. Der Sichtbarkeitsvorbehalt ist notwendig, weil eine Benachrichtigung der einfachste Weg wäre, E-12 zu umgehen. |
| E-23 | **Geschäftsmodell: Non-Profit / spendenfinanziert. Für Bewohnende dauerhaft kostenlos.** Freemium erst in späteren Versionen für Vermietende mit mehreren Wohnungen. | Studentischer Kontext, und das Casten ist stressig genug. Die zahlende Stufe ist genau die, auf der AGG und AI Act greifen. Die offene Frage der Spendenkommunikation (O-05) ist inzwischen konkretisiert als **S-43** in `02-SRD.md`: eine einmalige E-Mail an die Household-E-Mail nach der 3.–4. abgeschlossenen `CastingRound`, außerhalb des In-App-Casting-Flows (v1.1) — kein Widerspruch zu „dauerhaft kostenlos", weil außerhalb des Casting-Flows. |
| E-24 | **Kernmetrik ist die Beteiligungsquote (> 80 %)**, nicht Nutzerzahl oder Zeitersparnis. **A/B-Testing entfällt** in v1. | Die Beteiligung ist das Produktversprechen; alles andere ist Mittel. Für A/B-Tests fehlt vor dem Launch jeder Traffic — begründetes TBD in `02-SRD.md` §8.2. |
| E-25 | **Regel-Sperre:** Eine Änderung des Abstimmungsverfahrens während einer laufenden `CastingRound` wird blockiert bzw. laut protokolliert. | Sonst ist jede Rangliste im Nachhinein bestreitbar — ein Legitimitätsproblem (P-3), kein technisches. |
| E-26 | **Modularer Monolith mit Bounded Contexts** `identity` · `casting` · `deliberation` · `scheduling` · `notifications` · `audit`, Domain-Events dazwischen, keine Cross-Context-Joins (ADR-001). **Reiner Domänenkern:** Voting-Mathematik, Ranking, Zustandsmaschine, Termin-Kostenmodell und Zeitfenster-Parser als pure Funktionen ohne Datenbankzugriff. | Die fachlich heiklen Teile sind damit ohne Infrastruktur testbar — die Voraussetzung dafür, dass Sichtbarkeitsinvariante, Quorum und Zustandsübergänge als geschützte Tests überhaupt formulierbar sind (`GUARDRAILS.md`). |
| E-27 | **Löschung und Aufbewahrung eingebaut, nicht angebaut** (ADR-010): jedes personenbezogene Feld wird in einer maschinenlesbaren `data-inventory.yml` deklariert (Zweck, Rechtsgrundlage, Aufbewahrung, Kategorie); ein CI-Check bricht bei nicht deklarierter Spalte. | Dient gleichzeitig als Art.-30-Verzeichnis. Ohne Gate wandert die Deklaration in den Rückstand — besonders bei AI-gestützter Implementierung. |

---

## v1-Scope (bestätigt)

Vollständige Fassung mit In/Out-Abgrenzung in `02-SRD.md` §5.3, Phasenschnitt in §5.4.
Verdichtet:

**Enthalten in v1:**

1. Haushalts- und Bewohner-Onboarding (`Household`, `Account`, `ResidentProfile`, `Membership`, ein Beitrittscode; E-Mail beim Beitritt optional, S-03)
2. `CastingRound` mit `Room`-Zuordnung, eigener Zustandsmaschine und optionaler weicher Rundenfrist (S-44)
3. Bewerbererfassung: Formular + regelbasierter Paste-Parser (E-15); Einladungstoken bei `moved_in` (S-42)
4. Karten-Screening und Abstimmung Runde 1 mit Feinschliff-Screen (E-07, E-08)
5. Rangliste mit Score, Quorum-Trennung und verdeckten Ergebnissen (E-09, E-10)
6. Vollständige Status-Pipeline mit auditierten Rückwärtsübergängen (E-20)
7. Verfügbarkeitsraster, Feasibility-Schicht und „Vorschlag berechnen" mit Erklärung (E-16, E-17)
8. `CastingNote`s mit strukturierten Prompts und Erinnerungs-Notification nach dem Termin (S-46)
9. Abstimmung Runde 2 mit `Veto` (E-11)
10. Kalenderansicht über `Appointment`s und Einzugstermine
11. `ActivityEvent`-Feed und `Notification`s (In-App und Web Push primär, E-Mail als Fallback, Digest-Standard — E-22)
12. Installierbare PWA mit verbindlichem Install-Hinweis (P-2, ADR-011, S-45)
13. Aufbewahrungsautomatik mit 14-Tage-Vorwarnung (E-18) und Datenauskunft-Export (E-19)

**Nicht enthalten:** Verfügbarkeits-Link für Bewerbende, Web Push, Punkte-Budget-Variante
und Textbausteine (v1.1) · nutzerinitiierte Browser-Extension für Portal-Import (v1.2) ·
Kalender-Sync, KI-Parsing, Vermieter-Persona und Freemium (v2). **Dauerhaft
ausgeschlossen:** jede KI-gestützte Bewertung, Rangbildung oder Empfehlung über Personen
(P-5), Portal-Anbindung per Scraping, Geräte-Fingerprinting als Duplikatsschutz.

---

## Risiken & offene Spannungen

Vollständige Fassung mit Gegenmaßnahmen in `02-SRD.md` §7. Die drei Spannungen, die dieses
Dokument selbst betreffen:

| # | Risiko | Auswirkung | Vorgeschlagene Gegenmaßnahme |
|---|--------|-----------|------------------------------|
| R-01 | **Flatmate.io erzeugt eine Auskunftspflicht, die der WhatsApp-Status-quo nicht hatte.** Dieselben Sätze fallen am Küchentisch unter die Haushaltsausnahme, in einem strukturierten Dateisystem einer Plattform nicht. Art. 15 DSGVO erfasst nach BFH und BGH (2025) auch interne Vermerke und subjektive Beurteilungen. | Das Produkt verbessert den Prozess und verschlechtert gleichzeitig die Rechtsposition des Haushalts. Wird das nicht adressiert, ist es ein Argument *gegen* die Einführung. | Eigener Risikoposten in `02-SRD.md` §7 — keine Fußnote. Produktseitig: strukturierte Notiz-Prompts statt leerem Kasten, sichtbarer Hinweis **„schreib so, als könnte die Person es lesen"**, knappe Fristen (E-18), „Datenauskunft erzeugen" als Feature (E-19). Vollständige Analyse in `06-Compliance-Anhang.md`. |
| R-02 | **Low-Commitment-Zustimmung, nicht Nicht-Zustimmung.** Die WG stimmt der Werkzeugwahl in aller Regel informell zu — eine organisierende Person (selbst Bewohnende:r) schlägt vor, der Rest nickt zumindest stillschweigend ab, bevor sich irgendwer registriert. Das ist kein Investment in die Nutzung, und der reale Wettbewerber bleibt WhatsApp plus Sprachnachricht — bereits installiert, ohne Registrierung, mit null Lernkosten. | Zwei von sieben Bewohnenden registrieren sich, die Beteiligungsquote fällt unter den WhatsApp-Stand, und das Produktversprechen kippt. | Ein-Schritt-Registrierung über einen Haushalts-Code (E-05), Passwort als universelle Methode (P-2), verdeckte Ergebnisse als Beteiligungsanreiz (E-09), Beteiligungs-Loop als First-Class-Feature („5 von 7 haben abgestimmt", Badge „4 offene Bewerbungen warten auf dich", Digest). Zusätzlicher Rückenwind aus der korrigierten Frequenzannahme (E-01): Aktivierung lohnt sich einmal, nicht jedes Mal neu. Gerade weil die Vorab-Zustimmung nur beiläufig ist, bleibt die niedrige Registrierungs- und Einstiegshürde (E-05, P-2) so wichtig wie zuvor. |
| R-03 | **Beteiligung ist das Ziel *und* das Nadelöhr.** Quorum, verdeckte Ergebnisse und Veto-Budget setzen voraus, dass genug Leute mitmachen. Tun sie es nicht, blockieren genau diese Mechanismen den Prozess. | Die Runde steht, weil drei Stimmen fehlen — und der Haushalt weicht nach WhatsApp aus, wo nichts blockiert. | Quorum ist eine Anzeige, keine Sperre: Kandidaten unter Quorum erscheinen getrennt (E-10), die Runde bleibt entscheidungsfähig. Ausgezogene werden aus dem Nenner gerechnet (E-14). Verdeckte Ergebnisse sind abschaltbar (E-09), das Veto-Budget ebenso. Zusätzlich gibt eine weiche Rundenfrist (`CastingRound.phase_deadline_at`, **S-44** in `02-SRD.md`) der Runde einen zeitlichen Rahmen, ohne sie hart abzubrechen. Die Beteiligungsquote wird gemessen, damit dieses Risiko sichtbar wird, statt still zu wirken. |

---

## Nächster Schritt

→ **`02-SRD.md`** — lösungsneutrale Anforderungen: Benchmark gegen den realen Wettbewerber,
Vorher/Nachher, scharfe Scope-Grenze, Phasenplanung v1 / v1.1 / v1.2 / v2, Metriken mit der
Beteiligungsquote als Kernzahl, Risiken einschließlich des Art.-15-Postens.
Der Technologie-Stack liegt bewusst **nicht** dort, sondern in **ADR-006**.
