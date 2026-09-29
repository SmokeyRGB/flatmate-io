// FR-1.21/FR-1.22/I-7: the four household settings an open round locks. A plain constant with no
// imports, so both the casting repository (the lock) and the audit module (which checks the
// `field` value of a settings event, G-D7) read the same list, and the audit module never has to
// import the casting repository (which imports it).
export const LOCKED_SETTINGS_FIELDS = [
  "scaleWeights",
  "favoriteBudgetFactor",
  "hideResultsUntilVoted",
  "quorumShare",
] as const;
export type LockedSettingsField = (typeof LOCKED_SETTINGS_FIELDS)[number];
