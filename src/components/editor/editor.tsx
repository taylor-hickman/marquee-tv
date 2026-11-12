"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { BriefInput, GenerateRequest } from "@/contracts";
import { total } from "@/components/browser/format";
import { takePendingBrief } from "@/components/landing/pending-brief";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { createApiClient } from "@/lib/client/api";
import {
  createDraftState,
  useDraft,
  type DraftState,
} from "@/lib/client/draft-state";
import { getDraftCache } from "@/lib/client/storage";
import { Generating } from "./generating";
import { SaveToYouTube } from "./save-to-youtube";
import { advance, failureMessage, starting, type Progress } from "./progress";
import { Title } from "./title";
import { TrackList, type EditEvent, type OnOps } from "./track-list";

const api = createApiClient();

type RunRequest = { mode: GenerateRequest["mode"]; input?: BriefInput };
type Run = RunRequest & { progress: Progress };

const send = (
  name: "brief_submitted" | "regenerated_all" | EditEvent,
  draftId: string,
  props?: Record<string, number | string>,
) => api.sendEvent({ name, draftId, props }).catch(() => {});

// J2. The draft renders from the local cache when it has this one, then from
// the server. On arrival it starts the run the entry asked for: a brief the
// landing or artist screen left in session storage, `?run=fill` from the
// browser drawer (J4), or `?run=generate` from the plan screen, which runs the
// brief the server held through payment (architecture 7.1, 7.3). A run refused
// for payment goes to the plan screen. Every edit goes through /ops or /undo
// with the current revision and renders what comes back; a 409 renders the
// server's list instead (src/lib/client/draft-state.ts). `?youtube=save`
// is Google's return to Save to my YouTube (J12), which saves on arrival.
export function Editor({
  id,
  run: arrivalRun,
  youtubeSave = false,
}: {
  id: string;
  run: "fill" | "generate" | null;
  youtubeSave?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<DraftState | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const arrived = useRef(false);
  // Kept from arrival: the router.replace below drops it from the URL.
  const [saveOnArrival] = useState(youtubeSave);

  async function start(draft: DraftState, request: RunRequest) {
    setRun({ ...request, progress: starting });
    const fail = (message: string) =>
      setRun(
        (r) => r && { ...r, progress: { ...r.progress, failure: message } },
      );
    try {
      const result = await draft.send((baseRevision) =>
        api.generate(id, { baseRevision, ...request }),
      );
      if (!result.ok) {
        if (result.error.error === "payment_required") {
          const plan = result.error.defaultPlan;
          router.push(`/plan?draft=${encodeURIComponent(id)}&plan=${plan}`);
        }
        return fail(failureMessage(result.error));
      }
      for await (const event of result.value) {
        if (event.type === "result") {
          draft.set(event.draft);
          setRun(null);
          if (request.mode === "regenerate") send("regenerated_all", id);
          return;
        }
        setRun((r) => r && { ...r, progress: advance(r.progress, event) });
      }
      fail(failureMessage(null));
    } catch {
      fail(failureMessage(null));
    }
  }

  // Once per arrival: the pending brief is taken here, so a reload doesn't
  // start a second run.
  useEffect(() => {
    if (arrived.current) return;
    arrived.current = true;
    const input = takePendingBrief(id);
    const cached = getDraftCache();
    let draft: DraftState | null = null;
    if (cached?.draft.id === id) {
      draft = createDraftState(cached);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- local storage exists only after mount
      setState(draft);
    }
    if (arrivalRun || youtubeSave) {
      router.replace(`/d/${encodeURIComponent(id)}`);
    }
    api
      .getDraft(id)
      .catch(() => null)
      .then((result) => {
        if (!result?.ok) {
          if (!draft)
            setMissing(
              failureMessage(
                result?.error ?? null,
                "Couldn't load this set. Reload to try again.",
              ),
            );
          return;
        }
        if (draft) draft.set(result.value);
        else setState((draft = createDraftState(result.value)));
        if (arrivalRun) {
          if (arrivalRun === "fill") {
            send("brief_submitted", id, { entry: "manual_fill" });
          }
          void start(draft, { mode: arrivalRun });
        } else if (input && result.value.revision === null) {
          void start(draft, { mode: "generate", input });
        }
      });
    // Arrival runs once per draft; page.tsx keys the editor by id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (missing) {
    return (
      <main className="flex flex-col gap-5 px-5 pt-6 pb-8 md:px-16 md:pt-14">
        <h1 className="m-0 text-heading font-bold">{missing}</h1>
        <Link
          href="/"
          className="text-secondary font-medium underline underline-offset-4"
        >
          New set
        </Link>
      </main>
    );
  }
  if (!state) {
    return (
      <main
        aria-busy="true"
        className="flex flex-col gap-4 px-5 pt-6 pb-8 md:px-16 md:pt-14"
      >
        <h1 className="sr-only">Loading set</h1>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </main>
    );
  }
  return (
    <Loaded
      state={state}
      run={run}
      onRun={(request) => start(state, request)}
      toast={toast}
      youtubeSave={saveOnArrival}
    />
  );
}

function Loaded({
  state,
  run,
  onRun,
  toast,
  youtubeSave,
}: {
  state: DraftState;
  run: Run | null;
  onRun: (request: RunRequest) => void;
  toast: (message: string) => void;
  youtubeSave: boolean;
}) {
  const view = useDraft(state);
  // One write at a time, so each carries the revision the last one returned.
  const writing = useRef(false);
  const { id } = view.draft;
  const revision = view.revision;
  const items = revision?.items ?? [];
  const retry = () => run && onRun({ mode: run.mode, input: run.input });

  if (run && (!run.progress.failure || items.length === 0)) {
    return (
      <Generating
        quote={run.input?.text || view.draft.title || "New set"}
        progress={run.progress}
        onRetry={retry}
      />
    );
  }

  async function write(request: Parameters<DraftState["write"]>[0]) {
    if (writing.current) return false;
    writing.current = true;
    const result = await state.write(request).catch(() => null);
    writing.current = false;
    if (!result?.ok) {
      toast(failureMessage(result?.error ?? null, "Couldn't save. Try again."));
    }
    return result?.ok === true;
  }

  const onOps: OnOps = async (edits, event, performanceId) => {
    const ok = await write((baseRevision) =>
      api.ops(id, { baseRevision, ops: edits }),
    );
    if (ok) send(event, id, { performanceId });
    return ok;
  };

  const byId = new Map(view.performances.map((p) => [p.id, p]));
  const runtime = total(
    items.map((i) => byId.get(i.performance_id)?.durationS ?? null),
  );
  const target = view.draft.durationTargetS;

  return (
    <main className="flex flex-col gap-6 px-5 pt-6 pb-8 md:gap-8 md:px-16 md:pt-14 md:pb-12">
      <Title
        draft={view.draft}
        onRename={(rename) =>
          write((baseRevision) =>
            api.ops(id, { baseRevision, ops: [{ op: "rename", ...rename }] }),
          )
        }
      />
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <p className="m-0 flex items-baseline gap-2 tabular-nums">
          <span className="text-[40px] leading-none font-extrabold tracking-[-0.03em]">
            {runtime}
          </span>
          {target && (
            <span className="text-title text-muted">/ {total([target])}</span>
          )}
        </p>
        {revision && (
          <div className="flex flex-wrap gap-2">
            {revision.number > 1 && (
              <Button
                size="sm"
                onClick={() =>
                  write((baseRevision) =>
                    api.undo(id, {
                      baseRevision: baseRevision ?? revision.number,
                    }),
                  )
                }
              >
                Undo
              </Button>
            )}
            <Button size="sm" onClick={() => onRun({ mode: "regenerate" })}>
              Regenerate unpinned
            </Button>
            {view.flags.handoffMode === "api" && (
              <SaveToYouTube
                api={api}
                draftId={id}
                revision={revision.number}
                autoSave={youtubeSave}
                toast={toast}
              />
            )}
          </div>
        )}
      </div>
      {run?.progress.failure && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-4 border-2 border-fg p-4"
        >
          <p className="m-0 font-bold">{run.progress.failure}</p>
          <Button size="sm" onClick={retry}>
            Try again
          </Button>
        </div>
      )}
      <TrackList
        draftId={id}
        items={items}
        cards={byId}
        api={api}
        onOps={onOps}
        toast={toast}
      />
    </main>
  );
}
