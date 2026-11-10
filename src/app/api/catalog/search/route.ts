import { catalogSearchRequest, errorStatus, type ErrorBody } from "@/contracts";
import { ipHash, limitPlain } from "@/lib/rate-limit";
import * as catalog from "@/modules/catalog";

const fail = (error: ErrorBody) =>
  Response.json(error, {
    status: errorStatus[error.error],
    headers:
      error.error === "rate_limited"
        ? { "retry-after": String(error.retryAfterS) }
        : undefined,
  });

// Browse and search (PRD 7.3), with the plain per-IP limit (architecture 9.2).
export async function GET(request: Request) {
  const limited = limitPlain("catalog_search", ipHash(request), new Date());
  if (limited) return fail(limited);

  const parsed = catalogSearchRequest.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return fail({
      error: "invalid_request",
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "query"}: ${issue.message}`,
      ),
    });
  }
  return Response.json(await catalog.search(parsed.data));
}
