import { afterEach, describe, expect, test, vi } from "vitest";
import { examples } from "@/contracts/examples";
import { draftView } from "@/contracts";
import {
  getDraftCache,
  getGuestToken,
  getHandoffSheetSeen,
  setDraftCache,
  setGuestToken,
  setHandoffSheetSeen,
} from "./storage";
import { memoryStorage } from "./testing";

const throwing = new Proxy({} as Storage, {
  get() {
    throw new DOMException("blocked", "SecurityError");
  },
});

afterEach(() => vi.unstubAllGlobals());

describe("with working storage", () => {
  test("round-trips the guest token, draft cache and handoff flag", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const draft = draftView.parse(examples.draftView);

    expect(getGuestToken()).toBeNull();
    expect(getDraftCache()).toBeNull();
    expect(getHandoffSheetSeen()).toBe(false);

    setGuestToken("token-1");
    setDraftCache(draft);
    setHandoffSheetSeen();

    expect(getGuestToken()).toBe("token-1");
    expect(getDraftCache()).toEqual(draft);
    expect(getHandoffSheetSeen()).toBe(true);
  });

  test.each([
    ["not JSON", "{"],
    ["an old shape", JSON.stringify({ draft: { id: 1 } })],
  ])("a draft cache that is %s reads as empty", (_, raw) => {
    const storage = memoryStorage();
    storage.setItem("draft_cache", raw);
    vi.stubGlobal("localStorage", storage);
    expect(getDraftCache()).toBeNull();
  });
});

describe.each([
  ["throws on access", throwing],
  ["is missing", undefined],
])("when storage %s", (_, storage) => {
  test("reads are empty and writes are dropped", () => {
    vi.stubGlobal("localStorage", storage);
    expect(() => {
      setGuestToken("token-1");
      setDraftCache(draftView.parse(examples.draftView));
      setHandoffSheetSeen();
    }).not.toThrow();
    expect(getGuestToken()).toBeNull();
    expect(getDraftCache()).toBeNull();
    expect(getHandoffSheetSeen()).toBe(false);
  });
});

test("a full storage drops the write", () => {
  const storage = memoryStorage();
  storage.setItem = () => {
    throw new DOMException("full", "QuotaExceededError");
  };
  vi.stubGlobal("localStorage", storage);
  expect(() => setGuestToken("token-1")).not.toThrow();
  expect(getGuestToken()).toBeNull();
});
