import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@/infrastructure/database";
import { WorkspaceRepository } from "@/infrastructure/repository";
import { hashToken } from "@/infrastructure/http";

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

describe("library HTTP capabilities", () => {
  let owner: string, handle: string;
  beforeAll(async () => {
    state.database = await createDatabase(process.env.TEST_DATABASE_URL, "memory://");
    owner = randomBytes(32).toString("hex");
    handle = randomUUID();
    await new WorkspaceRepository(state.database).create(
      hashToken(randomUUID()),
      hashToken(randomUUID()),
      new Date(),
      {},
      undefined,
      { owner: hashToken(owner), handle },
    );
  });
  beforeEach(() => {
    state.cookies.clear();
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
});
