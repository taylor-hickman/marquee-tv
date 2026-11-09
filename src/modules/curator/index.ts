// Brief extraction, composition, refinement, validation (architecture 3, 6).
// Lane B fills these in.
import { notImplemented } from "@/contracts";
import type { Fill, Generate, Refine, Regenerate } from "./types";

export type * from "./types";

export const generate: Generate = () => notImplemented("curator.generate");
export const refine: Refine = () => notImplemented("curator.refine");
export const regenerate: Regenerate = () =>
  notImplemented("curator.regenerate");
export const fill: Fill = () => notImplemented("curator.fill");
