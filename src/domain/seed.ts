import {
  AS_OF,
  CHANNELS,
  FEE_BPS,
  PERIOD,
  RULE_VERSION,
  feeFor,
  type Order,
  type Settlement,
  type Workspace,
} from "./model";
import { digest } from "./canonical";
import { appendEvent } from "./audit";

export function seedWorkspace(now = new Date().toISOString()): Workspace {
  const orders: Order[] = [];
  const settlements: Settlement[] = [];
  for (let i = 1; i <= 128; i++) {
    const channel = CHANNELS[(i - 1) % 3];
    const date = `2026-08-${String(1 + Math.floor(((i - 1) * 30) / 128)).padStart(2, "0")}`;
    const gross = 39_000 + ((i * 137) % 31) * 6_000 + (i % 5) * 2_000;
    const refund = i % 17 === 0 ? 15_000 : 0;
    const id = `LM-${String(2608000 + i)}`;
    orders.push({ id, channel, date, gross, refund, sourceId: "SRC-ORD-01" });
    if (i === 12 || i === 63) continue;
    const settledRefund = i === 34 ? 0 : refund;
    let fee: number = feeFor(gross - settledRefund, FEE_BPS[channel]);
    if (i === 22 || i === 80) fee += i === 22 ? 2_400 : 1_200;
    const settlement: Settlement = {
      id: `ST-${String(2608000 + i)}`,
      orderId: id,
      channel,
      gross,
      refund: settledRefund,
      fee,
      net: gross - settledRefund - fee,
      dueDate: i === 127 || i === 128 ? "2026-09-02" : "2026-08-31",
      paidDate: i === 127 || i === 128 ? null : "2026-08-31",
      sourceId: `SRC-SET-${channel.toUpperCase()}`,
    };
    settlements.push(settlement);
    if (i === 45) settlements.push({ ...settlement });
  }
  const sources = [
    {
      id: "SRC-ORD-01",
      name: "lumiere_orders_202608.csv",
      kind: "orders" as const,
      rows: orders.length,
      digest: digest(orders),
      importedAt: now,
    },
    ...CHANNELS.map((channel) => {
      const entries = settlements.filter((settlement) => settlement.channel === channel);
      return {
        id: `SRC-SET-${channel.toUpperCase()}`,
        name: `${channel}_settlements_202608.csv`,
        kind: "settlements" as const,
        rows: entries.length,
        digest: digest(entries),
        importedAt: now,
      };
    }),
  ];
  const workspace: Workspace = {
    version: 1,
    period: PERIOD,
    asOf: AS_OF,
    status: "review",
    orders,
    settlements,
    sources,
    resolutions: {},
    events: [],
    lastRunAt: now,
    close: null,
    createdAt: now,
  };
  appendEvent(workspace, {
    type: "seeded",
    actor: "시스템",
    at: now,
    detail: "가상 브랜드 LUMIÈRE의 주문 128건과 3개 채널 정산 자료를 수집했습니다.",
  });
  appendEvent(workspace, {
    type: "reconciled",
    actor: "규칙 엔진",
    at: now,
    detail: `${RULE_VERSION} 규칙으로 최초 대사를 실행했습니다. 금액은 원 단위 정수로 검증합니다.`,
  });
  return workspace;
}
