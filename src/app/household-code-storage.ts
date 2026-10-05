// household-sign-in-code D6 (identity/device-memory): the ONE localStorage value this application
// keeps for sign-in, the household sign-in code, and nothing else. Pure functions over a storage
// object so they are testable in node without a DOM. Every access is wrapped: storage that is
// missing, blocked or throwing leaves an empty field, never an error (P-2).

export const HOUSEHOLD_CODE_STORAGE_KEY = "flatmate.householdSignInCode";

export function readStoredHouseholdCode(storage: Pick<Storage, "getItem"> | null): string | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(HOUSEHOLD_CODE_STORAGE_KEY);
    return value ? value : null;
  } catch {
    return null;
  }
}

// rememberMe true writes (overwriting any earlier household's code), false removes. Never throws.
export function syncHouseholdCodeMemory(
  storage: Pick<Storage, "setItem" | "removeItem"> | null,
  { code, rememberMe }: { code: string; rememberMe: boolean },
): void {
  if (!storage) return;
  try {
    if (rememberMe) storage.setItem(HOUSEHOLD_CODE_STORAGE_KEY, code);
    else storage.removeItem(HOUSEHOLD_CODE_STORAGE_KEY);
  } catch {
    // Private window or blocked site data: the form simply works without the memory.
  }
}

// `window.localStorage` itself can throw on access (blocked site data), so it is read here, inside
// a guard, and callers never touch it directly.
export function browserLocalStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
