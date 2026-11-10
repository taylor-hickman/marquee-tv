import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { GuestId, UserId } from "@/contracts";
import { sql } from "@/lib/db";
import type { ConsumeClaimCode } from "./types";

// Users and claim codes (architecture 4, claiming; 5.4). A claim code is a
// bearer secret like the guest token: only its hash is stored.

const hashCode = (code: string) => createHash("sha256").update(code).digest();

// The app_user for a Supabase Auth user, created at their first sign-in.
export async function ensureAppUser(id: UserId, email: string): Promise<void> {
  await sql`insert into app_user (id, email) values (${id}, ${email})
            on conflict (id) do nothing`;
}

// A one-time code bound to the guest, carried through the magic link or the
// OAuth redirect so a different browser can still claim the guest's drafts.
export async function mintClaimCode(guestId: GuestId): Promise<string> {
  const code = randomBytes(16).toString("base64url");
  await sql`insert into claim_code (code_hash, guest_id)
            values (${hashCode(code)}, ${guestId})`;
  return code;
}

// Deleting the row is what makes the code one-time: of two concurrent claims,
// one deletes it and the other finds nothing. A day covers the magic link's
// hour with room to spare.
export const consumeClaimCode: ConsumeClaimCode = async (code) => {
  const [row] = await sql<{ guest_id: GuestId; fresh: boolean }[]>`
    delete from claim_code where code_hash = ${hashCode(code)}
    returning guest_id, created_at > now() - interval '1 day' as fresh`;
  return row?.fresh ? row.guest_id : null;
};
