// Pure parsing of a manual application capture (design D4 step 3c). No database access, so the
// rules here are unit-testable, and the server action and the repository can both call it.
//
// The rules mirror the CHECK constraints of drizzle/0023 one for one, so that in the normal case
// it is this parser that refuses and never the database: a database refusal is a bug signal, and
// it would write the refused row into the Postgres log (design D4, "No value leaves in an error").
//
// NO ERROR HERE CARRIES A VALUE. `ApplicationInputError` holds a code and a field name and
// nothing else, and its message is built from those two only.

// C-3.14. Lengths count Unicode code points (`[...s].length`), like Postgres `char_length` and
// unlike a UTF-16 `.length` or `maxLength` (assumption A5).
export const APPLICATION_LIMITS = {
  applicantName: 200,
  contactEmail: 254,
  contactPhone: 50,
  contactOther: 200,
  messageRaw: 4000,
  ageMin: 0,
  ageMax: 150,
  attributesMax: 10,
  attributeLabel: 60,
  attributeValue: 500,
} as const;

export const COLLECTED_FROM_VALUES = ["data_subject", "third_party"] as const;
export type CollectedFrom = (typeof COLLECTED_FROM_VALUES)[number];

export type ApplicationInputErrorCode =
  | "name_required"
  | "too_long"
  | "invalid_age"
  | "too_many_attributes"
  | "invalid_attribute"
  | "invalid_characters"
  | "contact_kind_taken"
  | "collected_from_required";

export type ApplicationInputField =
  | "applicantName"
  | "age"
  | "contact"
  | "messageRaw"
  | "attributes"
  | "collectedFrom";

export class ApplicationInputError extends Error {
  readonly code: ApplicationInputErrorCode;
  readonly field: ApplicationInputField;
  constructor(code: ApplicationInputErrorCode, field: ApplicationInputField) {
    super(`Invalid application input: ${code} (${field})`);
    this.name = "ApplicationInputError";
    this.code = code;
    this.field = field;
  }
}

// What a caller hands in. Deliberately loose: extra keys (a `source` a browser might send, say)
// are ignored, and the repository never reads them.
export type RawApplicationInput = { [key: string]: unknown };

// The three stored contact columns (`domain/casting.md` §2.2). The form has ONE contact input; each
// value is sorted into one of these by classifyContact() below (design D15).
export type ContactKind = "email" | "phone" | "other";
export const MAX_CONTACTS = 3;

export interface ApplicationAttribute {
  label: string;
  value: string;
}

export interface ParsedApplication {
  applicantName: string;
  age: number | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactOther: string | null;
  messageRaw: string | null;
  attributes: ApplicationAttribute[] | null;
  collectedFrom: CollectedFrom;
}

// U+0000 is refused by Postgres text with an encoding error that carries the value; a lone
// surrogate cannot be encoded as UTF-8 at all. Both are refused here first (pre-mortem 1).
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
function hasInvalidCharacters(s: string): boolean {
  return s.includes("\u0000") || LONE_SURROGATE.test(s);
}

function codePoints(s: string): number {
  return [...s].length;
}

// A name needs one character that is not whitespace, matching drizzle/0023's `~ '[^[:space:]]'`.
// JavaScript's `\s` is at least as wide as POSIX `[:space:]`, so this is at least as strict.
const NON_WHITESPACE = /\S/;
// A name made only of invisible format characters (zero-width space U+200B, word joiner U+2060,
// BOM U+FEFF, ...) passes `trim()` and `\S` but renders empty; it counts as blank (code review).
// The database CHECK is weaker here; the parser is the stricter of the two, as with whitespace.
const VISIBLE = /[^\s\p{Cf}]/u;

// Reads an optional text field: undefined/null/blank -> null, else the trimmed string.
function readOptionalText(
  raw: unknown,
  field: ApplicationInputField,
  max: number,
  options: { trim: boolean } = { trim: true },
): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") throw new ApplicationInputError("invalid_characters", field);
  if (hasInvalidCharacters(raw)) throw new ApplicationInputError("invalid_characters", field);
  if (raw.trim() === "") return null;
  const value = options.trim ? raw.trim() : raw;
  if (codePoints(value) > max) throw new ApplicationInputError("too_long", field);
  return value;
}

function readAge(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  let n: number;
  if (typeof raw === "number") {
    n = raw;
  } else if (typeof raw === "string") {
    const t = raw.trim();
    if (t === "") return null;
    if (!/^-?\d+$/.test(t)) throw new ApplicationInputError("invalid_age", "age");
    n = Number(t);
  } else {
    throw new ApplicationInputError("invalid_age", "age");
  }
  if (
    !Number.isInteger(n) ||
    n < APPLICATION_LIMITS.ageMin ||
    n > APPLICATION_LIMITS.ageMax
  ) {
    throw new ApplicationInputError("invalid_age", "age");
  }
  return n;
}

function readAttributes(raw: unknown): ApplicationAttribute[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) throw new ApplicationInputError("invalid_attribute", "attributes");
  const rows: ApplicationAttribute[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) {
      throw new ApplicationInputError("invalid_attribute", "attributes");
    }
    const { label, value } = entry as { label?: unknown; value?: unknown };
    const l = label === undefined || label === null ? "" : label;
    const v = value === undefined || value === null ? "" : value;
    if (typeof l !== "string" || typeof v !== "string") {
      throw new ApplicationInputError("invalid_attribute", "attributes");
    }
    if (hasInvalidCharacters(l) || hasInvalidCharacters(v)) {
      throw new ApplicationInputError("invalid_characters", "attributes");
    }
    const lt = l.trim();
    const vt = v.trim();
    if (lt === "" && vt === "") continue; // an empty row is dropped
    if (lt === "" || vt === "") throw new ApplicationInputError("invalid_attribute", "attributes");
    if (
      codePoints(lt) > APPLICATION_LIMITS.attributeLabel ||
      codePoints(vt) > APPLICATION_LIMITS.attributeValue
    ) {
      throw new ApplicationInputError("invalid_attribute", "attributes");
    }
    rows.push({ label: lt, value: vt });
  }
  if (rows.length > APPLICATION_LIMITS.attributesMax) {
    throw new ApplicationInputError("too_many_attributes", "attributes");
  }
  return rows.length === 0 ? null : rows;
}

