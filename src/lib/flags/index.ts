import "server-only";
import type { z } from "zod";
import { handoffMode } from "@/contracts";
import { sql } from "@/lib/db";

// Runtime flags in app_flag (architecture 5.4), read per request so flipping one
// needs no deploy. Each key's value is checked against its schema.
const flags = { handoff_mode: handoffMode };

export type FlagKey = keyof typeof flags;

export async function getFlag<K extends FlagKey>(
  key: K,
): Promise<z.infer<(typeof flags)[K]>> {
  const [row] = await sql<{ value: string }[]>`
    select value from app_flag where key = ${key}`;
  return flags[key].parse(row?.value);
}
