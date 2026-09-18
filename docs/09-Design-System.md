## Design System

> Tokens below bind colors, typography, spacing and component selection (`README.md` §6). The
> implementation library that renders them — Tailwind CSS + shadcn/ui — is decided in
> [`adr/0015-styling-tailwind-shadcn.md`](adr/0015-styling-tailwind-shadcn.md), not here.

Overall direction: A warm, paper-like "apartment notebook" aesthetic — cream paper surfaces, deep ink-brown text, terracotta as the single brand accent. Clean, card-based layout with generous rounding and very soft shadows; mobile-first, calm and tactile rather than techy.

Color Palette — Light theme (default)

| Hex | Token / Role |
|---|---|
| `#F9F4EA` | App background (warm paper) |
| `#FEFCF7` | Card / surface / popover (brighter cream) |
| `#321F14` | Primary text (deep ink brown) |
| `#6B594E` | Secondary / muted text |
| `#B6522D` | Brand & primary action (terracotta) — buttons, links, active accents, focus ring |
| `#FBF8F1` | Text on brand / on destructive fills |
| `#EFE7D8` | Secondary surface (soft paper tint; secondary buttons, active nav chip) |
| `#442D20` | Text on secondary surface |
| `#F0EBDF` | Muted surface (dividers' track, skeleton fills) |
| `#E7DEBD` | Accent highlight (pale sand; subtle emphasized backgrounds) |
| `#412714` | Text on accent highlight |
| `#DED6C9` | Borders and input outlines (warm taupe) |
| `#BE241F` | Destructive / error (brick red); also the "No" vote color |
| `#DCAF61` | "Rather not" vote color (warm ochre), text on it `#402712` |
| `#69AA77` | "I like" vote color (sage green), text on it `#132717` |
| `#00572E` | "Absolutely" vote color (deep fir green — strongest approval), text on it `#F8F5EE` |

Color Palette — Dark theme

| Hex | Token / Role |
|---|---|
| `#1D140D` | App background (dark warm brown) |
| `#2B1F16` | Card / surface |
| `#F0EBE0` | Primary text |
| `#A79D91` | Secondary / muted text |
| `#D97C50` | Brand & primary action (lighter terracotta), text on it `#190F09` |
| `#3A2A1F` | Secondary & muted surface, text on it `#E9E4DA` |
| `#4E341F` | Accent highlight |
| white @ 12% / 16% | Borders / input outlines (translucent white) |
| `#DA4339` | Destructive & "No" vote |
| `#C99D4E` | "Rather not" vote |
| `#63A471` | "I like" vote |
| `#7CD591` | "Absolutely" vote (bright mint green), text on it `#25140D`-range dark |

The four vote colors intentionally read as an ascending scale — brick red → ochre → sage → deep green — so a stacked vote distribution bar reads left-to-right as rejection to enthusiasm.

Both light-theme tables above were re-verified pixel-for-pixel against the live prototype (its Tailwind CSS variables, decoded from OKLCH to hex, match every documented value exactly). The dark-theme table is **not** independently verified this way: the prototype does not implement a dark theme — forcing `prefers-color-scheme: dark` has no visual effect on it — so those values remain spec-derived rather than observed.

Semantic surfaces are not a separate palette — they're the three core colors (brand terracotta, brick-red destructive, paper-tint secondary) reused at low, fixed opacity steps. Confirmed directly against the prototype's CSS variables and Tailwind classes:

| Purpose | Recipe | Example |
|---|---|---|
| Informational callout (neutral) | `bg-secondary/60`, no border, "info" icon | "Deine E-Mail-Adresse ist für alle späteren WG-Verwalter:innen sichtbar…" on WG-gründen |
| Cautionary/destructive-adjacent callout | `bg-destructive/5` + `border-destructive/40`, rounded-xl, warning-triangle icon | "Nutze das, wenn jemand über den Einladungslink hereingekommen ist…" inside the remove-member dialog |
| Celebratory/positive banner | `bg-primary/10` + `border-primary/40`, no icon, heading in brand color | "Stark gemacht!" on the home dashboard |
| Round-scope grouping panel | `bg-primary/5` + `border-primary/30`, `rounded-2xl` (larger radius than a card) | "Diese Casting-Runde" section on Organisation |

Treat this as the rule for any new status/emphasis surface: pick one of the three core colors and an opacity step, don't invent a new hue.

Typography

- Fraunces (serif display) — all headings (h1–h3) and titles; slight negative letter-spacing (−0.01em).
- Work Sans (humanist sans) — all body text, labels, buttons, captions; it is the base font for everything that isn't a heading.
- Monospace (`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, …`) is reserved for short machine-readable identifiers a person copies verbatim — invite codes and invite URLs (e.g. `UAMPN-QACVZ`) — never for prose, names, or contact details entered by a human (an applicant's e-mail/phone in the invite-message dialog stays in Work Sans). The prototype also renders the signed-in user's own account e-mail in monospace on the Settings screen; treat that one occurrence as a minor inconsistency in the reference, not a rule — account e-mails elsewhere are plain Work Sans.

Type sizes follow a normal scale (small helper text ~12 px, body 14–16 px, card titles and stats 16–24 px, hero numbers up to ~30 px), with muted text at the same size but in the secondary color.

Spacing & Shape

- Spacing: standard 4 px base scale — 4 / 8 / 12 / 16 / 20 / 24 px in practice; cards pad at ~16 px, sections breathe at 24 px.
- Border radius: base 12 px. Small elements 8 px, inputs/buttons ~10–12 px, cards 16 px, large panels up to 24 px; circular avatars, rank badges, and icon chips.
- Shadows: very restrained, single-direction soft shadows (roughly `0 1px 2px` + `0 6px 20px` at ~5% opacity, warm brown-tinted) — enough to lift cards off the paper background, never dramatic. Focus is shown as a terracotta ring.

Layout Style

Mobile-first, single-column, card-based: content lives in rounded cream cards on a warm paper background, separated by whitespace rather than dividers; the desktop widens the same stacked structure instead of adding chrome. A compact fixed icon-only bottom navigation anchors mobile; on desktop, navigation moves into a top header.

Component Patterns

- Buttons: Primary buttons are solid terracotta with cream text; secondary buttons are a soft paper-tint fill with dark brown text; destructive actions are brick red. All are pill-adjacent (fully rounded corners, ~10–12 px), medium-weight label, and give subtle pressed feedback (slight scale-down on tap). **Disabled = the same fill/text color as the enabled button at 50% opacity** (`disabled:opacity-50`), never a separate desaturated "disabled gray" — confirmed on both a disabled secondary button (invite-code submit) and a disabled destructive button (type-to-confirm removal). Disabled buttons always come with a visible one-line reason in plain text nearby — never a silent lock or hover-only tooltip. A form's footer often pairs one full button with a plain-text link rather than two buttons: e.g. solid primary "Erfassen" beside a plain "Abbrechen" link, inline, not stacked.
- Cards: The workhorse container — cream surface, 1 px warm taupe border, 16 px radius, faint soft shadow. Cards are frequently fully clickable (a whole row opens a detail dialog) with a chevron on the right; ranked/list entries pair a circular badge (rank number or icon) with a name, a muted meta line, and a colored distribution bar. A "featured/next action" card variant adds a `border-primary/40` outline to the same card shape, in one of two strengths depending on how much emphasis the moment deserves: (a) **banded** — a full-width solid `bg-primary` header strip carrying a small-caps eyebrow label ("ALS NÄCHSTES") in cream text, sitting above the normal cream body — used for the single most important prompt on a page (home dashboard); (b) **quiet** — no band, just the same muted small-caps eyebrow label as plain text inside the card's own padding — used for a still-important but not page-defining prompt (Organisation page). A distinct, larger-radius (`rounded-2xl`) panel at `bg-primary/5` / `border-primary/30` is used not for a single card but to visually group a whole cluster of content that's scoped to the current casting round, e.g. "Diese Casting-Runde".
- Inputs: Simple bordered fields — cream background, 1 px taupe outline, ~10–12 px radius, no heavy inset shadows; helper hints appear below in muted text; a label sits above the field, with a trailing `*` for required fields. Short paired fields (e.g. age + contact) sit two-up in a row on the same width that a single full-width field would otherwise take; a free-text note uses a plain multi-line textarea with the same border/radius as single-line inputs. Radio groups (e.g. "where did this information come from") are wrapped in their own subtly-bordered sub-panel inside the form card, with a filled terracotta dot for the selected option and an outlined circle for the rest. Read-only preview blocks (copyable text) are flat tinted text areas; a short machine-readable value (an invite code) renders in monospace as a small headline with the full URL in muted text beneath, followed by a **stacked pair of copy buttons** — a full-width solid primary "copy the whole thing" action on top, a quieter secondary "copy just the short value" option beneath it.
- Segmented controls: two distinct components, don't conflate them. (1) A **tab switcher** (e.g. Anmelden / Einsteigen / WG gründen) is a single muted-track pill; the active tab renders as a raised cream sub-pill, inactive tabs are plain text on the track. (2) A **choice selector** (e.g. the four vote options Nein / Eher nicht / Finde gut / Unbedingt) is a row of individually bordered pill buttons; the selected choice is a solid terracotta fill with cream text, the rest stay outlined/muted — used inside the applicant detail dialog, and re-editable ("Du kannst deine Stimme noch ändern").
- Dialogs & confirmations: Destructive or hard-to-reverse actions always open a modal confirmation with a plain-language title, explanation of the consequence, and clearly separated cancel/confirm buttons (confirm in red for destructive cases). For the one truly irreversible action in v0.1 — permanently removing a member (U-27, reserved for wrongful/malicious invite-link joins, distinct from the reversible "moved out") — the dialog nests a cautionary callout (`bg-destructive/5` + `border-destructive/40`, warning-triangle icon) explaining exactly when to use this over the reversible alternative, then requires typing the exact display name into a labeled field (its placeholder previews the expected value) before the solid destructive confirm button leaves its disabled 50%-opacity state. A separate, non-destructive **detail dialog** pattern (tapping into an applicant's card) is a centered overlay with a dimmed backdrop, a top-right `×` close control, a serif name+age heading, a plain status line, free-text body copy, a contact line, the vote choice-selector described above, and then a repeated read-only summary of the aggregate result underneath.
- Navigation: On mobile, a fixed bottom bar of large icon-only buttons (no labels); the active item sits in a soft secondary-colored rounded chip with a terracotta icon. On desktop the same nav becomes a row of plain-text links in the top header, and the active one renders as a solid `bg-primary` pill with cream text (not just a plain-text highlight). A compact plain-text "← Zurück" (or a named parent, e.g. "← Organisation") link sits top-left on sub-pages as the back affordance — no button chrome, just an arrow glyph and a label. Secondary destinations live in a profile/avatar menu rather than the bottom bar: a floating rounded panel below the avatar icon, opening with a non-interactive header block (name + household), a divider, a list of icon+label menu items, another divider, then sign-out. Headers stay compact (app identity plus contextual screen title) to maximize content space.
- Lists & status badges: a plain list row (e.g. "who's voted so far") pairs a name on the left with a status pill on the right — outlined pill for a pending/neutral state ("stimmt mit ab"), a muted filled pill for an inactive-but-historical state ("ausgezogen" / moved out), and the same outlined-but-inert treatment for an entity that structurally cannot act ("stimmt nicht ab" for a shared household account). A richer roster row (household members under Organisation) adds an optional solid role badge chip (shield icon + label, e.g. "Moderation") next to the name, a plain meta line (voting eligibility, tenure, contact-or-none), then two rows of actions: neutral secondary buttons for reversible administrative toggles (Kontakt, Moderation geben/entziehen), and brick-red icon+text link-style actions for the two ways a person leaves (Ausgezogen = reversible move-out, Entfernen = irreversible removal, gated by the type-to-confirm dialog above) — both rendered in the same destructive weight since only the confirmation step, not the color, communicates which one is dangerous.
- Feedback states: Loading uses skeleton placeholders shaped like the real content; errors are calm, in plain language, always paired with a "Try again" action and the reassurance that nothing was lost. Success moments can trigger a short, gentle card slide animation (with a reduced-motion fallback) — playful but never moving fixed controls. Inline callouts follow the three-tint system described under Color Palette (info / caution / celebratory) rather than introducing new colors.
- Status/badge colors: The vote scale (red/ochre/sage/deep green) doubles as the semantic scale for any intensity-based state; neutral badges use the muted paper tint.
- Activity feed: a stacked list of plain cards, each phrased as one sentence with the actor/subject bolded inline (e.g. "**Lisa Petersen** wechselte von „Gesehen" zu „Eingeladen""), a muted meta line underneath giving either a relative timestamp + human actor or an absolute timestamp + system reason ("Genug Stimmen — automatisch gesehen"), and a centered plain-text "Früheres anzeigen (N)" link to page in older entries — this is the audit-trail surface behind P-4 Reversibilität.