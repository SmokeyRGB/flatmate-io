import { describe, expect, it } from "vitest";
import {
  calendarDateOf,
  formatDateDe,
  isDeadlinePassed,
  noticeCategories,
  oneMonthAfter,
} from "@/modules/casting/application-notice";

describe("noticeCategories", () => {
  it("a name only lists the name", () => {
    expect(noticeCategories({ applicantName: "Anna" })).toEqual(["name"]);
  });

  it("name + phone lists exactly those two, and nothing else", () => {
    expect(noticeCategories({ applicantName: "Anna", contactPhone: "+49 30 23125 0100" })).toEqual([
      "name",
      "phone",
    ]);
  });

  it("all fields, in the fixed order: name, age, email, phone, other, message, attributes", () => {
    expect(
      noticeCategories({
        // deliberately listed in a different order than the fixed one
        attributes: [{ label: "Beruf", value: "Tischler" }],
        messageRaw: "Hallo",
        contactOther: "Portal",
        contactPhone: "1",
        contactEmail: "a@example.test",
        age: 30,
        applicantName: "Anna",
      }),
    ).toEqual(["name", "age", "email", "phone", "other", "message", "attributes"]);
  });

  it("blank values are not categories (never a list that claims more than is filled in)", () => {
    expect(
      noticeCategories({
        applicantName: "Anna",
        age: "",
        contactEmail: "  ",
        messageRaw: "\n",
        attributes: [{ label: "", value: "" }],
      }),
    ).toEqual(["name"]);
  });

  it("an age of 0 still counts", () => {
    expect(noticeCategories({ applicantName: "A", age: 0 })).toEqual(["name", "age"]);
  });
});

describe("oneMonthAfter (assumption A2: a calendar month on the Berlin date, clamped to the month end)", () => {
  const ymd = (d: { y: number; m: number; d: number }) =>
    `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;

  it("31 Jan 2026 -> 28 Feb 2026", () => {
    expect(ymd(oneMonthAfter(new Date("2026-01-31T12:00:00Z")))).toBe("2026-02-28");
  });

  it("31 Jan 2028 -> 29 Feb 2028 (leap year)", () => {
    expect(ymd(oneMonthAfter(new Date("2028-01-31T12:00:00Z")))).toBe("2028-02-29");
  });

  it("15 Mar 2026 -> 15 Apr 2026", () => {
    expect(ymd(oneMonthAfter(new Date("2026-03-15T12:00:00Z")))).toBe("2026-04-15");
  });

  it("a UTC instant late on 31 Jan that is already 1 Feb in Berlin -> 1 Mar", () => {
    // 2026-01-31T23:30Z is 2026-02-01 00:30 in Berlin (UTC+1 in winter)
    expect(ymd(oneMonthAfter(new Date("2026-01-31T23:30:00Z")))).toBe("2026-03-01");
  });

  it("December rolls into the next year", () => {
    expect(ymd(oneMonthAfter(new Date("2026-12-31T12:00:00Z")))).toBe("2027-01-31");
  });
});

describe("date helpers", () => {
  it("isDeadlinePassed: the deadline day itself is still in time", () => {
    const deadline = { y: 2026, m: 10, d: 15 };
    expect(isDeadlinePassed(deadline, new Date("2026-10-15T12:00:00Z"))).toBe(false);
    expect(isDeadlinePassed(deadline, new Date("2026-10-16T12:00:00Z"))).toBe(true);
    expect(isDeadlinePassed(deadline, new Date("2026-09-01T12:00:00Z"))).toBe(false);
  });

  it("formatDateDe writes TT.MM.JJJJ", () => {
    expect(formatDateDe({ y: 2026, m: 3, d: 5 })).toBe("05.03.2026");
  });

  it("calendarDateOf uses the Berlin date", () => {
    expect(calendarDateOf(new Date("2026-01-31T23:30:00Z"))).toEqual({ y: 2026, m: 2, d: 1 });
  });
});
