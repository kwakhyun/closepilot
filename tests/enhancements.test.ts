import { describe, expect, it } from "vitest";
import { createDemoWorkspace } from "@/application/showcase";
import { applyCommand, reviewedRows, workspaceView } from "@/application/workbench";
import { previewImport } from "@/application/import-preview";
import { simulatePolicy, simulationSchema } from "@/application/policy-simulation";
import { inspectPackage } from "@/application/package-inspection";
import { diagnoseRow } from "@/domain/diagnostics";
import { CsvValidationError, importCsv, buildProfileSampleCsv } from "@/domain/csv";
import { monthEnd } from "@/domain/period";
import { digest } from "@/domain/canonical";
import {
  readReviewDraft,
  reviewDraftKey,
  saveReviewDraft,
} from "@/components/review-draft-storage";

const now = "2026-08-31T09:00:00.000Z";
const command = {
  action: "import" as const,
  expectedVersion: 1,
  kind: "orders" as const,
  filename: "new.csv",
  csv: "order_id,channel,date,gross,refund\nNEW,d2c,2026-08-01,10000,0",
};
const closed = () => {
  const workspace = createDemoWorkspace(now, { showcase: "completed" });
  return { snapshot: workspace.close!, audit: workspace.events };
};
describe("import impact", () => {
  it("previews the same totals without mutating state or audit", () => {
    const workspace = createDemoWorkspace(now);
    const before = digest(workspace);
    const impact = previewImport(workspace, command);
    expect(impact.after).toEqual(workspaceView(applyCommand(workspace, command)).summary);
    expect(impact.after.total).toBe(129);
    expect(digest(workspace)).toBe(before);
  });
  it("rejects collisions with existing orders and bounded aggregate overflow", () => {
    const workspace = createDemoWorkspace(now);
    const order = workspace.orders[0];
    expect(() =>
      previewImport(workspace, {
        ...command,
        csv: `order_id,channel,date,gross,refund\n${order.id},${order.channel},2026-08-01,10000,0`,
      }),
    ).toThrow("동일한 주문번호");
    expect(() =>
      previewImport(workspace, { ...command, csv: command.csv.replace("10000", "1000000000000") }),
    ).toThrow("1조");
    expect(() => previewImport(workspace, { ...command, expectedVersion: 999 })).toThrow("변경");
  });
  it("identifies approvals invalidated by new evidence", () => {
    let workspace = createDemoWorkspace(now);
    const row = reviewedRows(workspace).find((entry) => entry.kind === "missing")!;
    workspace = applyCommand(workspace, {
      action: "resolve",
      expectedVersion: 1,
      rowKey: row.key,
      disposition: "accepted_variance",
      note: "합성 원본 자료를 확인한 검토 기록입니다.",
      evidence: "SYNTHETIC-SOURCE",
    });
    const impact = previewImport(workspace, {
      ...command,
      expectedVersion: 2,
      kind: "settlements",
      csv: `settlement_id,order_id,channel,gross,refund,fee,net,due_date,paid_date\nNEW-ST,${row.orderId},${row.channel},${row.gross},${row.refund},${row.expectedFee},${row.expectedNet},2026-08-31,2026-08-31`,
    });
    expect(impact.invalidatedReviews).toEqual([{ rowKey: row.key, orderId: row.orderId }]);
  });
  it("returns structured errors for every invalid row", () => {
    try {
      importCsv(
        "order_id,channel,date,gross,refund\nBAD,d2c,2026-08-01,x,0\nBAD2,d2c,2026-02-30,100,0",
        "orders",
        undefined,
        "S",
        "2026-08",
      );
      throw new Error("Expected validation error");
    } catch (error) {
      expect(error).toBeInstanceOf(CsvValidationError);
      expect((error as CsvValidationError).issues.map((issue) => issue.row)).toEqual([2, 3]);
    }
  });
});
describe("display diagnostics and policy simulations", () => {
  it("shows concurrent duplicate, fee and amount checks without changing the representative kind", () => {
    const workspace = createDemoWorkspace(now);
    const before = digest(workspace);
    const row = reviewedRows(workspace).find((entry) => entry.kind === "duplicate")!;
    const checks = diagnoseRow(row, workspace.orders, workspace.settlements, workspace.asOf);
    expect(checks.filter((entry) => entry.problem).map((entry) => entry.code)).toEqual(
      expect.arrayContaining(["duplicate", "fee", "net"]),
    );
    expect(row.kind).toBe("duplicate");
    expect(digest(workspace)).toBe(before);
  });
  it("compares a changed policy even for closed evidence without changing the saved package", () => {
    const workspace = createDemoWorkspace(now, { showcase: "completed" });
    const before = digest(workspace);
    const result = simulatePolicy(workspace, {
      expectedVersion: workspace.version,
      feeBps: { d2c: 400, naver: 385, coupang: 880 },
    });
    expect(result.after.expectedNet).toBeLessThan(result.before.expectedNet);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(digest(workspace)).toBe(before);
    expect(() =>
      simulatePolicy(workspace, {
        expectedVersion: 1,
        feeBps: { d2c: 400, naver: 385, coupang: 880 },
      }),
    ).toThrow();
    expect(
      simulationSchema.safeParse({
        expectedVersion: 1,
        feeBps: { d2c: -1, naver: 385, coupang: 880 },
      }).success,
    ).toBe(false);
  });
});
describe("read-only evidence inspection", () => {
  it("validates the existing package without rewriting it", () => {
    const pkg = closed();
    const before = digest(pkg);
    expect(inspectPackage(pkg).valid).toBe(true);
    expect(digest(pkg)).toBe(before);
  });
  it.each(["checksum", "input", "review", "audit", "version", "provenance"])(
    "rejects %s tampering",
    (kind) => {
      const pkg = closed();
      if (kind === "checksum") pkg.snapshot.hash = "0".repeat(64);
      if (kind === "input") pkg.snapshot.inputs.orders[0].gross++;
      if (kind === "review") pkg.snapshot.resolutions[0].fingerprint = "0".repeat(64);
      if (kind === "audit") pkg.audit[0].detail += "changed";
      if (kind === "version") pkg.snapshot.ruleVersion = "unknown";
      if (kind === "provenance") pkg.snapshot.closedBy = "someone else";
      if (["input", "review", "provenance"].includes(kind)) {
        const { hash: _hash, ...body } = pkg.snapshot;
        void _hash;
        pkg.snapshot.hash = digest(body);
      }
      expect(inspectPackage(pkg).valid).toBe(false);
    },
  );
  it("rejects a syntactically invalid package", () =>
    expect(inspectPackage({ snapshot: null }).valid).toBe(false));
});
describe("monthly workspaces", () => {
  it.each(["2024-02", "2026-02", "2026-09", "2026-12"])(
    "generates valid %s dates and keeps sample imports in that month",
    (period) => {
      const workspace = createDemoWorkspace(now, { period });
      expect(workspace.asOf).toBe(monthEnd(period));
      expect(
        workspace.orders.every(
          (order) => order.date <= workspace.asOf && order.date.startsWith(period),
        ),
      ).toBe(true);
      const profile = workspace.profile!;
      const csv = buildProfileSampleCsv(
        "orders",
        profile.mappings.orders,
        profile.policy.enabledChannels,
        profile.policy.feeBps,
        period,
      );
      expect(importCsv(csv, "orders", profile.mappings.orders, "S", period).orders).toHaveLength(3);
      const complete = createDemoWorkspace(now, { period, showcase: "completed" });
      expect(inspectPackage({ snapshot: complete.close, audit: complete.events }).valid).toBe(true);
    },
  );
  it("rejects invalid or unsupported periods", () => {
    expect(() => monthEnd("2026-13")).toThrow();
    expect(() => monthEnd("9999-01")).toThrow();
  });
});
describe("tab-local review drafts", () => {
  function storage(): Storage {
    const map = new Map<string, string>();
    return {
      get length() {
        return map.size;
      },
      key: (index) => [...map.keys()][index] ?? null,
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => {
        map.set(key, value);
      },
      removeItem: (key) => {
        map.delete(key);
      },
      clear: () => map.clear(),
    };
  }
  it("isolates scopes and removes expired or malformed drafts", () => {
    const store = storage();
    const key = reviewDraftKey("one", "row");
    const draft = {
      note: "memo",
      evidence: "source",
      fingerprint: "a".repeat(64),
      expiresAt: 2000,
    };
    saveReviewDraft(store, key, draft, 1000);
    expect(readReviewDraft(store, key, 1000)).toEqual(draft);
    expect(readReviewDraft(store, reviewDraftKey("two", "row"), 1000)).toBeNull();
    expect(readReviewDraft(store, key, 2000)).toBeNull();
    expect(store.length).toBe(0);
    store.setItem(key, "invalid");
    expect(readReviewDraft(store, key, 1000)).toBeNull();
    expect(() => saveReviewDraft(store, key, draft, 3000)).toThrow();
  });
});
