import type { Channel, OnboardingProfileSnapshot } from "./model";

export const DEFAULT_PROFILE_ID = "lumiere-beauty-v1";

export interface OnboardingTemplate extends Omit<OnboardingProfileSnapshot, "id" | "clonedFrom"> {
  seed: {
    orderCount: number;
    orderPrefix: string;
    sourcePrefix: string;
    enabledChannels: Channel[];
  };
}

const templates: OnboardingTemplate[] = [
  {
    templateId: DEFAULT_PROFILE_ID,
    version: 1,
    brandName: "LUMIÈRE",
    monogram: "L",
    industry: "K-Beauty",
    period: "2026-08",
    asOf: "2026-08-31",
    policy: {
      currency: "KRW",
      feeBps: { d2c: 330, naver: 385, coupang: 880 },
      enabledChannels: ["d2c", "naver", "coupang"],
      feeBasis: "환불 차감 후 순매출 · 주문별 반올림",
      reviewRules: ["예외별 근거 필수", "최신 대사 후 승인", "미검토 0건일 때 마감"],
    },
    mappings: {
      orders: {
        order_id: "주문번호",
        channel: "판매채널",
        date: "주문일자",
        gross: "결제금액",
        refund: "환불금액",
      },
      settlements: {
        settlement_id: "정산번호",
        order_id: "주문번호",
        channel: "판매채널",
        gross: "주문금액",
        refund: "환불금액",
        fee: "수수료",
        net: "정산금액",
        due_date: "입금예정일",
        paid_date: "입금일",
      },
      updatedAt: null,
    },
    diagnosis: [
      {
        hypothesis: "채널마다 정산서 열 이름과 수수료 기준이 달라 월말 확인이 반복된다.",
        discoveryQuestion:
          "채널별 수수료는 어떤 금액을 기준으로 계산하고 어느 시점에 반올림하나요?",
        finding:
          "환불 차감 후 순매출에 채널별 요율을 적용하고 주문별로 반올림한다는 가상 운영 조건을 설정했습니다.",
      },
      {
        hypothesis: "입금 시점 차이와 누락을 같은 차이로 보면 후속 조치가 불명확해진다.",
        discoveryQuestion: "마감일 이후 입금 예정 건은 이번 달 예외와 어떻게 구분하나요?",
        finding: "입금 확인 필요 건은 금액 오류와 분리하고 다음 달 이월 검토로만 처리합니다.",
      },
    ],
    reusableCapabilities: [
      "열 연결 프로필 저장",
      "채널별 수수료 정책 버전 관리",
      "예외 유형별 검토 규칙",
      "마감 근거 패키지",
    ],
    roadmap: [
      { horizon: "Now", capability: "온보딩 프로필", metric: "첫 업로드 열 연결 완료율" },
      {
        horizon: "Next",
        capability: "정산 정책 변경 비교",
        metric: "정책 변경 후 재검토 누락 건수",
      },
      { horizon: "Later", capability: "채널 커넥터 자산화", metric: "브랜드별 반복 설정 시간" },
    ],
    seed: {
      orderCount: 128,
      orderPrefix: "LM",
      sourcePrefix: "lumiere",
      enabledChannels: ["d2c", "naver", "coupang"],
    },
  },
  {
    templateId: "morrow-food-v1",
    version: 1,
    brandName: "MORROW FOODS",
    monogram: "M",
    industry: "K-Food",
    period: "2026-08",
    asOf: "2026-08-31",
    policy: {
      currency: "KRW",
      feeBps: { d2c: 290, naver: 360, coupang: 720 },
      enabledChannels: ["d2c", "coupang"],
      feeBasis: "환불 차감 후 순매출 · 주문별 반올림",
      reviewRules: ["식품 채널 증빙 필수", "입금 예정일 별도 확인", "미검토 0건일 때 마감"],
    },
    mappings: {
      orders: {
        order_id: "merchant_order_no",
        channel: "sales_channel",
        date: "ordered_at",
        gross: "sales_amount",
        refund: "refund_amount",
      },
      settlements: {
        settlement_id: "settlement_no",
        order_id: "merchant_order_no",
        channel: "sales_channel",
        gross: "sales_amount",
        refund: "refund_amount",
        fee: "commission",
        net: "payout_amount",
        due_date: "scheduled_at",
        paid_date: "deposited_at",
      },
      updatedAt: null,
    },
    diagnosis: [
      {
        hypothesis:
          "오픈마켓 정산서와 자사몰 주문 번호 체계가 달라 같은 주문을 찾는 데 시간이 걸린다.",
        discoveryQuestion: "각 자료에서 주문을 안정적으로 연결할 수 있는 공통 키는 무엇인가요?",
        finding:
          "채널과 판매처 주문번호를 복합 키로 사용하고, 연결되지 않은 정산은 별도 예외로 남깁니다.",
      },
      {
        hypothesis: "프로모션 기간에는 수수료 계약 변경이 잦아 과거 계산 기준을 재현하기 어렵다.",
        discoveryQuestion: "요율 변경의 적용일과 승인 근거는 어디에 기록되나요?",
        finding:
          "프로필 버전과 마감 패키지에 적용 요율을 함께 고정하는 가상 운영 조건을 설정했습니다.",
      },
    ],
    reusableCapabilities: [
      "복합 주문 키 표준화",
      "브랜드별 열 연결 복제",
      "적용 요율 스냅샷",
      "미연결 정산 검토 큐",
    ],
    roadmap: [
      { horizon: "Now", capability: "복합 키 진단", metric: "자동 연결률" },
      { horizon: "Next", capability: "요율 유효기간", metric: "수수료 예외 재발률" },
      { horizon: "Later", capability: "프로모션 계약 수집", metric: "근거 요청 왕복 횟수" },
    ],
    seed: {
      orderCount: 96,
      orderPrefix: "MF",
      sourcePrefix: "morrow",
      enabledChannels: ["d2c", "coupang"],
    },
  },
];

export const ONBOARDING_TEMPLATES = templates;

export function onboardingTemplate(templateId = DEFAULT_PROFILE_ID): OnboardingTemplate {
  const template = templates.find((entry) => entry.templateId === templateId);
  if (!template) throw new Error(`Unknown onboarding profile: ${templateId}`);
  return structuredClone(template);
}

export function createProfileSnapshot(
  templateId = DEFAULT_PROFILE_ID,
  brandName?: string,
): OnboardingProfileSnapshot {
  const { seed, ...template } = onboardingTemplate(templateId);
  void seed;
  const normalizedName = brandName?.trim();
  return {
    ...template,
    id: normalizedName
      ? `${template.templateId}-copy-${
          normalizedName
            .toLocaleLowerCase("ko-KR")
            .replace(/[^a-z0-9가-힣]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 32) || "brand"
        }`
      : template.templateId,
    brandName: normalizedName || template.brandName,
    monogram: normalizedName?.slice(0, 1).toLocaleUpperCase("ko-KR") || template.monogram,
    clonedFrom: normalizedName ? template.templateId : null,
  };
}

export function profileCatalog() {
  return templates.map(({ seed, ...template }) => {
    void seed;
    return structuredClone(template);
  });
}
