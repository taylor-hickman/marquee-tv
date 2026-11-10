import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import type { TransactionSql } from "postgres";
import {
  briefInput,
  draftId as draftIdSchema,
  type Brief,
  type BriefInput,
  type CuratorProposal,
  type DraftId,
  type ErrorBody,
  type Owner,
  type PerformanceId,
  type RevisionItem,
  type StreamEvent,
} from "@/contracts";
import { sql } from "@/lib/db";
import { limitRuns } from "@/lib/rate-limit";
import { canRunCurator } from "@/modules/billing";
import * as catalog from "@/modules/catalog";
import * as curator from "@/modules/curator";
import { RUN_CAP, getDraft } from "./drafts";
import type { ReplaceOptions, StartRun } from "./types";

// Model-backed runs (architecture 6.2, 6.3, 7.3): generate, regenerate, fill
// and refine. The checks come before the stream opens, so a refused run is a
// plain error response; once `started` is sent the run always ends in
// `result` or `error`, and writes its curator_run row whether or not anyone
// is still reading.

// The run gives up after this long (architecture 6.2, J11).
export const RUN_CEILING_MS = 20_000;

// A draft with no brief and nothing held, such as a hand-built set, runs on
// its own length, or two hours (the artist screen's default) when it has none.
const DEFAULT_DURATION_S = 2 * 3600;

type DraftRow = {
  id: DraftId;
  free: boolean;
  status: "active" | "awaiting_payment" | "read_only";
  current_revision: number | null;
  entitlement_id: string | null;
  duration_target_s: number | null;
  held_input: unknown;
};

type RevisionRow = {
  items: RevisionItem[];
  removed_ids: PerformanceId[];
  brief: Brief | null;
};

type Kind = "generate" | "regenerate" | "fill" | "refine";

const failed = (error: ErrorBody) => ({ ok: false, error }) as const;
const notFound = failed({ error: "not_found" });
const generationFailed: StreamEvent = {
  type: "error",
  code: "generation_failed",
};

async function ownedDraft(owner: Owner, draftId: DraftId) {
  if (!draftIdSchema.safeParse(draftId).success) return undefined;
  const guestId = owner.kind === "guest" ? owner.guestId : null;
  const userId = owner.kind === "user" ? owner.userId : null;
  const [draft] = await sql<DraftRow[]>`
    select id, free, status, current_revision, entitlement_id,
      duration_target_s, held_input
    from playlist_draft
    where id = ${draftId}
      and (owner_guest_id = ${guestId} or owner_user_id = ${userId})`;
  return draft;
}

async function currentRevision(draft: DraftRow) {
  if (draft.current_revision === null) return null;
  const [revision] = await sql<RevisionRow[]>`
    select items, removed_ids, brief from playlist_revision
    where draft_id = ${draft.id} and number = ${draft.current_revision}`;
  return revision ?? null;
}

// The owner's first model-backed draft becomes their free one. The unique
// index allows one per owner, so of two drafts racing for it one gets false.
async function markFree(draftId: DraftId): Promise<boolean> {
  try {
    await sql`update playlist_draft set free = true, updated_at = now()
      where id = ${draftId}`;
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return false;
    throw error;
  }
}

// A 402 holds the draft for payment, with the person's input when they sent
// one, so the run resumes after checkout without retyping (architecture 7.3).
async function hold(owner: Owner, draftId: DraftId, input?: BriefInput) {
  await sql`
    update playlist_draft
    set status = 'awaiting_payment', updated_at = now()
      ${input ? sql`, held_input = ${sql.json(input)}` : sql``}
    where id = ${draftId}`;
  const [row] =
    owner.kind === "guest"
      ? await sql`select cohort from guest where id = ${owner.guestId}`
      : await sql`select cohort from app_user where id = ${owner.userId}`;
  return failed({
    error: "payment_required",
    defaultPlan: row?.cohort === "sub_first" ? "subscription" : "session_pass",
  });
}

type RunFacts = Partial<CuratorProposal["run"]> & {
  brief?: Brief;
  warnings?: CuratorProposal["warnings"];
};

