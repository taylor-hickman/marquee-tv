import type { Metadata } from "next";
import { Browser } from "@/components/browser/browser";

export const metadata: Metadata = { title: "Browse · Marquee TV" };

// J4: search and filter the catalog, pick performances, hand them to the editor.
export default function BrowsePage() {
  return <Browser />;
}
