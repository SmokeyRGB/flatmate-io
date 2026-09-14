> **Status:** Vorschlag — anfechtbar
> **Quelle:** `../05-ADRs.md` §ADR-007 (Stand V0.8, eingefroren 2026-09-09)
> **Nummer:** ADR-007 — dauerhaft. Nummern werden nie neu vergeben.

## ADR-007 — Passwort primär, Passkey optional

### Kontext

**P-2 Geräteneutralität:** kein Bewohnender darf durch sein Gerät ausgeschlossen werden. Die
Nutzungsrealität ist unbequem konkret — fünf bis zehn Personen, die das Tool in der Regel als
Haushalt **informell gewählt haben**: eine organisierende Person schlägt es vor, der Rest stimmt
vorher zumindest stillschweigend zu. Dass eine organisierende Person über den Kopf der WG hinweg
entscheidet, ist die Ausnahme, nicht die Regel — an der Geräterealität ändert das nichts: Geräte
von neu bis sehr alt, und eine Motivation, die beim ersten Hindernis endet. Die Kernmetrik ist die
**Beteiligungsquote**; jede Registrierungshürde greift sie direkt an.

Gleichzeitig existiert ein echtes Problem: **Duplikatsschutz.** Wer zweimal abstimmt, verzerrt das
Ergebnis. Die naheliegende technische Lösung — Geräte-Fingerprinting — ist nach **§ 25 TDDDG
einwilligungspflichtig** und damit praktisch unbrauchbar: eine Einwilligungsabfrage vor der ersten
Abstimmung kostet mehr Beteiligung als das Duplikat schadet.

### Betrachtete Optionen

| Option | Vorteil | Nachteil | Bewertung |
|---|---|---|---|
| **Passwort primär, Passkey optional nach der Registrierung** ✅ | Funktioniert auf jedem Gerät, in jedem Browser, auch geteilt. Ein Schritt zur Registrierung. Passkey als Komfort für die, die es haben | Passwörter sind das schwächere Verfahren; Zurücksetzen-Fluss nötig | **Gewählt** |
| Passkey primär | phishing-resistent, kein Passwort | Setzt Gerät, Browser und Betriebssystem mit Unterstützung voraus. **Verstößt gegen P-2** — genau die Person mit dem alten Gerät fällt heraus | Verworfen |
| **Magic Link** (E-Mail-Link statt Passwort) | keine Passwörter | **Verworfen in der Session, mit gutem Grund:** nicht gerätegebunden und muss abgespeichert werden. Wer den Link auf dem Rechner öffnet, aber am Handy abstimmen will, hat ein Problem; jede neue Anmeldung braucht Zugriff aufs Postfach. Als *einzige* Methode eine dauerhafte Reibungsquelle |
| Nur Beitrittscode ohne Konto | niedrigste Hürde überhaupt | Kein Duplikatsschutz, keine persönlichen Benachrichtigungen, keine Zuordnung von Stimmen — und V-1 wäre nicht durchsetzbar, weil es kein Subjekt gibt | Verworfen |
| Geräte-Fingerprinting als Duplikatsschutz | technisch wirksam | **§ 25 TDDDG:** einwilligungspflichtig. Eine Einwilligungsabfrage vor der ersten Abstimmung kostet mehr, als sie schützt | Verworfen |

### Entscheidung

**Ein-Schritt-Registrierung für Bewohnende, Passwort als primäre und universelle Methode.** Passkey
ist ein **optionaler Aufsatz nach der Registrierung**, jederzeit abschaltbar — nie Voraussetzung.

Seit V0.2 ist das im Modell verankert: **`PasskeyCredential`** (`04-Domaenenmodell.md` §2.1) mit
mehreren Credentials pro Account. Die dazu gehörende harte Regel: **das Löschen des letzten Passkeys
entzieht nie den Zugang.** `Account.passkey_enabled` ist eine Anzeige, keine Bedingung — sonst kippt
dieser Record vom „optionalen Aufsatz" in eine Abhängigkeit und verletzt P-2, also genau das, was er
schützen soll.

> **Geprüft am 2026-09-11 gegen Supabase Auth (ADR-006) — trägt, mit einer Bedingung.** Der Anbieter
> unterstützt mehrere Credentials je Account, von der Person setzbare Bezeichnungen, einzelnes
> Löschen, Einrichtung **nur aus einer bestehenden Sitzung** (also nie während der Registrierung)
> und Passkey als **eigenständigen** Anmeldeweg statt als zweiten Faktor. Das deckt die
> Anforderungen dieses Records.
>
> **Die Bedingung:** Eine Passkey-Anmeldung setzt dort ein Konto mit **bestätigter E-Mail oder
> Telefonnummer** voraus. Die abgeleitete Kennung eines Resident-Accounts ohne eigene Adresse
> erfüllt das nicht. Daraus folgt die Regel, die im Modell steht (`../domain/identity.md`, Kasten
> beim `PasskeyCredential`): **ein Passkey setzt eine hinterlegte und bestätigte `Account.email`
> voraus.** Beides bleibt optional, eines schaltet das andere frei — und es fällt mit dem Weg
> zusammen, den O-16 ohnehin vorzeichnet: Wer eine eigene Adresse hinterlegt, beendet damit die
> Reset-Vollmacht der Verwaltung **und** eröffnet den Passkey. P-2 bleibt unberührt, weil das
> Passwort die universelle Methode bleibt.
>
> **Zwei Vorbehalte, die nicht der Anbieter auflöst, sondern wir:** Die Passkey-Schnittstelle ist
> dort als **experimentell** gekennzeichnet und kann sich ohne Vorankündigung ändern — für einen
> Record auf `Vorschlag` tragbar, vor einer Bestätigung erneut zu prüfen. Und die Regel „das Löschen
> des letzten Passkeys entzieht nie den Zugang" ist **unsere** Anforderung, keine zugesicherte
> Eigenschaft des Anbieters; sie gehört bei der Umsetzung eigens getestet.

