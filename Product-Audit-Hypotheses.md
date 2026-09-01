# Produkt-Audit — Kritische Hypothesen (Flatmate.io)

**Stand:** 2026-08-31 · V0.5
**Methode:** Lean Product Management. Die Annahmen finden, an denen das Produkt scheitern kann, und sie billig testen.
**Grundlage:** `01-Problem-Framing.md`, `02-SRD.md`, `03-PRD.md`, `04-Domaenenmodell.md`, `05-ADRs.md`, `06-Compliance-Anhang.md`
**Umfang:** 21 Hypothesen — 8 Desirability, 6 Feasibility, 7 Viability. Bewertungsbogen in §6.

---

## Versionshinweis

**V0.4** ist die deutsche Fassung und ersetzt die englische vollständig. Jede Hypothese hat jetzt
einen Testblock aus vier Stufen: *Wir glauben — Für den Test werden wir — Und messen — Wir liegen
richtig, wenn*. Die Begründungen darunter sind gekürzt.

**Aus V0.3 übernommen, weil es Entscheidungen dokumentiert:**

- **H-F5** ist um deinen Einladungslink herum neu geschrieben. Er ist besser als mein Vorschlag, weil
  er den Menschen aus dem Normalfall entfernt und Q-14 gar nicht erst auslöst.
- **H-F6** ist korrigiert. Ich hatte behauptet, bereits versendete E-Mails seien ein Loch im
  Löschkonzept. Das war falsch: Eine Pflicht, versendete Post aus fremden Postfächern zu entfernen,
  gibt es nicht, und umsetzbar wäre sie ohnehin nicht. Übrig bleibt eine viel kleinere Frage — was
  in einer Benachrichtigung überhaupt stehen darf. Die Bewertung ist entsprechend gesenkt.
- **H-D7**, **H-D8** und **H-V7** sind aus deinen Ergänzungen entstanden.

**V0.5 zieht das Audit auf den aktualisierten Spec-Stand nach.** Alle sieben Kern-Spec-Dokumente
(`01-Problem-Framing.md` bis `06-Compliance-Anhang.md`, `GUARDRAILS.md`) wurden in einem
Konsistenz-Update überarbeitet. Neun Rückmeldungen aus diesem Audit sind darin als neue Scope-Zeilen
oder Wortlautkorrekturen gelandet:

- **S-42** — `ApplicationInviteToken`, einmalig verwendbares Einladungstoken je `Application` bei
  `moved_in`, setzt automatisch `became_resident_id`. Klickt eine bereits registrierte, angemeldete
  Person den Token, endet der Vorgang jetzt mit einer erklärten Fehlermeldung statt einer stillen
  Überschreibung — genau die Lücke, die H-F5 selbst offen gelassen hatte, ist geschlossen (dazu
  `GUARDRAILS.md` **G-D12**).
- **S-43** — einmalige Spenden-E-Mail an die Haushalts-E-Mail nach der 3.–4. abgeschlossenen
  `CastingRound`, außerhalb des In-App-Flows, v1.1. Löst **O-05** auf.
- **S-44** — optionale weiche Frist je Rundenphase (`CastingRound.phase_deadline_at`), **v1**, speist
  die CTA-Sortierung im Dashboard. War H-D8s eigener Vorschlag am Ende der Hypothese — existiert jetzt
  als spezifiziertes Feature.
- **S-45** — sichtbarer, beharrlicher PWA-Install-Hinweis plus zurückhaltende
  Resident-E-Mail-Abfrage (Passwort-Reset-Pitch), `PushSubscription`-Entität, v1.
- **S-46** — Erinnerungs-Notification an Casting-Teilnehmende nach dem Termin
  (`casting.note_reminder_due`, Entität `AppointmentAttendance`), v1, respektiert Selbst-Redaktion
  (`GUARDRAILS.md` **G-D13**). Direkte Umsetzung des eigenen Vorschlags aus H-D2 zur Notizkultur.
- **E-22 korrigiert:** Benachrichtigungen v1 sind primär In-App und Web Push (vorgezogen aus v1.1);
  E-Mail wird zum Fallback-Kanal für Resident-Accounts ohne installierte PWA. Haushalts-E-Mail bleibt
  Pflicht, Resident-E-Mail bleibt optional.
- **Werkzeug-Ziel korrigiert** (`02-SRD.md` §8.3): nicht mehr „Reduktion auf ein Werkzeug", sondern
  „Casting-bezogene Vorgänge laufen nicht mehr parallel im WhatsApp-Verlauf" — WhatsApp bleibt
  WG-interne Kommunikation, WG-Gesucht bleibt Anzeigenportal.
- **„Werkzeug nicht ausgesucht"-Framing korrigiert** an zehn Stellen: die organisierende Person ist
  selbst Bewohnende, der Rest der WG stimmt in der Regel informell **vorher** zu. R-02 in
  `01-Problem-Framing.md` heißt jetzt „Low-Commitment-Zustimmung, nicht Nicht-Zustimmung".

Geändert in diesem Dokument: **H-D1, H-D2, H-D3, H-D8, H-F5, H-F6, H-V4, H-V7**, dazu der
Bewertungsbogen (§6) und die Testreihenfolge (§7). Die übrigen 13 Hypothesen, Abschnitt 4 und
Abschnitt 5 bleiben unverändert — sie werden von den Spec-Änderungen nicht berührt. Ein Thema des
Konsistenz-Updates (Informationspflicht bei Drittdaten) hat **keine** Spec-Änderung ausgelöst:
`06-Compliance-Anhang.md` §4 war bereits korrekt.

---

## 0 · Lesehinweise

### Was hier eine Hypothese ist

Eine Hypothese ist eine Annahme, auf die das Produkt angewiesen ist und die noch niemand geprüft hat.
Sie ist so formuliert, dass sie **widerlegt** werden kann. „Nutzende werden es mögen" ist keine
Hypothese. „Mindestens 6 von 7 Bewohnenden stimmen in der ersten Runde ab" ist eine.

Deine Dokumente enthalten außerdem viele **Entscheidungen**: E-01 bis E-27, ADR-001 bis ADR-012. Die
stehen hier nicht. Eine Entscheidung ist durchdacht und zu bekannten Kosten änderbar. Diese Liste
enthält nur ungeprüfte Annahmen.

Aufgenommen wurde eine Annahme, wenn alle drei Punkte zutreffen:

1. Kein Dokument belegt sie. Sie ist behauptet, aus einer ungeprüften Zahl gerechnet oder ausdrücklich
   als offen markiert (`O-…`, `P-O-…`, `Q-…`).
2. Ist sie falsch, funktioniert das Produkt nicht oder wird ein anderes Produkt.
3. Der Test ist billiger als das Bauen gegen sie.

### Kartenaufbau

Jede Karte beginnt mit vier kurzen Stufen, danach folgt die Begründung:

> **Wir glauben, dass …** → **Für den Test werden wir …** → **Und messen …** → **Wir liegen richtig,
> wenn …** → *Warum das riskant ist* → *Wenn es falsch ist* → *Herkunft*

### Zwei Marker

- **[ohne Code testbar]** — widerlegbar, bevor eine Zeile Produktivcode existiert.
- **[scheitert unbemerkt]** — wenn diese Annahme falsch ist, bricht nichts. Keine Fehlermeldung, keine
  Beschwerde, keine rote Kennzahl. Du merkst es viel später. Solche Punkte verdienen eine höhere
  Kritikalität, als sie auf den ersten Blick wirken.

### Kurzes Glossar

| Begriff | Bedeutung hier |
|---|---|
| **Zielgruppe (Beachhead)** | Die erste Kundengruppe. Hier: WGs und Wohnprojekte ab 5 Bewohnenden |
| **Kernmetrik** | Beteiligungsquote. Anteil der stimmberechtigten Bewohnenden, die in einer Runde mindestens einmal abgestimmt haben. Ziel über 80 % |
| **Quorum** | Ab wie vielen Stimmen ein Kandidat in der Rangliste erscheint. Hier: die Hälfte. Reine Anzeige, blockiert nichts |
| **Verantwortlicher / Auftragsverarbeiter** | DSGVO-Rollen. Deine Position: der Haushalt ist Verantwortlicher, Flatmate.io Auftragsverarbeiter |
| **DSFA** | Datenschutz-Folgenabschätzung. Schriftliche Risikoanalyse nach Art. 35 |
| **Datenauskunft (Art. 15)** | Bewerbende fragen „was habt ihr über mich gespeichert?" — die Antwort umfasst auch Notizen und Urteile |
| **RLS** | Row-Level-Security. Postgres entscheidet pro Zeile, wer sie lesen darf. Zweites Netz unter der Policy-Schicht |
| **CP-SAT** | Der OR-Tools-Solver, der Terminvorschläge rechnet |
| **Concierge-Test** | Den Dienst zuerst von Hand erbringen. Tabelle plus einfaches Formular statt App |
| **Smoke-Test** | Das Nutzenversprechen veröffentlichen und Reaktionen zählen, bevor gebaut wird |
| **Durchstich (Spike)** | Ein schmaler, aber vollständiger Bau durch alle Schichten, um eine offene Frage zu beantworten |

---

## 1 · Desirability — Marktattraktivität

### H-D1 — Low-Commitment-Zustimmung wird zu echter Beteiligung

**Wir glauben, dass** in einer WG mit 5–10 Personen, in der die Bewohnenden dem Werkzeug nur informell
und beiläufig zugestimmt haben — eine organisierende Person schlägt vor, der Rest nickt ab, bevor sich
irgendwer registriert (R-02) —, trotzdem mindestens 6 von 7 Bewohnenden pro Runde abstimmen, und mehr
als beim letzten WhatsApp-Casting.

**Für den Test werden wir** zuerst die WhatsApp-Baseline erheben (O-07) und danach eine echte
Casting-Runde von Hand durchführen: Tabelle plus ein Formular mit vier Stufen, verdeckten Ergebnissen
und dem Zähler „5 von 7 haben abgestimmt".

**Und messen** die Anzahl der Bewohnenden, die mindestens eine Stimme abgegeben haben, gegen die
Baseline der letzten Runde.

**Wir liegen richtig, wenn** mindestens 6 von 7 abgestimmt haben und dieser Wert über der Baseline
liegt.

**Warum das riskant ist.** Das ist die Zahl, auf die das ganze Produkt gesetzt ist — in deinen eigenen
Worten die einzige, an der das Versprechen scheitern oder gelingen kann. Alles andere dient ihr:
verdeckte Ergebnisse, Quorum-Anzeige, Beteiligungs-Badge, Ein-Schritt-Registrierung. Keines davon
wurde mit echten Menschen gesehen. Die Frage ist nicht mehr, ob überhaupt zugestimmt wurde — die
organisierende Person ist selbst Bewohnende, und informelle Vorab-Zustimmung ist der Regelfall (R-02).
Die Frage ist, ob diese Art Zustimmung trägt: Ein beiläufiges Nicken am Küchentisch ist kein Investment
in die Nutzung. Die Ausgangslage bleibt deshalb schlecht: WhatsApp liegt bereits auf jedem Gerät,
bereits installiert, ohne Registrierung, mit null Lernkosten — und genutzt wird das Ganze drei Wochen
lang und dann monatelang nicht.

