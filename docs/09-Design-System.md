## Design System

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

Typography

- Fraunces (serif display) — all headings (h1–h3) and titles; slight negative letter-spacing (−0.01em).
- Work Sans (humanist sans) — all body text, labels, buttons, captions; it is the base font for everything that isn't a heading.
- No monospace font is used anywhere.

Type sizes follow a normal scale (small helper text ~12 px, body 14–16 px, card titles and stats 16–24 px, hero numbers up to ~30 px), with muted text at the same size but in the secondary color.

Spacing & Shape

- Spacing: standard 4 px base scale — 4 / 8 / 12 / 16 / 20 / 24 px in practice; cards pad at ~16 px, sections breathe at 24 px.
- Border radius: base 12 px. Small elements 8 px, inputs/buttons ~10–12 px, cards 16 px, large panels up to 24 px; circular avatars, rank badges, and icon chips.
- Shadows: very restrained, single-direction soft shadows (roughly `0 1px 2px` + `0 6px 20px` at ~5% opacity, warm brown-tinted) — enough to lift cards off the paper background, never dramatic. Focus is shown as a terracotta ring.

Layout Style

Mobile-first, single-column, card-based: content lives in rounded cream cards on a warm paper background, separated by whitespace rather than dividers; the desktop widens the same stacked structure instead of adding chrome. A compact fixed icon-only bottom navigation anchors mobile; on desktop, navigation moves into a top header.

Component Patterns

- Buttons: Primary buttons are solid terracotta with cream text; secondary buttons are a soft paper-tint fill with dark brown text; destructive actions are brick red. All are pill-adjacent (fully rounded corners, ~12 px), medium-weight label, and give subtle pressed feedback (slight scale-down on tap). Disabled buttons always come with a visible one-line reason in plain text nearby — never a silent lock or hover-only tooltip.
- Cards: The workhorse container — cream surface, 1 px warm taupe border, 16 px radius, faint soft shadow. Cards are frequently fully clickable (a whole row opens a detail dialog) with a chevron on the right; ranked/list entries pair a circular badge (rank number or icon) with a name, a muted meta line, and a colored distribution bar.
- Inputs: Simple bordered fields — cream background, 1 px taupe outline, ~10–12 px radius, no heavy inset shadows; helper hints appear below in muted text. Read-only preview blocks (copyable text) are flat tinted text areas with a full-width primary "copy" button underneath.
- Dialogs & confirmations: Destructive or hard-to-reverse actions always open a modal confirmation with a plain-language title, explanation of the consequence, and clearly separated cancel/confirm buttons (confirm in red for destructive cases).
- Navigation: On mobile, a fixed bottom bar of large icon-only buttons (no labels); the active item sits in a soft secondary-colored rounded chip with a terracotta icon. Secondary destinations live in a profile/avatar menu rather than the bottom bar. Headers stay compact (app identity plus contextual screen title) to maximize content space.
- Feedback states: Loading uses skeleton placeholders shaped like the real content; errors are calm, in plain language, always paired with a "Try again" action and the reassurance that nothing was lost. Success moments can trigger a short, gentle card slide animation (with a reduced-motion fallback) — playful but never moving fixed controls.
- Status/badge colors: The vote scale (red/ochre/sage/deep green) doubles as the semantic scale for any intensity-based state; neutral badges use the muted paper tint.