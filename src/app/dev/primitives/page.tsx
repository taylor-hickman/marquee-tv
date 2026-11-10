import type { Metadata } from "next";
import { Primitives } from "./primitives";

export const metadata: Metadata = {
  title: "Primitives · Marquee TV",
  robots: { index: false },
};

// Every primitive in src/components/ui, once per theme (build plan E1).
export default function PrimitivesPage() {
  return (
    <main className="flex flex-col">
      <h1 className="m-0 p-5 text-heading font-bold">Primitives</h1>
      <div className="grid lg:grid-cols-2">
        <Primitives theme="dark" />
        <Primitives theme="light" />
      </div>
    </main>
  );
}
