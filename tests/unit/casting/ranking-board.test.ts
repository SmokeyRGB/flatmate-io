import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Ranking } from "@/modules/deliberation/repository";
import { de } from "@/ui/strings";

// F5 change 1 tasks 7.7: the scoreboard's markup, rendered with createElement +
// renderToStaticMarkup (the pattern of tests/unit/screening/screening-deck.test.ts). Names are
// digit-free synthetic ones, so every digit in a row's text comes from the row's own numbers.
vi.mock("server-only", () => ({}));
vi.mock("@/app/(org)/rounds/[id]/applications/invite-actions", () => ({ inviteApplicationAction: vi.fn() }));

const t = de.casting;
type Board = Extract<Ranking, { kind: "board" }>;

const WEIGHTS = { no: 0, rather_not: 1, good: 4, definitely: 5 };

function board(over: Partial<Board> = {}): Board {
  return {
    kind: "board",
    round: { id: "r", title: "Herbstrunde", status: "open" },
    rules: { weights: WEIGHTS, needed: 2, denominator: 4 },
    openRoomCount: 2,
    decided: {
      scored: [
        { applicationId: "a", applicantName: "Anna", state: "new", score: 73, n: 5, leading: true },
        { applicationId: "c", applicantName: "Cora", state: "screened", score: 20, n: 2, leading: true },
      ],
      unscored: [{ applicationId: "d", applicantName: "Dora", state: "new", n: 1, needed: 2 }],
    },
    invited: {
      scored: [{ applicationId: "b", applicantName: "Bea", state: "invited", score: 60, n: 3, leading: false }],
      unscored: [],
    },
    hidden: [{ applicationId: "e", applicantName: "Elsa", state: "invited" }],
    ...over,
  };
}

async function render(ranking: Ranking, canInvite?: boolean): Promise<string> {
  const { RankingBoard } = await import("@/app/(resident)/casting/ranking-board");
  return renderToStaticMarkup(createElement(RankingBoard, { ranking, canInvite }));
}

const textOf = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
// Markup minus the icon and the class names (utility classes such as `min-w-0` hold digits): what is
// left is text and meaningful attributes, which must carry no digit on a hidden row.
const withoutSvg = (html: string) =>
  html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/ class="[^"]*"/g, "");

