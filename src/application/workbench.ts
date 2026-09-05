import { z } from "zod";
import {
  DomainError,
  RULE_VERSION,
  sumWon,
  type Workspace,
  type ReconciliationRow,
  type Resolution,
  type CloseSnapshot,
} from "@/domain/model";
import { reconcile } from "@/domain/reconcile";
import { appendEvent, verifyAudit } from "@/domain/audit";
import { digest } from "@/domain/canonical";
import { importCsv } from "@/domain/csv";
import { describeReconciliation } from "@/domain/review-copy";
import { createProfileSnapshot, profileCatalog } from "@/domain/onboarding";
import { feePolicySchema, policyCandidate } from "./policy-change";
import { followupEvidence } from "@/domain/followup";

const revision = { expectedVersion: z.number().int().positive() };
export const commandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("apply_policy"),
      ...revision,
      period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      feeBps: feePolicySchema,
      note: z.string().trim().min(10).max(600),
      evidence: z.string().trim().min(5).max(200),
    })
    .strict(),
  z
    .object({
      action: z.literal("record_followup"),
      ...revision,
      sourceId: z.string().uuid(),
      sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
      rowKey: z.string().min(1).max(100),
      settlementIds: z.array(z.string().min(1).max(100)).max(1000),
      status: z.enum(["waiting", "evidence_reviewed"]),
      note: z.string().trim().min(10).max(600),
      evidence: z.string().trim().min(5).max(200),
    })
    .strict(),
  z.object({ action: z.literal("reconcile"), ...revision }).strict(),
  z
    .object({
      action: z.literal("resolve"),
      ...revision,
      rowKey: z.string().min(1).max(100),
      disposition: z.enum(["accepted_variance", "carry_forward", "exclude_duplicate"]),
      note: z.string().trim().min(10).max(600),
      evidence: z.string().trim().min(5).max(200),
    })
    .strict(),
  z.object({ action: z.literal("close"), ...revision }).strict(),
  z
    .object({
      action: z.literal("import"),
      ...revision,
      kind: z.enum(["orders", "settlements"]),
      filename: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[a-zA-Z0-9가-힣._ ()-]+\.csv$/i),
      csv: z.string().min(1).max(256_000),
      mapping: z.record(z.string().max(50), z.string().max(100)).optional(),
      saveMapping: z.boolean().optional(),
    })
    .strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export type ReviewedRow = ReconciliationRow & { resolution: Resolution | null };

export function workspaceProfile(workspace: Workspace) {
  return workspace.profile ?? createProfileSnapshot();
}

function reconcileWorkspace(workspace: Workspace) {
  const profile = workspaceProfile(workspace);
  return reconcile(workspace.orders, workspace.settlements, workspace.asOf, profile.policy.feeBps);
}

export function reviewedRows(workspace: Workspace): ReviewedRow[] {
  return reconcileWorkspace(workspace).map((row) => {
    const resolution = workspace.resolutions[row.key];
    return {
      ...row,
      resolution:
        !resolution?.invalidatedByPolicy && resolution?.fingerprint === digest(row)
          ? resolution
          : null,
    };
  });
}
export function workspaceView(workspace: Workspace) {
  const profile = workspaceProfile(workspace);
  const rows = reviewedRows(workspace);
  const issues = rows.filter((row) => row.kind !== "matched");
  return {
    version: workspace.version,
    period: workspace.period,
    asOf: workspace.asOf,
    status: workspace.status,
    orders: workspace.orders,
    settlements: workspace.settlements,
    sources: workspace.sources,
    resolutions: workspace.resolutions,
    events: workspace.events,
    lastRunAt: workspace.lastRunAt,
    createdAt: workspace.createdAt,
    draftScope:
      workspace.draftScope ?? digest({ createdAt: workspace.createdAt, profile: profile.id }),
    reviewFingerprints: Object.fromEntries(
      issues.map(({ resolution, ...row }) => {
        void resolution;
        return [row.key, digest(row)];
      }),
    ),
    demoMode: workspace.demoMode,
    policyChanges: workspace.policyChanges ?? [],
    // Full evidence stays in storage and is served only by the package export.
    close: workspace.close
      ? {
          hash: workspace.close.hash,
          closedAt: workspace.close.closedAt,
          closedBy: workspace.close.closedBy,
        }
      : null,
    profile,
    availableProfiles: profileCatalog(),
    rows,
    summary: {
      gross: sumWon(workspace.orders.map((order) => order.gross)),
      refunds: sumWon(workspace.orders.map((order) => order.refund)),
      expectedNet: sumWon(rows.map((row) => row.expectedNet)),
      actualNet: sumWon(rows.map((row) => row.actualNet)),
      delta: sumWon(rows.map((row) => row.delta)),
      exposure: sumWon(issues.map((row) => Math.abs(row.delta))),
      total: rows.length,
      matched: rows.length - issues.length,
      issues: issues.length,
      unresolved: issues.filter((row) => !row.resolution).length,
      reviewed: issues.filter((row) => row.resolution).length,
      timing: issues.filter((row) => row.kind === "timing").length,
    },
    auditValid: verifyAudit(workspace.events),
    ruleVersion: workspace.close?.ruleVersion ?? RULE_VERSION,
    sandbox: true,
  };
}
export type WorkspaceView = ReturnType<typeof workspaceView>;

