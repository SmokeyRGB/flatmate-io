// The four ratings of the screening scale, weakest to strongest (ADR-008, FR-4.8). Pure and
// import-free so a client component can use it without pulling in drizzle or the schema.
export const VOTE_VALUES = ["no", "rather_not", "good", "definitely"] as const;

export type VoteValue = (typeof VOTE_VALUES)[number];
