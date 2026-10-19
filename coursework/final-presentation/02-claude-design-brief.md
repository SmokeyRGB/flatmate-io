# Claude Design Brief — "Smaller loops, tighter guardrails"

**Hand this file to Claude Design as-is.** It is self-contained. Companion analysis (not needed for the build): `01-process-report.md`.

---

## 0. What to build

A **single-file animated HTML slide deck** (HTML + CSS + vanilla JS, no framework, no build step) for a **10-minute final presentation** at the Digitale Leute School AI Software Engineering Bootcamp. The speaker is Samuel Zink (@SmokeyRGB). Language: **English**. Presented online via screen share, then shared as a takeaway link, so it must also work **without the speaker**.

The talk is **not a product pitch.** It reflects on *how* the product, Flatmate.io (a flat-share applicant-screening and decision tool), was built with AI tools over seven weeks: decisions, struggles, learnings. The audience has already seen the product in earlier check-ins. The product appears only as supporting visuals.

**Through-line:** *Fast AI moved the bottleneck from typing code to deciding, specifying and verifying. What worked: make every loop smaller, keep the guardrails tight.*

**Visual identity:** the Flatmate.io app's own design system (warm paper, ink-brown, terracotta, Fraunces + Work Sans, the four-colour vote scale). See §1. Not any external reference.

**Tone:** honest, specific, quietly confident, slightly wry. Never salesy. Admitting mistakes is the point.

### Hard constraints
- **10:00 total.** 14 main slides + **1 optional slide (S10b, skippable)** + 4 appendix (appendix only reachable by key, for Q&A). Per-slide timings in §6; core total ≈ 9:10, with the optional slide ≈ 9:50.
- **No live demo anywhere.** The speaker will not switch tabs or run anything live. Everything that could be a demo is shown as screenshots / recorded frames built into the deck.
- **Evidence honesty is a visual rule.** Wherever a claim rests on a test, show *how* it was tested with one of four small evidence tags (see §1.3). Never let an AI-driven test look like a human user test.
- **Presenter-driven, never autoplay.** → / Space / click advance; ← back. Each slide may have 1–4 **build steps** (elements entering on key press). Keep builds ≤ 4 per slide.
- **Slow motion.** Transitions 900–1400 ms, element entrances 700–1100 ms, staggers 90–140 ms. Nothing snaps. Nothing bounces. (Motion feel: a calm product film, not a slideshow template. Colours and typography come from the app, §1.)
- **Fixed 16:9 stage (1920×1080 design size) scaled to fit the window**, letterboxed on the page background colour. Must stay legible when screen-shared at 1280×720: **minimum body text 30 px on the 1920 stage**, headline 88–140 px.
- **One idea per slide.** Max ~25 words of on-slide text excluding the tiny caption layer. No bullet lists longer than 3 items. Prefer diagrams, big numbers, screenshots, flows.
- Works offline except Google Fonts; provide system-font fallbacks. No other external dependencies. If you use a library, pin it to an exact version from cdnjs/jsDelivr/unpkg, otherwise plain CSS/WAAPI/JS. (Plain CSS + Web Animations API is enough.)

---

## 1. Visual identity = the Flatmate.io app's design system

**The deck must look like the app.** Use the product's own design system (source: the repo's `docs/09-Design-System.md`, reproduced here so this brief stays self-contained). Do **not** use the colours, fonts or styling of any external reference. A Dribbble motion piece ("YouSquared" by Emote Agency) was shown to the speaker **for motion feel only**: slow, calm, camera-like movement, floating device frames, one-line captions, unhurried transitions. Take *nothing* else from it.

**Direction (from the app):** a warm, paper-like *"apartment notebook"* aesthetic: cream paper surfaces, deep ink-brown text, terracotta as the **single** brand accent. Card-based layout, generous rounding, very soft shadows, calm and tactile rather than techy. When in doubt, ask "would this look at home next to the app's screenshots?"

### 1.1 Palette (define as CSS custom properties; light theme is the default)

| Token | Hex | Use in the deck |
|---|---|---|
| `--paper` | `#F9F4EA` | slide background |
| `--card` | `#FEFCF7` | cards, popovers, device-frame screens |
| `--ink` | `#321F14` | primary text (never pure black) |
| `--muted` | `#6B594E` | secondary text, captions, "untested" |
| `--brand` | `#B6522D` | terracotta: the one accent. Primary emphasis, key words, active states, AI/agent nodes |
| `--on-brand` | `#FBF8F1` | text on brand fills |
| `--secondary` | `#EFE7D8` | soft paper tint: secondary pills, chips, gates, tracks |
| `--on-secondary` | `#442D20` | text on secondary |
| `--muted-surface` | `#F0EBDF` | tracks, skeleton fills |
| `--highlight` | `#E7DEBD` | pale sand, subtle emphasised backgrounds |
| `--border` | `#DED6C9` | 1 px borders, outlines |
| `--destructive` | `#BE241F` | brick red: mistakes, refuted claims, "the leak" |
| `--vote-no` | `#BE241F` | vote scale 1 |
| `--vote-rather-not` | `#DCAF61` | vote scale 2 (ochre); text on it `#402712` |
| `--vote-like` | `#69AA77` | vote scale 3 (sage); text on it `#132717` |
| `--vote-absolutely` | `#00572E` | vote scale 4 (deep fir green); text on it `#F8F5EE` |

