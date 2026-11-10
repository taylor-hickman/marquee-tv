import { sql } from "@/test/db";
import { createHash, randomUUID } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import * as factories from "@/test/factories";
import { consumeClaimCode, ensureAppUser, mintClaimCode } from "./users";

vi.mock("server-only", () => ({}));

describe("claim codes", () => {
  test("a code returns its guest once", async () => {
    const guest = await factories.guest();
    const code = await mintClaimCode(guest.id);
    expect(await consumeClaimCode(code)).toBe(guest.id);
    expect(await consumeClaimCode(code)).toBeNull();
  });

  test("a reused code is rejected even when two claims race", async () => {
    const guest = await factories.guest();
    const code = await mintClaimCode(guest.id);
    const results = await Promise.all([
      consumeClaimCode(code),
      consumeClaimCode(code),
    ]);
    expect(results.filter((r) => r === guest.id)).toHaveLength(1);
    expect(results).toContain(null);
  });

  test("stores only the hash of a 128-bit code", async () => {
    const guest = await factories.guest();
    const code = await mintClaimCode(guest.id);
    expect(Buffer.from(code, "base64url")).toHaveLength(16);
    const [row] =
      await sql`select * from claim_code where guest_id = ${guest.id}`;
    expect(row.code_hash).toEqual(createHash("sha256").update(code).digest());
    expect(JSON.stringify(row)).not.toContain(code);
  });

  test("an unknown or expired code returns nothing", async () => {
    const guest = await factories.guest();
    const code = await mintClaimCode(guest.id);
    await sql`update claim_code set created_at = now() - interval '25 hours'
              where guest_id = ${guest.id}`;
    expect(await consumeClaimCode(code)).toBeNull();
    expect(await consumeClaimCode("not-a-code")).toBeNull();
  });
});

describe("ensureAppUser", () => {
  test("creates the app_user on first sign-in and keeps it after", async () => {
    const id = randomUUID();
    const email = `${id}@example.test`;
    await sql`insert into auth.users (id, email, aud, role)
              values (${id}, ${email}, 'authenticated', 'authenticated')`;
    await ensureAppUser(id, email);
    const [first] = await sql`select * from app_user where id = ${id}`;
    await ensureAppUser(id, email);
    expect(await sql`select * from app_user where id = ${id}`).toEqual([first]);
    expect(first.email).toBe(email);
  });
});