export function applyCommand(
  current: Workspace,
  command: Command,
  now = new Date().toISOString(),
  context?: { followupSource: Workspace },
): Workspace {
  if (current.version !== command.expectedVersion)
    throw new DomainError(
      "VERSION_CONFLICT",
      "다른 요청으로 자료가 변경되었습니다. 최신 상태를 확인한 뒤 다시 시도하세요.",
      409,
    );
  if (current.status === "closed")
    throw new DomainError(
      "CLOSE_LOCKED",
      "마감이 확정되어 자료와 검토 기록을 수정할 수 없습니다. 새 데모를 시작하세요.",
      409,
    );
  if (!verifyAudit(current.events))
    throw new DomainError("AUDIT_CORRUPTED", "감사 기록 검증에 실패하여 변경을 중단했습니다.", 409);
  const workspace = structuredClone(current);
  workspace.profile ??= workspaceProfile(current);
  const actor = "데모 검토자";
  if (command.action === "apply_policy") {
    const candidate = policyCandidate(workspace, command.feeBps, command.period);
    workspaceView(candidate);
    const before = structuredClone(workspace.profile.policy.feeBps);
    workspace.profile.policy.feeBps = structuredClone(command.feeBps);
    const fingerprints = new Map(
      reconcileWorkspace(workspace).map((row) => [row.key, digest(row)]),
    );
    for (const resolution of Object.values(workspace.resolutions)) {
      if (fingerprints.get(resolution.rowKey) !== resolution.fingerprint)
        resolution.invalidatedByPolicy = true;
    }
    workspace.profile.version++;
    (workspace.policyChanges ??= []).push({
      version: workspace.profile.version,
      period: workspace.period,
      before,
      after: structuredClone(command.feeBps),
      note: command.note,
      evidence: command.evidence,
      at: now,
    });
    workspace.status = "open";
    workspace.lastRunAt = null;
    appendEvent(workspace, {
      type: "policy_updated",
      actor,
      at: now,
      detail: `${workspace.period} 정책 v${workspace.profile.version}: ${JSON.stringify(before)} -> ${JSON.stringify(command.feeBps)} / ${command.note} / 근거: ${command.evidence}`,
    });
  } else if (command.action === "record_followup") {
    if (!context?.followupSource)
      throw new DomainError(
        "INVALID_FOLLOWUP_SOURCE",
        "서버에서 확인한 이전 마감이 필요합니다.",
        409,
      );
    const evidence = followupEvidence(
      workspace,
      context.followupSource,
      command.sourceHash,
      command.rowKey,
    );
    const selected = evidence.settlements.filter((entry) =>
      command.settlementIds.includes(entry.id),
    );
    if (
      new Set(command.settlementIds).size !== command.settlementIds.length ||
      selected.length !== command.settlementIds.length ||
      new Set(selected.map((entry) => entry.id)).size !== selected.length
    )
      throw new DomainError(
        "INVALID_FOLLOWUP_EVIDENCE",
        "중복되거나 연결되지 않은 정산 근거가 포함되어 있습니다.",
      );
    if (command.status === "evidence_reviewed" && (!workspace.lastRunAt || !selected.length))
      throw new DomainError(
        "FOLLOWUP_REVIEW_REQUIRED",
        "최신 대사를 실행하고 연결할 정산 근거를 선택하세요.",
        409,
      );
    (workspace.followups ??= {})[evidence.key] = {
      sourceHash: command.sourceHash,
      sourcePeriod: context.followupSource.close!.period,
      rowKey: command.rowKey,
      settlementIds: command.settlementIds,
      status: command.status,
      note: command.note,
      evidence: command.evidence,
      fingerprint: evidence.fingerprint,
      at: now,
    };
    appendEvent(workspace, {
      type: "followup_recorded",
      actor,
      at: now,
      detail: `${command.sourceHash.slice(0, 16)} / ${command.rowKey} / ${command.status} / 정산 ${command.settlementIds.join(", ")} / ${command.note} / 근거: ${command.evidence}`,
    });
  } else if (command.action === "import") {
    const fileDigest = digest(command.csv.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"));
    if (workspace.sources.some((source) => source.digest === fileDigest))
      throw new DomainError(
        "ALREADY_IMPORTED",
        "같은 내용의 파일을 이미 가져왔습니다. 자료는 추가하지 않았습니다.",
        409,
      );
    if (workspace.sources.length >= 12)
      throw new DomainError("SOURCE_LIMIT", "데모에서는 최대 12개 파일을 가져올 수 있습니다.");
    const sourceId = `SRC-${fileDigest.slice(0, 12).toUpperCase()}`;
    const parsed = importCsv(
      command.csv,
      command.kind,
      command.mapping,
      sourceId,
      workspace.period,
      workspace.profile.policy.enabledChannels,
    );
    if (
      workspace.orders.length + parsed.orders.length > 500 ||
      workspace.settlements.length + parsed.settlements.length > 1_000
    )
      throw new DomainError(
        "ROW_LIMIT",
        "데모에 저장할 수 있는 자료는 주문 500건, 정산 1,000행까지입니다.",
      );
    workspace.orders.push(...parsed.orders);
    workspace.settlements.push(...parsed.settlements);
    // Validate the same bounded totals used by reads before the transaction commits.
    workspaceView(workspace);
    workspace.sources.push({
      id: sourceId,
      name: command.filename,
      kind: command.kind,
      rows: parsed.count,
      digest: fileDigest,
      importedAt: now,
    });
    workspace.status = "open";
    workspace.lastRunAt = null;
    if (command.saveMapping && command.mapping) {
      workspace.profile.mappings[command.kind] = structuredClone(command.mapping);
      workspace.profile.mappings.updatedAt = now;
    }
    appendEvent(workspace, {
      type: "imported",
      actor,
      at: now,
      detail: `${command.filename} · ${parsed.count}행 반영. SHA-256 ${fileDigest.slice(0, 12)}…`,
    });
  } else if (command.action === "reconcile") {
    const rows = reconcileWorkspace(workspace);
    workspace.status = "review";
    workspace.lastRunAt = now;
    appendEvent(workspace, {
      type: "reconciled",
      actor: "규칙 엔진",
      at: now,
      detail: `${rows.length}건 대사 완료 · 일치 ${rows.filter((row) => row.kind === "matched").length}건 · 확인 필요 ${rows.filter((row) => row.kind !== "matched").length}건 · ${RULE_VERSION}`,
    });
  } else if (command.action === "resolve") {
    if (!workspace.lastRunAt)
      throw new DomainError(
        "RECONCILE_REQUIRED",
        "자료 변경 후 대사를 다시 실행해야 검토할 수 있습니다.",
        409,
      );
    const row = reconcileWorkspace(workspace).find((entry) => entry.key === command.rowKey);
    if (!row || row.kind === "matched")
      throw new DomainError("INVALID_ISSUE", "검토 가능한 예외 거래를 찾을 수 없습니다.");
    if (row.kind === "timing" && command.disposition !== "carry_forward")
      throw new DomainError(
        "INVALID_DISPOSITION",
        "입금 확인이 필요한 거래는 근거를 확인한 뒤 '이월 검토 승인'으로 처리하세요.",
      );
    if (row.kind === "duplicate" && command.disposition !== "exclude_duplicate")
      throw new DomainError(
        "INVALID_DISPOSITION",
        "중복 정산은 근거를 확인한 뒤 '중복 확인 승인'으로 처리하세요.",
      );
    if (
      row.kind !== "timing" &&
      row.kind !== "duplicate" &&
      command.disposition !== "accepted_variance"
    )
      throw new DomainError(
        "INVALID_DISPOSITION",
        "이 거래는 사유와 증빙을 확인한 뒤 '차이 검토 승인'으로 처리하세요.",
      );
    workspace.resolutions[row.key] = {
      rowKey: row.key,
      disposition: command.disposition,
      note: command.note,
      evidence: command.evidence,
      actor,
      at: now,
      fingerprint: digest(row),
    };
    appendEvent(workspace, {
      type: "resolved",
      actor,
      at: now,
      detail: `${row.orderId} · ${command.disposition} · ${command.note} · 근거: ${command.evidence}`,
    });
  } else if (command.action === "close") {
    if (!workspace.lastRunAt)
      throw new DomainError(
        "RECONCILE_REQUIRED",
        "최신 자료로 대사를 실행한 뒤 마감할 수 있습니다.",
        409,
      );
    const view = workspaceView(workspace);
    if (!view.rows.length) throw new DomainError("EMPTY_CLOSE", "마감할 거래가 없습니다.");
    if (view.summary.unresolved)
      throw new DomainError(
        "UNRESOLVED_ISSUES",
        `아직 검토하지 않은 거래가 ${view.summary.unresolved}건 있습니다. 모두 검토한 뒤 마감을 확정하세요.`,
        409,
      );
    const body: Omit<CloseSnapshot, "hash"> = {
      period: workspace.period,
      ruleVersion: RULE_VERSION,
      closedAt: now,
      closedBy: actor,
      gross: view.summary.gross,
      refunds: view.summary.refunds,
      expectedNet: view.summary.expectedNet,
      actualNet: view.summary.actualNet,
      delta: view.summary.delta,
      rowCount: view.rows.length,
      reviewedCount: view.summary.reviewed,
      sources: workspace.sources.map(({ id, digest }) => ({ id, digest })),
      profile: structuredClone(workspace.profile),
      inputs: {
        orders: workspace.orders,
        settlements: workspace.settlements,
        asOf: workspace.asOf,
        feeBps: structuredClone(workspace.profile.policy.feeBps),
      },
      rows: reconcileWorkspace(workspace),
      resolutions: view.rows.flatMap((row) => (row.resolution ? [row.resolution] : [])),
      ...(workspace.policyChanges?.length
        ? { policyChanges: structuredClone(workspace.policyChanges) }
        : {}),
      ...(workspace.followups && Object.keys(workspace.followups).length
        ? { followups: structuredClone(workspace.followups) }
        : {}),
    };
    workspace.close = { ...body, hash: digest(body) };
    workspace.status = "closed";
    appendEvent(workspace, {
      type: "closed",
      actor,
      at: now,
      detail: `${workspace.period} 마감 확정 · ${view.summary.reviewed}건의 승인 근거 포함 · 스냅샷 ${workspace.close.hash.slice(0, 16)}…`,
    });
  }
  workspace.version++;
  return workspace;
}

export function explainIssues(workspace: Workspace) {
  const view = workspaceView(workspace);
  const issues = view.rows.filter((row) => row.kind !== "matched" && !row.resolution);
  return {
    mode: "deterministic" as const,
    title: issues.length
      ? `마감 전에 확인할 거래가 ${issues.length}건 남아 있습니다.`
      : "모든 예외 거래의 검토를 완료했습니다.",
    summary: `원본 파일 ${workspace.sources.length}개와 대사 규칙 ${RULE_VERSION}을 기준으로 정리했습니다. 차이 금액은 거래별 절댓값을 더해 표시하며, 실제 회수할 금액을 뜻하지 않습니다.`,
    steps: issues.slice(0, 4).map((row) => ({
      rowKey: row.key,
      orderId: row.orderId,
      kind: row.kind,
      explanation: describeReconciliation(row),
      evidence: row.sources,
      delta: row.delta,
    })),
    guardrail:
      "정해진 대사 규칙으로 작성한 안내이며 LLM을 호출하지 않습니다. 검토 승인은 사용자가 직접 해야 하며, 송금이나 회계 전표 생성 기능은 없습니다.",
  };
}
