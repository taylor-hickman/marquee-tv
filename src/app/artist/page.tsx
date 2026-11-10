import type { Metadata } from "next";
import { SeedEntry } from "@/components/seed/seed-entry";

export const metadata: Metadata = {
  title: "Start with an artist · Marquee TV",
};

export default function ArtistPage() {
  return <SeedEntry />;
}