// The <li> that holds a given name.
function rowOf(markup: string, name: string): string {
  const rows = markup.split("<li").slice(1).map((r) => "<li" + r.split("</li>")[0] + "</li>");
  const row = rows.find((r) => textOf(r).includes(name));
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

describe("RankingBoard rows", () => {
  it("an unscored row has no ring, and its only digits are those of the notice (C-5.1)", async () => {
    const row = rowOf(await render(board()), "Dora");
    expect(row).not.toContain('role="img"');
    expect(row).not.toContain("score-ring");
    expect(row).toContain(t.unscored(2, 1));
    expect(textOf(row).replace(/\D/g, "")).toBe("21");
  });

  it("a hidden row carries no digit at all and no ring", async () => {
    const row = rowOf(await render(board()), "Elsa");
    expect(textOf(row)).not.toMatch(/\d/);
    expect(withoutSvg(row)).not.toMatch(/\d/);
    expect(row).not.toContain('role="img"');
    expect(textOf(row)).toContain(t.hidden);
    expect(row).toContain("ranking-hidden");
    expect(row).toContain("<svg"); // the eye-off mark
  });

  it("the ring's label carries the score and the vote count, and the number sits inside", async () => {
    const row = rowOf(await render(board()), "Anna");
    expect(row).toContain(`role="img"`);
    expect(row).toContain(`aria-label="${t.ringLabel(73, 5)}"`);
    expect(t.ringLabel(73, 5)).toBe("73 von 100 Punkten, aus 5 Stimmen");
    expect(textOf(row)).toContain(t.scoreOf(5));
    expect(row).toContain("73");
  });

  it("exactly the leading rows carry the highlight class, and the sr text names N", async () => {
    const markup = await render(board());
    expect(markup.match(/ranking-leading/g)).toHaveLength(2);
    expect(rowOf(markup, "Anna")).toContain("ranking-leading");
    expect(rowOf(markup, "Cora")).toContain("ranking-leading");
    expect(rowOf(markup, "Bea")).not.toContain("ranking-leading");
    expect(rowOf(markup, "Dora")).not.toContain("ranking-leading");
    expect(rowOf(markup, "Elsa")).not.toContain("ranking-leading");
    expect(markup.split(`sr-only">${t.leadingLabel(2)}<`)).toHaveLength(3);
  });

  it("names the open rooms under the round title", async () => {
    const markup = await render(board());
    expect(markup).toContain(t.openRooms(2));
    expect(markup.indexOf(t.openRooms(2))).toBeGreaterThan(markup.indexOf("Herbstrunde"));
  });

  it("with N = 0 nothing is highlighted and no highlight text appears", async () => {
    const markup = await render(
      board({
        openRoomCount: 0,
        decided: {
          scored: [{ applicationId: "a", applicantName: "Anna", state: "new", score: 73, n: 5, leading: false }],
          unscored: [],
        },
      }),
    );
    expect(markup).not.toContain("ranking-leading");
    expect(markup).not.toContain(t.leadingLabel(0));
    expect(markup).toContain(t.openRooms(0));
  });

  it("the three headings appear only with rows, and an invited row sits under \"Eingeladen\" with its ring, never highlighted", async () => {
    const markup = await render(board());
    const h = (name: string) => markup.indexOf(`>${name}</h2>`);
    expect(h(t.scoredHeading)).toBeGreaterThan(-1);
    expect(h(t.invitedHeading)).toBeGreaterThan(h(t.scoredHeading));
    expect(h(t.hiddenHeading)).toBeGreaterThan(h(t.invitedHeading));
    const bea = markup.indexOf("Bea");
    expect(bea).toBeGreaterThan(h(t.invitedHeading));
    expect(bea).toBeLessThan(h(t.hiddenHeading));
    expect(markup.indexOf("Dora")).toBeLessThan(h(t.invitedHeading));
    expect(rowOf(markup, "Bea")).toContain(`aria-label="${t.ringLabel(60, 3)}"`);
    expect(rowOf(markup, "Bea")).not.toContain("ranking-leading");
    expect(textOf(rowOf(markup, "Bea"))).not.toContain(de.status.application.invited);

    const onlyDecided = await render(
      board({ invited: { scored: [], unscored: [] }, hidden: [] }),
    );
    expect(onlyDecided).toContain(`>${t.scoredHeading}</h2>`);
    expect(onlyDecided).not.toContain(`>${t.invitedHeading}</h2>`);
    expect(onlyDecided).not.toContain(`>${t.hiddenHeading}</h2>`);
  });

  it("has no rank numbers, no list that numbers, and no word about a person (C-10)", async () => {
    const markup = await render(board());
    expect(markup).not.toContain("<ol");
    expect(markup).not.toMatch(/Gewinner|Platz|beste|schlecht/i);
  });

  it("lists hidden rows below the others, under their own heading", async () => {
    const markup = await render(board());
    const heading = markup.indexOf(`>${t.hiddenHeading}</h2>`);
    expect(heading).toBeGreaterThan(markup.indexOf("Dora"));
    expect(markup.indexOf("Elsa")).toBeGreaterThan(heading);
  });
});

describe("RankingBoard (?) pop-over", () => {
  it("opens on a plain type=button and holds the frozen weights, the formula and the quorum rule", async () => {
    const markup = await render(board());
    const target = markup.search(/popovertarget="ranking-rules-popover"/i);
    expect(target).toBeGreaterThan(-1);
    const trigger = markup.slice(markup.lastIndexOf("<button", target));
    expect(trigger.slice(0, trigger.indexOf(">"))).toContain('type="button"');
    const start = markup.indexOf('id="ranking-rules-popover"');
    const popover = markup.slice(start, markup.indexOf("</div>", start));
    expect(popover).toContain("popover=");
    expect(popover).toContain("Finde gut: 4 Punkte"); // the round's weight, not the default 3
    expect(popover).toContain(t.formula);
    expect(popover).toContain(t.quorumRule(2, 4));
    expect(t.quorumRule(2, 4)).toContain("2 von 4"); // the round's real threshold, numbers only
  });
});

describe("RankingBoard states", () => {
  it("an empty board names the round and leads back to Start", async () => {
    const markup = await render(board({
        decided: { scored: [], unscored: [] },
        invited: { scored: [], unscored: [] },
        hidden: [],
      }));
    expect(textOf(markup)).toContain(t.empty("Herbstrunde"));
    expect(markup).toContain('href="/dashboard"');
    expect(markup).not.toContain("<li");
  });

  it("no round at all is an empty state too, never a blank", async () => {
    const markup = await render({ kind: "none" });
    expect(textOf(markup)).toContain(t.empty(null));
    expect(markup).toContain('href="/dashboard"');
  });

  it("refusals are calm and name neither a round nor a count where they must not", async () => {
    const eligible = await render({ kind: "refused", reason: "not_eligible" });
    expect(textOf(eligible)).toBe(t.refusal.notEligible);
    expect(textOf(await render({ kind: "refused", reason: "rules_invalid" }))).toBe(t.refusal.rulesInvalid);
    expect(textOf(await render({ kind: "refused", reason: "round_not_available", status: "closed" }))).toBe(
      t.refusal.notAvailable(de.status.round.closed),
    );
  });
});

describe("RankingBoard Einladen (spec deliberation/ranking, casting/invitation)", () => {
  const trigger = (row: string) => row.includes(`>${de.invite.open}</button>`);

  it("with canInvite, every decided row, scored or unscored, carries the trigger; no invited or hidden row does", async () => {
    const markup = await render(board(), true);
    expect(trigger(rowOf(markup, "Anna"))).toBe(true);
    expect(trigger(rowOf(markup, "Cora"))).toBe(true);
    expect(trigger(rowOf(markup, "Dora"))).toBe(true);
    expect(trigger(rowOf(markup, "Bea"))).toBe(false);
    expect(trigger(rowOf(markup, "Elsa"))).toBe(false);
    expect(markup.split(`>${de.invite.open}</button>`)).toHaveLength(4);
  });

  it("without canInvite (false or omitted) there is no trigger anywhere", async () => {
    for (const markup of [await render(board(), false), await render(board())]) {
      expect(markup).not.toContain(de.invite.open);
      expect(markup).not.toContain("<dialog");
    }
  });

  it("the digit assertions hold with canInvite, because a closed dialog carries no digit (C-5.1)", async () => {
    const markup = await render(board(), true);
    const dora = rowOf(markup, "Dora");
    expect(textOf(dora).replace(/\D/g, "")).toBe("21");
    expect(dora).not.toContain("score-ring");
    expect(textOf(rowOf(markup, "Anna"))).toContain(t.scoreOf(5));
    expect(markup).not.toContain("<textarea");
  });
});
