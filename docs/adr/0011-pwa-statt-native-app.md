> **Status:** Vorschlag — anfechtbar
> **Quelle:** `../05-ADRs.md` §ADR-011 (Stand V0.8, eingefroren 2026-09-09)
> **Nummer:** ADR-011 — dauerhaft. Nummern werden nie neu vergeben.

## ADR-011 — PWA statt native App

### Kontext

**P-2 Geräteneutralität** und die Nutzungsrealität: fünf bis zehn Personen, die das Tool in der
Regel als Haushalt informell gewählt haben — eine organisierende Person schlägt es vor, der Rest
stimmt vorher zumindest stillschweigend zu —, mobile Nutzung in Schüben von zwei bis drei Wochen,
mehrmals pro Jahr. Zwei Funktionen wollen „App-Nähe": **Benachrichtigungen** (Beteiligungsanreiz —
Kernmetrik) und ein **Icon auf dem Startbildschirm** (Wiedereinstieg ohne URL).

### Betrachtete Optionen

| Option | Vorteil | Nachteil | Bewertung |
|---|---|---|---|
| **Installierbare PWA in v1** ✅ | Kein App-Store, kein Review, kein Entwicklerkonto, keine zwei Codebasen. Installierbar auf iOS und Android. Aktualisierung ohne Nutzeraktion | Web Push auf iOS **nur** für zur Startseite hinzugefügte PWAs; keine echten Hintergrundprozesse | **Gewählt** |
| Native Apps (iOS + Android) | beste Benachrichtigungen, App-Store-Auffindbarkeit | Zwei zusätzliche Codebasen, zwei Review-Prozesse, Entwicklerkonten mit laufenden Kosten. Für ein spendenfinanziertes Solo-Projekt unverhältnismäßig — **und** eine Installationshürde für Menschen, die das Tool nicht wollten | Verworfen |
| Cross-Platform (React Native, Flutter) | eine Codebasel für beide | Trotzdem App-Stores, Reviews, Konten. Und geteilte Logik mit dem Web ist bei diesem Datenmodell mehr Versprechen als Praxis | Verworfen |
| Reine Website ohne PWA | einfachste Umsetzung | Kein Icon, kein Web Push, kein Offline-Verhalten. Verschenkt den Beteiligungsanreiz | Verworfen |

### Entscheidung

**Installierbare PWA in v1**, kein App-Store. **Web Push ist in v1 der primäre
Benachrichtigungskanal** — getragen von einer **verbindlichen Installationsführung** (SRD **S-45**):
ein sichtbarer, beharrlicher Dashboard-Hinweis, der **nach dem Beitritt** erscheint (nicht davor —
sonst würde er die Registrierungshürde wiederholen, die ADR-007 gerade abbaut) und zur Installation
auf den Startbildschirm sowie zur Aktivierung von Push anleitet.

**E-Mail ist der Fallback-Kanal**, nicht der Standardkanal: für Bewohnende, die (noch) keine PWA
installiert oder Push (noch) nicht aktiviert haben. Der **iOS-Vorbehalt bleibt unverändert
bestehen** — Web Push funktioniert dort weiterhin nur für PWAs, die zur Startseite hinzugefügt
wurden —, aber er ist jetzt keine Endstation mehr: Solange diese Installation nicht erfolgt ist,
greift der E-Mail-Fallback und überbrückt genau die Zeit bis dahin.

Damit dreht sich die Reihenfolge aus früheren Fassungen dieses Records um: **Web Push plus
verbindlicher Installationsführung ist jetzt der verlässliche Pfad, E-Mail der Fallback für die
Übergangszeit** — nicht umgekehrt. Das ist weiterhin die Konsequenz aus P-2, nur mit vertauschten
Rollen: der Kanal, der bei konsequenter Führung fast alle erreicht, trägt die Funktion; E-Mail
fängt die Lücke auf, die vor der Installation entsteht, statt sie offenzulassen.

### Konsequenzen

**Positiv**

- Eine Codebasis, eine Auslieferung, keine Store-Abhängigkeit.
- Aktualisierungen erreichen alle sofort — bei einem Produkt mit Sichtbarkeitsinvarianten ein
  Sicherheitsvorteil: eine gepatchte Lücke ist wirklich gepatcht, nicht „in Version 2.3 verfügbar".
- Kein Nutzender muss etwas installieren, um teilzunehmen.

**Negativ**

