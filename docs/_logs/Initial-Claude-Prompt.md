/requirement-writer Ich fange hiermit die Entwicklung von flatmate.io an, einer Webanwendung (langfristig eventuell auch App oder PWA für die Usability) die den Casting-Prozess neuer Mitbewohner in größeren WGs vereinfachen soll.



Der Prozess läuft normalerweise so ab:

Online-Schaltung der Anzeige

Eintreffen von Bewerbungen

Herauskopieren von Bewerbungen in gemeinsamen Chat

Voting der WG-Mitglieder welche Bewerber eingeladen werden sollen

Zusage für Casting-Termin an Bewerber

Terminfindung für Casting (Wann könnten die Bewerber und wann kann wer aus der WG)

Casting-Termin

Anschließender Austausch und Informierung der WG-Mitglieder die nicht am Casting teilnehmen konnten

Abstimmung, wie man Bewerber/in fand (und ob eine Zusage erteilt werden soll)

Nachricht an Bewerber/in

Zusage/Absage von Bewerber/in

Kommunikation der Rückmeldung in gemeinsamen Chat zur Information aller WG-Mitglieder

Einzugstermin kommunizieren

Dieser Aufwand ist, je nach WG-Größe, zu vergebenden Zimmern und regelmäßigen Ein-/Auszügen, riesig und unübersichtlich.  Ich möchte eine Anwendung entwickeln die diesen Prozess vereinfacht/zusammengeführt und streamlined organisiert. 

Für die Versionen bis zum ersten MVP stelle ich mir vor dass:

1. Eine Wohngemeinschaft sich registrieren können. Dies erfolgt über eine E-Mail sowie ein Passwort. Da Bewohner wechseln/ausziehen/... können wäre es wichtig, diesen Account gemeinschaftlich zu verwalten / Besitz zu übertragen. Dies ist zunächst aber einfach damit lösbar, dass der Account auf eine WG-EMail angemeldet wird und nicht auf einen spezifischen Bewohner. Also für die Architektur der Anwendung unerheblich, ein Hinweis beim registrieren (eine gemeinschaftlich genutzte Adresse zu verwenden) reicht. In einer Wohngemeinschaft sollten sich WG-Mitglieder registrieren können. 

2. Ein Casting für ein Zimmer / Eine Castingrunde für mehrere Zimmer gestartet werden kann. 

3. Bewerber angelegt/hinzugefügt werden können. Es wäre gut auch zu checken, ob eine Anbindung an gängige WG-Websiten automatisch möglich wäre, bspw. WG-Gesucht, um Anfragen direkt automatisiert zu übernehmen. Das würde den Prozess des händischen Eintragens von Bewerberinformationen erleichtern. Bewerbungen, die auf persönlichem Wege (bspw. per WhatsApp o.ä.) eintreffen müssten trotzdem noch händisch hinzufügbar sein. Für die Anlegung von Bewerbern sollte es möglich sein Namen (Pflicht), Kontaktadressen (Optional), Freitext-Bewerbungsnachrichten (Optional), sowie weitere optionale Informationen über den Bewerbenden (bspw. Hobbies, Alter, ...) hinzuzufügen.

4. Hinzugefügte Bewerber/innen sichtbar sein. Ich könnte mir einen Card-Based Sichtungsworkflow vorstellen, der jeden hinzugefügten Bewerbenden in einer Profile-Card zeigt. Im Backlog wäre eine AI-Basierte Zusammenfassung von Bewerbungstexten in kurze, bündige Paragraphen denkbar - das würde ich aber zunächst für den MVP (aufgrund des EU AI Acts und möglicher High-Risk Auflagen) ausklammern.

