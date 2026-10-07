import { createElement } from "react";
import { renderWithStrings } from "../../helpers/render-with-strings";
import { describe, expect, it, vi } from "vitest";
import type { CandidateDetail } from "@/modules/deliberation/repository";
import { explainScore } from "@/modules/deliberation/ranking";
import { de } from "@/ui/strings";

// F5 candidate-detail task 7.8: the detail's markup, one case per kind, rendered with createElement
// + renderToStaticMarkup like ranking-board.test.ts. The pure CandidateDetailBody is rendered, not
// the async CandidateDetailView (which reads the session and the repository). Names are digit-free
// synthetic ones. This file must stay free of DetailSheet and ViewTransition (design D1).
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }), redirect: vi.fn() }));
vi.mock("@/app/(org)/rounds/[id]/applications/invite-actions", () => ({ inviteApplicationAction: vi.fn() }));
vi.mock("@/modules/identity/session-cookie", () => ({ getCurrentSession: vi.fn() }));
vi.mock("@/modules/casting/repository", () => ({ getStartOverview: vi.fn() }));
vi.mock("@/modules/deliberation/repository", () => ({
  getAwaitingVoteCounts: vi.fn(),
  getCandidateDetail: vi.fn(),
}));
vi.mock("@/app/holds-permission", () => ({ holdsPermission: vi.fn() }));

const t = de.casting.detail;
const WEIGHTS = { no: 0, rather_not: 1, good: 3, definitely: 5 };
const ROUND = { id: "r", title: "Herbstrunde", status: "open" as const };

type Scored = Extract<CandidateDetail, { kind: "scored" }>;
type Unscored = Extract<CandidateDetail, { kind: "unscored" }>;

const CARD = {
  applicationId: "a",
  applicantName: "Anna",
  age: null,
  messageRaw: "Hallo",
  attributes: null,
  state: "new" as const,
};

function scored(over: Partial<Scored> = {}): Scored {
  return {
    kind: "scored",
    round: ROUND,
    application: CARD,
    score: 55,
    n: 4,
    denominator: 7,
    weights: WEIGHTS,
    distribution: { no: 1, rather_not: 0, good: 2, definitely: 1 },
    explanation: explainScore(WEIGHTS, ["no", "good", "good", "definitely"]),
    formerCount: 0,
    authorship: null,
    ...over,
  };
}

function unscored(over: Partial<Unscored> = {}): Unscored {
  return {
    kind: "unscored",
    round: ROUND,
    application: CARD,
    n: 1,
    needed: 3,
    denominator: 7,
    formerCount: 0,
    voters: null,
    ...over,
  };
}

async function render(detail: CandidateDetail, canInvite = false, mode: "sheet" | "page" = "sheet") {
  const { CandidateDetailBody } = await import("@/app/(resident)/casting/candidate-detail-body");
  return renderWithStrings(createElement(CandidateDetailBody, { detail, canInvite, mode }));
}

const textOf = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const withoutSvg = (html: string) => html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/ class="[^"]*"/g, "");

