// Brief extraction, composition, refinement, validation (architecture 3, 6).
import {
  briefContext,
  performanceCards,
  retrieveCandidates,
} from "@/modules/catalog";
import { createFill } from "./fill";
import { type GenerateDeps, createGenerate } from "./generate";
import * as llm from "./llm";
import { createRefine } from "./refine";
import { createRegenerate } from "./regenerate";
import type { Fill, Generate, Refine, Regenerate } from "./types";

export type * from "./types";

const deps: GenerateDeps = {
  llm,
  briefContext,
  retrieveCandidates,
  performanceCards,
};

export const generate: Generate = createGenerate(deps);
export const refine: Refine = createRefine(deps);
export const regenerate: Regenerate = createRegenerate(deps);
export const fill: Fill = createFill(deps);