> **Hinweis zum Zielwert.** Bei 7 Bewohnenden kann die Quote nur 0, 14,3, 28,6, 42,9, 57,1, 71,4,
> 85,7 oder 100 % betragen. „Über 80 %" heißt also exakt „6 von 7". Eine Person mit schlechter Woche
> bewegt die Zahl um 14 Punkte. Formuliere den Zielwert für Haushalte unter etwa 15 Personen als
> **Anzahl**, nicht als Prozentsatz. Sonst ist Erfolg von Glück nicht zu unterscheiden.

**Wenn es falsch ist.** Auf die Begründung hören. Nennen die Leute *Aufwand* statt *Werkzeug*, ist die
Beteiligungsthese falsch, und das Produkt müsste sich auf die Last der moderierenden Person
ausrichten. Das wäre vertretbar, aber ein **anderes** Produkt — mit gesparter Zeit als Kernmetrik.

**Herkunft.** `01-PF` R-02, R-03 · `02-SRD` §1, §6, §7, §8.1, §8.3, O-07 · **[ohne Code testbar]**

---

### H-D2 — Der jetzt spezifizierte Reminder bringt echte Notizen hervor

**Wir glauben, dass** Bewohnende inhaltlich brauchbare `CastingNote`s und Veto-Begründungen ins System
schreiben, obwohl ihr Name daran hängt und Bewerbende eine Kopie verlangen können — und dass die jetzt
spezifizierte Erinnerungs-Notification nach dem Termin (S-46, `casting.note_reminder_due`, ausgelöst
beim Übergang `scheduled → interviewed`) messbar dazu beiträgt.

**Für den Test werden wir** in derselben Concierge-Runde die strukturierten Notiz-Prompts samt Hinweis
„schreib so, als könnte die Person es lesen" austeilen, den Reminder als manuellen Stellvertreter
nachbilden — „Wie lief das Casting mit X? Schreib ein paar Sätze für alle, die nicht dabei waren",
verschickt genau beim Übergang ins Termin-erledigt — und danach die Abwesenden befragen.

**Und messen** den Anteil der Castings mit mindestens einer Notiz, davon den Anteil, der erst nach dem
Reminder entstand, den Anteil der Abwesenden, die sich allein anhand der Notizen entscheiden konnten,
und ob parallel ein WhatsApp-Strang lief.

**Wir liegen richtig, wenn** ≥ 70 % der Castings eine Notiz haben, ein spürbarer Teil davon erst nach
dem Reminder, ≥ 60 % der Abwesenden „ja" sagen und kein paralleler Chat die eigentlichen Inhalte
getragen hat.

**Warum das riskant ist.** H-D1 kann grün sein, während diese Annahme scheitert — und man merkt es
nicht. Abstimmen ist ein Fingertipp und sozial folgenlos. „Sie wirkte unzuverlässig" unter dem eigenen
Namen in ein System zu schreiben, das einen Auskunfts-Export hat, ist etwas völlig anderes. S-46 löst
jetzt die Frage „gibt es überhaupt einen Anstoß" — der Reminder existiert, respektiert Selbst-Redaktion
(`GUARDRAILS.md` G-D13) und liest zur Entscheidung nur ein Anwesenheits-Flag, nie den Notizinhalt.
Offen bleibt die größere Frage: Löst ein Anstoß auch tatsächlich eine brauchbare Notiz aus, oder wird
er wortlos weggeklickt wie jede andere Erinnerung?

Deine Dokumente nannten das die *Notizkultur*-Frage und behandelten sie als Qualitätsproblem. Sie ist
größer. `CastingNote`s sind die **einzige** Antwort auf Schritt 8 deiner Belegkette, den du selbst den
zentralen Schmerzpunkt nennst. Das Veto ist die einzige Antwort auf „ein starkes Nein sagt niemand".
Bleiben beide leer — auch mit Reminder —, ist die Organisation des Castings gelöst und die Beratung
unangetastet — und die Beratung ist das, was kein Wettbewerber kann.

Jede einzelne Compliance-Entscheidung hier ist richtig. Zusammen schieben sie das ehrliche Gespräch
woanders hin: Die Auskunft erfasst Urteile, nicht nur Fakten. Art. 15 Abs. 4 schützt die Urheberschaft,
nicht den Inhalt. Und in einer Fünfer-WG ist ein anonymes Veto mit Begründungspflicht nicht anonym —
dein Spec sagt das ehrlich in der UI. Genau diese Ehrlichkeit lässt WhatsApp sicherer wirken.

**Wenn es falsch ist.** Bewusst wählen. Entweder die Beratungsfläche verkleinern (kürzere Frist, nur
strukturierte Felder, kein Freitext) und akzeptieren, dass das Abwesenden-Problem halb gelöst bleibt.
Oder das Notizschreiben zum Mittelpunkt des Produkts machen statt zum Nebenprodukt des Castings.

**Herkunft.** `01-PF` Schritt 8, PB-4, PB-5 · `02-SRD` S-22, S-24, S-46, §7 · `03-PRD` §4.6, §4.6.4,
P-O-02 · `06-Compliance` §2, §3 · `GUARDRAILS.md` G-D13 · **[scheitert unbemerkt]**

---

### H-D3 — Es ersetzt Werkzeuge, statt ein weiteres zu werden

**Wir glauben, dass** Flatmate.io Casting-bezogene Vorgänge aus dem WhatsApp-Verlauf herauslöst, statt
zusätzlich dort weiterzulaufen — nicht, dass die Zahl beteiligter Werkzeuge insgesamt sinkt. WhatsApp
bleibt WG-interne Kommunikation, WG-Gesucht bleibt Anzeigenportal; das ist jetzt die korrigierte
SRD-Metrik (`02-SRD` §8.3), nicht mehr die Werkzeug-Reduktion.

**Für den Test werden wir** vor und nach der Concierge-Runde protokollieren, ob Bewerbungserfassung,
Abstimmung und Terminfindung im WhatsApp-Verlauf stattfinden, und fragen: „Was hast du am Ende doch von
Hand oder im Chat gemacht?" Die Werkzeugzahl zählen wir weiter mit, aber als Nebensignal.

**Und messen** welche Prozessschritte weiterhin im WhatsApp-Verlauf stattfanden, sowie ergänzend die
Anzahl beteiligter Werkzeuge.

**Wir liegen richtig, wenn** weder Bewerbungsweitergabe noch Abstimmung noch Terminkoordination im Chat
stattgefunden haben — unabhängig davon, ob die Werkzeugzahl insgesamt sinkt.

**Warum das riskant ist.** Das Produkt schaltet die Anzeige nicht, versendet keine Nachrichten (S-16
liefert nur Text zum Kopieren) und hat keine Portal-Anbindung — E-15 hat recht, es gibt keine
offizielle API. Die moderierende Person nutzt also weiter WG-Gesucht, weiter WhatsApp und jetzt
zusätzlich Flatmate.io. Jede Bewerbung wird von Hand eingetippt oder eingefügt, jede Antwort wieder
herauskopiert.

`02-SRD` §8.3 formuliert das jetzt korrekt: Ziel ist, dass Casting-bezogene Vorgänge nicht mehr
parallel im WhatsApp-Verlauf laufen; die Werkzeugzahl zu senken ist ausdrücklich ein Nebeneffekt, kein
Ziel. Dieses Versprechen hängt trotzdem komplett daran, dass die WG die Gruppe für das Casting *nicht
mehr* benutzt. Dieselbe Gruppe trägt aber auch Abwasch, Miete und Partys. Sie schließt nicht.

Zweite Fassung desselben Risikos: Vielleicht erlebt der Haushalt „Casting" gar nicht als **einen**
Vorgang. Fühlen sich Erfassen, Auswählen und Terminieren wie drei Dinge an, wird ein Teil übernommen
und zwei bleiben im Chat. In den Kennzahlen sieht das gut aus.

**Wenn es falsch ist.** Die Antwort sind weniger Übergaben, nicht mehr Funktionen. Browser-Extension
(v1.2) und Textbausteine (v1.1) nach vorn ziehen. An den Übergabestellen läuft die Arbeit zurück nach
WhatsApp.

**Herkunft.** `01-PF` 13-Schritte-Belegkette · `02-SRD` §5.1, §5.2, §8.3 · S-16, E-15 ·
**[ohne Code testbar]**

---

### H-D4 — Wiedereinstieg nach Monaten funktioniert

**Wir glauben, dass** ein Bewohnender, der die App zuletzt vor vier Monaten geöffnet hat, ohne fremde
Hilfe in unter zwei Minuten zur ersten Stimme kommt.

**Für den Test werden wir** fünf Personen an einem Klick-Prototyp die Aufgabe geben: „Du warst zuletzt
im April hier, stimme über die neuen Bewerbungen ab" — und dieselbe Zeit später in der Pilotrunde real
messen.

**Und messen** die Zeit bis zur ersten Stimme sowie die Anzahl der Passwort-Zurücksetzungen und
Rückfragen an die moderierende Person.

**Wir liegen richtig, wenn** mindestens 5 von 7 unter zwei Minuten bleiben und höchstens eine Person
ein neues Passwort braucht.

**Warum das riskant ist.** `02-SRD` §1 nennt den Wiedereinstieg als eine von drei Folgen des
Nutzungsprofils — und kommt danach nie darauf zurück. Alle Akzeptanzkriterien in `03-PRD` §4.1 sind
für jemanden geschrieben, der bereits drin ist. Der ruhende Nutzer ist aber der Normalfall: Bei 2 bis
4 Runden im Jahr benutzt man das Produkt rund 46 Wochen lang nicht.

Der wahrscheinliche Fehler ist banal und tödlich: ein vergessenes Passwort für ein Werkzeug, das man
sich nicht ausgesucht hat. In den Kennzahlen sieht das genauso aus wie „Abstimmen ist unattraktiv" —
beide Ursachen sind nicht unterscheidbar.

Passwort-primär (ADR-007) ist für Geräteneutralität richtig. Es ist zugleich die Methode, die am
schlechtesten altert. Passkeys altern besser, sind optional und gerätegebunden.

**Wenn es falsch ist.** Die Gegenmittel sind billig und gehören vorab entworfen: lange Sitzungsdauer
auf vertrauten Geräten, ein Magic-Link zum *Wiedereinstieg* (etwas anderes als der von E-05 zu Recht
verworfene Magic-Link-*Login*), und ein Digest, dessen Hauptlink direkt auf die nächste unbewertete
Karte führt.

**Herkunft.** `02-SRD` §1, §6 · `05-ADRs` ADR-007, ADR-011 · **[scheitert unbemerkt]**