const insertRun = (
  db: typeof sql | TransactionSql,
  run: {
    id: string;
    draftId: DraftId;
    kind: Kind;
    ipHash: Uint8Array;
    facts: RunFacts;
    error: string | null;
  },
) => db`
  insert into curator_run (id, draft_id, kind, brief, candidate_ids,
    output_ids, warnings, model, tokens_in, tokens_out, latency_ms, error,
    ip_hash)
  values (${run.id}, ${run.draftId}, ${run.kind},
    ${run.facts.brief ? db.json(run.facts.brief) : null},
    ${run.facts.candidateIds ?? []}, ${run.facts.outputIds ?? []},
    ${db.json(run.facts.warnings ?? [])}, ${run.facts.model ?? null},
    ${run.facts.tokensIn ?? null}, ${run.facts.tokensOut ?? null},
    ${run.facts.latencyMs ?? null}, ${run.error},
    ${Buffer.from(run.ipHash)})`;

export const startRun: StartRun = async (context, draftId, request) => {
  const { owner, now } = context;
  const { body } = request;

  const draft = await ownedDraft(owner, draftId);
  if (!draft) return notFound;

  if (draft.current_revision !== body.baseRevision) {
    const current = await getDraft(owner, draftId);
    return current.ok
      ? failed({ error: "conflict", current: current.value })
      : current;
  }
  const revision = await currentRevision(draft);
  if (request.kind === "refine" && !revision?.brief) {
    return failed({
      error: "invalid_request",
      issues: ["refine needs a set the curator built: fill the rest first"],
    });
  }

  const limited = await limitRuns(Buffer.from(context.ipHash), owner, now);
  if (limited) return failed(limited);

  const input = request.kind === "refine" ? undefined : request.body.input;
  const entitled = await canRunCurator(
    owner,
    {
      id: draft.id,
      free: draft.free,
      status: draft.status,
      entitlementId: draft.entitlement_id,
    },
    now,
  );
  if (entitled === "read_only") return failed({ error: "read_only" });
  if (
    entitled === "payment_required" ||
    (entitled === "free" && !draft.free && !(await markFree(draft.id)))
  ) {
    return hold(owner, draft.id, input);
  }

  const [{ runs }] = await sql<{ runs: number }[]>`
    select count(*)::int as runs from curator_run where draft_id = ${draftId}`;
  if (runs >= RUN_CAP) return failed({ error: "run_cap_reached" });

  // New input first, then what a 402 held, then the revision's own brief. A
  // set with none of these, such as a hand-built one, runs on its length.
  const brief = revision?.brief ?? null;
  const held = briefInput.safeParse(draft.held_input).data;
  const state: curator.CuratorState = {
    draftId,
    input:
      input ??
      held ??
      (brief
        ? null
        : {
            text: "",
            durationS: draft.duration_target_s ?? DEFAULT_DURATION_S,
            seeds: [],
          }),
    brief,
    items: revision?.items ?? [],
    removedIds: revision?.removed_ids ?? [],
    earlierIds: (
      await sql<{ id: PerformanceId }[]>`
        select distinct (item ->> 'performance_id')::bigint as id
        from playlist_revision r, jsonb_array_elements(r.items) item
        where r.draft_id = ${draftId}`
    ).map((row) => row.id),
  };
  const kind: Kind = request.kind === "refine" ? "refine" : request.body.mode;
  const run = (options: curator.RunOptions) =>
    request.kind === "refine"
      ? curator.refine(state, request.body.instruction, options)
      : curator[request.body.mode](state, options);

  const runId = randomUUID();
  let controller!: ReadableStreamDefaultController<StreamEvent>;
  let open = true;
  const stream = new ReadableStream<StreamEvent>({
    start(c) {
      controller = c;
      c.enqueue({ type: "started", runId });
    },
    // The reader went away; the run carries on and writes what it finds.
    cancel() {
      open = false;
    },
  });
  const send = (event: StreamEvent) => {
    if (open) controller.enqueue(event);
  };
  const finish = (event: StreamEvent) => {
    send(event);
    if (open) controller.close();
    open = false;
  };
  const record = { id: runId, draftId, kind, ipHash: context.ipHash };

  const done = (async () => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ceiling = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => {
        abort.abort();
        resolve("timeout");
      }, context.ceilingMs);
    });
    try {
      const outcome = await Promise.race([
        run({ emit: send, signal: abort.signal }),
        ceiling,
      ]);
      if (outcome === "timeout") {
        await insertRun(sql, {
          ...record,
          facts: { latencyMs: context.ceilingMs },
          error: "timeout",
        });
        return finish(generationFailed);
      }
      if (!outcome.ok) {
        await insertRun(sql, {
          ...record,
          facts: outcome.run,
          error: outcome.error,
        });
        return finish(generationFailed);
      }
      const proposal = outcome.proposal;
      const written = await write(record, body.baseRevision, proposal, {
        instruction:
          request.kind === "refine" ? request.body.instruction : null,
        // A generate names a new set; every other run keeps a title the
        // draft has, which may be one the person typed.
        keepTitle: kind !== "generate",
      });
      const view = written ? await getDraft(owner, draftId) : null;
      return finish(
        view?.ok
          ? { type: "result", draft: view.value, warnings: proposal.warnings }
          : generationFailed,
      );
    } catch (error) {
      console.error("curator run failed", error);
      await insertRun(sql, { ...record, facts: {}, error: "internal" }).catch(
        () => {},
      );
      finish(generationFailed);
    } finally {
      clearTimeout(timer);
    }
  })();
  // The response may end first; the run still writes what it finds.
  after(done);
  return { ok: true, value: stream };
};

