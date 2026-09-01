export const CHANNELS = ["d2c", "naver", "coupang"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABELS: Record<Channel, string> = {
  d2c: "자사몰",
  naver: "스마트스토어",
  coupang: "쿠팡",
};
export const RULE_VERSION = "krw-net-v1.1.0";
export const PERIOD = "2026-08";
export const AS_OF = "2026-08-31";
export const MAX_AMOUNT = 1_000_000_000_000;
export type Won = number & { readonly __won: unique symbol };

export function won(value: number): Won {
  if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_AMOUNT) {
    throw new DomainError(
      "INVALID_MONEY",
      "금액은 -1조 원부터 1조 원까지 원 단위 정수로 입력하세요.",
    );
  }
  return value as Won;
}
export function sumWon(values: number[]): Won {
  const total = values.reduce((sum, value) => sum + BigInt(won(value)), 0n);
  return won(Number(total));
}
// Contract assumption: VAT-inclusive fees, applied after refunds, rounded half-up per order.
export function feeFor(netSales: number, basisPoints: number): Won {
  won(netSales);
  if (netSales < 0 || !Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new DomainError("INVALID_FEE", "수수료율과 환불 차감 후 금액을 확인하세요.");
  }
  return won(Number((BigInt(netSales) * BigInt(basisPoints) + 5_000n) / 10_000n));
}
export const FEE_BPS: Record<Channel, number> = { d2c: 330, naver: 385, coupang: 880 };

export interface ReconciliationPolicy {
  currency: "KRW";
  feeBps: Record<Channel, number>;
  enabledChannels: Channel[];
  feeBasis: string;
  reviewRules: string[];
}
export interface SavedColumnMappings {
  orders: Record<string, string>;
  settlements: Record<string, string>;
  updatedAt: string | null;
}
export interface DiscoveryFinding {
  hypothesis: string;
  discoveryQuestion: string;
  finding: string;
}
export interface RoadmapItem {
  horizon: "Now" | "Next" | "Later";
  capability: string;
  metric: string;
}
export interface OnboardingProfileSnapshot {
  id: string;
  templateId: string;
  version: number;
  brandName: string;
  monogram: string;
  industry: string;
  period: string;
  asOf: string;
  policy: ReconciliationPolicy;
  mappings: SavedColumnMappings;
  diagnosis: DiscoveryFinding[];
  reusableCapabilities: string[];
  roadmap: RoadmapItem[];
  clonedFrom: string | null;
}

export interface Order {
  id: string;
  channel: Channel;
  date: string;
  gross: number;
  refund: number;
  sourceId: string;
}
export interface Settlement {
  id: string;
  orderId: string;
  channel: Channel;
  gross: number;
  refund: number;
  fee: number;
  net: number;
  dueDate: string;
  paidDate: string | null;
  sourceId: string;
}
export type IssueKind =
  "matched" | "missing" | "orphan" | "duplicate" | "refund" | "fee" | "amount" | "timing";
export const ISSUE_LABELS: Record<IssueKind, string> = {
  matched: "일치",
  missing: "정산 누락",
  orphan: "주문 미확인",
  duplicate: "중복 정산",
  refund: "환불액 차이",
  fee: "수수료 차이",
  amount: "금액 차이",
  timing: "입금 확인 필요",
};
export interface ReconciliationRow {
  key: string;
  orderId: string;
  channel: Channel;
  date: string;
  gross: number;
  refund: number;
  expectedFee: number;
  actualFee: number;
  expectedNet: number;
  actualNet: number;
  delta: number;
  kind: IssueKind;
  explanation: string;
  sources: string[];
  settlementIds: string[];
  dueDate: string | null;
  paidDate: string | null;
}
export interface SourceBatch {
  id: string;
  name: string;
  kind: "orders" | "settlements";
  rows: number;
  digest: string;
  importedAt: string;
}
export interface Resolution {
  rowKey: string;
  disposition: "accepted_variance" | "carry_forward" | "exclude_duplicate";
  note: string;
  evidence: string;
  actor: string;
  at: string;
  fingerprint: string;
}
export interface AuditEvent {
  id: string;
  type: "seeded" | "reconciled" | "imported" | "resolved" | "closed" | "analysis_created";
  actor: string;
  at: string;
  detail: string;
  previousHash: string;
  hash: string;
}
export interface CloseSnapshot {
  period: string;
  ruleVersion: string;
  closedAt: string;
  closedBy: string;
  gross: number;
  refunds: number;
  expectedNet: number;
  actualNet: number;
  delta: number;
  rowCount: number;
  reviewedCount: number;
  sources: Array<{ id: string; digest: string }>;
  profile: OnboardingProfileSnapshot;
  inputs: {
    orders: Order[];
    settlements: Settlement[];
    asOf: string;
    feeBps: Record<Channel, number>;
  };
  rows: ReconciliationRow[];
  resolutions: Resolution[];
  hash: string;
}
export interface Workspace {
  version: number;
  period: string;
  asOf: string;
  status: "open" | "review" | "closed";
  orders: Order[];
  settlements: Settlement[];
  sources: SourceBatch[];
  resolutions: Record<string, Resolution>;
  events: AuditEvent[];
  lastRunAt: string | null;
  close: CloseSnapshot | null;
  createdAt: string;
  /** Optional only for six-hour workspaces created before profile versioning shipped. */
  profile?: OnboardingProfileSnapshot;
}
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 422,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
