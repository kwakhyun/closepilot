import {
  RULE_VERSION,
  feeFor,
  type Order,
  type Settlement,
  type Workspace,
  type OnboardingProfileSnapshot,
} from "./model";
import { digest } from "./canonical";
import { appendEvent } from "./audit";
import { createProfileSnapshot, DEFAULT_PROFILE_ID, onboardingTemplate } from "./onboarding";
import { monthEnd } from "./period";

export interface SeedOptions {
  templateId?: string;
  brandName?: string;
  period?: string;
  /** Trusted server snapshot; never accepted from an HTTP request body. */
  profile?: OnboardingProfileSnapshot;
}

export function seedWorkspace(
  now = new Date().toISOString(),
  options: SeedOptions = {},
): Workspace {
  const template = onboardingTemplate(
    options.profile?.templateId ?? options.templateId ?? DEFAULT_PROFILE_ID,
  );
  const profile = options.profile
    ? structuredClone(options.profile)
    : createProfileSnapshot(template.templateId, options.brandName);
  const orders: Order[] = [];
  if (options.period) {
    profile.period = options.period;
    profile.asOf = monthEnd(options.period);
  }
  const [year, month] = profile.period.split("-").map(Number);
  const days = Number(profile.asOf.slice(-2));
  const datePrefix = profile.period.slice(2).replace("-", "");
  const settlements: Settlement[] = [];
  const channels = profile.policy.enabledChannels;
  const count = template.seed.orderCount;
  for (let i = 1; i <= count; i++) {
    const channel = channels[(i - 1) % channels.length];
    const date = `${profile.period}-${String(1 + Math.floor(((i - 1) * Math.min(30, days)) / count)).padStart(2, "0")}`;
    const gross =
      template.templateId === DEFAULT_PROFILE_ID
        ? 39_000 + ((i * 137) % 31) * 6_000 + (i % 5) * 2_000
        : 24_000 + ((i * 113) % 29) * 4_500 + (i % 4) * 1_500;
    const refund = i % 17 === 0 ? 15_000 : 0;
    const id = `${template.seed.orderPrefix}-${datePrefix}${String(i).padStart(3, "0")}`;
    orders.push({ id, channel, date, gross, refund, sourceId: "SRC-ORD-01" });
    if (i === 12 || i === 63) continue;
    const settledRefund = i === 34 ? 0 : refund;
    let fee: number = feeFor(gross - settledRefund, profile.policy.feeBps[channel]);
    if (i === 22 || i === 80) fee += i === 22 ? 2_400 : 1_200;
    const settlement: Settlement = {
      id: `ST-${datePrefix}${String(i).padStart(3, "0")}`,
      orderId: id,
      channel,
      gross,
      refund: settledRefund,
      fee,
      net: gross - settledRefund - fee,
      dueDate:
        i >= count - 1
          ? new Date(Date.UTC(year, month, 2)).toISOString().slice(0, 10)
          : profile.asOf,
      paidDate: i >= count - 1 ? null : profile.asOf,
      sourceId: `SRC-SET-${channel.toUpperCase()}`,
    };
    settlements.push(settlement);
    if (i === 45) settlements.push({ ...settlement });
  }
  const sources = [
    {
      id: "SRC-ORD-01",
      name: `${template.seed.sourcePrefix}_orders_${profile.period.replace("-", "")}.csv`,
      kind: "orders" as const,
      rows: orders.length,
      digest: digest(orders),
      importedAt: now,
    },
    ...channels.map((channel) => {
      const entries = settlements.filter((settlement) => settlement.channel === channel);
      return {
        id: `SRC-SET-${channel.toUpperCase()}`,
        name: `${template.seed.sourcePrefix}_${channel}_settlements_${profile.period.replace("-", "")}.csv`,
        kind: "settlements" as const,
        rows: entries.length,
        digest: digest(entries),
        importedAt: now,
      };
    }),
  ];
  const workspace: Workspace = {
    version: 1,
    period: profile.period,
    asOf: profile.asOf,
    status: "review",
    orders,
    settlements,
    sources,
    resolutions: {},
    events: [],
    lastRunAt: now,
    close: null,
    createdAt: now,
    profile,
  };
  appendEvent(workspace, {
    type: "seeded",
    actor: "시스템",
    at: now,
    detail: `가상 ${profile.industry} 브랜드 ${profile.brandName}의 주문 ${orders.length}건과 ${channels.length}개 채널 정산 자료를 준비했습니다.`,
  });
  appendEvent(workspace, {
    type: "reconciled",
    actor: "규칙 엔진",
    at: now,
    detail: `${RULE_VERSION} 규칙으로 최초 대사를 실행했습니다. 금액은 원 단위 정수로 계산합니다.`,
  });
  return workspace;
}
