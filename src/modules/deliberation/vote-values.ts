// The four ratings of the screening scale, weakest to strongest (ADR-008, FR-4.8). Pure and
// import-free so a client component can use it without pulling in drizzle or the schema.
export const VOTE_VALUES = ["no", "rather_not", "good", "definitely"] as const;

export type VoteValue = (typeof VOTE_VALUES)[number];

// The voting stages (docs/domain/deliberation.md): round one (invite) and round two (offer). Here,
// not only in schema.ts, so audit can validate an event's stage without importing the table module.
export const VOTE_STAGES = ["invite", "offer"] as const;