- **Der iOS-Vorbehalt ist eine echte Einschränkung**, und sie trifft die Kernmetrik: wer die PWA
  nicht zur Startseite hinzufügt, bekommt kein Push. Der Beteiligungsanreiz hängt damit auf iOS an
  einem Nutzerschritt, den viele nicht kennen — die Installationsführung (S-45) mildert das, ersetzt
  ihn aber nicht: Sie kann zur Installation anleiten, sie nicht erzwingen. Genau dafür fängt der
  **E-Mail-Fallback** die Lücke auf, statt sie offenzulassen — wer ohne installierte PWA sonst gar
  keinen asynchronen Kanal hätte, bekommt jetzt E-Mail statt nichts. Der E-Mail-Fallback muss deshalb
  **gut** sein, nicht nur vorhanden — nicht weil er der Standardkanal ist, sondern weil er für die
  Übergangszeit die einzige Brücke ist.
- **„Zur Startseite hinzufügen" ist ein erklärungsbedürftiger Schritt** — ein Onboarding-Hinweis, der
  auf jedem Gerät anders aussieht.
- **Keine Auffindbarkeit über App-Stores.** Für ein Non-Profit ohne Marketing ein realer
  Wachstumsnachteil.
- **Offline-Verhalten muss man selbst bauen** — und es fällt schmaler aus, als eine PWA könnte: die
  Bedingung unten verbietet Daten auf dem Gerät, mit **einer** benannten Ausnahme (Stimmen-Puffer).
  Offline heißt hier „die App startet und eine Stimme geht nicht verloren", nicht „die Runde ist ohne
  Netz benutzbar".

**Die entscheidende Konsequenz, ausdrücklich als Bedingung und nicht als Verfeinerung**
(ergänzt in V0.3, aufgeworfen beim Prüfen von § 25 TDDDG — im Session-Brief nicht vorhanden):

> **Eine PWA, die Daten offline vorhält, unterläuft das Löschkonzept — lautlos.**
>
> Ein Service Worker, der Bewerberdaten cacht, legt personenbezogene Daten auf die Geräte der
> Bewohnenden. Dort **erreicht sie kein serverseitiger Löschjob.** Die 180-Tage-Automatik
> (`04-Domaenenmodell.md` §7) läuft weiter grün durch, während dieselben Daten auf fünf bis zehn
> Telefonen liegenbleiben. Kein Test schlägt fehl, kein Log zeigt etwas — deshalb ist das gefährlicher
> als ein offener Fehler.
>
> **Entscheidung: der Service Worker cacht ausschließlich die App-Hülle** — Markup, Skripte, Stile,
> Icons, Manifest — **und niemals Bewerber- oder Beratungsdaten.**
>
> **Offline heißt „die App startet ohne Netz", nicht „die Daten sind ohne Netz da."** Das ist eine
> bewusste Verschlechterung des Offline-Erlebnisses gegenüber dem, was technisch möglich wäre.
>
> Ohne diese Bedingung ist ADR-011 gegen das Löschkonzept **nicht vertretbar** — sie ist deshalb Teil
> des Records und nicht ein Implementierungsdetail.
>
> **Der wahrscheinliche Fehler ist keine Entscheidung, sondern eine Konfigurationszeile:** ein
> großzügiger Runtime-Cache, der API-Antworten „für die Performance" mitnimmt. Niemand beschließt das,
> es entsteht aus einem kopierten Rezept. Für `GUARDRAILS.md` als prüfbare Zusicherung: die
> Service-Worker-Konfiguration **listet die cachebaren Pfade positiv auf** und enthält keine Regel, die
> auf API-Routen passt; ein Test prüft, dass eine API-Antwort nach dem Laden nicht im Cache liegt.
>
> Dieselbe Logik wie bei ADR-003: ein Nebenpfad, der die Hauptregel umgeht, ist kein Randfall, sondern
> der Ort, an dem die Regel zuerst bricht.

**Die einzige Ausnahme von dieser Bedingung — benannt, begrenzt und bezahlt:**

