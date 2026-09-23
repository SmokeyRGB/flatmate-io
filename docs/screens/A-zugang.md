> **Quelle:** `../07-Screen-Inventar.md` §7–8, Gruppe A (Stand V0.1, eingefroren 2026-09-09)
> **Gruppe:** A — Zugang (vor der Anmeldung)
> **Schema-Autorität:** Alle Feld-, Zustands- und Entitätsnamen sind aus `../domain/`
> zitiert, nie neu erfunden.

### A — Zugang

#### A1 · Registrierung (Haushalt)

| | |
|---|---|
| **Zweck** | Einen neuen Haushalt anlegen. Erster Kontakt für die Person, die Flatmate.io einführt |
| **Zugang** | Ohne Anmeldung erreichbar |

**Kernelemente**

- E-Mail + Passwort, mit Hinweis, dass die Adresse künftig gemeinsam mit weiteren Verwaltenden
  genutzt werden kann
- Anlegt: `Household` + `Account` (`role = household_admin`, `is_resident = false`)

> **Dieser Account verwaltet, er wohnt nicht (ADR-013).** Er stimmt nicht ab und besetzt nie ein
> `ResidentProfile`. Wer selbst mitwohnt, legt sich zusätzlich ein Bewohner-Profil an und meldet
> sich dafür getrennt an (A2). Das ist ein eigener Schritt und sollte im Anschluss an die
> Registrierung angeboten werden, damit er nicht übersehen wird.

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Fehler — E-Mail bereits vergeben | Hinweis mit direktem Weg zur Anmeldung (A2), keine Fehlermeldung ohne Ausweg |

---

#### A2 · Anmeldung

| | |
|---|---|
| **Zweck** | Zugang zu einem bestehenden Konto |
| **Zugang** | Ohne Anmeldung erreichbar |

**Kernelemente**

- Für Haushalts-Accounts: E-Mail + Passwort
- Für Resident-Accounts ohne E-Mail: Haushalt + Anzeigename + Passwort (O-12, entschieden) — Feld
  „Haushalt" vorbelegt, wenn das Gerät „angemeldet bleiben" hält
- Passkey als Alternative, wenn zuvor eingerichtet — setzt eine hinterlegte und bestätigte
  `Account.email` voraus (ADR-006, `../domain/identity.md`)

> **Die Anmeldung entscheidet die Identität der ganzen Sitzung (ADR-013).** Es gibt keinen Wechsel
> zwischen Haushalt und Bewohner-Profil innerhalb einer Sitzung; wer die Seite wechseln will, meldet
> sich ab und neu an. Die Oberfläche benennt das so, statt es als Moduswechsel darzustellen.

---

#### A3 · Beitritt per Code

| | |
|---|---|
| **Zweck** | Bestehende Mitbewohnende treten dem Haushalt bei — der kürzeste Weg der Anwendung (S-03) |
| **Zugang** | `join_code`-Link, ohne vorherige Anmeldung |
| **⚡** | Ja — gemeinsam mit C1 der kürzeste, meistgenutzte Pfad der Anwendung |

**Kernelemente**

- **Ein** Bildschirm, **zwei** Pflichtfelder: Name und Passwort. Die E-Mail entfällt als
  **Pflichtfeld** (S-03) — sie bleibt als sichtbar freiwilliges, leer abschickbares Feld mit
  einer Zeile Begründung darunter stehen (FR-2.11, `../03-PRD.md` §4.1.1). *(Korrigiert
  2026-09-21: „entfällt vollständig" widersprach FR-2.11. Verboten ist die **Nachfrage**,
  nicht das Feld — ein sichtbar freiwilliges Feld fragt niemanden etwas ab.)*
- Falls das Passwort-Feld eine Anforderung durchsetzt (Länge, Zeichenklassen), steht diese sichtbar
  am Feld, bevor oder während getippt wird — nie eine stille Ablehnung ohne sichtbaren Grund
  (FR-2.10a)
- Kontrollkästchen „Auf diesem Gerät angemeldet bleiben", vorbelegt
- Haushaltsname zur Bestätigung: „Du trittst *WG Hauptstraße 12* bei" — der Code selbst ist über
  den Link bereits gesetzt, wird nicht erneut abgefragt
- Kein Passkey während der Registrierung, keine Verifikation, kein Zwischenbildschirm
- Anlegt: `ResidentProfile` + `Membership` (`is_resident = true`); **keine** Verknüpfung zu einer
  Bewerbung
