import type { Metadata } from "next";
import { Library } from "@/components/billing/library";

export const metadata: Metadata = { title: "Library · Marquee TV" };

// J8: saved sets and drafts for a signed-in user.
export default function LibraryPage() {
  return <Library />;
}
