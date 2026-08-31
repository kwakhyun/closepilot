import { FEE_BPS, type AuditEvent, type ReconciliationRow, type Resolution } from "./model";

export const REVIEW_ACTION_LABELS: Record<Resolution["disposition"], string> = {
  accepted_variance: "차이 검토 승인",
  carry_forward: "이월 검토 승인",
  exclude_duplicate: "중복 확인 승인",
};

// Display copy is separate from the explanation stored in v1 review fingerprints.
// Editing this copy must not invalidate existing approvals or closed packages.
export function describeReconciliation(row: ReconciliationRow): string {
  switch (row.kind) {
    case "matched":
      return "환불액과 수수료를 반영한 예상 정산액이 자료상 정산액과 원 단위까지 일치합니다.";
    case "missing":
      return "이 주문과 연결된 정산 내역이 없습니다. 해당 주문이 정산 파일에서 누락됐는지 확인하세요.";
    case "orphan":
      return "정산 내역과 연결할 주문을 찾을 수 없습니다. 주문번호와 판매 채널을 확인하세요.";
    case "duplicate":
      return "같은 채널에 동일한 정산번호가 두 번 이상 기록되어 있습니다. 원본 자료에서 중복 여부를 확인하세요. 검토를 승인해도 원본 행과 합계는 바뀌지 않습니다.";
    case "refund":
      return "주문 자료와 정산 자료의 환불액이 다릅니다. 부분 환불 여부와 환불 반영일을 확인하세요.";
    case "fee":
      return `환불 차감 후 금액에 데모 수수료율 ${FEE_BPS[row.channel] / 100}%를 적용했습니다. 자료상 수수료와 예상 수수료의 차이는 ${Math.abs(row.actualFee - row.expectedFee).toLocaleString("ko-KR")}원입니다.`;
    case "amount":
      return "주문 총액 또는 정산액 계산이 자료의 금액과 맞지 않습니다. 정산액이 총액에서 환불액과 수수료를 뺀 값인지 확인하세요.";
    case "timing":
      return "자료에 입금일이 없거나 마감 기준일 이후로 기록되어 있습니다. 입금 예정일과 이월 근거를 확인하세요. 은행 입금 내역을 조회한 결과는 아닙니다.";
  }
}

export function describeAuditEvent(event: Pick<AuditEvent, "type" | "detail">): string {
  if (event.type !== "resolved") return event.detail;
  return event.detail.replace(
    /^([^·]+) · (accepted_variance|carry_forward|exclude_duplicate) · /,
    (_, orderId: string, disposition: Resolution["disposition"]) =>
      `${orderId} · ${REVIEW_ACTION_LABELS[disposition]} · `,
  );
}
