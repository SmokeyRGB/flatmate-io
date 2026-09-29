import { describe, expect, it } from "vitest";
import {
  ApplicationInputError,
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
      contactEmail: "  ",
      contactPhone: "",
      contactOther: "\t",
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

  it("the name limit is 200 code points: 200 passes, 201 is too_long", () => {
    expect(parseApplicationInput({ ...base, applicantName: "a".repeat(200) }).applicantName).toHaveLength(200);
    expectRefusal({ ...base, applicantName: "a".repeat(201) }, "too_long", "applicantName");
  });

  it("counts code points, not UTF-16 units: 4000 emoji are accepted, 4001 are too_long", () => {
    const emoji = "\u{1F600}"; // one code point, two UTF-16 units
    expect(parseApplicationInput({ ...base, messageRaw: emoji.repeat(4000) }).messageRaw).not.toBeNull();
    expectRefusal({ ...base, messageRaw: emoji.repeat(4001) }, "too_long", "messageRaw");
  });

  it("the contact limits are 254, 50 and 200", () => {
    expect(parseApplicationInput({ ...base, contactEmail: "e".repeat(254) }).contactEmail).toHaveLength(254);
    expectRefusal({ ...base, contactEmail: "e".repeat(255) }, "too_long", "contactEmail");
    expectRefusal({ ...base, contactPhone: "1".repeat(51) }, "too_long", "contactPhone");
    expectRefusal({ ...base, contactOther: "x".repeat(201) }, "too_long", "contactOther");
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
    expectRefusal({ ...base, contactOther: "\uDC00" }, "invalid_characters", "contactOther");
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
});
