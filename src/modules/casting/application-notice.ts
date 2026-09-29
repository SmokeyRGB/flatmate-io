// Pure helpers for the Art. 14 notice at capture (design D6). No database access, no I/O. The
// words and the text template live in src/ui/strings/de.ts; this file decides only WHICH
// categories were entered and WHAT the one-month date is.

export type NoticeCategory =
  | "name"
  | "age"
  | "email"
  | "phone"
  | "other"
  | "message"
  | "attributes";

// Anything the O3 form holds while typing, or a stored row: strings may be blank, the age may be a
// number or a string, the attributes an array of rows.
export interface NoticeFields {
  applicantName?: string | null;
  age?: number | string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactOther?: string | null;
  messageRaw?: string | null;
  attributes?: ReadonlyArray<{ label?: string | null; value?: string | null }> | null;
}

function filled(s: string | null | undefined): boolean {
  return typeof s === "string" && s.trim() !== "";
}

// Fixed order, so the sentence is stable: name, age, email, phone, other, message, attributes.
// A category is listed only when it was actually filled in, never a list that claims more than is
// there (FR-3.11).
export function noticeCategories(fields: NoticeFields): NoticeCategory[] {
  const out: NoticeCategory[] = [];
  if (filled(fields.applicantName)) out.push("name");
  if (
    fields.age !== null &&
    fields.age !== undefined &&
    (typeof fields.age === "number" || filled(fields.age))
  ) {
    out.push("age");
  }
  if (filled(fields.contactEmail)) out.push("email");
  if (filled(fields.contactPhone)) out.push("phone");
  if (filled(fields.contactOther)) out.push("other");
  if (filled(fields.messageRaw)) out.push("message");
  if (
    Array.isArray(fields.attributes) &&
    fields.attributes.some((a) => filled(a?.label) || filled(a?.value))
  ) {
    out.push("attributes");
  }
  return out;
}

export interface CalendarDate {
  y: number;
  m: number; // 1-12
  d: number;
}

const BERLIN = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function berlinDate(instant: Date): CalendarDate {
  const parts = BERLIN.formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of the NEXT month = last of this
}

// Assumption A2: "one month after capture" is a calendar month counted on the Europe/Berlin
// calendar date, clamped to the last day of the target month (31 Jan -> 28/29 Feb). A legal
// reading, not a statute quote; the text says "spätestens bis", so erring early is safe.
export function oneMonthAfter(instant: Date): CalendarDate {
  const { y, m, d } = berlinDate(instant);
  const ty = m === 12 ? y + 1 : y;
  const tm = m === 12 ? 1 : m + 1;
  return { y: ty, m: tm, d: Math.min(d, daysInMonth(ty, tm)) };
}

// The Europe/Berlin calendar date of an instant, for "today" and for created_at.
export function calendarDateOf(instant: Date): CalendarDate {
  return berlinDate(instant);
}

// True when the deadline day is over: today (Berlin) is strictly after it. The deadline day itself
// still counts as in time (the text says „spätestens bis").
export function isDeadlinePassed(deadline: CalendarDate, now: Date): boolean {
  const t = berlinDate(now);
  return t.y !== deadline.y ? t.y > deadline.y : t.m !== deadline.m ? t.m > deadline.m : t.d > deadline.d;
}

// "TT.MM.JJJJ", the German date order, for the duty line.
export function formatDateDe(date: CalendarDate): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.d)}.${pad(date.m)}.${date.y}`;
}
