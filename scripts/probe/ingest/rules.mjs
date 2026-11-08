// Title rules for NPR Music's Tiny Desk series: decide kind and parse the artist without a model call.
// A title the rules can't decide comes back with reviewStatus 'flagged'; A3 sends those to the model.

export const SERIES = 'Tiny Desk Concerts';

// "Jungle: Tiny Desk Concert", "Mac Miller: NPR Music Tiny Desk Concert", "Lizzo: Tiny Desk (Home) Concert"
const CONCERT = /^(?<artist>.+?)\s*:\s*(?:NPR Music\s+)?Tiny Desk\s+(?:\(Home\)\s+)?(?:Home\s+)?Concerts?\b(?<rest>.*)$/i;
const TRAILER = /\b(trailer|teaser|announc\w*|coming soon)\b/i;
const INTERVIEW = /\b(interview|in conversation|behind the|q&a)\b/i;
const NOT_SERIES = /tiny desk (contest|korea|japan|fest)/i;
const MULTI_ARTIST = /\s(?:feat\.?|ft\.?|with|x)\s/i;
const MIN_PERFORMANCE_S = 180;

/** @returns {{ inSeries: boolean, kind?: string, artists?: string[], reviewStatus?: string, reason: string }} */
export function classify(title, durationS) {
  if (!/tiny desk/i.test(title)) return { inSeries: false, reason: 'no series name' };
  if (NOT_SERIES.test(title)) return { inSeries: false, reason: 'other Tiny Desk series' };

  const m = title.match(CONCERT);
  if (!m) {
    if (TRAILER.test(title)) return result('trailer', [], 'accepted', 'trailer words');
    if (INTERVIEW.test(title)) return result('interview', [], 'accepted', 'interview words');
    return result(null, [], 'flagged', 'names the series, matches no rule');
  }

  const artist = m.groups.artist.trim();
  if (TRAILER.test(m.groups.rest)) return result('trailer', [artist], 'accepted', 'trailer words after series name');
  if (durationS < MIN_PERFORMANCE_S) return result('clip', [artist], 'accepted', `under ${MIN_PERFORMANCE_S} s`);
  if (MULTI_ARTIST.test(artist)) return result('performance', [artist], 'flagged', 'possible multiple artists');
  return result('performance', [artist], 'accepted', 'concert title rule');
}

function result(kind, artists, reviewStatus, reason) {
  return { inSeries: true, kind, artists, reviewStatus, reason };
}
