> **Status:** Bestätigt — verbindlich für v0.1
> **Quelle:** keine — erster Record ohne Vorlage in der eingefrorenen `../05-ADRs.md` (Aufteilungsregel 3: sie wird nicht nachgetragen).
> **Nummer:** ADR-013 — dauerhaft. Nummern werden nie neu vergeben.

## ADR-013 — Zwei Account-Typen, eine feste Identität je Sitzung

### Kontext

Bis hierher konnte **ein** `Account` die handelnde Identität **innerhalb derselben Sitzung**
wechseln. `Session.acting_profile_id = null` heißt Verwaltungskontext, gesetzt heißt
Bewohnerkontext, und dazwischen lag ein Eintrag im Avatar-Menü (`../screens/rahmenwerk.md` §4.2) —
ohne erneute Anmeldung, ohne dass die Sitzung endete. **S-02** hat genau das in den Scope
geschrieben.

Der Wechsel war dabei **nie** eine Sicherheitsgrenze, und das steht auch überall so: die Trennung
Verwaltung/Bewohner dient „ausschließlich der Klarheit" (`../domain/identity.md`, Kasten
„Klarstellung"), der Haushalts-Account ist ein bewusst geteiltes Passwort (ADR-007), und
`acting_profile_id = null` verleiht keine Rechte (**U-21**). Er war eine Bequemlichkeit für den
häufigsten Fall: die organisierende Person wohnt selbst mit.

**Was er darüber hinaus ist, hat die Dokumentationsphase zweimal gezeigt — unabhängig voneinander
und beide Male erst bei einer Querprüfung.** `../GUARDRAILS.md` führt das als eigenen Kasten hinter
G-C7:

1. Die Selbst-Redaktion **V-1** hängt am `Account` und nicht am aktiven Profil — sonst wäre der
   Wechsel der Umweg um die Invariante (ADR-004).
2. Der Offline-Stimmpuffer wird auch **beim Wechsel** geleert und nicht nur bei der Abmeldung
   (G-B7, Zusicherung 5) — sonst versendet der Kontext von Profil B die Stimmen von Profil A.

ADR-011 benennt den gemeinsamen Nenner, und die Formulierung ist die tragende: der Profilwechsel
ist **der einzige Vorgang im Produkt, der die handelnde Identität ändert, ohne die Sitzung zu
beenden.**

Genau daraus folgt die Bilanz, die diesen Record auslöst. Die Antwort auf zwei gefundene Lecks war
bisher eine **Prüffrage** — „Was passiert damit beim Profilwechsel?" —, und sie ist in
`../GUARDRAILS.md` ausdrücklich als 🔴 geführt: **nicht maschinell erzwingbar.** Eine Prüffrage ist
keine geschlossene Fehlerklasse, sondern eine Rechnung, die bei jeder neuen zustandsbehafteten
Komponente erneut fällig wird — Puffer, Caches, Entwürfe, Uploads, Mehrschritt-Formulare,
Idempotenzschlüssel. Zwei Treffer bei zwei Gelegenheiten ist keine beruhigende Quote.

**Der Zeitpunkt ist der halbe Grund.** v0.1 ist nicht gebaut. Der Wechsel existiert heute in
Dokumenten, nicht in Code. Denselben Record in einem Jahr zu schreiben hieße, jede seither gebaute
zustandsbehaftete Komponente erneut gegen eine Frage zu prüfen, die dann niemand mehr stellt.

### Betrachtete Optionen

