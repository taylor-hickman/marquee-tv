"use client";

import { useState, type ReactNode } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input, TextArea } from "@/components/ui/input";
import { List, ListRow } from "@/components/ui/list-row";
import { Dialog, Sheet } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-fg py-6">
      <h3 className="meta m-0">{title}</h3>
      {children}
    </section>
  );
}

const moods = ["Dinner Party", "Friends Over", "After Hours"];

export function Primitives({ theme }: { theme: "dark" | "light" }) {
  const [mood, setMood] = useState("Friends Over");
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState(false);
  const toast = useToast();
  const name = theme === "dark" ? "Dark" : "Light";

  return (
    <div data-theme={theme} data-testid={theme} className="px-5 pb-8">
      <h2 className="m-0 py-5 text-heading font-bold">{name}</h2>

      <Section title="Button">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Make playlist</Button>
          <Button>Apply</Button>
          <Button disabled>Disabled</Button>
          <a
            href="#top"
            className={buttonClass({ variant: "primary", size: "lg" })}
          >
            Play on YouTube
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Replace</Button>
          <Button size="sm" variant="primary">
            Add
          </Button>
          <Button size="icon" aria-label="Drag to reorder">
            <svg
              aria-hidden="true"
              width="16"
              height="12"
              viewBox="0 0 16 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M0 1h16M0 6h16M0 11h16" />
            </svg>
          </Button>
        </div>
      </Section>

      <Section title="Chip">
        <div className="flex flex-wrap gap-2">
          {moods.map((m) => (
            <Chip key={m} pressed={mood === m} onClick={() => setMood(m)}>
              {m}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Input">
        <TextArea
          label="Your set"
          placeholder="Mellow dinner, groovier later"
        />
        <div className="flex gap-3">
          <Input
            label="Change something"
            placeholder="More horns, less acoustic"
          />
          <Button>Apply</Button>
        </div>
      </Section>

      <Section title="List row">
        <List>
          <ListRow
            position={1}
            title="Arlo Parks"
            subtitle="NPR Tiny Desk"
            duration="18:42"
            actions={
              <>
                <Button size="sm">Pin</Button>
                <Button size="sm">Remove</Button>
              </>
            }
          />
          <ListRow
            position={2}
            pinned
            title="Khruangbin"
            subtitle="KEXP"
            duration="21:03"
            actions={
              <>
                <Button size="sm">Unpin</Button>
                <Button size="sm">Remove</Button>
              </>
            }
          />
        </List>
      </Section>

      <Section title="Skeleton">
        <div aria-busy="true" className="flex items-start gap-3">
          <Skeleton className="h-[68px] w-[120px]" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      </Section>

      <Section title="Sheet, dialog, toast">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setSheet(true)}>Sheet</Button>
          <Button onClick={() => setDialog(true)}>Dialog</Button>
          <Button onClick={() => toast("Link copied")}>Toast</Button>
        </div>
      </Section>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        label="Play on YouTube"
      >
        <div className="flex flex-col gap-5">
          <h4 className="m-0 text-heading font-extrabold">Ready.</h4>
          <p className="m-0 text-secondary text-muted">
            Slow Start, Late Groove · 8 performances · 1 h 58 m
          </p>
          <Button variant="primary" size="lg" className="w-full">
            Play on YouTube
          </Button>
          <Button onClick={() => setSheet(false)}>Back</Button>
        </div>
      </Sheet>

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        label="Delete account"
      >
        <div className="flex flex-col gap-5">
          <h4 className="m-0 text-heading font-bold">Delete account?</h4>
          <div className="flex gap-3">
            <Button variant="primary" onClick={() => setDialog(false)}>
              Delete
            </Button>
            <Button onClick={() => setDialog(false)}>Cancel</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
