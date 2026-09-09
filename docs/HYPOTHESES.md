# HYPOTHESES — 21 unbelegte Annahmen und ihre Prüfsperre

> **Status:** V1.0 · 2026-09-09 · Samuel Zink (@SmokeyRGB)
> **Quelle:** `_logs/Product-Audit-Hypotheses.md` (V0.5, 2026-08-31) — dort steht je Hypothese
> ein vierstufiger Testblock, eine Bewertungstabelle und eine empfohlene Prüfreihenfolge. Diese
> Datei ist die **gepflegte Kurzfassung**; die Langfassung ist eingefroren.
> **Alle 21 sind unbelegt.** Das ist kein Rückstand, sondern der Stand: neunzehn von ihnen lassen
> sich **vor** der ersten Produktionszeile widerlegen.

---

## Die Sperre — der wichtigste Satz dieser Datei

Der Audit hält fest, dass **Solver, Kalender, Veto, Benachrichtigungen und PWA** — zusammen
*„zwischen einem Drittel und der Hälfte des v1-Aufwands"* — **nicht gebaut werden sollten, bevor
die Prüfung berichtet.** Jedes dieser fünf Features dient einer Annahme, die niemand belegt hat.

> ⚠️ **Auslöser umgehängt am 2026-09-09.** Der Audit machte diese Sperre von einer
> **Concierge-Runde** abhängig. Die entfällt voraussichtlich: die Prototypen stehen früher, und
> eine begleitete WhatsApp-Runde wird zeitlich unlogisch. **Die Sperre hängt jetzt an der
> Prototypen-Erhebung.**
>
> Das ist kein Formalismus. Eine Sperre ohne Auslöser ist keine Sperre — sie hätte lautlos
> aufgehört zu gelten, und genau die fünf teuersten Features hätten ihren Halt verloren.

Der Phasenschnitt in `02-SRD.md` §5.4 setzt vier der fünf ohnehin nach v0.2 oder v1.1. Die Sperre
ist damit **kein Widerspruch** zum Schnitt, sondern seine Begründung von der anderen Seite.

---

## Die 21 Annahmen

`K` = Kritikalität · `S` = Sicherheit (wie gut belegt) · `W` = Wichtigkeit.
**Stumm** = eine falsche Annahme erzeugt keinen Fehler, sondern nur ausbleibende Nutzung — die
gefährlichere Sorte, weil niemand sie meldet.

### Attraktivität — wollen Menschen das benutzen?

| ID | Annahme | K/S/W | Anmerkung |
|---|---|:--:|---|
| **H-D1** | Über 80 % stimmen ab, obwohl die WG dem Werkzeug nur informell zugenickt hat | H/niedrig/H | Die **Produktthese selbst**. Hängt direkt an Risiko R-02 |
| **H-D2** | Echte Notizen und Vetos landen im System, nicht im Gruppenchat | H/niedrig/H | **stumm** |
| **H-D3** | Es **ersetzt** Werkzeuge, statt ein fünftes zu werden | M/niedrig/H | — |
| **H-D4** | Wer nach Monaten zurückkommt, stimmt in unter 2 Minuten ab | H/niedrig/M | **stumm** |
| **H-D5** | Verborgene Ergebnisse motivieren, ohne Durchklick-Stimmen zu erzeugen | M/niedrig/M | **stumm.** Trägt S-14 — bewusst als Einstellung gebaut, nicht fest verdrahtet, damit sie gegen sich selbst messbar ist |
| **H-D6** | Bewerbende akzeptieren, sichtbar verarbeitet zu werden | M/niedrig/M | **stumm** |
| **H-D7** | Zeit und mentale Last der organisierenden Person sinken | H/niedrig/H | Trägt U-14 |
| **H-D8** | Runden werden schneller, samt Wirkung von S-44 | M/niedrig/M | Braucht einen eigenen Spike; S-44 liegt in v0.2 |

### Machbarkeit — geht das technisch und rechtlich?

