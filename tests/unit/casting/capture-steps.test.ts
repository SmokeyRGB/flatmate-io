import { describe, expect, it } from "vitest";
import {
  carriedFields,
  clashingContactIndex,
  contactFields,
  decideSubmit,
  stepBack,
  stepForField,
  type CaptureValues,
} from "@/app/(org)/rounds/[id]/applications/new/capture-steps";
import type { ApplicationInputField } from "@/modules/casting/application-input";

// The form component itself is not rendered with a DOM here (no @testing-library in this repo), so
// the decisions that could go wrong are a pure helper and are tested as one (design D6).
const values: CaptureValues = {
  message: "MSG-sentinel",
  name: "NAME-sentinel",
  age: "27",
  contacts: ["lea@example.test", "", "Portal: lea"],
  attributes: [{ label: "Beruf", value: "Tischler" }],
};

describe("stepForField: a refusal returns to the step holding the named field", () => {
  // Break: return 2 for messageRaw, and the first case fails.
  it("the message is step 1, every other field is step 2, no field means stay", () => {
    expect(stepForField("messageRaw")).toBe(1);
    const others: ApplicationInputField[] = ["applicantName", "age", "contact", "attributes", "collectedFrom"];
    for (const field of others) expect(stepForField(field), field).toBe(2);
    expect(stepForField(undefined)).toBeNull();
  });
});

describe("decideSubmit", () => {
  it("step 1 only moves on, whatever is typed", () => {
    expect(decideSubmit(1, { thirdParty: false, name: "" })).toEqual({ kind: "go", step: 2 });
    expect(decideSubmit(1, { thirdParty: true, name: "" })).toEqual({ kind: "go", step: 2 });
  });

  // Break: drop the blank-name check, and both cases here fail.
  it("step 2 needs a name; a blank one (spaces only) is held back", () => {
    expect(decideSubmit(2, { thirdParty: false, name: "" })).toEqual({ kind: "blank_name" });
    expect(decideSubmit(2, { thirdParty: true, name: "   " })).toEqual({ kind: "blank_name" });
  });

  // Break: save straight from step 2 when the box is ticked, and the notice is skipped.
  it("step 2 saves for the applicant as source, and goes on to the notice for a third party", () => {
    expect(decideSubmit(2, { thirdParty: false, name: "Lea" })).toEqual({ kind: "save" });
    expect(decideSubmit(2, { thirdParty: true, name: "Lea" })).toEqual({ kind: "go", step: 3 });
  });

  it("step 3 saves (Verstanden)", () => {
    expect(decideSubmit(3, { thirdParty: true, name: "Lea" })).toEqual({ kind: "save" });
  });
});

describe("stepBack", () => {
  it("goes one step back and never below 1", () => {
    expect(stepBack(3)).toBe(2);
    expect(stepBack(2)).toBe(1);
    expect(stepBack(1)).toBe(1);
  });
});

describe("carriedFields: back and forth keeps every value, in one form", () => {
  const pairs = (step: 1 | 2 | 3) => carriedFields(step, values).map((f) => `${f.name}=${f.value}`);

  // Break: return [] when step is 2, and the message is lost when the moderator saves from step 2.
  it("step 1 carries the details, and not the message it shows itself", () => {
    const p = pairs(1);
    expect(p).toContain("applicantName=NAME-sentinel");
    expect(p).toContain("age=27");
    expect(p).toContain("contact=lea@example.test");
    expect(p).toContain("contact=Portal: lea");
    expect(p).toContain("attrLabel=Beruf");
    expect(p).toContain("attrValue=Tischler");
    expect(p.some((x) => x.startsWith("message="))).toBe(false);
  });

  it("step 2 carries the message, and not the details it shows itself", () => {
    const p = pairs(2);
    expect(p).toEqual(["message=MSG-sentinel"]);
  });

  it("step 3 carries everything", () => {
    const p = pairs(3);
    expect(p).toContain("message=MSG-sentinel");
    expect(p).toContain("applicantName=NAME-sentinel");
    expect(p).toContain("attrValue=Tischler");
  });

  it("blank contacts are not carried", () => {
    expect(pairs(3).filter((x) => x.startsWith("contact="))).toHaveLength(2);
  });
});

describe("contacts on the details step", () => {
  it("contactFields sorts by the server's rule, for the notice's categories", () => {
    expect(contactFields(["Portal: lea", "+49 30 23125 0101", "lea@example.test"])).toEqual({
      contactEmail: "lea@example.test",
      contactPhone: "+49 30 23125 0101",
      contactOther: "Portal: lea",
    });
    expect(contactFields([""])).toEqual({ contactEmail: "", contactPhone: "", contactOther: "" });
  });

  // Break: return 0 (or the first index of the kind), and the screen names the wrong input.
  it("clashingContactIndex names the LATER input of two of one kind", () => {
    expect(clashingContactIndex(["a@b.de", "+49 30 23125 0101", "c@d.de"])).toBe(2);
    expect(clashingContactIndex(["a@b.de", "", "c@d.de"])).toBe(2);
    expect(clashingContactIndex(["a@b.de", "+49 30 23125 0101", "Portal: x"])).toBeNull();
    expect(clashingContactIndex([""])).toBeNull();
  });
});
