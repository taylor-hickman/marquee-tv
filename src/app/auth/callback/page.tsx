"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SessionRequest } from "@/contracts";
import { auth } from "../supabase";

// Where Google and the email link land. The Supabase client reads the session
// from the fragment; the server creates the user on their first sign-in and
// claims the guest's drafts with the code the redirect carried.
export default function Callback() {
  const [state, setState] = useState<"pending" | "done" | "failed">("pending");
  useEffect(() => {
    const claim = new URLSearchParams(window.location.search).get("claim");
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
      setState("done");
    })();
  }, []);

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
