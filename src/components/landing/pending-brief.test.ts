import { afterEach, expect, test, vi } from "vitest";
import { briefInput } from "@/contracts";
import { examples } from "@/contracts/examples";
import { memoryStorage } from "@/lib/client/testing";
import { savePendingBrief, takePendingBrief } from "./pending-brief";

const DRAFT = "3f0c6a52-8a7e-4c3e-9a51-0d6f3b8f2c11";

afterEach(() => vi.unstubAllGlobals());

test("the editor takes the landing's brief once", () => {
  vi.stubGlobal("sessionStorage", memoryStorage());
  const input = briefInput.parse(examples.briefInput);

  savePendingBrief(DRAFT, input);
  expect(takePendingBrief(DRAFT)).toEqual(input);
  expect(takePendingBrief(DRAFT)).toBeNull();
});

test("blocked storage reads as no brief", () => {
  vi.stubGlobal("sessionStorage", undefined);
  savePendingBrief(DRAFT, briefInput.parse(examples.briefInput));
  expect(takePendingBrief(DRAFT)).toBeNull();
});
