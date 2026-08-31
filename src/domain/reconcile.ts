import {
  AS_OF,
  DomainError,
  FEE_BPS,
  feeFor,
  sumWon,
  won,
  type Order,
  type Settlement,
  type ReconciliationRow,
  type IssueKind,
} from "./model";

export function reconcile(
  orders: Order[],
  settlements: Settlement[],
  asOf = AS_OF,
): ReconciliationRow[] {
  const orderMap = new Map<string, Order>();
  for (const order of orders) {
    const key = `${order.channel}:${order.id}`;
    if (orderMap.has(key))
      throw new DomainError("DUPLICATE_ORDER", `같은 채널에 동일한 주문번호가 있습니다: ${key}`);
    orderMap.set(key, order);
  }
  const groups = new Map<string, Settlement[]>();
  const ids = new Map<string, number>();
  for (const settlement of settlements) {
    const key = `${settlement.channel}:${settlement.orderId}`;
    groups.set(key, [...(groups.get(key) ?? []), settlement]);
    const id = `${settlement.channel}:${settlement.id}`;
    ids.set(id, (ids.get(id) ?? 0) + 1);
  }
  const keys = new Set([...orderMap.keys(), ...groups.keys()]);
  return [...keys]
    .map((key): ReconciliationRow => {
      const order = orderMap.get(key);
      const entries = groups.get(key) ?? [];
      const channel = order?.channel ?? entries[0].channel;
      const gross = order?.gross ?? 0;
      const refund = order?.refund ?? 0;
      const expectedFee = feeFor(won(gross - refund), FEE_BPS[channel]);
      const expectedNet = won(gross - refund - expectedFee);
      const actualGross = sumWon(entries.map((entry) => entry.gross));
      const actualRefund = sumWon(entries.map((entry) => entry.refund));
      const actualFee = sumWon(entries.map((entry) => entry.fee));
      const actualNet = sumWon(entries.map((entry) => entry.net));
      const duplicate = entries.some((entry) => (ids.get(`${channel}:${entry.id}`) ?? 0) > 1);
      let kind: IssueKind = "matched";
      // These v1 explanations are part of persisted review fingerprints.
      // Use review-copy.ts for wording changes that do not change the calculation rules.
      let explanation = "주문 순매출과 정산액이 수수료 정책에 따라 원 단위까지 일치합니다.";
      if (duplicate) {
        kind = "duplicate";
        explanation =
          "같은 채널의 동일 정산 ID가 반복되었습니다. 중복 여부를 확인하기 전에는 합계에서 자동 제거하지 않습니다.";
      } else if (!order) {
        kind = "orphan";
        explanation = "정산 자료에는 존재하지만 해당 채널의 주문 원장에서 주문을 찾을 수 없습니다.";
      } else if (!entries.length) {
        kind = "missing";
        explanation =
          "주문은 수집되었지만 연결할 정산 행이 없습니다. 채널 정산 파일의 누락 여부를 확인하세요.";
      } else if (actualRefund !== refund) {
        kind = "refund";
        explanation = `주문 환불액 ${refund.toLocaleString("ko-KR")}원과 정산 환불액 ${actualRefund.toLocaleString("ko-KR")}원이 다릅니다. 환불 반영일과 부분 취소를 확인하세요.`;
      } else if (
        actualGross !== gross ||
        entries.some((entry) => entry.gross - entry.refund - entry.fee !== entry.net)
      ) {
        kind = "amount";
        explanation =
          "주문 총액 또는 정산 행의 금액 항등식(총액 − 환불 − 수수료 = 정산액)이 일치하지 않습니다.";
      } else if (actualFee !== expectedFee) {
        kind = "fee";
        explanation = `가상 계약 수수료 ${FEE_BPS[channel] / 100}%를 순매출에 적용한 예상 수수료와 ${Math.abs(actualFee - expectedFee).toLocaleString("ko-KR")}원 차이가 있습니다.`;
      } else if (actualNet !== expectedNet) {
        kind = "amount";
        explanation = "수수료 반영 후 예상 정산액과 실제 정산액이 일치하지 않습니다.";
      } else if (entries.some((entry) => !entry.paidDate || entry.paidDate > asOf)) {
        kind = "timing";
        explanation =
          "정산 금액은 일치하지만 기준일 현재 입금이 확인되지 않았습니다. 입금 예정일 확인 후 이월 승인할 수 있습니다.";
      }
      return {
        key,
        orderId: order?.id ?? entries[0].orderId,
        channel,
        date: order?.date ?? entries[0].dueDate,
        gross,
        refund,
        expectedFee,
        actualFee,
        expectedNet,
        actualNet,
        delta: won(actualNet - expectedNet),
        kind,
        explanation,
        sources: [
          ...new Set([
            ...(order ? [order.sourceId] : []),
            ...entries.map((entry) => entry.sourceId),
          ]),
        ],
        settlementIds: entries.map((entry) => entry.id),
        dueDate: entries.length
          ? entries
              .map((entry) => entry.dueDate)
              .sort()
              .at(-1)!
          : null,
        paidDate:
          entries.length && entries.every((entry) => entry.paidDate)
            ? entries
                .map((entry) => entry.paidDate!)
                .sort()
                .at(-1)!
            : null,
      };
    })
    .sort(
      (a, b) =>
        Number(a.kind === "matched") - Number(b.kind === "matched") ||
        Math.abs(b.delta) - Math.abs(a.delta) ||
        a.key.localeCompare(b.key),
    );
}
