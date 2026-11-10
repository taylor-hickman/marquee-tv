import { sql } from "@/test/db";
import { describe, expect, test, vi } from "vitest";
import { accountResponse } from "@/contracts";
import { asGuest, asUser } from "@/lib/auth/testing";
import * as factories from "@/test/factories";
import { GET } from "./route";

vi.mock("server-only", () => ({}));

const get = async (headers: Record<string, string>) => {
  const response = await GET(
    new Request("http://localhost/api/account", { headers }),
  );
  return { status: response.status, body: await response.json() };
};

describe("GET /api/account", () => {
  test("a user who never paid has no plan and the pass as default", async () => {
    const user = await asUser();
    const { status, body } = await get(user.headers);
    expect(status).toBe(200);
    expect(accountResponse.parse(body)).toMatchObject({
      defaultPlan: "session_pass",
      plan: null,
    });
    expect(body.email).toMatch(/@example\.test$/);
  });

  test("the claimed cohort sets the default plan", async () => {
    const user = await asUser();
    await sql`update app_user set cohort = 'sub_first' where id = ${user.userId}`;
    expect((await get(user.headers)).body.defaultPlan).toBe("subscription");
  });

  test("a live subscription outranks a newer pass", async () => {
    const user = await asUser();
    await factories.entitlement({
      user_id: user.userId,
      kind: "subscription",
      status: "active",
      period_end: new Date("2026-12-09T18:30:00Z"),
      created_at: new Date("2026-11-01T00:00:00Z"),
    });
    await factories.entitlement({
      user_id: user.userId,
      kind: "session_pass",
      status: "active",
      period_end: new Date("2026-11-17T00:00:00Z"),
    });
    expect((await get(user.headers)).body.plan).toEqual({
      kind: "subscription",
      status: "active",
      periodEnd: "2026-12-09T18:30:00.000Z",
    });
  });

  test("a canceled subscription gives way to the newest entitlement", async () => {
    const user = await asUser();
    await factories.entitlement({
      user_id: user.userId,
      kind: "subscription",
      status: "canceled",
      created_at: new Date("2026-11-01T00:00:00Z"),
    });
    await factories.entitlement({
      user_id: user.userId,
      kind: "session_pass",
      status: "active",
      period_end: new Date("2026-11-17T00:00:00Z"),
    });
    expect((await get(user.headers)).body.plan).toMatchObject({
      kind: "session_pass",
      periodEnd: "2026-11-17T00:00:00.000Z",
    });
  });

  test("a guest or no credential is unauthorized", async () => {
    const guest = await asGuest();
    expect((await get(guest.headers)).status).toBe(401);
    expect((await get({})).status).toBe(401);
  });
});
