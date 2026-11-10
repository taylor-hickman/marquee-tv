// The profile job (architecture 8), run after classify:
//
//   tsx --conditions=react-server scripts/ingest/profile/run.mts
//
// Needs DATABASE_URL and ANTHROPIC_API_KEY. Prints how many artists it profiled
// and how many similar-artist names resolved to catalog artists. Exits 1 when
// some artists got no answer; they stay without a profile for the next run.
import { sql } from "@/lib/db";
import { profile } from "@/modules/catalog/profile";
import { selectAdapter } from "@/modules/curator/llm";

try {
  const t = await profile(selectAdapter().compose);
  console.log(
    `profiled ${t.profiled}; ${t.resolved} of ${t.named} similar names resolved; ${t.failed} left without a profile, no answer`,
  );
  if (t.failed > 0) process.exitCode = 1;
} finally {
  await sql.end();
}
