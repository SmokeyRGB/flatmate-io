import { describe, expect, it } from "vitest";
import {
  ApplicationInputError,
  classifyContact,
  parseApplicationInput,
  type ApplicationInputErrorCode,
  type ApplicationInputField,
} from "@/modules/casting/application-input";

const base = { applicantName: "Testbewerbung Anna", collectedFrom: "data_subject" };

function refusal(raw: Record<string, unknown>): ApplicationInputError {
  try {
    parseApplicationInput(raw);
  } catch (err) {
    if (err instanceof ApplicationInputError) return err;
    throw err;
  }
  throw new Error("expected an ApplicationInputError, none was thrown");
}

function expectRefusal(
  raw: Record<string, unknown>,
  code: ApplicationInputErrorCode,
  field: ApplicationInputField,
) {
  const err = refusal(raw);
  expect(err.code).toBe(code);
  expect(err.field).toBe(field);
}

// design D4 step 3c / tasks 3.3. Lengths count Unicode code points, and no error carries a value.
describe("parseApplicationInput", () => {
  it("a name alone is enough; every optional field becomes null, never an empty string", () => {
    expect(parseApplicationInput(base)).toEqual({
      applicantName: "Testbewerbung Anna",
      age: null,
      contactEmail: null,
      contactPhone: null,
      contactOther: null,
      messageRaw: null,
      attributes: null,
      collectedFrom: "data_subject",
    });
    const blanks = parseApplicationInput({
      ...base,
      age: "",
      contacts: ["  ", "", "\t"],
      messageRaw: "\n",
      attributes: [{ label: "", value: "  " }],
    });
    expect(blanks.age).toBeNull();
    expect(blanks.contactEmail).toBeNull();
    expect(blanks.contactPhone).toBeNull();
    expect(blanks.contactOther).toBeNull();
    expect(blanks.messageRaw).toBeNull();
    expect(blanks.attributes).toBeNull();
  });

  it("trims the name", () => {
    expect(parseApplicationInput({ ...base, applicantName: "  Anna  " }).applicantName).toBe("Anna");
  });

  it("an empty or whitespace name is name_required", () => {
    expectRefusal({ ...base, applicantName: "" }, "name_required", "applicantName");
    expectRefusal({ ...base, applicantName: "   " }, "name_required", "applicantName");
    expectRefusal({ collectedFrom: "data_subject" }, "name_required", "applicantName");
  });

  it("a name of only tabs, line breaks or NBSP is name_required (matches the not_blank CHECK)", () => {
    expectRefusal({ ...base, applicantName: "\t\n\t" }, "name_required", "applicantName");
    expectRefusal({ ...base, applicantName: "  " }, "name_required", "applicantName");
  });

  // Code review: invisible format characters pass trim() and \S but render empty.
  // Break: drop the VISIBLE test in parseApplicationInput, and this fails.
  it("a name of only zero-width characters is name_required", () => {
    expectRefusal({ ...base, applicantName: "​" }, "name_required", "applicantName");
    expectRefusal({ ...base, applicantName: "⁠﻿​" }, "name_required", "applicantName");
    expect(parseApplicationInput({ ...base, applicantName: "Mia​" }).applicantName).toBe("Mia​");
  });

  // Code review: message_raw is the original message, the v0.2 parser's input (C-3.8).
  // Break: trim it in readOptionalText again, and this fails.
  it("keeps message_raw as typed, not trimmed; an all-blank message is still null", () => {
    const typed = "  - Punkt eins\n  - Punkt zwei\n";
    expect(parseApplicationInput({ ...base, messageRaw: typed }).messageRaw).toBe(typed);
    expect(parseApplicationInput({ ...base, messageRaw: " \n\t " }).messageRaw).toBeNull();
  });

  it("the name limit is 200 code points: 200 passes, 201 is too_long", () => {
    expect(parseApplicationInput({ ...base, applicantName: "a".repeat(200) }).applicantName).toHaveLength(200);
    expectRefusal({ ...base, applicantName: "a".repeat(201) }, "too_long", "applicantName");
  });

  it("counts code points, not UTF-16 units: 4000 emoji are accepted, 4001 are too_long", () => {
    const emoji = "\u{1F600}"; // one code point, two UTF-16 units
    expect(parseApplicationInput({ ...base, messageRaw: emoji.repeat(4000) }).messageRaw).not.toBeNull();
    expectRefusal({ ...base, messageRaw: emoji.repeat(4001) }, "too_long", "messageRaw");
  });

  // Design D15: the column limits apply AFTER sorting, so each kind has its own.
  // Break: check every contact against one limit (say the email's 254) and the phone case fails.
  it("the contact limits are 254, 50 and 200, per column after sorting", () => {
    const email = (n: number) => "e".repeat(n - 7) + "@ex.com"; // n characters, an email
    expect(email(254)).toHaveLength(254);
    expect(parseApplicationInput({ ...base, contacts: [email(254)] }).contactEmail).toHaveLength(254);
    expectRefusal({ ...base, contacts: [email(255)] }, "too_long", "contact");
    expect(parseApplicationInput({ ...base, contacts: ["1".repeat(50)] }).contactPhone).toHaveLength(50);
    // 51 digits no longer fit the phone column, so the rule keeps them as another contact (code review).
    expect(parseApplicationInput({ ...base, contacts: ["1".repeat(51)] }).contactOther).toHaveLength(51);
    expect(parseApplicationInput({ ...base, contacts: ["x".repeat(200)] }).contactOther).toHaveLength(200);
    expectRefusal({ ...base, contacts: ["x".repeat(201)] }, "too_long", "contact");
  });

  // Break: drop the dot rule (accept any "@" with text after it) and "a@b" fails; drop the "exactly
  // one @" test and "a@@b.de" fails; lower the digit minimum to 5 and "12345" fails.
  describe("classifyContact (design D15)", () => {
    const cases: [string, "email" | "phone" | "other"][] = [
      ["a@b.de", "email"],
      ["lea@example.test", "email"],
      ["  a@b.de  ", "email"], // trimmed first
      ["a@b", "other"], // no dot after the @
      ["a@.de", "other"], // the dot is the first character of the part after the @
      ["a@b.", "other"], // the dot is the last character
      ["@b.de", "other"], // nothing before the @
      ["a@@b.de", "other"], // two @
      ["a @b.de", "other"], // whitespace
      ["+49 (30) 23125-0101", "phone"],
      ["+49 30 23125 0101", "phone"],
      ["030/23125.0101", "phone"],
      ["123456", "phone"],
      ["12345", "other"], // five digits
      ["+ ( ) - / .", "other"], // punctuation only, no digits
      ["030 23125 0101 x", "other"], // a letter
      ["Portal: x", "other"],
      ["", "other"],
    ];
    for (const [value, kind] of cases) {
      it(`${JSON.stringify(value)} is ${kind}`, () => {
        expect(classifyContact(value)).toBe(kind);
      });
    }
  });

  it("sorts each contact into its own column, in any order", () => {
    const parsed = parseApplicationInput({
      ...base,
      contacts: ["Portal: lea-sucht", "+49 30 23125 0101", "lea@example.test"],
    });
    expect(parsed.contactEmail).toBe("lea@example.test");
    expect(parsed.contactPhone).toBe("+49 30 23125 0101");
    expect(parsed.contactOther).toBe("Portal: lea-sucht");
  });

  it("trims each contact and drops blanks before counting", () => {
    const parsed = parseApplicationInput({ ...base, contacts: ["", "  lea@example.test  ", "   ", ""] });
    expect(parsed.contactEmail).toBe("lea@example.test");
    expect(parsed.contactPhone).toBeNull();
    expect(parsed.contactOther).toBeNull();
  });

  // Break: drop the clash check in readContacts and the second value silently overwrites the first.
  it("two contacts of one kind are contact_kind_taken, field contact", () => {
    expectRefusal({ ...base, contacts: ["a@b.de", "c@d.de"] }, "contact_kind_taken", "contact");
    expectRefusal({ ...base, contacts: ["+49 30 23125 0101", "030 23125 0102"] }, "contact_kind_taken", "contact");
    expectRefusal({ ...base, contacts: ["Portal: a", "Messenger: b"] }, "contact_kind_taken", "contact");
  });

  // An invariant guard, not a regression test of the cap: four contacts always clash on three
  // columns, so dropping the cap alone would not fail this. The cap is there so that a fourth kind,
  // if one ever exists, cannot let a fourth contact through.
  it("four contacts are refused, three are fine", () => {
    expectRefusal(
      { ...base, contacts: ["a@b.de", "+49 30 23125 0101", "Portal: a", "Portal: b"] },
      "contact_kind_taken",
      "contact",
    );
    expect(
      parseApplicationInput({ ...base, contacts: ["a@b.de", "+49 30 23125 0101", "Portal: a"] }).contactOther,
    ).toBe("Portal: a");
  });

  it("a non-array or a non-string contact is invalid_characters, field contact", () => {
    expectRefusal({ ...base, contacts: "a@b.de" }, "invalid_characters", "contact");
    expectRefusal({ ...base, contacts: [42] }, "invalid_characters", "contact");
  });

  it("age: -1, 151 and 1.5 are invalid_age; 0, 150 and a numeric string pass", () => {
    expectRefusal({ ...base, age: -1 }, "invalid_age", "age");
    expectRefusal({ ...base, age: 151 }, "invalid_age", "age");
    expectRefusal({ ...base, age: 1.5 }, "invalid_age", "age");
    expectRefusal({ ...base, age: "1.5" }, "invalid_age", "age");
    expectRefusal({ ...base, age: "abc" }, "invalid_age", "age");
    expect(parseApplicationInput({ ...base, age: 0 }).age).toBe(0);
    expect(parseApplicationInput({ ...base, age: 150 }).age).toBe(150);
    expect(parseApplicationInput({ ...base, age: "27" }).age).toBe(27);
  });

  it("attributes: 10 pass, 11 are too_many_attributes, empty rows are dropped first", () => {
    const row = (i: number) => ({ label: `Bezeichnung ${i}`, value: `Angabe ${i}` });
    const ten = Array.from({ length: 10 }, (_, i) => row(i));
    expect(parseApplicationInput({ ...base, attributes: ten }).attributes).toHaveLength(10);
    expectRefusal({ ...base, attributes: [...ten, row(10)] }, "too_many_attributes", "attributes");
    expect(
      parseApplicationInput({ ...base, attributes: [...ten, { label: "", value: "" }] }).attributes,
    ).toHaveLength(10);
  });

  it("an attribute label over 60 or a value over 500 is invalid_attribute; a half-filled row too", () => {
    expectRefusal({ ...base, attributes: [{ label: "l".repeat(61), value: "v" }] }, "invalid_attribute", "attributes");
    expectRefusal(
      { ...base, attributes: [{ label: "l", value: "v".repeat(501) }] },
      "invalid_attribute",
      "attributes",
    );
    expectRefusal({ ...base, attributes: [{ label: "l", value: "" }] }, "invalid_attribute", "attributes");
    expect(
      parseApplicationInput({ ...base, attributes: [{ label: "l".repeat(60), value: "v".repeat(500) }] })
        .attributes,
    ).toHaveLength(1);
  });

  it("a missing or unknown collectedFrom is collected_from_required, never defaulted", () => {
    expectRefusal({ applicantName: "Anna" }, "collected_from_required", "collectedFrom");
    expectRefusal({ applicantName: "Anna", collectedFrom: "" }, "collected_from_required", "collectedFrom");
    expectRefusal({ applicantName: "Anna", collectedFrom: "someone" }, "collected_from_required", "collectedFrom");
    expect(parseApplicationInput({ applicantName: "Anna", collectedFrom: "third_party" }).collectedFrom).toBe(
      "third_party",
    );
  });

  it("U+0000 and a lone surrogate in a text field are invalid_characters", () => {
    expectRefusal({ ...base, messageRaw: "vor\u0000nach" }, "invalid_characters", "messageRaw");
    expectRefusal({ ...base, messageRaw: "vor\uD800nach" }, "invalid_characters", "messageRaw");
    expectRefusal({ ...base, applicantName: "A\u0000" }, "invalid_characters", "applicantName");
    expectRefusal({ ...base, contacts: ["\uDC00"] }, "invalid_characters", "contact");
    expectRefusal(
      { ...base, attributes: [{ label: "a\u0000", value: "b" }] },
      "invalid_characters",
      "attributes",
    );
    // a well-formed surrogate PAIR is fine
    expect(parseApplicationInput({ ...base, messageRaw: "\u{1F600}" }).messageRaw).toBe("\u{1F600}");
  });

  it("no error message contains the input", () => {
    const sentinels = ["SENTINEL-NAME-9f3a", "SENTINEL-MSG-77c1", "SENTINEL-ATTR-1b2d"];
    const cases: Record<string, unknown>[] = [
      { applicantName: sentinels[0] + "\u0000", collectedFrom: "data_subject" },
      { applicantName: "x".repeat(300) + sentinels[0], collectedFrom: "data_subject" },
      { ...base, messageRaw: sentinels[1].repeat(400) },
      { ...base, attributes: [{ label: sentinels[2].repeat(10), value: "v" }] },
      { applicantName: sentinels[0], collectedFrom: sentinels[1] },
    ];
    for (const raw of cases) {
      const err = refusal(raw);
      const own = Object.getOwnPropertyNames(err).map((k) => String((err as unknown as Record<string, unknown>)[k]));
      const serialised = JSON.stringify({ message: err.message, own });
      for (const s of sentinels) expect(serialised).not.toContain(s);
    }
  });

  // Code review: a caller still using the first build's keys would lose the contact silently.
  // Break: drop the RETIRED_CONTACT_KEYS loop, and this fails.
  it("refuses the retired contactEmail/contactPhone/contactOther keys instead of dropping them", () => {
    expect(() => parseApplicationInput({ ...base, contactEmail: "lea@example.test" })).toThrow(/retired/);
    expect(() => parseApplicationInput({ ...base, contactPhone: "+49 30 23125 0101" })).toThrow(/retired/);
  });

  // Code review: a phone-shaped contact too long for the phone column fits the other column.
  // Break: drop the length condition in classifyContact, and this fails.
  it("a phone-shaped contact longer than 50 is stored as another contact", () => {
    const long = "+49 30 23125 0101 / +49 30 23125 0102 / +49 30 23125 0103"; // 56
    expect(classifyContact(long)).toBe("other");
    expect(parseApplicationInput({ ...base, contacts: [long] }).contactOther).toBe(long);
  });
});
