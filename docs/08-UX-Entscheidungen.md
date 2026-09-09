# 08 — UX-Entscheidungen: Flatmate.io

> **Version:** V0.1
> **Datum:** 2026-09-09
> **Autor:** Samuel Zink (@SmokeyRGB)
> **Vorgänger:** UX/UI-Plan vom 2026-09-02 (Stand V5), Abschnitt „Entschieden"
> **Nachfolger:** keiner — dieses Dokument ist die Heimat der U-Nummern, nicht eine Zwischenstufe

> **Zweck.** Die Entscheidungen **U-1 bis U-26** werden aus 13 Dokumenten der Kette rund
> 144-mal zitiert, existierten aber ausschließlich in einer Planungsdatei **außerhalb dieses
> Repositoriums** — auf einem einzigen Rechner, nicht unter Versionskontrolle. Damit war jede
> dieser 144 Verweise nach einer Übergabe nicht mehr auflösbar. Dieses Dokument beendet das:
> die U-Nummern haben hier ihren einen verbindlichen Ort.

> **Herkunft.** Übernommen am 2026-09-09 aus dem vom Nutzer genehmigten UX/UI-Plan vom
> 2026-09-02 (Stand V5), Abschnitt „Entschieden". Der Plan liegt außerhalb dieses
> Repositoriums und ist deshalb hier absichtlich nicht als Dateiverweis notiert.
> Der Wortlaut ist **unverändert**; ergänzt sind ausschließlich die Spalte „Bemerkung" und
> die Abschnitte darunter. Der Plan selbst wird nicht mit diesem Dokument synchronisiert —
> er ist die eingefrorene Quelle, dieses Dokument die gepflegte Fassung.

> **Nummernregel.** **Nummern bleiben.** `U-7` heißt dauerhaft `U-7`; eine Nummer wird nie neu
> vergeben, auch nicht nach einem Widerruf. Dieselbe Regel gilt für ADR-Nummern
> (`05-ADRs.md`, Aufteilungsregel 1) und für die Scope-Zeilen (`02-SRD.md` §5.3).

> **Verhältnis zur Kette.** **U-7** legt fest, dass die UX-Schicht `02-SRD.md`, `03-PRD.md` und
> `04-Domaenenmodell.md` **korrigieren darf** und diese nachgezogen werden. Wo eine
> U-Entscheidung einer älteren Fassung dieser drei Dokumente widerspricht, gilt die
> U-Entscheidung — und das ältere Dokument ist zu korrigieren, nicht umgekehrt.

> **Sprachregelung.** Dokument deutsch, alle Bezeichner englisch (ADR-012).

---

## 1. Die Entscheidungen U-1 bis U-26

Die Klammerverweise `(K-n)` benennen den Kommentar aus der Review-Runde, der die jeweilige
Entscheidung ausgelöst hat. Sie sind Teil des Originalwortlauts und bleiben stehen.

