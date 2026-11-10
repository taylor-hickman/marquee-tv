import { describe, expect, test } from "vitest";
import { asciiName, fold, parseArtists, readings } from "./parse";

const known = new Map(
  [
    ["Tyler, The Creator", 1],
    ["Tyler The Creator", 1],
    ["Bo Reed", 2],
    ["Ada Lark", 3],
    ["Seun Kuti & Egypt 80", 4],
    ["Bomba Estéreo", 5],
  ].map(([name, id]) => [fold(name as string), id as number]),
);

describe("fold", () => {
  test("ignores case, accents, punctuation and spacing", () => {
    expect(fold("Bomba  Estéreo")).toBe(fold("bomba estereo"));
    expect(fold("Fontaines D.C.")).toBe(fold("Fontaines DC"));
    expect(fold("Tyler, The Creator")).toBe(fold("tyler the creator"));
  });
});

describe("readings", () => {
  test("every run of adjacent parts, as the title spells it", () => {
    expect(
      readings("Ada Lark, Bo Reed and Cy Moss").map((r) => r.name),
    ).toEqual([
      "Ada Lark",
      "Ada Lark, Bo Reed",
      "Ada Lark, Bo Reed and Cy Moss",
      "Bo Reed",
      "Bo Reed and Cy Moss",
      "Cy Moss",
    ]);
  });

  test.each([
    ["Ada & Bo", ["Ada", "Ada & Bo", "Bo"]],
    ["Ada x Bo", ["Ada", "Ada x Bo", "Bo"]],
    ["Ada feat. Bo", ["Ada", "Ada feat. Bo", "Bo"]],
    ["Ada ft. Bo", ["Ada", "Ada ft. Bo", "Bo"]],
    ["Ada with Bo", ["Ada", "Ada with Bo", "Bo"]],
    ["Ada", ["Ada"]],
  ])("%s", (text, names) => {
    expect(readings(text).map((r) => r.name)).toEqual(names);
  });

  test("an unshaped title also splits on the title's own punctuation", () => {
    expect(
      readings("Ada Lark - Slow Road (Live on KEXP)", { loose: true }).map(
        (r) => r.name,
      ),
    ).toContain("Ada Lark");
  });
});

describe("parseArtists", () => {
  test("a known name or alias resolves without a model", () => {
    expect(parseArtists("Tyler, The Creator", known)).toEqual({
      decided: true,
      artists: [{ id: 1, name: "Tyler, The Creator" }],
    });
    expect(parseArtists("bomba estereo", known)).toEqual({
      decided: true,
      artists: [{ id: 5, name: "bomba estereo" }],
    });
  });

  test("a whole known name wins over its parts", () => {
    expect(parseArtists("Seun Kuti & Egypt 80", known)).toEqual({
      decided: true,
      artists: [{ id: 4, name: "Seun Kuti & Egypt 80" }],
    });
  });

  test("a bill of known artists resolves to each, in billing order", () => {
    expect(
      parseArtists("Bo Reed, Ada Lark & Tyler, The Creator", known),
    ).toEqual({
      decided: true,
      artists: [
        { id: 2, name: "Bo Reed" },
        { id: 3, name: "Ada Lark" },
        { id: 1, name: "Tyler, The Creator" },
      ],
    });
  });

  test("an unknown name with no separator is a new artist", () => {
    expect(parseArtists("Cy Moss", known)).toEqual({
      decided: true,
      artists: [{ name: "Cy Moss" }],
    });
  });

  test("an unknown name with a separator is left to the model, with its readings", () => {
    const parsed = parseArtists("I'm With Her", known);
    expect(parsed.decided).toBe(false);
    expect(!parsed.decided && parsed.readings.map((r) => r.name)).toEqual([
      "I'm",
      "I'm With Her",
      "Her",
    ]);
    // One part known is not enough: the other could be part of a band name.
    expect(parseArtists("Ada Lark & the Moss", known).decided).toBe(false);
  });
});

describe("asciiName", () => {
  test("drops accents, and is undefined when there are none", () => {
    expect(asciiName("Bomba Estéreo")).toBe("Bomba Estereo");
    expect(asciiName("Ada Lark")).toBeUndefined();
  });
});