---

### H-D5 — Verdeckte Ergebnisse motivieren, ohne Durchklick-Stimmen zu erzeugen

**Wir glauben, dass** verdeckte Ergebnisse die Beteiligung erhöhen und dabei überlegte Stimmen
erzeugen, keine Stimmen, die nur die Rangliste freischalten sollen.

**Für den Test werden wir** im Screening-Durchlauf bei zwei Personen die Zeit pro Karte stoppen und
danach fragen: „Wolltest du zuerst die Rangliste sehen?"

**Und messen** die Medianzeit pro Karte und die Streuung der vergebenen Stufen je Person.

**Wir liegen richtig, wenn** die Medianzeit über rund 5 Sekunden pro Karte liegt und keine Person nur
eine einzige Stufe vergeben hat.

**Warum das riskant ist.** E-09 behauptet zwei Vorteile gleichzeitig: kein Ankereffekt **und** ein
Grund mitzumachen. Dieser Doppelnutzen ist die Begründung für den Standardwert. Beide Hälften sind
plausibel, keine ist geprüft.

Die zweite Hälfte hat einen naheliegenden Fehlermodus, den die Dokumente nicht behandeln: Wer
Information hinter eine Schranke legt, erzeugt einen Anreiz, die billigste Eingabe zu liefern, die
die Schranke öffnet. Wer die Rangliste sehen will, klickt 20 Karten in 40 Sekunden durch. Das ergibt
perfekte Beteiligungszahlen und schlechtere Entscheidungen als WhatsApp. Die Kennzahl wird grün,
**weil** der Mechanismus versagt hat.

Das Messinstrument existiert bereits: `02-SRD` §6 führt die Medianzahl Stimmen pro Bewerbung und die
Frage, ob sich Stimmen auf die ersten Karten häufen. Beides ist dort als Ermüdungssignal gedacht. Es
ist auch ein Gaming-Signal.

**Wenn es falsch ist.** Zwei unabhängige Korrekturen, beide klein: Anreiz von der Schranke trennen —
immer die **Anzahl** abgegebener Stimmen zeigen, nie die Rangliste. Oder pro Kandidat verdecken statt
pro Runde, damit Durchklicken nicht das ganze Bild freischaltet.

**Herkunft.** `01-PF` E-09 · `02-SRD` S-14, §6, §8.2 · `05-ADRs` ADR-008 · **[scheitert unbemerkt]**

---

### H-D6 — Bewerbende akzeptieren, sichtbar verarbeitet zu werden

**Wir glauben, dass** der Datenschutzhinweis bei der Einladung (S-16) und die Dritterhebungs-Information
(S-38) die Rückmeldequote der Bewerbenden nicht senken.

**Für den Test werden wir** fünf aktuell Zimmersuchenden den echten Copy-Paste-Text zeigen und fragen,
was sie tun würden; in der Pilotrunde zusätzlich die Rückmeldequote nach Einladung erheben.

**Und messen** die Quote Einladung → Zusage sowie die Anzahl der Befragten, die den Hinweis als
abschreckend beschreiben.

**Wir liegen richtig, wenn** höchstens 1 von 5 den Hinweis abschreckend findet und die Rückmeldequote
nicht unter die Erinnerung an die letzte Runde fällt.

**Warum das riskant ist.** Bewerbende sind die einzige Marktseite, die deine Dokumente nur als
Rechtspflicht behandeln, nie als Nutzergruppe. Sie sind aber das Angebot. Ohne sie kein Casting.

Heute bekommt eine bewerbende Person eine WhatsApp-Antwort: „Komm Dienstag um 18 Uhr." Mit
Flatmate.io bekommt sie dieselbe Antwort **plus einen Datenschutzhinweis** mit Plattformnamen,
Speicherfrist und Rechten. Zwei Lesarten sind gleich plausibel, und die Dokumente unterstellen die
freundliche: Das wirkt seriös und fair — oder es wirkt nach Bürokratie und Überwachung, und die Person
antwortet auf die nächste Anzeige. In einem angespannten Markt kann der Haushalt das abfedern, in
einem entspannten nicht.

Nebenwirkung: Wer weiß, dass Notizen gespeichert werden, schreibt vorsichtigere und leerere
Bewerbungen. Das beschädigt genau das Freitext-Signal, auf dem das Screening beruht.

**Wenn es falsch ist.** Das ist zuerst ein Textproblem. Zuerst nennen, was der Haushalt **für** die
Person tut: nach 180 Tagen gelöscht, eine Ansprechperson, Kopie auf Anfrage. Danach die Verarbeitung.
Diese Reihenfolge ist auch die ehrlichere und kostet nichts.

**Herkunft.** `02-SRD` S-16, S-38 · `03-PRD` P-O-04, §4.6 · `06-Compliance` §4.3, §4.5 ·
**[ohne Code testbar]**

---

### H-D7 — Die Organisationslast sinkt *(aus deiner Ergänzung)*

**Wir glauben, dass** die organisierende Person weniger Zeit aufwendet und weniger im Kopf behalten
muss als mit WhatsApp, Portal, Doodle und Zetteln.

**Für den Test werden wir** die moderierende Person in der Concierge-Runde ein grobes Zeitprotokoll je
Schritt führen lassen und danach fragen, welche Teile sich wie **neue** Arbeit angefühlt haben.

**Und messen** die Minuten pro Runde gegen die Erinnerung an die letzte Runde, plus die Anzahl der
Schritte, die am Ende doch von Hand liefen.

**Wir liegen richtig, wenn** der Zeitaufwand sinkt **und** mindestens eine zweite Person eine
Organisationsaufgabe übernommen hat.

**Warum das riskant ist.** Alte Arbeit fällt weg: Bewerbungen in den Chat kopieren, Reaktionen
auszählen, hinterherlaufen. Neue Arbeit entsteht, und keine davon gibt es heute in WhatsApp:

- jede Bewerbung eintippen oder einfügen, danach jeden Parser-Vorschlag bestätigen
- `collected_from` je Bewerbung setzen — eine rechtliche Entscheidung
- Bewerbungen von Hand durch die Status-Pipeline schieben
- Aufbewahrungs-Vorwarnungen beantworten, verlängern oder löschen, Auskünfte erzeugen
- frühere Bewerbungen derselben Person zuordnen (siehe H-F5)

Die alte Arbeit war lästig, aber vertraut. Die neue ist ungewohnt und teilweise juristisch. Die Summe
kann gleich bleiben, und die *gefühlte* Last kann steigen, weil man jetzt ein System betreibt statt
einen Chat.

Zweiter Punkt: „Die Arbeit hängt an einer Person" ist PB-2, eines deiner Kernprobleme. v1 verteilt sie
aber kaum. Berechtigungen sind einzeln vergebbar (S-04) — gutes Design. Der Standard bleibt trotzdem,
dass die moderierende Person alles macht. Nichts im Produkt drängt aktiv eine zweite Person in die
Mitorganisation.

Und: Diese Annahme wird bisher gar nicht gemessen. Die nächstliegende Kennzahl, „Zeit bis
Entscheidung", hat ausdrücklich keinen Zielwert.

**Wenn es falsch ist.** Zwei Hebel. Erfassungsarbeit senken: Textbausteine (v1.1) und Browser-Extension
(v1.2) vorziehen. Und Mitorganisation zum Standard machen: Beim Rundenstart fragen, wer außerdem
Bewerbungen anlegen und Termine bestätigen darf.

**Herkunft.** `01-PF` PB-2, Belegkette · `02-SRD` S-04, §6 · **[ohne Code testbar]**

---

### H-D8 — Runden werden schneller *(aus deiner Ergänzung)*

**Wir glauben, dass** eine Runde vom Eingang der ersten Bewerbung bis zur Zusage schneller läuft als
die WhatsApp-Runde derselben WG — und dass die jetzt spezifizierte weiche Rundenfrist (S-44,
`CastingRound.phase_deadline_at`) dabei hilft, ohne die Beteiligung zu untergraben.

**Für den Test werden wir** in der Concierge-Runde jeden der 13 Schritte mit Zeitstempel versehen, bei
jedem Stillstand fragen: „Worauf wartet ihr gerade?", und zusätzlich beobachten, ob die Fristanzeige
(„Stimme ab bis X" / „X Tage/Stunden übrig") tatsächlich zu einer zusätzlichen Stimme oder einer
bewussten Entscheidung „jetzt mit den vorhandenen Stimmen weiter" führt oder ignoriert wird. Da S-44
selbst ein UI-Element ist, braucht dieser zweite Teil das gebaute Dashboard-Element, nicht die
papierbasierte Runde allein.

**Und messen** die Tage von der ersten `Application` bis `offer_made`, die Verteilung der Wartezeit auf
die vier Wartearten unten, sowie ob und wie oft die Fristanzeige zu schnellerem Nachziehen führte.

**Wir liegen richtig, wenn** die Gesamtdauer unter der Baseline liegt, „auf Stimmen warten" nicht die
größte Wartezeit stellt, **und** die Frist nachweislich zu schnellerem Nachziehen offener Stimmen
beiträgt statt ignoriert zu werden.

**Warum das riskant ist.** Die langen Wartezeiten liegen größtenteils außerhalb der App:

| Wo Zeit verloren geht | Kann die App das verkürzen? |
|---|---|
| Warten auf Antwort der Bewerbenden | nein |
| Termin finden, an dem genug Leute können | teilweise, das ist die Aufgabe des Solvers |
| Warten auf die Stimmen der Bewohnenden | ja, das ist der stärkste Hebel |
| Warten auf die Zusage der ausgewählten Person | nein |

Die App verkürzt also eine von vier Wartezeiten und hilft bei einer zweiten.

Und es gibt einen echten Zielkonflikt, den man kennen sollte, bevor man auf Tempo optimiert: Der
Zweck des Produkts ist, dass **mehr Menschen mitentscheiden**. Mehr Beteiligung heißt normalerweise
**langsamer**, nicht schneller. In WhatsApp entscheiden drei Leute am Dienstagabend, fertig. In
Flatmate.io sieht die Gruppe, dass 3 von 7 abgestimmt haben, und wartet. Die Quorum-Anzeige macht die
fehlenden Stimmen sichtbar — genau wie vorgesehen.

Dein Spec hat darauf reagiert: `02-SRD` **S-44** baut jetzt genau den Zug, den diese Hypothese am Ende
selbst vorschlug — eine weiche Frist je Rundenphase, rein anzeigend, blockiert nichts (analog zum
Quorum, S-13), speist nur die CTA-Sortierung im Dashboard. „Zeit bis Entscheidung" bleibt in §6
weiterhin ohne Zielwert. Der Zielkonflikt zwischen Beteiligung und Tempo ist damit nicht aufgelöst, nur
mit einem konkreten Instrument versehen — ob es wirkt, ist jetzt die offene Frage dieser Hypothese.

