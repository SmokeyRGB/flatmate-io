// design.md Decision 9 (revised 2026-09-23, human decision from the 8.3 walkthrough): a link's
// state was previously derived only inline in page.tsx's `joinCodeStatusLabel`. Three things now
// depend on it — the label, the live/dead split (O16's collapsed section), and the removed-joiner
// caution — so it lives here as one pure function. No DB access, no import from repository.ts:
// this module only reasons about facts the caller already has.
//
// domain/identity.md §2.1's "aktiv" (deleted_at null, expires_at in the future, uses < max_uses)
// is exactly the "live" state below.
export interface JoinCodeLinkFacts {
  deletedAt: Date | null;
  expiresAt: Date;
  uses: number;
  maxUses: number;
  hasRemovedJoiner: boolean;
}

export type JoinCodeState = "deleted" | "expired" | "used_up" | "live";

// Order matches joinCodeStatusLabel's existing order: deleted, then expired, then used up, else
// live. A deleted link is reported as deleted even if it also happens to be expired or used up.
export function joinCodeState(issuance: JoinCodeLinkFacts, now: Date): JoinCodeState {
  if (issuance.deletedAt) return "deleted";
  if (issuance.expiresAt.getTime() <= now.getTime()) return "expired";
  if (issuance.uses >= issuance.maxUses) return "used_up";
  return "live";
}

// design.md Decision 9 (revised): the caution is for LIVE links only, correcting the first
// version (hasRemovedJoiner && !deletedAt), which also flagged a used-up or expired link that can
// never again admit anyone. A used-up link is closed for good (uses is never reset, "+7 Tage"
// only moves expiresAt). A deleted link is closed for good. An expired link is unusable until a
// moderator extends it — which makes it live again, bringing the caution back at the moment it
// matters.
export function removedJoinerCautionApplies(issuance: JoinCodeLinkFacts, now: Date): boolean {
  return issuance.hasRemovedJoiner && joinCodeState(issuance, now) === "live";
}