| Option | Vorteil | Nachteil | Bewertung |
|---|---|---|---|
| **Zwei Account-Typen, eine feste Identität je Sitzung** ✅ | Die Fehlerklasse verschwindet, statt bewacht zu werden: es gibt keinen Vorgang mehr, der die handelnde Identität ohne Sitzungsende ändert. Die Prüffrage verliert ihren Gegenstand, und die 🔴-Position fällt weg, statt dauerhaft geführt zu werden. „Welchen Hut trage ich gerade" ist keine Anzeige mehr, sondern eine Tatsache der Anmeldung | Zwei Passwörter für eine Person, und der Haushalts-Account legt weiter Profile an, die er nie benutzt — der Zustand `prepared` wird die Regel statt der Ausnahme und damit erklärungsbedürftiger | **Gewählt** |
| Wechsel in der Sitzung beibehalten wie heute | **Die einzige Option, die heute nichts kostet.** Kein Dokumentenumbau, keine zweite Anmeldung. **S-02** bleibt wörtlich stehen, das F1-Paket bleibt unangetastet, und der Moderator-Wiederherstellungspfad bleibt trivial. Das Modell ist durchdacht und an zwei Stellen bereits gehärtet | Die zwei Härtungen sind **Reparaturen an Einzelfällen**, keine geschlossene Klasse. Die tragende Absicherung bleibt eine Prüffrage, die ausdrücklich 🔴 ist — sie hält nur, solange jemand sie stellt. Bei AI-gestützter Implementierung ist das dieselbe Annahme, die ADR-004 für die Autorisierung schon einmal ausdrücklich verworfen hat | Verworfen |
| Erneute Anmeldung **nur** beim Betreten der Verwaltung, nicht beim Verlassen | Das klassische `sudo`-Modell, und es ist gut begründet: Reibung genau dort, wo Rechte zunehmen, und **nirgends** auf dem Weg zur Stimmabgabe. Ein Bestätigungsdialog, kein zweites Konto. Der billigste Kompromiss, der zur Debatte stand | **Die Fehlerklasse hängt nicht an Rechten, sondern an Identität.** Beide gefundenen Lecks feuern in der *verlassenden* Richtung: der Stimmpuffer von Profil A überlebt den Weg nach Verwaltung und zurück nach Profil B. Ein Zaun, der nur eine Richtung sichert, lässt genau die Vorgänge durch, die tatsächlich gefunden wurden — und er behält die Bauform „eine Sitzung, zwei Identitäten" vollständig bei | Verworfen — sichert die falsche Richtung |
| Ein Account-Typ, Rechte **ausschließlich** aus `Membership.role` | Weniger Begriffe, und nah an dem, was **U-21** ohnehin feststellt. Kein Typfeld, das mit `Membership` konsistent gehalten werden muss, und der Vermieter-Fall bleibt über `is_resident = false` ausdrückbar | Beantwortet die Frage nicht, die dieser Record stellt: **wer handelt gerade?** Ein Account mit `role = household_admin` **und** einem `ResidentProfile` ist exakt die heutige Lage unter anderem Namen — entweder kehrt der Wechsel als Unterscheidung zurück, oder dieselbe Identität verwaltet und stimmt ab. Letzteres löst **S-01** auf | Verworfen |

### Entscheidung

**Zwei Account-Typen, und die handelnde Identität einer Sitzung steht mit der Anmeldung fest.**

- Ein **Haushalts-Account** verwaltet. Er hat `Membership.is_resident = false`, stimmt nicht ab
  (**S-01**) und **besetzt niemals ein `ResidentProfile`**.
- Ein **Resident-Account** wohnt. Er hat `is_resident = true`, stimmt ab, schreibt Notizen, sagt
  Termine zu — und erreicht die Organisationsfläche weiterhin genau so weit, wie
  `Membership.role`/`.permissions` es hergeben (**U-21**, **U-20**).
- **`Session.acting_profile_id` bleibt als Feld bestehen, wird bei der Anmeldung gesetzt und ist
  danach unveränderlich.** Das ist ausdrücklich kein Abschaffen: ADR-004 füllt `app.account_id` und
  `app.profile_id` pro Request aus dieser Zeile, und diese Mechanik bleibt unangetastet. Was
  wegfällt, ist ausschließlich der **Schreibzugriff während einer laufenden Sitzung**. Ein späteres
  `UPDATE … SET acting_profile_id` ist ein Fehler, kein Feature.
- **Der Wechsel ist ein Abmelden und ein neues Anmelden.** Die Oberfläche nennt das auch so, statt
  ihn als Wechsel zu tarnen. Der Menüpunkt „In Moderation wechseln" entfällt **als Wechsel**; was
  bleibt, ist ein reiner Navigationspunkt auf die Organisationsfläche für Konten, deren
  `role`/`permissions` dort etwas hergeben (`../screens/rahmenwerk.md` §4.1).