5. WG-Mitglieder über einzelne Bewerber/innen abstimmen können, ob diese eingeladen werden sollen. Hierfür wäre entweder nur Ja/Nein oder ein Würde einladen - 0-10 Punkte denkbar. Bei 0-10 Punkten ist allerdings zu beachten, dass Menschen unterschiedlich begeisterungsfähig sind (manche geben entweder nur 10 oder 0 Punkte, manche tendieren zum Mittelfeld.) Dementsprechend wäre für die Punktevergabe möglicherweise ein Punkte-Budget notwendig. Dieses müsste dann allerdings an der Anzahl an insgesamt zu vergebenden Zimmern orientiert sein (mehr Zimmer zu vergeben -> mehr Punkte). Für v1 MVP also vielleicht erstmal nur Ja/Nein, für v1.x die Möglichkeit zur Auswahl eines Punktevergabesystems. 
Zum Abstimmen muss sich ein WG-Mitglied registriert haben (um Mehrfachabstimmung zu vermeiden). Neu registrierte Mitglieder sollten nur die jeweilig gerade aktive Castingrunde sehen, um zu vermeiden, dass ein neues WG-Mitglied die Abstimmungen zu seinem eigenen Casting sieht. Hier birgt sich eine Schwierigkeit: Wird für mehrere Zimmer gecastet, eine Person zieht in eines der Zimmer ein und tritt direkt im Anschluss der Castingrunde (für die weiteren Zimmer) bei befindet Sie sich zurecht in einer Castingrunde, in der kurz zuvor noch über die Person selbst entschieden wurde. Hier wäre ein Konflikt zu klären, wie die Sichtbarkeit der eigenen Bewerbungs-Abstimmungsergebnisse geklärt werden kann. (Denkbar wäre z.B., dass noch offene Bewerbungen (ergo nicht "Zugesagt"/"Eingezogen" geflagged) sichtbar für neue WG-Mitglieder sind, abgeschlossene Bewerbungen jedoch nicht)
Eine weitere Schwierigkeit ist, wie mit registrierten WG-Mitgliedern, die jedoch ausgezogen sind, zu verfahren ist. Für eine Castingrunde sollte vielleicht auswählbar sein, welche WG-Mitglieder an einer Castingrunde teilnehmen/abstimmen/..etc. Um zu vermeiden, dass ehemalige WG-Bewohner an aktuellen Castings teilnehmen/Castings einsehen können. (Datenschutz)

6. Bewerber/innen als "Eingeladen" markiert werden. Bspw. kann die Bewerber/innen Liste nach größter Zustimmung der WG-Mitglieder sortiert werden. Anschließend kann der/die Bewerberin über den jeweiligen Kontaktweg kontaktiert werden, und als "Eingeladen" markiert werden (Kontaktaufnahme selbst ist nicht im Scope des v1 MVPs. Denkbar wäre z.B. für v1.x Batch-Kontaktierung via API der gängigen WG-Websites oder das automatische Formulieren von Antworten zum kopieren via KI). Ist ein/e Bewerber/in als eingeladen markiert wäre der nächste Schritt des Prozesses das Warten auf Rückmeldung der Bewerber/in und anschließende Terminfindung.

7. Die Terminfindung für ein Casting in Person geklärt werden. Möglicherweise kommen mehrere Rückmeldungen von Bewerber/innen auf einmal mit jeweils Wünschen bzgl. Tag/Uhrzeit/...
Diese Constraints müssten beim jeweiligen Bewerberprofil einpflegbar sein, und anschließend Terminvorschläge generiert werden. Hierbei sollte auch von Seiten der Wohngemeinschaft Präferenzen  berücksichtigbar sein (bspw. nur Abends nach 18:00, so viele Castings an einem Tag wie möglich, Castings von mehreren Bewerbern dürfen gleichzeitig stattfinden/nicht gleichzeitig stattfinden, ...). Anschließend können WG-Mitglieder auf verschiedene Vorschläge von Termin-Konfigurationen abstimmen oder möglicherweise Änderungen requesten. 
Außerdem sollte optional zusätzlich einstellbar sein: WG-Availability - WG-Mitglieder geben Verfügbarkeit in bestimmtem Zeitraum an, anschließend können in verfügbare Timeslots (verfügbare Timeslots markierbar als mind. X WG-Mitglieder haben dort Zeit) Castings gebucht werden für Bewerber/innen. (Denkbar in späteren Versionen: Anbindung an Google Calendar für automatische Extraktion von Availability & Eintragen von Casting-Terminen)


8. Notizen zu einem Casting hinterlegt werden, für WG-Mitglieder die an einem Castingtermin nicht teilnehmen konnten, zum nachlesen. 
Nach einem abgeschlossenen Castingtermin sollte der/die Bewerber/in als "gecastet" markiert werden. Damit wird in die nächste Phase übergegangen.


