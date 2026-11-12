"use client";

import { useEffect, useRef, useState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/modal";
import type { ApiClient } from "@/lib/client/api";

// Save to my YouTube (J12), while handoff_mode is `api`. The first tap without
// a grant opens the authorization screen: why we ask, the exact scope, and
// where to disconnect. Google sends the browser back with `?youtube=save`, and
// the editor taps again for the person.
export function SaveToYouTube({
  api,
  draftId,
  revision,
  autoSave,
  toast,
}: {
  api: ApiClient;
  draftId: string;
  revision: number;
  autoSave: boolean;
  toast: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ revision: number; url: string } | null>(
    null,
  );
  const [asking, setAsking] = useState(false);
  const started = useRef(false);

  async function save() {
    setSaving(true);
    const result = await api.youtubeExport(draftId, revision).catch(() => null);
    setSaving(false);
    if (result?.ok && result.value.status === "done") {
      return setSaved({ revision, url: result.value.url });
    }
    if (result?.ok) return toast("Still saving. Try again shortly.");
    const error = result?.error.error;
    if (error === "youtube_not_connected") return setAsking(true);
    if (error === "unauthorized") return toast("Sign in to save to YouTube.");
    toast("Couldn't save to YouTube. Try again.");
  }

  async function connect() {
    const result = await api.youtubeConnect(draftId).catch(() => null);
    if (result?.ok) return window.location.assign(result.value.url);
    setAsking(false);
    toast("Couldn't reach Google. Try again.");
  }

  useEffect(() => {
    if (!autoSave || started.current) return;
    started.current = true;
    void save();
    // Once, on the return from Google.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSave]);

  if (saved?.revision === revision) {
    return (
      <a
        href={saved.url}
        target="_blank"
        rel="noreferrer"
        className={buttonClass({ size: "sm" })}
      >
        Open in YouTube
      </a>
    );
  }
  return (
    <>
      <Button size="sm" disabled={saving} onClick={save}>
        {saving ? "Saving to YouTube" : "Save to my YouTube"}
      </Button>
      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        label="Save to my YouTube"
      >
        <div className="flex flex-col gap-5">
          <h2 className="m-0 text-heading font-bold">Save to my YouTube</h2>
          <p className="m-0">
            Marquee TV makes this set a playlist in your YouTube account.
          </p>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="meta">Access</dt>
            <dd className="m-0">Manage your YouTube account</dd>
            <dt className="meta">Scope</dt>
            <dd className="m-0 break-all">
              https://www.googleapis.com/auth/youtube
            </dd>
            <dt className="meta">Disconnect</dt>
            <dd className="m-0">Account, anytime</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={connect}>
              Continue to Google
            </Button>
            <Button onClick={() => setAsking(false)}>Cancel</Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
