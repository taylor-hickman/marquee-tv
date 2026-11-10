"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { auth, CLAIM_CODE_KEY } from "../supabase";

// Where Google and the email link land. The Supabase client reads the session
// from the fragment; the server creates the user on their first sign-in. The
// claim code waits in sessionStorage for the claim (card C4).
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
          })
        : null;
      if (!response?.ok) return setState("failed");
      if (claim) sessionStorage.setItem(CLAIM_CODE_KEY, claim);
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
