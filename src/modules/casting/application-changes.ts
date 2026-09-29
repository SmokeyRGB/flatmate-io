// Pure helpers for correcting an application (F3 change 3, design D4). No database access: they
// live here, not in repository.ts, so they are unit-testable and never become repository exports
// that the authorization matrix would have to classify (pre-mortem M6).
//
// NOTHING HERE RETURNS A VALUE. `changedApplicationFields` returns field NAMES from a fixed list,
// and `applicationBaseline` returns a one-way digest. The audit entry of a correction is built
// from the names only (FR-3.22, AC-3.19, G-D7).
import { createHash } from "node:crypto";
import type { ParsedApplication } from "./application-input";

// The eight fields a correction may change, in the order the audit entry lists them. `source`,
// `state`, the round, the household and the creator are NOT here and are never written by a
// correction.
export const CORRECTABLE_FIELDS = [
  "applicantName",
  "age",
  "contactEmail",
  "contactPhone",
  "contactOther",
  "messageRaw",
  "attributes",
  "collectedFrom",
] as const;
export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];

// What a stored row (or a parsed input) looks like for these purposes. `attributes` is what the
// jsonb column returns: unknown until it is normalised below.
export interface CorrectableValues {
  applicantName: string;
  age: number | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactOther: string | null;
  messageRaw: string | null;
  attributes: unknown;
  collectedFrom: string;
}

// The canonical form of the attributes: the {label, value} array in its order, with explicit key
// order, so jsonb's own key order can never make two equal lists differ. A missing list and an
// empty one are both null (the parser maps an empty list to null).
function canonicalAttributes(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return JSON.stringify(
    raw.map((entry) => {
      const e = (entry ?? {}) as { label?: unknown; value?: unknown };
      return { label: e.label ?? null, value: e.value ?? null };
    }),
  );
}

// A blank and null both mean empty. The parser already maps a blank to null; a stored row never
// holds a blank, but the comparison does not depend on either.
function canonicalText(v: string | null | undefined): string | null {
  return v === null || v === undefined || v === "" ? null : v;
}

function canonicalValue(field: CorrectableField, v: CorrectableValues): unknown {
  switch (field) {
    case "attributes":
      return canonicalAttributes(v.attributes);
    case "age":
      return v.age ?? null;
    case "collectedFrom":
      return v.collectedFrom;
    case "applicantName":
      return v.applicantName;
    default:
      return canonicalText(v[field]);
  }
}

// The fields of `parsed` whose value differs from the stored row, in CORRECTABLE_FIELDS order.
export function changedApplicationFields(
  current: CorrectableValues,
  parsed: ParsedApplication,
): CorrectableField[] {
  return CORRECTABLE_FIELDS.filter(
    (field) =>
      JSON.stringify(canonicalValue(field, current)) !==
      JSON.stringify(canonicalValue(field, parsed as CorrectableValues)),
  );
}

// Optimistic concurrency (pre-mortem M5): a SHA-256 hex digest of the canonical JSON of the eight
// correctable fields. The edit page puts it in a hidden input; the repository compares it with the
// locked row and refuses a stale form. One-way, and shown only to a viewer who already sees the
// values; it never reaches action state or a log. A column for it was rejected (G-J4).
export function applicationBaseline(row: CorrectableValues): string {
  const canonical = JSON.stringify(CORRECTABLE_FIELDS.map((f) => canonicalValue(f, row)));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
