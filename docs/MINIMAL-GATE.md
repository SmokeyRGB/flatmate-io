# MINIMAL-GATE — die neun Gates vor der ersten Zeile Anwendungscode

> **Status:** V0.1 · 2026-09-09 · Samuel Zink (@SmokeyRGB)
> **Herkunft:** Auszug aus `GUARDRAILS.md`, Abschnitt „Minimal-Gate für den ersten Commit".
> **Maßgeblich bleibt `GUARDRAILS.md`.** Weicht dieses Dokument ab, gilt dort.
> **Zweck:** `GUARDRAILS.md` hat rund 1250 Zeilen. Dieser Auszug ist der Teil, der in **jeder**
> Sitzung geladen sein muss — deshalb steht er allein.

---

## Warum diese neun zuerst kommen

Sie sind **billig, wenn sie zuerst kommen, und teuer, wenn sie nachgezogen werden.** Das ist
keine Stilfrage. Vier der neun ändern nachträglich eingezogen jede bestehende Abfrage, jede
Migration oder jedes Testfile — und bei AI-gestützter Implementierung ist genau das der Weg, auf
dem eine vergessene Bedingung zum Datenleck wird (`02-SRD.md` §5.4).

Drei tragen deshalb den Zusatz **„vor der ersten Tabelle"** bzw. **„vor der ersten Policy"**.
Das ist wörtlich gemeint.

---

## Die neun Gates

| # | Gate | Regel | Werkzeug |
|:-:|---|---|---|
| **1** | Secret-Scanning aktiv, `.gitignore` deckt `.env*` | G-A1, G-A2 | **gitleaks** — als Pre-Commit-Hook **und** als CI-Job; G-A1 verlangt beides |
| **2** | TypeScript `strict`; Lint gegen `any` und `eslint-disable` | G-C4, G-J2 | tsc · ESLint |
| **3** | CODEOWNERS auf Konfiguration, Workflows, `GUARDRAILS.md`, `data-inventory.yml`, `test/guarded.manifest.json`, Migrationsverzeichnis, Solver-Adapter | G-G3, G-D, G-E1, G-K1 | CODEOWNERS |
| **4** | `data-inventory.yml` mit Schema-Abgleich als Pflicht-Gate — **vor der ersten Tabelle** | G-F1 | eigener CI-Schritt (ADR-010) |
| **5** | RLS-Positiv-Test über **alle** Tabellen mit `household_id` — **vor der ersten Tabelle** | G-C2, G-C5 | **Vitest** |
| **6** | `test/guarded.manifest.json` mit den dreizehn G-D-Invarianten, zunächst als scheiternde Tests — die **Sichtbarkeitsinvarianten je zweimal**: gegen die Policy-Schicht **und** als rohes SQL | **G-C7** | **Vitest** |
| **7** | Sitzungskontext ausschließlich über **eine** Transaktions-Hilfsfunktion; `SET` ohne `LOCAL` per Lint gesperrt — **vor der ersten Policy** | G-C8 | ESLint-Regel · Vitest (G-D10) |
| **8** | Import-Boundary-Lint mit den sechs Bounded Contexts | G-I1 | **dependency-cruiser** (`--validate`) |
| **9** | Lockfile-Installation, Lizenz-Check, Versions-Check | G-H2 bis G-H4 | **license-checker-rseidelsohn** mit Allowlist |

Die Werkzeugwahl ist entschieden; die Begründung je Werkzeug steht in `tools/README.md`.

---

## Gate 6 ist das, an dem sich alles entscheidet

Die Sichtbarkeitsinvariante wird **zweimal** geprüft: einmal durch die Policy-Schicht, und
einmal als rohes SQL, das die Policy-Schicht **umgeht**. Der Grund steht in **G-C7** und ist
knapp:

> **„sonst ist ADR-004 eine Illusion"**

Ein Test, der nur den Anwendungspfad prüft, ist grün, während die Datenbank die Daten an jeden
herausgibt, der sie direkt fragt. Die zweite Verteidigungslinie wäre ungetestet, und niemand
würde es merken — weil der erste Pfad die Prüfung ohnehin abfängt.

Dazu gehört **G-D10**: zwei Haushalte über **eine** gepoolte Datenbankverbindung, um zu belegen,
dass kein Sitzungskontext zwischen ihnen durchsickert. Das ist der Fehler, der *durch* die
Sicherheitsmaßnahme hindurch leckt.

Beide sind als Akzeptanzkriterien **AC-0.6** und **AC-0.7** im Paket
`Exercise 10/AI-Ready Requirements/F0-requirements.md` ausformuliert.

---

## Wiederkehrende Fehlerstelle: der Profilwechsel

Aus `GUARDRAILS.md` unter G-C7, hier wiederholt, weil an dieser Stelle **zweimal unabhängig**
Annahmen gebrochen sind:

Der Profilwechsel ist **keine Abmeldung**. Deshalb hängt V-1 am `Account` und nicht am Profil,
und deshalb wird der Stimmpuffer auch beim **Wechsel** geleert, nicht nur beim Abmelden.

Diese Position ist 🔴 — eine Prüffrage, kein Mechanismus. Wer hier etwas baut, prüft sie von Hand.

---

## Verweise

| Ziel | Wofür |
|---|---|
| `GUARDRAILS.md` | die vollständigen Regeln G-A bis G-N samt Durchsetzungsstand |
| `Exercise 10/AI-Ready Requirements/F0-requirements.md` | diese neun Gates als prüfbare Akzeptanzkriterien AC-0.1 bis AC-0.9 |
| `tools/README.md` | Werkzeugwahl mit Begründung je Werkzeug |
| `05-ADRs.md` | ADR-004 (doppelte Autorisierung), ADR-010 (CI-Gate), ADR-001 (Kontextgrenzen) |