- Direkt danach: **immer Start (B1)**, nie unmittelbar der Screening-Durchlauf. Wartet eine
  offene Bewerbung, trägt Start genau **eine** Karte, die nach C1 führt — einen Tipp entfernt,
  nicht automatisch. *(Korrigiert 2026-09-21: die vorherige Fassung — C1 zuerst, Start nur als
  Rückfallebene — widersprach **FR-2.18**, und FR-2.18 ist die richtige Seite. Start ist der
  Ort, an dem die Vorrangregel FR-2.24 lebt; ein Sprung darüber hinweg umginge das
  Aufgabenmodell auf genau dem Bildschirm, für den es existiert, und machte EC-2.3 — Beitritt
  ohne offene Runde — zum Sonderfall statt zum selben Weg. Beleg und Begründung:
  `../review-log.md` §Offene-Punkte-Register.)*

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Leer — kein Code | Wer den Beitrittspfad ohne Code aufruft (`/join`), sieht einen Satz, was hier normalerweise steht, und ein Eingabefeld für den Beitrittscode (FR-2.27, P-1 Kanalneutralität). Der Code wird per POST übermittelt, nie als Query-String (G-A5). |
| Fehler — Link nicht gültig | **Eine** Meldung für alle drei Gründe aus FR-2.7 (abgelaufen, Nutzungsgrenze erreicht, rotiert): „Dieser Einladungslink ist nicht gültig." + „Frag in der WG nach einem aktuellen Link." Der Grund wird **nicht** genannt. *(Korrigiert 2026-09-21, FR-2.8: die frühere Fassung nannte den Ablauf und verriet damit, dass es den Code gab. Der Weg zurück bleibt — im Usability-Test des Prototyps war genau dieser fehlende Ausweg der Befund.)* **Ergänzt 2026-09-23:** ein zweiter Weg zurück, „Beitrittscode von Hand eingeben" → `/join` — sowohl beim Öffnen des Links als auch bei einer Ablehnung erst beim Absenden. Der beschädigte Code wird nie vorausgefüllt. |
| Keine Berechtigung — bei einem anderen Haushalt angemeldet | Wer bereits bei einem **anderen** Haushalt angemeldet ist, als Bewohner:in oder mit dessen Haushalts-Account (EC-2.5), liest eine Erklärung und erhält „Abmelden" direkt auf dem Bildschirm — sowohl beim Öffnen des Links als auch bei einer Ablehnung erst beim Absenden. Das Abmelden beendet ausschließlich die eigene Sitzung und führt zurück zu genau dieser Einladung. |

---

#### A4 · Einladungstoken einlösen

| | |
|---|---|
| **Zweck** | Der reguläre Weg, aus einer zugesagten Bewerbung eine Bewohnerin oder ein Bewohner zu machen — löst automatisch `Application.became_resident_id` (S-42) |
| **Zugang** | Einmaliger `ApplicationInviteToken`-Link, ohne vorherige Anmeldung |

**Kernelemente**

- Gleicher Registrierungsablauf wie A3 (Name + Passwort), danach direkt in die Runde
- Erklärender Satz zur Selbst-Redaktion: Ab diesem Moment sieht die Person ihre eigene Bewerbung
  anders als die der anderen (§7.13) — die Person muss verstehen, warum, bevor sie es bemerkt

**Vier Ausgänge, nicht zwei (K-17)** — jeder mit einem Satz, der sagt, was jetzt zu tun ist:

| Fall | Feld | Was die Person liest |
|---|---|---|
| Alles gut | — | Registrierung, danach direkt in die Runde |
| Schon eingelöst | `used_at` gesetzt | „Dieser Einladungslink wurde bereits verwendet." + Weg zur Anmeldung |
| Abgelaufen oder zurückgezogen | `expires_at` / `revoked_at` | „Dieser Einladungslink ist abgelaufen." + „Frag in der WG nach einem neuen" |
| Bereits Bewohner:in | Konto hat schon ein `ResidentProfile` im Haushalt | „Du bist bereits als Bewohner:in registriert." — **kein Merge, kein stilles Überschreiben** |

Die drei Fehlertexte unterscheiden sich bewusst: „schon benutzt" und „abgelaufen" führen zu
verschiedenen nächsten Schritten. Der letzte Fall steht im Domänenmodell als geschützter Test
(G-D12), nicht als Kommentar.

---
