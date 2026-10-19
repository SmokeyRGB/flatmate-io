// Deterministic guard for the n8n applicant-parse workflow (G-L3: closed schema, nothing extra).
//
// This file is the single source for the workflow's "Guard & normalize" Code node:
// scripts/n8n/build-workflow.ts embeds it verbatim (minus the `export`), and
// tests/unit/n8n/guard.test.ts imports it. It must stay self-contained (no imports, no outer
// references), because n8n runs it in its own sandbox. The limits mirror APPLICATION_LIMITS in
// src/modules/casting/application-input.ts; if those change, change them here too.
//
// `source` is the text the model was given (text path) or null (screenshot path); `ai` is the
// parsed model output. Whatever the model says is only kept when the source backs it up.
export function guard(source, ai) {
  const L = {
    name: 200,
    email: 254,
    phone: 50,
    other: 200,
    message: 4000,
    attrCount: 10,
    attrLabel: 60,
    attrValue: 500,
    contactCount: 3,
  };
  const cpLen = (s) => Array.from(s).length;
  const norm = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const digits = (s) => s.replace(/\D/g, "");
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const clean = (s) => !s.includes("\u0000");
  // Same rule as classifyContact in src/modules/casting/application-input.ts (design D15);
  // tests/unit/n8n/guard.test.ts pins the cases where the two could drift.
  const classify = (v) => {
    const at = v.indexOf("@");
    if (!/\s/.test(v) && at > 0 && v.indexOf("@", at + 1) === -1) {
      const domain = v.slice(at + 1);
      for (let i = 1; i < domain.length - 1; i++) if (domain[i] === ".") return "email";
    }
    if (/^[0-9 +()\-/.]+$/.test(v) && (v.match(/[0-9]/g) || []).length >= 6 && cpLen(v) <= L.phone) {
      return "phone";
    }
    return "other";
  };

  const a = ai && typeof ai === "object" ? ai : {};
  // Text path: the pasted text itself, never a model rewrite. Screenshot path: the model's
  // verbatim transcript is the only text there is.
  const text = typeof source === "string" ? source : str(a.transcript) || null;
  const hay = text ? norm(text) : "";
  const hayDigits = text ? digits(text) : "";

  // Name: every word must occur in the source ("Carla Neumann" is backed by a signature plus an
  // address like carla.neumann@…), so an invented name is dropped but a surname seen only in an
  // email is not.
  let applicantName = null;
  const name = str(a.applicantName);
  if (name && cpLen(name) <= L.name && clean(name) && norm(name).split(" ").every((t) => hay.includes(t))) {
    applicantName = name;
  }

  const age = a.age;
  const ageOut = Number.isInteger(age) && age >= 0 && age <= 150 ? age : null;

  const contacts = [];
  const kinds = new Set();
  for (const raw of Array.isArray(a.contacts) ? a.contacts : []) {
    const c = str(raw);
    if (!c || !clean(c) || contacts.includes(c)) continue;
    const kind = classify(c);
    if (kinds.has(kind) || cpLen(c) > L[kind]) continue;
    const grounded =
      kind === "phone" ? digits(c).length >= 6 && hayDigits.includes(digits(c)) : hay.includes(norm(c));
    if (!grounded) continue;
    kinds.add(kind);
    contacts.push(c);
    if (contacts.length === L.contactCount) break;
  }

  // Attributes are paraphrase-prone ("Nichtraucher" for "nicht rauchend"), so the check is loose:
  // at least one word of the value must start like a word in the source. It drops invented
  // facts, not every liberty the model takes with a label.
  const attributes = [];
  for (const item of Array.isArray(a.attributes) ? a.attributes : []) {
    const label = str(item && item.label);
    const value = str(item && item.value);
    if (!label || !value || !clean(label) || !clean(value)) continue;
    if (cpLen(label) > L.attrLabel || cpLen(value) > L.attrValue) continue;
    const backed = norm(value)
      .split(/[^\p{L}\p{N}]+/u)
      .some((w) => w.length >= 4 && hay.includes(w.slice(0, 4)));
    if (!backed) continue;
    if (attributes.some((x) => x.label === label && x.value === value)) continue;
    attributes.push({ label, value });
    if (attributes.length === L.attrCount) break;
  }

  const messageRaw = text && cpLen(text) <= L.message && clean(text) ? text : null;

  return { applicantName, age: ageOut, contacts, messageRaw, attributes };
}
