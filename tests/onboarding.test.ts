import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyCommand, reviewedRows, workspaceView } from "@/application/workbench";
import { reconcile } from "@/domain/reconcile";
import { seedWorkspace } from "@/domain/seed";
import { createProfileSnapshot } from "@/domain/onboarding";

const now = "2026-08-31T09:00:00.000Z";
const sample = readFileSync(new URL("../public/samples/orders.csv", import.meta.url), "utf8");

describe("versioned onboarding profiles", () => {
  it("keeps the existing K-Beauty baseline while exposing two reusable templates", () => {
    const view = workspaceView(seedWorkspace(now));
    expect(view.profile).toMatchObject({
      templateId: "lumiere-beauty-v1",
      brandName: "LUMIÈRE",
      version: 1,
    });
    expect(view.orders).toHaveLength(128);
    expect(view.availableProfiles.map((profile) => profile.templateId)).toEqual([
      "lumiere-beauty-v1",
      "morrow-food-v1",
    ]);
  });

  it("runs a second synthetic brand with its own channel and fee policy", () => {
    const workspace = seedWorkspace(now, { templateId: "morrow-food-v1" });
    const profile = workspace.profile!;
    const rows = reconcile(
      workspace.orders,
      workspace.settlements,
      workspace.asOf,
      profile.policy.feeBps,
    );
    expect(workspace.orders).toHaveLength(96);
    expect(new Set(workspace.orders.map((order) => order.channel))).toEqual(
      new Set(["d2c", "coupang"]),
    );
    expect(rows).toHaveLength(96);
    expect(rows.filter((row) => row.kind !== "matched")).toHaveLength(8);
    expect(profile.policy.feeBps).toMatchObject({ d2c: 290, coupang: 720 });
  });

  it("clones configuration without sharing mutable policy state", () => {
    const first = createProfileSnapshot("morrow-food-v1", "가상 푸드 브랜드 A");
    const second = createProfileSnapshot("morrow-food-v1", "가상 푸드 브랜드 B");
    first.policy.feeBps.d2c = 999;
    expect(first.clonedFrom).toBe("morrow-food-v1");
    expect(second.policy.feeBps.d2c).toBe(290);
    expect(second.brandName).toBe("가상 푸드 브랜드 B");
  });

  it("invalidates an approval fingerprint when the active fee policy changes", () => {
    const workspace = seedWorkspace(now);
    const feeRow = reviewedRows(workspace).find((row) => row.kind === "fee")!;
    const approved = applyCommand(workspace, {
      action: "resolve",
      expectedVersion: workspace.version,
      rowKey: feeRow.key,
      disposition: "accepted_variance",
      note: "가상 계약 요율과 정산 자료를 다시 확인했습니다.",
      evidence: "SYNTHETIC-CONTRACT",
    });
    approved.profile!.policy.feeBps[feeRow.channel] += 10;
    expect(reviewedRows(approved).find((row) => row.key === feeRow.key)?.resolution).toBeNull();
  });

  it("stores a validated column mapping in the same aggregate command", () => {
    const workspace = seedWorkspace(now);
    const mapping = {
      order_id: "주문번호",
      channel: "판매채널",
      date: "주문일자",
      gross: "결제금액",
      refund: "환불금액",
    };
    const imported = applyCommand(
      workspace,
      {
        action: "import",
        expectedVersion: workspace.version,
        kind: "orders",
        filename: "profile_mapping.csv",
        csv: sample,
        mapping,
        saveMapping: true,
      },
      now,
    );
    expect(imported.profile?.mappings.orders).toEqual(mapping);
    expect(imported.profile?.mappings.updatedAt).toBe(now);
    expect(imported.lastRunAt).toBeNull();
  });
});
