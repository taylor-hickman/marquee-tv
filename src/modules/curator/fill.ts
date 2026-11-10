// Let AI fill the rest (architecture 6.3, J4): generate's pipeline with the
// person's picks as inclusion pins, which the composer places and repair keeps.
// A pick the person moved by hand is a position pin and keeps its index. The
// revision is a generate: the contract has no fill trigger.
import { type GenerateDeps, createGenerate } from "./generate";
import type { Fill } from "./types";

export function createFill(deps: GenerateDeps): Fill {
  const generate = createGenerate(deps);
  return (state, options) =>
    generate(
      {
        ...state,
        // Picks become pins (PRD 7.3), even one the person unpinned.
        items: state.items.map((i) =>
          i.source === "manual" && i.pinned === "none"
            ? { ...i, pinned: "include" }
            : i,
        ),
      },
      options,
    );
}
