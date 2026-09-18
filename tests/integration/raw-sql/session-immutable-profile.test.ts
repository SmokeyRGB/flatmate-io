import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { withSessionContext } from "@/db/session-context";
import { signIn } from "@/modules/identity/auth";
import { registerTestHousehold, type TestHousehold } from "../../helpers/identity";
import { uuid } from "../../helpers/uuid";

let hh: TestHousehold | undefined;

afterEach(async () => {
  if (hh) await hh.cleanup();
  hh = undefined;
});

// [GUARDED] G-D14(b) — GUARDRAIL: G-D14 — siehe GUARDRAILS.md
// "Es existiert kein Schreibpfad, der Session.acting_profile_id nach dem Anlegen der Sitzung
// ändert; der Test führt den Versuch aus und erwartet Ablehnung."
describe("[GUARDED] G-D14(b): acting_profile_id has no write path after creation, even via raw SQL", () => {
  it("rejects a raw SQL UPDATE of acting_profile_id on an existing session", async () => {
    hh = await registerTestHousehold();
    const { session, context } = await signIn({
      kind: "household",
      email: hh.email,
      password: "test-password-not-real-1234",
    });
    expect(session.actingProfileId).toBeNull();

    // postgres/drizzle wrap the driver-level PostgresError under a generic "Failed query: ..."
    // message; the trigger's own text (asserted below) lives on the wrapped error's `cause`,
    // not the top-level message toThrow(regex) checks — asserting on `cause` (rather than
    // loosening to "any throw") keeps this test failing if rejection ever starts happening for
    // an unrelated reason (e.g. a syntax error), not just when the trigger no longer fires.
    let caught: unknown;
    try {
      await withSessionContext(context, (tx) =>
        tx.execute(
          sql`UPDATE session SET acting_profile_id = ${uuid()}::uuid WHERE id = ${session.id}::uuid`,
        ),
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = [(caught as Error).message, (caught as { cause?: Error }).cause?.message]
      .filter(Boolean)
      .join(" | ");
    expect(message).toMatch(/acting_profile_id is fixed/);
  });
});
