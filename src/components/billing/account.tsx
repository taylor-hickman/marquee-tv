"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth } from "@/app/auth/supabase";
import type { AccountResponse } from "@/contracts";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/modal";
import { accessToken } from "@/lib/client/api";
import { useToast } from "@/components/ui/toast";
import { plans } from "./plans";
import { api } from "./session";
import { SignIn } from "./sign-in";

// Account (J10): the plan, the Stripe Customer Portal for cancel, switch and
// card, sign out, and delete my data after one confirmation.

const heading = "m-0 text-display-phone font-extrabold md:text-display";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

// "Renews Dec 9, 2026", "Edits until Nov 17, 2026", or when it ended.
function term(plan: NonNullable<AccountResponse["plan"]>, now: Date) {
  if (!plan.periodEnd) return null;
  const ended = new Date(plan.periodEnd) <= now;
  if (plan.kind === "session_pass") {
    return `${ended ? "Edits ended" : "Edits until"} ${day(plan.periodEnd)}`;
  }
  if (plan.status === "active" || plan.status === "trialing") {
    return `Renews ${day(plan.periodEnd)}`;
  }
  return `${ended ? "Ended" : "Ends"} ${day(plan.periodEnd)}`;
}

export function Account() {
  const router = useRouter();
  const toast = useToast();
  const [account, setAccount] = useState<AccountResponse | "signed-out" | null>(
    null,
  );
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!(await accessToken())) return setAccount("signed-out");
      const result = await api.account().catch(() => null);
      setAccount(result?.ok ? result.value : "signed-out");
    })();
  }, []);

  if (account === null) return <main aria-busy="true" />;
  if (account === "signed-out") {
    return (
      <main className="flex w-full max-w-[640px] flex-col gap-7 px-5 pt-6 pb-8 md:px-16 md:pt-14">
        <h1 className={heading}>Account</h1>
        <SignIn next="/account" />
      </main>
    );
  }

  async function portal() {
    setBusy(true);
    const result = await api.billingPortal().catch(() => null);
    if (result?.ok) return window.location.assign(result.value.url);
    setBusy(false);
    toast("Billing is unavailable. Try again.");
  }

  async function signOut() {
    await auth().signOut();
    router.push("/");
  }

  async function remove() {
    setBusy(true);
    const result = await api.deleteAccount().catch(() => null);
    if (!result?.ok) {
      setBusy(false);
      setConfirming(false);
      toast("Couldn't delete your data. Try again.");
      return;
    }
    await auth().signOut();
    router.replace("/");
  }

  const { plan } = account;
  const offer = plan ? plans[plan.kind] : null;
  const ends = plan && term(plan, new Date());
  return (
    <main className="flex w-full max-w-[640px] flex-col gap-8 px-5 pt-6 pb-8 md:px-16 md:pt-14">
      <h1 className={heading}>Account</h1>
      <p className="m-0 text-secondary break-words text-muted">
        {account.email}
      </p>
      <section aria-label="Plan" className="flex flex-col gap-3">
        <h2 className="meta m-0">Plan</h2>
        <p className="m-0 text-heading font-bold">
          {offer ? `${offer.name} · ${offer.price} ${offer.per}` : "Free"}
        </p>
        {ends && <p className="m-0 text-secondary tabular-nums">{ends}</p>}
        {plan && (
          <Button className="self-start" disabled={busy} onClick={portal}>
            Manage billing
          </Button>
        )}
      </section>
      <div className="flex flex-wrap gap-2 border-t border-fg pt-6">
        <Button onClick={signOut}>Sign out</Button>
        <Button onClick={() => setConfirming(true)}>Delete my data</Button>
      </div>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        label="Delete my data"
      >
        <div className="flex flex-col gap-5">
          <h2 className="m-0 text-heading font-bold">
            Delete your account, sets and library?
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy} onClick={remove}>
              Delete
            </Button>
            <Button onClick={() => setConfirming(false)}>Keep</Button>
          </div>
        </div>
      </Dialog>
    </main>
  );
}
