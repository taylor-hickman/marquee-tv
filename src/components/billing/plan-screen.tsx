"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { draftId as draftIdSchema, plan as planSchema } from "@/contracts";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { PlanCards, plans } from "./plans";
import { accessToken, api, resumePath, type Plan } from "./session";
import { SignIn } from "./sign-in";

// Sign up · choose plan (J7 steps 2 to 5). The brief is already held on the
// server, so this screen only signs the person in, sends them to Checkout and,
// back from it, waits for the webhook's entitlement before the editor resumes
// the held generation (architecture 7.3).

const POLL_MS = 1000;

const subscribed = (status: string) => ["active", "trialing"].includes(status);

export function PlanScreen() {
  const router = useRouter();
  const toast = useToast();
  const params = useSearchParams();
  const draftId = draftIdSchema.safeParse(params.get("draft")).data;
  const askedPlan = planSchema.safeParse(params.get("plan")).data;
  const complete = params.get("checkout") === "complete";

  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<Plan>(askedPlan ?? "session_pass");
  const [paying, setPaying] = useState(false);

  // Who is here, and whether they already pay: a subscription bought on
  // another device skips Checkout (J7, what can go wrong).
  useEffect(() => {
    if (!draftId) return router.replace("/");
    if (complete) return;
    (async () => {
      const token = await accessToken();
      setSignedIn(token !== null);
      api
        .sendEvent({
          name: "paywall_viewed",
          draftId,
          props: { defaultPlan: askedPlan ?? null, signedIn: token !== null },
        })
        .catch(() => {});
      if (!token) return;
      const account = await api.account().catch(() => null);
      if (!account?.ok) return;
      const { plan, defaultPlan } = account.value;
      if (plan?.kind === "subscription" && subscribed(plan.status)) {
        return router.replace(resumePath(draftId));
      }
      if (!askedPlan) setSelected(defaultPlan);
    })();
  }, [draftId, askedPlan, complete, router]);

  // Back from Checkout: the webhook, not the redirect, writes the entitlement
  // and sets the held draft active. Poll the draft until it has.
  useEffect(() => {
    if (!draftId || !complete) return;
    let stopped = false;
    (async () => {
      while (!stopped) {
        const result = await api.getDraft(draftId).catch(() => null);
        const view = result?.ok ? result.value : null;
        if (
          view?.draft.status === "active" &&
          (view.entitlement.state === "pass" ||
            view.entitlement.state === "subscription")
        ) {
          return router.replace(resumePath(draftId));
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
    })();
    return () => {
      stopped = true;
    };
  }, [draftId, complete, router]);

  function select(plan: Plan) {
    setSelected(plan);
    api
      .sendEvent({ name: "plan_selected", draftId, props: { plan } })
      .catch(() => {});
  }

  async function pay() {
    if (!draftId) return;
    setPaying(true);
    const result = await api
      .checkout({ plan: selected, draftId })
      .catch(() => null);
    if (!result?.ok) {
      setPaying(false);
      toast("Payment is unavailable. Try again.");
      return;
    }
    window.location.assign(result.value.url);
  }

  if (!draftId) return null;
  if (complete) {
    return (
      <main aria-busy="true" className="flex flex-col gap-7 px-5 pt-6 pb-8">
        <h1 className="m-0 text-display-phone font-extrabold md:text-display">
          Confirming payment.
        </h1>
      </main>
    );
  }
  const next = `/plan?draft=${draftId}&plan=${selected}`;
  return (
    <main className="flex w-full max-w-[640px] flex-col gap-7 px-5 pt-6 pb-8 md:px-16 md:pt-14">
      <h1 className="m-0 text-display-phone font-extrabold md:text-display">
        First set was free.
      </h1>
      <PlanCards selected={selected} onSelect={select} />
      {signedIn === true && (
        <Button
          variant="primary"
          className="w-full"
          disabled={paying}
          onClick={pay}
        >
          Pay {plans[selected].price}
        </Button>
      )}
      {signedIn === false && <SignIn next={next} />}
    </main>
  );
}
