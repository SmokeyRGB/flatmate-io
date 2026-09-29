import { describe, expect, it } from "vitest";
import {
  applicationBaseline,
  changedApplicationFields,
  CORRECTABLE_FIELDS,
  type CorrectableValues,
} from "@/modules/casting/application-changes";
import { parseApplicationInput, type ParsedApplication } from "@/modules/casting/application-input";

// F3 change 3, design D4: the pure half of a correction. All values are synthetic (G-B1).
const stored: CorrectableValues = {
  applicantName: "Testbewerbung Anna",
  age: 27,
  contactEmail: "anna@example.test",
  contactPhone: "+49 30 23125 0100",
  contactOther: "Portal: anna",
  messageRaw: "Hallo, ich suche ein Zimmer.",
  attributes: [
    { label: "Beruf", value: "Tischlerin" },
    { label: "Sprachen", value: "Deutsch, Englisch" },
  ],
  collectedFrom: "data_subject",
};

// What the form would submit if the corrector changed nothing.
const unchanged: ParsedApplication = {
  applicantName: stored.applicantName,
  age: stored.age,
  contactEmail: stored.contactEmail,
  contactPhone: stored.contactPhone,
  contactOther: stored.contactOther,
  messageRaw: stored.messageRaw,
  attributes: stored.attributes as ParsedApplication["attributes"],
  collectedFrom: "data_subject",
};

describe("changedApplicationFields", () => {
  it("no change returns an empty list", () => {
    expect(changedApplicationFields(stored, unchanged)).toEqual([]);
  });

  it("each of the eight fields alone is named, and only it", () => {
    const edits: Array<[(typeof CORRECTABLE_FIELDS)[number], Partial<ParsedApplication>]> = [
      ["applicantName", { applicantName: "Testbewerbung Anna B." }],
      ["age", { age: 28 }],
      ["contactEmail", { contactEmail: "anna.b@example.test" }],
      ["contactPhone", { contactPhone: "+49 30 23125 0199" }],
      ["contactOther", { contactOther: "Portal: anna-b" }],
      ["messageRaw", { messageRaw: "Geänderte Nachricht" }],
      ["attributes", { attributes: [{ label: "Beruf", value: "Schreinerin" }] }],
      ["collectedFrom", { collectedFrom: "third_party" }],
    ];
    expect(edits.map(([f]) => f)).toEqual([...CORRECTABLE_FIELDS]);
    for (const [field, patch] of edits) {
      expect(changedApplicationFields(stored, { ...unchanged, ...patch }), field).toEqual([field]);
    }
  });

  it("a field cleared to null counts as a change, and null against null does not", () => {
    expect(changedApplicationFields(stored, { ...unchanged, age: null })).toEqual(["age"]);
    const bare: CorrectableValues = { ...stored, age: null, contactEmail: null, messageRaw: null, attributes: null };
    expect(
      changedApplicationFields(bare, { ...unchanged, age: null, contactEmail: null, messageRaw: null, attributes: null }),
    ).toEqual([]);
  });

  // Break: compare attributes by reference (!==), and the "unchanged" case below fails.
  it("attributes are compared by content and order: an equal copy is unchanged, a reordering is changed", () => {
    const copy = JSON.parse(JSON.stringify(stored.attributes)) as NonNullable<ParsedApplication["attributes"]>;
    expect(changedApplicationFields(stored, { ...unchanged, attributes: copy })).toEqual([]);
    const reordered = [...copy].reverse();
    expect(changedApplicationFields(stored, { ...unchanged, attributes: reordered })).toEqual(["attributes"]);
  });

  it("jsonb key order does not make equal attributes differ", () => {
    const swapped = [
      { value: "Tischlerin", label: "Beruf" },
      { value: "Deutsch, Englisch", label: "Sprachen" },
    ];
    expect(changedApplicationFields({ ...stored, attributes: swapped }, unchanged)).toEqual([]);
  });

  it("an empty attribute list and a missing one both mean no attributes", () => {
    expect(changedApplicationFields({ ...stored, attributes: [] }, { ...unchanged, attributes: null })).toEqual([]);
    expect(changedApplicationFields({ ...stored, attributes: null }, { ...unchanged, attributes: null })).toEqual([]);
  });

  it("a blank stored text and null both mean empty", () => {
    expect(changedApplicationFields({ ...stored, contactOther: "" }, { ...unchanged, contactOther: null })).toEqual([]);
  });
});

// D4 "Contacts round-trip": the form is pre-filled with the stored contacts (the non-null ones, in
// the order email, phone, other); an unchanged form must re-sort every value into its own column.
describe("the contacts round trip", () => {
  const cases: Array<[string, string[]]> = [
    ["an email", ["lea@example.test"]],
    ["a phone", ["+49 30 23125 0100"]],
    ["a phone of 51 characters (stored as other)", ["1".repeat(51)]],
    ["an other value", ["Portal: lea"]],
    ["all three kinds", ["lea@example.test", "+49 30 23125 0100", "Portal: lea"]],
  ];

  for (const [label, contacts] of cases) {
    it(`${label}: the pre-filled form re-parses to the same columns and no change`, () => {
      const base = { applicantName: "Testbewerbung Lea", collectedFrom: "data_subject" };
      const first = parseApplicationInput({ ...base, contacts });
      // What the edit page pre-fills: the non-null stored contacts in a fixed order.
      const prefilled = [first.contactEmail, first.contactPhone, first.contactOther].filter(
        (c): c is string => c !== null,
      );
      const second = parseApplicationInput({ ...base, contacts: prefilled });
      expect(changedApplicationFields(first, second)).toEqual([]);
    });
  }

  it("the phone of 51 characters is stored as other, not as a phone", () => {
    const parsed = parseApplicationInput({
      applicantName: "Testbewerbung Lea",
      collectedFrom: "data_subject",
      contacts: ["1".repeat(51)],
    });
    expect(parsed.contactPhone).toBeNull();
    expect(parsed.contactOther).toBe("1".repeat(51));
  });
});

describe("applicationBaseline", () => {
  it("is a SHA-256 hex digest, stable for equal rows", () => {
    const a = applicationBaseline(stored);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(applicationBaseline({ ...stored })).toBe(a);
    expect(applicationBaseline({ ...stored, attributes: JSON.parse(JSON.stringify(stored.attributes)) })).toBe(a);
  });

  it("differs when any one of the eight fields differs", () => {
    const base = applicationBaseline(stored);
    const variants: CorrectableValues[] = [
      { ...stored, applicantName: "Anderer Name" },
      { ...stored, age: 28 },
      { ...stored, contactEmail: "x@example.test" },
      { ...stored, contactPhone: "+49 30 23125 0199" },
      { ...stored, contactOther: "Portal: x" },
      { ...stored, messageRaw: "Andere Nachricht" },
      { ...stored, attributes: [{ label: "Beruf", value: "Anders" }] },
      { ...stored, collectedFrom: "third_party" },
    ];
    for (const v of variants) expect(applicationBaseline(v)).not.toBe(base);
    expect(new Set(variants.map(applicationBaseline)).size).toBe(variants.length);
  });

  it("does not contain the values it digests", () => {
    expect(applicationBaseline(stored)).not.toContain("Anna");
  });
});