> **Ein Offline-Puffer für abgegebene Stimmen.**
>
> Er ist notwendig, nicht bequem: abgestimmt wird auf dem Sofa und in der Bahn, nicht am Schreibtisch,
> und ein verlorener Stimmabgabe-Versuch trifft unmittelbar die **Kernmetrik Beteiligungsquote**. Ohne
> eine ausdrücklich benannte Ausnahme wäre er an der Bedingung oben kommentarlos gestorben — und das
> wäre die falsche Art, eine Regel zu befolgen.
>
> **Die Begründung ist nicht die naheliegende, und der Unterschied ist wichtig.** Naheliegend wäre:
> „eine eigene Stimme betrifft kein fremdes Datum". Das ist **falsch** — ein `Vote` ist
> `application_id` plus Wert und damit eine **Beurteilung über eine dritte Person**, also ⚫, also
> genau die Datenklasse, die die Bedingung von den Geräten fernhalten soll.
>
> Die tragfähige Begründung ist eine andere: der Puffer hält eine **noch nicht abgeschlossene
> Transaktion, keine gespeicherte Kopie.** Er trägt die Nutzlast einer Handlung, die die Person selbst
> ausgelöst hat und die noch läuft. § 25 Abs. 2 Nr. 2 TDDDG deckt das **stärker** als das Caching der
> App-Hülle, nicht schwächer. Und das Löschregime bleibt unberührt, weil der Puffer den Versand nicht
> überleben **kann**.
>
> **Damit „kann nicht" eine erzwungene Eigenschaft ist und keine Erwartung, hängen sechs Zusicherungen
> daran. Sie sind der Preis der Ausnahme, nicht ihre Verzierung:**
>
> | # | Zusicherung | Warum |
> |---|---|---|
> | 1 | **Harte Höchstlebensdauer unabhängig vom Versanderfolg** (Vorschlag **7 Tage**), danach Verwerfen | **Die tragende.** Ein Gerät, das offline geht und Monate später zurückkommt, trüge sonst eine Beurteilung über eine Bewerbung, deren Daten serverseitig längst gelöscht sind — genau das Leck, das die Bedingung schließen sollte, nur durch die Hintertür |
> | 2 | **Keine Anzeigedaten im Puffer** — ausschließlich `application_id`, Wert, Rundenstufe | Sobald Name, Bewerbungstext oder Score mitwandern, ist der Puffer eine Datenkopie und die Ausnahme trägt nicht mehr |
> | 3 | **Verwerfen statt Wiederholen** bei serverseitiger Ablehnung | Eine abgelehnte Stimme (Runde geschlossen, Teilnahme entzogen, Regel-Sperre) darf nicht in einer Wiederholungsschleife auf dem Gerät weiterleben. Die Person bekommt eine Meldung, nicht der Puffer einen zweiten Versuch |
> | 4 | **Leeren bei Abmeldung und bei Sitzungsentzug** | `Session.revoked_at` und „überall abmelden" müssen das Gerät wirklich leeren — sonst ist der Entzug nur serverseitig wirksam |
> | 5 | **Leeren auch beim Profilwechsel** — nicht nur bei der Abmeldung | Der Wechsel zwischen Verwaltungs- und Bewohnerkontext ist **keine** Abmeldung: die `Session` bleibt, nur `acting_profile_id` ändert sich. Ein Puffer, der das überlebt, lässt Profil B die Stimmen von Profil A versenden. **Derselbe Fehlertyp, gegen den V-1 am Account und nicht am aktiven Profil hängt** — nur eine Schicht tiefer |
> | 6 | **Idempotente Wiedereinspielung** über einen Schlüssel `(application_id, profile_id, stage)`, nicht Anfügen | Ein Duplikat verschiebt Score **und** Quorum-Nenner. Das ist kein Zählfehler, sondern ein **falsches Datum über eine Person** — und es taucht in einer Auskunft nach Art. 15 genauso auf wie ein richtiges |
>
> **Der Profilwechsel ist damit zweimal die Stelle gewesen, an der eine Annahme bricht** — bei V-1
> (§5.1 im Domänenmodell) und hier. Das ist kein Zufall: es ist der einzige Vorgang im Produkt, der
> die handelnde Identität ändert, ohne die Sitzung zu beenden. Jede Regel, die „pro angemeldeter
> Person" gedacht ist, gehört gegen ihn geprüft.
>
> **Warum das überhaupt aufgeschrieben wird, statt es dem Implementieren zu überlassen:** eine
> unbenannte Ausnahme wird entweder **gar nicht** gebaut — dann verliert das Produkt Stimmen und
> niemand weiß warum — oder sie wird **großzügig** gebaut, weil ein Offline-Puffer ohne Anzeigedaten
> unbequem ist und die Versuchung groß, „nur den Namen" mitzunehmen. Beide Fehler entstehen aus dem
> Schweigen, nicht aus einer Entscheidung.
>
> Es bleibt bei **genau dieser einen** Ausnahme. Jede weitere ist ein neuer ADR, kein Analogieschluss.

> **Das gibt man auf, wenn** die Beteiligungsquote messbar an fehlenden Push-Benachrichtigungen
> hängt — konkret: wenn iOS-Nutzende systematisch weniger abstimmen als Android-Nutzende. Dann wird
> eine native Hülle um die PWA (nur für Push) die kleinste wirksame Antwort, nicht eine echte
> native App.

**Status: Vorschlag — anfechtbar**

---
