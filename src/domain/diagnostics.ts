import { sumWon, type Order, type Settlement, type ReconciliationRow } from "./model";

// Display-only checks: never add these fields to persisted rows or approval fingerprints.
export function diagnoseRow(
  row: ReconciliationRow,
  orders: Order[],
  settlements: Settlement[],
  asOf: string,
) {
  const order = orders.find((entry) => entry.channel === row.channel && entry.id === row.orderId);
  const entries = settlements.filter(
    (entry) => entry.channel === row.channel && entry.orderId === row.orderId,
  );
  const duplicate = entries.some(
    (entry) =>
      settlements.filter((other) => other.channel === entry.channel && other.id === entry.id)
        .length > 1,
  );
  return [
    {
      code: "order",
      label: "주문 원본",
      problem: !order,
      detail: order ? "주문 자료 연결됨" : "연결할 주문 없음",
    },
    {
      code: "settlement",
      label: "정산 원본",
      problem: !entries.length,
      detail: `연결된 정산 ${entries.length}행`,
    },
    {
      code: "duplicate",
      label: "정산번호 중복",
      problem: duplicate,
      detail: duplicate ? "같은 채널에 반복된 정산번호가 있음" : "반복된 정산번호 없음",
    },
    ...(order && entries.length
      ? [
          {
            code: "gross",
            label: "총액",
            problem: sumWon(entries.map((entry) => entry.gross)) !== order.gross,
            detail: "주문 총액과 연결 정산 총액 비교",
          },
          {
            code: "refund",
            label: "환불액",
            problem: sumWon(entries.map((entry) => entry.refund)) !== order.refund,
            detail: "주문 환불액과 연결 정산 환불액 비교",
          },
          {
            code: "fee",
            label: "수수료",
            problem: row.actualFee !== row.expectedFee,
            detail: "현재 프로필의 예상 수수료와 비교",
          },
          {
            code: "net",
            label: "정산액",
            problem: row.actualNet !== row.expectedNet,
            detail: "예상 정산액과 자료상 정산액 비교",
          },
        ]
      : []),
    ...(entries.length
      ? [
          {
            code: "identity",
            label: "정산 행 계산",
            problem: entries.some((entry) => entry.gross - entry.refund - entry.fee !== entry.net),
            detail: "총액 - 환불액 - 수수료 = 정산액",
          },
          {
            code: "timing",
            label: "입금일",
            problem: entries.some((entry) => !entry.paidDate || entry.paidDate > asOf),
            detail: `자료상 입금일을 마감 기준일 ${asOf}와 비교`,
          },
        ]
      : []),
  ];
}
