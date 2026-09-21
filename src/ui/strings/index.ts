// design.md Decision 1: no `t()` accessor — `de.members.inviteLink.delete` is a plain, type-safe
// property read. This file only re-exports the table and the shared type it produces; the table
// itself lives in `de.ts` (the only file whose diff is reviewed as copy, per tasks.md 1.2/6.2).
import { de } from "./de";

export { de };
export type De = typeof de;
