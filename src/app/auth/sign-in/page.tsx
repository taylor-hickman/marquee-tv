"use client";

import { useState, type FormEvent } from "react";
import { startSignIn } from "../supabase";

// Bare sign-in, for checking each provider on a preview deploy. The plan
// screen's sign-up (card E8) is the one people use.
export default function SignIn() {
  const [state, setState] = useState<"idle" | "sent" | "failed">("idle");
  const run = (method: Parameters<typeof startSignIn>[0]) =>
    startSignIn(method).then(
      () => "email" in method && setState("sent"),
      () => setState("failed"),
    );
  const email = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    run({ email: String(new FormData(event.currentTarget).get("email")) });
  };

  if (state === "sent") return <main>Check your email.</main>;
  return (
    <main>
      <button type="button" onClick={() => run({ provider: "google" })}>
        Continue with Google
      </button>
      <form onSubmit={email}>
        <label>
          Email <input name="email" type="email" required />
        </label>
        <button type="submit">Email me a sign-in link</button>
      </form>
      {state === "failed" && <p role="alert">Sign-in failed.</p>}
    </main>
  );
}
