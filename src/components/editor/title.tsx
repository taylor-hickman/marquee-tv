import { useEffect, useRef, useState, type FormEvent } from "react";
import type { DraftView } from "@/contracts";
import { Button } from "@/components/ui/button";
import { Input, TextArea } from "@/components/ui/input";

export type Rename = { title?: string; description?: string };

// The set's title and its one-line description, renamed in place (J2 step 8).
export function Title({
  draft,
  onRename,
}: {
  draft: DraftView["draft"];
  onRename: (rename: Rename) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const renameButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  // Closing the form hands focus back to the button that opened it.
  useEffect(() => {
    if (wasEditing.current && !editing) renameButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const heading = draft.title ?? "Untitled";

  if (!editing) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="m-0 min-w-0 text-display-phone font-extrabold break-words md:text-display">
            {heading}
          </h1>
          <Button
            ref={renameButton}
            size="sm"
            className="mt-2 flex-none"
            onClick={() => {
              setTitle(draft.title ?? "");
              setDescription(draft.description ?? "");
              setEditing(true);
            }}
          >
            Rename
          </Button>
        </div>
        {draft.description && (
          <p className="m-0 max-w-[720px] text-muted">{draft.description}</p>
        )}
      </div>
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const nextTitle = title.trim();
    const nextDescription = description.trim();
    const rename: Rename = {
      ...(nextTitle && nextTitle !== draft.title && { title: nextTitle }),
      ...(nextDescription !== (draft.description ?? "") && {
        description: nextDescription,
      }),
    };
    if (Object.keys(rename).length === 0 || (await onRename(rename))) {
      setEditing(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <h1 className="sr-only">{heading}</h1>
      <Input
        label="Title"
        placeholder="Title"
        maxLength={120}
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="text-title font-bold"
      />
      <TextArea
        label="Description"
        placeholder="Description"
        maxLength={500}
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="min-h-0 text-body font-normal"
      />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm">
          Save
        </Button>
        <Button size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
