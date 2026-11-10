import type { Metadata } from "next";
import { Suspense } from "react";
import { PlanScreen } from "@/components/billing/plan-screen";

export const metadata: Metadata = { title: "Choose a plan · Marquee TV" };

// J7: the plan screen a 402 opens, with the brief held on the server.
export default function PlanPage() {
  return (
    <Suspense>
      <PlanScreen />
    </Suspense>
  );
}
