// The nightly job: pass drafts whose seven days are up become read_only
// (PRD 16.1). .github/workflows/expire-passes.yml runs it against staging and
// production with each environment's DATABASE_URL.
import { sql } from "@/lib/db";
import { expirePasses } from "@/modules/billing";

const expired = await expirePasses(new Date());
console.log(
  `expired ${expired.length} pass draft${expired.length === 1 ? "" : "s"}`,
);
await sql.end();
