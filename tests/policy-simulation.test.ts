import { describe, expect, it } from "vitest";
import { createDemoWorkspace } from "@/application/showcase";
import { applyCommand, reviewedRows } from "@/application/workbench";
import { simulatePolicy } from "@/application/policy-simulation";
import { digest } from "@/domain/canonical";

describe("policy simulation review impact", () => {
  it("includes invalidated reviews when rounding keeps the fee and classification unchanged", () => {
    const at = "2026-08-31T09:00:00.000Z";
    let workspace = createDemoWorkspace(at);
    workspace = applyCommand(
      workspace,
      {
        action: "import",
        expectedVersion: workspace.version,
        kind: "orders",
        filename: "small-orders.csv",
        csv: "order_id,channel,date,gross,refund\nSMALL-1,d2c,2026-08-01,1,0",
      },
      at,
    );
    workspace = applyCommand(
      workspace,
      {
        action: "import",
        expectedVersion: workspace.version,
        kind: "settlements",
        filename: "small-settlements.csv",
        csv: "settlement_id,order_id,channel,gross,refund,fee,net,due_date,paid_date\nSMALL-A,SMALL-1,d2c,1,0,1,0,2026-08-31,2026-08-31",
      },
      at,
    );
    workspace = applyCommand(
      workspace,
      { action: "reconcile", expectedVersion: workspace.version },
      at,
    );
    workspace = applyCommand(
      workspace,
      {
        action: "resolve",
        expectedVersion: workspace.version,
        rowKey: "d2c:SMALL-1",
        disposition: "accepted_variance",
        note: "합성 소액 주문의 수수료 차이를 확인했습니다.",
        evidence: "SYNTHETIC-SMALL-FEE",
      },
      at,
    );
    const original = digest(workspace);
    const approval = structuredClone(workspace.resolutions["d2c:SMALL-1"]);
    const feeBps = { ...workspace.profile!.policy.feeBps, d2c: 331 };
    const result = simulatePolicy(workspace, { expectedVersion: workspace.version, feeBps });

    expect(result.changes.find((row) => row.rowKey === "d2c:SMALL-1")).toMatchObject({
      beforeFee: 0,
      afterFee: 0,
      beforeKind: "fee",
      afterKind: "fee",
      needsReview: true,
    });
    expect(result.changes.filter((row) => row.needsReview)).toHaveLength(1);
    expect(digest(workspace)).toBe(original);

    const applied = applyCommand(
      workspace,
      {
        action: "apply_policy",
        expectedVersion: workspace.version,
        period: workspace.period,
        feeBps,
        note: "합성 계약의 수수료율 변경을 확인했습니다.",
        evidence: "SYNTHETIC-POLICY",
      },
      at,
    );
    expect(reviewedRows(applied).find((row) => row.key === "d2c:SMALL-1")?.resolution).toBeNull();
    expect(applied.resolutions["d2c:SMALL-1"]).toEqual({
      ...approval,
      invalidatedByPolicy: true,
    });
  });
});
