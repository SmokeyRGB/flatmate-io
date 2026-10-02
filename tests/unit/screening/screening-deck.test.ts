import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ScreeningCard } from "@/modules/deliberation/repository";

// F4 change 1 tasks 7.7: the deck's markup, rendered with createElement + renderToStaticMarkup
// (the repo has no testing-library and vitest collects only tests/**/*.test.ts in the node
// environment; the pattern of tests/unit/casting/capture-page.test.ts).
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("server-only", () => ({}));
vi.mock("@/app/(resident)/casting/screening/actions", () => ({ castVoteAction: vi.fn() }));

const CARDS: ScreeningCard[] = [
  { applicationId: "a1", applicantName: "Testperson Eins", age: 27, messageRaw: "Hallo!", attributes: [{ label: "Beruf", value: "Lehrerin" }] },
  { applicationId: "a2", applicantName: "Testperson Zwei", age: null, messageRaw: null, attributes: null },
  { applicationId: "a3", applicantName: "Testperson Drei", age: null, messageRaw: null, attributes: null },
];
// Not the defaults, so a hardcoded 0/1/3/5 in the component would fail.
const WEIGHTS = { no: 0, rather_not: 1, good: 4, definitely: 5 };

async function renderDeck() {
  const { ScreeningDeck } = await import("@/app/(resident)/casting/screening/screening-deck");
  return renderToStaticMarkup(
    createElement(ScreeningDeck, { roundId: "r1", roundTitle: "Herbstrunde", weights: WEIGHTS, cards: CARDS }),
  );
}

function ratingFormOf(markup: string): string {
  const start = markup.indexOf('<form');
  return markup.slice(start, markup.indexOf("</form>", start));
}

function buttonsOf(form: string): string[] {
  return form.split("<button").slice(1).map((b) => "<button" + b.split("</button>")[0]);
}

const textOf = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

describe("ScreeningDeck markup", () => {
  it("offers four buttons in order, each with a symbol and a label, and no digit", async () => {
    const form = ratingFormOf(await renderDeck());
    const buttons = buttonsOf(form);
    expect(buttons).toHaveLength(4);
    const labels = ["Nein", "Eher nicht", "Finde gut", "Unbedingt"];
    const values = ["no", "rather_not", "good", "definitely"];
    const colourClasses = ["rating-btn-no", "rating-btn-rather-not", "rating-btn-good", "rating-btn-definitely"];
    buttons.forEach((b, i) => {
      expect(b).toContain(`value="${values[i]}"`);
      // Each level carries its own colour class (a red-to-green scale), never sharing one.
      expect(b).toContain(colourClasses[i]);
      colourClasses.filter((c, j) => j !== i).forEach((other) => expect(b).not.toContain(other));
      expect(b).toContain("<svg"); // the symbol
      expect(textOf(b)).toContain(labels[i]);
      expect(textOf(b)).not.toMatch(/\d/);
    });
    expect(textOf(form)).not.toMatch(/\d/);
  });

  it("the pop-over shows the round's frozen weights (0/1/4/5), not the defaults", async () => {
    const markup = await renderDeck();
    const start = markup.indexOf('id="weights-popover"');
    const panel = textOf(markup.slice(start, markup.indexOf("</div>", start)));
    expect(panel).toContain("Nein: 0 Punkte");
    expect(panel).toContain("Eher nicht: 1 Punkt");
    expect(panel).toContain("Finde gut: 4 Punkte");
    expect(panel).toContain("Unbedingt: 5 Punkte");
    expect(panel).toContain("= dein Favorit");
    expect(panel).toContain("Der große Sprung liegt zwischen Eher nicht und Finde gut.");
    expect(panel).not.toContain("3 Punkte");
  });

  it("the (?) control is a labelled popover trigger", async () => {
    const markup = await renderDeck();
    // React writes the attribute as popoverTarget; HTML attribute names are case-insensitive.
    expect(markup).toMatch(/popovertarget="weights-popover"/i);
    expect(markup).toContain('aria-label="Punkte der Stufen anzeigen"');
  });

  it("the progress element carries aria-valuenow and aria-valuemax", async () => {
    const markup = await renderDeck();
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="1"');
    expect(markup).toContain('aria-valuemax="3"');
    expect(markup).toContain('aria-valuetext="1 von 3"');
  });

  it("shows the first card's name, age, message and attributes, and no contact or budget text", async () => {
    const markup = await renderDeck();
    const text = textOf(markup);
    expect(text).toContain("Testperson Eins");
    expect(text).toContain("27 Jahre");
    expect(text).toContain("Hallo!");
    expect(text).toContain("Beruf: Lehrerin");
    expect(text).not.toMatch(/@|E-Mail|Telefon|Kontakt/i);
    expect(text).not.toMatch(/Budget|Favoriten|Warnung|Stimmen der anderen/i);
  });

  // Human amendment 2026-09-30 (D9): the neighbours are REAL cards, so the card being revealed is
  // already there; they are hidden from assistive technology and inert.
  it("renders the next card with its real content, hidden and inert, beneath the current one", async () => {
    const markup = await renderDeck();
    const cards = markup.split('class="deck-card card"').slice(1);
    expect(cards).toHaveLength(2); // current + next (there is no previous card at index 0)
    const [current, next] = cards;
    expect(current).toContain('data-pos="current"');
    expect(current).not.toContain("aria-hidden");
    expect(current).toContain("Testperson Eins");
    expect(next).toContain('data-pos="next"');
    expect(next).toContain('aria-hidden="true"');
    expect(next).toMatch(/inert/);
    expect(textOf(next)).toContain("Testperson Zwei");
    // The third card is not rendered yet.
    expect(markup).not.toContain("Testperson Drei");
  });

  it("the card type has no contact field", () => {
    // @ts-expect-error a contact field does not exist on ScreeningCard (Q-2, Art. 5(1)(c))
    const withContact: ScreeningCard = { ...CARDS[0], contactEmail: "x@example.test" };
    expect(withContact).toBeDefined();
  });
});

describe("RatingBar", () => {
  it("marks the selected rating with aria-pressed and a non-colour signal, on that one button only", async () => {
    const { RatingBar } = await import("@/app/(resident)/casting/screening/screening-deck");
    const markup = renderToStaticMarkup(
      createElement(RatingBar, { selected: "good", chosen: null, busy: false, onSubmit: () => {} }),
    );
    const buttons = buttonsOf(ratingFormOf(markup));
    const pressed = buttons.map((b) => b.includes('aria-pressed="true"'));
    expect(pressed).toEqual([false, false, true, false]);
    expect(buttons[2]).toContain("rating-check"); // the check glyph
    expect(textOf(buttons[2])).toContain("gewählt"); // the hidden companion text
    expect(buttons.filter((b) => b.includes("rating-check"))).toHaveLength(1);
  });

  it("marks nothing when the card is unrated", async () => {
    const { RatingBar } = await import("@/app/(resident)/casting/screening/screening-deck");
    const markup = renderToStaticMarkup(
      createElement(RatingBar, { selected: undefined, chosen: null, busy: false, onSubmit: () => {} }),
    );
    expect(markup).not.toContain('aria-pressed="true"');
  });
});

// Breaks (tasks 7.7): render `points(n)` on a button; drop `aria-pressed`; drop a colour class -> each fails.