**Der Haushalts-Account darf weiterhin ein `ResidentProfile` anlegen** — der Zustand `prepared`
(`../domain/identity.md`) bleibt und trägt genau diesen Fall. Er ist der
**Moderator-Wiederherstellungspfad**: die Verwaltung bleibt handlungsfähig, wenn niemand mit
Bewohner-Account mehr moderieren kann. Sie **legt an, sie besetzt nicht.** Wer das Profil benutzt,
meldet sich mit eigenen Zugangsdaten an; ein administrativer Passwort-Reset auf dieses Profil bleibt
möglich und bleibt sichtbar (`../domain/identity.md`, Kasten „Passwort-Reset").

**Damit „besetzt nicht" eine erzwungene Eigenschaft ist und keine Erwartung**, gehört genau ein Satz
als geschützter Test nach `../GUARDRAILS.md`, nicht als Kommentar:

> **Eine `Session`, deren `account_id` auf eine `Membership` mit `is_resident = false` zeigt, hat
> `acting_profile_id = null` — beim Anlegen und über ihre ganze Lebensdauer.**

**S-02 wird neu gefasst, nicht gestrichen.** Das Anlegen von `ResidentProfile`s bleibt im
v0.1-Schnitt; ersetzt wird der Kontextwechsel, an dessen Stelle die feste Identität je Sitzung tritt.
Die Nummer bleibt, wie jede Nummer in diesem Ordner bleibt.

### Konsequenzen

**Positiv**

- **Eine dokumentierte, wiederkehrende Fehlerklasse verschwindet, statt bewacht zu werden.** Die
  Prüffrage „Was passiert damit beim Profilwechsel?" hat zwei reale Lecks gefunden und war die
  einzige Antwort darauf — 🔴, nicht erzwingbar, und bei jeder neuen zustandsbehafteten Komponente
  erneut fällig. Sie verliert ihren Gegenstand.
- **Der Sitzungskontext ist über die Lebensdauer der Sitzung konstant.** Es gibt kein Zeitfenster
  mehr, in dem eine gepoolte Verbindung mitten im Flug eine geänderte Identität sieht — eine Sorge
  weniger neben G-C8, die nie als Defekt aufgetreten ist, aber denkbar war.
- **Audit und Feed werden eindeutig.** Ein Eintrag, der Account *und* handelndes Profil nennt, kann
  innerhalb einer Sitzung nicht mehr zwei verschiedene Profile tragen.
- **Die Oberfläche muss nicht mehr erklären, welcher Hut gerade aufsitzt.** **U-24** verlangt Sprache
  ohne Fachwort; „du bist gerade als Verwaltung angemeldet" ist einfacher als jede Erklärung eines
  Kontextes, der sich unter der Sitzung ändern kann.

**Negativ, und das sind reale Kosten**

- **Zwei Passwörter für eine Person — und das zweite hat einen bekannten schwachen Punkt.** Ein
  Resident-Account ohne hinterlegte `email` kann sein Passwort nicht selbst zurücksetzen; es geht nur
  über die Verwaltung, die sich damit Zugang zu diesem Profil verschafft (O-16). Diese bewusst
  akzeptierte Lücke wird durch diesen Record **häufiger getroffen**, nicht seltener, weil jetzt auch
  die organisierende Person ein zweites Konto führt. Das ist die teuerste Folge dieses Records.
- **`prepared` wird die Regel statt der Ausnahme.** Ein Profil, das die Verwaltung anlegt und nie
  selbst benutzt, war bisher der Randfall; er ist jetzt die einzige Bauform. Der Zustand bleibt
  richtig — ADR-002 will keinen impliziten Zustand —, aber die Oberfläche muss ihn tragen.
- **Eine Zusicherung, die heute niemand hat, wird gebraucht.** „Der Haushalts-Account besetzt nie ein
  Profil" folgt aus keinem bestehenden Mechanismus. Ohne den geschützten Test oben ist dieser Record
  eine Absichtserklärung — und die Bauform, die er abschafft, kehrt dann durch eine einzige Zeile im
  Anmeldepfad zurück, ohne dass es jemandem auffällt.
- **Die drei eingefrorenen Sammeldateien widersprechen ab jetzt nicht mehr nur im Stand, sondern in
  der Sache.** `../04-Domaenenmodell.md`, `../05-ADRs.md` und `../07-Screen-Inventar.md` beschreiben
  den Wechsel weiter als vorgesehene Funktion und werden **nicht** korrigiert. Das ist der Preis des
  Einfrierens, und dies ist die erste Entscheidung, bei der er spürbar wird. Wer dort liest, liest
  den Stand vom 2026-09-09 — die gepflegten Dateien in `adr/`, `domain/` und `screens/` gehen vor.
- **Ein geschützter Test wird ersetzt, nicht entfernt.** G-D11 prüft bisher „nach einem Profilwechsel
  ist der Puffer leer"; an seine Stelle tritt „ein Eintrag, dessen `resident_profile_id` nicht zur
  angemeldeten Identität gehört, wird verworfen statt versendet". Das ist eine **Substitution** und
  muss bei der Änderungssperre für geschützte Tests (G-D) auch so gelesen werden.

**Was diesen Record ausdrücklich *nicht* teuer macht:** die zusätzliche Anmeldung. Verwaltung und
Abstimmung sind zeitlich ohnehin getrennt — **S-50**/**U-20** nehmen dem Haushalts-Account jeden
Zugriff auf `CastingRound`, `Application`, `CastingNote`, `Slot` und `Appointment`, er kann am
täglichen Ablauf also gar nicht teilnehmen. Verwaltung ist Einrichtungsarbeit und selten, Abstimmen
ist der Alltag; ein Hin und Her zwischen beidem gibt es nicht zu bezahlen. Wer diesen Record kippen
will, sollte es nicht mit diesem Argument versuchen.

> **Das gibt man auf, wenn** das zweite Passwort zur Last wird — messbar daran, dass administrative
> Passwort-Resets zur Routine statt zur Ausnahme werden, oder dass Haushalte die Zugangsdaten des
> Haushalts-Accounts breiter teilen, weil gelegentliche Verwaltungsarbeit sonst umständlich ist. Die
> Antwort ist dann **nicht** die Rückkehr zum Wechsel, sondern **mehrere gleichzeitig gültige
> Sitzungen je Account, eine je Identität**: die feste Identität pro Sitzung bleibt, die Zahl der
> Sitzungen steigt. Die Entscheidung ist „eine Identität je Sitzung", nicht „eine Sitzung je Person".

**Status: Bestätigt — verbindlich für v0.1**

> **Bestätigt am 2026-09-11** (Samuel Zink) — verbindlich für v0.1.
> · **Aufgabebedingung:** Das gibt man auf, wenn administrative Passwort-Resets zur Routine werden
> oder Haushalte die Zugangsdaten des Haushalts-Accounts breiter teilen. Die Antwort ist dann
> mehrere Sitzungen je Account, nicht der Wechsel innerhalb einer Sitzung.
> · **Was ein späterer Widerspruch kostet:** **Jede zustandsbehaftete Komponente, die inzwischen ohne
> die Prüffrage gebaut wurde.** Den Wechsel wieder einzuführen heißt nicht, ein Menü zurückzubauen:
> es heißt, jede Komponente, die „pro angemeldeter Person" denkt — Puffer, Caches, Entwürfe, Uploads,
> Idempotenzschlüssel —, erneut gegen einen Vorgang zu prüfen, den es beim Bauen nicht gab. Genau
> diese Prüfung hat zweimal ein Leck gefunden, und **beide waren unauffällig**: kein Test wäre
> gescheitert, kein Log hätte etwas gezeigt. Der Preis ist deshalb nicht die Wiedereinführung,
> sondern die vollständige Nachprüfung — zu einem Zeitpunkt, an dem niemand mehr weiß, welche
> Komponenten betroffen sind.
> · Status wechselt auf `Angenommen`, sobald im Code umgesetzt und überprüft.
