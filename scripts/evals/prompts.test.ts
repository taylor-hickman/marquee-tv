import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { moodChip } from "@/contracts";
import { INSTRUCTION_TYPES, parsePrompts } from "./prompts";

const prompts = parsePrompts(readFileSync("docs/evals/prompts.md", "utf8"));

// The spread B5 asks for: the chips, artist seeds, durations and the five
// instruction types (build plan 5, B5).
describe("docs/evals/prompts.md", () => {
  it("holds 50 prompts numbered in order, each with an expectation", () => {
    expect(prompts.map((p) => p.n)).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1),
    );
    for (const p of prompts) {
      expect(p.text).not.toBe("");
      expect(p.expectation).not.toBe("");
    }
  });

  it("uses every chip at least five times", () => {
    for (const chip of moodChip.options) {
      expect(
        prompts.filter((p) => p.mood === chip).length,
        chip,
      ).toBeGreaterThanOrEqual(5);
    }
  });

  it("carries each instruction type at least five times", () => {
    for (const type of INSTRUCTION_TYPES) {
      expect(
        prompts.filter((p) => p.types.includes(type)).length,
        type,
      ).toBeGreaterThanOrEqual(5);
    }
  });

  it("spreads lengths across every preset and custom ones", () => {
    const lengths = new Set(prompts.map((p) => p.durationS));
    for (const preset of [1800, 3600, 7200, 10800]) {
      expect(lengths).toContain(preset);
    }
    expect(
      [...lengths].filter((s) => ![1800, 3600, 7200, 10800].includes(s)),
    ).not.toHaveLength(0);
  });

  it("has must-include seeds, influence-only seeds and both kinds of pin", () => {
    const seeds = prompts.flatMap((p) => p.seeds);
    expect(seeds.some((s) => s.mustInclude)).toBe(true);
    expect(seeds.some((s) => !s.mustInclude)).toBe(true);
    const pins = prompts.flatMap((p) => p.pins);
    expect(pins.some((p) => p.pinned === "position")).toBe(true);
    expect(pins.some((p) => p.pinned === "include")).toBe(true);
  });
});

describe("parsePrompts", () => {
  const row = (cells: string) => `| 1 | ${cells} |`;

  it("reads seeds, pins, a custom length and types", () => {
    const [p] = parsePrompts(
      row(
        "— | 1h30m | Tyler, The Creator!; Radiohead | @2 +4 | energy, format | Loud | Loud throughout",
      ),
    );
    expect(p).toEqual({
      n: 1,
      mood: undefined,
      durationS: 5400,
      seeds: [
        { name: "Tyler, The Creator", mustInclude: true },
        { name: "Radiohead", mustInclude: false },
      ],
      pins: [
        { index: 1, pinned: "position" },
        { index: 3, pinned: "include" },
      ],
      types: ["energy", "format"],
      text: "Loud",
      expectation: "Loud throughout",
    });
  });

  it("refuses an unknown chip, type, length or pin", () => {
    const ok = ["— ", " 2h ", " — ", " — ", " — ", " x ", " y"];
    const bad = (i: number, value: string) =>
      row(ok.map((c, j) => (j === i ? ` ${value} ` : c)).join("|"));
    expect(() => parsePrompts(bad(0, "brunch"))).toThrow();
    expect(() => parsePrompts(bad(1, "2 hours"))).toThrow("Bad length");
    expect(() => parsePrompts(bad(3, "@0"))).toThrow("Bad pin");
    expect(() => parsePrompts(bad(4, "vibes"))).toThrow("Bad instruction type");
  });
});
