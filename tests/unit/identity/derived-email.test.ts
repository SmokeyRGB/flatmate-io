import { describe, expect, it } from "vitest";
import { deriveResidentEmail } from "@/modules/identity/auth";
import { uuid } from "../../helpers/uuid";

// research.md §2: derived from the profile's own uuid, never from display_name — a pure function,
// no network call.
describe("deriveResidentEmail", () => {
  it("is stable for the same id", () => {
    const id = uuid();
    expect(deriveResidentEmail(id)).toBe(deriveResidentEmail(id));
  });

  it("differs for two different ids sharing the same display_name", () => {
    // display_name isn't even a parameter — the point is the function has no way to collide on
    // it, since it never sees it. Two distinct ids must simply never derive the same address.
    const idA = uuid();
    const idB = uuid();
    expect(deriveResidentEmail(idA)).not.toBe(deriveResidentEmail(idB));
  });

  it("uses the IANA-reserved .invalid TLD, so it can never actually be delivered to", () => {
    expect(deriveResidentEmail(uuid())).toMatch(/@accounts\.flatmate\.invalid$/);
  });
});