**Wenn es falsch ist.** Bewusst entscheiden, welches Ziel gewinnt. Zeigt sich, dass auch die
spezifizierte Frist die Wartezeit nicht senkt oder die Beteiligung untergräbt, bleiben zwei weitere
Züge: Quorum bleibt reine Anzeige (S-13, ist schon so). Und eine ausdrückliche Aktion „jetzt mit den
vorhandenen Stimmen entscheiden", damit Warten eine Wahl ist und kein Standard — S-44 speist zwar die
CTA-Sortierung, ersetzt diese Aktion aber nicht.

**Herkunft.** `01-PF` Belegkette, R-03 · `02-SRD` §6, S-13, S-44 · **[ohne Code testbar, außer der
Wirkung von S-44 selbst — die braucht das gebaute Dashboard-Element]**

---

## 2 · Feasibility — Machbarkeit

### H-F1 — Die Rollenkonstruktion trägt

**Wir glauben, dass** der Haushalt Verantwortlicher und Flatmate.io Auftragsverarbeiter ist, dass eine
Click-Through-AVV genügt, dass die Haushaltsausnahme zu Recht verneint wird und dass inzidentelle
Art.-9-Daten ohne Einwilligung handhabbar sind.

**Für den Test werden wir** zuerst die freiwillige DSFA erstellen und danach eine eng zugeschnittene
anwaltliche Prüfung ausschließlich zu Q-1 bis Q-4 beauftragen.

**Und messen** die schriftliche Antwort je Frage: bestätigt, mit Auflage bestätigt, oder verneint.

**Wir liegen richtig, wenn** alle vier Fragen bestätigt werden, ohne dass die Rollenkonstruktion
geändert werden muss.

**Warum das riskant ist.** Das sind Q-1 bis Q-4 aus `06-Compliance` §13, und dein eigenes Dokument
markiert alle vier als launch-blockierend. Die Analyse ist gut. Sie ist trotzdem deine Lesart, nicht
die einer Kanzlei — und §1.4 nennt die Grenze bei den Bewohnerdaten selbst die schwächste Stelle der
Konstruktion.

Der Fehlerfall ist keine Geldbuße, sondern ein Umbau. Kippt Q-1 zur gemeinsamen Verantwortlichkeit
nach Art. 26 — plausibel, weil Flatmate.io Skala, Score-Formel und Frist vorgibt, also die
wesentlichen Mittel —, ist die AVV das falsche Instrument. Dann braucht es eine Vereinbarung über
gemeinsame Verantwortlichkeit, eine gemeinsame Transparenzinformation und geteilte Haftung, für jeden
Haushalt auf der Plattform.

**Wenn es falsch ist.** Beide Ausweichwege jetzt durchrechnen, nicht erst nach dem Gutachten. Erstens:
Selbst-Hosting je Haushalt. Stärkt das Ausnahme-Argument und zerstört das Betriebsmodell. Zweitens:
dem Haushalt Skala, Formel und Frist überlassen, damit Flatmate.io weniger Mittel bestimmt. Das
schwächt das Erklärbarkeits-Versprechen aus P-3.

**Herkunft.** `06-Compliance` §1.1–1.4, §8, §11.6, §13 · `02-SRD` §7 · **[ohne Code testbar, aber nur
anwaltlich beantwortbar]**

---

### H-F2 — Eine Person baut v1, und die Schutzregeln halten

**Wir glauben, dass** eine Person KI-gestützt alle 41 Scope-Zeilen von v1 baut — inklusive Solver mit
Erklärbarkeit, doppelter Autorisierung und Löschautomatik — und dass die maschinellen Schutzregeln
den Fehlertyp wirklich verhindern, für den sie gebaut wurden.

**Für den Test werden wir** vor allem anderen drei schmale Durchstiche bauen: Policy plus RLS auf einer
Entität, CP-SAT auf realistischer Eingabe, Löschlauf auf Testdaten.

**Und messen** die Anzahl nötiger RLS-Umgehungen, die p95-Laufzeit des Solvers und die tatsächliche
Dauer der Durchstiche gegen die Schätzung.

**Wir liegen richtig, wenn** null Umgehungen nötig sind, der geschützte Test beim Entfernen einer der
beiden Schichten rot wird und kein Durchstich mehr als das Doppelte seiner Schätzung braucht.

**Warum das riskant ist.** `02-SRD` §7 nennt die Solo-Kapazität bereits als Risiko und zählt dabei
**37 Scope-Zeilen**. Die Tabelle direkt darüber geht bis **S-41**. Vier Zeilen kamen bei der
Querprüfung mit Domänenmodell und Compliance-Anhang dazu, und die Risikoliste wurde nicht
nachgezogen. Das ist kein Tippfehler, sondern eine Messung: Sorgfältiges Querprüfen erzeugt Scope
schneller, als Bauen ihn abbaut. Das passiert wieder.

Die zweite Hälfte ist gefährlicher. Deine Antwort auf das KI-Implementierungsrisiko ist maschinelle
Erzwingung statt guter Vorsätze: RLS plus Policy-Objekte (ADR-004), geschützte Tests, Import-Lint,
CI-Gate auf `data-inventory.yml` (ADR-010). Das ist die richtige Antwort — und sie ist ungeprüft. Eine
Schutzregel zählt erst, wenn sie einmal etwas Unbequemes blockiert hat und den Wunsch überlebt hat,
sie zu lockern. Bei RLS ist das Muster bekannt: Normale Abfragen scheitern auf eine Weise, die wie ein
Bug aussieht, und die schnellste lokale Lösung ist eine Umgehung, die nie wieder verschwindet.

| Durchstich | Frage | Bestanden, wenn |
|---|---|---|
| **A — Berechtigungen auf einer Entität** | Übersteht die doppelte Prüfung einen echten Abfragepfad? | Eine Listenroute für `Application`, korrekt unter allen vier Sichtbarkeitsregeln, **null** RLS-Umgehungen, plus ein Test, der beim Entfernen einer Schicht fehlschlägt |
| **B — Solver auf realistischer Eingabe** | Ist Determinismus bei realen Größen bezahlbar? | 10 Bewerbende × 7 Bewohnende × 1 Woche, ein Worker, fester Seed, zwei identische Läufe, **und die p95-Laufzeit ist notiert**. Diese Zahl schließt O-06 |
| **C — Löschlauf auf Testdaten** | Ist die Löschung vollständig und sichtbar? | Verkürzte Frist, Vorwarnung feuert, Verlängerung protokolliert, Löschung erfasst `Application` und `subject_statement` in einer Transaktion, der Log-Eintrag bleibt |

**Wenn es falsch ist.** In dieser Reihenfolge streichen, belegbasiert statt nach Geschmack: Solver,
Kalender, Veto, Web Push. `02-SRD` S-18 stellt bereits fest, dass die solverfreie
Feasibility-Schicht den Alltag trägt, und der Port aus ADR-005 macht das Verschieben billig.

**Herkunft.** `02-SRD` §5.3, §7 · `03-PRD` §6.1, §7.2, §7.3 · ADR-004, ADR-005, ADR-010 ·
`GUARDRAILS.md`

---

### H-F3 — Der Solver ist deterministisch, erklärbar und schnell genug

**Wir glauben, dass** CP-SAT mit einem Worker und festem Seed bei realistischen Problemgrößen
innerhalb des 10-Sekunden-Budgets bleibt.

**Für den Test werden wir** das Modell gegen synthetische Daten in drei Größen rechnen — Zielgröße
10 Bewerbende × 7 Bewohnende × 1 Woche plus zwei größere Stufen — und jede Größe zweimal laufen
lassen.

**Und messen** die p95-Laufzeit je Größe und die Gleichheit der beiden Läufe.

**Wir liegen richtig, wenn** p95 bei der Zielgröße unter 10 Sekunden liegt und beide Läufe identische
Vorschläge liefern.

**Warum das riskant ist.** O-06 ist ausdrücklich offen: Nur die Größenordnung fehlt. Genau die
entscheidet aber, ob sich die Konstruktion lohnt. Determinismus kostet dich ungefähr den Faktor deiner
Kernanzahl, weil du auf einen Worker beschränkt bist. Das ist in ADR-005 richtig hergeleitet und
trotzdem nicht gratis.

Greift das Budget regelmäßig, sinkt P-3 von einer Zusage zu einer Fußnote. Die WG liest bei den
meisten Vorschlägen „unter Zeitdruck gefunden, möglicherweise nicht optimal". Dann kauft das
Erklärbarkeits-Argument, wegen dessen du einen exakten Solver statt einer billigen Heuristik gewählt
hast, nichts mehr ein.

Bezahlt ist dafür schon: rund 150 MB mehr im Image, 200–500 ms Prozessstart pro Aufruf und eine zweite
Laufzeitumgebung in einem Solo-Projekt.

**Wenn es falsch ist.** Nur die Feasibility-Schicht ausliefern (S-18) und den Solver nach v1.1
schieben. Der Port existiert genau dafür. Die Kennzahl „Anteil Termine über ‚Vorschlag berechnen'
gegen manuelles Legen" sagt dir später, ob er je gebraucht wurde.

**Herkunft.** `05-ADRs` ADR-005 · `02-SRD` §7, S-18 bis S-20, O-06 · `03-PRD` §6.1, §6.2, P-O-06 ·
**[ohne Code testbar, synthetische Daten genügen]**

---

### H-F4 — Die regelbasierten Parser sind gut genug

**Wir glauben, dass** Paste-Parser und Freitext-Zeitfenster-Parser oft genug richtig liegen, dass
Moderierende sie weiter benutzen statt alles von Hand einzutippen.

**Für den Test werden wir** 20 echte Bewerbungsnachrichten und 20 echte Verfügbarkeitssätze aus dem
letzten Casting des Pilothaushalts von Hand gegen die geplanten Regeln durchspielen.

**Und messen** den Anteil der Felder, die korrigiert werden müssten, je Bewerbung und je Feldtyp.

**Wir liegen richtig, wenn** im Median höchstens 30 % der Felder korrigiert werden müssen.

**Warum das riskant ist.** Beide Parser bekommen schwierige Eingaben: WhatsApp-Bewerbungen in
beliebigem Format und deutsche Verfügbarkeitsformulierungen wie *dienstags ab 16*, *nur abends*,
*am 3.9. nachmittags*.

Die Genauigkeitshürde ist hoch und einseitig. E-16 sagt es klar: Eine falsch verstandene Verfügbarkeit
lässt einen Termin platzen, deshalb muss jeder Vorschlag bestätigt werden. Richtig — aber Bestätigen
kostet Zeit. Wenn die moderierende Person ohnehin jedes Feld lesen und korrigieren muss, ist der
Parser langsamer als das Formular. Dann wird der manuelle Pfad aus P-1 zum **einzigen** Pfad, der
Parser hat für echten Bauaufwand nichts geliefert, und der Druck Richtung KI-Parsing in v2 steigt. Das
ist die teure Option: EU-Verarbeitung, AVV mit dem Modellanbieter und dauerhafte Disziplin, unter P-5
bei reiner Extraktion zu bleiben.

