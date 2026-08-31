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

const revision = { expectedVersion: z.number().int().positive() };
export const commandSchema = z.discriminatedUnion("action", [
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
    })
    .strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export type ReviewedRow = ReconciliationRow & { resolution: Resolution | null };

export function reviewedRows(workspace: Workspace): ReviewedRow[] {
  return reconcile(workspace.orders, workspace.settlements, workspace.asOf).map((row) => {
    const resolution = workspace.resolutions[row.key];
    return { ...row, resolution: resolution?.fingerprint === digest(row) ? resolution : null };
  });
}
export function workspaceView(workspace: Workspace) {
  const rows = reviewedRows(workspace);
  const issues = rows.filter((row) => row.kind !== "matched");
  return {
    ...workspace,
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
    ruleVersion: RULE_VERSION,
    sandbox: true,
  };
}
export type WorkspaceView = ReturnType<typeof workspaceView>;

export function applyCommand(
  current: Workspace,
  command: Command,
  now = new Date().toISOString(),
): Workspace {
  if (current.version !== command.expectedVersion)
    throw new DomainError(
      "VERSION_CONFLICT",
      "다른 요청이 데이터를 변경했습니다. 새로고침 후 다시 시도하세요.",
      409,
    );
  if (current.status === "closed")
    throw new DomainError(
      "CLOSE_LOCKED",
      "확정된 마감은 수정할 수 없습니다. 새로운 데모 세션에서 시작하세요.",
      409,
    );
  if (!verifyAudit(current.events))
    throw new DomainError("AUDIT_CORRUPTED", "감사 기록 검증에 실패하여 변경을 중단했습니다.", 409);
  const workspace = structuredClone(current);
  const actor = "데모 검토자";
  if (command.action === "import") {
    const fileDigest = digest(command.csv.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"));
    if (workspace.sources.some((source) => source.digest === fileDigest))
      throw new DomainError(
        "ALREADY_IMPORTED",
        "동일한 내용의 파일이 이미 반영되어 있습니다. 중복 반영하지 않았습니다.",
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
    );
    if (
      workspace.orders.length + parsed.orders.length > 500 ||
      workspace.settlements.length + parsed.settlements.length > 1_000
    )
      throw new DomainError("ROW_LIMIT", "데모는 주문 500건·정산 1,000행으로 제한됩니다.");
    workspace.orders.push(...parsed.orders);
    workspace.settlements.push(...parsed.settlements);
    reconcile(workspace.orders, workspace.settlements, workspace.asOf);
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
    appendEvent(workspace, {
      type: "imported",
      actor,
      at: now,
      detail: `${command.filename} · ${parsed.count}행 반영. SHA-256 ${fileDigest.slice(0, 12)}…`,
    });
  } else if (command.action === "reconcile") {
    const rows = reconcile(workspace.orders, workspace.settlements, workspace.asOf);
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
    const row = reconcile(workspace.orders, workspace.settlements, workspace.asOf).find(
      (entry) => entry.key === command.rowKey,
    );
    if (!row || row.kind === "matched")
      throw new DomainError("INVALID_ISSUE", "검토 가능한 예외 거래를 찾을 수 없습니다.");
    if (row.kind === "timing" && command.disposition !== "carry_forward")
      throw new DomainError(
        "INVALID_DISPOSITION",
        "입금 시차는 근거 확인 후 이월 승인만 가능합니다.",
      );
    if (row.kind === "duplicate" && command.disposition !== "exclude_duplicate")
      throw new DomainError("INVALID_DISPOSITION", "중복 정산은 중복 제외 검토만 가능합니다.");
    if (
      row.kind !== "timing" &&
      row.kind !== "duplicate" &&
      command.disposition !== "accepted_variance"
    )
      throw new DomainError("INVALID_DISPOSITION", "금액 차이는 차이 승인으로 검토하세요.");
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
        `미해결 차이 ${view.summary.unresolved}건이 남아 있어 마감을 확정할 수 없습니다.`,
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
      inputs: {
        orders: workspace.orders,
        settlements: workspace.settlements,
        asOf: workspace.asOf,
      },
      rows: reconcile(workspace.orders, workspace.settlements, workspace.asOf),
      resolutions: view.rows.flatMap((row) => (row.resolution ? [row.resolution] : [])),
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
      ? `${issues.length}건을 확인하면 이번 달 마감을 준비할 수 있어요.`
      : "모든 예외 거래의 검토가 완료되었어요.",
    summary: `원본 ${workspace.sources.length}개 파일과 ${RULE_VERSION}의 대사 결과를 기준으로 작성했습니다. 금액 차이는 상계하지 않고 절댓값 합계로 확인합니다.`,
    steps: issues.slice(0, 4).map((row) => ({
      rowKey: row.key,
      orderId: row.orderId,
      kind: row.kind,
      explanation: row.explanation,
      evidence: row.sources,
      delta: row.delta,
    })),
    guardrail:
      "규칙 기반 분석입니다. AI가 생성한 결과가 아니며, 자동 승인·송금·회계 전표 생성은 수행하지 않습니다.",
  };
}
