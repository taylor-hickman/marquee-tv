"use client";

import { useState, type FormEvent } from "react";
import { startSignIn } from "@/app/auth/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LegalLinks } from "@/components/ui/legal-links";
import { useToast } from "@/components/ui/toast";
import { getGuestToken } from "@/lib/client/storage";

// Google or an email link (J7 steps 3 and 3b). The guest token goes along so
// the link carries a claim code, and the callback comes back to `next`.
export function SignIn({ next }: { next: string }) {
  const toast = useToast();
  const [state, setState] = useState<"idle" | "pending" | "sent">("idle");

  async function run(method: Parameters<typeof startSignIn>[0]) {
    setState("pending");
    try {
      await startSignIn(method, getGuestToken() ?? undefined, next);
      // Google navigates away; only the email link stays on this page.
      setState("email" in method ? "sent" : "pending");
    } catch {
      setState("idle");
      toast("Sign-in failed. Try again.");
    }
  }

  function email(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run({ email: String(new FormData(event.currentTarget).get("email")) });
  }

  if (state === "sent") {
    return (
      <p role="status" className="m-0 text-heading font-bold">
        Check your email.
      </p>
    );
  }
  const pending = state === "pending";
  return (
    <div className="flex flex-col gap-4">
      <Button
        className="w-full"
        disabled={pending}
        onClick={() => run({ provider: "google" })}
      >
        Continue with Google
      </Button>
      <div className="flex items-center gap-3 text-meta tracking-normal text-muted">
        <span className="h-px flex-1 bg-muted" />
        or
        <span className="h-px flex-1 bg-muted" />
      </div>
      <form onSubmit={email} className="flex flex-col gap-2 md:flex-row">
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
        />
        <Button type="submit" disabled={pending}>
          Send link
        </Button>
      </form>
      <LegalLinks />
    </div>
  );
}