Die Kennzahl dafür steht schon in `02-SRD` §6, samt Hinweis, dass ein schlechtes Ergebnis v2 zur
Notwendigkeit macht. Sie hat keinen Zielwert — kann also heute nicht durchfallen.

**Wenn es falsch ist.** Bewusst wählen statt driften. Entweder den Paste-Parser aus v1 streichen und
den Aufwand in ein schnelleres Formular stecken (P-1 ist so oder so erfüllt). Oder den Parser auf die
zwei Felder verengen, die er zuverlässig trifft — vermutlich Name und Kontakt — und den Rest
weglassen.

**Herkunft.** `01-PF` E-15, E-16 · `02-SRD` S-08, S-17, S-39, §6 · `06-Compliance` §9.5 ·
**[ohne Code testbar]**

---

### H-F5 — Der Einladungslink verknüpft neue Bewohnende automatisch *(um deinen Vorschlag herum neu geschrieben)*

**Wir glauben, dass** der jetzt spezifizierte Einladungslink (`ApplicationInviteToken`, S-42) beim
Einzug `became_resident_id` automatisch und zuverlässig setzt, dass sein spezifizierter Fehlerfall
funktioniert, und dass die verbleibenden Fälle entweder selten sind oder durch einen Hinweis
abgefangen werden.

**Für den Test werden wir** einen 30-minütigen Papierdurchlauf mit vier Fällen machen: sauberer Einzug
über den Link, Person mit einer älteren Bewerbung, Registrierung über den allgemeinen Beitrittscode,
eine bereits registrierte und angemeldete Person klickt den Token erneut.

**Und messen**, in wie vielen der vier Fälle am Ende eine korrekte Verknüpfung steht, ob in den
Umgehungsfällen ein sichtbarer Hinweis erscheint, und ob der vierte Fall tatsächlich mit der
spezifizierten Fehlermeldung endet statt mit einer stillen Verknüpfung oder Überschreibung.

**Wir liegen richtig, wenn** Fall 1 ohne menschliche Handlung verknüpft ist, die Fälle 2 und 3 einen
sichtbaren Hinweis auslösen, und Fall 4 mit der erklärten Fehlermeldung „Du bist bereits als
Bewohner:in registriert" endet.

**Dein Vorschlag, und warum er besser ist als meiner.** Sobald eine Bewerbung als einziehend markiert
ist, erzeugt die App einen persönlichen Einladungslink. Wer sich darüber registriert, wird automatisch
mit seiner Bewerbung verknüpft. Drei Gründe, warum das stärker ist als mein Vorschlag aus V0.2 (ein
Pflichtdialog beim `moved_in`):

1. Es nimmt den Menschen aus dem Normalfall. Ein Pflichtdialog hängt weiter daran, dass jemand richtig
   antwortet. Dein Link nicht.
2. Es löst Q-14 gar nicht erst aus. Q-14 fragt, ob man Personen über Namens-, Mail- und
   Telefonähnlichkeit abgleichen darf. Der Token *ist* die Verknüpfung — kein Raten, kein
   versehentliches Zusammenführen zweier verschiedener Personen.
3. Es passt zu dem, was du schon hast. Token-Seiten ohne Konto sind für Verfügbarkeiten bereits
   vorgesehen (S-17). Das ist dasselbe Muster, einen Schritt später.

Nebeneffekt: Die neu einziehende Person kommt über einen Link herein, der sie schon kennt. Der Name
ist vorbelegt, ein Schritt bis zum Profil. Das hilft der Aktivierungsquote — dem wackeligsten Eingang
in deine Kernmetrik.

**Was offen bleibt.** Von den drei ursprünglich benannten Lücken ist eine jetzt spezifiziert, zwei
bleiben offen:

- **Frühere Bewerbungen.** Das ist das eigentliche Leck aus `06-Compliance` §3.4. Jemand hat sich vor
  zwei Jahren erfolglos beworben, bewirbt sich erneut und zieht ein. Der Token verknüpft die *neue*
  Bewerbung. Die *alte* trägt weiterhin `Vote`s und `CastingNote`s über dieselbe Person und bleibt für
  sie sichtbar. Der Link kann davon nichts wissen. **Weiterhin offen.**
- **Der Umgehungspfad.** Registriert sich die Person über den allgemeinen Beitrittscode, oder legt die
  moderierende Person das Profil von Hand an, passiert keine Verknüpfung und niemand wird gewarnt.
  **Weiterhin offen.**
- **Die falsche Person klickt — jetzt teilweise geschlossen.** Der Token ist inzwischen spezifiziert:
  einmalig, mit `expires_at`, an eine `Application` gebunden, widerrufbar (S-42). Und für den
  konkreten Fall, den diese Hypothese ursprünglich fürchtete — dass eine bereits registrierte Person
  den weitergeleiteten Link klickt und ein bestehendes Profil überschrieben oder mit dem falschen
  Profil verknüpft wird —, gibt es jetzt eine erklärte Fehlermeldung statt eines stillen Fehlschlags.
  Das ist **nicht identisch** mit der ursprünglichen Sorge: Klickt eine noch **nicht** registrierte,
  aber falsche Person den weitergeleiteten Link zuerst und registriert sich darüber, greift die
  S-42-Fehlerprüfung nicht — sie prüft nur, ob die klickende Person bereits ein Konto hat, nicht, ob
  sie die richtige Person ist. Die Kernfrage „was passiert bei einer bereits registrierten Person" ist
  damit beantwortet; das schmalere Restrisiko einer noch nicht registrierten falschen Person bleibt.

**Wenn es falsch ist.** Für den Fall „frühere Bewerbungen" einen kleinen Hinweis behalten, genau dann,
wenn aus einer Bewerbung ein Profil entsteht: *Gibt es frühere Bewerbungen dieser Person? Nicht
zugeordnete bleiben für sie sichtbar.* Daneben die nicht verknüpften Bewerbungen desselben Haushalts
zeigen. Das ist kein automatischer Abgleich, Q-14 bleibt also unberührt. Für den Umgehungspfad und das
schmale Restrisiko der noch nicht registrierten falschen Person bleibt vorerst nur Sichtbarkeit — kein
technischer Zug ist bisher vorgeschlagen.

**Umgesetzt statt vorgeschlagen.** Der Vorschlag aus V0.3 dieses Audits ist inzwischen echte Spec: S-42
in `02-SRD` §5.3/§5.4, die vollständige `ApplicationInviteToken`-Entität in `04-Domaenenmodell` und der
Fehlerfall in `03-PRD` §4.1.7 gehen über den ursprünglichen Vorschlag hinaus — vor allem um die
explizite Fehlermeldung bei bereits registrierten Personen, die hier nicht mitgedacht war. Dazu ein
neuer GUARDRAILS-Eintrag `G-D12`, der genau diesen Einlösepfad als geschützten Test absichert.

**Herkunft.** `02-SRD` S-31, S-40, S-42, §7 · `04-Domaenenmodell` §5.1, §5.3 · `06-Compliance` §3.4,
Q-14 · `03-PRD` §4.1.7, §6.5 · `GUARDRAILS.md` G-D12 · **[scheitert unbemerkt, solange die beiden
verbleibenden Lücken offen sind]**

---

### H-F6 — Was in einer Benachrichtigung stehen darf *(nach deinem Einwand korrigiert)*

**Wir glauben, dass** Digest- und Benachrichtigungstexte nur Ereignisse und Zahlen enthalten, keine
Urteile und keine Namen — und zwar kanalübergreifend: im Web-Push-Payload (jetzt der primäre Kanal, mit
In-App), genauso wie im E-Mail-Fallback für Resident-Accounts ohne installierte PWA (E-22 korrigiert).

**Für den Test werden wir** die geplanten Vorlagen für beide Kanäle — Web-Push-Payload und
Fallback-E-Mail — lesen, als wäre die zugehörige Runde vor einem Jahr gelöscht worden.

**Und messen** die Anzahl der Vorlagen je Kanal, die Bewerbername, Score, Ranglistenplatz oder
Notizinhalt enthalten.

**Wir liegen richtig, wenn** dieser Wert in beiden Kanälen null ist.

**Dein Einwand, und ich stimme zu.** In V0.2 hatte ich versendete E-Mails als Loch im Löschkonzept
bezeichnet. Das war falsch, aus dem Grund, den du genannt hast: Post aus fremden Postfächern kann man
nicht löschen, und man muss es auch nicht. Der Löschanspruch betrifft Daten, über die du verfügst. Der
Vergleich mit dem Service Worker trägt ebenfalls nicht: Ein Cache ist Speicher auf einem Gerät, den
dein Code beschreibt und leeren kann. Ein Postfach ist beides nicht.

Inzwischen ist E-Mail dazu nicht mehr der Standardkanal, sondern der Ausnahmefall: Die
`Notification`-Kanalauflösung (S-28) bevorzugt Web Push bei aktiver `PushSubscription`, fällt sonst auf
E-Mail zurück (nur wenn `Account.email` gesetzt ist), sonst auf In-App. Das ändert nichts an der
Inhaltsregel unten — sie gilt für jeden Kanal gleich —, verschiebt aber, wie kritisch diese Hypothese
ist.

**Was übrig bleibt, deutlich kleiner.** Keine Löschfrage, sondern eine Inhaltsfrage.

- **Datenminimierung.** Art. 5 Abs. 1 lit. c gilt im Moment des Versands, unabhängig vom Kanal. Ein
  Digest oder eine Push-Benachrichtigung mit „Lea hat Score 82" legt eine Beurteilung über eine dritte
  Person offen. „4 Bewerbungen warten auf deine Stimme" erledigt dieselbe Aufgabe und tut das nicht.
- **Vollständigkeit der Auskunft — jetzt nur noch der Fallback-Fall.** Fragt eine bewerbende Person den
  Haushalt, was gespeichert ist, kann der Export Kopien in fremden Postfächern nicht enthalten. Das
  gilt weiterhin, betrifft aber nur noch die Fälle, in denen tatsächlich eine Fallback-E-Mail
  verschickt wurde — nicht mehr den Regelfall. Eine Web-Push-Zustellung oder eine reine
  In-App-`Notification` landet nicht in einem fremden, für Flatmate.io unzugänglichen Postfach. Weil
  E-Mail jetzt die Ausnahme ist statt der Standard, ist dieser Punkt weniger kritisch als in V0.4.

Dein Rahmen steht schon größtenteils: Die Sichtbarkeitspolicy gilt für Betreff, Vorschautext und
Inhalt, geprüft in `03-PRD` §4.1.12/§6.5, und vor der E-Mail-Verifikation gehen keine Beratungsinhalte
raus. Es fehlt weiterhin ein expliziter Satz zum Inhalt.