9. Für gecastete Bewerber/innen von WG-Mitgliedern abgestimmt werden können, ob eine Zusage erteilt werden soll. Dieser Prozess ist ähnlich wie Punkt 5., also eine zweite Abstimmungsrunde. Hier sollte eine Option existieren ein Veto zu vergeben. In den Wohngemeinschafts-Einstellungen sollte hier festgelegt werden können, ob ein Veto anonym sein soll, Vetos nur mit Begründung abgegeben werden können & man eine begrenzte Anzahl an Vetos / Castingrunde hat. Bewerber/innen mit Vetos werden grundsätzlich low-geranked, jedoch nicht gelöscht um Raum für Diskussion innerhalb der WG zumindest offen zu lassen (bspw. 6 Leute sind voll überzeugt von Bewerber/in & eine Person gibt Veto).

10. Bewerber/innen als "Zusage erteilt" markiert werden können. Äquivalent wie auch schon bei Punkt 6. findet die Kontaktaufnahme/Rückmeldung mit dem/der Bewerbenden statt. Hierbei sollte eine Möglichkeit bestehen temporäre Entscheidungen/Vorschläge der WG mitzutracken, wie z.B. (bei mehreren zu vergebenden Zimmern) für welche/s Zimmer eine Zusage erteilt werden soll, gewünschter Einzugstermin, ...

11. Eine Rückmeldung der Bewerber/in eingepflegt werden können. Sagt die Bewerber/in zu, kann das Profil als "Neue/r Mitbewohner/in" markiert werden. Es sollte der geplante Einzugstermin, welches Zimmer, ... einstellbar sein. Diese Markierung sollte nicht final (in Stein gemeißelt) sein, es kommt vor, dass Bewerber/innen Zusagen erteilen, im Nachhinein jedoch doch noch absagen. Denkbar wäre auch eine Benachrichtigung an die WG Mitglieder "X ist euer/euere neue Mitbewohner/in 🥳 - X hat eine Zusage erteilt" (oder wenn schon spezifischere Infos vorliegen ("X zieht am ... in Zimmer ... ein"). 
Allgemein sollte es ein (persönliches) Benachrichtigungszentrum für WG-Mitglieder geben, in dem bspw. auch neue Kandidaten angekündigt werden ("Neuer Kandidat in Castingrunde"), sodass der Überblick behalten werden kann und WG-Mitglieder auf dem laufenden Stand bleiben & auch an den Abstimmungen teilnehmen. Für eine PWA/App könnten diese Benachrichtigungen dann auch direkt auf einem Mobilgerät ausgespielt werden. Für welche Ereignisse man Benachrichtigungen erhält, sollte 1) in den Einstellungen der Wohngemeinschaft spezifizierbar sein und 2) in persönlichen Einstellungen für jedes WG-Mitglied spezifizierbar sein.
Sagt der/die Bewerber/in ab, wird er/sie mit "Abgesagt" markiert, und in ein Archiv verschoben.


12. Für den Überblick aller Ereignisse (geplante Castings / Einzugstermine / ...) sollte es eine Kalenderansicht für WG-Mitglieder geben. Wie schon oben erwähnt wäre langfristig eine Synchronisierung mit Google Calendar oder anderen gängigen Kalenderapps möglich.


Es ist wichtig, dass die Anwendung die Organisation intuitiv gestaltet, angenehm zu navigieren ist, angenehm zu moderieren ist, und den Prozess verbildlicht. Anreiz zur Beteiligung an Casting-Prozessen sowie das Erleichtern der Organisationsarbeit bei vielen Bewerbenden ist zentraler Sinn der Anwendung. 

Außerdem wichtig zu beachten sind gängige Datenschutzverordnungen (GDPR/DSGVO/EU AI Act/...), Risk/Compliance, Timeless Architecture Decisions (Modularity, Extendability, ...).

Für das Anlegen einer AI-Agenten basierten Repo zur Implementierung der Anwendung ist außerdem wichtig schon im vorhinein abzuwägen welche Risiken durch die Implementierung via AI auftreten können und entsprechende Guardrails in eine eigene Datei (GUARDRAILS.md) zu schreiben. (z.B. Clean-Code Principles, Sicherstellen von sensiblen Daten, ...).

Stelle Fragen, Überdenke Architektur & Design, Risks, Market Competitors, und so weiter.