import { createServer } from "node:http";
import { get } from "node:https";
import type { AddressInfo } from "node:net";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { expect, test } from "vitest";

test("a fetch to a third-party host fails", async () => {
  await expect(fetch("https://example.com")).rejects.toThrow();
});

test("a node:https request to a third-party host fails", async () => {
  const outcome = new Promise((resolve, reject) =>
    get("https://example.com", resolve).on("error", reject),
  );
  await expect(outcome).rejects.toThrow(/Blocked example.com/);
});

test("a fetch to a public IP fails", async () => {
  await expect(fetch("http://1.1.1.1")).rejects.toThrow();
});

test("a request to localhost goes ahead", async () => {
  const local = createServer((_, res) => res.end("ok"));
  await new Promise<void>((resolve) => local.listen(0, "127.0.0.1", resolve));
  const { port } = local.address() as AddressInfo;
  try {
    const res = await fetch(`http://localhost:${port}`);
    expect(await res.text()).toBe("ok");
  } finally {
    local.close();
  }
});

test("a test can mock a third-party host with MSW", async () => {
  const server = setupServer(
    http.get("https://example.com", () => HttpResponse.text("mocked")),
  );
  server.listen({ onUnhandledFrame: "error" });
  try {
    const res = await fetch("https://example.com");
    expect(await res.text()).toBe("mocked");
  } finally {
    server.close();
  }
});
