import { z } from "zod";
import { artistId, energy, publisherId, seriesId } from "./common";

// What the person gave us: landing prompt, mood chip, duration control, seeds
// (PRD 7.1, 7.2). Brief extraction turns it into a `brief`.
export const moodChip = z.enum([
  "dinner_party",
  "friends_over",
  "sunday_morning",
  "after_hours",
  "high_energy",
  "surprise_me",
]);

export const briefInput = z.object({
  text: z.string().max(1000),
  mood: moodChip.optional(),
  // Presets are 30 min, 1 h, 2 h, 3 h; custom is any whole minute up to 6 h.
  durationS: z
    .number()
    .int()
    .min(60)
    .max(6 * 3600)
    .multipleOf(60),
  // An artist not in the catalog is influence only: a name, no id, never must-include.
  seeds: z.array(
    z.union([
      z.object({ artistId, name: z.string().min(1), mustInclude: z.boolean() }),
      z.object({ name: z.string().min(1), mustInclude: z.literal(false) }),
    ]),
  ),
});
export type BriefInput = z.infer<typeof briefInput>;

const curveSegment = z
  .object({
    from_min: z.number().nonnegative(),
    to_min: z.number().positive(),
    energy,
  })
  .refine((s) => s.from_min < s.to_min, {
    message: "from_min must be before to_min",
  });

// Architecture 6.2 step 1. Energy and structure land in `curve`, source and format
// in the series constraints, familiarity in `novelty` (PRD 7.4).
export const brief = z.object({
  curve: z.array(curveSegment).min(1),
  genres: z.array(z.string().min(1)),
  scenes: z.array(z.string().min(1)),
  seeds: z.array(z.object({ artist_id: artistId, must_include: z.boolean() })),
  // Artists outside the catalog, described by the model for retrieval (architecture 6.1).
  influences: z.array(
    z.object({
      name: z.string().min(1),
      genres: z.array(z.string().min(1)),
      scenes: z.array(z.string().min(1)),
      energy,
    }),
  ),
  series_include: z.array(seriesId),
  series_exclude: z.array(seriesId),
  novelty: z.enum(["default", "prefer_unfamiliar"]),
  // "Surprise me" widens the genre match and samples within the energy range (6.2 step 2).
  surprise: z.boolean(),
  exclusions: z.object({
    artist_ids: z.array(artistId),
    publisher_ids: z.array(publisherId),
  }),
  duration_s: z.number().int().positive(),
});
export type Brief = z.infer<typeof brief>;

// Refine's brief step returns a delta against the current brief and the stretch of
// the list the instruction is about (architecture 6.3). A null scope is the whole list.
export const refineBrief = z.object({
  delta: brief.partial(),
  scope: z
    .object({
      from_index: z.number().int().nonnegative(),
      to_index: z.number().int().nonnegative(),
    })
    .refine((s) => s.from_index <= s.to_index, {
      message: "from_index must not pass to_index",
    })
    .nullable(),
});
export type RefineBrief = z.infer<typeof refineBrief>;
