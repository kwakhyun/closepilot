import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { digest } from "@/domain/canonical";
import { createDatabase, type Database } from "@/infrastructure/database";
import { WorkspaceRepository } from "@/infrastructure/repository";
import { WorkspaceLibrary } from "@/infrastructure/workspace-library";
import { missingMappingHeaders } from "@/components/mapping-templates";

describe("browser workspace library", () => {
  let database: Database, repository: WorkspaceRepository, library: WorkspaceLibrary;
  const hash = () => digest(randomUUID());
  beforeAll(async () => {
    database = await createDatabase(process.env.TEST_DATABASE_URL, "memory://");
    repository = new WorkspaceRepository(database);
    library = new WorkspaceLibrary(database);
  });
  afterAll(async () => {
    await database?.close();
  });
  async function create(owner = hash(), now = new Date(), completed = false) {
    const id = hash(),
      handle = randomUUID();
    const workspace = await repository.create(
      id,
      hash(),
      now,
      completed ? { showcase: "completed" } : {},
      undefined,
      { owner, handle },
    );
    return { id, handle, owner, workspace };
  }
  it("lists only the bearer owner's workspaces without exposing authentication hashes", async () => {
    const a = await create(),
      b = await create();
    const list = await library.list(a.owner);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: a.handle,
      period: "2026-08",
      scope: a.workspace.draftScope,
    });
    expect(JSON.stringify(list)).not.toContain(a.id);
    expect(JSON.stringify(list)).not.toContain(a.owner);
    await expect(library.open(b.owner, a.handle, hash())).rejects.toMatchObject({
      code: "WORKSPACE_NOT_FOUND",
    });
  });
  it("expires access after six hours but retains the workspace for reopening", async () => {
    const a = await create(undefined, new Date(Date.now() - 7 * 60 * 60 * 1000));
    await expect(library.resolve(a.id)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    expect(await library.list(a.owner)).toHaveLength(1);
    const token = hash();
    expect(await library.open(a.owner, a.handle, token)).toEqual(a.workspace);
    expect(await library.resolve(token)).toBe(a.id);
    expect(await repository.get(await library.resolve(token))).toEqual(a.workspace);
  });
  it("does not change a closed package, audit or version when reopened", async () => {
    const a = await create(undefined, new Date(), true);
    const before = await repository.get(a.id);
    await library.open(a.owner, a.handle, hash());
    expect(await repository.get(a.id)).toEqual(before);
    await expect(
      repository.execute(a.id, randomUUID(), {
        action: "reconcile",
        expectedVersion: before.version,
      }),
    ).rejects.toMatchObject({ code: "CLOSE_LOCKED" });
  });
  it("rejects expired retention and never extends its lifetime by opening", async () => {
    const a = await create(undefined, new Date(Date.now() - 31 * 86400000));
    expect(await library.list(a.owner)).toEqual([]);
    await expect(library.open(a.owner, a.handle, hash())).rejects.toMatchObject({
      code: "WORKSPACE_NOT_FOUND",
    });
  });
  it("keeps old unarchived sessions compatible without adopting them", async () => {
    const id = hash();
    await repository.create(id, hash());
    expect(await library.resolve(id)).toBe(id);
    expect(await library.list(hash())).toEqual([]);
  });
  it("bounds the library and rolls back the thirteenth creation", async () => {
    const owner = hash();
    for (let i = 0; i < 12; i++) await create(owner);
    await expect(create(owner)).rejects.toMatchObject({ code: "LIBRARY_FULL" });
    expect(await library.list(owner)).toHaveLength(12);
  });
  it("rejects a command from another workspace even at the same version", async () => {
    const a = await create(),
      b = await create();
    await expect(
      repository.execute(
        b.id,
        randomUUID(),
        { action: "reconcile", expectedVersion: 1 },
        a.workspace.draftScope,
      ),
    ).rejects.toMatchObject({ code: "WORKSPACE_CHANGED" });
    expect(await repository.get(b.id)).toEqual(b.workspace);
  });
  it("reuses only saved mapping snapshots from the same owner and profile", async () => {
    const a = await create();
    const mapping = {
      order_id: "custom",
      channel: "channel",
      date: "date",
      gross: "gross",
      refund: "refund",
    };
    await repository.execute(a.id, randomUUID(), {
      action: "import",
      expectedVersion: 1,
      kind: "orders",
      filename: "custom.csv",
      saveMapping: true,
      mapping,
      csv: "custom,channel,date,gross,refund\nNEW,d2c,2026-08-01,1000,0",
    });
    expect(await library.mappings(a.owner, a.workspace.profile!.id)).toMatchObject([
      { mappings: { orders: mapping } },
    ]);
    expect(await library.mappings(hash(), a.workspace.profile!.id)).toEqual([]);
    expect(await library.mappings(a.owner, "other-profile")).toEqual([]);
  });
  it("detects changed required columns but allows a missing optional paid date", () => {
    const mapping = {
      settlement_id: "sid",
      order_id: "oid",
      channel: "channel",
      gross: "gross",
      refund: "refund",
      fee: "fee",
      net: "net",
      due_date: "due",
      paid_date: "paid",
    };
    const headers = Object.values(mapping).filter((header) => header !== "paid");
    expect(missingMappingHeaders(mapping, headers, "settlements")).toEqual([]);
    expect(
      missingMappingHeaders(
        mapping,
        headers.filter((header) => header !== "net"),
        "settlements",
      ),
    ).toEqual(["net"]);
  });
  it("owns followup sources, rolls back rejection and commits a replay-safe annotation", async () => {
    const owner = hash(),
      sourceId = hash(),
      targetId = hash(),
      handle = randomUUID();
    const source = await repository.create(
      sourceId,
      hash(),
      new Date(),
      { showcase: "completed", period: "2024-01" },
      undefined,
      { owner, handle },
    );
    const current = await repository.create(
      targetId,
      hash(),
      new Date(),
      { period: "2024-02" },
      undefined,
      { owner, handle: randomUUID() },
    );
    const sources = await library.followups(owner, current);
    expect(sources).toHaveLength(1);
    expect(await library.followups(hash(), current)).toEqual([]);
    const command = {
      action: "record_followup" as const,
      expectedVersion: current.version,
      sourceId: handle,
      sourceHash: source.close!.hash,
      rowKey: source.close!.resolutions.find((entry) => entry.disposition === "carry_forward")!
        .rowKey,
      settlementIds: [],
      status: "waiting" as const,
      note: "다음 월 합성 정산 근거를 기다리는 검토 기록입니다.",
      evidence: "synthetic followup test",
    };
    const key = randomUUID();
    for (const wrongOwner of [undefined, hash()]) {
      await expect(
        repository.execute(targetId, key, command, current.draftScope, wrongOwner),
      ).rejects.toMatchObject({ code: "WORKSPACE_NOT_FOUND" });
      expect(await repository.get(targetId)).toEqual(current);
    }
    const result = await repository.execute(targetId, key, command, current.draftScope, owner);
    expect(result.replayed).toBe(false);
    expect(result.workspace.events).toHaveLength(current.events.length + 1);
    expect(
      (await repository.execute(targetId, key, command, current.draftScope, owner)).replayed,
    ).toBe(true);
    expect(await repository.get(targetId)).toEqual(result.workspace);
    expect(await repository.get(sourceId)).toEqual(source);
  });
});
