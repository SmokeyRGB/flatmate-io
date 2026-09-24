import { cache } from "react";
import type { SessionContext } from "@/db/session-context";
import { getHousehold, getIdentityLabel, getNavigationAccess } from "@/modules/identity/repository";

// The resident frame's identity reads, memoised per request with React's `cache`: the
// `(resident)` layout and B1 both need them, and without this each render ran all three twice
// (review finding, 2026-09-24). `cache` compares arguments by identity, and layout and page each
// get their own `context` object from getCurrentSession, so the key is the context's three
// primitive fields, which compare by value. Visibility logic stays in the repository. This file
// only removes the duplicate round trips.
const byKey = <T,>(read: (context: SessionContext) => Promise<T>) => {
  const memo = cache((accountId: string, householdId: string, profileId: string | null) =>
    read({ accountId, householdId, profileId }),
  );
  return (context: SessionContext) => memo(context.accountId, context.householdId, context.profileId);
};

export const identityLabelFor = byKey(getIdentityLabel);
export const householdFor = byKey(getHousehold);
export const navigationAccessFor = byKey(getNavigationAccess);
