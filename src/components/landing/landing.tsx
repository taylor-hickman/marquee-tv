"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { BriefInput, DraftView } from "@/contracts";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input, TextArea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createApiClient } from "@/lib/client/api";
import { getDraftCache } from "@/lib/client/storage";
import { savePendingBrief } from "./pending-brief";
import { ReturningGuest, playable } from "./returning-guest";

// PRD 7.1: one prompt, six chips that prefill it, presets for the length, and
// two secondary ways in. Submit creates the draft and opens the editor, which
// starts generation (architecture 7.1). No copy names a time of day.

const api = createApiClient();

type Mood = NonNullable<BriefInput["mood"]>;

const moods: { id: Mood; label: string; prefill: string }[] = [
  {
    id: "dinner_party",
    label: "Dinner Party",
    prefill: "Friends over for dinner. Start mellow, get groovier as it goes.",
  },
  {
    id: "friends_over",
    label: "Friends Over",
    prefill: "Warm and slow to start, dancing by the end.",
  },
  {
    id: "sunday_morning",
    label: "Sunday Morning",
    prefill: "Soft voices, acoustic sets, small rooms. Nothing loud.",
  },
  {
    id: "after_hours",
    label: "After Hours",
    prefill: "Low lights, deep grooves. Keep it smoky.",
  },
  {
    id: "high_energy",
    label: "High Energy",
    prefill: "Full bands, horns, big rooms. Keep everyone dancing.",
  },
  { id: "surprise_me", label: "Surprise Me", prefill: "Surprise me." },
];

const presets = [
  { label: "30 min", minutes: 30 },
  { label: "1 h", minutes: 60 },
  { label: "2 h", minutes: 120 },
  { label: "3 h", minutes: 180 },
] as const;

// briefInput allows whole minutes up to 6 h.
const MAX_MINUTES = 360;

export function Landing() {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [mood, setMood] = useState<Mood | null>(null);
  const [minutes, setMinutes] = useState<number | "custom">(120);
  const [custom, setCustom] = useState("");
  const [pending, setPending] = useState(false);
  const [cached, setCached] = useState<DraftView | null>(null);

  // Local storage exists only in the browser, so the card appears after hydration.
  useEffect(() => {
    const draft = getDraftCache();
    const returning = draft !== null && playable(draft).length > 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one read after mount
    if (returning) setCached(draft);
    api
      .sendEvent({ name: "landing_viewed", props: { returning } })
      .catch(() => {});
  }, []);

  const customMinutes = Number(custom);
  const durationMinutes =
    minutes === "custom"
      ? Number.isInteger(customMinutes) &&
        customMinutes >= 1 &&
        customMinutes <= MAX_MINUTES
        ? customMinutes
        : null
      : minutes;
  const ready = text.trim() !== "" && durationMinutes !== null && !pending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || durationMinutes === null) return;
    setPending(true);
    const input: BriefInput = {
      text: text.trim(),
      ...(mood && { mood }),
      durationS: durationMinutes * 60,
      seeds: [],
    };
    const entry = mood ? "chip" : "typed";
    const result = await api
      .createDraft({ creationMethod: entry, input })
      .catch(() => null);
    if (!result?.ok) {
      setPending(false);
      toast("Couldn't start the set. Try again.");
      return;
    }
    const id = result.value.draft.draft.id;
    savePendingBrief(id, input);
    api
      .sendEvent({ name: "brief_submitted", draftId: id, props: { entry } })
      .catch(() => {});
    router.push(`/d/${id}`);
  }

  return (
    <main className="flex flex-col gap-5 px-5 pt-6 pb-8 md:gap-7 md:px-16 md:pt-14 md:pb-12">
      {cached && <ReturningGuest draft={cached} api={api} />}
      <h1 className="m-0 max-w-[820px] text-display-phone font-extrabold md:text-display">
        How should the room feel?
      </h1>
      <form onSubmit={submit} className="flex flex-col gap-5 md:gap-7">
        <div className="flex flex-wrap gap-2">
          {moods.map((m) => (
            <Chip
              key={m.id}
              pressed={mood === m.id}
              onClick={() => {
                setMood(m.id);
                setText(m.prefill);
              }}
            >
              {m.label}
            </Chip>
          ))}
        </div>
        <TextArea
          label="Your set"
          placeholder="Mellow dinner, groovier later"
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            {/* One row of five on a phone, as the mockups show. */}
            <div
              role="group"
              aria-label="Duration"
              className="grid grid-cols-5 gap-1 md:flex md:gap-2"
            >
              {presets.map((p) => (
                <Chip
                  key={p.label}
                  pressed={minutes === p.minutes}
                  onClick={() => setMinutes(p.minutes)}
                  className="justify-center max-md:px-0"
                >
                  {p.label}
                </Chip>
              ))}
              <Chip
                pressed={minutes === "custom"}
                onClick={() => setMinutes("custom")}
                className="justify-center max-md:px-0"
              >
                Custom
              </Chip>
            </div>
            {minutes === "custom" && (
              <div className="md:w-32">
                <Input
                  label="Minutes"
                  placeholder="Minutes"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_MINUTES}
                  step={1}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  className="h-control-sm border"
                />
              </div>
            )}
          </div>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={!ready}
            className="w-full md:w-auto"
          >
            Make playlist
          </Button>
        </div>
      </form>
      <nav aria-label="Other ways in" className="flex flex-wrap gap-6">
        <Link
          href="/artist"
          className="text-secondary font-medium underline decoration-1 underline-offset-4"
        >
          Start with an artist
        </Link>
        <Link
          href="/browse"
          className="text-secondary font-medium underline decoration-1 underline-offset-4"
        >
          Build it yourself
        </Link>
      </nav>
    </main>
  );
}
