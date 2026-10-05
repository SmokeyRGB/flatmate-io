import { describe, expect, it } from "vitest";
import {
  HOUSEHOLD_CODE_STORAGE_KEY,
  readStoredHouseholdCode,
  syncHouseholdCodeMemory,
} from "@/app/household-code-storage";

// household-sign-in-code D6 / task 5.4: node env, fake storage objects. The pure functions are all
// of the device-memory logic: the form and HouseholdCodeMemory only call them from effects.
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const throwing = {
  getItem: (): string | null => {
    throw new Error("blocked");
  },
  setItem: (): void => {
    throw new Error("blocked");
  },
  removeItem: (): void => {
    throw new Error("blocked");
  },
};

describe("readStoredHouseholdCode", () => {
  it("returns the stored code", () => {
    const s = fakeStorage({ [HOUSEHOLD_CODE_STORAGE_KEY]: "ABCD-EFGH-JKLM" });
    expect(readStoredHouseholdCode(s)).toBe("ABCD-EFGH-JKLM");
  });

  it("returns null for empty storage, a null storage and a throwing storage", () => {
    expect(readStoredHouseholdCode(fakeStorage())).toBeNull();
    expect(readStoredHouseholdCode(null)).toBeNull();
    expect(readStoredHouseholdCode(throwing)).toBeNull();
  });
});

describe("syncHouseholdCodeMemory", () => {
  it("rememberMe true writes exactly one key holding the code and nothing else", () => {
    const s = fakeStorage();
    syncHouseholdCodeMemory(s, { code: "ABCD-EFGH-JKLM", rememberMe: true });
    expect([...s.data.entries()]).toEqual([[HOUSEHOLD_CODE_STORAGE_KEY, "ABCD-EFGH-JKLM"]]);
  });

  it("rememberMe false removes the key", () => {
    const s = fakeStorage({ [HOUSEHOLD_CODE_STORAGE_KEY]: "ABCD-EFGH-JKLM" });
    syncHouseholdCodeMemory(s, { code: "ABCD-EFGH-JKLM", rememberMe: false });
    expect(s.data.size).toBe(0);
  });

  it("never throws on a throwing or null storage", () => {
    expect(() => syncHouseholdCodeMemory(throwing, { code: "X", rememberMe: true })).not.toThrow();
    expect(() => syncHouseholdCodeMemory(throwing, { code: "X", rememberMe: false })).not.toThrow();
    expect(() => syncHouseholdCodeMemory(null, { code: "X", rememberMe: true })).not.toThrow();
  });

  it("a second sync with another code overwrites the first", () => {
    const s = fakeStorage();
    syncHouseholdCodeMemory(s, { code: "AAAA-AAAA-AAAA", rememberMe: true });
    syncHouseholdCodeMemory(s, { code: "BBBB-BBBB-BBBB", rememberMe: true });
    expect(s.data.get(HOUSEHOLD_CODE_STORAGE_KEY)).toBe("BBBB-BBBB-BBBB");
    expect(s.data.size).toBe(1);
  });
});
