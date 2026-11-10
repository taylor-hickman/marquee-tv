import { describe, expect, test } from "vitest";
import { ago } from "./format";

const now = new Date(2026, 10, 10, 9, 0);
const at = (month: number, day: number, year = 2026) =>
  new Date(year, month, day, 23, 30);

describe("ago", () => {
  test.each([
    [at(10, 10), "Today"],
    [at(10, 9), "Yesterday"],
    [at(10, 6), "4 days ago"],
    [at(10, 3), "Last week"],
    [at(9, 25), "2 weeks ago"],
    [at(8, 1), "Sep 1"],
    [at(11, 20, 2025), "Dec 20, 2025"],
  ])("%s reads %s", (date, text) => {
    expect(ago(date, now)).toBe(text);
  });
});
