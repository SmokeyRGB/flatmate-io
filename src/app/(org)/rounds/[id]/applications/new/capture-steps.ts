// Pure step logic of the capture form (design D6). No React, no I/O, so it is unit-testable without
// a DOM. The form component owns the useState calls; every decision that could go wrong lives here.
import {
  classifyContact,
  type ApplicationInputField,
  type ContactKind,
} from "@/modules/casting/application-input";

export type CaptureStep = 1 | 2 | 3;

export interface CaptureValues {
  message: string;
  name: string;
  age: string;
  contacts: string[];
  attributes: { label: string; value: string }[];
}

const blank = (s: string) => s.trim() === "";

// A server refusal returns the form to the step that holds the named field: the message is step 1,
// every other field is on step 2. A refusal with no field (a closed round, no permission) names no
// step, and the form stays where it is.
export function stepForField(field: ApplicationInputField | undefined): CaptureStep | null {
  if (field === undefined) return null;
  return field === "messageRaw" ? 1 : 2;
}

export type SubmitDecision =
  | { kind: "go"; step: CaptureStep }
  | { kind: "blank_name" }
  | { kind: "save" };

// What pressing the primary control (or Enter) does on a step. Step 1 only moves on. Step 2 needs a
// name; then it either goes on to the notice (a third-party source) or saves. Step 3 saves. The
// browser check is for speed only: the server stays authoritative (design D6).
export function decideSubmit(step: CaptureStep, state: { thirdParty: boolean; name: string }): SubmitDecision {
  if (step === 1) return { kind: "go", step: 2 };
  if (blank(state.name)) return { kind: "blank_name" };
  if (step === 2 && state.thirdParty) return { kind: "go", step: 3 };
  return { kind: "save" };
}

export function stepBack(step: CaptureStep): CaptureStep {
  return step === 3 ? 2 : 1;
}

// The values of the steps that are NOT on screen travel as hidden inputs, so one <form> spans all
// three steps and "Zurück" loses nothing. Step 1 shows the message; step 2 and the notice step
// (whose fields sit behind it) carry the details. The controls the visible step renders itself are
// not repeated here.
export function carriedFields(step: CaptureStep, values: CaptureValues): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  if (step !== 1) out.push({ name: "message", value: values.message });
  if (step !== 2) {
    out.push({ name: "applicantName", value: values.name });
    out.push({ name: "age", value: values.age });
    for (const c of values.contacts) if (!blank(c)) out.push({ name: "contact", value: c });
    for (const a of values.attributes) {
      out.push({ name: "attrLabel", value: a.label });
      out.push({ name: "attrValue", value: a.value });
    }
  }
  return out;
}

// The stored columns the entered contacts would fill, for the notice's category list and for the
// hint. Same rule as the server (classifyContact).
export function contactFields(contacts: string[]): {
  contactEmail: string;
  contactPhone: string;
  contactOther: string;
} {
  const by: Record<ContactKind, string> = { email: "", phone: "", other: "" };
  for (const c of contacts) if (!blank(c) && by[classifyContact(c)] === "") by[classifyContact(c)] = c;
  return { contactEmail: by.email, contactPhone: by.phone, contactOther: by.other };
}

// The input a `contact_kind_taken` refusal is about: the first later contact whose kind an earlier
// one already holds. The server names only the field (`contact`); the screen can name the input,
// because it knows the order they were typed in.
export function clashingContactIndex(contacts: string[]): number | null {
  const seen = new Set<ContactKind>();
  for (let i = 0; i < contacts.length; i++) {
    if (blank(contacts[i])) continue;
    const kind = classifyContact(contacts[i]);
    if (seen.has(kind)) return i;
    seen.add(kind);
  }
  return null;
}