// The revision and its curator_run row in one transaction (architecture 6.2
// step 5). A write that landed on the draft while the model ran wins: the run
// is recorded as a conflict and the draft keeps that revision.
async function write(
  record: Omit<Parameters<typeof insertRun>[1], "facts" | "error">,
  baseRevision: number | null,
  proposal: CuratorProposal,
  options: { instruction: string | null; keepTitle: boolean },
): Promise<boolean> {
  return sql.begin(async (tx) => {
    const [draft] = await tx<{ current_revision: number | null }[]>`
      select current_revision from playlist_draft
      where id = ${record.draftId} for update`;
    const facts = {
      ...proposal.run,
      brief: proposal.brief,
      warnings: proposal.warnings,
    };
    if (!draft || draft.current_revision !== baseRevision) {
      await insertRun(tx, { ...record, facts, error: "conflict" });
      return false;
    }
    await insertRun(tx, { ...record, facts, error: null });
    const number = (baseRevision ?? 0) + 1;
    await tx`
      insert into playlist_revision (draft_id, number, items, removed_ids,
        brief, trigger, instruction, curator_run_id)
      values (${record.draftId}, ${number}, ${tx.json(proposal.items)},
        ${tx.json(proposal.removedIds)}, ${tx.json(proposal.brief)},
        ${proposal.trigger}, ${options.instruction}, ${record.id})`;
    await tx`
      update playlist_draft
      set current_revision = ${number},
        title = case when ${options.keepTitle} and title is not null
          then title else ${proposal.title} end,
        description = ${proposal.description},
        duration_target_s = ${proposal.brief.duration_s},
        held_input = null,
        status = case when status = 'awaiting_payment'
          then 'active' else status end,
        updated_at = now()
      where id = ${record.draftId}`;
    return true;
  });
}

// Replace one (architecture 6.3): catalog's three matches for the slot. No
// model call and no entitlement check (CLAUDE.md rule 3).
export const replaceOptions: ReplaceOptions = async (owner, draftId, index) => {
  const draft = await ownedDraft(owner, draftId);
  if (!draft) return notFound;
  const revision = await currentRevision(draft);
  return {
    ok: true,
    value: {
      options: revision
        ? await catalog.replaceOptions({
            items: revision.items,
            removedIds: revision.removed_ids,
            brief: revision.brief,
            index,
          })
        : [],
    },
  };
};

// One JSON event per line, as the client reads it (src/lib/client/api.ts).
export function streamResponse(stream: ReadableStream<StreamEvent>): Response {
  const encoder = new TextEncoder();
  return new Response(
    stream.pipeThrough(
      new TransformStream<StreamEvent, Uint8Array>({
        transform(event, out) {
          out.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        },
      }),
    ),
    {
      headers: {
        "content-type": "application/x-ndjson",
        "cache-control": "no-store",
      },
    },
  );
}
