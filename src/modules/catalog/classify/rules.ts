// Per-series title rules (architecture 8, `classify`): the kind of an upload and
// the text that names its artists, read from the title with no model call.

export const KINDS = ["performance", "interview", "trailer", "clip"] as const;
export type Kind = (typeof KINDS)[number];

export type SeriesRule = { name: string; titleRule: string };

// What the rules could read. `shaped` means the title fits one of the series'
// shapes, so `artistText` is exactly the artist slot. Otherwise `artistText`,
// when kind is undecided, is the whole title with the series name cut out,
// for the model to choose readings from.
export type TitleRead = { kind?: Kind; artistText?: string; shaped: boolean };

// Title shapes the series' own rule doesn't cover, keyed by that rule, written
// in the same template language. The Tiny Desk ones are the gaps the Phase 0
// run measured (docs/architecture/ingest-run.md). Tried before the series rule.
const MORE_SHAPES: Record<string, string[]> = {
  "{artist}: Tiny Desk Concert": [
    "{artist}: NPR Music Tiny Desk Concert",
    "{artist} NPR Music Tiny Desk Concert",
    "{artist}: NPR Tiny Desk Concert",
    "{artist}: Holiday Tiny Desk Concert",
    "Holiday Tiny Desk Concert: {artist}",
    "From The Archives: {artist}: Tiny Desk Concert",
    "{artist}, {year} Tiny Desk Contest Winner: Tiny Desk Concert",
  ],
  "{artist}: Tiny Desk (Home) Concert": ["Tiny Desk (Home) Concert: {artist}"],
};

const TRAILER = /\b(trailer|teaser|announc\w*|coming soon)\b/i;
const INTERVIEW = /\b(interview|in conversation|behind the|q&a)\b/i;

// A full set runs at least 3 minutes; a series filmed one song at a time
// ({song} in its rule) at least one.
const minSeconds = (rule: string) => (rule.includes("{song}") ? 60 : 180);

export function readTitle(
  title: string,
  durationS: number,
  series: SeriesRule,
): TitleRead {
  const shapes = [...(MORE_SHAPES[series.titleRule] ?? []), series.titleRule];
  const artistText = shapes
    .map((shape) => compile(shape).exec(title)?.groups?.artist.trim())
    // A colon or bar left in the slot means a qualifier the shapes don't know.
    .find((artist) => artist && !/[:|]/.test(artist));

  if (artistText !== undefined) {
    const rest = title.replace(artistText, "");
    const kind = TRAILER.test(rest)
      ? "trailer"
      : INTERVIEW.test(rest)
        ? "interview"
        : durationS < minSeconds(series.titleRule)
          ? "clip"
          : "performance";
    return { kind, artistText, shaped: true };
  }
  if (TRAILER.test(title)) return { kind: "trailer", shaped: false };
  if (INTERVIEW.test(title)) return { kind: "interview", shaped: false };
  return { artistText: cutAnchor(title, series.titleRule), shaped: false };
}

const PUNCT = ":|\\-–—";
const separator = (run: string) =>
  run === ""
    ? ""
    : run.includes(",")
      ? "\\s*,\\s*"
      : run.trim() === ""
        ? "\\s+"
        : `\\s*[${PUNCT}]\\s*`;
const literal = (words: string) =>
  words
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");

// "{artist} - Full Performance (Live on KEXP)" becomes a case-insensitive
// pattern with an `artist` group. A colon, dash or bar in the rule matches any
// of them, as A2's series match does; trailing bracketed notes such as
// "(Trailer)" or "(From The Archives)" are allowed.
function compile(template: string) {
  const source = template
    .split(/(\{\w+\})/)
    .filter(Boolean)
    .map((piece) => {
      const slot = /^\{(\w+)\}$/.exec(piece)?.[1];
      if (slot === "year") return "\\d{4}";
      if (slot) return `(?<${slot}>.+?)`;
      const [, lead, words, trail] =
        /^([\s,:|\-–—]*)(.*?)([\s,:|\-–—]*)$/s.exec(piece)!;
      return separator(lead) + (words ? literal(words) : "") + separator(trail);
    })
    .join("");
  return new RegExp(`^\\s*${source}(?:\\s*[([][^)\\]]*[)\\]])*\\s*$`, "i");
}

// The title with the series' longest fixed text ("Tiny Desk Concert" in
// "{artist}: Tiny Desk Concert") and the separators around it turned into a bar.
function cutAnchor(title: string, titleRule: string) {
  const fixed = titleRule
    .split(/\{\w+\}/)
    .map((part) =>
      part.replace(new RegExp(`^[\\s${PUNCT}]+|[\\s${PUNCT}]+$`, "g"), ""),
    )
    .reduce((a, b) => (b.length > a.length ? b : a), "");
  if (!fixed) return title;
  const around = `[\\s${PUNCT}]*`;
  return title
    .replace(new RegExp(around + literal(fixed) + around, "gi"), " | ")
    .trim();
}
