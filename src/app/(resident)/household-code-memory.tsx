"use client";

import { useEffect } from "react";
import { browserLocalStorage, syncHouseholdCodeMemory } from "@/app/household-code-storage";

// household-sign-in-code D6 (identity/device-memory): writes the household's sign-in code to the
// device while the session has "angemeldet bleiben", and removes it when it does not. Renders
// nothing. All of the logic is syncHouseholdCodeMemory's (unit-tested); this is only the effect.
export function HouseholdCodeMemory({ code, rememberMe }: { code: string; rememberMe: boolean }) {
  useEffect(() => {
    syncHouseholdCodeMemory(browserLocalStorage(), { code, rememberMe });
  }, [code, rememberMe]);
  return null;
}
