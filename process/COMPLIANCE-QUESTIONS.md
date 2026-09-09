# Anschreiben zur anwaltlichen Prüfung — Flatmate.io

> **Status:** V1.0 · 2026-09-09 · Samuel Zink (@SmokeyRGB)
> **Zweck:** Begleitschreiben. **Die Fragen selbst stehen in
> `../docs/06-Compliance-Anhang.md` §13** und werden hier absichtlich **nicht** wiederholt.

---

## Warum hier keine Fragenliste steht

`06-Compliance-Anhang.md` §13 ist bereits als Auftragsliste an eine Kanzlei formuliert: fünfzehn
Fragen, nach Auswirkung sortiert, jede mit Kontext, der hier vertretenen Position und dem Risiko,
falls sie falsch ist.

Eine zweite Kopie dieser Fragen wäre genau die Fehlerklasse, gegen die dieses Repository seine
Prüfskripte geschrieben hat: eine Liste, die neben dem Original liegt und nach der ersten
Änderung leise davon abweicht. §9 des Domänenmodells ist daran dreimal gescheitert, §7.1 des PRD
einmal. Also: **ein Ort, und dieses Blatt sagt nur, wie er zu lesen ist.**

---

## Was die Kanzlei wissen muss, bevor sie §13 liest

**1. Der Stand ist Planung, nicht Betrieb.** Es existiert kein Code, kein Server und kein
Datensatz. Alle Fragen sind gestellt, *bevor* etwas gebaut wurde — das ist die Absicht, nicht ein
Versäumnis.

**2. Was „launch-blockierend" hier heißt.** `Q-1` bis `Q-4` sind so markiert. Sie blockieren den
**ersten echten Haushalt** — nicht die Implementierung. Die erste Ausbaustufe (v0.1) läuft
ausschließlich auf **synthetischen Daten**; erst der Übergang zu echten Bewerberdaten hängt an
diesen vier Antworten.

**3. Die Positionen in §13 sind Vorschläge, keine Überzeugungen.** Jede Zeile nennt eine „hier
vertretene Position". Sie ist als Angriffsfläche gemeint. Wo eine Position fällt, ist die
Konsequenz in derselben Zeile beziffert — mehrfach ist sie ein Konfigurationswert, nicht ein
Umbau.

**4. Der Kern des Produkts hängt an `Q-4`.** Die Frage betrifft inzidentelle Art.-9-Daten im
Freitext und damit `message_raw`, `decision_note`, `rejection_reason`, `CastingNote.body` und
`Veto.reason` — also die Felder, in denen das Produkt überhaupt stattfindet. Fällt die dort
vertretene Position, ist nicht ein Feld betroffen, sondern das Verfahren.

**5. Eine freiwillige DSFA ist eingeplant.** `Q-9` fragt, ob eine Datenschutz-Folgenabschätzung
nach Art. 35 verpflichtend ist; die Position lautet „ratsam, nicht zweifelsfrei verpflichtend",
mit der Empfehlung, sie **freiwillig** durchzuführen, weil sie `Q-1` bis `Q-4` mitentschärft.

**6. Eine Frage ist für die betroffene Person kritischer als für das Projekt.** `Q-14` — die
Duplikaterkennung über Bewerberdaten. Ohne sie bleibt eine benannte Lücke in der
Selbst-Redaktions-Invariante: eine ältere, nicht verknüpfte Bewerbung derselben Person kann
Beurteilungen über sie enthalten und sie sehen lassen. Das Projekt hat die Lücke prozedural
abgesichert (Pflicht-Rückfragen, eigener Testfall, keine zweite echte Runde vor deren Umsetzung),
aber nicht geschlossen.

---

## Was zusätzlich beiliegen sollte

| Dokument | Warum |
|---|---|
| `../docs/06-Compliance-Anhang.md` | vollständig — §13 ist ohne §1 (Rollenanalyse), §3 (Art. 15), §5 (Löschkonzept) und §8 (Art. 9) nicht beurteilbar |
| `../docs/02-SRD.md` §5.3, §5.4 | was das Produkt tut, und was in der ersten Stufe davon läuft |
| `../docs/domain/personenbezogene-felder.md` | welche Felder personenbezogen sind, nach Klasse |
| `../docs/domain/invarianten.md` | `V-1`…`V-4` — die Sichtbarkeitsregeln, auf denen die Art.-15-Argumentation ruht |
| `../docs/anhaenge/Compliance-Checklist.md` | die eigene Vorprüfung. **Ausdrücklich keine Rechtsberatung** |

---

## Nicht Teil dieses Auftrags

- **`Q-13`** (Vermieter-Stufe) ist **aufgeschoben.** Sie blockiert v1 nicht, sondern die
  Monetarisierung, und sollte erst geprüft werden, wenn Hypothese `H-V5` in
  `../docs/HYPOTHESES.md` überhaupt für tragfähig gehalten wird. Geld für diese Prüfung vor
  H-V5 auszugeben, wäre die falsche Reihenfolge.
- **AGG- und AI-Act-Prüfung der Vermieter-Persona** — gehört zu `Q-13`.
- **Die Wirksamkeit der Sperre gegen KI-Bewertung von Personen** (`P-5`) ist eine
  Architekturentscheidung, keine Rechtsfrage. Sie ist in `../docs/GUARDRAILS.md` G-L als Regel
  hinterlegt; §9 des Compliance-Anhangs ordnet sie AI-Act-seitig ein.
