// Analytics events (architecture 3). T4 fills this in.
import { notImplemented } from "@/contracts";
import type { Write } from "./types";

export type * from "./types";

export const write: Write = () => notImplemented("events.write");
