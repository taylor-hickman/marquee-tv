// The artist parser: splits a title's artist text into readings and resolves
// them against the catalog's artist names and aliases.

// One reading of the text: a run of adjacent parts, spelled as the title spells
// it. `from` and `to` are the part indices it covers, `to` exclusive.
export type Reading = { name: string; from: number; to: number };

export type Artist = { id?: number; name: string };

export type Parsed =
  | { decided: true; artists: Artist[] }
  | { decided: false; readings: Reading[] };

// Between names on a bill. Band names use them too ("Tyler, The Creator",
// "Tank and the Bangas"), which is why a split needs every part known.
const NAMES = /\s*,\s*|\s+(?:&|and|x|\+|feat\.?|ft\.?|featuring|with)\s+/gi;
// Between pieces of a title that fits no shape; no reading spans one.
const PIECES = /\s*[:|()[\]]\s*|\s+[-–—]\s+/g;

// The key names and aliases are compared by.
export function fold(name: string) {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}&\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// The alias a new artist gets: the name without accents, for typeahead.
export function asciiName(name: string) {
  const plain = name.normalize("NFKD").replace(/\p{M}/gu, "");
  return plain === name ? undefined : plain;
}

function spans(text: string, separator: RegExp, offset = 0) {
  const out: Array<{ start: number; end: number }> = [];
  let start = 0;
  for (const m of [
    ...text.matchAll(separator),
    { index: text.length, 0: "" },
  ]) {
    const piece = text.slice(start, m.index);
    const lead = piece.length - piece.trimStart().length;
    if (piece.trim()) {
      out.push({
        start: offset + start + lead,
        end: offset + start + piece.trimEnd().length,
      });
    }
    start = m.index + m[0].length;
  }
  return out;
}

// Every run of adjacent name parts. `loose` also splits on the title's own
// punctuation, for a title that fits no shape.
export function readings(text: string, { loose = false } = {}): Reading[] {
  const pieces = loose ? spans(text, PIECES) : [{ start: 0, end: text.length }];
  const out: Reading[] = [];
  let index = 0;
  for (const piece of pieces) {
    const parts = spans(text.slice(piece.start, piece.end), NAMES, piece.start);
    for (let i = 0; i < parts.length; i++) {
      for (let j = i; j < parts.length; j++) {
        const name = text.slice(parts[i].start, parts[j].end);
        if (!out.some((r) => r.name === name)) {
          out.push({ name, from: index + i, to: index + j + 1 });
        }
      }
    }
    index += parts.length;
  }
  return out;
}

// Decided when the text splits into names the catalog knows (fewest names
// first, so a known band beats its parts), or when it has no separator at all,
// which makes it one new artist. Anything else goes to the model.
export function parseArtists(text: string, known: Map<string, number>): Parsed {
  const options = readings(text);
  const parts = Math.max(0, ...options.map((r) => r.to));
  const best: Array<Reading[] | undefined> = [[]];
  for (let k = 1; k <= parts; k++) {
    for (const r of options) {
      const before = best[r.from];
      if (r.to !== k || !before || !known.has(fold(r.name))) continue;
      const current = best[k];
      if (!current || before.length + 1 < current.length)
        best[k] = [...before, r];
    }
  }
  const found = parts > 0 ? best[parts] : undefined;
  if (found)
    return { decided: true, artists: found.map((r) => resolve(r.name, known)) };
  if (parts === 1)
    return { decided: true, artists: [{ name: options[0].name }] };
  return { decided: false, readings: options };
}

export function resolve(name: string, known: Map<string, number>): Artist {
  const id = known.get(fold(name));
  return id === undefined ? { name } : { id, name };
}
