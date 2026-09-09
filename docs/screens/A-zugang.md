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
- Anlegt: `Household` + `Account` (`role = household_admin`)

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
- Für Resident-Accounts ohne E-Mail: Haushalt + Anzeigename + Passwort (O-D, Vorschlag) — Feld
  „Haushalt" vorbelegt, wenn das Gerät „angemeldet bleiben" hält
- Passkey als Alternative, wenn zuvor eingerichtet

---

#### A3 · Beitritt per Code

| | |
|---|---|
| **Zweck** | Bestehende Mitbewohnende treten dem Haushalt bei — der kürzeste Weg der Anwendung (S-03) |
| **Zugang** | `join_code`-Link, ohne vorherige Anmeldung |
| **⚡** | Ja — gemeinsam mit C1 der kürzeste, meistgenutzte Pfad der Anwendung |

**Kernelemente**

- **Ein** Bildschirm, **zwei** Pflichtfelder: Name und Passwort. E-Mail entfällt vollständig (S-03)
- Kontrollkästchen „Auf diesem Gerät angemeldet bleiben", vorbelegt
- Haushaltsname zur Bestätigung: „Du trittst *WG Hauptstraße 12* bei" — der Code selbst ist über
  den Link bereits gesetzt, wird nicht erneut abgefragt
- Kein Passkey während der Registrierung, keine Verifikation, kein Zwischenbildschirm
- Anlegt: `ResidentProfile` + `Membership` (`is_resident = true`); **keine** Verknüpfung zu einer
  Bewerbung
- Direkt danach: Screening-Durchlauf (C1), falls eine offene Bewerbung wartet — sonst Start (B1)

**Abweichende Zustände**

| Zustand | Verhalten |
|---|---|
| Fehler — Code abgelaufen | „Dieser Beitrittscode ist abgelaufen." + Hinweis, im Haushalt nach einem neuen zu fragen |

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
