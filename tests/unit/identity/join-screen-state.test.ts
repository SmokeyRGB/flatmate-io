import { describe, expect, it } from "vitest";
import { decideJoinScreen } from "@/app/(auth)/join/[code]/join-screen-state";
import type { JoinCodeResolution } from "@/modules/identity/repository";

const neutralResolution: JoinCodeResolution = {
  householdId: "11111111-1111-1111-1111-111111111111",
  issuanceId: "issuance-1",
  householdName: "WG Hauptstraße 12",
  boundResidentProfile: null,
};

const boundResolution: JoinCodeResolution = {
  ...neutralResolution,
  boundResidentProfile: { id: "profile-1", displayName: "Robin" },
};

const otherHouseholdId = "22222222-2222-2222-2222-222222222222";

// join-screen design.md Decision 2: the pure decision behind A3's states — exercised directly since
// the suite has no DOM (design.md constraint 2 / Non-Goals).
describe("decideJoinScreen", () => {
  it("the rate limit wins over an invalid link and over another household's session", () => {
    expect(decideJoinScreen({ allowed: false, resolved: null, sessionHouseholdId: null })).toEqual({
      kind: "rate_limited",
    });
    expect(
      decideJoinScreen({ allowed: false, resolved: neutralResolution, sessionHouseholdId: otherHouseholdId }),
    ).toEqual({ kind: "rate_limited" });
  });

  it("an invalid link wins over any session", () => {
    expect(
      decideJoinScreen({ allowed: true, resolved: null, sessionHouseholdId: neutralResolution.householdId }),
    ).toEqual({ kind: "invalid_link" });
    expect(decideJoinScreen({ allowed: true, resolved: null, sessionHouseholdId: otherHouseholdId })).toEqual({
      kind: "invalid_link",
    });
  });

  it("a same-household session gives already_member, for neutral and for bound", () => {
    expect(
      decideJoinScreen({
        allowed: true,
        resolved: neutralResolution,
        sessionHouseholdId: neutralResolution.householdId,
      }),
    ).toEqual({ kind: "already_member" });
    expect(
      decideJoinScreen({
        allowed: true,
        resolved: boundResolution,
        sessionHouseholdId: boundResolution.householdId,
      }),
    ).toEqual({ kind: "already_member" });
  });

  it("an other-household session gives other_household, for neutral and for bound (a bound link has the same states as a neutral one)", () => {
    expect(
      decideJoinScreen({ allowed: true, resolved: neutralResolution, sessionHouseholdId: otherHouseholdId }),
    ).toEqual({ kind: "other_household" });
    expect(
      decideJoinScreen({ allowed: true, resolved: boundResolution, sessionHouseholdId: otherHouseholdId }),
    ).toEqual({ kind: "other_household" });
  });

  it("no session gives neutral / bound, carrying the names", () => {
    expect(decideJoinScreen({ allowed: true, resolved: neutralResolution, sessionHouseholdId: null })).toEqual({
      kind: "neutral",
      householdName: neutralResolution.householdName,
    });
    expect(decideJoinScreen({ allowed: true, resolved: boundResolution, sessionHouseholdId: null })).toEqual({
      kind: "bound",
      householdName: boundResolution.householdName,
      displayName: "Robin",
    });
  });
});
