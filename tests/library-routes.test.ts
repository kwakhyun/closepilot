import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import type { Database } from "@/infrastructure/database";
import { createTestDatabase } from "./helpers/database";
import { WorkspaceRepository } from "@/infrastructure/repository";
import { hashToken } from "@/infrastructure/http";
import type { Workspace } from "@/domain/model";

const state = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  database: null as Database | null,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) => {
      const value = state.cookies.get(key);
      return value ? { value } : undefined;
    },
  }),
}));
vi.mock("@/infrastructure/database", async (original) => ({
  ...(await original<typeof import("@/infrastructure/database")>()),
  getDatabase: async () => state.database,
}));
import { GET, POST } from "@/app/api/workspaces/route";
import { GET as templates } from "@/app/api/imports/templates/route";
import { GET as exportWorkspace } from "@/app/api/export/route";
import { POST as createSession } from "@/app/api/session/route";

describe("library HTTP capabilities", () => {
  let owner: string, handle: string;
  let originalToken: string, otherToken: string, closedToken: string;
  let original: Workspace, other: Workspace, closed: Workspace;
  beforeAll(async () => {
    state.database = await createTestDatabase();
    owner = randomBytes(32).toString("hex");
    handle = randomUUID();
    originalToken = randomBytes(32).toString("hex");
    otherToken = randomBytes(32).toString("hex");
    closedToken = randomBytes(32).toString("hex");
    const repository = new WorkspaceRepository(state.database);
    original = await repository.create(
      hashToken(originalToken),
      hashToken(randomUUID()),
      new Date(),
      {},
      undefined,
      { owner: hashToken(owner), handle },
    );
    other = await repository.create(hashToken(otherToken), hashToken(randomUUID()), new Date(), {
      templateId: "morrow-food-v1",
    });
    closed = await repository.create(hashToken(closedToken), hashToken(randomUUID()), new Date(), {
      showcase: "completed",
    });
  });
  beforeEach(() => {
    vi.stubEnv("APP_ORIGIN", "http://localhost");
    state.cookies.clear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    await state.database?.close();
  });
  const request = (id = handle, origin = "http://localhost") =>
    new Request("http://localhost/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ id }),
    });
  it("returns an empty library without a cookie and denies activation", async () => {
    expect(await (await GET(new Request("http://localhost/api/workspaces"))).json()).toEqual({
      workspaces: [],
    });
    expect((await POST(request())).status).toBe(401);
    expect((await templates(new Request("http://localhost/api/imports/templates"))).status).toBe(
      401,
    );
  });
  it("rejects foreign owners, cross-origin requests and malformed handles", async () => {
    state.cookies.set("closepilot_library", randomBytes(32).toString("hex"));
    expect((await POST(request())).status).toBe(404);
    state.cookies.set("closepilot_library", owner);
    expect((await POST(request(handle, "https://other.example"))).status).toBe(403);
    expect((await POST(request("not-a-uuid"))).status).toBe(400);
  });
  it("issues an opaque HttpOnly session without disclosing bearer secrets in JSON", async () => {
    state.cookies.set("closepilot_library", owner);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/closepilot_session=[a-f0-9]{64}/);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    const text = await response.text();
    expect(text).not.toContain(owner);
    expect(text).not.toContain(hashToken(owner));
  });
  it("uses the configured public origin rather than the internal request URL", async () => {
    vi.stubEnv("APP_ORIGIN", "https://close.example");
    state.cookies.set("closepilot_library", owner);
    const denied = await POST(request());
    expect(denied.status).toBe(403);
    expect((await denied.json()).error.code).toBe("ORIGIN_DENIED");
    expect((await POST(request(handle, "https://close.example"))).status).toBe(200);
  });

  it("requires an authenticated matching workspace for both export formats", async () => {
    const exportRequest = (format: string, scope?: string) =>
      new Request(`http://localhost/api/export?format=${format}${scope ? `&scope=${scope}` : ""}`);
    expect((await exportWorkspace(exportRequest("csv", original.draftScope))).status).toBe(401);
    state.cookies.set("closepilot_session", otherToken);
    for (const format of ["csv", "json"]) {
      const missing = await exportWorkspace(exportRequest(format));
      expect(missing.status).toBe(400);
      expect((await missing.json()).error.code).toBe("WORKSPACE_SCOPE_REQUIRED");
      const stale = await exportWorkspace(exportRequest(format, original.draftScope));
      expect(stale.status).toBe(409);
      expect(stale.headers.get("content-disposition")).toBeNull();
      expect((await stale.json()).error.code).toBe("WORKSPACE_CHANGED");
    }
    const csv = await exportWorkspace(exportRequest("csv", other.draftScope));
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-disposition")).toContain("attachment");
    expect(await csv.text()).toContain("expected_net_krw");
    state.cookies.set("closepilot_session", closedToken);
    const json = await exportWorkspace(exportRequest("json", closed.draftScope));
    expect(json.status).toBe(200);
    expect((await json.json()).snapshot.hash).toBe(closed.close!.hash);
  });

  it("rejects a stale or missing clone scope even when both workspaces have the same version", async () => {
    expect(original.version).toBe(other.version);
    state.cookies.set("closepilot_session", otherToken);
    state.cookies.set("closepilot_library", owner);
    const before = await state.database!.query(
      `SELECT (SELECT count(*) FROM closepilot_workspaces)::integer AS workspaces,
        (SELECT count(*) FROM closepilot_audit_events)::integer AS events,
        (SELECT sum(hits) FROM closepilot_rate_limits)::integer AS hits`,
    );
    for (const scope of [undefined, original.draftScope]) {
      const response = await createSession(
        new Request("http://localhost/api/session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "http://localhost",
            ...(scope ? { "X-Workspace-Scope": scope } : {}),
          },
          body: JSON.stringify({
            cloneCurrent: true,
            expectedVersion: original.version,
            brandName: original.profile!.brandName,
            period: "2026-09",
          }),
        }),
      );
      expect(response.status).toBe(scope ? 409 : 400);
      expect((await response.json()).error.code).toBe(
        scope ? "WORKSPACE_CHANGED" : "WORKSPACE_SCOPE_REQUIRED",
      );
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect(
      await state.database!.query(
        `SELECT (SELECT count(*) FROM closepilot_workspaces)::integer AS workspaces,
        (SELECT count(*) FROM closepilot_audit_events)::integer AS events,
        (SELECT sum(hits) FROM closepilot_rate_limits)::integer AS hits`,
      ),
    ).toEqual(before);
    expect(await new WorkspaceRepository(state.database!).get(hashToken(otherToken))).toEqual(
      other,
    );
  });

  it("clones the displayed workspace into a new month with its saved policy", async () => {
    state.cookies.set("closepilot_session", originalToken);
    state.cookies.set("closepilot_library", owner);
    const response = await createSession(
      new Request("http://localhost/api/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
          "X-Workspace-Scope": original.draftScope!,
        },
        body: JSON.stringify({
          cloneCurrent: true,
          expectedVersion: original.version,
          brandName: original.profile!.brandName,
          period: "2026-09",
        }),
      }),
    );
    expect(response.status).toBe(201);
    const clone = await response.json();
    expect(clone.period).toBe("2026-09");
    expect(clone.profile.id).toBe(original.profile!.id);
    expect(clone.profile.policy).toEqual(original.profile!.policy);
    expect(clone.draftScope).not.toBe(original.draftScope);
    expect(await new WorkspaceRepository(state.database!).get(hashToken(originalToken))).toEqual(
      original,
    );
  });
});