**Wenn es falsch ist.** Eine Regel, billig solange die Vorlagen noch nicht geschrieben sind:
**Benachrichtigungen tragen Ereignisse und Zahlen, keine Urteile und keine Namen — über In-App, Web
Push und den E-Mail-Fallback hinweg.** Das stärkt nebenbei H-D4, weil eine namensfreie Erinnerung als
Rückholer trotzdem funktioniert, unabhängig davon, über welchen Kanal sie ankommt.

**Herkunft.** `02-SRD` S-28, E-22 · `03-PRD` §4.1.12, §6.2, §6.5 · `06-Compliance` §5.7, §5.8 ·
**Bewertung gegenüber V0.2 gesenkt, in V0.5 nochmals leicht gesenkt — E-Mail ist jetzt Ausnahmefall,
nicht Standard**

---

## 3 · Viability — Wirtschaftlichkeit

### H-V1 — Haushalte führen wirklich 2 bis 4 Runden pro Jahr durch

**Wir glauben, dass** Haushalte der Zielgruppe 2 bis 4 Casting-Runden pro Jahr durchführen, sodass sich
die Aktivierung von 5 bis 10 Personen über Jahre auszahlt statt nur einmal.

**Für den Test werden wir** 8 bis 10 kurze Interviews führen, getrennt nach WG und Wohnprojekt, mit
der Hauptfrage: „Wie oft habt ihr in den letzten 12 Monaten ein Zimmer ausgeschrieben und ein Casting
gemacht?"

**Und messen** den Median der Runden pro Haushalt und Jahr sowie die durchschnittliche Wohndauer,
getrennt je Segment.

**Wir liegen richtig, wenn** der Median in **beiden** Segmenten bei mindestens 2 liegt.

**Warum das riskant ist.** E-01 trägt die ganze Strategie. Es ist der Grund für „ab 5 Bewohnenden"
statt „WGs allgemein", der Grund, warum einmalige Onboarding-Kosten vertretbar sind, und in deinen
Worten der Grund, warum ein Spenden- oder Freemium-Modell überhaupt plausibel wird.

Die Rechnung ist eine Zeile: 8 Personen geteilt durch rund 2 Jahre Wohndauer ergibt 4 Wechsel pro
Jahr. Die Rechnung stimmt. Der Eingabewert ist ungeprüft, und das Ergebnis hängt stark an ihm:

| Wohndauer | Wechsel pro Jahr |
|---|---|
| 2 Jahre | 4,0 |
| 3 Jahre | 2,7 |
| 4 Jahre | 2,0 |
| 5 Jahre | 1,6 |

Zwei weitere Probleme. Deine Zielgruppe besteht aus zwei Populationen, die vermutlich an
entgegengesetzten Enden dieser Tabelle sitzen: Studentische WGs wechseln schnell, Wohnprojekte sind
oft **auf lange Wohndauer angelegt** — stabile Zusammensetzung ist dort häufig der Zweck. Und Castings
werden **gebündelt**: Drei gleichzeitig frei werdende Zimmer sind eine Runde, nicht drei. Deine
Rechnung zählt Wechsel. Zählen müsste man Runden.

**Wenn es falsch ist.** Zielgruppe neu schneiden, bevor weitergebaut wird. Nach Kosten sortiert: auf
wechselstarke WGs verengen und Wohnprojekte aus der v1-Positionierung nehmen. Oder die Schwelle von
5+ auf 8+ Bewohnende heben. Oder niedrige Frequenz akzeptieren und den Wiedereinstieg nach 12 Monaten
so billig machen wie die Erstanmeldung — dann wird H-D4 zur wichtigsten Hypothese statt H-D1.

**Herkunft.** `01-PF` E-01 · `02-SRD` §1, §6 · **[ohne Code testbar]**

---

### H-V2 — Die zweite Runde findet wieder in der App statt

**Wir glauben, dass** ein Haushalt, der eine Runde in Flatmate.io abgeschlossen hat, vier bis neun
Monate später auch die nächste dort startet statt in WhatsApp.

**Für den Test werden wir** am Ende von Runde 1 fragen „Was macht ihr zuerst, wenn das nächste Zimmer
frei wird?" — und beim nächsten Auszug eine Woche lang bewusst nicht erinnern.

**Und messen**, ob die zweite Runde ohne Anstoß in der App beginnt, und nach wie vielen Tagen.

**Wir liegen richtig, wenn** die zweite Runde ohne Erinnerung in der App startet.

**Warum das riskant ist.** H-V1 fragt, wie oft der Bedarf entsteht. Hier geht es darum, ob du ihn beim
zweiten Mal auch einfängst. Genau hier zahlt sich die „einmal aktivieren, jahrelang nutzen"-Idee
überhaupt erst aus.

Drei Dinge arbeiten in der Lücke gegen dich: Die moderierende Person ist womöglich ausgezogen — genau
der Wechsel, der den Bedarf erzeugt. Die Bewohnenden haben das Werkzeug vergessen (H-D4). Und die
WhatsApp-Gruppe ist weiterhin da, aktiv und Standard.

Das Produkt hat bewusst keine Gewohnheitsschleife. Zwischen den Runden gibt es nichts zu tun. Das ist
richtig entworfen und trotzdem ein realer Preis.

Deine Kennzahl „abgeschlossene gegen gestartete Runden" (> 70 %) misst den Abbruch **innerhalb** einer
Runde. Die Rückkehr **zur nächsten** misst nichts in der Dokumentenkette.

**Wenn es falsch ist.** Die Lücke braucht einen Auslöser, und es gibt genau einen ehrlichen: den
Moment, in dem jemand seinen Auszug ankündigt. Ein Einstieg „jemand zieht aus", der zugleich die Runde
anlegt, macht aus der Ruhephase einen Haken statt eines Lecks. Steht heute nicht im Scope.

**Herkunft.** `02-SRD` §1, §6 · `01-PF` E-01, E-23 · **[scheitert unbemerkt]**

---

### H-V3 — Das Geld für den Start ist da

**Wir glauben, dass** das Geld für die beiden Posten vorhanden oder beschaffbar ist, an denen der
Launch hängt: die anwaltliche Prüfung zu Q-1 bis Q-4 und 12 Monate Dauerbetrieb.

**Für den Test werden wir** drei Angebote für die eng zugeschnittene Prüfung einholen, ein
Betriebskostenmodell für 1, 10 und 200 Haushalte rechnen und je ein Gespräch mit der
Hochschulförderung und einer Legal Clinic führen.

**Und messen** die konkrete Summe je Posten und die benannte Finanzierungsquelle je Posten.

**Wir liegen richtig, wenn** beide Posten mit **Quelle und Betrag** auf einer Seite stehen und keiner
davon „ungedeckt" lautet.

**Warum das riskant ist.** Beide Kosten entstehen aus bereits getroffenen Entscheidungen, und Einnahmen
sind nirgends beschrieben.

ADR-006 schließt Serverless aus und sagt es ehrlich: kein Serverless heißt Betriebskosten, ein
laufender Container statt Skalierung auf Null, eine dauerhafte Position für ein spendenfinanziertes
Vorhaben. Dazu kommen aus ADR-005 rund 150 MB Python und OR-Tools im Image.

Und `06-Compliance` §13 stuft Q-1 bis Q-4 als launch-blockierend ein. Damit wird aus einer sinnvollen
Prüfung eine **notwendige** — vor dem ersten Haushalt, der nicht deiner ist.

Größenordnungen, und das sind **meine Schätzungen, keine Zahlen aus deinen Dokumenten**: Der Betrieb
ist der kleine Posten, grob 25 bis 60 € im Monat bei Pilotgröße für EU-Container, verwaltetes Postgres
und Transaktions-E-Mail. Eine eng zugeschnittene anwaltliche Prüfung von vier gut vorbereiteten Fragen
liegt realistisch im vierstelligen Bereich. **Der Rechtsposten ist rund zehnmal so groß wie der
Betriebsposten — und er ist der, an dem der Launch hängt.** Jede Wirtschaftlichkeitsdiskussion, die
mit Hosting-Kosten beginnt, schaut auf die falsche Zahl. Derzeit weist kein Dokument einem der beiden
Posten eine verantwortliche Person zu.

**Wenn es falsch ist.** Es gibt einen sauberen Zwischenschritt, und der sollte der Plan sein statt der
Notnagel: **die Pilotrunde im eigenen Haushalt durchführen.** Dort ist das Argument der
Haushaltsausnahme am stärksten und du bist selbst Verantwortlicher. Das liefert die Belege für H-D1,
H-D2, H-D3, H-D7 und H-D8, ohne Bewerberdaten eines fremden Haushalts zu verarbeiten. Und Belege sind
das, was das Finanzierungsgespräch gewinnbar macht.

**Herkunft.** `05-ADRs` ADR-005, ADR-006 · `06-Compliance` §13, §11.6 · `01-PF` E-23 ·
**[ohne Code testbar]**

---

### H-V4 — Wer nichts zahlt, spendet trotzdem etwas

**Wir glauben, dass** Haushalte, die nichts zahlen, das Werkzeug drei Wochen im Jahr benutzen und es
sich nicht ausgesucht haben, freiwillig genug spenden, um die Betriebskosten zu decken.

**Für den Test werden wir** im Abschlussgespräch ohne jeden Spendenaufruf fragen: „Wenn das die WG
etwas gekostet hätte — was wäre fair gewesen, und wer hätte es bezahlt?" Weil die jetzt spezifizierte
S-43-E-Mail erst nach der 3.–4. abgeschlossenen Runde feuert, prüft dieses Interview die
Zahlungsbereitschaft vorab — nicht das tatsächliche Verhalten beim Erhalt der E-Mail. Das bleibt H-V7.

**Und messen** den genannten Betrag pro Runde und ob überhaupt eine zahlende Rolle benannt werden kann.

**Wir liegen richtig, wenn** ein Betrag über null genannt wird **und** eine konkrete Zahlerrolle
benannt werden kann.

**Warum das riskant ist.** E-23 macht „dauerhaft kostenlos für Bewohnende" zu einer Wertentscheidung,
und für die Adoption ist sie gut. Sie bedeutet aber auch, dass die Einnahmenseite in v1 genau ein
Instrument hat — die freiwillige Spende — gerichtet auf das denkbar schlechteste Spenderprofil:
Niemand besitzt das Werkzeug persönlich, es gibt keine laufende Beziehung, und in einer Siebener-WG
ist „macht schon jemand anders" die Standardantwort auf jede geteilte Ausgabe.

Spendenquoten im Konsumbereich liegen üblicherweise deutlich unter 1 %. Es gibt keinen Grund, warum
eine WG das schlagen sollte. Ein Haushalt, der einmal spendet, ist ein Dankeschön, kein
Geschäftsmodell.

O-05 — Spendenkommunikation und Platzierung — ist jetzt konkretisiert: eine einmalige E-Mail an die
Haushalts-E-Mail nach der 3.–4. abgeschlossenen `CastingRound`, außerhalb des In-App-Flows (S-43,
v1.1). Timing und Kanal stehen damit fest, bevor diese Hypothese geprüft wurde — genau die Reihenfolge,
vor der sie eigentlich warnt: Ein Instrument ist entschieden, während offen bleibt, ob überhaupt jemand
darauf reagiert.

