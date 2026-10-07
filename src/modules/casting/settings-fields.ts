// FR-1.21/I-7: the five household settings that make up the voting procedure (an open round keeps
// its own snapshot of them, FR-1.15; `revealVoteAuthorship` joined in F5 candidate-detail, R-1, and
// is frozen per round like the other four). A plain constant with no
// imports, so both the casting repository and the audit module (which checks the
// `field` value of a settings event, G-D7) read the same list, and the audit module never has to
// import the casting repository (which imports it).
export const VOTING_PROCEDURE_FIELDS = [
  "scaleWeights",
  "favoriteBudgetFactor",
  "hideResultsUntilVoted",
  "quorumShare",
  "revealVoteAuthorship",
] as const;
export type VotingProcedureField = (typeof VOTING_PROCEDURE_FIELDS)[number];