// Design D15: the fixed rule that sorts one contact input into a stored column. Pure and
// deterministic, used by the parser (server) and by the form's hint (browser). Applied in this order:
//  1. email: no whitespace, exactly one "@", at least one character before it, and a dot inside
//     the part after it (not its first or last character);
//  2. phone: only digits, spaces and "+ ( ) - / .", with at least 6 digits, and short enough
//     for the phone column (50); a longer one of that shape is kept as "other" (code review);
//  3. anything else.
export function classifyContact(value: string): ContactKind {
  const v = value.trim();
  const at = v.indexOf("@");
  if (!/\s/.test(v) && at > 0 && v.indexOf("@", at + 1) === -1) {
    const domain = v.slice(at + 1);
    for (let i = 1; i < domain.length - 1; i++) if (domain[i] === ".") return "email";
  }
  if (
    /^[0-9 +()\-/.]+$/.test(v) &&
    (v.match(/[0-9]/g)?.length ?? 0) >= 6 &&
    [...v].length <= APPLICATION_LIMITS.contactPhone
  ) {
    return "phone";
  }
  return "other";
}

const CONTACT_COLUMN_LIMIT: Record<ContactKind, number> = {
  email: APPLICATION_LIMITS.contactEmail,
  phone: APPLICATION_LIMITS.contactPhone,
  other: APPLICATION_LIMITS.contactOther,
};

// Reads the contact inputs: at most MAX_CONTACTS non-blank ones, each trimmed, checked for invalid
// characters, sorted, then length-checked against ITS column. Two of one kind cannot share a column
// and are refused; four contacts always would, so the cap is stated on its own.
function readContacts(raw: unknown): Record<ContactKind, string | null> {
  const out: Record<ContactKind, string | null> = { email: null, phone: null, other: null };
  if (raw === undefined || raw === null) return out;
  if (!Array.isArray(raw)) throw new ApplicationInputError("invalid_characters", "contact");
  const filled: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") throw new ApplicationInputError("invalid_characters", "contact");
    if (hasInvalidCharacters(entry)) throw new ApplicationInputError("invalid_characters", "contact");
    if (entry.trim() !== "") filled.push(entry.trim());
  }
  if (filled.length > MAX_CONTACTS) throw new ApplicationInputError("contact_kind_taken", "contact");
  for (const value of filled) {
    const kind = classifyContact(value);
    if (codePoints(value) > CONTACT_COLUMN_LIMIT[kind]) throw new ApplicationInputError("too_long", "contact");
    if (out[kind] !== null) throw new ApplicationInputError("contact_kind_taken", "contact");
    out[kind] = value;
  }
  return out;
}

// The first build took contactEmail/contactPhone/contactOther. They are refused, not ignored: a
// caller still using them would otherwise lose the contact silently (code review). The message
// names the keys only, never a value.
const RETIRED_CONTACT_KEYS = ["contactEmail", "contactPhone", "contactOther"] as const;

export function parseApplicationInput(raw: RawApplicationInput): ParsedApplication {
  for (const key of RETIRED_CONTACT_KEYS) {
    if (raw[key] !== undefined) {
      throw new Error(`parseApplicationInput: "${key}" is retired; pass contacts: string[] (design D15)`);
    }
  }
  // Name first: it is the one required field.
  const rawName = raw.applicantName;
  if (rawName === undefined || rawName === null) {
    throw new ApplicationInputError("name_required", "applicantName");
  }
  if (typeof rawName !== "string") {
    throw new ApplicationInputError("name_required", "applicantName");
  }
  if (hasInvalidCharacters(rawName)) {
    throw new ApplicationInputError("invalid_characters", "applicantName");
  }
  const applicantName = rawName.trim();
  if (applicantName === "" || !NON_WHITESPACE.test(applicantName) || !VISIBLE.test(applicantName)) {
    throw new ApplicationInputError("name_required", "applicantName");
  }
  if (codePoints(applicantName) > APPLICATION_LIMITS.applicantName) {
    throw new ApplicationInputError("too_long", "applicantName");
  }

  const age = readAge(raw.age);
  const contacts = readContacts(raw.contacts);
  // message_raw is the ORIGINAL message (the v0.2 parser's input, C-3.8), so it is stored as
  // typed, not trimmed; only an all-blank message counts as empty (code review).
  const messageRaw = readOptionalText(raw.messageRaw, "messageRaw", APPLICATION_LIMITS.messageRaw, {
    trim: false,
  });
  const attributes = readAttributes(raw.attributes);

  // No fallback (C-3.2): a missing or unknown collection source is refused, never defaulted.
  const collectedFrom = raw.collectedFrom;
  if (
    typeof collectedFrom !== "string" ||
    !(COLLECTED_FROM_VALUES as readonly string[]).includes(collectedFrom)
  ) {
    throw new ApplicationInputError("collected_from_required", "collectedFrom");
  }

  return {
    applicantName,
    age,
    contactEmail: contacts.email,
    contactPhone: contacts.phone,
    contactOther: contacts.other,
    messageRaw,
    attributes,
    collectedFrom: collectedFrom as CollectedFrom,
  };
}