**Dark theme (optional, key `D` toggles it; use for at most one or two slides, never required):** background `#1D140D`, card `#2B1F16`, text `#F0EBE0`, muted `#A79D91`, brand `#D97C50` (text on it `#190F09`), secondary `#3A2A1F`, highlight `#4E341F`, borders white @ 12 %, destructive/No `#DA4339`, rather-not `#C99D4E`, like `#63A471`, absolutely `#7CD591`. (The app's dark theme is spec-derived, not yet verified against a live build.)

**Semantic rules (follow the app's own rule: reuse the three core colours at fixed opacity steps, never invent a new hue):**
- Brand terracotta = emphasis, AI/agent things, primary action. Brick red = mistakes, failures, refuted claims. Paper tint = neutral.
- **Decisions / pivots** use ochre `--vote-rather-not`. **Supported / good** uses sage `--vote-like`. **Strongest approval** uses `--vote-absolutely`.
- The four vote colours always read as an ascending scale: brick → ochre → sage → fir. Use it as a **signature motif**: a thin four-segment bar as a divider under section markers, and as the visual language for any "bad → good" gradation. Never use these four colours for unrelated categories.
- Callout surfaces (from the app): info = `--secondary` @ 60 %, no border; caution = `--destructive` @ 5 % fill + `--destructive` @ 40 % border; celebratory = `--brand` @ 10 % fill + `--brand` @ 40 % border; grouped-cluster panel = `--brand` @ 5 % fill + `--brand` @ 30 % border, radius 24 px.

**Backgrounds:** flat `--paper` with a very subtle paper grain (SVG noise, 3–4 % opacity). Add one or two **soft, blurred "warm glow" blobs** (terracotta `#B6522D` at 10–16 % opacity and ochre `#DCAF61` at 14–22 %, 80–140 px blur) that drift very slowly (40–60 s loops) and **move between slides** so the deck feels like one continuous camera. They must stay quiet: this is a notebook, not a neon landing page. No violet, no pink, no cool hues anywhere.

### 1.2 Typography (Google Fonts, same as the app)
- **Display:** *Fraunces* (serif; variable, weight 400–600). All headlines and big numbers, sentence case, letter-spacing −0.01em, tight leading (0.98–1.05).
- **Body / UI:** *Work Sans* 400/500 for everything that isn't a headline: body text, labels, captions, tags, buttons.
- **Monospace:** only for short machine identifiers a person copies verbatim (PR numbers like `#23`, commit hashes, model ids, ADR ids), as in the app, where it's reserved for invite codes. Never for prose, tags or labels. Tags and small eyebrows are **Work Sans small caps / uppercase, letter-spacing +0.06em**, like the app's "ALS NÄCHSTES".
- One emphasised word per headline in *italic Fraunces* in `--brand`. No gradient text.

### 1.3 Components (copy the app's patterns)
- **Cards:** `--card` surface, 1 px `--border`, **radius 16 px**, padding ~48 px at slide scale, shadow very restrained and warm-brown tinted (`0 1px 2px` + `0 6px 20px` at ~5 % `rgba(50,31,20,.05)`). Larger grouped panels: radius 24 px.
- **"Featured" card (use for the single key statement of a slide):** card with a **full-width solid `--brand` header strip** carrying a small-caps eyebrow in `--on-brand` (e.g. `THE LESSON`, `WHY NO REAL CASTING YET`), above a normal paper body. A quieter variant: same eyebrow as muted plain text inside the card, no band.
- **Pills / chips:** fully rounded; secondary = `--secondary` fill with `--on-secondary` text; outlined = 1 px `--border`; solid brand for the active/selected state. Used for dates, PR numbers (mono), model names.
- **Circular badges** (rank / step numbers) as in the app's ranking: a filled circle with a number or icon.
- **Vote bar:** the app's stacked distribution bar (brick → ochre → sage → fir, left to right) as a recurring chart/divider element.
- **Evidence tags** (small Work Sans caps pills, ~22 px, used on S2 and wherever a claim rests on a test):
  - `HUMAN TEST`: `--ink` fill, `--paper` text
  - `PERSONA RUN`: 1 px `--brand` outline, `--brand` text (an AI agent played a user via Playwright; clearly *not* a human)
  - `MEASURED`: `--vote-rather-not` fill, `#402712` text (a number was timed/counted)
  - `UNTESTED`: dashed `--border` outline, `--muted` text, with a faint skeleton-shimmer fill (the app's loading skeleton)
  Result glyphs next to a claim: `✓` supported (`--vote-like`), `◐` partly (`--vote-rather-not`), `✗` refuted (`--destructive`), `?` open (`--muted`). Draw glyphs as SVG, not emoji.
- **Device frames:** rounded phone and browser frames with a thin `--border` outline, the same restrained shadow, floating with a 10–14 px vertical drift and ±1° tilt in parallax layers. App screenshots inside frames already match the palette: let them be the product's own UI.
- **Caption layer** (lower-third): a single line, Work Sans 500, 34 px, bottom-centre on a `--card` pill with a 1 px `--border`, fades in at build step 1.
- **Big numbers:** Fraunces 200–260 px, count-up 1.4 s on entrance; unit/label in Work Sans small caps.
- **Section marker:** top-left small-caps eyebrow `01 · IDEA RECAP` etc. with the four-segment vote bar beneath it; top-right the thin time-budget bar (§4).
- **Buttons / key hints:** pill-adjacent, secondary fill; pressed state = slight scale-down (as in the app).
- **No clip-art, no emoji, no stock photos.** Diagrams are hand-built SVG, 3 px rounded strokes, only the palette above.
- Respect the app's spacing: 4 px base scale (4/8/12/16/20/24 px, multiplied for the 1920 stage); base radius 12 px, small 8 px, cards 16 px, panels 24 px.

---

## 2. Motion system

Define easing tokens:
```
--ease-out-soft: cubic-bezier(.22, 1, .36, 1);    /* entrances */
--ease-in-out:   cubic-bezier(.65, 0, .35, 1);    /* moves, morphs */
--ease-linger:   cubic-bezier(.16, .84, .44, 1);  /* number count-ups, drifts */
```

**Slide transitions (rotate between these, never the same twice in a row; each 1100–1400 ms):**
1. **Paper-glow wipe:** a soft warm blob (terracotta/ochre at low opacity) swells from the bottom, veils the outgoing slide, then recedes to reveal the new one.
2. **Shared-element morph:** a persistent element (a number, a pill, a device frame) morphs size/position from slide N into slide N+1 (FLIP technique).
3. **Mask reveal:** the incoming slide is revealed through a growing rounded rectangle from the centre (clip-path inset → 0).
4. **Parallax slide:** outgoing content drifts left at 0.6× while incoming enters from right at 1×, with a slight scale 0.98→1.
5. **Depth fade:** outgoing slide scales to 0.94 and blurs 0→12 px while fading; incoming sharpens from blur 12→0.

**Entrance choreography:** headline reveals **line by line** (each line in an overflow-hidden wrapper, text translates up 110 % → 0, 900 ms). Then supporting elements fade-up 24 px, staggered. Numbers count up. SVG strokes draw via `stroke-dashoffset` (1.2–1.8 s).
**Ambient motion:** glow drift, device float, a slowly rotating ring or tick marks where useful. **Max one ambient motion per region.**
**Rules:** respect `prefers-reduced-motion` (replace all motion with 200 ms cross-fades, stop ambient loops). Animate only `transform` and `opacity` (plus `filter` on the glow blobs). 60 fps on a mid laptop screen-shared over Zoom/Meet: avoid more than ~3 large blurred layers on screen at once.

---

## 3. Behaviour and presenter tools

| Key | Action |
|---|---|
| → / Space / click | next build or slide |
| ← | previous build or slide |
| `P` | **Presenter overlay:** current slide's speaker notes (bullets, not script), the slide's time budget, a running timer vs. the 10:00 plan (turns ochre at +15 s over, brick red at +30 s). Overlay is small, bottom-left, **hidden in screen-share-friendly way**: also provide `?presenter` URL flag that opens the notes in a separate window via `BroadcastChannel`, so the shared window stays clean. |
| `T` | toggle the thin time-budget bar on/off |
| `R` | **Read mode:** disables animation and transitions, stacks all slides vertically as a scrolling page with captions and speaker-note summaries visible. This is the takeaway version. Make `?read` also open it directly. |
| `S` | **skip the optional slide** (S10b) / jump over it if running late |
| `A` | jump to appendix index |
| `G` + number | go to slide number |
| `F` | fullscreen |
| `B` | blank (paper) screen |
| `D` | toggle the app's dark theme (optional) |
| `Esc` | exit overlays |

- Deep-linkable: `#/7` and build step `#/7/2`.
- Touch: swipe left/right.
- Persist current slide in `sessionStorage` wrapped in try/catch; the deck must work if storage is blocked.
- Accessibility: real headings per slide, `aria-live="polite"` slide announcer, visible focus states, 4.5:1 text contrast (check terracotta/ochre text on paper; use `--ink` text where contrast fails), all diagrams have `<title>`/`aria-label` text equivalents. Keyboard only operation.
- **Print stylesheet:** `@media print` renders every slide on its own 16:9 page, no animation, so the deck can also be exported as PDF.

---

## 4. Time-budget bar (small but important)

A 6-segment thin bar at the top matching the official session structure; the active segment fills as that part's allotted time passes, based on **slide position, not a clock**:

`Idea recap 1:00 · Hypothesis 1:00 · Journey 3:00 · AI learnings 2:00 · AI features 2:00 · Vision 1:00`

Segment widths proportional to minutes. Track in `--secondary`, active fill in `--brand`; segment gaps 6 px, rounded ends. It's both a design element and a pacing aid.

---

## 5. Assets

All local paths are on the speaker's machine; ask the speaker to drop the files next to the HTML (or embed as data URIs under 16 MB total). Where none exist, **build the UI as simplified SVG/HTML mock-ups in the product's style** instead of leaving gaps.

| Asset | Path | Use |
|---|---|---|
| App screenshots (14 images: join screen, screening cards, ranking top/scrolled, home after voting) | `…/digitale-leute-repo/Ideas/Flatmate.io/coursework/exercise-12/screenshots-3/` | S1, S3, S4, S13 background frames |
| Moderator screenshots (14: landing, organisation, round mgmt, rooms) | `…/exercise-12/screenshots-moderator-1/` | S3, S12 |
| Real WhatsApp quote screenshots (3; names already blurred, speaker approved use if anonymised) | `…/research/quotes/Quote 1–3.png` | S1. Use the real images, cropped tight to one message each and with any residual names/numbers blurred a second time; they prove the problem is real. |
| Usability test notes (a persona run in `exercise-12/screenshots-3/usability-test-notes.md`, a moderator run in `screenshots-moderator-1/`, a human tester's notes in `coursework/prototype-test-viktor.md`) | repo `coursework/` | S2 (quote one line each, anonymise the human tester as "a flatmate-to-be, tester") |
| Miro Now/Next/Later board | `…/archive/2026-09-story-map/Now,next,later board.jpg` | optional in S3 |
| n8n workflow screenshots (export the canvas as an image; also a screenshot of one successful run's input → output) | speaker provides | S10 (small strip), S10b (large) |
| Product tokens (only if you show product UI) | terracotta `#B6522D`, paper `#F9F4EA`, text `#321F14`; Fraunces + Work Sans | S1, S4 mock-ups |

Product screenshots in **device frames** are decorative supports, 25–40 % of the slide, partly cropped, slightly out of focus when not the subject. **Zoom into the relevant crop**; never show a full-screen screenshot at small scale.

---

## 6. Slide-by-slide spec

Timing = speaker time on that slide. Notes are **bullets for the speaker**, not a script; render them in the presenter overlay and in read mode. Copy in **bold** is on-slide text. *Italic* = caption-layer line.

### S0 — Title · 0:05
- **Layout:** `--paper`, large soft warm-glow blob lower-right. Headline centre-left.
- **On-slide:** **Smaller loops,** *tighter guardrails.* / small-caps eyebrow: `FLATMATE.IO · WHAT SEVEN WEEKS OF BUILDING WITH AI TAUGHT ME` / small: `Samuel Zink · Final Check-in · October 2026`
- **Motion:** headline reveals line by line; blob swells in; a tiny looping "ring" mark (four segments filling) bottom-left as the logo.
- **Notes:** say the title; one sentence on "this is about process, not the product".

### S1 — Idea recap · 1:00 · `01 · IDEA RECAP`
- **Headline:** **Picking a flatmate happens in a group chat.**
- **Visual:** left: two of the **real, anonymised WhatsApp messages** from the casting research, as tight crops, slightly rotated like pinned notes, with an English caption under each: *"wann ist heute Casting?"* (when is casting today?) and *"fühlt sich komisch an zu viert für 13 Leute zu entscheiden"* (feels weird deciding for 13 people with four of us). Add a small-caps tag `REAL MESSAGES · ANONYMISED`. Right: a floating phone frame showing the product's screening cards (screenshot from `screenshots-3`), slightly tilted.
- **Builds:** (1) headline + bubbles; (2) phone frame glides in; (3) a 4-step loop draws itself beneath: **Capture → Screen → Vote → Invite**, with small caption **"ranking stays hidden until you vote."**
- **Footer chip:** `for WGs with 5+ residents · every resident votes · AI never decides`
- **Notes:** problem in one breath; who it's for (WGs casting several times a year); the product loop; P-5 "AI structures text, never decides" (sets up S10).

### S2 — Hypothesis scorecard · 1:05 · `02 · HYPOTHESIS`
- **Headline:** **What I could test, and what I couldn't.**
- **Concept:** not one big hypothesis but a **scorecard of eight claims**, in three groups. Each row = claim (one line) + evidence tag(s) + result glyph + a 6–10 word finding. Rows are cards in a calm vertical stack; the glyphs are the visual hook.
- **Rows (exact wording; do not add numbers):**

  **Group 1 — Tested on the prototype** *(sage, with one ochre row)*
  1. `✓` *"A first-timer can join and vote in under 3 minutes, no instructions."* Tags: `HUMAN TEST` `HUMAN TEST` `PERSONA RUN` (draw two human pills). Finding: *success criterion set in advance: registration → first vote < 3 min · it held, no visible frustration · one tester was stuck on a hidden password rule → fixed, requirements are now shown.*
  2. `✓` *"One clear next action beats a dashboard."* Tags: `PERSONA RUN` `HUMAN TEST`. Finding: *"strongest moment in the flow" · tester clicked the notification centre first → bell dropped from v0.1.*
  3. `✓` *"One card, one tap per applicant is fast."* Tag: `PERSONA RUN`. Finding: *auto-advance, progress dots, no confirm step.*
  4. `◐` *"The vote scale explains itself."* Tags: `HUMAN TEST` `PERSONA RUN`. Finding: *tester didn't see that the bar summarises everyone's votes · and both a tester and the persona run asked: "where can I change my vote?"*

  **Group 2 — Not tested yet** *(dashed outline, muted brown, skeleton shimmer)*
  5. `?` *"Hiding the ranking until you vote motivates — without crowd-nudging."* Tag: `UNTESTED`. Finding: *built as a setting, so it can be measured against itself.*
  6. `?` *">80 % of a WG really vote."* Tag: `UNTESTED`. Finding: *no real casting yet. Synthetic data only, on purpose (see below).*

  **Group 3 — Process hypotheses, with numbers** *(ochre)*
  7. `✗` *"Spec volume is what slows the loop."* Tag: `MEASURED`. Finding: *3 m 10 s check script; 2 m 12 s was Git Bash forking → 0.9 s.*
  8. `✓` *"Tests against the real DB catch what mocks hide."* Tag: `MEASURED`. Finding: *my own over-strict RLS policy, found on day one; pooler isolation confirmed live.*

- **Builds:** (1) headline + group 1 (4 rows slide in, 120 ms stagger); (2) group 3 (process rows) *(order on screen is 1–4, then 7–8, then 5–6, so the speaker ends on the honest part)*; (3) group 2 slides in last and the whole stack **dims slightly while a callout card rises over rows 5–6**:
  > **Why no real casting yet?**  
  > Real applicant data comes after I close open DB-security trade-offs (F3 change 6, F5 change 5) and the application-management gaps. Until then: GDPR first, synthetic data only.
  (4) a final small terracotta line: `Friends tested along the way. Their feedback went straight into the next change.` and below it: `Gated until evidence: solver · calendar · veto · notifications · PWA`.
- **Design notes:** the persona-run tag must be visibly different from the human-test tag (that difference is the honesty of this slide). Add a tiny legend bottom-right explaining the four tags in six words each: *"AI agent played a user" / "a real person" / "I timed or counted it" / "not yet."*
- **Notes (bullets for the speaker):**
  - Say clearly which tests were **humans** (two short prototype tests, plus friends who tried it along the way) and which were an **AI persona run** at phone size. So "supported", not "proven".
  - Row 1 had a success criterion set before the test: onboarding under 3 minutes. It held.
  - The humans found what the persona run could not feel: a hidden password rule that blocked joining (fixed), and that the vote bar is a summary of everyone's votes.
  - Convergence: both human testers and the persona run asked "how do I change my vote?". That feedback became the **revise** feature (change or withdraw your own rating on the candidate card). Detail on S5.
  - Two claims are untested, including the product thesis (>80 % participation). Reason: I chose not to put real applicant data in until the DB-security trade-offs are closed.
  - The process claims are the ones I can back with numbers; the biggest surprise was ✗: it wasn't the specs, it was a shell fork cost.
  - Product vs. process: the product is not proven; the way of building it is measurably better than at the start.

### S3 — Journey timeline · 0:30 · `03 · JOURNEY`
- **Headline:** **Seven weeks. 558 commits.**
- **Visual:** a full-width horizontal timeline that **scrolls like a camera pan** across 5 phases as builds advance: `SPEC (Aug 18) → PROTOTYPE (Sep 16) → spec-kit F0/F1 (Sep 16) → OpenSpec pivot (Sep 18) → slices F2–F5 (Sep 21 →)`. Each phase a coloured band; PR numbers as mono chips riding the line (#4, #23, #39, #50, #64). The pivot marker (Sep 18) is ochre and larger.
- **Number strip (count-up, small):** `67 PRs · 29 archived changes · 37 migrations · ~1,600 tests · 1 human`
- **Builds:** pan 1 (spec + prototype) → pan 2 (pivot) → pan 3 (slices) → numbers.
- **Notes:** orientation only; don't narrate every phase; "three of those arrows are the next three slides".

### S4 — Slice vs. perfectionism · 0:55 · `03 · JOURNEY`
- **Headline:** **I wanted every feature *deep* before the next one.**
- **Visual (the metaphor):** left: six tall, wide horizontal "slabs" stacked (F0…F5, each labelled, each almost-finished). On build 2 they **rotate/shift into one thin vertical bar** running through all layers = the vertical slice, glowing terracotta; the leftover slab portions fade to 20 %.
- **Right column:** a short **"Cut" ledger** that types in: `✂ browsing between candidates — "nothing to burn tokens on right now"` · `✂ F3 deletion → after the pitch` · `✂ 11 DB-break test branches → 1 invariant guard` · `✂ solver · calendar · veto · notifications · PWA` · `✂ "I do not want 5 worktrees"`.
- **Builds:** (1) headline + slabs; (2) slabs collapse into the slice; (3) cut ledger; (4) quote line: **"Screening Pass is merged and done for now."** — Oct 2.
- **Notes:** *(check-in 2 ended with "next time: one thin slice in week 1"; this slide is the follow-through: what I actually cut since.)* the check-in deadline forced the cut; F4 was pulled ahead of F3 for the pitch (Sep 30) when the weekly token budget was ~50 % gone; the cut didn't hurt, the slice exposed real problems earlier; honesty: planning weight (F5 plan ~950 lines, 15 questions before any code) is still my reflex.

### S5 — Specs and users both change the plan · 0:40 · `03 · JOURNEY`
- **Headline:** **Detailed specs. Loose grip.**
- **Visual:** a two-beat split. *(The stopwatch/Git-Bash story lives on S2, so don't repeat it here. The "legacy specs" story was told in check-in 2; at most a one-line callback, this deck has a different focus.)*
  - **Beat A (left), "Feedback → change" (confirmed by the speaker):** a short two-lane ledger, tester quote on the left, shipped change on the right, joined by a thin terracotta arrow that draws in:
    1. `HUMAN TEST ×2 + PERSONA RUN` *"Where can I change my vote?"* → **Revise:** change or withdraw your own rating on the candidate card.
    2. `HUMAN TEST` *"Let me see who voted how."* → **Household setting:** make vote authorship visible.
    Keep it to these two (add a third only if the speaker confirms another concrete change). Then, smaller, the earlier case below.
  - **Beat A, second part, "When a user disagrees with the spec, the spec loses":** two stacked cards. Top card (muted brown, struck through in brick red): *spec + PRD: new residents land on screening.* Bottom card (ink): *test says: land on the dashboard → dashboard.* Small tag `HUMAN OVERRIDE · SEP 18`. A second, smaller pair below: *a spec said "no maximum" and "always a maximum" for the same invite link; one sentence, two readings, and the text becomes the tests.*
  - **Beat B (right), "The agent copies your examples literally":** a spec snippet card containing an example line `Absolutely · I like · Rather not · No` and next to it the built vote bar rendered exactly in that order (strongest first), with a brick-red arrow and the stamp **"Built exactly as written. Wrong bar."** Beneath it, the corrected bar (`No · Rather not · I like · Absolutely`, product vote colours) with a sage tick.
- **Builds:** (1) headline + Beat A; (2) Beat B; (3) a small footer chip: `spec-kit → OpenSpec · change-sized specs · decisions written down, then the docs follow`.
- **Notes:** the loop that worked: user test → written down → spec/design changed → shipped as its own change (revise = F5 change 4; show-who-voted = the household setting from candidate detail). Friends also tried the app along the way and their feedback fed the next changes. First week: 8,798 lines of spec in a day, the right start; the spec is read **literally** by the agent (the example line built the wrong bar; the spec itself said so: "the mistake came from my spec"); when a user test or a human decision disagrees, change the spec in the same change, not later; check-in 2 covered legacy specs, so only a one-line callback.

### S6 — Where should tests run? · 0:45 · `03 · JOURNEY`
- **Headline:** **Local for truth. Runner for speed.**
- **Visual:** two horizontal "lanes" with stopwatch bars racing in parallel.
  - Lane 1 **CI → hosted dev DB (EU)**: bar grows to **6 m 17 s**, tiny brick-red ticks for `17 timeouts`, `orphaned households`.
  - Lane 2 **CI → disposable DB in the runner**: bar stops at **~4 min** (median 242 s) in terracotta.
  - Under both, a third thinner lane: **Local + pre-push → still the real hosted DB** (green-ish sage `#69AA77`, labelled "keeps catching real RLS bugs").
- **Builds:** (1) headline + lane 1; (2) lane 2 overtakes; (3) local lane + quote **"3 min 50 is still better than 6 min 20."** (4) small brick-red footnote chip: `but: a shared dev DB is one accidental DELETE away` (two incidents, Oct 5–6).
- **Notes:** first CI against the live DB was 47 s green; then 350 s with 17 timeouts and orphaned test data; decision Sep 25: don't trade away real-DB realism locally; move only GitHub CI to a runner DB; pre-set a go/no-go bar, tested on a draft PR, reverted two experiments; the honest downside.

### S7 — The loop · 0:40 · `04 · AI LEARNINGS`
- **Headline:** **Opus plans. Sonnet applies. A human walks it.**
- **Visual:** a **circular pipeline** (one revolution per build step) with 9 nodes: `Explore (Opus)` → `Propose (Opus)` → `Pre-mortem (Sonnet, separate)` → `Apply (Sonnet)` → `Diff review (Opus)` → `verify gate` → `Human walkthrough` → `/code-review` → `Archive → PR → Copilot`. Model nodes are tinted by role (Opus = terracotta, Sonnet = ochre, human = ink, gates = paper tint). Centre: **one change per fresh session**.
- **Builds:** (1) first three nodes; (2) next three; (3) last three + ring closes; (4) centre label.
- **Notes:** rule since Sep 21; planning errors are the expensive ones; the pre-mortem agent sees only artifacts, not the author's reasoning; plan file = memory that survives a `/clear`.

### S8 — The hazard log · 0:45 · `04 · AI LEARNINGS`
- **Headline:** **Writing a lesson down is not applying it.**
- **Visual:** a **flow that turns incidents into guardrails**: left a stack of brick-red-edged "incident" cards (caution callout style) (PR #23 · 5 review rounds, 22 issues · PR #56 · founding-link cap · roles as shortcuts), arrows → `memory note` → `CLAUDE.md / .claude/rules` → `pre-mortem prompt` → `lint` (a small badge "9 guardrail lints"). A second, smaller chart on the right: **"where the defects were"** two stacked bars: *F1 era: ~17 in the applier* vs *OpenSpec era: ~10 in design, 4 in tasks* with the caption **The leak moved.**
- **Builds:** (1) incidents; (2) the flow draws; (3) the two bars; (4) quote **"I ran the pre-mortem myself… and it missed them."** (small)
- **Notes:** *(check-in 2 already said "hazard files, not just fixing instances"; here, show only what happened since: the rule became a lint, and the leak moved from code into the plan)* the loop that matters is incident → rule → lint; "fix the class, not the instance" (sibling flows came back in review round 3); the AI repeated mistakes until the rule was mechanical; the defect source moved from code to plan, so I added a separate pre-mortem agent.

### S9 — Tokens are a scheduler · 0:35 · `04 · AI LEARNINGS`
- **Headline:** **Budget decides the roadmap.**
- **Visual:** a horizontal **weekly budget gauge** (0–100 %) with three event pins: `Sep 30 · ~50 % → F3 paused, F4 pulled ahead` · `Oct 3 · 2 % → "open the PR first"` · `Oct 7 · 76 % → two refactors skipped`. Under it, three small icons-in-circles (SVG): **plan file as memory**, **Sonnet agent stopped mid-task by a 5-hour limit — Opus finished it**, **Haiku for cheap steps**.
- **Builds:** (1) gauge fills; (2) pins appear; (3) three small points.
- **Notes:** limits are a real scheduler, so plan files must survive `/clear`; sub-agents die on limits; honest: "do sub-agents save main context? Yes, but I didn't measure it."

### S10 — AI, deliberately last · 0:45 · `05 · AI FEATURES`
- **Headline:** **I kept AI out of a housing decision. On purpose.**
- **Concept:** the slide is a **stance**, not a feature tour. Housing is sensitive; the rule since day one is P-5: *AI may structure text, never decide about people.* So AI features were **postponed**, not forgotten.
- **Visual:** a calm three-column layout.
  1. **Postponed (dashed outline card, muted brown):** `automatic scoring ✗ · AI ranking ✗ · AI "fit" suggestions ✗`, labelled **never**.
  2. **Built, but fenced (terracotta-tinted panel: `--brand` @ 5 % fill, 30 % border, radius 24):** `n8n applicant parser`: a **small horizontal strip of 3 screenshots** (canvas · input text · structured output) with a tick *"a human confirms every field"* and a shield on a **Guard** node: *"drops anything the source doesn't back"*. Tag line: `prototype · synthetic data only`.
  3. **Developer-side only (paper-tint card):** `RAG over my own specs`, pointing to the next slide.
- **Builds:** (1) headline + column 1; (2) column 2 with the three screenshots appearing in sequence (slow crossfade); (3) column 3.
- **Footer chips:** `real applicant text only after EU processing + a DPA` · `provider pivot: Mistral → Anthropic/OpenAI (no key in scope)`
- **Notes:** *no live demo.* One sentence on what the parser does (paste text → fields → a human confirms); it's a prototype not wired into the app; the guard is deterministic code so the model can't invent contacts; why: housing is sensitive and the trade-offs on personal data aren't closed yet, so AI features wait. If time is short, say this slide and skip S10b.

### S10b — OPTIONAL · The n8n workflow, in pictures · 0:40 · `05 · AI FEATURES`
- **Skippable.** Show a `OPTIONAL` small-caps chip top-right (hidden in print/read mode where it's simply the next slide). `S` skips over it.
- **Headline:** **What the parser actually does.**
- **Visual:** a large, cleanly redrawn **n8n flow** (SVG, simplified from 16 to 7 nodes): `Webhook → Validate → Extract (LLM) → Structured parser → Guard (code, no AI) → Respond 200 / 502 → manual entry`. Underneath, an **input → output** card using a real **screenshot of one successful run** (synthetic text) and the resulting JSON.
- **Builds:** (1) flow draws left→right; (2) guard node expands: `message kept verbatim · only 5 keys leave · unsupported values dropped · age 0–150 · 13 unit tests · 4 fixtures incl. a prompt-injection case`; (3) input → output card; (4) a small line: `failure → manual entry`.
- **Notes:** recorded screenshots only; the point is "AI as a bounded step with a deterministic guard", not the tool.

### S11 — Same score, 40× cheaper · 0:35 · `05 · AI FEATURES`
- **Headline:** **Haiku matched Opus. At 1/40 of the cost.**
- **Visual:** two big numeric cards side by side: **`$0.015` Haiku 5.5 · 18/19** and **`$0.66` Opus 5.5 · 18/19**, the Opus card visually 40× larger in area, Haiku card tiny but glowing. Beneath, a mini pipeline: `docs → 1,284 chunks → LanceDB (local) → two tiers → answer`. A small brick-red note: **"Haiku first scored 17/19. That was my parser bug, not Haiku's."**
- **Builds:** (1) pipeline; (2) two cards; (3) brick-red note; (4) footnote `no LLM reranking, to keep retrieval measurable · hit@5 12/13`.
- **Notes:** flatmate-rag over the spec docs for Exercise 18; two tiers = living docs first, historical only if needed (my design); rejected reranking with an LLM since it would defeat comparing RAG to Claude retrieval; checks are structural, not answer-quality; verifying the *tool's* result mattered (my citation regex).
- No service bot is part of this deck.

### S12 — Vision · 0:50 · `06 · VISION`
- **Headline:** **Close the data questions. Then test a real casting.**
- **Visual:** a **path** (curving SVG) with three stops that illuminate on build:
  1. **Now → safe to test:** close the DB-security trade-offs (F3 change 6, F5 change 5) and the application-management gaps → a **real WG pilot with consented data**; measure the open claims from S2 (does the hidden ranking motivate? do >80 % vote?).
  2. **Next (v0.2):** notifications · PWA · veto · a role-permission tab so households tune their own role sets within product bounds. *AI parsing only if EU processing + a DPA are in place.*
  3. **Later (v1.1+):** explainable scheduling (solver; the most expensive single decision, held until evidence) · calendar · browser extension.
- A thin terracotta baseline under the path: **"AI never decides who lives where."**
- **Notes:** evidence before features; the five gated features stay gated until the pilot; scaling = more households, not more features; AI stays at the edge: structuring text, never judging.

### S13 — Takeaways + Q&A · hold on screen
- **Headline:** **Five things I'd tell myself on day one.**
- **List (one line each, numbers draw in):**
  1. **Cut to a slice first.** Depth comes after something works end to end.
  2. **Write the lesson into the repo.** A lint beats a memory.
  3. **Pre-mortem with a different agent.** You can't review your own plan.
  4. **Measure before you rewrite.** The cost is rarely where it feels.
  5. **Verify with your own eyes.** "Fixed" is a claim, not a result.
- **Footer:** `Samuel Zink · github.com/SmokeyRGB · Questions?` and a small `A` hint: "appendix".
- **Motion:** the warm glow returns to the title-slide composition (closing the loop). Held on screen for the 5-min Q&A: ambient motion only.

### Appendix (key `A`; not in the 10-min flow; each with a back-to-index link)
- **A1 · Architecture of the process:** the full pipeline diagram (docs spec chain → OpenSpec change → plan file → pre-mortem → apply → review → gates → PR), with the hierarchy of authority (GUARDRAILS > SRD > PRD > Compliance > UX > design system).
- **A2 · The nine guardrail lints:** table: import-boundary · session-context · rls-coverage · data-inventory · definer-coverage · migration-shape · guarded-tests · pending-feedback · role-reads, each with a one-line "what it stops".
- **A3 · Numbers:** the numbers table (commits 558, PRs 67, archived changes 29, migrations 37, tests ~1,600, sessions 133, ~35 M output tokens *(approx.)*, CI 6m17→~4min, PR #23: 27 reviews/5 Copilot rounds/22 issues).
- **A4 · Decision log:** 8 cards (date, decision, why): Sep 11 Supabase Auth + ADR-013 · Sep 18 OpenSpec pivot · Sep 18 joiner lands on dashboard (user test overruled spec) · Sep 25 CI on runner DB · Sep 28 roles are permission sets · Sep 30 F4 before F3 · Oct 9 Mistral → Anthropic/OpenAI · Oct 13 browsing cut.

---

## 7. Timing summary (core ≈ 9:10, with the optional slide ≈ 9:50)

| Slide | Part | Time |
|---|---|---|
| S0 | title | 0:05 |
| S1 | Idea recap | 1:00 |
| S2 | Hypothesis scorecard | 1:05 |
| S3–S6 | Journey | 0:30 + 0:55 + 0:40 + 0:45 = 2:50 |
| S7–S9 | AI learnings | 0:40 + 0:45 + 0:35 = 2:00 |
| S10–S11 | AI features | 0:45 + 0:35 = 1:20 |
| S10b | *optional* n8n in pictures | +0:40 (skip with `S`) |
| S12 | Vision | 0:50 |
| **Core total** | | **9:10** (≈ 50 s of breathing room) |
| **With S10b** | | **9:50** |
(Q&A 5:00 on S13. The time-budget bar in §4 still follows the guide's 1/1/3/2/2/1: the "AI features" segment is 2:00 only when S10b is shown; otherwise it simply ends early and the spare time stays as buffer.)

---

## 8. Do / Don't

**Do**
- Keep a lot of empty paper space; let the warm glow breathe.
- Let each number and diagram *arrive* slowly; the speaker will talk over it.
- Show mistakes with a **brick-red stamp** treatment. They are the proof of learning.
- Make every slide readable in a 1280×720 screen share, including the caption layer.

**Don't**
- No bullet-point walls, no stock icons, no emoji, no gradients on body text.
- No fast, bouncy or spinning transitions; no autoplay; no audio.
- Don't show real personal data **except the anonymised WhatsApp quote crops and the speaker's own tester notes** (speaker-approved). No real names (the human tester is "a tester"), emails, phone numbers, keys, project refs, URLs containing invite codes, `.env` values. All applicant text in screenshots is synthetic.
- Don't let a persona run look like a human test; always use the evidence tags (§1.3). Human tests: two short prototype tests plus informal tests by friends; the Oct 12 "tester" and the Playwright runs are `PERSONA RUN`. Never give a number of friends; say "friends".
- **Focus of this deck is unique:** it is a reflection on *process* (decisions, struggles, learnings), not a product demo or an extended earlier check-in. Re-introducing the app and its audience (S1) is expected by the guide; anything else should be new framing.
- Don't present any AI feature as a selling point. The AI slides are about restraint.
- Don't invent numbers. If a number isn't in this brief, leave it out. Numbers marked "(approx.)" stay marked.
- Don't show the product as the hero; it's a supporting visual.

---

## 9. Acceptance checklist

- [ ] Single HTML file opens with a double-click; fonts degrade gracefully offline.
- [ ] 14 main slides + 1 optional slide (S10b, `S` skips it) + 4 appendix slides; every build step works forward and backward.
- [ ] Evidence tags and result glyphs on S2 are visually distinct (persona run vs human test especially).
- [ ] Transitions rotate across the five types; none under 900 ms.
- [ ] `P` presenter overlay + `?presenter` second window; `R` read mode; `?read`; print stylesheet.
- [ ] Time-budget bar matches 1/1/3/2/2/1.
- [ ] `prefers-reduced-motion` honoured; keyboard-only operation works; contrast checked.
- [ ] No live-demo dependency anywhere; S10/S10b use screenshots only and work offline.
- [ ] No real personal data anywhere.
- [ ] Works at 1280×720 and 1920×1080; no horizontal scroll in read mode at phone width (16 px gutters).
