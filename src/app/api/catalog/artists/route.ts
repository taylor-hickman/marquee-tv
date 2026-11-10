import { catalogArtistsRequest, errorStatus } from "@/contracts";
import * as catalog from "@/modules/catalog";

// Artist typeahead over names and aliases (PRD 7.2).
export async function GET(request: Request) {
  const parsed = catalogArtistsRequest.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return Response.json(
      {
        error: "invalid_request",
        issues: parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "query"}: ${issue.message}`,
        ),
      },
      { status: errorStatus.invalid_request },
    );
  }
  return Response.json({
    artists: await catalog.artistTypeahead(parsed.data.q),
  });
}