| # | Entscheidung | Bemerkung |
|---|---|---|
| **U-1** | **Aufgaben-first.** Start = Aufgabenliste mit **genau einem** primären CTA | S-48 |
| **U-2** | **2 Tabs + Kopfzeile mit zwei Elementen.** Untere Leiste: *Start · Casting*. Kopfzeile: Glocke · Avatar *(K-6)* | `03-PRD.md` §4.1.0 |
| **U-3** | „Seit deinem letzten Besuch" zeigt **nur bewohnerrelevante Ergebnisse** (bestätigter Termin, „X zieht ein"), **nicht** das Aktivitätsprotokoll | S-27 |
| **U-4** | Das vollständige `ActivityEvent`-Log liegt im **Activity Center** — Unterpunkt „Alle Aktivitäten" des Benachrichtigungszentrums | S-27; Oberfläche in v0.2 |
| **U-5** | **Eigener Moderationsmodus**, Bewohner-Ansicht für alle identisch. Zugang über **Avatar-Menü** („In Moderation wechseln") oder **CTA aus der Benachrichtigung**. Anstehende Orga-Aufgaben erscheinen im Bewohner-Dashboard als **eine** Brückenzeile *(K-6)* | S-02 |
| **U-6** | **Eine Fläche „Organisation"** — Moderation und Verwaltung verschmelzen. Abschnitte nach Rechten; die drei Account-exklusiven Dinge in einem Abschnitt „Haushalt" | `07-Screen-Inventar.md` §4 |
| **U-7** | Screen-Inventar **darf korrigieren**; `02-SRD`, `03-PRD` und `04-Domaenenmodell` werden nachgezogen | Vorrangregel, siehe Kopf |
| **U-8** | Deliverable: **nur** `07-Screen-Inventar.md` — kein Mockup | erledigt |
| **U-9** | **Sortierung nach Zeitdruck**, nicht nach fester Rangliste *(K-3)* | S-48; Rechenmodell `04-Domaenenmodell.md` §8.7 |
| **U-10** | **Kein Feinschliff-Bildschirm.** Zweiter Durchlauf im Kartenmuster *(K-1)* | S-47; v0.2 |
| **U-11** | **Beitritt ohne E-Mail** — Name + Passwort. „Angemeldet bleiben" vorbelegt *(K-9)* — **inzwischen Spec: S-03** | S-03; Sitzungsdauer 90 Tage (O-13) |
| **U-12** | **Einladungslink:** Warnhinweis beim Teilen, Ablauf, Nutzungsgrenze *(K-2)* — **weiterhin offen**, und dringlicher denn je | **geschlossen** als S-49; Vorbelegung O-15 |
| **U-13** | **Kein eigener Zustand für Redigiertes** — es existiert nicht, mit einer benannten Ausnahme *(K-7)* | V-1 |
| **U-14** | **Organisationsaufwand senken ist ein Ziel, keine Nettigkeit** — mit Metrik hinterlegt *(K-8)* | `02-SRD.md` §6 |
| **U-15** | **Ein** Einstellungs-Bildschirm mit Abschnitten statt mehrerer Einzelbildschirme *(K-10)* | Screen E1 |
| **U-16** | Bewohnerliste bleibt — aber mit ausgeschriebenem Zweck und Einstieg über den Beteiligungsstand *(K-11)* | **überholt durch U-22** — die für Bewohnende sichtbare Liste entfällt |
| **U-17** | Wortlaut darf **werbend über den Prozess** sprechen, nie wertend über die Person *(K-12)* | Inhaltsregel C-10, `03-PRD.md` §4.6.1 |
| **U-18** | Die Rundenfrist (S-44) liefert das Datum für Abstimmungsaufgaben und wird **nie ohne ihre Phase** angezeigt | S-44; v0.2 |
| **U-19** | Der PWA-Install-Hinweis ist **ein eigenes Band, keine Aufgabe** — sichtbar und wiederkehrend, aber nie auf dem CTA-Platz. **Das Domänenmodell ist an dieser Stelle zu korrigieren**, nicht nur das Inventar | S-45; v0.2 |
| **U-20** | **Verwaltung erreicht keine Castings.** Ohne `ResidentProfile` nur Haushaltsverwaltung; Ausnahmen: Aufbewahrung und Datenauskunft-Export | S-50; zweite Kommentarrunde |
| **U-21** | Sichtbare Abschnitte richten sich **allein nach `role`/`permissions`**, nie danach, ob `acting_profile_id` `null` ist | wird geschützter Test (`review-log.md` §Durchgang 3) |
| **U-22** | **Zwei getrennte Listen:** Teilnehmendenliste (alle Bewohnenden, nur Namen) und Bewohnerliste (Verwaltung voll, Moderator lesend, Residents gar nicht) | S-05; kippt U-16 und zwei der vier Duplikatsschutz-Mechanismen |
| **U-23** | **Anwesenheit wird angenommen, nicht erfasst.** `attended` startet auf `true`; Bewohnende sagen selbst ab, die Moderation korrigiert nur Ausnahmen | S-51; `AppointmentAttendance` (O-7); zweite Kommentarrunde |
| **U-24** | **UI-Sprache für junge Menschen ohne Vorwissen** — kein Fachwort ohne Übersetzung („Quorum" → „genug Stimmen") | Übersetzungstabelle `07-Screen-Inventar.md` §8.6 |
| **U-25** | Keine Aussage über eine **Eignung** von Kandidaten — nur über Schwellen, die es tatsächlich gibt | P-5 |
| **U-26** | Der Passwort-Reset durch die Verwaltung ist ein **bewusster, dokumentierter Tauschhandel**, der endet, sobald ein Bewohner eine eigene E-Mail hinterlegt | O-16 |

---

## 2. Zwei Entscheidungen, die eine frühere Festlegung gekippt haben

Der Plan hält im Kopf fest, dass die zweite Kommentarrunde zwei Punkte umgestoßen hat. Das ist
hier wiederholt, weil beide Folgen im Datenmodell haben und ein Leser sonst die ältere Fassung
für die aktuelle hält:

- **U-20** — die Verwaltung verliert den Zugriff auf Castings. Vorher durfte sie hinein.
- **U-23** — die Anwesenheit wird angenommen statt erfasst. Vorher wurde sie erfasst.

**U-22 kippt zusätzlich U-16**, ohne dass der Plan das im Kopf vermerkt: U-16 wollte die für
Bewohnende sichtbare Bewohnerliste behalten, U-22 nimmt sie ihnen wieder. Beide Zeilen bleiben
stehen — U-16 ist nicht falsch gewesen, sondern überholt, und die Begründung des Wechsels ist
der wertvollere Teil.

**Warum das mehr ist als Buchhaltung:** Mit U-22 tragen von den ursprünglich vier Mechanismen
des strukturellen Duplikatsschutzes nur noch zwei — Beitritte im `ActivityEvent`-Feed und das
Quorum gegen die Bewohnerzahl. Damit ist die Absicherung des Einladungslinks (**S-49**, aus
U-12) nicht mehr Ergänzung, sondern **Voraussetzung** dieses Schutzes. Der Zusammenhang steht
ausführlich in `02-SRD.md` §5.3 bei S-05 und S-49.

---

## 3. Offene Punkte

Keine. Alle 26 Entscheidungen sind entschieden — das war der Zweck des Abschnitts „Entschieden"
im Plan. Zwei tragen einen Nachtrag:

- **U-12** war im Plan als „weiterhin offen" markiert. Sie ist seither als **S-49** in den Scope
  aufgenommen und mit **O-15** vorbelegt (Ablauf 7 Tage, Nutzungsgrenze = Zahl fehlender
  Bewohnender). Die Zeile ist geschlossen.
- **U-16** ist durch **U-22** überholt (§2).

Offene Punkte der UX-Schicht, die *nicht* U-Nummern sind, stehen im Register in `review-log.md`.

---

## 4. Verweise

| Ziel | Wofür |
|---|---|
| `07-Screen-Inventar.md` | die Umsetzung dieser Entscheidungen als 41 Bildschirme; §13 führt die Abweichungen gegen die übrige Kette |
| `02-SRD.md` §5.3 | die Scope-Zeilen, in die U-11, U-12, U-20, U-22 und U-23 eingegangen sind |
| `03-PRD.md` §4.1.0 | Navigations- und Layoutmodell aus U-1, U-2, U-5 |
| `04-Domaenenmodell.md` | `AppointmentAttendance` (U-23) und die von U-19 verlangte Korrektur |
| `review-log.md` | Register der offenen Punkte; Durchgang 3 verweist mehrfach auf U-Nummern |
