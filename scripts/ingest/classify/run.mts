// The classify job (architecture 8), run after `pnpm ingest new`:
//
//   tsx --conditions=react-server scripts/ingest/classify/run.mts [--series 1,2]
//
// Needs DATABASE_URL, and ANTHROPIC_API_KEY unless LLM_ADAPTER=fake. Prints
// what it classified and how many rows the model decided.
import { parseArgs } from "node:util";
import { sql } from "@/lib/db";
import { classify } from "@/modules/catalog/classify";
import { selectAdapter } from "@/modules/curator/llm";

const { values } = parseArgs({ options: { series: { type: "string" } } });
const seriesIds = values.series?.split(",").map(Number);

try {
  const t = await classify(selectAdapter().extractBrief, seriesIds);
  console.log(
    `classified ${t.classified}: ${t.accepted} accepted, ${t.flagged} flagged; ${t.byModel} by model`,
  );
} finally {
  await sql.end();
}
