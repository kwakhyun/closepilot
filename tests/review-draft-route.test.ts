import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seedWorkspace } from "@/domain/seed";
import { DomainError } from "@/domain/model";
import { buildReviewEvidence, ruleBasedReviewDraft } from "@/application/review-draft";
import { reviewedRows } from "@/application/workbench";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  reserve: vi.fn(),
  complete: vi.fn(),
  release: vi.fn(),
  generate: vi.fn(),
}));
vi.mock("@/infrastructure/http", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/infrastructure/http")>();
  return {
    ...original,
    repository: async () => ({ get: mocks.get }),
    sessionHash: async () => "test-session",
  };
});
vi.mock("@/infrastructure/database", () => ({ getDatabase: async () => ({}) }));
vi.mock("@/infrastructure/review-draft-store", () => ({
  ReviewDraftStore: class {
    reserve = mocks.reserve;
    complete = mocks.complete;
    release = mocks.release;
  },
}));
vi.mock("@/infrastructure/review-draft-agent", () => ({
  generateGroundedReviewDraft: mocks.generate,
  reviewModel: () => "test-model",
  REVIEW_DRAFT_PROMPT_VERSION: "test-v1",
}));
import { POST } from "@/app/api/review-draft/route";

describe("AI admission at the public route", () => {
  const workspace = seedWorkspace();
  const row = reviewedRows(workspace).find((row) => row.kind !== "matched")!;
  const draft = ruleBasedReviewDraft(buildReviewEvidence(workspace, row.key));
  function request() {
    return new Request("https://close.example/api/review-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://close.example" },
      body: JSON.stringify({ rowKey: row.key, expectedVersion: 1 }),
    });
  }
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "test-only-not-a-real-key");
    vi.stubEnv("APP_ORIGIN", "https://close.example");
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.get.mockResolvedValue(workspace);
    mocks.reserve.mockResolvedValue({ mode: "reserved", token: "lease" });
    mocks.generate.mockResolvedValue({ draft, model: "test-model", totalTokens: 100 });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(["AI_RATE_LIMITED", "AI_BUSY"])(
    "uses deterministic fallback without calling the model when %s",
    async (code) => {
      mocks.reserve.mockRejectedValue(new DomainError(code, "규칙 기반 초안을 표시합니다.", 429));
      const result = await POST(request());
      expect(result.status).toBe(200);
      expect(await result.json()).toMatchObject({ mode: "rules", draft });
      expect(mocks.generate).not.toHaveBeenCalled();
      expect(mocks.complete).not.toHaveBeenCalled();
    },
  );
  it("does not consume a reservation when no API key is configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(await (await POST(request())).json()).toMatchObject({ mode: "rules" });
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("returns a grounded cached draft without calling the provider", async () => {
    mocks.reserve.mockResolvedValue({
      mode: "cached",
      response: {
        mode: "ai",
        model: "test-model",
        draft,
        generatedAt: "2026-09-01T00:00:00.000Z",
        latencyMs: 10,
      },
    });
    const result = await POST(request());
    expect(result.headers.get("X-Review-Draft-Cache")).toBe("hit");
    expect(await result.json()).toMatchObject({ mode: "ai", draft });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("stores a successful generation and keys the cache by the evidence", async () => {
    expect(await (await POST(request())).json()).toMatchObject({ mode: "ai" });
    const firstKey = mocks.reserve.mock.calls[0][2];
    expect(mocks.complete).toHaveBeenCalledWith(
      "test-session",
      firstKey,
      "lease",
      expect.objectContaining({ mode: "ai", draft }),
    );
    const changed = structuredClone(workspace);
    changed.sources[0].digest = "changed-source-digest";
    mocks.get.mockResolvedValue(changed);
    await POST(request());
    expect(mocks.reserve.mock.calls[1][2]).not.toBe(firstKey);
  });
  it("releases failed work and falls back without changing the workspace", async () => {
    mocks.generate.mockRejectedValue(new Error("Provider unavailable"));
    expect(await (await POST(request())).json()).toMatchObject({ mode: "rules", draft });
    expect(mocks.release).toHaveBeenCalledWith("test-session", expect.any(String), "lease");
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(workspace.version).toBe(1);
  });
  it("preserves conflicts instead of disguising them as fallback drafts", async () => {
    mocks.reserve.mockRejectedValue(
      new DomainError("VERSION_CONFLICT", "자료가 변경되었습니다.", 409),
    );
    expect((await POST(request())).status).toBe(409);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
