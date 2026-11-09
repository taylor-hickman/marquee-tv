import "@/test/db";
import { randomBytes } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import * as factories from "@/test/factories";
import {
  GUESTS_PER_IP_PER_HOUR,
  PLAIN_PER_IP_PER_MINUTE,
  RUNS_PER_HOUR,
  ipHash,
  limitGuests,
  limitPlain,
  limitRuns,
} from ".";

vi.mock("server-only", () => ({}));

const now = new Date("2026-11-09T12:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const newIp = () => randomBytes(32);

const runs = (count: number, o: Record<string, unknown>, at = minutesAgo(30)) =>
  Promise.all(
    Array.from({ length: count }, () =>
      factories.curatorRun({ created_at: at, ...o }),
    ),
  );

describe("model-backed runs", () => {
  test("ten in an hour from one IP pass; the eleventh is refused", async () => {
    const ip = newIp();
    await runs(RUNS_PER_HOUR.ip - 1, { ip_hash: ip });
    expect(RUNS_PER_HOUR.ip).toBe(10);
    expect(await limitRuns(ip, null, now)).toBeNull();

    await runs(1, { ip_hash: ip }, minutesAgo(50));
    expect(await limitRuns(ip, null, now)).toEqual({
      error: "rate_limited",
      // The oldest of the ten, 50 minutes ago, ages out in 10 minutes.
      retryAfterS: 600,
    });
  });

  test("runs older than an hour don't count", async () => {
    const ip = newIp();
    await runs(RUNS_PER_HOUR.ip, { ip_hash: ip }, minutesAgo(61));
    expect(await limitRuns(ip, null, now)).toBeNull();
  });

  test("a guest is limited across IPs, through its drafts", async () => {
    const guest = await factories.guest();
    const draft = await factories.playlistDraft({ owner_guest_id: guest.id });
    await runs(RUNS_PER_HOUR.guest, { draft_id: draft.id, ip_hash: newIp() });
    expect(
      await limitRuns(newIp(), { kind: "guest", guestId: guest.id }, now),
    ).toMatchObject({ error: "rate_limited" });
  });

  test("a user is limited across IPs, through their drafts", async () => {
    const user = await factories.appUser();
    const draft = await factories.playlistDraft({ owner_user_id: user.id });
    await runs(RUNS_PER_HOUR.user, { draft_id: draft.id, ip_hash: newIp() });
    const owner = { kind: "user", userId: user.id } as const;
    expect(await limitRuns(newIp(), owner, now)).toMatchObject({
      error: "rate_limited",
    });
    expect(
      await limitRuns(
        newIp(),
        { kind: "user", userId: crypto.randomUUID() },
        now,
      ),
    ).toBeNull();
  });
});

describe("new guests per IP", () => {
  test("the eleventh in an hour is refused", async () => {
    const ip = newIp();
    await Promise.all(
      Array.from({ length: GUESTS_PER_IP_PER_HOUR - 1 }, () =>
        factories.guest({ ip_hash: ip, created_at: minutesAgo(5) }),
      ),
    );
    expect(await limitGuests(ip, now)).toBeNull();
    await factories.guest({ ip_hash: ip, created_at: minutesAgo(20) });
    expect(await limitGuests(ip, now)).toEqual({
      error: "rate_limited",
      retryAfterS: 2400,
    });
  });
});

describe("plain per-IP limit", () => {
  test("refuses past the per-minute limit until the next minute", () => {
    const ip = newIp();
    const at = new Date("2026-11-09T12:00:15Z");
    for (let i = 0; i < PLAIN_PER_IP_PER_MINUTE; i++) {
      expect(limitPlain("test", ip, at)).toBeNull();
    }
    expect(limitPlain("test", ip, at)).toEqual({
      error: "rate_limited",
      retryAfterS: 45,
    });
    expect(limitPlain("other", ip, at)).toBeNull();
    expect(limitPlain("test", ip, new Date("2026-11-09T12:01:00Z"))).toBeNull();
  });
});

describe("ipHash", () => {
  const hashOf = (headers: Record<string, string>) =>
    ipHash(new Request("http://localhost/", { headers })).toString("hex");

  test("hashes the client address, the first x-forwarded-for entry", () => {
    expect(hashOf({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })).toBe(
      hashOf({ "x-forwarded-for": "203.0.113.7" }),
    );
    expect(hashOf({ "x-forwarded-for": "203.0.113.7" })).not.toBe(
      hashOf({ "x-forwarded-for": "203.0.113.8" }),
    );
    expect(hashOf({})).toHaveLength(64);
  });
});
