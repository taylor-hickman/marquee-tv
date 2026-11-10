"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { LibraryResponse } from "@/contracts";
import { total } from "@/components/browser/format";
import { Button, buttonClass } from "@/components/ui/button";
import { handoffParts } from "@/lib/handoff-url";
import { ago } from "./format";
import { accessToken, api } from "./session";
import { SignIn } from "./sign-in";

// The library (J8): saved sets with Play on YouTube and Edit, unfinished
// drafts with Continue. A set is saved once its list has a track to play.

type Row = LibraryResponse["drafts"][number];

const heading = "m-0 text-display-phone font-extrabold md:text-display";

export function Library() {
  const [rows, setRows] = useState<Row[] | "signed-out" | "failed" | null>(
    null,
  );

  useEffect(() => {
    (async () => {
      if (!(await accessToken())) return setRows("signed-out");
      const result = await api.library().catch(() => null);
      setRows(result?.ok ? result.value.drafts : "failed");
    })();
  }, []);

  if (rows === null) return <main aria-busy="true" />;
  if (rows === "signed-out") {
    return (
      <main className="flex w-full max-w-[640px] flex-col gap-7 px-5 pt-6 pb-8 md:px-16 md:pt-14">
        <h1 className={heading}>Library</h1>
        <SignIn next="/library" />
      </main>
    );
  }

  const now = new Date();
  const saved = rows === "failed" ? [] : rows.filter((r) => r.videoIds.length);
  const drafts =
    rows === "failed" ? [] : rows.filter((r) => !r.videoIds.length);
  return (
    <main className="flex w-full max-w-[1000px] flex-col gap-8 px-5 pt-6 pb-8 md:px-16 md:pt-14">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className={heading}>Library</h1>
        <Link href="/" className="text-secondary font-medium underline">
          New set
        </Link>
      </div>
      {rows === "failed" && (
        <p role="alert" className="m-0">
          Couldn&apos;t load the library.
        </p>
      )}
      {rows !== "failed" && rows.length === 0 && (
        <p className="m-0 text-heading font-bold">Nothing saved.</p>
      )}
      {saved.length > 0 && (
        <Section label="Saved">
          {saved.map((row) => (
            <SavedRow key={row.id} row={row} now={now} />
          ))}
        </Section>
      )}
      {drafts.length > 0 && (
        <Section label="Drafts">
          {drafts.map((row) => (
            <LibraryRow key={row.id} row={row} now={now} meta={[]}>
              <Link
                href={`/d/${row.id}`}
                className={buttonClass({ size: "sm" })}
              >
                Continue
              </Link>
            </LibraryRow>
          ))}
        </Section>
      )}
    </main>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="flex flex-col gap-3">
      <h2 className="meta m-0">{label}</h2>
      <ol className="m-0 list-none border-b border-fg p-0">{children}</ol>
    </section>
  );
}

function LibraryRow({
  row,
  now,
  meta,
  children,
}: {
  row: Row;
  now: Date;
  meta: string[];
  children: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 border-t border-fg py-4 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-heading font-bold break-words">
          {row.title ?? "Untitled"}
        </span>
        <span className="text-secondary text-muted tabular-nums">
          {[ago(new Date(row.updatedAt), now), ...meta].join(" · ")}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </li>
  );
}

function SavedRow({ row, now }: { row: Row; now: Date }) {
  const parts = handoffParts(row.videoIds);

  // Rule 4: window.open runs first and synchronously, then the events.
  function play(part: number) {
    window.open(parts[part].url, "_blank", "noopener");
    api
      .sendEvent({
        name: "handoff_opened",
        draftId: row.id,
        revision: row.revision!,
        part: part + 1,
        startIndex: 0,
        surface: "library",
      })
      .catch(() => {});
    api
      .sendEvent({ name: "library_replayed", draftId: row.id })
      .catch(() => {});
  }

  const meta = [total([row.runtimeS])];
  if (parts.length > 1) meta.push(`${parts.length} parts`);
  return (
    <LibraryRow row={row} now={now} meta={meta}>
      {parts.map((_, part) => (
        <Button
          key={part}
          variant="primary"
          size="sm"
          onClick={() => play(part)}
        >
          {parts.length === 1 ? "Play on YouTube" : `Play part ${part + 1}`}
        </Button>
      ))}
      <Link href={`/d/${row.id}`} className={buttonClass({ size: "sm" })}>
        Edit
      </Link>
    </LibraryRow>
  );
}
