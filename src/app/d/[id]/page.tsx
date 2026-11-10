import type { Metadata } from "next";
import { Editor } from "@/components/editor/editor";

export const metadata: Metadata = { title: "Set · Marquee TV" };

// J2: the set, its edits and the runs that build it. `?run=fill` arrives from
// the browser drawer's "Let AI fill the rest" (J4); `?run=generate` from the
// plan screen once payment lets the held brief run (J7); `?youtube=save` from
// Google's consent for Save to my YouTube (J12).
export default async function DraftPage({
  params,
  searchParams,
}: PageProps<"/d/[id]">) {
  const { id } = await params;
  const { run, youtube } = await searchParams;
  return (
    <Editor
      key={id}
      id={id}
      run={run === "fill" || run === "generate" ? run : null}
      youtubeSave={youtube === "save"}
    />
  );
}
