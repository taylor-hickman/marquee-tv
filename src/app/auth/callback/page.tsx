"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SessionRequest } from "@/contracts";
import { auth } from "../supabase";

// Where Google and the email link land. The Supabase client reads the session
// from the fragment; the server creates the user on their first sign-in and
// claims the guest's drafts with the code the redirect carried.
export default function Callback() {
  const router = useRouter();
  const [state, setState] = useState<"pending" | "done" | "failed">("pending");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const claim = params.get("claim");
    // Only a path on this site, so the link can't send anyone elsewhere.
    const next = new URL(params.get("next") ?? "/", window.location.origin);
    (async () => {
      const { data } = await auth().getSession();
      const response = data.session
        ? await fetch("/api/auth/session", {
            method: "POST",
            headers: { authorization: `Bearer ${data.session.access_token}` },
            body: JSON.stringify(
              (claim ? { claim } : {}) satisfies SessionRequest,
            ),
          })
        : null;
      if (!response?.ok) return setState("failed");
      if (next.origin === window.location.origin && next.pathname !== "/") {
        return router.replace(next.pathname + next.search);
      }
      setState("done");
    })();
  }, [router]);

  if (state === "pending") return <main aria-busy="true" />;
  return (
    <main>
      {state === "done" ? (
        <p>Signed in.</p>
      ) : (
        <p role="alert">
          Sign-in failed. <Link href="/auth/sign-in">Try again</Link>
        </p>
      )}
      <Link href="/">Marquee TV</Link>
    </main>
  );
}
