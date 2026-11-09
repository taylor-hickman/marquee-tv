import { errorStatus, eventsRequest, type ErrorBody } from "@/contracts";
import { getOwner } from "@/lib/auth";
import { ipHash, limitPlain } from "@/lib/rate-limit";
import * as events from "@/modules/events";

const fail = (error: ErrorBody) =>
  Response.json(error, {
    status: errorStatus[error.error],
    headers:
      error.error === "rate_limited"
        ? { "retry-after": String(error.retryAfterS) }
        : undefined,
  });

// Client-side journey events (architecture 9.3). Only the names in journeys 6
// parse; anything else is invalid_request.
export async function POST(request: Request) {
  const limited = limitPlain("events", ipHash(request), new Date());
  if (limited) return fail(limited);

  const parsed = eventsRequest.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return fail({
      error: "invalid_request",
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "body"}: ${issue.message}`,
      ),
    });
  }

  const event = parsed.data;
  // Handoff fields go in props; the handoff_event row is C3's.
  const props =
    "revision" in event
      ? {
          revision: event.revision,
          part: event.part,
          startIndex: event.startIndex,
          surface: event.surface ?? null,
        }
      : event.props;
  await events.write(event.name, {
    owner: await getOwner(request),
    draftId: event.draftId,
    props,
  });
  return Response.json({ ok: true });
}
