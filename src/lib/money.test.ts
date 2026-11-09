import { expect, test } from "vite-plus/test";
import { addMonths, chargeMonths, fmt, isOverdue, today, ordinal, roomNo } from "./money";

test("addMonths crosses years both ways", () => {
  expect(addMonths("2026-11", 2)).toBe("2027-01");
  expect(addMonths("2026-01", -1)).toBe("2025-12");
});

test("chargeMonths: mid-month move-in, ongoing", () => {
  expect(chargeMonths("2026-09-15", null, "2026-11")).toEqual(["2026-09", "2026-10", "2026-11"]);
});

test("chargeMonths: move-out mid-month charges that month, on the 1st does not", () => {
  expect(chargeMonths("2026-09-01", "2026-10-20", "2026-12")).toEqual(["2026-09", "2026-10"]);
  expect(chargeMonths("2026-09-01", "2026-11-01", "2026-12")).toEqual(["2026-09", "2026-10"]);
  expect(chargeMonths("2026-09-10", "2026-09-25", "2026-12")).toEqual(["2026-09"]);
});

test("room no. joins room and suffix", () => {
  expect(roomNo("2325", "A")).toBe("2325 A");
  expect(roomNo("2325", "")).toBe("2325");
});

test("overdue: arrears or past due day", () => {
  expect(isOverdue(0, 1000, 5, "2026-11-20")).toBe(false);
  expect(isOverdue(1000, 1000, 5, "2026-11-03")).toBe(false); // this month only, before due day
  expect(isOverdue(1000, 1000, 5, "2026-11-06")).toBe(true);
  expect(isOverdue(2000, 1000, 5, "2026-11-01")).toBe(true); // carries arrears
});

test("INR formatting and IST date", () => {
  expect(fmt(1250000)).toBe("₹12,500");
  expect(fmt(5050)).toBe("₹50.5");
  expect(today(new Date("2026-11-09T20:00:00Z"))).toBe("2026-11-10"); // already the 10th in IST
});

test("ordinal suffixes", () => {
  expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 28].map(ordinal).join(" ")).toBe(
    "1st 2nd 3rd 4th 11th 12th 13th 21st 22nd 28th",
  );
});
