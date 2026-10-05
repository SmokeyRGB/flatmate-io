import { describe, expect, it } from "vitest";
import {
  HOUSEHOLD_SIGN_IN_CODE_PATTERN,
  isWellFormedHouseholdSignInCode,
  isWellFormedJoinCode,
  normalizeHouseholdSignInCode,
} from "@/modules/identity/repository";

// household-sign-in-code design D1: three groups of four over the join-code alphabet.
describe("normalizeHouseholdSignInCode", () => {
  it.each([
    ["abcd-efgh-jklm", "ABCD-EFGH-JKLM"],
    ["abcdefghjklm", "ABCD-EFGH-JKLM"],
    ["  abcd efgh jklm  ", "ABCD-EFGH-JKLM"],
    ["ABCD--EFGH---JKLM", "ABCD-EFGH-JKLM"],
    ["ABCDE-FGHJK-LM", "ABCD-EFGH-JKLM"],
  ])("normalises %j to %j", (input, expected) => {
    expect(normalizeHouseholdSignInCode(input)).toBe(expected);
  });

  it("leaves a wrong length without hyphens re-inserted, and never throws", () => {
    expect(normalizeHouseholdSignInCode("abcd-efgh-jkl")).toBe("ABCDEFGHJKL");
    expect(normalizeHouseholdSignInCode("abcd-efgh-jklmn")).toBe("ABCDEFGHJKLMN");
    expect(normalizeHouseholdSignInCode("")).toBe("");
  });
});

describe("isWellFormedHouseholdSignInCode", () => {
  it("accepts a well-formed code", () => {
    expect(isWellFormedHouseholdSignInCode("ABCD-EFGH-JKLM")).toBe(true);
  });

  it("rejects a UUID, a join code, and the excluded characters", () => {
    expect(isWellFormedHouseholdSignInCode("3f2b8c1e-5d4a-4f6b-9c7d-1e2f3a4b5c6d")).toBe(false);
    expect(isWellFormedHouseholdSignInCode("ABCDE-FGHJK")).toBe(false);
    for (const c of ["I", "O", "0", "1"]) {
      expect(isWellFormedHouseholdSignInCode(`ABC${c}-EFGH-JKLM`)).toBe(false);
    }
  });

  it("rejects 11 and 13 characters", () => {
    expect(isWellFormedHouseholdSignInCode("ABCD-EFGH-JKL")).toBe(false);
    expect(isWellFormedHouseholdSignInCode("ABCD-EFGH-JKLMN")).toBe(false);
    expect(isWellFormedHouseholdSignInCode("ABCDEFGHJKLM")).toBe(false);
  });

  it("is disjoint from the join code in both directions", () => {
    expect(isWellFormedHouseholdSignInCode("ABCDE-FGHJK")).toBe(false);
    expect(isWellFormedJoinCode("ABCD-EFGH-JKLM")).toBe(false);
  });

  it("agrees with the SQL CHECK pattern on the same accept/reject table", () => {
    const sqlPattern = new RegExp(HOUSEHOLD_SIGN_IN_CODE_PATTERN);
    for (const candidate of [
      "ABCD-EFGH-JKLM",
      "ABCD-EFGH-JKL",
      "ABCD-EFGH-JKLMN",
      "ABCDE-FGHJK",
      "abcd-efgh-jklm",
      "ABC0-EFGH-JKLM",
      "ABCDEFGHJKLM",
    ]) {
      expect(sqlPattern.test(candidate)).toBe(isWellFormedHouseholdSignInCode(candidate));
    }
  });
});
