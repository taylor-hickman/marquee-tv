// Brief extraction, composition, refinement, validation (architecture 3, 6).
// Lane B fills these in.
import { notImplemented } from "@/contracts";
import {
  briefContext,
  performanceCards,
  retrieveCandidates,
} from "@/modules/catalog";
import { createGenerate } from "./generate";
import * as llm from "./llm";
import type { Fill, Generate, Refine, Regenerate } from "./types";

export type * from "./types";

export const generate: Generate = createGenerate({
  llm,
  briefContext,
  retrieveCandidates,
  performanceCards,
});
export const refine: Refine = () => notImplemented("curator.refine");
export const regenerate: Regenerate = () =>
  notImplemented("curator.regenerate");
export const fill: Fill = () => notImplemented("curator.fill");
