# 06 — Compliance-Anhang: Flatmate.io

### Datenschutz-, AI-Act- und TDDDG-Einordnung des WG-Casting-Prozesses

> **Version:** V0.6
> **Datum:** 2026-08-19
> **Autor:** Samuel Zink (@SmokeyRGB)
> **Vorgänger:** `00-Session-Brief.md` (verbindliche Quelle) · `02-SRD.md` §7 · `04-Domaenenmodell.md`
> **Nachfolger:** `GUARDRAILS.md` · `review-log.md`
> **Korrespondiert mit:** ADR-010 (Datenbestandsverzeichnis als CI-Gate), ADR-004
> (Autorisierung zweifach erzwungen), Prinzip **P-5**

---

> ## ⚠️ Keine Rechtsberatung
>
> Dieses Dokument enthält **begründete Default-Positionen mit offenen Fragen**, keine
> Rechtssicherheit. Es ist von einem Nicht-Juristen auf Basis öffentlich zugänglicher Quellen
> (Stand 2026-08-19) verfasst und dient dazu, Architektur- und Produktentscheidungen so zu
> treffen, dass sie einer späteren anwaltlichen Prüfung standhalten können — nicht dazu, sie zu
> ersetzen.
>
> Drei Punkte gehören **vor einem echten Launch anwaltlich geprüft**: die Rollenkonstruktion
> (`Household` als Verantwortlicher, Flatmate.io als Auftragsverarbeiter), die daraus abgeleitete
> Click-Through-AVV und die Tragfähigkeit der Verneinung der Haushaltsausnahme. Die vollständige
> Liste steht in [§13](#13--offene-rechtsfragen-für-die-anwaltliche-prüfung) und ist bewusst so
> formuliert, dass sie als **Auftragsliste an eine Kanzlei** taugt.
>
> Wo dieses Dokument „gilt", „ist" oder „greift" schreibt, ist stets „nach der hier vertretenen,
> begründeten, aber ungeprüften Auffassung" gemeint.

---

## Inhalt

1. [Rollenanalyse und Haushaltsausnahme](#1--rollenanalyse-und-haushaltsausnahme)
2. [Die Trennlinie: Küchentisch vs. System](#2--die-trennlinie-küchentisch-vs-system)
3. [Art. 15 und die Casting-Notizen](#3--art-15-und-die-casting-notizen)
4. [Art. 13 vs. Art. 14 — korrigierte Abgrenzung](#4--art-13-vs-art-14--korrigierte-abgrenzung)
5. [Speicherbegrenzung und Löschkonzept](#5--speicherbegrenzung-und-löschkonzept)
6. [Datenkategorien — Vorlage für das Art.-30-Verzeichnis](#6--datenkategorien--vorlage-für-das-art-30-verzeichnis)
7. [Betroffenenrechte — Flüsse Art. 15/16/17/20](#7--betroffenenrechte--flüsse-art-15161720)
8. [Art. 9 — besondere Kategorien im Freitext](#8--art-9--besondere-kategorien-im-freitext)
9. [AI-Act-Einordnung und P-5](#9--ai-act-einordnung-und-p-5)
10. [§ 25 TDDDG, Cookies und der verworfene Duplikatsschutz](#10--25-tdddg-cookies-und-der-verworfene-duplikatsschutz)
11. [TOM-Skizze](#11--tom-skizze)
12. [Vermieter-Szenario](#12--vermieter-szenario)
13. [Offene Rechtsfragen für die anwaltliche Prüfung](#13--offene-rechtsfragen-für-die-anwaltliche-prüfung)
14. [Quellen](#14--quellen)

---

## 1 · Rollenanalyse und Haushaltsausnahme

### 1.1 Greift die Haushaltsausnahme?

Art. 2 Abs. 2 lit. c DSGVO nimmt die Verarbeitung personenbezogener Daten „durch natürliche
Personen zur Ausübung ausschließlich persönlicher oder familiärer Tätigkeiten" vom
Anwendungsbereich aus. Für die WG-interne Beratung am Küchentisch ist das der Regelfall.

**Position: für die Plattform trägt die Ausnahme mit hoher Wahrscheinlichkeit *nicht*.** Zwei
Gründe:

1. Die Ausnahme wird **eng ausgelegt**. Sie entfällt insbesondere dort, wo eine Verarbeitung über
   den rein privaten Kreis hinaus in ein strukturiertes, dauerhaftes System hineinreicht.
2. Bereits für **private Vermietende** wurde die Eröffnung des Anwendungsbereichs der DSGVO
   angenommen — die Ausnahme scheitert also nicht erst an der Gewerblichkeit.

Hinzu kommt die Rolle von Flatmate.io selbst: Der Betrieb einer Plattform ist unter keiner
Auslegung eine „ausschließlich persönliche Tätigkeit". Selbst wenn man für den einzelnen Haushalt
anders entschiede, bliebe Flatmate.io im Anwendungsbereich.

**Konsequenz für die Architektur:** Es wird durchgängig so gebaut, als gälte die DSGVO
vollständig. Sollte eine spätere Prüfung die Ausnahme für einzelne Haushalte doch bejahen, schadet
das nicht — die Anforderungen sind dann übererfüllt. Der umgekehrte Fehler wäre nicht reparierbar.

### 1.2 Wer ist Verantwortlicher, wer Auftragsverarbeiter?

| Datenbestand | Verantwortlicher (Art. 4 Nr. 7) | Rolle Flatmate.io |
|---|---|---|
| **Bewerberdaten** — `Application`, `Vote`, `Veto`, `CastingNote`, `AvailabilityWindow` der Bewerbenden, `Appointment` | **`Household`** — er entscheidet über den Zweck (Zimmer besetzen) und die wesentlichen Mittel (wen einladen, was notieren, wann löschen) | **Auftragsverarbeiter** (Art. 28) |
| **Plattform- und Kontodaten** — `Account`, Session, Sicherheits- und Betriebsprotokolle, Produktmetriken | **Flatmate.io** — eigener Zweck: Betrieb, Sicherheit und Weiterentwicklung des Dienstes | **eigener Verantwortlicher** |

Das ist keine Doppelrolle *für denselben Datenbestand*, sondern eine **Trennung nach
Datenbestand**. Sie ist die tragende Konstruktion dieses Dokuments; nahezu alle folgenden
Ergebnisse hängen an ihr.

### 1.3 Was daraus folgt

| Pflicht | Träger | Umsetzung in Flatmate.io |
|---|---|---|
| Auftragsverarbeitungsvertrag (Art. 28 Abs. 3) | Flatmate.io stellt, `Household` schließt | **Click-Through-AVV** bei der Haushaltsregistrierung, versioniert; Zustimmung als `ActivityEvent` protokolliert |
| Verzeichnis von Verarbeitungstätigkeiten (Art. 30) | beide — Abs. 1 für Flatmate.io als Verantwortlicher, Abs. 2 als Auftragsverarbeiter; der `Household` braucht ein eigenes | **`data-inventory.yml`** (ADR-010) als maschinenlesbare Quelle, [§6](#6--datenkategorien--vorlage-für-das-art-30-verzeichnis) als lesbare Fassung; daraus erzeugbarer Auszug für den Haushalt |
| Technische und organisatorische Maßnahmen (Art. 32) | beide | [§11](#11--tom-skizze) |
| Unterstützung bei Betroffenenrechten (Art. 28 Abs. 3 lit. e) | Flatmate.io | Feature **„Datenauskunft erzeugen"** pro `Application` ([§7.1](#71--art-15-auskunft)) |
| Löschung nach Zweckerreichung (Art. 5 Abs. 1 lit. e) | `Household` weisungsbefugt, Flatmate.io vollzieht | Aufbewahrungsautomatik mit Vorwarnung ([§5](#5--speicherbegrenzung-und-löschkonzept)) |
| Information der Bewerbenden (Art. 13) | **`Household`** | Copy-Paste-Textbaustein als *Hilfsmittel*, nicht als eigene Pflichterfüllung ([§4](#4--art-13-vs-art-14--korrigierte-abgrenzung)) |
| Unterauftragsverarbeiter (Art. 28 Abs. 2 und 4) | Flatmate.io | Hosting und E-Mail-Versand; Liste in der AVV, EU-Verarbeitung nach ADR-006 |
| Meldung von Verletzungen (Art. 33 Abs. 2) | Flatmate.io meldet **an den `Household`**, dieser an die Aufsichtsbehörde | Prozess in [§11.5](#115--organisatorische-maßnahmen) |

> ⚠️ TBD — zu ergänzen: konkrete Liste der Unterauftragsverarbeiter (Hosting-Anbieter,
> Transaktions-E-Mail-Dienst). ADR-006 legt EU-Hosting fest, benennt aber keinen Anbieter.

### 1.4 Der unscharfe Rand: Bewohnerdaten

`ResidentProfile`, `Membership` und die Urheberschaft an `Vote`, `Veto` und `CastingNote` liegen
zwischen den beiden Spalten. Die bewohnende Person ist zugleich **Nutzerin der Plattform**
(Vertragsverhältnis mit Flatmate.io) und **handelnde Person im Haushalt** (dessen
Verantwortungsbereich). Die hier vertretene Aufteilung:

- **Kontoebene** (`Account.email`, Anmeldung, Benachrichtigungseinstellungen) → Flatmate.io als
  Verantwortlicher, Art. 6 Abs. 1 lit. b (Nutzungsvertrag).
- **Beratungsebene** (welche Stimme, welche Notiz, welches Veto von wem) → `Household` als
  Verantwortlicher, weil sie Teil des von ihm gesteuerten Auswahlprozesses ist.

Diese Grenze ist die **schwächste Stelle der Konstruktion** und steht deshalb in
[§13](#13--offene-rechtsfragen-für-die-anwaltliche-prüfung) als Prüfauftrag.

---

## 2 · Die Trennlinie: Küchentisch vs. System

> **Der wichtigste Compliance-Befund dieses Projekts.**

Die verbreitete Intuition lautet: „Fakten über Bewerbende sind Daten, subjektive Notizen sind nur
Meinungen — und Meinungen sind nicht auskunftspflichtig." **Diese Trennlinie ist falsch.** Sie
existiert im Datenschutzrecht so nicht.

Die tragfähige Trennlinie verläuft **nicht zwischen Notiz und Fakt, sondern zwischen Küchentisch
und System**:

| | WhatsApp-Gruppe / Gespräch am Küchentisch | Flatmate.io |
|---|---|---|
| Rechtsrahmen | Haushaltsausnahme Art. 2 Abs. 2 lit. c → DSGVO **gilt nicht** | DSGVO **gilt** ([§1.1](#11-greift-die-haushaltsausnahme)) |
| „Lea wirkte unpünktlich" | keine Auskunftspflicht | **auskunftspflichtiges personenbezogenes Datum** |
| Inhalt | identisch | identisch |

Der Unterschied liegt **allein im Speicherort und in der Struktur**, nicht im Inhalt. Ein Satz, der
als Sprachnachricht folgenlos bleibt, wird durch die Aufnahme in ein strukturiertes,
durchsuchbares, dauerhaftes System zu einem Datum mit Auskunftsanspruch.

### 2.1 Was das für Flatmate.io bedeutet

**Flatmate.io erzeugt eine Auskunftspflicht, die der WhatsApp-Status-quo nicht hatte.** Das Produkt
löst ein Organisationsproblem und schafft dabei ein Rechtsverhältnis, das vorher nicht existierte.
Das ist kein Nebeneffekt, den man wegdesignen kann — es ist der Preis der Strukturierung. Er wird
im SRD §7 als **eigener Risikoposten** geführt, nicht als Fußnote.

Ehrlich benannt: Ein Haushalt, der WhatsApp weiter nutzt, hat weniger Pflichten als einer, der
Flatmate.io nutzt. Das Gegengewicht ist nicht rechtlicher, sondern praktischer Natur — die App
nimmt dem Haushalt die Arbeit ab, die aus den Pflichten folgt, und macht den Prozess für die
Bewerbenden nachvollziehbarer, als eine Sprachnachricht es je war.

### 2.2 Warum der Befund trotzdem für das Produkt spricht

Er ist das Designargument für drei Entscheidungen, die ohnehin richtig sind:

1. **Strukturierte Notiz-Prompts statt leerem Textfeld.** Ein leeres Feld lädt zu Sätzen ein, die
   niemand geschrieben haben will, wenn die Person sie lesen kann.
2. **Sichtbarer Hinweis „Schreib so, als könnte die Person es lesen."** — weil sie es kann.
3. **Knappe Fristen und automatische Löschung** ([§5](#5--speicherbegrenzung-und-löschkonzept)).
   Was gelöscht ist, muss nicht ausgekunftet werden.

Hinzu kommt die **Selbst-Redaktions-Invariante** des Domänenmodells: Beratungsinhalte über die
eigene Person sind für das betroffene Profil dauerhaft unsichtbar. Das beseitigt den
Auskunftsanspruch nicht (er richtet sich an den `Household`, nicht an die App-Oberfläche), aber es
verhindert den sozial zerstörerischen Fall, dass jemand die eigene Bewertung im Vorbeiscrollen
liest.

---

## 3 · Art. 15 und die Casting-Notizen

### 3.1 Befund: Notizen sind erfasst

Der EuGH legt den Begriff „personenbezogene Daten" **weit** aus: Erfasst sind auch subjektive
Informationen in Form von **Stellungnahmen und Beurteilungen**, sofern es sich um Informationen
*über* die betroffene Person handelt. **BFH und BGH haben 2025 bestätigt**, dass der
Auskunftsanspruch aus Art. 15 DSGVO grundsätzlich auch **interne Vermerke, Aktennotizen,
Gesprächsnotizen und interne Kommunikation** erfasst.

Damit sind erfasst:

| Artefakt | Erfasst von Art. 15? | Begründung |
|---|---|---|
| `Application` (Name, Alter, Kontakt, Freitext) | ja | klassische Stammdaten |
| `CastingNote.body` („wirkte unpünktlich", „passt gut zur Küche") | **ja** | Beurteilung *über* die Person |
| `Vote.value` (Nein / Eher nicht / Finde gut / Unbedingt) | **ja** | Beurteilung *über* die Person |
| Aggregat: Score, Ranglistenposition, Stimmungsbild | **ja** | aus personenbezogenen Daten abgeleitete Information über die Person |
| `Veto.reason` | **ja** | Beurteilung *über* die Person |
| `Appointment`, `AvailabilityWindow` | ja | Verhaltens- und Kontaktdaten |

### 3.2 Die zwei Grenzen — und was sie *nicht* leisten

**Grenze 1 — die rechtliche Bewertung selbst.** Eine juristische Subsumtion („der Anspruch ist
verjährt") ist kein personenbezogenes Datum. Diese Grenze ist für Flatmate.io **praktisch
bedeutungslos**: „Lea wirkte unpünktlich" ist keine rechtliche Bewertung, sondern eine
Beurteilung. Wer hofft, Casting-Notizen unter diese Ausnahme zu schieben, irrt.

**Grenze 2 — Art. 15 Abs. 4, Rechte Dritter.** Die Auskunft darf die Rechte und Freiheiten anderer
Personen nicht beeinträchtigen. Das trägt den Schutz der **Identität** der bewertenden Person —
nicht den **Inhalt** der Bewertung.

> **Regel für die Auskunft:** Der Inhalt wird herausgegeben, die Urheberschaft grundsätzlich nicht.
> „Über dich wurde notiert: ‚wirkte unpünktlich'" ist auskunftspflichtig.
> „Jonas hat notiert: ‚wirkte unpünktlich'" ist es nach der hier vertretenen Auffassung nicht —
> jedenfalls nicht ohne Abwägung im Einzelfall.

Dass diese Abwägung in einer Fünf-Personen-WG faktisch versagen kann (aus vier Stimmen und einem
Inhalt lässt sich die fünfte Person erschließen), ist derselbe Ehrlichkeitsvorbehalt, der schon
für das anonyme Veto gilt. Er wird **nicht wegversprochen**: Die App darf keine Anonymität
behaupten, die sie nicht herstellen kann.

#### Entschieden: die Veto-Begründung wird offengelegt

Die Frage, ob `Veto.reason` von der Auskunft ausgenommen werden kann, weil sich daraus auf die
vetoende Person schließen lässt, ist **entschieden — sie wird offengelegt.**

Die Begründung ist ein personenbezogenes Datum **der betroffenen Person**. Art. 15 Abs. 4 schützt
die *Identität* der bewertenden Person, nicht den *Inhalt* ihrer Bewertung. Dass eine Begründung in
einer Fünfer-WG faktisch auf ihre Urheberin schließen lässt, ist **kein Grund zurückzuhalten,
sondern ein Grund, beim Schreiben zu warnen**:

> **Hinweis im Veto-Formular:** „Diese Begründung kann der betroffenen Person offengelegt werden
> und lässt möglicherweise auf dich schließen."

Das ist konsequent zur Haltung, die dieses Dokument ohnehin einnimmt: Anonymität in kleinen Gruppen
wird **benannt, nicht behauptet**. Eine App, die eine Begründung zurückhält, um eine Anonymität zu
schützen, die sie nicht herstellen kann, täuscht beide Seiten — die vetoende Person über ihren
Schutz und die betroffene über ihre Daten. Das PRD führt den Hinweis als Akzeptanzkriterium.

### 3.3 Feature: „Datenauskunft erzeugen" pro `Application`

Auskunftspflichtig ist der **`Household`**. Flatmate.io trifft als Auftragsverarbeiter nur die
**Unterstützungspflicht** aus Art. 28 Abs. 3 lit. e. Daraus folgt das Feature: ein Export aller zu
einer bewerbenden Person gespeicherten Daten, ausgelöst vom Haushalt, erzeugt von der App.

**Was die betroffene Person im Export sieht:**

| Enthalten | Nicht enthalten | Begründung |
|---|---|---|
| Alle Felder der `Application` inklusive des ursprünglichen Freitexts | — | Art. 15 Abs. 3 |
| Status und Statushistorie aus dem `ActivityEvent`-Log (Zeitpunkt, alter → neuer Zustand) | die handelnden `ResidentProfile` | Art. 15 Abs. 4 (Identität Dritter) |
| Alle `CastingNote`-Inhalte über diese Person | Urheberschaft der Notiz | wie oben |
| Alle `Vote`-Werte über diese Person, als Verteilung *und* als Einzelwerte | Zuordnung Stimme → Person | wie oben |
| Score, Ranglistenposition, Quorum-Stand | — | abgeleitete Daten sind Daten |
| `Veto` samt `reason` | Urheberschaft, auch wenn das Veto nicht als anonym markiert war | wie oben |
| `AvailabilityWindow`, `Appointment` zu dieser Person | Verfügbarkeiten **anderer** Personen und die Termine anderer Bewerbender | Daten Dritter |
| Herkunft der Daten (`collected_from`), Empfängerkreis (der Haushalt, namentlich), Speicherdauer, Rechtsgrundlage, Hinweis auf Betroffenenrechte | — | Art. 15 Abs. 1 lit. a–h |

**Format und Fristen**

- Maschinenlesbar (JSON) **und** menschenlesbar (PDF oder HTML), damit derselbe Export
  Art. 15 und Art. 20 bedient ([§7.4](#74--art-20-datenübertragbarkeit)).
- Erzeugung „unverzüglich, spätestens innerhalb eines Monats" (Art. 12 Abs. 3) — die App macht den
  Export in Sekunden, die Frist bindet aber den `Household`, nicht die App.
- Der Export selbst ist ein `ActivityEvent` (Rechenschaftspflicht, Art. 5 Abs. 2) und setzt
  `Application.subject_access_exported_at` — der **Nachweis der Unterstützungspflicht** nach
  Art. 28 Abs. 3 lit. e. Ohne diesen Zeitstempel ist die Unterstützung erbracht, aber nicht belegbar.
- Der Export **enthält keine Daten anderer Bewerbender** — das ist eine Invariante, kein
  Sorgfaltsappell, und gehört zu den geschützten Tests in `GUARDRAILS.md` (G-D).

### 3.4 Lücke: Die Selbst-Redaktion schützt nur *verknüpfte* Bewerbungen

> **Ein Fund aus dem Domänenmodell, den der Brief nicht hatte — und ein realer Weg zur
> unbeabsichtigten Offenlegung gegenüber einer betroffenen Person.**

Die Selbst-Redaktions-Invariante hängt an `Application.became_resident_id`. Dieses Feld ist **n:1
und wird manuell gesetzt**. Daraus folgt:

> Wer sich vor zwei Jahren erfolglos beworben hat und sich diesmal erneut bewirbt und einzieht, hat
> **zwei `Application`-Datensätze** im System. Die alte trägt Stimmen und Notizen über **dieselbe
> Person**. Ist nur die neue mit dem `ResidentProfile` verknüpft, greift die Invariante nur für die
> neue — und die alte Bewerbung **leckt genau das, was die Invariante verhindern soll**.

**Die Lücke ist prozessual, nicht technisch.** Die Invariante ist korrekt implementiert; ihr fehlt
nur die Information, dass zwei Datensätze dieselbe Person betreffen. Ein automatisches
Zusammenführen über Name oder E-Mail wäre keine Reparatur, sondern eine **eigene, datenschutzrechtlich
nicht triviale Entscheidung**: Duplikaterkennung über Bewerberdaten ist selbst eine Verarbeitung mit
eigenem Zweck und eigener Rechtsgrundlage — und sie erzeugt falsch-positive Verknüpfungen, die zwei
verschiedene Personen zusammenlegen.

**Drei Konsequenzen:**

1. **Risikoposten.** Die Lücke ist eine mögliche unbeabsichtigte Offenlegung gegenüber der
   betroffenen Person — also genau die Verletzung, gegen die die Invariante gebaut wurde. Sie gehört
   in SRD §7 neben den Auskunftspflicht-Posten.
2. **Benannte Grenze des Tests.** Der geschützte Test G-D1 in `GUARDRAILS.md` deckt **nur verknüpfte
   Bewerbungen** ab. Das steht dort ausdrücklich, weil ein Test, der eine Teilmenge prüft und
   Vollständigkeit suggeriert, schlimmer ist als kein Test.
3. **Prozessuale Zwischenlösung.** Beim Setzen von `became_resident_id` weist die App auf ältere
   Bewerbungen mit ähnlichen Kontaktdaten hin und **fragt den Menschen**, ob es dieselbe Person ist.
   Vorschlagen und bestätigen lassen — nicht automatisch verknüpfen. Das ist derselbe Umgang wie
   beim Parser (P-3) und verlagert die Entscheidung dorthin, wo das Wissen liegt.

Ob diese Zwischenlösung genügt und ob die Ähnlichkeitsprüfung überhaupt zulässig ist, steht als
**Q-14** in [§13](#13--offene-rechtsfragen-für-die-anwaltliche-prüfung).

---

## 4 · Art. 13 vs. Art. 14 — korrigierte Abgrenzung

> Dieser Abschnitt **berichtigt eine frühere, alarmistischere Fassung**. Das dort befürchtete
> Problem — Flatmate.io müsse jede bewerbende Person aktiv informieren — existiert so nicht.

### 4.1 Für Auftragsverarbeiter gilt Art. 14 nicht

Die Informationspflicht bei nicht bei der betroffenen Person erhobenen Daten trifft den
**Verantwortlichen**. Ein Auftragsverarbeiter verfolgt keinen eigenen Verarbeitungszweck; die
Pflicht bleibt beim Verantwortlichen. **Flatmate.io muss niemanden informieren.**

### 4.2 Im Regelfall greift Art. 13, nicht Art. 14

Hat die bewerbende Person ihre Bewerbung **selbst geschickt** — über die Portalnachricht, per
WhatsApp, per E-Mail —, dann sind die Daten **bei der betroffenen Person erhoben**. Dass die WG sie
anschließend in ein Formular eintippt oder per Paste-Parser übernimmt, **ändert die Erhebungsquelle
nicht**. Der Erfassungsweg innerhalb der Organisation ist keine neue Erhebung.

Damit gilt **Art. 13** — Information zum Zeitpunkt der Erhebung, durch den `Household`.

| Konstellation | Norm | Wer informiert | In v1 relevant? |
|---|---|---|---|
| Bewerbung kommt direkt von der Person (Portal, WhatsApp, Mail, mündlich) | **Art. 13** | `Household` | **Regelfall** |
| Bewerbende trägt Verfügbarkeiten selbst über den Token-Link ein | **Art. 13** | `Household`; der Hinweis steht **auf der Seite** | ja |
| Weiterleitung durch Dritte („meine Freundin sucht ein Zimmer, hier ihre Nummer") | **Art. 14** | `Household`, innerhalb eines Monats | Randfall, aber real |
| Scraping aus Portalen | Art. 14 | — | **ausgeschlossen** (Brief: WG-Gesucht-API verworfen) |

### 4.3 Konsequenz für den Copy-Paste-Textbaustein

Beim Markieren einer `Application` als „Eingeladen" erzeugt die App einen Textbaustein für die
Kontaktaufnahme, der den Datenschutzhinweis enthält (Verantwortlicher = die WG, Zweck =
Zimmerbesetzung, Speicherdauer, Betroffenenrechte, Kontakt).

Dieser Baustein ist ein **Hilfsmittel für den Haushalt**, **keine eigene Pflichterfüllung von
Flatmate.io**. Die App darf ihn deshalb weder als „Pflicht erledigt" darstellen noch das Versenden
erzwingen; sie darf ihn anbieten und daran erinnern.

### 4.4 Zwei Felder, zwei Achsen — `source` und `collected_from`

Der technische Erfassungspfad und der rechtliche Erhebungsort sind **verschiedene Fragen** und
gehören in verschiedene Felder. Ein einziges Feld würde beides vermischen und die rechtliche
Entscheidung an ein Produktdatum koppeln:

| Feld | Frage | Werte | Rolle |
|---|---|---|---|
| `Application.source` | **Wie** kam die Bewerbung ins System? | `manual_form` · `paste_parser` · `availability_link` · `portal_import` | Produktdatum — Statistik, Parser-Qualität, P-1-Nachweis |
| `Application.collected_from` | **Bei wem** wurden die Daten erhoben? | `data_subject` · `third_party` | **Rechtsträger** — entscheidet Art. 13 vs. Art. 14 |

Der Grund für die Trennung ist konkret: **`paste_parser` deckt beide Fälle ab.** Eine eingefügte
WhatsApp-Nachricht der bewerbenden Person ist `data_subject`; eine eingefügte Nachricht „meine
Freundin sucht ein Zimmer, hier ihre Nummer" ist `third_party` — technisch derselbe Pfad, rechtlich
das Gegenteil.

**`collected_from` ist Pflichtfeld ohne stillen Default.** Nur der Wert `third_party` löst den
Hinweis auf die Art.-14-Monatsfrist aus. `source` löst nichts aus.

### 4.5 Der Wortlaut des Copy-Paste-Hinweises

**Das Problem:** Art. 13 verlangt rund ein Dutzend Pflichtangaben. Vollständig ausformuliert sind
das etwa 250 Wörter — in einer WhatsApp-Nachricht an eine bewerbende Person ist das nicht
zustellbar. Es wird ungelesen weggescrollt, und ein ungelesener Hinweis erfüllt den Zweck der Norm
nicht besser als gar keiner.

**Die tragfähige Konstruktion: Kurzhinweis plus Link.** Art. 12 Abs. 1 verlangt „präzise,
transparent, verständlich und in leicht zugänglicher Form" — ein Zweistufenmodell ist damit
zulässig, solange die zweite Stufe **wirklich erreichbar** ist und die erste die wesentlichen
Punkte trägt.

#### Stufe 1 — der Textbaustein (in die Nachricht)

> Kurz zum Datenschutz: Deine Angaben (Name, Kontakt, deine Nachricht) speichern wir als WG,
> um die Zimmervergabe zu organisieren. Wir notieren dazu auch unsere Eindrücke aus dem
> Kennenlernen. **Spätestens 180 Tage nach Abschluss löschen wir alles wieder.** Du kannst
> jederzeit erfahren, was wir gespeichert haben — auch die Notizen —, es berichtigen oder löschen
> lassen. Melde dich einfach hier. Details: [Link]

Sechs Zeilen, 70 Wörter. Sie tragen die vier Angaben, die eine bewerbende Person tatsächlich
interessieren: **wer**, **wozu**, **wie lange**, **welche Rechte** — und den einen Punkt, mit dem
sonst niemand rechnet: **dass auch die Notizen auskunftspflichtig sind**
([§2](#2--die-trennlinie-küchentisch-vs-system)). Genau diese Zeile ist der Grund, warum der
Baustein nicht weiter gekürzt werden darf.

#### Stufe 2 — die statische Datenschutzseite je Haushalt

Der Link zeigt auf eine von Flatmate.io generierte, öffentlich erreichbare Seite pro `Household`
(schmaler Token, kein Konto). Sie enthält die vollständigen Art.-13-Angaben:

| Pflichtangabe | Quelle in der App |
|---|---|
| Verantwortlicher und Kontaktdaten | `Household.name` und die **Haushalts-E-Mail** — ausdrücklich **keine Postanschrift** (siehe [§4.6](#46-zwei-bewusste-auslegungen-in-der-datenschutzseite)) |
| Zwecke | Auswahl für ein WG-Zimmer, Terminorganisation, gemeinsame Entscheidungsfindung |
| Rechtsgrundlagen | Art. 6 Abs. 1 lit. b für Stamm- und Kontaktdaten, lit. f für Stimmen, Vetos und Notizen |
| Berechtigte Interessen bei lit. f | „Die WG muss gemeinsam entscheiden, wer einzieht, und dafür Eindrücke festhalten" |
| Empfänger | die bewohnenden Personen des Haushalts; Flatmate.io als Auftragsverarbeiter; Hosting und E-Mail-Versand als Unterauftragsverarbeiter |
| Speicherdauer | 180 Tage nach Rundenabschluss, verkürzbar auf 30 oder 90; Verlängerung nur protokolliert und begründet |
| Betroffenenrechte | Art. 15, 16, 17, 18, 20, 21 — jeweils mit einem Satz, was sie bedeuten |
| Beschwerderecht | Hinweis auf das **Bestehen** eines Beschwerderechts „bei der für euch zuständigen Datenschutzaufsichtsbehörde", plus Link auf die Liste der deutschen Aufsichtsbehörden — **keine namentliche Benennung** (siehe [§4.6](#46-zwei-bewusste-auslegungen-in-der-datenschutzseite)) |
| Freiwilligkeit | Die Angaben sind freiwillig; ohne sie ist eine Bewerbung praktisch nicht möglich |
| Keine automatisierte Entscheidung | ausdrücklich: Die Entscheidung treffen Menschen, **es wird keine KI eingesetzt** (P-5, [§9](#9--ai-act-einordnung-und-p-5)) |

Sie trägt denselben Text wie die Seite des Verfügbarkeits-Token-Links, damit beide Erfassungswege
dieselbe Information zeigen (P-1).

#### Erzeugen ist nicht veröffentlichen — die Seite braucht eine Freigabe

Flatmate.io **erzeugt** die Seite, **veröffentlicht** sie aber nicht. Der Text ist eine **rechtliche
Erklärung im Namen eines Dritten**; als Auftragsverarbeiter darf Flatmate.io sie **vorbereiten**,
freigeben muss der Verantwortliche. Geschähe die Veröffentlichung automatisch, überschritte
Flatmate.io seine Rolle und würde **für genau diesen Inhalt selbst verantwortlich** — im Widerspruch
zur gesamten Rollenkonstruktion aus
[§1.2](#12-wer-ist-verantwortlicher-wer-auftragsverarbeiter).

Daraus folgt konkret:

1. Die Seite hat einen **Zustand**: `draft` → `published`.
2. Der Übergang ist eine **ausdrückliche Aktion der organisierenden Person**, kein Nebeneffekt der
   Haushaltsregistrierung und kein Default.
3. Der vollständige Text ist **vor** der Freigabe einsehbar — man gibt nichts frei, was man nicht
   gelesen hat.
4. Die Freigabe erzeugt ein `ActivityEvent` (wer, wann, welche Textversion).
5. Im Zustand `draft` ist die Seite **über keinen Codepfad erreichbar** — durchgesetzt durch
   `GUARDRAILS.md` **G-C9**, nicht durch Sorgfalt.

Solange die Seite nicht freigegeben ist, verweist der Textbaustein aus Stufe 1 auf nichts. Die App
weist darauf hin, statt einen toten Link zu erzeugen.

### 4.6 Zwei bewusste Auslegungen in der Datenschutzseite

Beide betreffen Art. 13 Abs. 1 lit. a und Abs. 2 lit. d und beide sind **entschieden**, nicht offen:

**Die Aufsichtsbehörde wird nicht benannt.** Art. 13 Abs. 2 lit. d verlangt die Information über das
**Bestehen** eines Beschwerderechts bei einer Aufsichtsbehörde — nicht die Benennung der konkret
zuständigen. Die Seite formuliert deshalb „bei der für euch zuständigen
Datenschutzaufsichtsbehörde" und verlinkt die Liste der deutschen Aufsichtsbehörden. Damit entfällt
jede Abhängigkeit von einer Ortsangabe.

**Kontaktangabe ist die Haushalts-E-Mail, keine Postanschrift.** Art. 13 Abs. 1 lit. a verlangt
Identität **und Kontaktdaten** des Verantwortlichen. Für einen privaten Haushalt ist die gemeinsam
genutzte E-Mail-Adresse die **verhältnismäßige** Angabe. Eine WG, die Bewerbenden ihre Postanschrift
offenlegt, erzeugt ein Datenschutzproblem **für die Bewohnenden selbst** — also das Gegenteil
dessen, was die Informationspflicht bezweckt. Die Haushalts-E-Mail ist damit Pflichtangabe, eine
Postanschrift wird **nicht erhoben**.

> Beide Punkte sind bewusste Auslegungen mit Begründung, keine Lücken. Sie stehen hier und nicht in
> [§13](#13--offene-rechtsfragen-für-die-anwaltliche-prüfung), weil sie sich aus dem Wortlaut der
> Norm beantworten lassen — anders als die dort gesammelten Fragen.

---

## 5 · Speicherbegrenzung und Löschkonzept

### 5.1 Der richtige Löschgrund

Der Löschgrund ist **Art. 5 Abs. 1 lit. e (Speicherbegrenzung)** in Verbindung mit **Art. 17
Abs. 1 lit. a (Zweckfortfall)** — **nicht** Art. 15. Art. 15 ist der Auskunftsanspruch; er begründet
keine Löschpflicht. Diese Zuordnung war in einer früheren Fassung falsch und ist hier korrigiert.

Daraus folgt: Eine Löschautomatik ist **im Prinzip nicht optional**. Auslegungssache ist allein die
**Frist**.

### 5.2 Die Frist und ihre Begründung

Der belastbarste Anker für Bewerberdaten ist der etablierte **Richtwert von rund sechs Monaten**,
abgeleitet aus den AGG-Fristen:

| Baustein | Norm | Dauer |
|---|---|---|
| Geltendmachung eines Anspruchs | § 15 Abs. 4 AGG | 2 Monate |
| Klagefrist | § 61b Abs. 1 ArbGG | 3 Monate |
| Puffer für Zustellung und Bearbeitung | — | ~1 Monat |
| **Summe** | | **≈ 6 Monate → 180 Tage** |

**Ehrlichkeitsvorbehalt:** Das ist **Arbeitsrecht, nicht Mietrecht**. Die Übertragung auf ein
WG-Casting ist eine Analogie, kein Subsumtionsschluss. Sie wird gewählt, weil es der etablierteste
Referenzwert für „Bewerbung" überhaupt ist und weil eine begründete Frist besser ist als eine
gegriffene. Die Frage steht in
[§13](#13--offene-rechtsfragen-für-die-anwaltliche-prüfung).

### 5.3 Defaults

| Datenbestand | Default-Frist | Ab wann läuft sie |
|---|---|---|
| `CastingNote`, `Vote`, `Veto` | **180 Tage** | Abschluss der `CastingRound` |
| `Application` inklusive Freitext | **180 Tage** | Abschluss der `CastingRound` |
| `Application.subject_statement` (Gegendarstellung) | **kein eigener Zeitgeber** — erbt die Frist der `Application` und stirbt in **derselben Transaktion** ([§5.7](#57-löschung-ist-atomar)) | — |
| `AvailabilityWindow` und `Appointment` der Bewerbenden | **180 Tage** | Abschluss der `CastingRound` |
| `Application` mit `became_resident_id` (eingezogen) | Sachprofil bleibt; **Beratungsartefakte werden regulär gelöscht** | Abschluss der Runde |
| `ActivityEvent` | siehe [§5.6](#56-konflikt-löschung-vs-rechenschaftspflicht) | — |
| `Account`, `ResidentProfile` | bis Kontolöschung | — |

### 5.4 Steuerung durch den Haushalt

- **Verkürzen: ja.** `HouseholdSettings` erlaubt **30 / 90 / 180 Tage**.
- **Verlängern: nur protokolliert und begrenzt.** Pro `CastingRound` gibt es einen
  **Verlängerungsknopf** („Aufbewahrung um 180 Tage verlängern") mit **Pflicht-Begründungsfeld**.
  Kein „unbegrenzt".
- **Warum asymmetrisch:** Verkürzen ist datenschutzfreundlich und braucht keine Begründung;
  Verlängern ist eine Abweichung vom Grundsatz der Speicherbegrenzung und muss sich rechtfertigen
  lassen.

> Das Begründungsfeld ist **selbst ein personenbezogenes Datum**, sobald es einen Namen enthält
> („Lea will sich im Frühjahr nochmal melden"). Es steht deshalb in
> [§6](#6--datenkategorien--vorlage-für-das-art-30-verzeichnis) mit eigener Zeile.

### 5.5 Keine stille Löschung

**14 Tage vor Ablauf** erhält die moderierende Person eine Benachrichtigung mit drei Optionen:
**verlängern · jetzt löschen · archivieren**. Löschen ohne Vorwarnung findet nicht statt — der
Verlust von Kontext ohne Ankündigung wäre der sicherste Weg, das Vertrauen in die Automatik zu
zerstören und die Leute zurück zu WhatsApp zu treiben.

Jederzeit verfügbar, unabhängig von der Automatik:

- manuelles Löschen pro `Application` und pro `CastingRound`,
- **„Datenauskunft erzeugen"** pro `Application` ([§3.3](#33-feature-datenauskunft-erzeugen-pro-application)).

> ### „Archivieren" ist ein Sichtbarkeitszustand, niemals eine Fristverlängerung
>
> Archivieren nimmt die Runde aus der Standardansicht. **Die Löschuhr läuft weiter.** Die Frist wird
> dadurch weder verlängert noch angehalten, und `CastingRound.retention_until` bleibt unberührt.
>
> Verlängern ist die **separate, protokollierte, begründungspflichtige** Aktion über
> `CastingRound.retention_extensions` ([§5.4](#54-steuerung-durch-den-haushalt)). Die beiden dürfen
> nicht ineinander laufen: Wäre „archivieren" auch nur faktisch eine Verlängerung, hätte die
> Speicherbegrenzung einen **Ein-Klick-Umweg** — und zwar den bequemsten von dreien, weil er ohne
> Begründung auskommt. Das ist der wahrscheinlichste Implementierungsfehler an dieser Stelle und
> deshalb hier ausdrücklich ausgeschlossen.

### 5.6 Konflikt: Löschung vs. Rechenschaftspflicht

Das `ActivityEvent`-Log ist **append-only** (ADR-003) und dient der Rechenschaftspflicht
(Art. 5 Abs. 2), dem Undo und dem Aktivitäts-Feed. Es steht damit in einem doppelten
Spannungsverhältnis:

1. **Zur Löschpflicht.** Ein Log, das „Jonas hat Lea abgelehnt" für immer aufbewahrt, unterläuft die
   Löschung der `Application` von Lea.
2. **Zur Selbst-Redaktions-Invariante.** Ein Ereignis `vote.cast` mit `{value: "no"}` im Payload
   macht das Log zum **bequemen Umweg um die Invariante** — der Beratungsinhalt steht dann in einer
   Tabelle, die von der Sichtbarkeitspolicy des Beratungskontexts gar nicht erfasst wird. Das ist
   die schärfere der beiden Gefahren, weil sie nicht erst nach 180 Tagen wirkt, sondern sofort.

**Auflösung — vier Regeln:**

1. **Keine Werte, kein Freitext im Payload.** `ActivityEvent.payload` enthält ausschließlich
   **Referenzen und Zähler** — `application_id`, „Stimme abgegeben", „5 von 7". Niemals den
   Stimmwert, niemals den Notiztext, niemals den Namen. Diese Regel ist maschinell durchsetzbar und
   in `GUARDRAILS.md` als **G-D7** ein geschützter Test; ohne sie bleibt sie Prosa.
2. **Sichtbarkeit reist mit.** `ActivityEvent.visibility_scope` trägt die Sichtbarkeitspolicy in
   den Feed. Ein Ereignis über eine Person ist für diese Person nicht sichtbar — dieselbe Invariante,
   derselbe Test.
3. **Redaktion zum Fristende statt Löschung.** Läuft die Frist ab, werden die personenbeziehbaren
   Payload-Felder **redigiert**: Struktur und Zeitstempel bleiben, der Inhalt wird `null`. Die
   Rechenschaftskette überlebt, das Personendatum nicht. Damit ist Art. 17 gewahrt, ohne das
   Append-only-Prinzip zu brechen.
4. **Tombstone als Anzeigeregel.** Beim Löschen einer `Application` bleibt der Ereignissatz
   erhalten, die Referenz löst jedoch auf zu „gelöschte Bewerbung". Historie jenseits der Frist zeigt
   keine Namen mehr.

Die Struktur des Logs — wer hat wann welche Art von Handlung ausgeführt — bleibt erhalten. Sie ist
personenbezogen bezüglich der **handelnden**, nicht der **bewerbenden** Person und folgt der Frist
des `ResidentProfile`.

Das ist eine Konstruktionsentscheidung mit Restrisiko und steht als **Q-6** in
[§13](#13--offene-rechtsfragen-für-die-anwaltliche-prüfung).

### 5.7 Löschung ist atomar

> **Kein personenbezogenes Feld einer `Application` hat eine abweichende Frist, und kein Feld wird in
> einem eigenen Aufbewahrungsjob gelöscht.** `Application` und alle daran hängenden Beurteilungs- und
> Freitextfelder verschwinden in **einer Transaktion**.

Der Grund ist nicht Ordnungsliebe, sondern ein **Rekonstruktionsrisiko**. Die deutlichste Illustration
liefert `Application.subject_statement`, die Gegendarstellung der betroffenen Person: Sie ist
inhaltlich eine Antwort auf die Beurteilungen, gegen die sie sich richtet. Bleibt sie auch nur kurz
übrig, nachdem die Beurteilungen gelöscht sind, steht dort

> „Ich widerspreche der Aussage, ich sei unpünktlich gewesen."

— **ohne die Aussage**. Der Inhalt der gelöschten Beurteilung ist damit aus der Gegendarstellung
**rekonstruierbar**. Die Löschung hätte formal stattgefunden und wäre inhaltlich unterlaufen.

Zwei getrennte Aufbewahrungsjobs würden genau dieses Fenster öffnen — und zwar nicht durch einen
Denkfehler, sondern durch die naheliegende Implementierung „jedes Feld bekommt seine eigene Frist".
Deshalb ist die Regel technisch formuliert statt als Grundsatz:

1. **Ein Zeitgeber pro `Application`**, nicht pro Feld. `Application.retention_until` ist die einzige
   Fristquelle für den gesamten Datensatz.
2. **Eine Transaktion.** `Application`, `Vote`, `Veto`, `CastingNote`, `subject_statement`,
   `decision_note`, `rejection_reason`, `AvailabilityWindow` und `Appointment` fallen gemeinsam —
   oder keines fällt.
3. Die Gegendarstellung folgt damit demselben Zweckfortfall wie die Beurteilungen: Fallen die weg,
   entfällt der Zweck, sie zu kontextualisieren.

Durchgesetzt durch `GUARDRAILS.md` **G-E5** (keine abweichende Frist, eine Transaktion) und den
geschützten Test **G-D4** (keine Waisen, kein Rest).

### 5.8 Grenze des Löschkonzepts: das Gerät

Die Löschautomatik erreicht **den Server**. Sie erreicht **kein Endgerät**.

Die PWA (ADR-011) bringt damit eine Angriffsfläche auf das Löschkonzept mit, die an keiner der beiden
Entscheidungen sichtbar ist, aus denen sie entsteht: Hielte der Service Worker Bewerberdaten offline
vor, lägen personenbezogene Daten auf den Geräten der Bewohnenden — **außerhalb der Reichweite jedes
serverseitigen Löschjobs**. Nach 180 Tagen wäre die `Application` gelöscht und läge weiter im
Gerätecache von fünf Personen, ohne dass es irgendwo auffällt.

> **Entscheidung: Der Service Worker cacht ausschließlich die App-Hülle** — Markup, Skripte, Stile,
> Icons, Schriften. **Niemals Bewerber- oder Beratungsdaten, niemals API-Antworten.**
>
> „Offline" heißt in Flatmate.io: **die App startet ohne Netz**. Es heißt nicht: die Daten sind ohne
> Netz da.

Der wahrscheinliche Implementierungsfehler ist kein Entschluss, sondern **eine Konfigurationszeile**:
ein großzügig gefasster Runtime-Cache, der API-Antworten mitnimmt, weil das die Standardempfehlung
jeder PWA-Anleitung ist. Genau deshalb ist die Regel maschinell durchgesetzt —
`GUARDRAILS.md` **G-B6** — und nicht als Hinweis formuliert. Die TDDDG-Seite derselben Entscheidung
steht in [§10.4](#104-service-worker-und-pwa).

#### Die eine Ausnahme: der Offline-Puffer für abgegebene Stimmen

Es gibt **genau eine** begrenzte Ausnahme, und sie ist begründet, nicht geduldet. Das PRD sieht einen
**Offline-Puffer für abgegebene Stimmen** vor — mit hoher Priorität, weil abgestimmt wird, wo gerade
Zeit ist, und ein verlorener Stimmabgabe-Versuch die Kernmetrik Beteiligungsquote unmittelbar trifft.

Ein gepufferter `Vote` liegt damit im Gerätespeicher und kollidiert scheinbar mit der Regel oben.

> **Nicht tragfähig wäre die Begründung „es ist kein fremdes Datum betroffen".** Ein `Vote` besteht
> aus `application_id` plus Wert und ist damit eine **Beurteilung über eine dritte Person** — ein
> Beratungsartefakt, nicht ein Datum über die abstimmende Person. Diese Begründung wird ausdrücklich
> **nicht** übernommen.

**Tragfähig ist:** Der Puffer ist eine **noch nicht abgeschlossene Transaktion, keine gespeicherte
Kopie.** Er hält die Nutzlast einer Handlung, die die Person selbst ausgelöst hat und die noch
läuft. Das Löschregime bleibt unberührt, **weil der Puffer den Versand nicht überleben kann** — und
das ist der entscheidende Halbsatz: Die Ausnahme trägt nur, solange „kann nicht überleben" eine
**erzwungene Eigenschaft** ist und keine Erwartung.

Deshalb sechs Zusicherungen. Die erste ist die, ohne die die Ausnahme zum Loch wird:

| # | Zusicherung | Warum |
|---|---|---|
| **1** | **Harte Höchstlebensdauer von 7 Tagen, unabhängig vom Versanderfolg** — danach Verwerfen und Hinweis an die Person | Ohne sie trägt ein Gerät, das offline geht und Monate später zurückkommt, eine Beurteilung über eine Bewerbung, deren Daten serverseitig längst gelöscht sind. Das wäre genau das Leck, das die Service-Worker-Regel schließt — nur durch die Hintertür. **Diese Zusicherung schließt die Grenze überhaupt erst.** |
| **2** | **Keine Anzeigedaten im Puffer** — nur `application_id`, Wert, Rundenstufe. Kein Name, kein Profiltext, keine denormalisierte Karte | Sobald der Puffer speichert, *wem* die Stimme galt, ist er eine Datenkopie und keine Transaktionsnutzlast mehr. |
| **3** | **Verwerfen statt Wiederholen**, wenn der Server ablehnt, weil Bewerbung oder Runde inzwischen gelöscht sind — und **kein Bewerbername in der Fehlermeldung** | Folgt aus 2.: Die App kennt den Namen lokal gar nicht. Der Hinweis lautet „deine Stimme konnte nicht mehr gezählt werden", nicht wofür. |
| **4** | **Leeren bei Abmeldung und bei Sitzungsentzug** | Die WG-Realität ist ein geteilter Laptop im Wohnzimmer. |
| **5** | **Leeren auch beim Profilwechsel**, nicht nur bei der Abmeldung | *Ergänzung dieses Dokuments.* Der Wechsel zwischen Verwaltungs- und Bewohnerkontext ist eine ausdrücklich vorgesehene Funktion und **keine Abmeldung**. Ein Puffer, der nur beim Logout geleert wird, überlebt den Wechsel — und dann hält der Kontext von Profil B die Stimmen von Profil A. |
| **6** | **Wiedereinspielung ist idempotent** — der Server schlüsselt auf (`application_id`, `resident_profile_id`, `round_number`) und überschreibt, statt anzufügen | *Ergänzung dieses Dokuments.* Eine doppelt eingespielte Stimme verschiebt Score **und** Quorum-Nenner. Beides sind auskunftspflichtige Beurteilungsdaten ([§3](#3--art-15-und-die-casting-notizen)) — ein Duplikat ist damit kein Zählfehler, sondern ein **falsches Datum über eine Person** und eine Verletzung von **Art. 5 Abs. 1 lit. d (Richtigkeit)**. Die betroffene Person bekäme die Doppelstimme in einer Auskunft nach Art. 15 zu sehen und hätte nach **Art. 16** einen Berichtigungsanspruch auf eine Stimme, die nie zweimal abgegeben wurde. |

Durchgesetzt durch `GUARDRAILS.md` **G-B7**. Die TDDDG-Seite steht in
[§10.5](#105-die-ausnahme-offline-puffer-für-abgegebene-stimmen).

---

## 6 · Datenkategorien — Vorlage für das Art.-30-Verzeichnis

> **Verhältnis zur Maschinenfassung.** Diese Tabelle korrespondiert **1:1** mit
> `data-inventory.yml` aus ADR-010. Die YAML-Datei ist die **normative Quelle** — der CI-Check
> bricht den Build, sobald eine Spalte mit Personenbezug dort nicht deklariert ist
> (`GUARDRAILS.md`, G-F). Diese Tabelle ist die lesbare Fassung derselben Information und muss bei
> jeder Änderung mitgezogen werden.

> **⚠️ Status der Feldnamen.** `04-Domaenenmodell.md` entsteht **parallel** in einem anderen Chat.
> Die Entitätsnamen sind Kontrakt aus dem Brief und damit verbindlich; die **Feldnamen unterhalb der
> Entitäten sind Ableitungen** aus den Entscheidungen des Briefs und stehen unter dem Vorbehalt des
> Abgleichs mit dem Domänenmodell. Abweichungen sind dort zu korrigieren, nicht hier zu erfinden.

**Legende Kategorie:** `ID` Identifikator · `KONTAKT` Kontaktdatum · `STAMM` Stammdatum ·
`FREITEXT` unstrukturierter Text mit **Art.-9-Risiko** ([§8](#8--art-9--besondere-kategorien-im-freitext)) ·
`BEURTEILUNG` Bewertung über eine Person ([§3](#3--art-15-und-die-casting-notizen)) ·
`VERHALTEN` Nutzungs- und Verfügbarkeitsdaten · `AUTH` Authentifizierungsdatum ·
`META` Prozess- und Statusdatum · `KONFIG` Konfiguration ohne Personenbezug

**Legende Rechtsgrundlage:** `6b` Art. 6 Abs. 1 lit. b (Vertrag / vorvertragliche Maßnahme) ·
`6f` Art. 6 Abs. 1 lit. f (berechtigtes Interesse) · `6a` Art. 6 Abs. 1 lit. a (Einwilligung) ·
`6c` Art. 6 Abs. 1 lit. c (rechtliche Verpflichtung)

**Verantwortlicher:** `H` = `Household` · `F` = Flatmate.io

### 6.0 Brücke zur Klassifizierung in `04-Domaenenmodell.md`

`04` klassifiziert seine Felder nach **Empfindlichkeit** (🔴 / 🟠 / ⚫ / ⚙️), dieses Dokument nach
**Verarbeitungszweck** (`ID`, `KONTAKT`, `STAMM`, …). Das ist kein Widerspruch — jede Notation ist
für ihr Dokument die richtige —, aber ohne Zuordnung ist die Gegenprobe *„jedes 🔴-, 🟠- oder
⚫-Feld hat eine Zeile in `06`"* nicht mehr maschinell prüfbar. Genau die soll dieser Abschnitt
bedienen, deshalb hier die Abbildung:

| `04` | Bedeutung dort | entspricht in `06` | Zeile nötig? |
|---|---|---|---|
| 🔴 | direkt personenbezogen — identifizierend, Kontakt, Stammdaten, Verhalten | `ID` · `KONTAKT` · `STAMM` · `VERHALTEN` · `AUTH` | **ja** |
| 🟠 | personenbezogen im weiteren Sinne — Rollen-, Status- und Prozessdaten über eine identifizierte Person | **`META (personenbezogen)`** | **ja** |
| ⚫ | Beratungsinhalt — Bewertung oder Freitext über eine Person | `BEURTEILUNG` · `FREITEXT` | **ja**, mit dem strengsten Regime ([§6.3](#63-kontext-deliberation), G-F2) |
| ⚙️ | kein Personenbezug — technisch, organisatorisch, Konfiguration | `KONFIG` | **nein** — gehört, wenn zugangsrelevant, in die TOM-Liste ([§11](#11--tom-skizze)) statt ins Art.-30-Verzeichnis |

Zwei Anwendungsfälle, an denen die Abbildung schon gearbeitet hat:

- `Membership.role` und `.permissions[]` sind hier **`META (personenbezogen)`** — das entspricht 🟠.
  „X ist Moderatorin" ist eine Information über eine identifizierte Person; Art. 4 Nr. 1 ist weit.
  Keine automatische Frist, aber auf Auskunftsverlangen offenzulegen.
- `Household.join_code` ist ⚙️ und hat **keine** Zeile im Verzeichnis. Er identifiziert einen
  Haushalt, keine Person — ist aber zugangsrelevant und steht deshalb mit drei Auflagen in
  [§11.2](#112-vertraulichkeit--authentifizierung).

> `04` ist die Autorität für seine eigene Legende. Weicht die Bedeutung dort von dieser Abbildung ab,
> gilt `04` — und diese Tabelle ist zu korrigieren, nicht die Klassifizierung dort.

### 6.1 Kontext `identity`

| Feld | Kategorie | Zweck | Rechtsgrundlage | Verantw. | Frist |
|---|---|---|---|---|---|
| `Account.id` | ID | Kontoführung, Zuordnung von Handlungen | 6b | F | bis Kontolöschung |
| `Account.email` | KONTAKT | Anmeldung, Benachrichtigung, Passwort-Reset | 6b | F | Kontolöschung + 30 Tage (Missbrauchsklärung) |
| `Account.email_verified_at` | META | Nachweis der Verifikation vor Benachrichtigungsversand | 6b, 6f | F | wie `Account.email` |
| `Account.password_hash` | AUTH | Anmeldung (P-2: Passwort primär und universell) | 6b | F | bis Kontolöschung |
| `Account.passkey_credential` | AUTH | optionaler Komfort-Aufsatz, jederzeit abschaltbar | 6b | F | bis Widerruf oder Kontolöschung |
| `Account.created_at`, `Account.last_login_at` | VERHALTEN | Missbrauchserkennung, Support, Inaktivitätsbereinigung | 6f | F | bis Kontolöschung |
| `Household.id` | ID | Mandantentrennung (jede Query, RLS-Schlüssel) | 6b | F | bis Löschung des Haushalts |
| `Household.name` | STAMM | Wiedererkennung; **kann Personenbezug tragen** („WG Zink") | 6b | F | bis Löschung des Haushalts |
| `Household.join_code` | *(kein Personenbezug — siehe [§11.2](#112-vertraulichkeit--authentifizierung))* | identifiziert einen **Haushalt**, keine Person; steht deshalb in der **TOM-Liste**, nicht im Art.-30-Verzeichnis. Zugangsrelevant: wer ihn hat, kommt an Beratungsinhalte | — | — | bis Rotation |
| `Household.avv_accepted_version`, `…_at` | META | Nachweis des Vertragsschlusses (Art. 28 Abs. 9) | 6b, 6c | F | Vertragsende + gesetzliche Aufbewahrung |
| `Household.contact_email` | KONTAKT | **Pflichtangabe** der Art.-13-Datenschutzseite (Kontaktdaten des Verantwortlichen); zugleich Rückkanal für Betroffenenanfragen ([§4.6](#46-zwei-bewusste-auslegungen-in-der-datenschutzseite)) | 6c | H | bis Löschung des Haushalts |
| `Household.privacy_notice_state` | META | `draft` / `published` — **die Freigabe ist eine Handlung des Verantwortlichen, nicht ein Nebeneffekt** ([§4.5](#45-der-wortlaut-des-copy-paste-hinweises)) | 6c | H | bis Löschung des Haushalts |
| `Household.privacy_notice_published_at`, `…_by_account_id`, `…_version` | META | Nachweis, wer welche Textversion wann freigegeben hat | 6c | H | bis Löschung des Haushalts |
| `ResidentProfile.id` | ID | Zuordnung von Stimmen, Notizen, Terminen | 6b | H | siehe `moved_out_on` |
| `ResidentProfile.display_name` | STAMM | Anzeige im Feed, in der Bewohnerliste, im Quorum | 6b | H | bis Löschung des Profils |
| `ResidentProfile.moved_in_on` | STAMM | Einzugsdatum; Abgleich mit `Room`, Wohndauer-Kontext | 6b | H | bis Löschung des Profils |
| `ResidentProfile.moved_out_on` | META | sofortiger Zugriffsentzug, Herausrechnen aus dem Quorum-Nenner offener Runden | 6f | H | bis Löschung des Profils |
| `Membership.is_resident` | **META (personenbezogen)** | orthogonales Attribut: nur Bewohnende stimmen ab | 6b | H | bis Löschung der Mitgliedschaft |
| `Membership.role` | **META (personenbezogen)** | Moderationsrolle. „X ist Moderatorin" ist eine Information **über eine identifizierte Person** — Art. 4 Nr. 1 ist weit. Keine automatische Frist, aber **auf Auskunftsverlangen offenzulegen** | 6b | H | wie oben |
| `Membership.permissions[]` | **META (personenbezogen)** | einzeln vergebbare Rechte (Bewerber anlegen, Status ändern, Runde schließen, Termine bestätigen); wie `role` auskunftspflichtig | 6b | H | wie oben |
| `Membership.joined_at`, `left_at` | META | Nachvollziehbarkeit von Beitritten (struktureller Duplikatsschutz, [§10.3](#103-duplikatsschutz-strukturell-statt-technisch)) | 6f | H | wie oben |
| `Session.token_hash`, `expires_at`, `user_agent` | AUTH/VERHALTEN | Anmeldung, Abmeldung fremder Geräte | 6b, 6f | F | bis Ablauf oder Abmeldung |

> **Entschieden: `Household` führt keine Postanschrift.** Die Kontaktangabe der
> Art.-13-Datenschutzseite ist die **Haushalts-E-Mail** — für einen privaten Haushalt die
> verhältnismäßige Angabe. Eine WG, die Bewerbenden ihre Postanschrift offenlegt, erzeugt ein
> Datenschutzproblem für die Bewohnenden selbst und damit das Gegenteil dessen, was die
> Informationspflicht bezweckt. Begründung in
> [§4.6](#46-zwei-bewusste-auslegungen-in-der-datenschutzseite). Ortsangaben zu einzelnen Terminen
> tragen `Appointment.location` als Freitext ([§6.4](#64-kontext-scheduling)) — dort, wo sie
> hingehören, und mit der Frist der Runde.

> ⚠️ TBD — zu ergänzen: Ob `ResidentProfile` ein **Avatarbild** führt. Falls ja: Kategorie `STAMM`
> mit erhöhtem Risiko (Rückschluss auf Herkunft, ggf. Art. 9), Rechtsgrundlage `6a`.

### 6.2 Kontext `casting`

| Feld | Kategorie | Zweck | Rechtsgrundlage | Verantw. | Frist |
|---|---|---|---|---|---|
| `Application.id` | ID | Zuordnung aller Beratungsartefakte | 6b | H | 180 Tage nach Rundenabschluss |
| `Application.applicant_name` | STAMM | Identifikation im Screening | 6b (vorvertragliche Maßnahme auf Anfrage der Person) | H | 180 Tage |
| `Application.age` | STAMM | Passung zur WG-Struktur | 6b, 6f | H | 180 Tage |
| `Application.contact_email` | KONTAKT | Einladung, Terminabsprache, Absage; **zugleich Identitätsnachweis bei Betroffenenanfragen** ([§7.6](#76-identitätsprüfung-bei-betroffenenanfragen)) | 6b | H | 180 Tage |
| `Application.contact_phone` | KONTAKT | wie oben (Kanalneutralität, P-1) | 6b | H | 180 Tage |
| `Application.contact_other` | KONTAKT | Portal-Handle oder Messenger-Kennung — der Kanal, über den die Bewerbung tatsächlich kam (P-1) | 6b | H | 180 Tage |
| `Application.source` | META | **technischer** Erfassungspfad: `manual_form` · `paste_parser` · `availability_link` · `portal_import`. Produktdatum, **kein** Rechtsgrundlagen-Träger | 6f | H | 180 Tage |
| `Application.collected_from` | META | **rechtlicher Erhebungsort:** `data_subject` · `third_party`. Trägt die Entscheidung Art. 13 vs. Art. 14 ([§4](#4--art-13-vs-art-14--korrigierte-abgrenzung)). Pflichtfeld, **kein stiller Default** | 6c | H | 180 Tage |
| `Application.message_raw` | **FREITEXT** | ursprüngliche Nachricht, Grundlage des Paste-Parsers; absatzweise verwerfbar **vor** dem Speichern ([§8.2](#82-fünf-folgen-für-das-produkt)) | 6b | H | 180 Tage — **Art.-9-Risiko, siehe [§8](#8--art-9--besondere-kategorien-im-freitext)** |
| `Application.attributes` | STAMM/META | Ergebnis des **regelbasierten** Parsers, menschlich bestätigt | 6b | H | 180 Tage |
| `Application.state` | META | Zustandsmaschine `new → screened → invited → scheduled → interviewed → offer_made → moved_in` und Seitenzustände | 6b, 6f | H | 180 Tage |
| `Application.decision_note` | **FREITEXT / BEURTEILUNG** | Begründung der Entscheidung | 6f | H | 180 Tage — **Art.-9-Risiko** |
| `Application.rejection_reason` | **FREITEXT / BEURTEILUNG** | Begründung der Absage — **im Vermieter-Fall potenzielles AGG-Beweismittel** ([§12.2](#122-agg--19-abs-5-greift-nicht-mehr)) | 6f | H | 180 Tage — **Art.-9-Risiko** |
| `Application.subject_statement` | **FREITEXT** | eigene Stellungnahme der betroffenen Person — die saubere Antwort auf Art. 16 bei Beurteilungen ([§7.2](#72--art-16--berichtigung)) | 6c | H | 180 Tage |
| `Application.subject_access_exported_at` | META | **Nachweis der Unterstützungspflicht** nach Art. 28 Abs. 3 lit. e; belegt, wann eine Auskunft erzeugt wurde | 6c | H | 180 Tage |
| `Application.planned_move_in_on` | STAMM | geplanter Einzugstermin, Abgleich mit `Room` | 6b | H | 180 Tage |
| `Application.became_resident_id` | ID/META | **Schlüssel der Selbst-Redaktions-Invariante** — verknüpft die Bewerbung mit dem entstandenen `ResidentProfile`. **n:1 und manuell gesetzt** — daraus folgt die Lücke aus [§3.4](#34-lücke-die-selbst-redaktion-schützt-nur-verknüpfte-bewerbungen) | 6f | H | dauerhaft, solange das Profil existiert |
| `Application.created_at`, `retention_until` | META | Fristenberechnung, 14-Tage-Vorwarnung | 6c (Art. 5 Abs. 1 lit. e) | H | mit dem Datensatz |
| `Room.label`, `Room.status` | KONFIG | eigene Zustandsmaschine je Zimmer („3 Zimmer, eines vergeben, Runde läuft weiter") | 6b | H | bis Löschung des Haushalts |
| `CastingRound.opened_at`, `closed_at` | META | Fristenstart, Rundensichtbarkeit | 6c, 6f | H | mit der Runde |
| `CastingRound.settings_snapshot` | KONFIG | eingefrorene Verfahrensregeln der Runde (Regel-Sperre gegen Änderung während des Laufs) | 6f | H | mit der Runde |
| `CastingRound.quorum_denominator_frozen` | META | eingefrorener Quorum-Nenner; hält abgeschlossene Runden gegen spätere Auszüge stabil | 6f | H | mit der Runde |
| `CastingRound.retention_until` | META | Ablauf der Aufbewahrung | 6c | H | mit der Runde |
| `CastingRound.retention_warned_at` | META | Beleg der 14-Tage-Vorwarnung — **keine stille Löschung** ([§5.5](#55-keine-stille-löschung)) | 6c | H | mit der Runde |
| `CastingRound.retention_extensions` | **FREITEXT (in `reason`)** | jsonb-Liste `{extended_at, by_account_id, reason}` — protokollierte, begründungspflichtige Verlängerungen. **`reason` kann Namen enthalten** ([§5.4](#54-steuerung-durch-den-haushalt)) | 6f | H | mit der Runde |
| `RoundParticipation.resident_profile_id` | ID | Teilnehmer-Snapshot beim Rundenstart; steuert Rundensichtbarkeit | 6f | H | mit der Runde |
| `RoundParticipation.can_vote` | META | Quorum-Nenner; `false` für ausgezogene Mitglieder in offenen Runden | 6f | H | mit der Runde |

### 6.3 Kontext `deliberation`

> Alle Felder dieses Kontexts sind **auskunftspflichtig gegenüber der bewerteten Person**
> ([§3](#3--art-15-und-die-casting-notizen)) und zugleich **personenbezogen bezüglich der
> bewertenden Person**. Doppelter Personenbezug — bei jeder Auskunft und jeder Löschung mitdenken.

| Feld | Kategorie | Zweck | Rechtsgrundlage | Verantw. | Frist |
|---|---|---|---|---|---|
| `Vote.application_id` | ID | Zuordnung der Bewertung | 6f | H | 180 Tage nach Rundenabschluss |
| `Vote.resident_profile_id` | ID | Quorum, Verhinderung von Doppelstimmen, Selbst-Redaktion | 6f | H | 180 Tage |
| `Vote.value` | **BEURTEILUNG** | vierstufige Skala (Nein 0 · Eher nicht 1 · Finde gut 3 · Unbedingt 5), Score als Mittelwert auf 0–100 | 6f | H | 180 Tage |
| `Vote.round_number` | META | Runde 1 (Einladen) vs. Runde 2 (Zusage) | 6f | H | 180 Tage |
| `Vote.created_at`, `updated_at` | META | Revidierbarkeit während des Screenings, Feinschliff-Screen | 6f | H | 180 Tage |
| *(abgeleitet)* Score, Ranglistenposition, Stimmungsbild | **BEURTEILUNG** | Entscheidungsgrundlage; **kein eigenes Feld, aber auskunftspflichtig** | 6f | H | mit den zugrunde liegenden `Vote` |
| `Veto.application_id` | ID | Zuordnung | 6f | H | 180 Tage |
| `Veto.created_by_profile_id` | ID | Veto-Budget (Default 1 pro Runde), Zuordnung | 6f | H | 180 Tage |
| `Veto.reason` | **FREITEXT / BEURTEILUNG** | Begründungspflicht (einstellbar) | 6f | H | 180 Tage — **Art.-9-Risiko** |
| `Veto.is_anonymous` | META | Opt-in-Anonymität; die UI muss deren faktische Grenzen benennen | 6f | H | 180 Tage |
| `CastingNote.application_id` | ID | Zuordnung | 6f | H | 180 Tage |
| `CastingNote.author_profile_id` | ID | Urheberschaft; im Auskunftsexport **nicht** enthalten (Art. 15 Abs. 4) | 6f | H | 180 Tage |
| `CastingNote.prompt_key` | META | strukturierter Notiz-Prompt statt leerem Kasten (Risikominderung, [§2.2](#22-warum-der-befund-trotzdem-für-das-produkt-spricht)) | 6f | H | 180 Tage |
| `CastingNote.body` | **FREITEXT / BEURTEILUNG** | Casting-Notiz | 6f | H | 180 Tage — **Art.-9-Risiko** |

### 6.4 Kontext `scheduling`

| Feld | Kategorie | Zweck | Rechtsgrundlage | Verantw. | Frist |
|---|---|---|---|---|---|
| `AvailabilityWindow.subject_kind` | META | unterscheidet Bewohnende von Bewerbenden — **unterschiedliche Fristen und Rollen** | 6f | H | mit dem Datensatz |
| `AvailabilityWindow.resident_profile_id` / `.application_id` | ID | Zuordnung — **zwei getrennte Fremdschlüssel, kein polymorpher Schlüssel** (RLS-fähig) | 6b, 6f | H | Bewerbende 180 Tage · Bewohnende bis Profil-Löschung |
| `AvailabilityWindow.polarity` (`can` / `cannot`) | VERHALTEN | Feasibility-Schicht, Solver-Constraints | 6b, 6f | H | wie oben |
| `AvailabilityWindow.starts_at`, `ends_at` | VERHALTEN | Zeitfenster | 6b, 6f | H | wie oben |
| `AvailabilityWindow.source` (`manual` / `token_link` / `parsed`) | META | Nachvollziehbarkeit; `parsed` erfordert menschliche Bestätigung (P-1, P-3) | 6f | H | wie oben |
| `AvailabilityWindow.confirmed_by_profile_id` | ID | wer den Parser-Vorschlag bestätigt hat — macht P-3 überprüfbar statt behauptet | 6f | H | wie oben |
| `AvailabilityWindow.raw_input` | **FREITEXT** | Eingabe für den Freitext→Zeitfenster-Parser („Di 16-19", „nur abends") | 6b | H | wie oben — geringes, aber vorhandenes Art.-9-Risiko („nur nach dem Gottesdienst") |
| *(Token-Link)* `AvailabilityToken.token_hash`, `expires_at` | AUTH | schmaler Zugang zu **einer** Seite ohne Konto; trägt den Art.-13-Hinweis | 6f | H | mit der Runde, spätestens 180 Tage |
| `Slot.start`, `end`, `capacity` | KONFIG | Zeitraster des Haushalts, Heatmap „4/7 können" | 6b | H | mit der Runde |
| `Appointment.application_id` | ID | Zuordnung des Castings | 6b | H | 180 Tage |
| `Appointment.expected_attendee_profile_ids` | ID | „mindestens X Bewohnende pro Casting", Erklärbarkeit (P-3) | 6f | H | 180 Tage |
| `Appointment.starts_at`, `ends_at`, `status` | META | Kalenderansicht, Bestätigung | 6b | H | 180 Tage |
| `Appointment.location` | FREITEXT | Ortsangabe („Hinterhaus, 2. Stock, bei Meier klingeln") | 6b | H | 180 Tage |
| `Appointment.explanation` | META | verletzte Soft-Terme und Relaxierungen („Di 17:00 — 5/7 können"), **zur Anfragezeit erzeugt und mit dem Ergebnis persistiert** | 6f | H | 180 Tage |
| `Appointment.solver_run_id` | ID | Korrelations-ID des Solver-Laufs — **trägt kein Personendatum** | 6f | H | 180 Tage |

> **Solver-Eingaben werden nicht protokolliert.** Die Eingabe an den `ortools`-Kindprozess
> (ADR-005) enthält Verfügbarkeitsfenster und damit personenbezogene Daten. Ein Eingabearchiv wäre
> eine **zweite Kopie außerhalb des Aufbewahrungsregimes** und würde die Löschautomatik unterlaufen.
> Persistiert wird ausschließlich das Ergebnis (`Appointment`) samt `explanation`; die Erklärung
> entsteht **zur Anfragezeit** und wird nicht nachträglich aus einem Archiv rekonstruiert.
> `Appointment.solver_run_id` bleibt als Korrelations-ID zulässig. Das ist keine Empfehlung, sondern
> eine Regel — `GUARDRAILS.md` **G-K4** setzt sie durch.

### 6.5 Kontexte `notifications` und `audit`

| Feld | Kategorie | Zweck | Rechtsgrundlage | Verantw. | Frist |
|---|---|---|---|---|---|
| `Notification.recipient_profile_id` | ID | Zustellung | 6b, 6f | H | siehe unten |
| `Notification.channel` (`in_app` / `email` / `push`) | KONFIG | v1: Web Push bevorzugt, E-Mail als Fallback, sonst nur In-App | 6b | H | — |
| `Notification.payload` | **BEURTEILUNG (potenziell)** | Inhalt der Benachrichtigung — **unterliegt derselben Sichtbarkeitspolicy**; kein Leak von Beratungsinhalten an die falsche Person | 6f | H | **30 Tage** (Vorschlag) |
| `Notification.sent_at`, `read_at` | VERHALTEN | Digest-Bildung, „was ist passiert, während ich weg war" | 6f | H | 30 Tage |
| `HouseholdSettings.*` | KONFIG | Aufbewahrungsdauer (30/90/180), Veto-Budget, Begründungspflicht, verdeckte Ergebnisse (Default an), Ereignisauswahl | 6b | H | bis Löschung des Haushalts |
| `ActivityEvent.actor_account_id` | ID | „wer war angemeldet" | 6f, 6c (Art. 5 Abs. 2) | H | siehe [§5.6](#56-konflikt-löschung-vs-rechenschaftspflicht) |
| `ActivityEvent.actor_profile_id` | ID | „wer hat gehandelt" — ehrliche Anzeige „Verwaltung hat Lea eingeladen" | 6f, 6c | H | wie oben |
| `ActivityEvent.event_type` | META | Ereignisart | 6f, 6c | H | wie oben |
| `ActivityEvent.payload` | META | **nur Referenzen und Zähler, keine Werte, kein Freitext** ([§5.6](#56-konflikt-löschung-vs-rechenschaftspflicht)) | 6f, 6c | H | wie oben |
| `ActivityEvent.visibility_scope` | META | trägt die Sichtbarkeitspolicy in den Feed — ein Ereignis über eine Person ist für diese Person nicht sichtbar | 6f | H | wie oben |
| `ActivityEvent.correlation_id` | ID | verkettet zusammengehörige Ereignisse eines Vorgangs | 6f, 6c | H | wie oben |
| `ActivityEvent.reverses_event_id` | ID | Rückwärtsübergänge und Undo auditierbar machen (P-4) | 6f, 6c | H | wie oben |
| `ActivityEvent.occurred_at` | META | Feed, Undo, Nachvollziehbarkeit | 6f, 6c | H | wie oben |
| *(Plattform)* Anwendungs- und Sicherheitsprotokolle | VERHALTEN | Betrieb, Missbrauchserkennung; **PII-frei** (`GUARDRAILS.md`, G-B3) | 6f | **F** | **30 Tage** (Vorschlag) |
| *(Plattform)* Produktmetriken — Beteiligungsquote, Runden pro Haushalt und Jahr, Zeit bis Entscheidung | **aggregiert, nicht personenbeziehbar** | Kernmetrik und Beobachtungsmetriken aus SRD §6 | 6f | **F** | unbefristet, weil ohne Personenbezug |

> **Auflage für die Produktmetriken.** Sie werden **aggregiert und nicht personenbeziehbar**
> erhoben — das ist Bedingung, nicht Präferenz. Die Kernmetrik Beteiligungsquote ist als Verhältnis
> *pro Runde* berechenbar (abgegebene Stimmen ÷ Quorum-Nenner), ohne dass ein Profilbezug
> gespeichert werden muss. Sobald eine Metrik nur mit Profilbezug berechenbar wäre, braucht sie eine
> eigene Zeile mit `6f`, kurzer Frist und einer Interessenabwägung — oder sie wird nicht erhoben.

### 6.6 Gegenprobe

Verifikationspunkt 7 des Briefs verlangt: *jedes personenbezogene Feld im Domänenmodell hat im
Compliance-Anhang eine Zeile mit Zweck, Rechtsgrundlage und Frist.* Diese Gegenprobe kann erst
laufen, wenn `04-Domaenenmodell.md` vorliegt. Bis dahin gilt die Feldliste dieses Abschnitts als
**Vorschlag zum Abgleich**, nicht als abgeschlossene Menge.

---

## 7 · Betroffenenrechte — Flüsse Art. 15/16/17/20

**Grundmuster für alle vier Rechte:**

- Der Antrag geht an den **`Household`** als Verantwortlichen — praktisch an die Kontaktadresse aus
  dem Art.-13-Hinweis.
- Geht er versehentlich an Flatmate.io, wird er **nicht bearbeitet, sondern weitergeleitet**
  (Art. 28 Abs. 3 lit. e) und der Haushalt benachrichtigt. Ein Auftragsverarbeiter, der eigenmächtig
  Auskunft erteilt, verletzt seine Weisungsbindung.
- Frist: **unverzüglich, spätestens ein Monat** (Art. 12 Abs. 3), verlängerbar um zwei Monate. Die
  Frist bindet den Haushalt; die App verkürzt die technische Bearbeitung auf Sekunden.
- Jede Bearbeitung erzeugt ein `ActivityEvent`.

### 7.1 Art. 15 — Auskunft

| | |
|---|---|
| **Antrag stellt** | bewerbende Person (auch: ehemalige, abgelehnte, eingezogene) |
| **Bearbeitet** | `Household` — moderierende Person oder Haushalts-Account |
| **App-Funktion** | **„Datenauskunft erzeugen"** pro `Application` — Export in JSON und lesbarem Format |
| **Inhalt** | vollständig beschrieben in [§3.3](#33-feature-datenauskunft-erzeugen-pro-application) |
| **Grenze** | Identität der bewertenden Personen (Art. 15 Abs. 4), Daten anderer Bewerbender |
| **Sonderfall** | eingezogene Person: Die Selbst-Redaktions-Invariante macht Beratungsinhalte in der **Oberfläche** unsichtbar — sie **beseitigt den Auskunftsanspruch nicht**. Verlangt die Person Auskunft, erhält sie ihre alten Notizen und Stimmen, sofern noch nicht gelöscht. Das ist unangenehm und trotzdem richtig; das Gegenmittel ist die kurze Frist, nicht das Verstecken. |

### 7.2 Art. 16 — Berichtigung

| | |
|---|---|
| **Antrag stellt** | bewerbende Person („mein Name ist falsch geschrieben", „das Alter stimmt nicht") |
| **Bearbeitet** | `Household` |
| **App-Funktion** | normales Bearbeiten der `Application`; die Änderung erzeugt ein `ActivityEvent` |
| **Grenze** | **Beurteilungen sind nicht berichtigungsfähig.** Art. 16 korrigiert unrichtige *Tatsachen*. „Ich fand den Eindruck falsch" ist kein Berichtigungsanspruch — dafür steht Art. 21 (Widerspruch) und die Möglichkeit, eine **eigene Stellungnahme beifügen** zu lassen. |
| **Lösung** | **`Application.subject_statement`** — die eigene Stellungnahme der betroffenen Person wird der Bewerbung beigefügt und erscheint im Auskunftsexport neben den Beurteilungen. Datenfeld in v1, Oberfläche in v1.1. Das ist die saubere Antwort auf einen Fall, den Art. 16 nicht löst: Die Beurteilung bleibt stehen, aber sie steht nicht mehr allein. |

### 7.3 Art. 17 — Löschung

| | |
|---|---|
| **Antrag stellt** | bewerbende Person |
| **Bearbeitet** | `Household` |
| **App-Funktion** | manuelles Löschen pro `Application` (jederzeit verfügbar); löscht **alle** verknüpften Beratungsartefakte — `Vote`, `Veto`, `CastingNote`, `AvailabilityWindow`, `Appointment` |
| **Automatik** | greift ohnehin nach 180 Tagen ([§5](#5--speicherbegrenzung-und-löschkonzept)) |
| **Grenze** | `ActivityEvent`-Log: Tombstone statt Löschung ([§5.6](#56-konflikt-löschung-vs-rechenschaftspflicht)) |
| **Invariante** | Ein Löschvorgang, der Waisen hinterlässt (`Vote` ohne `Application`), ist ein Bug mit Compliance-Wirkung — deshalb geschützter Test in `GUARDRAILS.md` (G-D4) |

### 7.4 Art. 20 — Datenübertragbarkeit

| | |
|---|---|
| **Antrag stellt** | bewerbende Person |
| **Bearbeitet** | `Household` |
| **App-Funktion** | derselbe JSON-Export wie Art. 15 — deshalb ist das maschinenlesbare Format **Pflicht**, nicht Komfort |
| **Umfang** | **enger als Art. 15**: nur Daten, die die Person **selbst bereitgestellt** hat und die auf `6a` oder `6b` beruhen. `Vote`, `Veto`, `CastingNote` und Scores sind **nicht** übertragbar — sie stammen vom Haushalt, nicht von der Person, und beruhen auf `6f`. |
| **Praktisch** | Der Export markiert je Block, ob er unter Art. 15, Art. 20 oder beide fällt. Ein einziger Exportlauf, zwei Rechtsgrundlagen. |

### 7.5 Nicht ausgeführt, aber zu kennen

- **Art. 18 (Einschränkung)** — praktisch relevant, wenn eine Berichtigung streitig ist. In v1 kein
  eigenes Feature; der Haushalt kann eine `Application` in einen Seitenzustand versetzen.
- **Art. 21 (Widerspruch)** — greift bei `6f`, also gerade bei `Vote`, `Veto` und `CastingNote`.
  Ein erfolgreicher Widerspruch führt praktisch zur Löschung der Beratungsartefakte.
- **Art. 22 (automatisierte Entscheidung im Einzelfall)** — **greift hier nicht.** Die Norm setzt
  eine Entscheidung voraus, die *ausschließlich* auf automatisierter Verarbeitung beruht. Hier ist
  die **Eingabe menschliches Urteil**: Der Score ist Arithmetik über abgegebene Stimmen, kein
  Profiling und kein abgeleitetes Merkmal.

> **Der Grund ist wichtiger als das Ergebnis.** Ein Modell, das aus Bewerberdaten auf Eignung
> schließt, ist **kategorial** etwas anderes als ein Mittelwert über Stimmen, die Menschen abgegeben
> haben. Die eine Konstruktion leitet Aussagen über eine Person ab, die andere zählt Aussagen
> zusammen, die bereits getroffen wurden. Genau an dieser Linie verläuft **P-5**
> ([§9](#9--ai-act-einordnung-und-p-5)) — und genau sie hält das Produkt aus Anhang III heraus.
> Würde die App ranken *und* entscheiden, oder Merkmale ableiten statt Stimmen zählen, änderte sich
> beides zugleich.

### 7.5.1 Die berechtigte Sorge dahinter — und warum sie eine Designfrage ist

Hinter Art. 22 steht eine Sorge, die auch dann bleibt, wenn die Norm nicht greift: **dass die
Rangliste zum Gummistempel wird.** Wenn niemand mehr die Verteilung ansieht, sondern nur noch der
Reihe nach einlädt, ist die Entscheidung faktisch automatisiert, ganz gleich wie sie rechtlich
heißt.

Das ist **keine Rechtsfrage, sondern eine Produktfrage** — und sie ist bereits beantwortet. Vier
Merkmale verhindern, dass die Rangliste zum Automatismus wird:

| Merkmal | Wirkung gegen den Automatismus |
|---|---|
| Das **Quorum ist eine Anzeigeschwelle, keine Beschlussfähigkeitsgrenze** | Es sagt „hier fehlen noch Stimmen", nicht „hier darf nicht entschieden werden". Es sperrt nichts, es macht Unvollständigkeit sichtbar. |
| Die **Einzelansicht zeigt die Verteilung** (gestapelter 4-Farben-Balken), nicht nur den Score | Zwei Bewerbungen mit identischem Score können völlig verschiedene Stimmungsbilder haben — und der Balken zeigt das, bevor jemand den nächsten Namen anklickt. |
| Kandidaten unter Quorum stehen **sichtbar getrennt** („Warten auf Stimmen (3 von 7)") | Sie verschwinden nicht ans Listenende, wo sie niemand mehr ansieht. |
| **Vetos senken ab, sie löschen nicht** | Die bewerbende Person bleibt in der Liste und damit im Gespräch. Ein gelöschter Kandidat wäre eine automatisierte Vorentscheidung, ein tief gerankter ist eine sichtbare Meinung. |

Die Frage lautet deshalb nicht „ist Art. 22 anwendbar?", sondern **„welche Merkmale verhindern, dass
die Rangliste zum Automatismus wird?"** — und in dieser Form ist sie beantwortbar und im PRD
prüfbar.

### 7.6 Identitätsprüfung bei Betroffenenanfragen

Bewerbende haben in v1 **kein Konto**. Die Frage, wie der Haushalt feststellt, dass eine Anfrage
tatsächlich von der betroffenen Person kommt (Art. 12 Abs. 6), lässt sich trotzdem sauber
beantworten:

> **Default: Antwort über den bereits gespeicherten Kontaktweg** — `contact_email`,
> `contact_phone` oder `contact_other`. **Keine Ausweiskopie.**

**Begründung.** Art. 12 Abs. 6 erlaubt das Anfordern zusätzlicher Angaben nur bei **begründeten
Zweifeln** an der Identität. Wer über die hinterlegte Adresse anfragt und über **dieselbe** Adresse
die Antwort erhält, ist hinreichend identifiziert — der Rückkanal ist die Prüfung.

Eine Ausweiskopie zu verlangen wäre der **umgekehrte Fehler**: eine zusätzliche Erhebung
hochsensibler Daten, um eine Auskunft über weniger sensible Daten zu ermöglichen. Sie wäre selbst
eine unnötige Verarbeitung und würde den Datenbestand vergrößern, den man gerade transparent machen
soll.

**Praktisch:** Der Auskunftsexport wird an die im Datensatz hinterlegte Adresse gesendet, nicht an
eine im Antrag genannte. Weicht die Antragsadresse von der gespeicherten ab, ist das der Fall
„begründeter Zweifel" — dann fragt der Haushalt nach, statt zu antworten.

---

## 8 · Art. 9 — besondere Kategorien im Freitext

### 8.1 Der unvermeidliche Befund

Bewerbungstexte enthalten **unvermeidlich** besondere Kategorien personenbezogener Daten nach
Art. 9 Abs. 1. Nicht, weil jemand danach fragt, sondern weil Menschen so schreiben:

| Formulierung in einer echten Bewerbung | Kategorie nach Art. 9 |
|---|---|
| „Ich bin gerade aus einer Reha zurück" | Gesundheitsdaten |
| „Ich koche halal, hoffe das ist okay" | religiöse Überzeugung |
| „Meine Freundin würde manchmal übernachten" | sexuelle Orientierung |
| „Ich bin vor drei Jahren aus Syrien gekommen" | ethnische Herkunft |
| „Ich engagiere mich bei der Gewerkschaft" | Gewerkschaftszugehörigkeit |

Für diese Verarbeitung gibt es **keine saubere Rechtsgrundlage**. Art. 9 Abs. 2 lit. a (ausdrückliche
Einwilligung) wäre die einzige realistische — sie wird aber nicht eingeholt, und eine
„Einwilligung", die man erteilen muss, um ein Zimmer zu bekommen, wäre kaum freiwillig
(Art. 7 Abs. 4). Deshalb wird sie **nicht versucht**. Der Widerspruch ist real; er lässt sich nicht
auflösen, sondern nur minimieren, und er steht als **Q-4** in
[§13](#13--offene-rechtsfragen-für-die-anwaltliche-prüfung).

### 8.2 Die verteidigbare Default-Position

Der Befund aus §8.1 ist keine Sackgasse. Die Position, die ohne Einwilligungskonstruktion erreichbar
und in der Praxis am belastbarsten ist, lautet:

> **Inzidentelle** Art.-9-Daten in Freitext, die der Verantwortliche **nicht sucht, nicht
> strukturiert erhebt und auf denen er keine Schlussfolgerung aufbaut**, werden anders behandelt als
> eine **zielgerichtete** Verarbeitung besonderer Kategorien.

Entscheidend ist, dass diese Position hier nicht bloß behauptet, sondern **architektonisch gestützt**
wird — durch **P-5**: Sobald man Attribute aus einem Text *ableitet*, ist man unstreitig in Art. 9.
Genau das Ableiten ist in Flatmate.io **verboten und maschinell gesperrt**
(`GUARDRAILS.md` G-L1). Die Behauptung „wir werten das nicht aus" ist damit keine Absichtserklärung,
sondern eine Eigenschaft des Systems.

Zusammen mit den drei übrigen Bausteinen — **keine Strukturfelder** (G-F3), **knappe Frist**
(180 Tage) und **UI-Hinweis samt Verwerfen-Möglichkeit an der Erfassungsstelle** — ergibt das die
stärkste Haltung, die hier ohne Einwilligung erreichbar ist. Sie beseitigt Q-4 nicht; sie macht die
Antwort darauf verteidigbar.

### 8.3 Fünf Folgen für das Produkt

1. **Keine einladenden Strukturfelder.** Es gibt in Flatmate.io **kein** Feld für Nationalität,
   Religion, Gesundheit, Familienstand oder sexuelle Orientierung — auch nicht als optionalen
   „Steckbrief". Ein strukturiertes Feld macht aus einem Zufallsbefund eine systematische
   Verarbeitung und wäre der Punkt, an dem aus einem Restrisiko ein Vorsatz wird.
2. **Keine KI-Bewertung.** Ein Modell, das Freitext bewertet, bewertet zwangsläufig auch die darin
   enthaltenen Art.-9-Merkmale — und zwar unsichtbar. Das ist der zweite tragende Grund für **P-5**
   ([§9](#9--ai-act-einordnung-und-p-5)), unabhängig vom AI Act.
3. **Strenge Aufbewahrung.** Die 180-Tage-Frist wirkt hier am stärksten; `Application.message_raw`
   ist der riskanteste Datensatz im System.
4. **UI-Hinweis an der Erfassungsstelle.** Beim Einfügen einer Nachricht in den Paste-Parser weist
   die App darauf hin, dass sensible Angaben nicht übernommen werden müssen. Der Hinweis richtet
   sich an die erfassende bewohnende Person — sie ist die einzige, die an dieser Stelle noch
   eingreifen kann.
5. **Absätze verwerfen, bevor gespeichert wird.** Im Paste-Parser-Schritt kann der Haushalt einzelne
   Absätze der Rohnachricht **verwerfen** („diesen Absatz nicht übernehmen"), bevor
   `Application.message_raw` entsteht. Das ist der wirksamste Hebel im ganzen Abschnitt, weil er die
   Exposition **an der Quelle** senkt statt sie nachträglich zu verwalten — und der
   Erfassungsmoment ist die einzige Stelle, an der das ohne Zusatzaufwand geht: Der Text liegt
   ohnehin gerade vor Augen, und es ist noch nichts gespeichert. Jeder spätere Zeitpunkt wäre eine
   eigene Aufräumaufgabe, die niemand erledigt.
   *Die Oberflächenseite dieses Hebels gehört ins PRD.*

### 8.4 Was bewusst nicht getan wird

**Keine automatische Erkennung und Schwärzung von Art.-9-Merkmalen.** Sie würde bedeuten, dass die
App genau diese Kategorien systematisch klassifiziert — also die Verarbeitung ausweitet, um sie zu
begrenzen. Der Weg ist Datenminimierung durch Gestaltung, nicht Erkennung.

---

## 9 · AI-Act-Einordnung und P-5

### 9.1 Rechtslage

Das **Hochrisiko-Regime der KI-Verordnung ist seit dem 02.08.2026 in Kraft**. **Anhang III**
erfasst unter anderem KI-Systeme für den **Zugang zu wesentlichen privaten und öffentlichen
Diensten und Leistungen**. Wohnungsbezogene Entscheidungen und Mieter-Screening werden in diese
Richtung eingeordnet; **Profiling bleibt auch unter den engen Ausnahmen hochrisikobehaftet**.

Eine KI, die Wohnungsbewerbende bewertet, rankt oder empfiehlt, ist damit ein
**Hochrisiko-Kandidat** — mit Konformitätsbewertung, Risikomanagementsystem, Daten-Governance,
technischer Dokumentation, Protokollierung, menschlicher Aufsicht und Registrierung.

### 9.2 Entscheidung: Das Minenfeld wird nicht betreten

> Diese Anforderungen sind für ein spendenfinanziertes Nebenprojekt nicht erfüllbar — und selbst
> mit Ressourcen wäre die Antwort dieselbe. **Der Nutzer hat entschieden: Flatmate.io setzt keine
> KI zur Bewertung von Personen ein, dauerhaft und ohne Ausnahmeklausel.**

### 9.3 P-5 als Architekturgrenze

> ### P-5 — Keine KI in wohnungsbezogenen Entscheidungen
>
> **KI erzeugt in Flatmate.io niemals Bewertungen, Rankings, Empfehlungen oder Entscheidungen über
> Personen.** Zulässig ist ausschließlich **strukturierende Textverarbeitung** — Zusammenfassen,
> Extrahieren von Zeitfenstern, Zuordnen zu vorhandenen Feldern. Ziel ist ausdrücklich, außerhalb
> der Hochrisiko-Einordnung nach Anhang III zu bleiben.

Das ist **keine Roadmap-Notiz, sondern eine dauerhafte Architekturgrenze**. Sie ist in
`GUARDRAILS.md` als nicht verhandelbare Zeile geführt (G-L).

**Die Trennlinie, operationalisiert:**

| Erlaubt (strukturierend) | Verboten (bewertend) |
|---|---|
| „Extrahiere aus diesem Text Name, Alter, Kontakt" | „Wie gut passt diese Person zur WG?" |
| „Wandle ‚dienstags ab 16' in ein Zeitfenster" | „Sortiere diese Bewerbungen nach Eignung" |
| „Fasse diesen langen Text auf drei Sätze zusammen" | „Fasse zusammen, was für und gegen diese Person spricht" |
| „Prüfe, ob dieser Text eine Telefonnummer enthält" | „Erkenne Warnsignale in dieser Bewerbung" |

Die Grenze ist nicht „welches Modell", sondern **„erzeugt die Ausgabe eine Aussage über die Eignung
oder die Eigenschaften einer Person?"**. Zusammenfassen ist genau dann noch erlaubt, wenn es
**nichts hinzufügt** — es darf verkürzen, nicht werten.

### 9.4 Einordnung der geplanten Verfahren

| Verfahren | Phase | KI? | Einordnung |
|---|---|---|---|
| **Regelbasierter Paste-Parser** (Name, Alter, Kontakt aus Nachricht) | v1 | **nein** | Keine KI im Sinne der Verordnung — deterministische Heuristik, menschlich bestätigt. Null Rechtsrisiko unter dem AI Act. |
| **Regelbasierter Freitext→Zeitfenster-Parser** („Di 16-19", „nur abends") | v1 | **nein** | wie oben; Vorschlag **immer** bestätigungspflichtig (P-3), nie stillschweigend übernommen |
| **CP-SAT-Solver** (`ortools`, ADR-005) für Terminvorschläge | v1 | **nein** | Constraint-Programmierung, kein maschinelles Lernen. Er ordnet **Termine** zu, nicht Personen zueinander, und trifft keine Auswahlentscheidung. Erklärbarkeit ist Pflicht-Feature (P-3). |
| **Leichtgewichtiges KI-Parsing** unstrukturierter Bewerbungstexte | erwogen für v2 | **ja** | Zulässig **nur** unter beiden Bedingungen aus [§9.5](#95-bedingungen-für-ki-parsing-ab-v2) |
| Jede Form von KI-Ranking, KI-Empfehlung, KI-Vorauswahl | — | — | **dauerhaft ausgeschlossen** |

### 9.5 Bedingungen für KI-Parsing ab v2

Sollte regelbasiertes Parsing an unstrukturierten Texten scheitern — was realistisch ist, weil
strukturierte Eingabe Bewohnenden nicht immer zuzumuten ist — gilt für ein leichtgewichtiges
KI-Parsing:

1. **Datenschutz:** Der Eingabetext bleibt personenbezogen und enthält mit hoher Wahrscheinlichkeit
   Art.-9-Daten ([§8](#8--art-9--besondere-kategorien-im-freitext)). Erforderlich sind daher
   **Verarbeitung in der EU** und ein **AVV mit dem Modellanbieter**, der als
   Unterauftragsverarbeiter in die AVV-Kette aufgenommen und den Haushalten offengelegt wird. Kein
   Training auf den Eingabedaten.
2. **Funktionsgrenze:** Die Ausgabe ist strikt auf **Extraktion in vorhandene Felder** begrenzt —
   kein freier Text, keine Zusammenfassung mit Wertung, keine zusätzlichen Felder. Technisch
   erzwungen durch ein festes Ausgabeschema, dessen Felder mit dem Formular identisch sind.
   Menschliche Bestätigung bleibt Pflicht.

Beides zusammen hält das Verfahren unter P-5 und außerhalb Anhang III. **Fehlt eine der beiden
Bedingungen, findet das Feature nicht statt** — auch nicht „vorläufig zum Ausprobieren".
`GUARDRAILS.md` (G-L2) macht daraus eine Regel für implementierende Agenten.

Für den MVP genügt ausdrücklich nicht-KI-basiertes Parsing.

---

## 10 · § 25 TDDDG, Cookies und der verworfene Duplikatsschutz

### 10.1 Login-Session-Cookie: einwilligungsfrei

§ 25 Abs. 2 Nr. 2 TDDDG nimmt Speicher- und Zugriffsvorgänge aus, die **unbedingt erforderlich**
sind, damit ein vom Nutzer ausdrücklich gewünschter Dienst bereitgestellt werden kann. Das
Session-Cookie einer passwortgeschützten Anwendung fällt darunter. **Kein Cookie-Banner nötig.**

### 10.2 Kein Tracking

Flatmate.io setzt **keine** Analyse-, Marketing- oder Drittanbieter-Cookies. Damit entfällt die
Einwilligungspflicht vollständig — und mit ihr das Banner, das nachweislich niemand liest. Die
Produktmetriken aus SRD §6 werden serverseitig und aggregiert erhoben.

### 10.3 Duplikatsschutz: strukturell statt technisch

**Geräte-Fingerprinting wurde verworfen.** Es ist ein Zugriff auf Informationen in der Endeinrichtung
und nach § 25 Abs. 1 TDDDG **einwilligungspflichtig** — eine Einwilligung, die man einholen müsste,
um jemanden am Betrügen zu hindern, den man dabei fragen muss. Praktisch unbrauchbar.

**Ersatz — strukturelle Kontrolle statt technischer Erkennung:**

| Mechanismus | Wirkung |
|---|---|
| Bewohnerliste für **alle** sichtbar | Ein zusätzliches Profil fällt auf |
| Beitritte erscheinen im **`ActivityEvent`-Feed** | Der Zeitpunkt ist nachvollziehbar |
| **Quorum-Anzeige gegen die Bewohnerzahl** („5 von 7 haben abgestimmt") | Ein Profil zu viel verschiebt den Nenner sichtbar |
| **Jedes Mitglied** kann Profile entfernen | Korrektur ohne Moderationsnadelöhr |

Auch der **Magic-Link-Ansatz wurde verworfen** — nicht gerätegebunden, muss gespeichert werden und
löst das Problem nicht.

> **Ehrlich benannt:** Das ist keine technische Absicherung, sondern soziale Sichtbarkeit. In einer
> WG, die sich kennt, ist das angemessen; es ist ausdrücklich **keine Härtung** und darf in keinem
> Dokument als solche dargestellt werden. Dasselbe gilt für die Trennung zwischen Haushalts-Account
> und Bewohner-Profil: Sie dient der **Klarheit**, nicht der Sicherheit — wer E-Mail und Passwort
> des Haushalts-Accounts kennt, kann sich dort anmelden.

### 10.4 Service Worker und PWA

| Vorgang | § 25 TDDDG | Begründung |
|---|---|---|
| **Caching der App-Hülle** — Markup, Skripte, Stile, Icons, Schriften | **einwilligungsfrei** (Abs. 2 Nr. 2) | Für die Bereitstellung der ausdrücklich gewünschten, von der Person **selbst installierten** Anwendung (P-2) unbedingt erforderlich |
| **Caching von Bewerber- oder Beratungsdaten** | — | **findet nicht statt** — und zwar nicht aus TDDDG-Gründen, sondern weil es das Löschkonzept unterlaufen würde ([§5.8](#58-grenze-des-löschkonzepts-das-gerät)) |
| **Push-Subscription** (Web Push, v1) | **nicht** einwilligungsfrei | Sie ist kein für den Kernzweck erforderlicher Zugriff. Der Browser fragt ohnehin — aber der **Zweck muss vorher erklärt werden**, statt den Systemdialog ungefragt auszulösen. Zusätzlich der dokumentierte iOS-Vorbehalt: nur für zur Startseite hinzugefügte PWAs |

Die beiden ersten Zeilen tragen dieselbe Entscheidung aus zwei Richtungen: Die App-Hülle darf
gecacht werden **und** die Daten dürfen es nicht. Dass beides zusammenfällt, ist günstig — es
bedeutet, dass die datenschutzfreundliche Variante auch die rechtlich unproblematische ist.

Die Reihenfolge ist damit für v1 verbindlich festgelegt und deckt sich mit dem PWA-Install-Hinweis
aus SRD **S-45**: Der Hinweis erklärt den Zweck („direkt benachrichtigt werden, wenn sich etwas in
der WG tut"), **bevor** der native Push-Berechtigungsdialog des Betriebssystems ausgelöst wird —
nicht umgekehrt. Ein `PushSubscription`-Datensatz entsteht ausschließlich nach dieser Erklärung und
der aktiven Zustimmung im Systemdialog, nie vorab und nie stillschweigend.

### 10.5 Die Ausnahme: Offline-Puffer für abgegebene Stimmen

Der Offline-Puffer für Stimmabgaben ist eine **benannte, begrenzte Ausnahme** von der Regel aus
§10.4 — und zwar die einzige.

| | |
|---|---|
| **Vorgang** | Speichern der Nutzlast einer bereits ausgelösten Stimmabgabe im Gerätespeicher, bis der Versand gelingt |
| **§ 25 TDDDG** | **einwilligungsfrei nach Abs. 2 Nr. 2** |
| **Begründung** | Der Puffer ist eine **noch nicht abgeschlossene Transaktion, keine gespeicherte Kopie**. Er hält die Nutzlast einer Handlung, die die Person **selbst ausgelöst** hat und die noch läuft. Damit ist er für den ausdrücklich gewünschten Dienst nicht nur nützlich, sondern **erforderlich** — ohne ihn geht eine konkret angeforderte Aktion verloren. |
| **Verhältnis zur App-Hülle** | Die Erforderlichkeit ist hier **stärker** als beim Caching der App-Hülle: Dort geht ohne Cache nur Startgeschwindigkeit verloren, hier eine Handlung. |
| **Grenzen** | die sechs Zusicherungen aus [§5.8](#58-grenze-des-löschkonzepts-das-gerät), durchgesetzt durch `GUARDRAILS.md` G-B7 |

> **Nicht mit dieser Ausnahme begründbar** ist das Puffern von Notizen, Vetos, Bewerbungsentwürfen
> oder gar ganzen Bewerberkarten „für später". Der Unterschied liegt nicht in der Datenart, sondern
> im **Zustand**: Eine laufende Transaktion endet, eine Zwischenablage nicht. Wer die Ausnahme auf
> weitere Fälle ausdehnen will, muss zeigen, dass der Puffer den Versand **nicht überleben kann** —
> und nicht bloß, dass er es normalerweise nicht tut.

---

## 11 · TOM-Skizze

Technische und organisatorische Maßnahmen nach Art. 32 DSGVO, zugleich Anlage zur AVV. Skizze — die
Umsetzung wird beim Repo-Aufsetzen konkretisiert und in `GUARDRAILS.md` maschinell verankert.

### 11.1 Vertraulichkeit — Zugriffskontrolle

| Maßnahme | Umsetzung | Verankerung |
|---|---|---|
| Mandantentrennung | `household_id` in jeder personenbezogenen Tabelle | ADR-004 |
| **Autorisierung zweifach erzwungen** | zentrale Policy-Objekte **plus** Postgres Row-Level-Security | ADR-004, `GUARDRAILS.md` G-C |
| Selbst-Redaktions-Invariante | Prädikat `became_resident_id == aktuelles Profil` → unsichtbar, dauerhaft; DB-seitig via RLS **und** Unit-Test | `GUARDRAILS.md` G-D1 |
| Rundensichtbarkeit | Zugriff nur bei `RoundParticipation` | ADR-004 |
| Sofortiger Entzug bei `moved_out` | Zugriff auf alle Runden entzogen; Stimmen bleiben erhalten, markiert als „ehemaliges Mitglied" | — |
| Feingranulare Rechte | `Membership.permissions[]` statt Rollenhierarchie | — |
| Benachrichtigungen | unterliegen derselben Sichtbarkeitspolicy wie die Oberfläche | [§6.5](#65-kontexte-notifications-und-audit) |

### 11.2 Vertraulichkeit — Authentifizierung

| Maßnahme | Umsetzung |
|---|---|
| Passwort-Hashing | speicherharter Algorithmus (Argon2id oder bcrypt), Parameter dokumentiert |
| Passkeys | optional, jederzeit abschaltbar (P-2: Passwort bleibt universell) |
| Session-Handling | HttpOnly, Secure, SameSite; serverseitige Invalidierung; Abmeldung fremder Geräte |
| E-Mail-Verifikation | nachgelagert, blockiert die erste Abstimmung nicht — **aber keine sensiblen Inhalte per Mail vor Verifikation**, und Verifikation vor Benachrichtigungsversand |
| **Beitrittscode `Household.join_code`** | Drei überprüfbare Zusicherungen, keine Empfehlungen: **(1) rotierbar** durch die organisierende Person — die Rotation entwertet ausstehende Einladungen; **(2) niemals in Logs, auch nicht in Zugriffslogs** — der Einladungslink trägt den Code im Pfad, deshalb braucht **genau diese Route Pfad-Redaktion im Zugriffslog**; **(3) niemals in einem Query-String**. Durchgesetzt durch `GUARDRAILS.md` **G-A5**. |
| Ratenbegrenzung | Anmeldung, Passwort-Reset, Beitrittscode, Token-Link |

### 11.3 Integrität

| Maßnahme | Umsetzung |
|---|---|
| Verschlüsselung im Transport | TLS, HSTS |
| Verschlüsselung im Ruhezustand | Festplattenverschlüsselung; Backups verschlüsselt |
| Nachvollziehbarkeit | append-only `ActivityEvent`-Log (ADR-003), Account **und** handelndes Profil |
| Zustandsintegrität | explizite Zustandsmaschine statt Boolean-Flags, Übergänge in einer Tabelle deklariert (ADR-002) |
| Reversibilität (P-4) | Rückwärtsübergänge erlaubt **und auditiert** |
| Regel-Sperre | Änderung des Abstimmungsverfahrens während einer laufenden Runde blockiert bzw. laut protokolliert |
| Eingabevalidierung | am Kontextrand; reiner Domänenkern ohne DB-Zugriff |

### 11.4 Verfügbarkeit und Belastbarkeit

| Maßnahme | Umsetzung |
|---|---|
| Backups | regelmäßig, verschlüsselt, **Wiederherstellung getestet** |
| Löschung wirkt in Backups | Backup-Aufbewahrung ≤ 30 Tage, damit gelöschte Daten nach spätestens 30 Tagen auch dort verschwinden |
| Solver-Isolation | `ortools` als lokaler Kindprozess, kein Netzwerk-Hop; Daten verlassen den Host nicht (ADR-005) |
| Ausfallverhalten | Solver-Ausfall degradiert auf manuelle Terminlegung — kein Totalausfall der Terminfindung (P-1) |

> ⚠️ TBD — zu ergänzen: Backup-Aufbewahrungsdauer und Wiederherstellungsziele (RPO/RTO) sind
> Vorschlag, nicht entschieden.

### 11.5 Organisatorische Maßnahmen

| Maßnahme | Umsetzung |
|---|---|
| Datenschutz durch Technikgestaltung (Art. 25) | `data-inventory.yml` als **CI-Gate** (ADR-010) — eine nicht deklarierte personenbezogene Spalte bricht den Build |
| Datenminimierung | keine Strukturfelder für Art.-9-Kategorien ([§8.2](#83-fünf-folgen-für-das-produkt)); Absätze der Rohnachricht vor dem Speichern verwerfbar |
| Verletzungsmeldung | Flatmate.io meldet **unverzüglich an den `Household`** (Art. 33 Abs. 2); dieser meldet an die Aufsichtsbehörde. Prozess und Kontaktweg in der AVV. |
| Weisungsbindung | Betroffenenanfragen werden **weitergeleitet, nicht beantwortet** ([§7](#7--betroffenenrechte--flüsse-art-15161720)) |
| Zugriff durch den Betreiber | Produktionszugriff nur für Betrieb und Fehlerbehebung, protokolliert |
| Regeln für implementierende Agenten | `GUARDRAILS.md`, maschinell durchgesetzt wo möglich |

### 11.6 Datenschutz-Folgenabschätzung nach Art. 35

Die ehrliche Einordnung lautet: **ratsam, nicht eindeutig verpflichtend** — weder „erforderlich"
noch „entbehrlich".

| Dafür spricht | Dagegen spricht |
|---|---|
| Bewertung von Personen (`Vote`, `Veto`, `CastingNote`, Score) | Die Bewertung ist **nicht automatisiert** — Menschen stimmen ab, und **P-5** verbietet KI-Bewertung dauerhaft ([§9](#9--ai-act-einordnung-und-p-5)) |
| Art.-9-Daten im Freitext ([§8](#8--art-9--besondere-kategorien-im-freitext)) | Die Art.-9-Verarbeitung ist **inzidentell und nicht umfangreich** — keine Strukturfelder, keine Auswertung, keine Ableitung |
| Entscheidung über den Zugang zu **Wohnraum** | Keine **systematische Überwachung**; Umfang je Haushalt gering, Verarbeitung schubweise und kurz |

**Empfehlung: die DSFA freiwillig durchführen.** Drei Gründe, die nichts mit Vorsicht zu tun haben:

1. Sie ist **günstig** — der Datenbestand ist klein, die Zwecke sind wenige, und
   [§6](#6--datenkategorien--vorlage-für-das-art-30-verzeichnis) liefert bereits den Hauptteil des
   Materials.
2. Sie **entschärft Q-1 bis Q-4 gleich mit**, weil sie dieselben Fragen strukturiert stellt und die
   Antworten dokumentiert.
3. Sie ist ein **vorzeigbares Artefakt** — für eine anwaltliche Prüfung, für eine
   Aufsichtsbehörde und für den Nachweis, dass die Fragen vor dem Launch gestellt wurden.

Der Prüfauftrag bleibt als **Q-9** in
[§13](#13--offene-rechtsfragen-für-die-anwaltliche-prüfung) stehen — die freiwillige Durchführung
ersetzt die Klärung nicht, sie kostet nur weniger als sie.

---

## 12 · Vermieter-Szenario

Der Vermieter-Fall — ein Objekt registrieren, kein Bewohner-Profil anlegen, Bewohnende treten per
Code bei und stimmen ab — **fällt architektonisch kostenlos heraus**. Rechtlich tut er das nicht.
Er verschiebt die Lage in **drei** Punkten erheblich.

### 12.1 Haushaltsausnahme: klar nicht anwendbar

Für gewerbliche oder mehrfach Vermietende ist Art. 2 Abs. 2 lit. c ohne Zweifel geschlossen. Was in
[§1.1](#11-greift-die-haushaltsausnahme) noch eine Wahrscheinlichkeitsaussage war, wird hier zur
Gewissheit. Zusätzlich trifft den Vermietenden die **Pflicht zum Verarbeitungsverzeichnis nach
Art. 30** in eigener Person.

### 12.2 AGG § 19 Abs. 5 greift nicht mehr

| | WG-Zimmer | Vermieter mit mehreren Wohneinheiten |
|---|---|---|
| **§ 19 Abs. 5 AGG** | besonderes **Nähe- und Vertrauensverhältnis** → weitgehend ausgenommen | **greift nicht** |
| **Diskriminierungsverbot** | weitgehend ausgenommen | **gilt voll** |
| **Folge für Ablehnungen** | frei begründbar | begründungssensibel; Notizen und Vetos können zu **Beweismitteln** in einem AGG-Verfahren werden |

Damit ändert sich die Bedeutung derselben Daten: Eine `CastingNote`, die in einer WG eine private
Meinung ist, wird beim gewerblichen Vermieter potenziell zum Nachweis einer Benachteiligung. Das
verschärft alles, was [§2](#2--die-trennlinie-küchentisch-vs-system) und
[§8](#8--art-9--besondere-kategorien-im-freitext) über Notizen und Freitext sagen.

### 12.3 Der AI Act rückt näher

Ein Ranking-Werkzeug in **gewerblicher Hand**, angewandt auf den Zugang zu Wohnraum, rückt deutlich
näher an Anhang III als dieselbe Funktion in einer WG. **P-5 ist damit im Vermieter-Fall nicht nur
Vorsicht, sondern Voraussetzung** — jede KI-Bewertungsfunktion würde hier mit hoher
Wahrscheinlichkeit zum Hochrisiko-System.

### 12.4 Ergebnis und die unbequeme Pointe

- **Architektonisch offengehalten** — der Fall funktioniert technisch bereits.
- **In v1 nicht positioniert.** Keine Vermarktung, keine Vermieter-Persona, keine Preisstufe.
- **Vor Aktivierung: eigene Prüfung** — AGG-Konformität, AI-Act-Einordnung, eigenes
  Art.-30-Verzeichnis, angepasste AVV, ggf. DSFA.

> **Die Pointe, die man nicht überlesen sollte:** Genau diese Stufe soll **monetarisiert** werden
> (Freemium für Vermieter mit mehreren Wohnungen; für Bewohnende bleibt Flatmate.io dauerhaft
> kostenlos). Das heißt: **Die zahlende Stufe finanziert die Compliance, die sie auslöst.** Das ist
> keine Ironie, sondern eine Planungsanweisung — die Vermieter-Stufe darf erst dann angeboten
> werden, wenn ihre rechtliche Prüfung aus ihren eigenen Einnahmen bezahlt ist oder anderweitig
> gesichert wurde. Sie ist kein „Feature-Flag umlegen".

---

## 13 · Offene Rechtsfragen für die anwaltliche Prüfung

> **Verwendung:** Dieser Abschnitt ist als **Auftragsliste an eine Kanzlei** formuliert. Jede Frage
> nennt den Kontext, die hier vertretene Position und das Risiko, wenn sie falsch ist. Die
> Reihenfolge ist nach Auswirkung sortiert: Q-1 bis Q-4 sind **launch-blockierend**.

| # | Frage | Hier vertretene Position | Risiko, wenn falsch |
|---|---|---|---|
| **Q-1** | Trägt die **Rollenkonstruktion** — `Household` als Verantwortlicher, Flatmate.io als Auftragsverarbeiter für Bewerberdaten und zugleich eigener Verantwortlicher für Plattformdaten? Oder liegt eine **gemeinsame Verantwortlichkeit** (Art. 26) vor, weil Flatmate.io die Mittel — Skala, Score-Formel, Fristen — weitgehend vorgibt? | Getrennte Rollen nach Datenbestand ([§1.2](#12-wer-ist-verantwortlicher-wer-auftragsverarbeiter)) | **Hoch.** Bei Art. 26 wären eine Vereinbarung über gemeinsame Verantwortlichkeit, eine gemeinsame Transparenzinformation und geteilte Haftung nötig. Die AVV wäre das falsche Instrument. |
| **Q-2** | Ist die **Verneinung der Haushaltsausnahme** für den einzelnen Haushalt richtig — und wenn ja, ist einem privaten WG-Haushalt die volle Verantwortlichenrolle (Art. 30, Art. 13, Betroffenenrechte) überhaupt zumutbar? | Ausnahme trägt nicht; Pflichten werden durch Produktgestaltung tragbar gemacht ([§1.1](#11-greift-die-haushaltsausnahme)) | **Hoch.** Bei Bejahung der Ausnahme entfällt ein Großteil der Konstruktion. Bei Verneinung *und* Unzumutbarkeit entsteht eine Pflicht, die niemand erfüllt. |
| **Q-3** | Genügt eine **Click-Through-AVV** den Anforderungen von Art. 28 Abs. 3 und Abs. 9 (Textform)? | ja, versioniert und protokolliert ([§1.3](#13-was-daraus-folgt)) | **Hoch.** Ohne wirksame AVV ist jede Verarbeitung im Auftrag rechtswidrig. |
| **Q-4** | Trägt die Behandlung **inzidenteller Art.-9-Daten im Freitext** als von einer zielgerichteten Verarbeitung verschieden? Genügen Minimierung durch Gestaltung, das architektonische Ableitungsverbot (P-5) und die kurze Frist — oder wäre ausdrückliche Einwilligung erforderlich, und wäre sie angesichts Art. 7 Abs. 4 überhaupt freiwillig? | Inzidentelle Daten, die **nicht gesucht, nicht strukturiert erhoben und nicht ausgewertet** werden, sind anders zu behandeln; gestützt durch P-5, G-F3, 180 Tage und den Verwerfen-Hebel. **Keine Einwilligung** — sie wäre nicht freiwillig ([§8.2](#82-die-verteidigbare-default-position)) | **Hoch.** Betrifft `Application.message_raw`, `Application.decision_note`, `Application.rejection_reason`, `CastingNote.body` und `Veto.reason` — also den Kern des Produkts. |
| **Q-5** | Sind **180 Tage** als Aufbewahrungsfrist für WG-Bewerberdaten haltbar, obwohl der Anker (§ 15 Abs. 4 AGG, § 61b Abs. 1 ArbGG) aus dem **Arbeitsrecht** stammt und WG-Zimmer über § 19 Abs. 5 AGG weitgehend ausgenommen sind? Wäre eine kürzere Frist richtiger? | 180 Tage als begründeter Default, Verkürzung auf 30/90 möglich ([§5.2](#52-die-frist-und-ihre-begründung)) | **Mittel.** Eine zu lange Frist verstößt gegen Art. 5 Abs. 1 lit. e; die Korrektur ist ein Konfigurationswert, kein Umbau. |
| **Q-6** | Hält die **Tombstone-Konstruktion** für das append-only `ActivityEvent`-Log dem Löschanspruch aus Art. 17 stand? | ja, weil nur Referenzen und keine Inhalte gespeichert werden ([§5.6](#56-konflikt-löschung-vs-rechenschaftspflicht)) | **Mittel.** Bei Verneinung müsste das Log löschfähig gemacht werden — Eingriff in ADR-003. |
| **Q-7** | Trägt **Art. 15 Abs. 4** den Schutz der **Urheberschaft** von Stimmen, Vetos und Notizen — auch dann, wenn die Gruppe so klein ist, dass sich die Urheberschaft aus dem Kontext erschließen lässt? | Inhalt ja, Identität nein; keine behauptete Anonymität ([§3.2](#32-die-zwei-grenzen--und-was-sie-nicht-leisten)) | **Mittel.** Bei Verneinung müssten Urheber im Auskunftsexport genannt werden — mit erheblichen sozialen Folgen. |
| **Q-8** | *(Bestätigungsfrage, keine offene Frage.)* **Art. 22** wird verneint, weil die Eingabe **menschliches Urteil** ist — der Score zählt abgegebene Stimmen zusammen, statt Merkmale abzuleiten. Bitte bestätigen, dass diese Abgrenzung trägt. | verneint ([§7.5](#75-nicht-ausgeführt-aber-zu-kennen)); die dahinterliegende Gummistempel-Sorge ist als **Designfrage** beantwortet ([§7.5.1](#751-die-berechtigte-sorge-dahinter--und-warum-sie-eine-designfrage-ist)) | **Niedrig.** Bei abweichender Auffassung wären zusätzliche Informationspflichten und ein Recht auf menschliches Eingreifen nötig — beides nachrüstbar, ohne die Architektur zu berühren. |
| **Q-9** | Ist eine **Datenschutz-Folgenabschätzung** nach Art. 35 erforderlich? **Dafür spricht:** Bewertung von Personen, Art.-9-Daten im Freitext, Entscheidung über den Zugang zu Wohnraum. **Dagegen spricht:** Die Bewertung ist **nicht automatisiert** (Menschen stimmen ab, P-5 verbietet KI-Bewertung), die Art.-9-Verarbeitung ist inzidentell und nicht umfangreich, systematische Überwachung findet nicht statt. | **„Ratsam, nicht eindeutig verpflichtend."** Empfehlung: **freiwillig durchführen** — sie ist günstig, entschärft Q-1 bis Q-4 gleich mit und ist ein vorzeigbares Artefakt ([§11.6](#116-datenschutz-folgenabschätzung-nach-art-35)) | **Mittel.** Eine unterlassene, aber erforderliche DSFA ist selbst bußgeldbewehrt — und die freiwillige Durchführung kostet weniger als die Klärung der Frage. |
| **Q-10** | Wo verläuft die Grenze zwischen **Kontoebene** (Flatmate.io verantwortlich) und **Beratungsebene** (`Household` verantwortlich) bei Bewohnerdaten? | Aufteilung nach [§1.4](#14-der-unscharfe-rand-bewohnerdaten) | **Mittel.** Betrifft die Frage, wer eine Auskunftsanfrage eines *Bewohnenden* beantwortet. |
| **Q-11** | Ist die Verarbeitung von Bewerberdaten durch den Haushalt auf **Art. 6 Abs. 1 lit. b** (vorvertragliche Maßnahme auf Anfrage der Person) oder auf **lit. f** (berechtigtes Interesse) zu stützen — und wie ist die Interessenabwägung für `Vote`, `Veto` und `CastingNote` zu dokumentieren? | lit. b für Stammdaten, lit. f für Beratungsartefakte ([§6](#6--datenkategorien--vorlage-für-das-art-30-verzeichnis)) | **Niedrig bis mittel.** Betrifft die Dokumentation, nicht die Zulässigkeit; eine fehlende Abwägungsdokumentation ist aber ein eigener Verstoß. |
| **Q-12** | Ist der **Service Worker** der PWA nach § 25 Abs. 2 Nr. 2 TDDDG einwilligungsfrei? | ja, weil für die ausdrücklich gewünschte installierbare Anwendung erforderlich ([§10.2](#102-kein-tracking)) | **Niedrig.** Notfalls Banner — was man vermeiden möchte. |
| **Q-13** | Welche zusätzlichen Pflichten löst die **Vermieter-Stufe** aus (AGG, AI Act, eigenes Art.-30-Verzeichnis, angepasste AVV, DSFA)? | vollständige Neuprüfung vor Aktivierung ([§12](#12--vermieter-szenario)) | **Aufgeschoben.** Blockiert v1 nicht, blockiert die Monetarisierung. |
| **Q-14** | Ist eine **Duplikaterkennung über Bewerberdaten** (Ähnlichkeit von Name, E-Mail, Telefonnummer) zulässig, um die Lücke aus [§3.4](#34-lücke-die-selbst-redaktion-schützt-nur-verknüpfte-bewerbungen) zu schließen — und wenn nein, wie wird sie **prozessual** geschlossen? | **Kein automatisches Zusammenführen.** Die App schlägt beim Setzen von `became_resident_id` ähnliche ältere Bewerbungen vor und lässt einen Menschen bestätigen | **Hoch für die betroffene Person, niedrig für das Projekt.** Bleibt die Lücke offen, kann eine eingezogene Person Beratungsinhalte über sich selbst aus einer älteren, unverknüpften Bewerbung lesen — genau die Verletzung, gegen die V-1 gebaut wurde. Die Ähnlichkeitsprüfung ist ihrerseits eine eigene Verarbeitung mit eigener Rechtsgrundlage und erzeugt falsch-positive Verknüpfungen zweier verschiedener Personen. |

---

## 14 · Quellen

Alle abgerufen am **2026-08-19**. Übernommen aus der Quellenliste des `00-Session-Brief.md`.

**DSGVO — Haushaltsausnahme und Rollen**
- Die Haushaltsausnahme der DSGVO — https://www.dr-datenschutz.de/die-haushaltsausnahme-der-dsgvo/
- DSGVO-Anwendbarkeit auch bei privaten Vermietenden — https://www.datenschutzticker.de/2021/11/auch-bei-einem-privater-vermieter-kann-der-anwendungsbereich-der-dsgvo-eroeffnet-sein/
- Art.-30-Verzeichnis — Pflicht auch für Vermieter — https://www.mieterlink.de/blog/verarbeitungsverzeichnis-nach-art-30-dsgvo-pflicht-auch-fuer-vermieter

**DSGVO — Art. 15 und interne Notizen**
- BFH: Auskunftsrecht erfasst interne Vermerke und Stellungnahmen — https://www.stollfuss.de/blog/BFH-Auskunftsrecht-nach-Art.-15-DSGVO-Einsicht-in-interne-Vermerke-und-Stellungnahmen-2025-05-12
- BGH: Auskunftsanspruch kann Informationen aus internen Vorgängen umfassen — https://www.rechtssicher.info/bgh-auskunftsanspruch-gem-art-15-dsgvo-kann-auch-informationen-aus-internen-vorgaengen-umfassen
- Auskunftsanspruch auch bei Gesprächsnotizen und Telefonvermerken — https://arbeitsrechtanwalt.de/auskunftsanspruch-art-15-eu-dsgvo-auch-gespraechsnotizen-telefonvermerke/
- Reichweite und Grenzen des Auskunftsrechts (Infobrief Uni Würzburg) — https://www.jura.uni-wuerzburg.de/fileadmin/0200-ma-netze-direkt/Infoblatt/Infobrief_Art._15_DSGVO.pdf

**DSGVO — Art. 13/14 und Auftragsverarbeiter**
- Informationspflicht bei indirekter Datenerhebung; Art. 14 gilt nicht für Auftragsverarbeiter — https://www.ratgeberrecht.eu/aktuell/informationspflicht-bei-indirekter-datenerhebung-art-14-dsgvo/
- Transparenz im Bewerbungsverfahren — https://www.datenschutz-praxis.de/betroffenenrechte/transparenz-im-bewerbungsverfahren/
- Art. 14 DSGVO im Volltext — https://dejure.org/gesetze/DSGVO/14.html

**DSGVO — Speicherbegrenzung und Löschfristen**
- Grundsatz der Speicherbegrenzung — https://www.dr-datenschutz.de/dsgvo-grundsatz-der-speicherbegrenzung/
- Bewerberdaten: Aufbewahrung und Löschung, AGG-abgeleiteter 6-Monats-Richtwert — https://www.externer-datenschutzbeauftragter-hamburg.de/blog/bewerberdaten-dsgvo-aufbewahrung-loeschung/
- Aufbewahrungsfrist für Bewerbungen — https://www.dr-datenschutz.de/aufbewahrungsfrist-wann-sind-bewerbungen-zu-loeschen/

**EU AI Act**
- Anhang III — Pflichten, Anwendungsbereich, Fristen — https://www.regulation-ai.eu/en/annex-iii/
- Die acht Hochrisiko-Kategorien des Anhangs III — https://casrai.org/dictionary/term/eu-ai-act-annex-iii-high-risk-use-cases
- Hochrisiko-KI-Systeme, Definitionen und Anforderungen — https://www.dpo-consulting.com/blog/high-risk-ai-systems

---

> **Änderungshistorie**
>
> | Version | Datum | Änderung |
> |---|---|---|
> | V0.1 | 2026-08-19 | Erstfassung auf Basis von `00-Session-Brief.md`, Abschnitt „Regulatorik — geprüfte Fassung". Übernimmt die vier im Verlauf der Session **korrigierten** Befunde: Rollenverteilung, Art. 15 erfasst Notizen, Art. 13 statt Art. 14 im Regelfall, Löschgrund Art. 5 Abs. 1 lit. e statt Art. 15. |
> | V0.6 | 2026-08-19 | Präzisierung ohne neue Regeln: Zusicherung 6 des Stimmpuffers ist auf **Art. 5 Abs. 1 lit. d** (Richtigkeit) und den daraus folgenden **Art.-16**-Berichtigungsanspruch zurückgeführt, statt nur als „falsches Datum" benannt zu werden. |
> | V0.5 | 2026-08-19 | Nachtrag zum Offline-Puffer für abgegebene Stimmen. **§5.8** um die eine benannte Ausnahme von der Service-Worker-Regel erweitert, **§10.5 neu** mit der TDDDG-Einordnung. Tragende Begründung ist der **Transaktionszustand** (noch nicht abgeschlossene Handlung), ausdrücklich **nicht** „kein fremdes Datum betroffen" — ein `Vote` ist eine Beurteilung über eine dritte Person. Sechs Zusicherungen, davon zwei hier ergänzt: Leeren beim **Profilwechsel** und **idempotente Wiedereinspielung**. Guardrails **G-B7** und **G-D11**. |
> | V0.4 | 2026-08-19 | Dritte Querprüfungsrunde. **§5.7 neu** (Löschung ist atomar — die Gegendarstellung `subject_statement` erbt die Frist der `Application` und stirbt in derselben Transaktion, weil sie sonst den Inhalt der gelöschten Beurteilung rekonstruierbar macht), **§5.8 neu** (Grenze des Löschkonzepts: das Gerät), **§10.4 neu** (Service Worker und PWA unter § 25 TDDDG). **§7.5 umformuliert:** Art. 22 greift nicht, weil die Eingabe menschliches Urteil ist; die dahinterliegende Gummistempel-Sorge ist in **§7.5.1** als Designfrage mit vier prüfbaren Merkmalen beantwortet. Q-8 von offener Frage auf Bestätigungsfrage herabgestuft. Guardrails **G-B6** und **G-E5** ergänzt. |
> | V0.3 | 2026-08-19 | Zweite Querprüfungsrunde. `moved_out_at` → **`moved_out_on`**, `moved_in_on` ergänzt. **§6.0** als Brücke zwischen der Empfindlichkeits-Klassifizierung 🔴/🟠/⚫/⚙️ aus `04` und den Zweck-Kategorien dieses Dokuments — damit die Gegenprobe „jedes 🔴/🟠/⚫-Feld hat eine Zeile" prüfbar bleibt. **§4.5** um die Freigabepflicht der Datenschutzseite erweitert (`draft` → `published` als Handlung des Verantwortlichen, nicht als Nebeneffekt; Guardrail G-C9). **§4.6 neu** mit zwei entschiedenen Auslegungen: Aufsichtsbehörde wird nicht benannt (Art. 13 Abs. 2 lit. d verlangt nur das Bestehen des Beschwerderechts), und die Kontaktangabe ist die Haushalts-E-Mail statt einer Postanschrift. Damit sind die letzten beiden inhaltlichen TBDs geschlossen. |
> | V0.2 | 2026-08-19 | Querprüfung gegen `04-Domaenenmodell.md`. Feldnamen an die Schema-Autorität angeglichen, 18 Felder nachgetragen. **Neu:** §3.4 (Lücke der Selbst-Redaktion bei unverknüpften Wiederbewerbungen), §4.4 (`source` und `collected_from` als zwei Achsen), §4.5 (Wortlaut des Copy-Paste-Hinweises), §7.6 (Identitätsprüfung über den gespeicherten Kontaktweg), §8.2 (verteidigbare Default-Position zu Art. 9), Q-14. **Entschieden statt offengehalten:** Veto-Begründung wird offengelegt (§3.2), „archivieren" ist nie eine Fristverlängerung (§5.5), Solver-Eingaben werden nicht protokolliert (§6.4), Produktmetriken aggregiert (§6.5), DSFA ratsam und freiwillig durchzuführen (§11.6). §5.6 um die Payload-Redaktion und das `vote.cast`-Leck erweitert. |
