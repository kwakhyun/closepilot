import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { digest } from "@/domain/canonical";
import { buildReviewEvidence, ruleBasedReviewDraft } from "@/application/review-draft";
import { reviewedRows } from "@/application/workbench";
import type { ReviewDraftResponse } from "@/domain/review-draft";
import { createDatabase, type Database } from "@/infrastructure/database";
import { WorkspaceRepository } from "@/infrastructure/repository";
import { ReviewDraftStore, REVIEW_DRAFT_LIMITS } from "@/infrastructure/review-draft-store";

describe("shared AI admission and cache", () => {
  let db: Database, repository: WorkspaceRepository, store: ReviewDraftStore;
  const ids: string[] = [];
  // Separate fixed UTC buckets keep these tests independent of workspace rate limits.
  let now: Date;
  let day = 1;
  const evidence = digest("evidence");
  async function session() {
    const id = digest(randomUUID());
    ids.push(id);
    await repository.create(id, id);
    return id;
  }
  async function response(id: string): Promise<ReviewDraftResponse> {
    const workspace = await repository.get(id);
    const row = reviewedRows(workspace).find((row) => row.kind !== "matched")!;
    return {
      mode: "ai",
      model: "test-model",
      generatedAt: now.toISOString(),
      latencyMs: 1,
      draft: ruleBasedReviewDraft(buildReviewEvidence(workspace, row.key)),
      notice: "Test draft",
    };
  }
  beforeAll(async () => {
    db = await createDatabase(process.env.TEST_DATABASE_URL, "memory://");
    // Remove only this suite's future-dated leases left by an interrupted run.
    await db.query(
      "DELETE FROM closepilot_review_drafts WHERE lease_until >= '2090-01-01' AND lease_until < '2090-02-01'",
    );
    repository = new WorkspaceRepository(db);
    store = new ReviewDraftStore(db);
  });
  beforeEach(async () => {
    while (ids.length) {
      await db.query("DELETE FROM closepilot_workspaces WHERE session_hash = $1", [ids[0]]);
      ids.shift();
    }
    now = new Date(`2090-01-${String(day++).padStart(2, "0")}T12:00:00.000Z`);
    await db.query("DELETE FROM closepilot_rate_limits WHERE bucket = $1", [
      `ai:global:${now.toISOString().slice(0, 10)}`,
    ]);
  });
  afterAll(async () => {
    try {
      for (const id of ids)
        await db?.query("DELETE FROM closepilot_workspaces WHERE session_hash = $1", [id]);
    } finally {
      await db?.close();
    }
  });

  it("admits one concurrent request per session, then reuses its cached result without quota", async () => {
    const id = await session();
    const results = await Promise.allSettled([
      store.reserve(id, 1, evidence, now),
      store.reserve(id, 1, evidence, now),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "AI_BUSY" },
    });
    const reserved = results.find((result) => result.status === "fulfilled")!;
    if (reserved.status !== "fulfilled" || reserved.value.mode !== "reserved")
      throw new Error("Expected reservation");
    const draft = await response(id);
    await store.complete(id, evidence, reserved.value.token, draft);
    expect(await store.reserve(id, 1, evidence, now)).toEqual({ mode: "cached", response: draft });
    const counters = await db.query<{ hits: number }>(
      "SELECT hits FROM closepilot_rate_limits WHERE bucket = $1",
      [`ai:session:${id}:${now.toISOString().slice(0, 13)}`],
    );
    expect(counters[0].hits).toBe(1);
    expect((await repository.get(id)).version).toBe(1);
  });

  it("limits attempts per session, counts failures, and rolls back the global counter on refusal", async () => {
    const id = await session();
    for (let i = 0; i < REVIEW_DRAFT_LIMITS.sessionPerHour; i++) {
      const lease = await store.reserve(id, 1, evidence, now);
      if (lease.mode !== "reserved") throw new Error("Expected reservation");
      await store.release(id, evidence, lease.token);
    }
    await expect(store.reserve(id, 1, evidence, now)).rejects.toMatchObject({
      code: "AI_RATE_LIMITED",
    });
    const [counter] = await db.query<{ hits: number }>(
      "SELECT hits FROM closepilot_rate_limits WHERE bucket = $1",
      [`ai:global:${now.toISOString().slice(0, 10)}`],
    );
    expect(counter.hits).toBe(10);
    expect((await store.reserve(id, 1, evidence, new Date(now.getTime() + 3_600_000))).mode).toBe(
      "reserved",
    );
  });

  it("enforces a daily global budget across sessions and resets at UTC midnight", async () => {
    const id = await session();
    await db.query(
      "INSERT INTO closepilot_rate_limits(bucket, hits, expires_at) VALUES ($1, $2, $3)",
      [
        `ai:global:${now.toISOString().slice(0, 10)}`,
        REVIEW_DRAFT_LIMITS.globalPerDay,
        new Date(now.getTime() + 86_400_000).toISOString(),
      ],
    );
    await expect(store.reserve(id, 1, evidence, now)).rejects.toMatchObject({
      code: "AI_RATE_LIMITED",
    });
    await expect(store.reserve(await session(), 1, evidence, now)).rejects.toMatchObject({
      code: "AI_RATE_LIMITED",
    });
    expect((await store.reserve(id, 1, evidence, new Date(now.getTime() + 86_400_000))).mode).toBe(
      "reserved",
    );
  });

  it("bounds global in-flight work across sessions", async () => {
    const sessions = [];
    for (let i = 0; i < 5; i++) sessions.push(await session());
    const results = await Promise.allSettled(
      sessions.map((id) => store.reserve(id, 1, evidence, now)),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(4);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "AI_BUSY" },
    });
  });

  it("expires abandoned leases and prevents a late worker from replacing or deleting a successor", async () => {
    const id = await session();
    const first = await store.reserve(id, 1, evidence, now);
    const nextTime = new Date(now.getTime() + REVIEW_DRAFT_LIMITS.leaseMs + 1);
    const next = await store.reserve(id, 1, evidence, nextTime);
    if (first.mode !== "reserved" || next.mode !== "reserved")
      throw new Error("Expected reservation");
    await store.complete(id, evidence, first.token, await response(id));
    await store.release(id, evidence, first.token);
    await expect(store.reserve(id, 1, evidence, nextTime)).rejects.toMatchObject({
      code: "AI_BUSY",
    });
    await store.complete(id, evidence, next.token, await response(id));
    expect((await store.reserve(id, 1, evidence, nextTime)).mode).toBe("cached");
    // New evidence and another session cannot reuse this result.
    expect((await store.reserve(id, 1, digest("changed evidence"), nextTime)).mode).toBe(
      "reserved",
    );
    expect((await store.reserve(await session(), 1, evidence, nextTime)).mode).toBe("reserved");
  });

  it("rejects stale, closed and expired workspaces before returning a cached draft", async () => {
    const id = await session();
    await expect(store.reserve(id, 2, evidence, now)).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });
    const closedId = digest(randomUUID());
    ids.push(closedId);
    const closed = await repository.create(closedId, closedId, new Date(), {
      showcase: "completed",
    });
    await expect(store.reserve(closedId, closed.version, evidence, now)).rejects.toMatchObject({
      code: "CLOSE_LOCKED",
    });
    const reservation = await store.reserve(id, 1, evidence, now);
    if (reservation.mode !== "reserved") throw new Error("Expected reservation");
    await store.complete(id, evidence, reservation.token, await response(id));
    await db.query("DELETE FROM closepilot_workspaces WHERE session_hash = $1", [id]);
    expect(
      await db.query("SELECT 1 FROM closepilot_review_drafts WHERE session_hash = $1", [id]),
    ).toHaveLength(0);
    await expect(store.reserve(id, 1, evidence, now)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  });
});
