// The YouTube queue URLs a handoff opens (PRD 7.5, architecture 7.2). Pure, so
// the client builds Play on YouTube with it and the server builds /s/:code.

// A watch_videos queue holds at most 50 videos.
export const PART_SIZE = 50;

export type HandoffPart = { ids: string[]; url: string };

// Play from here slices from `startIndex` first, then splits what is left into
// parts of at most PART_SIZE, in order.
export function handoffParts(
  videoIds: readonly string[],
  startIndex = 0,
): HandoffPart[] {
  if (
    !Number.isInteger(startIndex) ||
    startIndex < 0 ||
    startIndex > videoIds.length
  ) {
    throw new RangeError(`start index ${startIndex} is outside the list`);
  }
  const parts: HandoffPart[] = [];
  for (let i = startIndex; i < videoIds.length; i += PART_SIZE) {
    const ids = videoIds.slice(i, i + PART_SIZE);
    parts.push({
      ids,
      url: `https://www.youtube.com/watch_videos?video_ids=${ids.join(",")}`,
    });
  }
  return parts;
}
