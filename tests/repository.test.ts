import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@/infrastructure/database";
import { WorkspaceRepository } from "@/infrastructure/repository";
import { digest } from "@/domain/canonical";
import { applyCommand, reviewedRows } from "@/application/workbench";

// TEST_DATABASE_URL must point to a dedicated disposable test database.
// Without it, real PostgreSQL semantics run in PGlite (no Docker required).
describe("PostgreSQL transaction boundary", () => {
  let database: Database, repository: WorkspaceRepository;
  const session = () => digest(randomUUID());
  async function create() {
    const id = session();
    await repository.create(id, id);
    return id;
  }
  beforeAll(async () => {
    database = await createDatabase(process.env.TEST_DATABASE_URL, "memory://");
    repository = new WorkspaceRepository(database);
  });
  afterAll(async () => {
    await database?.close();
  });
  it("stores native JSON objects, never a doubly encoded JSON string", async () => {
    const id = await create();
    const [row] = await database.query<{ kind: string; version: number }>(
      "SELECT jsonb_typeof(state) AS kind, (state->>'version')::integer AS version FROM closepilot_workspaces WHERE session_hash = $1",
      [id],
    );
    const audit = await database.query<{ kind: string }>(
      "SELECT jsonb_typeof(event) AS kind FROM closepilot_audit_events WHERE session_hash = $1",
      [id],
    );
    expect(row).toEqual({ kind: "object", version: 1 });
    expect(audit.every((event) => event.kind === "object")).toBe(true);
    expect((await repository.get(id)).orders).toHaveLength(128);
  });
  it("rejects JSON scalars at the database boundary even when SQL CHECK would accept null", async () => {
    const id = session();
    await expect(
      database.query(
        `INSERT INTO closepilot_workspaces(session_hash, state, version, status, expires_at) VALUES ($1, '"invalid"'::jsonb, 1, 'open', now() + interval '1 hour')`,
        [id],
      ),
    ).rejects.toThrow();
  });
  it("isolates sessions even when idempotency keys are identical", async () => {
    const a = await create(),
      b = await create(),
      key = randomUUID();
    await repository.execute(a, key, { action: "reconcile", expectedVersion: 1 });
    expect((await repository.get(a)).version).toBe(2);
    expect((await repository.get(b)).version).toBe(1);
    await repository.execute(b, key, { action: "reconcile", expectedVersion: 1 });
    expect((await repository.get(b)).version).toBe(2);
  });
  it("commits one effect for two concurrent identical deliveries", async () => {
    const id = await create(),
      key = randomUUID();
    const results = await Promise.all([
      repository.execute(id, key, { action: "reconcile", expectedVersion: 1 }),
      repository.execute(id, key, { action: "reconcile", expectedVersion: 1 }),
    ]);
    expect(results.filter((result) => result.replayed)).toHaveLength(1);
    const workspace = await repository.get(id);
    expect(workspace.version).toBe(2);
    expect(workspace.events).toHaveLength(3);
    const events = await database.query(
      "SELECT * FROM closepilot_audit_events WHERE session_hash = $1",
      [id],
    );
    expect(events).toHaveLength(3);
  });
  it("accepts only one concurrent command based on a stale snapshot", async () => {
    const id = await create();
    const results = await Promise.allSettled([
      repository.execute(id, randomUUID(), { action: "reconcile", expectedVersion: 1 }),
      repository.execute(id, randomUUID(), { action: "reconcile", expectedVersion: 1 }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await repository.get(id)).version).toBe(2);
  });
  it("rejects key reuse with a different payload", async () => {
    const id = await create(),
      key = randomUUID();
    await repository.execute(id, key, { action: "reconcile", expectedVersion: 1 });
    await expect(
      repository.execute(id, key, { action: "reconcile", expectedVersion: 2 }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("rolls back a rejected close without a receipt or audit event", async () => {
    const id = await create();
    await expect(
      repository.execute(id, randomUUID(), { action: "close", expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: "UNRESOLVED_ISSUES" });
    expect((await repository.get(id)).version).toBe(1);
    expect(
      await database.query("SELECT * FROM closepilot_receipts WHERE session_hash = $1", [id]),
    ).toHaveLength(0);
    expect(
      await database.query("SELECT * FROM closepilot_audit_events WHERE session_hash = $1", [id]),
    ).toHaveLength(2);
  });
  it("enforces closed immutability and append-only audit updates in the database", async () => {
    const id = await create();
    let workspace = await repository.get(id);
    for (const row of reviewedRows(workspace).filter((row) => row.kind !== "matched")) {
      workspace = applyCommand(workspace, {
        action: "resolve",
        expectedVersion: workspace.version,
        rowKey: row.key,
        disposition:
          row.kind === "timing"
            ? "carry_forward"
            : row.kind === "duplicate"
              ? "exclude_duplicate"
              : "accepted_variance",
        note: "Synthetic evidence checked for database lock testing.",
        evidence: "TEST-SOURCE",
      });
    }
    workspace = applyCommand(workspace, { action: "close", expectedVersion: workspace.version });
    await database.query(
      "UPDATE closepilot_workspaces SET state = $2::jsonb, version = $3, status = $4 WHERE session_hash = $1",
      [id, workspace, workspace.version, workspace.status],
    );
    await expect(
      database.query(
        "UPDATE closepilot_workspaces SET version = version + 1 WHERE session_hash = $1",
        [id],
      ),
    ).rejects.toThrow("immutable");
    await expect(
      database.query(
        "UPDATE closepilot_audit_events SET event = '{}'::jsonb WHERE session_hash = $1",
        [id],
      ),
    ).rejects.toThrow("cannot be updated");
  });
  it("rejects unknown and expired sessions", async () => {
    await expect(repository.get(session())).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    const id = session();
    await repository.create(id, id, new Date(Date.now() - 7 * 60 * 60 * 1000));
    await expect(repository.get(id)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });
  it("parameterizes SQL instead of interpolating session input", async () => {
    await expect(repository.get("' OR 1=1 --")).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });
  it("bounds new sessions per client bucket", async () => {
    const client = session();
    for (let i = 0; i < 10; i++) await repository.create(session(), client);
    await expect(repository.create(session(), client)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });
});