| ID | Annahme | K/S/W | Anmerkung |
|---|---|:--:|---|
| **H-F1** | Die Rollenkonstruktion hält (Auftragsverarbeiter/Verantwortlicher) | H/mittel/H | **= `Q-1` bis `Q-4`.** Braucht eine Anwaltskanzlei, nicht einen Test. Launch-blockierend |
| **H-F2** | Eine Person schafft 41 Scope-Zeilen, und die Guardrails halten | H/niedrig/H | Der Phasenschnitt §5.4 **ist** die Gegenprobe zu dieser Annahme |
| **H-F3** | Der Solver ist deterministisch, erklärbar und schnell genug | M/niedrig/M | Messung offen (`02-SRD.md` O-06). Liegt in v1.1 |
| **H-F4** | Regelbasierte Parser sind gut genug | M/niedrig/M | Liegt in v0.2 |
| **H-F5** | Der Einladungslink verknüpft neue Bewohnende automatisch | M/mittel/H | **stumm.** Wurde im Audit umgeschrieben und hat **S-42** und **G-D12** hervorgebracht |
| **H-F6** | Benachrichtigungen tragen Ereignisse, keine Wertungen | N/hoch/N | In V0.3 korrigiert und herabgestuft. Niedrigste Priorität |

### Tragfähigkeit — lohnt sich das?

| ID | Annahme | K/S/W | Anmerkung |
|---|---|:--:|---|
| **H-V1** | 2–4 Castings je Haushalt und Jahr | H/niedrig/H | — |
| **H-V2** | Die zweite Runde findet wieder in der App statt | H/niedrig/H | **stumm** |
| **H-V3** | Das Geld für den Start ist da | H/niedrig/H | — |
| **H-V4** | Wer nicht zahlen muss, spendet trotzdem etwas | M/niedrig/M | **Trägt die gesamte Erlösgeschichte allein** — und hatte bis 2026-09-09 keinen Termin. Hat S-43 hervorgebracht und O-05 geschlossen |
| **H-V5** | Die Vermieter-Stufe ist wirtschaftlich tragfähig | M/niedrig/M | Vorschaltgate, bevor Geld in `Q-13` fließt |
| **H-V6** | Erreichbar ohne Wachstumsschleife und ohne Budget | H/niedrig/M | — |
| **H-V7** | Der Spendenhinweis wirkt, ohne Schaden anzurichten | M/niedrig/M | Trägt E-23 („Casten ist stressig genug") |

---

## Zwei Befunde, die nicht in der Tabelle stehen

**Die Kernmetrik trägt nicht, was auf ihr ruht.** Das Ziel ist *„über 80 % der Stimmberechtigten
geben mindestens eine Stimme ab"*. In einem Haushalt mit sieben Personen ist **eine Person
14,3 Prozentpunkte**. Eine Prozentangabe suggeriert eine Auflösung, die bei dieser Gruppengröße
nicht existiert. Der Audit empfiehlt, sie unterhalb von etwa 15 Personen **als Anzahl**
auszudrücken — „6 von 7", nicht „86 %".

**H-V4 hat keinen Termin und trägt alles.** Die Bereitschaft zu spenden ist die einzige Grundlage
der Erlösgeschichte, und `02-SRD.md` §11 verschiebt ihre Prüfung auf *„erst nach der
Concierge-Runde"* — eine Runde, die jetzt voraussichtlich entfällt. **Sie hängt damit an der
Prototypen-Erhebung, oder an nichts.**

---

## Wie geprüft wird

Die Baseline-Erhebung (`02-SRD.md` §11, **O-07**) ist in zwei Hälften geteilt:

1. **Rückblickend, heute noch möglich:** Nachrichtenzahl, Tage von der ersten Bewerbung bis zur
   Entscheidung und Zahl der Antwortenden lassen sich aus den Chatverläufen der letzten Runde
   rekonstruieren. Diese Hälfte hängt an keinem Termin — wird aber mit jedem Monat schwerer.
2. **Vorausschauend:** Organisationsaufwand und empfundene Beteiligung brauchen eine laufende
   Runde. Diese Hälfte wandert zu den Prototypen.

**Vorschlag zur Bündelung:** Die Prototypen-Sitzung mit dem Testhaushalt findet ohnehin statt.
Fünf Fragen aus dem H-D- und H-V-Block in dasselbe Gespräch zu legen, kostet nichts und wandelt
den größten unbelegten Block des Repositoriums — statt ihn auf eine Runde zu verschieben, die
nicht mehr geplant ist.

---

## Verweise

| Ziel | Wofür |
|---|---|
| `_logs/Product-Audit-Hypotheses.md` | die Langfassung: Testblöcke, Bewertungstabelle, Prüfreihenfolge. **Eingefroren** |
| `02-SRD.md` §5.4 | der Phasenschnitt, der vier der fünf gesperrten Features ohnehin nach hinten legt |
| `02-SRD.md` §11 | **O-07**, die Baseline-Erhebung |
| `06-Compliance-Anhang.md` §13 | `Q-1`…`Q-4` = **H-F1**, launch-blockierend |
| `review-log.md` §Register | Status aller offenen Punkte, auch dieser Sperre |
