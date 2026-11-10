import "server-only";
import type { TransactionSql } from "postgres";
import {
  draftId as draftIdSchema,
  type ApiResult,
  type Brief,
  type DraftId,
  type DraftView,
  type EntitlementState,
  type ErrorBody,
  type Owner,
  type PerformanceId,
  type RevisionItem,
} from "@/contracts";
import { requireOwner } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getFlag } from "@/lib/flags";
import { expirePasses } from "@/modules/billing";
import { performanceCards } from "./cards";
import { edit } from "./ops";
import type { ApplyOps, CreateDraft, GetDraft, Undo } from "./types";

// Model-backed runs allowed per draft (architecture 6.3, PRD 8.5).
const RUN_CAP = 25;

type DraftRow = {
  id: DraftId;
  creation_method: DraftView["draft"]["creationMethod"];
  free: boolean;
  status: DraftView["draft"]["status"];
  current_revision: number | null;
  title: string | null;
  description: string | null;
  duration_target_s: number | null;
};

type RevisionRow = {
  number: number;
  items: RevisionItem[];
  removed_ids: PerformanceId[];
  brief: Brief | null;
  trigger: NonNullable<DraftView["revision"]>["trigger"];
  instruction: string | null;
  created_at: Date;
};

const owners = (owner: Owner) => ({
  guestId: owner.kind === "guest" ? owner.guestId : null,
  userId: owner.kind === "user" ? owner.userId : null,
});

const notFound = { ok: false, error: { error: "not_found" } } as const;

// The owner a draft request acts as (requireOwner): `unauthorized` without a
// credential, `not_found` for a draft that is missing or someone else's.
export async function authorize(
  request: Request,
  draftId: string,
): Promise<ApiResult<Owner>> {
  const [draft] = draftIdSchema.safeParse(draftId).success
    ? await sql<
        { owner_guest_id: string | null; owner_user_id: string | null }[]
      >`
        select owner_guest_id, owner_user_id from playlist_draft where id = ${draftId}`
    : [];
  return requireOwner(request, {
    ownerGuestId: draft?.owner_guest_id ?? null,
    ownerUserId: draft?.owner_user_id ?? null,
  });
}

// Whether the curator may run here, by architecture 7.3's table. A local
// stand-in for billing.canRunCurator until D2 fills it in.
async function entitlement(draft: DraftRow): Promise<DraftView["entitlement"]> {
  const [row] = await sql<
    { pass: boolean; subscription: boolean; freeLeft: boolean; runs: number }[]
  >`
    select
      exists (select 1 from entitlement e where e.id = d.entitlement_id
        and e.kind = 'session_pass' and e.status = 'active'
        and (e.period_end is null or e.period_end > now())) as pass,
      exists (select 1 from entitlement e where e.user_id = d.owner_user_id
        and e.kind = 'subscription' and e.status = 'active') as subscription,
      not exists (select 1 from playlist_draft o where o.free
        and (o.owner_guest_id = d.owner_guest_id
          or o.owner_user_id = d.owner_user_id)) as "freeLeft",
      (select count(*) from curator_run r where r.draft_id = d.id)::int as runs
    from playlist_draft d where d.id = ${draft.id}`;
  const state: EntitlementState =
    draft.status === "read_only"
      ? "read_only"
      : draft.free || row.freeLeft
        ? "free"
        : row.pass
          ? "pass"
          : row.subscription
            ? "subscription"
            : "payment_required";
  return { state, runsLeft: Math.max(0, RUN_CAP - row.runs) };
}

async function view(draft: DraftRow): Promise<DraftView> {
  const [revision] =
    draft.current_revision === null
      ? []
      : await sql<RevisionRow[]>`
          select * from playlist_revision
          where draft_id = ${draft.id} and number = ${draft.current_revision}`;
  const [performances, handoffMode, entitled] = await Promise.all([
    performanceCards(revision?.items.map((i) => i.performance_id) ?? []),
    getFlag("handoff_mode"),
    entitlement(draft),
  ]);
  return {
    draft: {
      id: draft.id,
      title: draft.title,
      description: draft.description,
      status: draft.status,
      free: draft.free,
      creationMethod: draft.creation_method,
      durationTargetS: draft.duration_target_s,
    },
    revision: revision
      ? {
          number: revision.number,
          items: revision.items,
          removedIds: revision.removed_ids,
          brief: revision.brief,
          trigger: revision.trigger,
          instruction: revision.instruction,
          createdAt: revision.created_at.toISOString(),
        }
      : null,
    performances,
    flags: { handoffMode },
    entitlement: entitled,
  };
}

async function ownedDraft(
  db: typeof sql | TransactionSql,
  owner: Owner,
  draftId: DraftId,
  lock = false,
): Promise<DraftRow | undefined> {
  if (!draftIdSchema.safeParse(draftId).success) return undefined;
  const { guestId, userId } = owners(owner);
  const [draft] = await db<DraftRow[]>`
    select * from playlist_draft
    where id = ${draftId}
      and (owner_guest_id = ${guestId} or owner_user_id = ${userId})
    ${lock ? db`for update` : db``}`;
  return draft;
}

export const createDraft: CreateDraft = async (owner, body) => {
  const { guestId, userId } = owners(owner);
  const [draft] = await sql<DraftRow[]>`
    insert into playlist_draft
      (owner_guest_id, owner_user_id, creation_method, duration_target_s)
    values (${guestId}, ${userId}, ${body.creationMethod},
      ${body.input?.durationS ?? null})
    returning *`;
  return view(draft);
};

