import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyCommand,
  commandSchema,
  reviewedRows,
  workspaceView,
  type Command,
} from "@/application/workbench";
import { seedWorkspace } from "@/domain/seed";
import { verifyAudit } from "@/domain/audit";
import { digest } from "@/domain/canonical";
import type { Workspace } from "@/domain/model";

const now = "2026-08-31T09:00:00.000Z";
const sample = readFileSync(new URL("../public/samples/orders.csv", import.meta.url), "utf8");
export function resolveAll(initial: Workspace): Workspace {
  let workspace = initial;
  for (const row of reviewedRows(initial).filter((row) => row.kind !== "matched")) {
    workspace = applyCommand(
      workspace,
      {
        action: "resolve",
        expectedVersion: workspace.version,
        rowKey: row.key,
        disposition:
          row.kind === "timing"
            ? "carry_forward"
            : row.kind === "duplicate"
              ? "exclude_duplicate"
              : "accepted_variance",
        note: "합성 데이터의 원본 근거를 확인한 테스트 승인입니다.",
        evidence: `SYNTHETIC-${row.sources[0]}`,
      },
      now,
    );
  }
  return workspace;
}
describe("close state machine", () => {
  it("blocks close while a single unresolved exception remains", () => {
    expect(() =>
      applyCommand(seedWorkspace(now), { action: "close", expectedVersion: 1 }, now),
    ).toThrow("아직 검토하지 않은 거래");
  });
  it("does not mutate the input aggregate", () => {
    const workspace = seedWorkspace(now);
    const original = digest(workspace);
    applyCommand(workspace, { action: "reconcile", expectedVersion: 1 }, now);
    expect(digest(workspace)).toBe(original);
  });
  it("rejects a stale revision", () => {
    expect(() =>
      applyCommand(seedWorkspace(now), { action: "reconcile", expectedVersion: 2 }),
    ).toThrow("다른 요청");
  });
  it("validates meaningful review evidence at the command boundary", () => {
    expect(
      commandSchema.safeParse({
        action: "resolve",
        expectedVersion: 1,
        rowKey: "x",
        disposition: "accepted_variance",
        note: "ok",
        evidence: "x",
      }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({ action: "close", expectedVersion: 1, tenant: "other" }).success,
    ).toBe(false);
  });
  it("prevents generic acceptance of an unpaid timing item", () => {
    const workspace = seedWorkspace(now),
      row = reviewedRows(workspace).find((row) => row.kind === "timing")!;
    expect(() =>
      applyCommand(workspace, {
        action: "resolve",
        expectedVersion: 1,
        rowKey: row.key,
        disposition: "accepted_variance",
        note: "This is a test review note",
        evidence: "DEMO-SOURCE",
      }),
    ).toThrow("이월 검토 승인");
  });
  it("preserves monetary variance and automatic match rate after approval", () => {
    const before = workspaceView(seedWorkspace(now));
    const after = workspaceView(resolveAll(seedWorkspace(now)));
    expect(after.summary.unresolved).toBe(0);
    expect(after.summary.reviewed).toBe(8);
    expect(after.summary.matched).toBe(before.summary.matched);
    expect(after.summary.actualNet).toBe(before.summary.actualNet);
    expect(after.summary.delta).toBe(before.summary.delta);
    expect(after.orders).toEqual(before.orders);
    expect(after.settlements).toEqual(before.settlements);
  });
  it("freezes a self-verifiable snapshot only after reviews", () => {
    const reviewed = resolveAll(seedWorkspace(now));
    const closed = applyCommand(
      reviewed,
      { action: "close", expectedVersion: reviewed.version },
      now,
    );
    const { hash, ...body } = closed.close!;
    expect(closed.status).toBe("closed");
    expect(digest(body)).toBe(hash);
    expect(closed.close?.reviewedCount).toBe(8);
    expect(verifyAudit(closed.events)).toBe(true);
    const attempts: Command[] = [
      { action: "reconcile", expectedVersion: closed.version },
      { action: "close", expectedVersion: closed.version },
      {
        action: "import",
        expectedVersion: closed.version,
        kind: "orders",
        filename: "sample.csv",
        csv: sample,
      },
    ];
    for (const command of attempts)
      expect(() => applyCommand(closed, command)).toThrow("마감이 확정되어");
  });
  it("requires another run after an import", () => {
    const reviewed = resolveAll(seedWorkspace(now));
    const imported = applyCommand(
      reviewed,
      {
        action: "import",
        expectedVersion: reviewed.version,
        kind: "orders",
        filename: "sample.csv",
        csv: sample,
      },
      now,
    );
    expect(imported.status).toBe("open");
    expect(imported.lastRunAt).toBeNull();
    expect(() =>
      applyCommand(imported, { action: "close", expectedVersion: imported.version }),
    ).toThrow("대사를 실행");
  });
  it("blocks the same file under a different name", () => {
    const workspace = applyCommand(
      seedWorkspace(now),
      { action: "import", expectedVersion: 1, kind: "orders", filename: "one.csv", csv: sample },
      now,
    );
    expect(() =>
      applyCommand(workspace, {
        action: "import",
        expectedVersion: workspace.version,
        kind: "orders",
        filename: "two.csv",
        csv: sample.replace(/\r?\n/g, "\r\n"),
      }),
    ).toThrow("이미 가져왔습니다");
  });
  it("invalidates reviews if supporting settlement data changes", () => {
    const workspace = resolveAll(seedWorkspace(now));
    const missing = reviewedRows(workspace).find((row) => row.kind === "missing")!;
    const order = workspace.orders.find((entry) => entry.id === missing.orderId)!;
    workspace.settlements.push({
      id: "LATE-ROW",
      orderId: order.id,
      channel: order.channel,
      gross: order.gross,
      refund: order.refund,
      fee: missing.expectedFee + 100,
      net: missing.expectedNet - 100,
      dueDate: "2026-08-31",
      paidDate: "2026-08-31",
      sourceId: "LATE-SOURCE",
    });
    const row = reviewedRows(workspace).find((entry) => entry.key === missing.key)!;
    expect(row.resolution).toBeNull();
    expect(workspaceView(workspace).summary.unresolved).toBe(1);
  });
  it("detects tampered or internally removed audit entries and refuses writes", () => {
    const workspace = resolveAll(seedWorkspace(now));
    const tampered = structuredClone(workspace);
    tampered.events[1].detail = "forged";
    expect(verifyAudit(tampered.events)).toBe(false);
    expect(() =>
      applyCommand(tampered, { action: "reconcile", expectedVersion: tampered.version }),
    ).toThrow("감사 기록");
    workspace.events.splice(2, 1);
    expect(verifyAudit(workspace.events)).toBe(false);
  });
});
