> **Quelle:** `../07-Screen-Inventar.md` §7–8, Gruppe E (Stand V0.1, eingefroren 2026-09-09)
> **Gruppe:** E — Einstellungen
> **Schema-Autorität:** Alle Feld-, Zustands- und Entitätsnamen sind aus `../domain/`
> zitiert, nie neu erfunden.

### E — Einstellungen

#### E1 · Einstellungen

| | |
|---|---|
| **Zweck** | Ein Bildschirm statt mehrerer Einzelziele (K-10) — Benachrichtigungen, Konto, Abmelden als Abschnitte |
| **Zugang** | Aus dem Avatar-Menü |

**Kernelemente**

- **Abschnitt Benachrichtigungen:** Push verwalten (Verweis auf C7), **E-Mail nachtragen** —
  Pitch ausdrücklich „Zugang wiederherstellen, falls du dein Passwort vergisst" (S-45), nie als
  Sperre formuliert
- **Abschnitt Konto:** Passwort ändern, Passkey einrichten/entfernen
- **Abmelden**

> **Kasten — Passwort-Reset ist ein bewusster Tauschhandel (K-18).** Solange ein Resident-Profil
> keine eigene E-Mail hinterlegt hat, kann die Verwaltung dessen Passwort zurücksetzen — das ist
> eine Zugriffsmöglichkeit auf fremde Profile, bewusst eingegangen als Preis dafür, dass ein
> Beitritt ohne E-Mail möglich ist und ein vergessenes Passwort nicht zum dauerhaften
> Profilverlust führt. Die Lücke schließt sich, sobald die Person eine eigene E-Mail hinterlegt;
> bis dahin bleibt sie sichtbar — jeder Reset erzeugt einen `ActivityEvent` im Feed aller
> Bewohnenden und beendet die bestehenden Sitzungen des betroffenen Profils. Nicht als
> Sicherheitsgrenze darstellen (E-03).

---