describe("CandidateDetailBody", () => {
  it("scored: the ring, the bar's text equivalent, the participation and the arithmetic", async () => {
    const html = await render(scored());
    expect(html).toContain("score-ring");
    expect(html).toContain("distribution-bar");
    expect(textOf(html)).toContain("1× Nein, 0× Eher nicht, 2× Finde gut, 1× Unbedingt");
    expect(textOf(html)).toContain("4 von 7 haben abgestimmt");
    // The "(?)" arithmetic ends on the ring's score.
    expect(textOf(html)).toContain("(0 + 3 + 3 + 5) ÷ 4 = 2,75 → 2,75 ÷ 5 × 100 = 55");
    expect(html).toContain('id="detail-arithmetic-popover"');
  });

  it("the distribution follows the voting buttons' order, weakest to strongest, in the bar, the text and the names", async () => {
    const html = await render(
      scored({ authorship: { no: ["Nora"], rather_not: [], good: ["Gina"], definitely: ["Dora"] } }),
    );
    const seg = (cls: string) => html.indexOf(`class="${cls}"`);
    expect(seg("dist-seg-no")).toBeGreaterThan(-1);
    expect(seg("dist-seg-no")).toBeLessThan(seg("dist-seg-good"));
    expect(seg("dist-seg-good")).toBeLessThan(seg("dist-seg-definitely"));
    const text = textOf(html);
    expect(text.indexOf("× Nein")).toBeLessThan(text.indexOf("× Unbedingt"));
    expect(text.indexOf("Nein: Nora")).toBeLessThan(text.indexOf("Unbedingt: Dora"));
  });

  it("unscored: no ring, no bar, the needed notice and the participation", async () => {
    const html = await render(unscored());
    expect(html).not.toContain("score-ring");
    expect(html).not.toContain("distribution-bar");
    expect(textOf(html)).toContain(t.needed(2, 3));
    expect(textOf(html)).toContain("1 von 7 haben abgestimmt");
  });

  it("hidden: the name, the state and the way to vote, and no number at all", async () => {
    const html = await render({
      kind: "hidden",
      round: ROUND,
      application: { id: "a", name: "Hanna", state: "new" },
    });
    expect(textOf(html)).toContain("Hanna");
    expect(textOf(html)).toContain(t.hiddenExplanation);
    expect(html).toContain('href="/casting/screening"');
    expect(textOf(withoutSvg(html))).not.toMatch(/\d/);
  });

  it("a refusal shows one line, and not_found names nothing", async () => {
    const html = await render({ kind: "refused", reason: "not_found" });
    expect(textOf(html)).toBe(t.notFound);
  });

  it("the former-members note appears with a count, singular and plural, and not without one", async () => {
    expect(textOf(await render(scored({ formerCount: 1 })))).toContain(t.formerNote(1));
    expect(textOf(await render(scored({ formerCount: 2 })))).toContain(t.formerNote(2));
    expect(textOf(await render(scored()))).not.toContain("entfernt");
  });

  it("flag off renders no names; flag on renders the names with their ratings, or without for an unscored one", async () => {
    const off = textOf(await render(scored()));
    expect(off).not.toContain(t.authorshipHeading);
    const on = textOf(
      await render(
        scored({ authorship: { no: ["Nora"], rather_not: [], good: ["Gina", "Gus"], definitely: ["Dora"] } }),
      ),
    );
    expect(on).toContain(t.authorshipHeading);
    expect(on).toContain("Gina, Gus");
    const names = textOf(await render(unscored({ voters: ["Kim", "Sam"] })));
    expect(names).toContain(t.votersHeading);
    expect(names).toContain("Kim, Sam");
    expect(textOf(await render(unscored()))).not.toContain(t.votersHeading);
  });

  describe("„Einladen“", () => {
    const invite = de.invite.open;
    it("is offered to a moderator on a new candidate, scored or not", async () => {
      expect(textOf(await render(scored(), true))).toContain(invite);
      expect(textOf(await render(unscored(), true))).toContain(invite);
    });

    it("is not offered for invited or rejected candidates, hidden ones or a plain resident", async () => {
      expect(textOf(await render(scored({ application: { ...CARD, state: "invited" } }), true))).not.toContain(invite);
      expect(
        textOf(await render(scored({ application: { ...CARD, state: "rejected_by_household" } }), true)),
      ).not.toContain(invite);
      expect(
        textOf(await render({ kind: "hidden", round: ROUND, application: { id: "a", name: "Hanna", state: "new" } }, true)),
      ).not.toContain(invite);
      expect(textOf(await render(scored(), false))).not.toContain(invite);
    });
  });

  it("the full page carries a back link to its round's scoreboard, the sheet does not", async () => {
    expect(await render(scored(), false, "page")).toContain('href="/casting?round=r"');
    expect(await render(scored(), false, "sheet")).not.toContain('href="/casting?round=r"');
  });
});
