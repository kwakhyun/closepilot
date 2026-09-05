import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoWorkspace } from "@/application/showcase";
import { DomainError } from "@/domain/model";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/infrastructure/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/infrastructure/http")>()),
  repository: async () => ({ get: mocks.get }),
  sessionHash: async () => "test",
}));
import { POST as preview } from "@/app/api/imports/preview/route";
import { POST as simulate } from "@/app/api/policy/simulate/route";
import { POST as inspect } from "@/app/api/packages/inspect/route";

const workspace = createDemoWorkspace();
const input = {
  kind: "orders",
  csv: "order_id,channel,date,gross,refund\nNEW,d2c,2026-08-01,10000,0",
  expectedVersion: 1,
};
function request(body: unknown, origin = "https://close.example") {
  return new Request("https://close.example/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockResolvedValue(workspace);
  vi.stubEnv("APP_ORIGIN", "https://close.example");
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("enhancement API boundaries", () => {
  it.each([preview, simulate, inspect])("rejects cross-origin requests", async (route) =>
    expect((await route(request({}, "https://other.example"))).status).toBe(403),
  );
  it.each([preview, simulate, inspect])("requires a live session", async (route) => {
    mocks.get.mockRejectedValue(new DomainError("SESSION_EXPIRED", "만료", 401));
    const body =
      route === simulate
        ? { expectedVersion: 1, feeBps: { d2c: 330, naver: 385, coupang: 880 } }
        : input;
    expect((await route(request(body))).status).toBe(401);
  });
  it("returns version-bound import impact and rejects stale previews", async () => {
    expect(await (await preview(request(input))).json()).toMatchObject({
      valid: true,
      impact: { expectedVersion: 1, after: { total: 129 } },
    });
    expect((await preview(request({ ...input, expectedVersion: 999 }))).status).toBe(409);
  });
  it("returns structured CSV errors without exposing internals", async () => {
    const response = await preview(
      request({ ...input, csv: input.csv.replace("10000", "invalid") }),
    );
    expect(await response.json()).toMatchObject({ valid: false, issues: [{ row: 2 }] });
  });
  it("rejects invalid policies and returns read-only simulation results", async () => {
    expect(
      (
        await simulate(
          request({ expectedVersion: 1, feeBps: { d2c: 10001, naver: 385, coupang: 880 } }),
        )
      ).status,
    ).toBe(400);
    expect(
      await (
        await simulate(
          request({ expectedVersion: 1, feeBps: { d2c: 400, naver: 385, coupang: 880 } }),
        )
      ).json(),
    ).toMatchObject({ expectedVersion: 1 });
  });
  it("checks a valid package and bounds streamed and declared request sizes", async () => {
    const closed = createDemoWorkspace(undefined, { showcase: "completed" });
    expect(
      await (await inspect(request({ snapshot: closed.close, audit: closed.events }))).json(),
    ).toMatchObject({ valid: true });
    const oversized = request({ data: "x".repeat(5_000_001) });
    expect((await inspect(oversized)).status).toBe(413);
    const declared = request({});
    declared.headers.set("Content-Length", "5000001");
    expect((await inspect(declared)).status).toBe(413);
  });
});