**E-Mail-Verifikation ist nachgelagert und blockiert die erste Abstimmung nicht.** Zwei Grenzen
gelten trotzdem: keine Inhalte mit Beratungsbezug per Mail vor der Verifikation, und keine
Benachrichtigungszustellung an unverifizierte Adressen.

**Ein Beitrittscode für den ganzen Haushalt**, nicht pro Person. Begründung: Codes pro Person müssen
verwaltet, verschickt und nachverfolgt werden — Organisationsarbeit, die das Produkt gerade abschaffen
will.

**Duplikatsschutz strukturell statt technisch** — von den ursprünglich vier Maßnahmen tragen
nach **S-05**/**U-22** noch **zwei**:

1. **Beitritte erscheinen im Aktivitäts-Feed** — niemand tritt unbemerkt bei.
2. Die **Quorum-Anzeige läuft gegen die Bewohnerzahl** („5 von 7") — ein Doppelkonto verschiebt den
   Nenner sichtbar.

> **Korrigiert (S-05/U-22).** Die beiden übrigen Maßnahmen sind entfallen: die für Bewohnende
> sichtbare **Bewohnerliste** (getrennt in Teilnehmendenliste B4 und Verwaltungs-Bewohnerliste O16,
> `07-Screen-Inventar.md` §7) und das **Entfernen-Recht jedes Mitglieds** (nur noch über
> `manage_members`). Damit ist die Absicherung des Beitrittslinks (**S-49**) nicht mehr Ergänzung,
> sondern **Voraussetzung** dieses Schutzes.

### Konsequenzen

**Positiv**

- Niemand fällt wegen seines Geräts heraus (P-2).
- Eine Hürde weniger im Onboarding — direkt auf die Kernmetrik gerichtet.
- Kein Einwilligungsbanner, kein Drittanbieter, keine zusätzliche Auftragsverarbeitung.
- Der strukturelle Duplikatsschutz ist **sozial** wirksam, nicht technisch — in einer WG mit sieben
  Personen, die sich kennen, ist das der stärkere Mechanismus.

**Negativ**

- **Passwörter bringen ihren ganzen Rattenschwanz mit:** Zurücksetzen, Ratenbegrenzung,
  Hash-Parameter, Sitzungsinvalidierung, Brute-Force-Schutz. **Geändert 2026-09-11 (ADR-006):**
  Dieser Teil ist nicht mehr selbst zu bauen — er liegt bei Supabase Auth. Das war das tragende
  Argument jener Entscheidung, und es entlastet genau diesen Punkt. **Nicht** entlastet ist das
  Zurücksetzen für Resident-Accounts **ohne** eigene `email`: dafür gibt es keinen Weg über den
  Anbieter, es bleibt der administrative Reset (O-16) — und ADR-013 lässt diesen Fall häufiger
  eintreten, weil auch die organisierende Person ein zweites Konto führt.
- **Der Haushalts-Account ist ein geteiltes Passwort.** Das ist bewusst so und ausdrücklich **keine
  Sicherheitsgrenze** — es muss in Dokumenten und UI so dargestellt werden und darf nirgends als
  Härtung erscheinen. Die praktische Folge steht in ADR-004: die Selbst-Redaktion hängt am
  **Account** und nicht nur am aktiven Profil. Seit **ADR-013** ist der Haushalts-Account ein
  **eigener Account mit eigener Anmeldung**, nicht ein zweiter Kontext eines Bewohner-Accounts; wer
  sein Passwort kennt, meldet sich an. Die Verankerung am Account bleibt trotzdem — sie greift auch
  bei fehlendem Sitzungskontext (G-C8) —, und ADR-013 benennt offen, dass sie über einen **zweiten**
  Account derselben Person hinweg nicht greifen kann.
- **Duplikate sind technisch möglich.** Wer mit zwei E-Mail-Adressen beitritt, stimmt zweimal ab. Der
  Schutz ist Sichtbarkeit, nicht Verhinderung. Das ist eine bewusst akzeptierte Restlücke, kein
  Versehen — und sie gehört in `02-SRD.md` §7 als Risiko, nicht in eine Fußnote.
- **Unverifizierte Adressen erzeugen einen Sonderfall** in Benachrichtigung und Fristenwarnung:
  eine Löschvorwarnung, die niemand erreicht, darf nicht zur stillen Löschung führen
  (`04-Domaenenmodell.md` §7).

> **Das gibt man auf, wenn** Passkeys in der Zielgruppe faktisch universell werden. Dann tauschen die
> beiden Rollen — Passkey primär, Passwort als Rückfall. Die Reihenfolge ist die Entscheidung, nicht
> die Technik.

**Status: Vorschlag — anfechtbar**
