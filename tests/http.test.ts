import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError, assertSameOrigin, readJson } from "@/infrastructure/http";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("HTTP trust boundary", () => {
  it("compares the public Host when Next receives an internal URL", () => {
    vi.stubEnv("APP_ORIGIN", "");
    expect(() =>
      assertSameOrigin(
        new Request("http://localhost:3100/api/commands", {
          headers: { origin: "http://127.0.0.1:3100", host: "127.0.0.1:3100" },
        }),
      ),
    ).not.toThrow();
  });
  it("pins an explicitly configured production origin", () => {
    vi.stubEnv("APP_ORIGIN", "https://close.example");
    expect(() =>
      assertSameOrigin(
        new Request("https://close.example/api/commands", {
          headers: { origin: "https://evil.example", host: "evil.example" },
        }),
      ),
    ).toThrow();
  });
  it.each<Record<string, string>>([
    {},
    { origin: "https://close.example", "sec-fetch-site": "cross-site" },
  ])("rejects missing origin or cross-site requests", (headers) => {
    vi.stubEnv("APP_ORIGIN", "https://close.example");
    expect(() =>
      assertSameOrigin(new Request("https://close.example/api/commands", { headers })),
    ).toThrow();
  });
  it("bounds streamed input even when Content-Length is absent", async () => {
    const request = new Request("https://close.example/api/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: "x".repeat(300_000) }),
    });
    await expect(readJson(request)).rejects.toMatchObject({ code: "BODY_TOO_LARGE", status: 413 });
  });
  it("rejects incorrect content type and malformed JSON", async () => {
    await expect(
      readJson(new Request("https://close.example", { method: "POST", body: "{}" })),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      readJson(
        new Request("https://close.example", {
          method: "POST",
          body: "{",
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_JSON" });
  });
  it("correlates the safe error body, response header and log without disclosing the exception", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = apiError(new Error("private database credential must never appear"));
    const body = await response.json();
    expect(response.headers.get("X-Request-Id")).toBe(body.error.requestId);
    expect(log).toHaveBeenCalledWith(expect.stringContaining(body.error.requestId));
    expect(JSON.stringify(body)).not.toContain("credential");
    expect(log.mock.calls.flat().join()).not.toContain("credential");
  });
});
