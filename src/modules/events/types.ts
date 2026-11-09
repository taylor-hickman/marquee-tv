import type { DraftId, EventName, Owner } from "@/contracts";

// One row in `event` (architecture 5.4). Server code writes the events it knows
// about; POST /api/events writes the ones only the client knows.
export type Write = (
  name: EventName,
  fields: {
    owner: Owner | null;
    draftId?: DraftId;
    props?: Record<string, string | number | boolean | null>;
  },
) => Promise<void>;
