import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyContact } from "@/modules/casting/application-input";
import { guard } from "../../../scripts/n8n/guard.js";

const fixtures = path.join(import.meta.dirname, "../../../scripts/n8n/fixtures");
const request = (name: string) =>
  JSON.parse(readFileSync(path.join(fixtures, `${name}.request.json`), "utf8")) as { text: string };

const KEYS = ["age", "applicantName", "attributes", "contacts", "messageRaw"];

describe("n8n applicant-parse guard", () => {
  it("passes a fully grounded extraction through and keeps the text verbatim", () => {
    const { text } = request("carla");
    const out = guard(text, {
      applicantName: "Carla Neumann",
      age: 26,
      contacts: ["carla.neumann@example.test", "+49 30 23125 0103"],
      attributes: [{ label: "Beruf", value: "Journalistin" }],
      transcript: "ignored on the text path",
    });
    expect(out).toEqual({
      applicantName: "Carla Neumann",
      age: 26,
      contacts: ["carla.neumann@example.test", "+49 30 23125 0103"],
      messageRaw: text,
      attributes: [{ label: "Beruf", value: "Journalistin" }],
    });
  });

  it("returns null and [] when the model found nothing", () => {
    const { text } = request("no-info");
    const out = guard(text, { applicantName: null, age: null, contacts: [], attributes: [] });
    expect(out).toEqual({
      applicantName: null,
      age: null,
      contacts: [],
      messageRaw: text,
      attributes: [],
    });
  });

  it("drops a name, contact and attribute the source does not contain", () => {
    const { text } = request("sparse-whatsapp");
    const out = guard(text, {
      applicantName: "Jonas Becker",
      age: 23,
      contacts: ["0176 12345678", "jonas@example.test", "+49 151 9999999"],
      attributes: [
        { label: "Wohnort", value: "Leipzig" },
        { label: "Hobby", value: "Klettern" },
      ],
    });
    expect(out.applicantName).toBeNull(); // "Becker" is not in the text
    expect(out.contacts).toEqual(["0176 12345678"]);
    expect(out.attributes).toEqual([{ label: "Wohnort", value: "Leipzig" }]);
  });

  it("matches phone numbers by digits, ignoring formatting", () => {
    const out = guard("Ruf mich an: 0176/123 456 78", {
      contacts: ["0176 12345678"],
    });
    expect(out.contacts).toEqual(["0176 12345678"]);
  });

  it("emits exactly the five contract keys, however much the model adds", () => {
    const { text } = request("injection");
    const out = guard(text, {
      applicantName: "Mia",
      age: 24,
      contacts: [],
      attributes: [],
      score: 10,
      rationale: "great",
    });
    expect(Object.keys(out).sort()).toEqual(KEYS);
    expect(out.applicantName).toBe("Mia");
    expect(out.age).toBe(24);
  });

  it("rejects an out-of-range or non-integer age", () => {
    expect(guard("x", { age: 151 }).age).toBeNull();
    expect(guard("x", { age: -1 }).age).toBeNull();
    expect(guard("x", { age: 26.5 }).age).toBeNull();
    expect(guard("x", { age: "26" }).age).toBeNull();
  });

  it("sorts contacts into kinds the way the app does (classifyContact)", () => {
    const samples = [
      "a@example.test",
      "b@example.org",
      "@carla_n",
      "@jonas_k",
      "a@b",
      "+49 30 23125 0103",
      "0176/123 456 78",
      "12345",
      "carla on instagram",
    ];
    const text = samples.join("  ");
    for (const x of samples) {
      for (const y of samples) {
        if (x === y) continue;
        const kept = guard(text, { contacts: [x, y] }).contacts;
        // One per kind: the pair survives whole only when the app files them under different kinds.
        const expected = classifyContact(x) === classifyContact(y) ? 1 : 2;
        expect(kept, `${x} | ${y}`).toHaveLength(expected);
      }
    }
  });

  it("keeps at most one contact per kind and three overall", () => {
    const text = "a@example.test b@example.test 030 1234567 @carla_n";
    const out = guard(text, {
      contacts: ["a@example.test", "b@example.test", "030 1234567", "@carla_n"],
    });
    expect(out.contacts).toEqual(["a@example.test", "030 1234567", "@carla_n"]);
  });

  it("caps attributes at 10 and drops over-long labels", () => {
    const words = Array.from({ length: 12 }, (_, i) => `Wort${i}x`);
    const text = words.join(" ");
    const out = guard(text, {
      attributes: [
        ...words.map((w, i) => ({ label: `L${i}`, value: w })),
        { label: "x".repeat(61), value: words[0] },
      ],
    });
    expect(out.attributes).toHaveLength(10);
    expect(out.attributes.every((a: { label: string }) => a.label.length <= 60)).toBe(true);
  });

  it("returns messageRaw null when the text exceeds the 4000 code point limit", () => {
    expect(guard("a".repeat(4001), {}).messageRaw).toBeNull();
    expect(guard("a".repeat(4000), {}).messageRaw).toBe("a".repeat(4000));
  });

  it("uses the transcript as the source on the screenshot path", () => {
    const out = guard(null, {
      transcript: "Hallo, ich bin Lea, 22. Mail: lea@example.test",
      applicantName: "Lea",
      age: 22,
      contacts: ["lea@example.test", "other@example.test"],
      attributes: [],
    });
    expect(out.messageRaw).toBe("Hallo, ich bin Lea, 22. Mail: lea@example.test");
    expect(out.contacts).toEqual(["lea@example.test"]);
    expect(out.applicantName).toBe("Lea");
  });

  it("survives a model output that is not an object", () => {
    for (const bad of [null, undefined, "text", 5, []]) {
      const out = guard("Hallo", bad);
      expect(Object.keys(out).sort()).toEqual(KEYS);
      expect(out.contacts).toEqual([]);
    }
  });
});
