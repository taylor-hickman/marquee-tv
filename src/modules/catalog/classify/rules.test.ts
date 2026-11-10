import { describe, expect, test } from "vitest";
import { readTitle } from "./rules";

// Made-up titles in the shapes the Phase 0 run measured (ingest-run.md):
// real titles are API Data and stay out of the repo.
const desk = {
  name: "Tiny Desk Concerts",
  titleRule: "{artist}: Tiny Desk Concert",
};
const home = {
  name: "Tiny Desk Home Concerts",
  titleRule: "{artist}: Tiny Desk (Home) Concert",
};
const kexp = {
  name: "Live on KEXP",
  titleRule: "{artist} - Full Performance (Live on KEXP)",
};
const colors = {
  name: "A COLORS SHOW",
  titleRule: "{artist} - {song} | A COLORS SHOW",
};
const LONG = 20 * 60;

describe("the series' title rule", () => {
  test.each([
    [desk, "Ada Lark: Tiny Desk Concert", "Ada Lark"],
    [home, "Ada Lark: Tiny Desk (Home) Concert", "Ada Lark"],
    [kexp, "Ada Lark - Full Performance (Live on KEXP)", "Ada Lark"],
    [
      colors,
      "Ada Lark & Bo Reed - Low Tide | A COLORS SHOW",
      "Ada Lark & Bo Reed",
    ],
    [desk, "ada lark: TINY DESK CONCERT", "ada lark"],
    [desk, "Ada Lark - Tiny Desk Concert", "Ada Lark"],
  ])("%#: %s", (series, title, artist) => {
    expect(readTitle(title, LONG, series)).toEqual({
      kind: "performance",
      artistText: artist,
      shaped: true,
    });
  });

  test("a separator the rule has is required", () => {
    expect(readTitle("Ada Lark Tiny Desk Concert", LONG, desk)).toEqual(
      expect.objectContaining({ shaped: false }),
    );
    expect(readTitle("Ada Lark Low Tide | A COLORS SHOW", 200, colors)).toEqual(
      expect.objectContaining({ shaped: false }),
    );
  });

  test("a qualifier the shapes don't know leaves the title undecided", () => {
    expect(
      readTitle("Ada Lark: Juneteenth: Tiny Desk Concert", LONG, desk).shaped,
    ).toBe(false);
  });
});

describe("Tiny Desk shapes the Phase 0 rule missed", () => {
  test.each([
    [desk, "Ada Lark: NPR Music Tiny Desk Concert"],
    [desk, "Ada Lark: NPR Tiny Desk Concert"],
    [desk, "Ada Lark NPR Music Tiny Desk Concert"],
    [desk, "Ada Lark: Holiday Tiny Desk Concert"],
    [desk, "Holiday Tiny Desk Concert: Ada Lark"],
    [desk, "Ada Lark: Tiny Desk Concert (From The Archives)"],
    [desk, "From The Archives: Ada Lark: Tiny Desk Concert"],
    [desk, "Ada Lark, 2019 Tiny Desk Contest Winner: Tiny Desk Concert"],
    [home, "Tiny Desk (Home) Concert: Ada Lark"],
  ])("%#: %s", (series, title) => {
    expect(readTitle(title, LONG, series)).toEqual({
      kind: "performance",
      artistText: "Ada Lark",
      shaped: true,
    });
  });
});

describe("kind", () => {
  test("trailer words make a trailer, keeping the artist", () => {
    expect(
      readTitle("Ada Lark: Tiny Desk Concert (Trailer)", 60, desk),
    ).toEqual({
      kind: "trailer",
      artistText: "Ada Lark",
      shaped: true,
    });
    expect(
      readTitle("Tiny Desk Concert teaser: coming soon", 40, desk),
    ).toEqual({
      kind: "trailer",
      shaped: false,
    });
  });

  test("interview words make an interview", () => {
    expect(
      readTitle("Ada Lark - Interview (Tiny Desk Concerts)", 500, desk),
    ).toEqual(expect.objectContaining({ kind: "interview" }));
    expect(
      readTitle("Behind the Tiny Desk Concert with the crew", LONG, desk).kind,
    ).toBe("interview");
  });

  test("a kind word inside the artist's name doesn't count", () => {
    expect(
      readTitle("The Interviews: Tiny Desk Concert", LONG, desk).kind,
    ).toBe("performance");
  });

  test("a short video in the series shape is a clip", () => {
    expect(readTitle("Ada Lark: Tiny Desk Concert", 120, desk).kind).toBe(
      "clip",
    );
    // A COLORS show is one song, so its floor is lower.
    expect(
      readTitle("Ada Lark - Low Tide | A COLORS SHOW", 150, colors).kind,
    ).toBe("performance");
    expect(
      readTitle("Ada Lark - Low Tide | A COLORS SHOW", 45, colors).kind,
    ).toBe("clip");
  });

  test("a title in no known shape is left undecided, with the series text cut out", () => {
    expect(readTitle("The best Tiny Desk Concert moments", LONG, desk)).toEqual(
      {
        artistText: "The best | moments",
        shaped: false,
      },
    );
    expect(readTitle("Ada Lark - Slow Road (Live on KEXP)", 300, kexp)).toEqual(
      {
        artistText: "Ada Lark - Slow Road (Live on KEXP)",
        shaped: false,
      },
    );
  });
});
