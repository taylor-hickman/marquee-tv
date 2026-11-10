import type { z } from "zod";
import { errorStatus, type ApiResult, type ErrorBody } from "@/contracts";

// The HTTP edges the draft routes share: parse a body against its contract,
// and send an ApiResult with the status errorStatus gives it.

export async function readBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<ApiResult<z.infer<T>>> {
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
  return parsed.success
    ? { ok: true, value: parsed.data }
    : {
        ok: false,
        error: {
          error: "invalid_request",
          issues: parsed.error.issues.map(
            (issue) => `${issue.path.join(".") || "body"}: ${issue.message}`,
          ),
        },
      };
}

export function fail(error: ErrorBody): Response {
  return Response.json(error, {
    status: errorStatus[error.error],
    headers:
      error.error === "rate_limited"
        ? { "retry-after": String(error.retryAfterS) }
        : undefined,
  });
}

export function respond<T>(result: ApiResult<T>, status = 200): Response {
  return result.ok
    ? Response.json(result.value, { status })
    : fail(result.error);
}