// A pass draft past period_end turns read_only before it is read or written
// (architecture 7.3), so a lapsed pass holder sees the set as it was without
// waiting for a job.
const lapsePass = (draftId: DraftId) =>
  draftIdSchema.safeParse(draftId).success
    ? expirePasses(new Date(), draftId)
    : undefined;

export const getDraft: GetDraft = async (owner, draftId) => {
  await lapsePass(draftId);
  const draft = await ownedDraft(sql, owner, draftId);
  return draft ? { ok: true, value: await view(draft) } : notFound;
};

type Snapshot = {
  items: RevisionItem[];
  removedIds: PerformanceId[];
  brief: Brief | null;
};

type Write = Snapshot & {
  trigger: "edit" | "undo";
  title: string | null;
  description: string | null;
};

// Every write (ADR 0004): lock the draft, refuse `read_only`, check
// `baseRevision`, then store revision n+1 and point the draft at it. A stale
// base gets `conflict` with the draft as it is now.
async function writeRevision(
  owner: Owner,
  draftId: DraftId,
  baseRevision: number | null,
  change: (
    tx: TransactionSql,
    draft: DraftRow,
    current: Snapshot | null,
  ) => Promise<ApiResult<Write>>,
): Promise<ApiResult<DraftView>> {
  await lapsePass(draftId);
  const outcome = await sql.begin(
    async (
      tx,
    ): Promise<{ draft: DraftRow; error?: ErrorBody | "conflict" } | null> => {
      const draft = await ownedDraft(tx, owner, draftId, true);
      if (!draft) return null;
      if (draft.status === "read_only") {
        return { draft, error: { error: "read_only" } };
      }
      if (draft.current_revision !== baseRevision) {
        return { draft, error: "conflict" };
      }

      const [current] =
        draft.current_revision === null
          ? []
          : await tx<RevisionRow[]>`
              select * from playlist_revision
              where draft_id = ${draftId} and number = ${draft.current_revision}`;
      const result = await change(
        tx,
        draft,
        current
          ? {
              items: current.items,
              removedIds: current.removed_ids,
              brief: current.brief,
            }
          : null,
      );
      if (!result.ok) return { draft, error: result.error };

      const next = result.value;
      const number = (draft.current_revision ?? 0) + 1;
      await tx`
        insert into playlist_revision
          (draft_id, number, items, removed_ids, brief, trigger)
        values (${draftId}, ${number}, ${tx.json(next.items)},
          ${tx.json(next.removedIds)},
          ${next.brief === null ? null : tx.json(next.brief)}, ${next.trigger})`;
      const [updated] = await tx<DraftRow[]>`
        update playlist_draft
        set current_revision = ${number}, title = ${next.title},
          description = ${next.description}, updated_at = now()
        where id = ${draftId}
        returning *`;
      return { draft: updated };
    },
  );
  if (!outcome) return notFound;
  if (outcome.error === "conflict") {
    return {
      ok: false,
      error: { error: "conflict", current: await view(outcome.draft) },
    };
  }
  if (outcome.error) return { ok: false, error: outcome.error };
  return { ok: true, value: await view(outcome.draft) };
}

export const applyOps: ApplyOps = (owner, draftId, body) =>
  writeRevision(
    owner,
    draftId,
    body.baseRevision,
    async (tx, draft, current) => {
      const edited = edit(
        {
          items: current?.items ?? [],
          removedIds: current?.removedIds ?? [],
          title: draft.title,
          description: draft.description,
        },
        body.ops,
      );
      if (!edited.ok) {
        return {
          ok: false,
          error: { error: "invalid_request", issues: edited.issues },
        };
      }
      // Manual adds come from the browser, so only eligible catalog rows go in.
      const added = body.ops.flatMap((op) =>
        op.op === "add"
          ? [op.performance_id]
          : op.op === "replace"
            ? [op.with_performance_id]
            : [],
      );
      const eligible = new Set(
        (
          await tx<{ id: PerformanceId }[]>`
          select id from performance where eligible and id = any(${added})`
        ).map((row) => row.id),
      );
      const unknown = added.filter((id) => !eligible.has(id));
      if (unknown.length > 0) {
        return {
          ok: false,
          error: {
            error: "invalid_request",
            issues: unknown.map(
              (id) => `ops: performance ${id} is not in the catalog`,
            ),
          },
        };
      }
      return {
        ok: true,
        value: {
          ...edited.value,
          brief: current?.brief ?? null,
          trigger: "edit",
        },
      };
    },
  );

// Undo writes a copy of revision n−1 as n+1 (ADR 0004), so history is kept and
// a removal undone is un-removed. Undoing an undo therefore redoes.
export const undo: Undo = (owner, draftId, body) =>
  writeRevision(owner, draftId, body.baseRevision, async (tx, draft) => {
    const [previous] = await tx<RevisionRow[]>`
      select * from playlist_revision
      where draft_id = ${draftId} and number = ${body.baseRevision - 1}`;
    if (!previous) {
      return {
        ok: false,
        error: {
          error: "invalid_request",
          issues: ["baseRevision: nothing to undo"],
        },
      };
    }
    return {
      ok: true,
      value: {
        items: previous.items,
        removedIds: previous.removed_ids,
        brief: previous.brief,
        trigger: "undo",
        title: draft.title,
        description: draft.description,
      },
    };
  });