**Wenn es falsch ist.** Als Information behandeln, nicht als Misserfolg. Die ehrliche Folgerung könnte
sein, dass Flatmate.io Infrastruktur ist und kein Geschäft. Dann sind Förderungen, eine Stiftung,
Hochschul-Hosting oder ein Sponsor die richtigen Instrumente. Keines davon steht in deinen Dokumenten.
Das bewusst zu wählen ist deutlich besser, als es nach dem Bau der Vermieterstufe zu bemerken.

**Herkunft.** `01-PF` E-23 · `02-SRD` §3.2, S-43 · **[ohne Code testbar]**

---

### H-V5 — Die Vermieterstufe ist ein tragfähiger Weg zu Einnahmen

**Wir glauben, dass** Vermietende mit mehreren Wohnungen für Flatmate.io zahlen und dass diese
Einnahmen die Compliance-Kosten übersteigen, die das Freischalten der Stufe auslöst.

**Für den Test werden wir** fünf Gespräche mit kleinen Mehrfach-Vermietenden führen, mit der Kernfrage:
„Wer entscheidet, wer die Wohnung bekommt — und stimmt sonst jemand mit ab?"

**Und messen**, wie viele die Gremienentscheidung als wertvoll benennen und welchen Betrag sie zu
zahlen bereit wären.

**Wir liegen richtig, wenn** mindestens 2 von 5 die Gremienfunktion als wertvoll benennen und der
genannte Betrag über den umgelegten Q-13-Kosten liegt.

**Warum das riskant ist.** Zwei Probleme multiplizieren sich, und deine Dokumente nennen jedes für
sich, ohne sie zu verbinden.

**Produkt-Passung.** Das Unterscheidungsmerkmal ist die *gemeinsame Entscheidung*: Quorum, verdeckte
Ergebnisse, Veto, Nachholen für Abwesende. Vermietende mit mehreren Einheiten **entscheiden allein**.
Die zahlende Persona braucht genau den Teil nicht, der dich einzigartig macht. Gebraucht werden
Pipeline und Terminfindung — und dort gibt es bereits kostenlose Wettbewerber, etwa
`besichtigungstermine.com`.

**Kostenreihenfolge.** `06-Compliance` §12 und Q-13 zeigen: Diese Stufe verschiebt die Rechtslage. Die
AGG-Ausnahme für WG-Zimmer greift nicht mehr. Der AI Act rückt näher. Es braucht ein eigenes
Art.-30-Verzeichnis, eine angepasste AVV und vermutlich eine DSFA. All das ist **vor** dem
Freischalten zu bezahlen.

Deine Dokumente formulieren das elegant: Die zahlende Stufe finanziert die Compliance, die sie selbst
auslöst. Als Prinzip schön. Als Zahlungsstrom ist es ein Kreis — **die Ausgabe kommt zuerst und ist
das, was die Einnahme erst freischaltet.**

**Wenn es falsch ist.** Besser vor v2 wissen als während v2. Die übrigen Wege liegen alle auf der
WG-Seite: eine zahlende Stufe für größere Wohnprojekte, White-Label für
Studierendenwohnheim-Anbieter, Lizenzierung an Hochschulen oder Kommunen. Keiner davon löst AGG § 19
aus oder rückt den AI Act näher. Die Option offenzuhalten kostet architektonisch nichts. Sie zu
**bewerben** kostet.

**Herkunft.** `01-PF` E-23 · `02-SRD` §7 · `06-Compliance` §12, Q-13 · **[ohne Code testbar]**

---

### H-V6 — Haushalte lassen sich ohne Wachstumsschleife und ohne Budget erreichen

**Wir glauben, dass** sich genug Haushalte einzeln erreichen lassen, ohne Marketingbudget und ohne
viralen Mechanismus, damit das Produkt über den Pilotfall hinaus Wirkung hat.

**Für den Test werden wir** das Nutzenversprechen mit einer Warteliste in drei WG- und
Wohnprojekt-Netzwerken und einer Hochschul-Wohnliste posten.

**Und messen** die Anmeldungen auf der Warteliste und die daraus qualifizierten Haushalte innerhalb
von 60 Tagen.

**Wir liegen richtig, wenn** mindestens drei qualifizierte Haushalte ohne persönliche Beziehung
zustande kommen.

**Warum das riskant ist.** P-1 ist für die Nutzenden richtig und für Wachstum teuer. Bewerbende werden
**nie** in die App gezwungen. Damit sieht genau die Gruppe, die dieses Produkt in großer Zahl berührt
— Dutzende Bewerbende pro Runde, also exakt die Menschen, die in zwei Jahren wieder ein Zimmer suchen
— es nie, registriert sich nie und kann es nicht in ihren nächsten Haushalt tragen. Das Produkt
entfernt seine einzige natürliche Wachstumsschleife bewusst.

Ersatz gibt es keinen. Keine App-Store-Präsenz, was unter ADR-011 richtig ist. Keine Portal-Anbindung,
was unter E-15 richtig ist, weil keine offizielle API existiert. Und ein Haushalt ist nichts, das man
öffentlich finden und ansprechen kann.

`03-PRD` §6.1 nennt 200 Haushalte je Instanz als Zielgröße, §6.4 spezifiziert SEO. SEO auf einen
Suchbegriff, den fast niemand eingibt, ist ein Kanal nur dem Namen nach. Ein Akquiseplan steht nirgends
in der Kette. Für ein Portfolio-Projekt ist das in Ordnung. Für ein Produkt ist es tödlich.

**Wenn es falsch ist.** Die realistischen Kanäle sind institutionell statt viral:
Studierendenwerke, Wohnprojekt-Verbünde, Hochschul-Wohnungsämter. Jeder erreicht über eine Beziehung
viele Haushalte. Das macht aus dem Produkt B2B2C, und das ändert Positionierung, Onboarding **und**
die datenschutzrechtliche Analyse, weil dann womöglich die Organisation Verantwortlicher ist. Besser
vorher wissen als nachher.

**Herkunft.** `01-PF` P-1 · `02-SRD` §5.1, §1 · `03-PRD` §6.1, §6.4 · ADR-009, ADR-011 ·
**[ohne Code testbar]**

---

### H-V7 — Ein Spendenhinweis wirkt, ohne Schaden anzurichten *(aus deiner Ergänzung)*

**Wir glauben, dass** die jetzt spezifizierte S-43-E-Mail — einmalig, an die Haushalts-E-Mail, nach der
3.–4. abgeschlossenen `CastingRound`, außerhalb des In-App-Flows — Spenden erzeugt, ohne Vertrauen oder
Beteiligung zu beschädigen.

**Für den Test werden wir** den geplanten Wortlaut der S-43-E-Mail fünf Personen zeigen und fragen, ob
Inhalt und Zeitpunkt — nach mehreren abgeschlossenen Runden, nicht nach der ersten — aufdringlich oder
unpassend wirken. Erst nachdem H-V4 überhaupt eine Zahlungsbereitschaft gezeigt hat.

**Und messen** die Anzahl der Personen, die die E-Mail als aufdringlich bezeichnen, und sobald ein
Haushalt real die 3.–4. Runde erreicht: ob der Versand zu einer Spende, zu Beschwerden oder zu
Abmeldungen der Haushalts-E-Mail führt.

**Wir liegen richtig, wenn** keine der fünf Personen die E-Mail als aufdringlich bezeichnet und der
spätere reale Versand nicht zu Beschwerden oder Abmeldungen führt.

**Warum das riskant ist.** Ein solcher Hinweis existiert jetzt als S-43. O-05 ist damit nicht mehr
offen, sondern entschieden — bevor diese Hypothese geprüft wurde. H-V4 fragt, ob Menschen *überhaupt*
spenden würden; hier geht es darum, ob der jetzt gebaute *Mechanismus* funktioniert. Beides scheitert
unterschiedlich.

Drei konkrete Risiken, neu bewertet gegen die jetzt feststehende Umsetzung:

- **Es steht weniger gegen E-23 als befürchtet.** Deine Begründung für „dauerhaft kostenlos" ist, dass
  Casten stressig genug ist. S-43 sitzt außerhalb des In-App-Flows und erst nach mehreren
  abgeschlossenen Runden, nicht mitten im Casting-Stress einer einzelnen Runde — das entschärft das
  ursprüngliche Risiko. Offen bleibt, ob eine Geldfrage „von außen" an ein Werkzeug, das laut E-23
  dauerhaft kostenlos bleiben soll, überhaupt willkommen ist.
- **Es gibt weiterhin keine zahlende Person.** Der Haushalts-Account ist geteilt und ist niemand — genau
  die Adresse, an die S-43 die E-Mail schickt. Eine Bitte an eine gemeinsam genutzte Adresse bleibt eine
  Bitte an niemanden, unabhängig vom Kanal.
- **Beim Zeitpunkt könnte die jetzt gewählte Lösung besser liegen als befürchtet.** Nach der 3.–4.
  Runde statt nach der ersten sitzt die Bitte weiter weg vom akuten Stress einer einzelnen Runde und
  näher an dem Moment, in dem der Haushalt den wiederholten Nutzen bereits gesehen hat. Ob das
  ausreicht, ist trotzdem ungeprüft — das ist genau die Frage dieser Hypothese.

**Wenn es falsch ist.** Der naheliegende Rückzug — die Bitte ganz aus dem Ablauf nehmen, als E-Mail an
den Haushalts-Account statt im Prozess — ist mit S-43 bereits gebaut. Scheitert der Test trotzdem,
bleibt nur, die Bitte weiter zu verkleinern (eine reine Zeile in den Einstellungen, kein aktiver
Versand) oder auf ein anderes Finanzierungsmodell umzusteigen (siehe H-V4).

**Herkunft.** `01-PF` E-23 · `02-SRD` §3.2, S-43 · **[ohne Code testbar]**

---

## 4 · Ebenfalls geprüft, nicht aufgenommen

| # | Annahme | Warum sie nicht in der Hauptliste steht |
|---|---|---|
| B-1 | Vier Stufen reichen; „Enthaltung" oder „noch nicht kennengelernt" braucht es nicht | ADR-008 begründet das gut, und die vorhandenen Kennzahlen würden es auffangen |
| B-2 | Struktureller Duplikatsschutz genügt (ein geteilter Beitrittscode plus soziale Kontrolle) | Gut begründet, und das Risiko ist gering in einer WG, in der sich alle kennen |
| B-3 | Die PWA-Installation ist nicht selbst die Hürde | Real, zeigt sich aber innerhalb der Aktivierungszahl aus H-D1 |
| B-4 | 180 Tage sind die richtige Frist (Q-5) | Vom Compliance-Anhang selbst als „mittel" bewertet; die Korrektur ist ein Konfigurationswert |
| B-5 | Das Quorum blockiert die Runde nicht (S-13) | Bereits wegkonstruiert. In der Pilotrunde bestätigen, nicht separat testen |
| B-6 | EU-Hosting und ein E-Mail-Anbieter mit AVV sind zu Non-Profit-Preisen verfügbar | Echte Randbedingung, aber eine Beschaffungsaufgabe mit bekannter Antwort |

