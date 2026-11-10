import { describe, expect, test } from "vitest";
import { clock, total } from "./format";

describe("clock", () => {
  test("minutes and zero-padded seconds", () => {
    expect(clock(1122)).toBe("18:42");
    expect(clock(248)).toBe("4:08");
  });

  test("hours when the set runs past one", () => {
    expect(clock(3725)).toBe("1:02:05");
  });

  test("blank when the cached duration has expired", () => {
    expect(clock(null)).toBe("");
  });
});

describe("total", () => {
  test("rounds to the minute, as the drawer shows it", () => {
    expect(total([1122, 248, 1635])).toBe("50 m");
  });

  test("hours and minutes past the hour", () => {
    expect(total([3600, 600])).toBe("1 h 10 m");
    expect(total([7200])).toBe("2 h");
  });

  test("expired durations count as zero", () => {
    expect(total([null, 120])).toBe("2 m");
    expect(total([])).toBe("0 m");
  });
});
