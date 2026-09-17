import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { createRoom, createRound } from "@/modules/casting/repository";
import { registerTestHousehold, type TestHousehold } from "../../helpers/identity";

// [GUARDED] G-D15 (raw SQL) — GUARDRAIL: G-D15 — siehe GUARDRAILS.md / ADR-014.
// research.md §3: the raw-SQL half queries the BASE table directly (not the admin view), and
// confirms no Application-derived column exists there to leak in the first place — the view is
// not itself the enforcement (G-C7).
describe("[GUARDED] G-D15: no Application-derived column exists on the base casting_round table", () => {
  it("the base table's own column set contains nothing derived from Application", async () => {
    let hh: TestHousehold | undefined;
    try {
      hh = await registerTestHousehold();
      const actor = { accountId: hh.accountId, profileId: null };
      const roomA = await createRoom(hh.context, "Room A", actor);
      const round = await createRound(hh.context, "Test round", [roomA.id], actor);

      const rows = await withSessionContext(hh.context, (tx) =>
        tx.execute<Record<string, unknown>>(
          sql`SELECT * FROM casting_round WHERE id = ${round.id}::uuid`,
        ),
      );

      expect(rows).toHaveLength(1);
      const columns = Object.keys(rows[0]);
      // Exact-name check, not a substring ban: `quorum_denominator_frozen` is a legitimate
      // CastingRound column (derived from RoundParticipation, frozen at `closed` — never from
      // Application) that correctly exists on the base table while being hidden from the
      // household-account VIEW (research.md §3) — a substring match on "quorum" would false-
      // positive against it. What this test actually guards against is a *cached Application
      // aggregate* column, which would leak via the base table regardless of the view.
      const forbiddenExactNames = [
        "application_count",
        "votes_cast",
        "participation_count",
        "score",
        "ranking",
      ];
      for (const f of forbiddenExactNames) {
        expect(columns.map((c) => c.toLowerCase())).not.toContain(f);
      }
    } finally {
      if (hh) await hh.cleanup();
    }
  });
});
