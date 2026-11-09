import { z } from "zod";
import { brief } from "./brief";
import { runId } from "./common";
import { curatorWarning } from "./curator";
import { draftView } from "./draft";

// Events on the generate and refine streams, in order: started, brief, candidates,
// then result or error (architecture 6.2). `started` goes out before any model call.
export const streamEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("started"), runId }),
  // Echoed right away so the person can catch a misread ("2 hours · starts mellow").
  z.object({ type: z.literal("brief"), brief, echo: z.string().min(1) }),
  z.object({
    type: z.literal("candidates"),
    count: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("result"),
    draft: draftView,
    warnings: z.array(curatorWarning),
  }),
  // The draft stays at its last revision (architecture 9.5). The 20 s ceiling ends here too.
  z.object({ type: z.literal("error"), code: z.literal("generation_failed") }),
]);
export type StreamEvent = z.infer<typeof streamEvent>;
