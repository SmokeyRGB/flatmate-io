import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { RatingResult } from "@/app/(resident)/casting/candidate-actions";
import { de } from "@/ui/strings";
import { renderWithStrings } from "../../helpers/render-with-strings";

// candidate-revise D5: the own-rating section of the detail card. `ratingOutcome` is the pure result
// logic (no DOM environment here); the markup is rendered with renderWithStrings.
vi.mock("server-only", () => ({}));
// The real module, so failedUnlessNavigation is tested against a genuine NEXT_REDIRECT error.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/app/(resident)/casting/candidate-actions", () => ({
  changeRatingAction: vi.fn(),
  withdrawRatingAction: vi.fn(),
}));

const t = de.casting.detail;
const { ratingOutcome, OwnRating, failedUnlessNavigation } = await import("@/app/(resident)/casting/own-rating");
const { redirect, RedirectType } = await import("next/navigation");

// Code review: a successful withdrawal redirects, and its client promise rejects with NEXT_REDIRECT.
// That must propagate, never turn into the failure message. Break: catch with a plain failedResult.
describe("failedUnlessNavigation", () => {
  it("rethrows Next's redirect error", () => {
    let redirectError: unknown;
    try {
      redirect("/casting/screening", RedirectType.replace);
    } catch (err) {
      redirectError = err;
    }
    expect(redirectError).toBeDefined();
    expect(() => failedUnlessNavigation(redirectError)).toThrow();
  });

  it("maps any other rejection to failed", () => {
    expect(failedUnlessNavigation(new Error("network"))).toEqual({ ok: false, code: "failed" });
  });
});

describe("ratingOutcome", () => {
  const refused = (code: Extract<RatingResult, { ok: false }>["code"]): RatingResult => ({ ok: false, code });

  it.each([
    [{ ok: true } as RatingResult, {}],
    [refused("no_session"), { signIn: true }],
    [refused("not_votable"), { message: "notVotable" }],
    [refused("round_not_open"), { message: "roundNotOpen" }],
    [refused("not_eligible"), { message: "notPossible" }],
    [refused("not_found"), { message: "notPossible" }],
    [refused("own_application"), { message: "notPossible" }],
    [refused("failed"), { message: "failed" }],
    [refused("invalid_input"), { message: "failed" }],
  ])("maps %j to %j", (result, expected) => {
    expect(ratingOutcome(result)).toEqual(expected);
  });

  it("every message has a German text that apologises", () => {
    for (const key of ["notVotable", "roundNotOpen", "notPossible", "failed"] as const) {
      expect(t.outcome[key]).toMatch(/^Sorry, /);
    }
  });
});

function render(own: { rating: "no" | "rather_not" | "good" | "definitely" | null; canChange: boolean }, state = "new", roundStatus = "open") {
  return renderWithStrings(
    createElement(OwnRating, {
      roundId: "r",
      applicationId: "a",
      applicantName: "Anna",
      own,
      roundStatus,
      state,
    }),
  );
}
const textOf = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const ratingForm = (html: string) => html.slice(html.indexOf("<form"), html.indexOf("</form>") + 7);
const buttonsOf = (html: string) => html.split("<button").slice(1).map((b) => "<button" + b.split("</button>")[0]);

describe("OwnRating markup", () => {
  it("with canChange: four rating buttons, the held one pressed, and the withdraw button", () => {
    const html = render({ rating: "good", canChange: true });
    const buttons = buttonsOf(ratingForm(html));
    expect(buttons).toHaveLength(4);
    expect(buttons.map((b) => b.includes('aria-pressed="true"'))).toEqual([false, false, true, false]);
    expect(textOf(html)).toContain(t.ownRatingLabel);
    expect(textOf(html)).toContain(t.withdraw);
    // The confirmation: a dialog with a submit button and a cancel.
    expect(html).toContain("<dialog");
    expect(textOf(html)).toContain(t.withdrawBody("Anna"));
    expect(textOf(html)).toContain(t.withdrawConfirm);
    expect(textOf(html)).toContain(t.withdrawCancel);
  });

  it("paused: the rating as text with the paused reason, and no controls", () => {
    const html = render({ rating: "good", canChange: false }, "new", "paused");
    expect(textOf(html)).toContain("Finde gut");
    expect(textOf(html)).toContain(t.pausedReason);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<dialog");
  });

  it("invited: the rating as text with the final reason, and no controls", () => {
    const html = render({ rating: "definitely", canChange: false }, "invited");
    expect(textOf(html)).toContain("Unbedingt");
    expect(textOf(html)).toContain(t.finalReason("Anna"));
    expect(html).not.toContain("<button");
  });

  it("no rating: „nicht bewertet“ and no controls", () => {
    const html = render({ rating: null, canChange: false }, "invited");
    expect(textOf(html)).toContain(t.notRated);
    expect(html).not.toContain("<button");
  });
});
