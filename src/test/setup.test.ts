import { createServer } from "node:http";
import { get } from "node:https";
import type { AddressInfo } from "node:net";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { server } from "./setup";

test("a fetch to a third-party host fails", async () => {
  await expect(fetch("https://example.com")).rejects.toThrow();
});

test("a node:https request to a third-party host fails", async () => {
  const outcome = new Promise((resolve, reject) =>
    get("https://example.com", resolve).on("error", reject),
  );
  await expect(outcome).rejects.toThrow();
});

test("a request to localhost passes through", async () => {
  const local = createServer((_, res) => res.end("ok"));
  await new Promise<void>((resolve) => local.listen(0, "127.0.0.1", resolve));
  const { port } = local.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}`);
    expect(await res.text()).toBe("ok");
  } finally {
    local.close();
  }
});

test("a test can mock a third-party host", async () => {
  server.use(
    http.get("https://example.com", () => HttpResponse.text("mocked")),
  );
  const res = await fetch("https://example.com");
  expect(await res.text()).toBe("mocked");
});