---

## 5 · Zwei Fragen außerhalb des Rasters

**Ist der Launch überhaupt das Ziel?** `02-SRD` §3.2 listet den Geschäftsnutzen, und das meiste davon
ist bereits erreicht: dokumentierte Architektur, dokumentierte Rechtsentscheidungen, eingebaute statt
angebaute Compliance. Das sind Portfolio-Ergebnisse, und sie existieren **heute**. Nur zwei Einträge
brauchen ein laufendes System: der Beteiligungsnachweis und eine vollständige Runde in einem echten
Haushalt. Beides bekommst du aus einer Concierge-Runde plus deinem eigenen Haushalt. Ohne Launch, ohne
Rechtsgutachten, ohne Betriebskosten. Das ist kein Argument gegen das Bauen. Es ist ein Argument
dafür, klar zu benennen, welches Ergebnis du kaufst — denn davon hängt ab, was „fertig" bedeutet.

**Die Kernmetrik kann nicht tragen, was auf ihr liegt.** Ein Haushalt, sieben Bewohnende, eine Person
sind 14,3 Punkte. `02-SRD` §6 sagt das offen, was mehr ist als die meisten Specs tun. Der Zielwert
steht trotzdem als „über 80 %". Für Haushalte unter etwa 15 Personen als Anzahl schreiben. Die
schriftliche Abschlussfrage ist das Hauptinstrument, die Zahl ist die Stütze.

---

## 6 · Bewertungsbogen

Die drei rechten Spalten füllst du. „Meine" ist ein Startpunkt zum Widersprechen, kein Ergebnis.

**Ohne Code** = vor jedem Produktivcode widerlegbar. **Unbemerkt** = scheitert ohne Fehler, ohne
Beschwerde, ohne rote Kennzahl.

| # | Hypothese, kurz | Testkosten | Ohne Code | Unbemerkt | Meine (K/S/W) | Kritikalität | Sicherheit | Wichtigkeit |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **H-D1** | Über 80 % stimmen ab, trotz nur informeller Vorab-Zustimmung zum Werkzeug (R-02) | ~2 Wo. | ja | — | H / gering / H | | | |
| **H-D2** | Echte Notizen und Vetos landen im System | gratis, in D1 | ja | ja | H / gering / H | | | |
| **H-D3** | Ersetzt Werkzeuge, statt ein fünftes zu werden | 1 Gespräch | ja | — | M / gering / H | | | |
| **H-D4** | Rückkehr nach Monaten führt in unter 2 Min. zur Stimme | ~1 Tag | ja | ja | H / gering / M | | | |
| **H-D5** | Verdeckte Ergebnisse motivieren ohne Durchklick-Stimmen | gratis, in D1 | ja | ja | M / gering / M | | | |
| **H-D6** | Bewerbende akzeptieren den Datenschutzhinweis | ~2 Tage | ja | ja | M / gering / M | | | |
| **H-D7** | Zeit und Kopflast der organisierenden Person sinken | gratis, in D1 | ja | — | H / gering / H | | | |
| **H-D8** | Runden werden schneller, nicht langsamer — inkl. Wirkung von S-44 (v1) | gratis, in D1 + kleiner Durchstich für S-44 | teilweise | — | M / gering / M | | | |
| **H-F1** | Rollenkonstruktion trägt (Q-1 bis Q-4) | 2 Tage + Kanzlei | ja | — | H / mittel / H | | | |
| **H-F2** | Solo-Bau schafft 41 Zeilen, Schutzregeln halten | ~4 Tage | teilweise | — | H / gering / H | | | |
| **H-F3** | Solver ist deterministisch und bleibt unter 10 Sekunden | ~1 Tag | ja | — | M / gering / M | | | |
| **H-F4** | Regelbasierte Parser lohnen sich | ~0,5 Tage | ja | — | M / gering / M | | | |
| **H-F5** | Einladungslink verknüpft (inkl. Fehlerfall bei Doppelregistrierung, S-42); Restfälle selten oder abgefangen | ~30 Min. | ja | ja | M / mittel / H | | | |
| **H-F6** | Benachrichtigungen tragen Ereignisse, keine Urteile | gratis | ja | — | N / hoch / N | | | |
| **H-V1** | 2 bis 4 Castings pro Haushalt und Jahr | ~1 Wo. | ja | — | H / gering / H | | | |
| **H-V2** | Die zweite Runde findet wieder in der App statt | kalendergebunden | teilweise | ja | H / gering / H | | | |
| **H-V3** | Das Geld für den Start ist da | ~2 Tage | ja | — | H / gering / H | | | |
| **H-V4** | Wer nichts zahlt, spendet trotzdem etwas | gratis, in D1 | ja | — | M / gering / M | | | |
| **H-V5** | Die Vermieterstufe trägt wirtschaftlich | 5 Gespräche | ja | — | M / gering / M | | | |
| **H-V6** | Erreichbar ohne Wachstumsschleife und ohne Budget | ~2 Tage | ja | — | H / gering / M | | | |
| **H-V7** | Spendenhinweis wirkt, ohne Schaden anzurichten | gratis, in D1 | ja | — | M / gering / M | | | |

K = Kritikalität, wie schlimm es ist, wenn die Annahme falsch ist. S = Sicherheit, wie zuversichtlich
du heute bist. W = Wichtigkeit, wie stark es die nächste Entscheidung beeinflussen sollte.
H = hoch, M = mittel, N = niedrig.

---

## 7 · Empfohlene Testreihenfolge

Neunzehn der einundzwanzig Annahmen sind **vor jedem Produktivcode** widerlegbar. Fünf davon kosten
unter einem Tag. Die Baureihenfolge in `03-PRD` §7.2 ist eine korrekte **Abhängigkeits**-Reihenfolge.
Sie ist keine **Validierungs**-Reihenfolge.

| Woche | Tun | Deckt ab |
|---|---|---|
| **0** | WhatsApp-Baseline im Pilothaushalt erheben. Nach der ersten Nutzung ist sie weg (O-07) | H-D1 |
| **0** | Schreibtischprüfungen, zusammen ein Nachmittag: Digest- und Push-Vorlagen lesen (H-F6), Parser-Regeln von Hand auf 20 echte Nachrichten anwenden (H-F4), Einladungslink-Ablauf mit vier Fällen auf Papier durchgehen, inkl. Fehlerfall bei Doppelregistrierung (H-F5) | F4, F5, F6 |
| **1** | 8 bis 10 Frequenz-Interviews, WG und Wohnprojekt getrennt ausgewertet | H-V1 |
| **1** | Finanzierungs-Einseiter: drei Kanzlei-Angebote plus Betriebskostenmodell für 1, 10 und 200 Haushalte | H-V3 |
| **1** | Warteliste-Smoke-Test in drei Netzwerken | H-V6 |
| **2–3** | Concierge-Runde: Tabelle plus ein Abstimmungsformular, mit Zeitprotokoll | H-D1, D2, D3, D5, D7, D8, V4, V7 |
| **2–4** | Durchstiche A, B, C parallel zur Concierge-Runde | H-F2, H-F3 |
| **4** | Freiwillige DSFA, danach die eng zugeschnittene Prüfung zu Q-1 bis Q-4 beauftragen | H-F1 |
| **4+** | Vermieter-Gespräche, bevor Geld in Q-13 fließt | H-V5 |

**Ergänzung durch S-44 (v1).** Der Grundkonflikt aus H-D8 — Beteiligung gegen Tempo — ist weiterhin
ohne Code in der Concierge-Runde prüfbar (Woche 2–3). Ob die jetzt spezifizierte weiche Rundenfrist
selbst hilft, lässt sich erst prüfen, sobald das Dashboard-Element existiert, das die CTA-Sortierung
trägt — das gehört an die Durchstiche in Woche 2–4, nicht an die papierbasierte Runde allein.

**Was diese Reihenfolge nicht verzögern darf.** Die Punkte 1 und 2 aus `03-PRD` §7.2 —
Autorisierungsschicht und CI-Gate auf dem Datenbestandsverzeichnis — bleiben unabhängig vom
Validierungsergebnis die ersten Bauschritte. Deine Begründung dafür stimmt, und dieses Audit schwächt
sie nicht: Nachträglich eingezogen müsste jede bestehende Abfrage angefasst werden, und genau dort
entsteht die vergessene Bedingung.

Was die Reihenfolge **schon** ändert, sind die Funktionsblöcke: Solver (11), Kalender (12), Veto (14),
Benachrichtigungen (15), PWA (16). Die sollten nicht gebaut werden, bevor die Concierge-Runde berichtet
hat. Sie machen zwischen einem Drittel und der Hälfte des v1-Aufwands aus, und jeder von ihnen dient
einer Annahme, die noch niemand geprüft hat.

---

## 8 · Vorgeschlagene Änderungen an den Quelldokumenten

1. **O-07 ist eine Frist, kein offener Punkt.** Die Baseline lässt sich nur vor der ersten Nutzung
   erheben. Sie steht in `02-SRD` §11 zwischen neun Punkten unterschiedlicher Dringlichkeit, wo genau
   die Eigenschaft, die sie besonders macht — dass sie verfällt —, leicht untergeht. Gib ihr ein
   Datum.
2. **Der Scope ist gewachsen, die Risikoliste nicht.** `02-SRD` §7 zählt 37 Scope-Zeilen, §5.3 listet
   41. Die vier zusätzlichen kamen aus der Querprüfung mit Domänenmodell und Compliance-Anhang — der
   Prozess hat funktioniert. Die Lehre für H-F2 ist nicht, weniger querzuprüfen. Sie lautet: den Scope
   einplanen, den Querprüfen erzeugt, und vor jeder Schätzung neu zählen.
3. **Den Einladungslink ins Spec schreiben.** Dein Vorschlag aus H-F5 ist eine echte Verbesserung
   gegenüber der manuellen Zuordnung in S-40 und gehört in die Anforderungen. Vorschlag: eine neue
   Scope-Zeile für ein Einladungstoken je Bewerbung bei `moved_in`, einmalig und widerrufbar, plus
   die Notiz, dass frühere Bewerbungen weiterhin einen Hinweis brauchen.
4. **Eine Inhaltsregel für Benachrichtigungen ergänzen.** Benachrichtigungen tragen Ereignisse, CTAs und
   Zahlen, keine Urteile und keine Namen. 
5. **Der Spendenhinweis hat noch keinen Ort.** O-05 verschiebt ihn, das ist in Ordnung. Im PRD ist
   trotzdem kein Platz dafür reserviert. Das sollte irgendwo verankert werden.
