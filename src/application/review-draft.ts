import { DomainError, ISSUE_LABELS, type Workspace } from "@/domain/model";
import { describeReconciliation } from "@/domain/review-copy";
import type { ReviewDraftContent } from "@/domain/review-draft";
import { reviewedRows } from "./workbench";

export interface ReviewEvidencePacket {
  synthetic: true;
  rowKey: string;
  orderId: string;
  channel: string;
  kind: string;
  issueLabel: string;
  explanation: string;
  amounts: {
    gross: number;
    refund: number;
    expectedFee: number;
    actualFee: number;
    expectedNet: number;
    actualNet: number;
    delta: number;
  };
  dates: { orderDate: string; dueDate: string | null; paidDate: string | null };
  sourceFiles: Array<{ id: string; name: string; kind: string; digest: string }>;
  sourceRows: Array<{
    id: string;
    sourceId: string;
    net: number;
    fee: number;
    dueDate: string;
    paidDate: string | null;
  }>;
  allowedCitationIds: string[];
}

export function buildReviewEvidence(workspace: Workspace, rowKey: string): ReviewEvidencePacket {
  const row = reviewedRows(workspace).find((candidate) => candidate.key === rowKey);
  if (!row || row.kind === "matched" || row.resolution)
    throw new DomainError(
      "INVALID_DRAFT_TARGET",
      "AI 초안을 만들 수 있는 미검토 거래를 찾지 못했습니다.",
      404,
    );
  const sourceFiles = workspace.sources
    .filter((source) => row.sources.includes(source.id))
    .map(({ id, name, kind, digest }) => ({ id, name, kind, digest }));
  const sourceRows = workspace.settlements
    .filter((entry) => entry.channel === row.channel && entry.orderId === row.orderId)
    .map(({ id, sourceId, net, fee, dueDate, paidDate }) => ({
      id,
      sourceId,
      net,
      fee,
      dueDate,
      paidDate,
    }));
  const allowedCitationIds = [...new Set([...row.sources, ...sourceRows.map((entry) => entry.id)])];
  return {
    synthetic: true,
    rowKey: row.key,
    orderId: row.orderId,
    channel: row.channel,
    kind: row.kind,
    issueLabel: ISSUE_LABELS[row.kind],
    explanation: describeReconciliation(row),
    amounts: {
      gross: row.gross,
      refund: row.refund,
      expectedFee: row.expectedFee,
      actualFee: row.actualFee,
      expectedNet: row.expectedNet,
      actualNet: row.actualNet,
      delta: row.delta,
    },
    dates: { orderDate: row.date, dueDate: row.dueDate, paidDate: row.paidDate },
    sourceFiles,
    sourceRows,
    allowedCitationIds,
  };
}

export function ruleBasedReviewDraft(packet: ReviewEvidencePacket): ReviewDraftContent {
  const citations = packet.allowedCitationIds.slice(0, 4);
  const evidenceReference = citations.join(" · ");
  return {
    summary: `${packet.issueLabel} 거래입니다. 저장된 원본 자료와 금액 차이를 확인한 뒤 검토 결과를 기록하세요.`,
    note: `${packet.issueLabel} 거래로 확인했습니다. ${packet.explanation} 원본 자료 ${evidenceReference}를 확인했으며, 이 기록은 원본 금액을 변경하거나 마감을 자동 승인하지 않습니다.`,
    evidenceReference,
    checks: [
      "연결된 주문·정산 자료의 주문번호가 같은지 확인",
      "예상 정산액과 자료상 정산액의 차이 확인",
      "선택한 처리 결과가 거래 유형에 맞는지 최종 확인",
    ],
    citations,
  };
}
