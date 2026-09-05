import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  commandSchema,
  reviewedRows,
  workspaceView,
  type Command,
} from "@/application/workbench";
import { createDemoWorkspace } from "@/application/showcase";
import { simulatePolicy } from "@/application/policy-simulation";
import { followupEvidence } from "@/domain/followup";
import { inspectPackage } from "@/application/package-inspection";
import { buildReconciliationCsv } from "@/application/export";
import type { Workspace } from "@/domain/model";

const at = "2026-09-05T00:00:00.000Z";
const policy = (workspace: Workspace): Extract<Command, { action: "apply_policy" }> => ({
  action: "apply_policy",
  expectedVersion: workspace.version,
  period: workspace.period,
  feeBps: { ...workspace.profile!.policy.feeBps, d2c: 400 },
  note: "합성 계약의 월별 요율 변경을 확인했습니다.",
  evidence: "SYNTHETIC-POLICY",
});
function setup() {
  const source = createDemoWorkspace(at, { showcase: "completed", period: "2026-08" });
  let current = createDemoWorkspace(at, { period: "2026-09" });
  const review = source.close!.resolutions.find((entry) => entry.disposition === "carry_forward")!;
  const row = source.close!.rows.find((entry) => entry.key === review.rowKey)!;
  current = applyCommand(
    current,
    {
      action: "import",
      expectedVersion: current.version,
      kind: "settlements",
      filename: "followup.csv",
      csv: `settlement_id,order_id,channel,gross,refund,fee,net,due_date,paid_date\nFOLLOW-1,${row.orderId},${row.channel},${row.gross},${row.refund},${row.actualFee},${row.actualNet},2026-09-01,2026-09-01`,
    },
    at,
  );
  current = applyCommand(current, { action: "reconcile", expectedVersion: current.version }, at);
  const command: Extract<Command, { action: "record_followup" }> = {
    action: "record_followup",
    expectedVersion: current.version,
    sourceId: randomUUID(),
    sourceHash: source.close!.hash,
    rowKey: row.key,
    settlementIds: ["FOLLOW-1"],
    status: "evidence_reviewed",
    note: "이번 달 합성 정산 근거를 대조하여 기록했습니다.",
    evidence: "SYNTHETIC-FOLLOWUP",
  };
  return { source, current, command, row };
}
describe("monthly policy application", () => {
  it("applies exactly the simulated amounts without modifying source rows", () => {
    const current = createDemoWorkspace(at);
    const original = structuredClone(current);
    const command = policy(current);
    const preview = simulatePolicy(current, {
      expectedVersion: current.version,
      feeBps: command.feeBps,
    });
    const next = applyCommand(current, command, at);
    expect(workspaceView(next).summary).toEqual(preview.after);
    expect(next.orders).toEqual(current.orders);
    expect(next.settlements).toEqual(current.settlements);
    expect(current).toEqual(original);
    expect(next.status).toBe("open");
    expect(next.lastRunAt).toBeNull();
    expect(next.profile!.version).toBe(current.profile!.version + 1);
    expect(next.events.at(-1)?.type).toBe("policy_updated");
    expect(() => applyCommand(next, { action: "close", expectedVersion: next.version })).toThrow(
      /대사/,
    );
  });
  it("requires new approval after reverting a policy and retains the old note", () => {
    let current = createDemoWorkspace(at);
    const row = reviewedRows(current).find(
      (entry) => entry.kind === "fee" && entry.channel === "d2c",
    )!;
    current = applyCommand(
      current,
      {
        action: "resolve",
        expectedVersion: current.version,
        rowKey: row.key,
        disposition: "accepted_variance",
        note: "정책 변경 전 합성 근거 확인 메모입니다.",
        evidence: "SYNTHETIC-BEFORE",
      },
      at,
    );
    const originalNote = current.resolutions[row.key].note;
    const fees = structuredClone(current.profile!.policy.feeBps);
    let next = applyCommand(current, policy(current), at);
    expect(reviewedRows(next).find((entry) => entry.key === row.key)?.resolution).toBeNull();
    next = applyCommand(next, { ...policy(next), feeBps: fees }, at);
    next = applyCommand(next, { action: "reconcile", expectedVersion: next.version }, at);
    expect(reviewedRows(next).find((entry) => entry.key === row.key)?.resolution).toBeNull();
    expect(next.resolutions[row.key].note).toBe(originalNote);
  });
  it("rejects closed work, wrong month, unchanged fees and inactive channels", () => {
    const closed = createDemoWorkspace(at, { showcase: "completed" });
    expect(() => applyCommand(closed, policy(closed))).toThrow(/마감/);
    const current = createDemoWorkspace(at);
    expect(() => applyCommand(current, { ...policy(current), period: "2026-09" })).toThrow(
      /현재 마감 월/,
    );
    expect(() =>
      applyCommand(current, { ...policy(current), feeBps: current.profile!.policy.feeBps }),
    ).toThrow(/같은 요율/);
    const food = createDemoWorkspace(at, { templateId: "morrow-food-v1" });
    expect(() =>
      applyCommand(food, { ...policy(food), feeBps: { ...food.profile!.policy.feeBps, naver: 1 } }),
    ).toThrow(/사용하지 않는/);
    expect(
      commandSchema.safeParse({
        ...policy(current),
        evidence: "",
        feeBps: { d2c: -1, naver: 385, coupang: 880 },
      }).success,
    ).toBe(false);
  });
  it("verifies old packages unchanged and exports their original version", () => {
    const legacy = JSON.parse(readFileSync("fixtures/legacy-v1.1-closed-package.json", "utf8"));
    expect(inspectPackage(legacy).valid).toBe(true);
    expect(legacy.snapshot.hash).toBe(
      "2402866290bef63d3b448df4864a5e749baafb31fe5394e0c0bbdb5adbe6c874",
    );
    const current = createDemoWorkspace(at, { showcase: "completed" });
    current.close = legacy.snapshot;
    expect(buildReconciliationCsv(workspaceView(current))).toContain("krw-net-v1.1.0");
    expect(
      inspectPackage(JSON.parse(readFileSync("fixtures/policy-closed-package.json", "utf8"))).valid,
    ).toBe(true);
  });
});
describe("carry-forward evidence tracking", () => {
  it("records evidence without changing either source money or approvals", () => {
    const { source, current, command, row } = setup();
    const before = structuredClone(source);
    const next = applyCommand(current, command, at, { followupSource: source });
    expect(source).toEqual(before);
    expect(next.orders).toEqual(current.orders);
    expect(next.settlements).toEqual(current.settlements);
    expect(next.resolutions).toEqual(current.resolutions);
    expect(followupEvidence(next, source, command.sourceHash, row.key).record?.status).toBe(
      "evidence_reviewed",
    );
    expect(workspaceView(next).summary).toEqual(workspaceView(current).summary);
  });
  it("requires the server source, matching brand, prior month and valid selection", () => {
    const { source, current, command } = setup();
    expect(() => applyCommand(current, command)).toThrow(/서버/);
    expect(() =>
      applyCommand(current, { ...command, sourceHash: "a".repeat(64) }, at, {
        followupSource: source,
      }),
    ).toThrow(/이전 마감/);
    expect(() =>
      applyCommand(current, { ...command, settlementIds: ["OTHER"] }, at, {
        followupSource: source,
      }),
    ).toThrow(/연결되지 않은/);
    expect(() =>
      applyCommand(current, { ...command, settlementIds: ["FOLLOW-1", "FOLLOW-1"] }, at, {
        followupSource: source,
      }),
    ).toThrow(/중복/);
    expect(() =>
      applyCommand(current, { ...command, settlementIds: [] }, at, { followupSource: source }),
    ).toThrow(/정산 근거/);
    const wrong = structuredClone(current);
    wrong.profile!.id = "other";
    expect(() => applyCommand(wrong, command, at, { followupSource: source })).toThrow(
      /같은 프로필/,
    );
    const same = structuredClone(current);
    same.period = source.period;
    expect(() => applyCommand(same, command, at, { followupSource: source })).toThrow(/이전 월/);
  });
  it("invalidates the displayed status when the matching evidence changes", () => {
    const { source, current, command, row } = setup();
    const next = applyCommand(current, command, at, { followupSource: source });
    next.settlements.push({
      ...next.settlements.find((entry) => entry.id === "FOLLOW-1")!,
      id: "FOLLOW-2",
    });
    const result = followupEvidence(next, source, command.sourceHash, row.key);
    expect(result.record).toBeNull();
    expect(result.stale).toBe(true);
    expect(next.followups?.[result.key].note).toBe(command.note);
  });
  it("can record waiting without evidence but never treats it as approval", () => {
    const { source, current, command } = setup();
    const next = applyCommand(current, { ...command, status: "waiting", settlementIds: [] }, at, {
      followupSource: source,
    });
    expect(Object.values(next.followups!)[0].status).toBe("waiting");
    expect(Object.keys(next.resolutions)).toHaveLength(0);
  });
});
