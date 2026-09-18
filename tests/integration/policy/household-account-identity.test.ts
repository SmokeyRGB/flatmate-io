import { afterEach, describe, expect, it } from "vitest";
import { signIn } from "@/modules/identity/auth";
import { registerTestHousehold, type TestHousehold } from "../../helpers/identity";

let hh: TestHousehold | undefined;

afterEach(async () => {
  if (hh) await hh.cleanup();
  hh = undefined;
});

// [GUARDED] G-D14(a) — GUARDRAIL: G-D14 — siehe GUARDRAILS.md
// "Eine Session, deren account_id auf eine Membership mit is_resident = false zeigt, hat
// acting_profile_id = null — beim Anlegen und über ihre ganze Lebensdauer."
describe("[GUARDED] G-D14(a): a household-account session has acting_profile_id = null at creation", () => {
  it("is null immediately after sign-in, via the policy layer", async () => {
    hh = await registerTestHousehold();

    const { session, context } = await signIn({
      kind: "household",
      email: hh.email,
      password: "test-password-not-real-1234",
    });

    expect(session.actingProfileId).toBeNull();
    expect(context.profileId).toBeNull();
  });
});
