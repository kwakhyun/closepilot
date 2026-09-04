import { z } from "zod";
import { DomainError } from "./model";

export const reviewDraftRequestSchema = z
  .object({
    rowKey: z.string().min(1).max(100),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const reviewDraftContentSchema = z
  .object({
    summary: z.string().trim().min(20).max(280),
    note: z.string().trim().min(20).max(600),
    evidenceReference: z.string().trim().min(5).max(200),
    checks: z.array(z.string().trim().min(5).max(120)).min(2).max(4),
    citations: z.array(z.string().trim().min(1).max(100)).min(1).max(8),
  })
  .strict();

export type ReviewDraftContent = z.infer<typeof reviewDraftContentSchema>;
export type ReviewDraftRequest = z.infer<typeof reviewDraftRequestSchema>;

export interface ReviewDraftGrounding {
  allowedCitationIds: readonly string[];
  allowedAmounts: readonly number[];
  allowedDates: readonly string[];
}

const completedActionPattern =
  /(?:마감|검토|송금|전표|금액|수수료).{0,18}(?:(?:확정|승인|실행|생성|수정|변경)(?:(?:했|됐|되었|됨)(?:습니다|어요|다)?|\s*(?:완료|처리|상태))|(?:완료|처리)(?:했|됐|되었|됨)(?:습니다|어요|다)?)/;
const moneyPattern =
  /(?:[+-]?\s*(?:₩|KRW)\s*[+-]?\d[\d,]*(?:\.\d+)?|[+-]?\d[\d,]*(?:\.\d+)?\s*(?:만|억|조)\s*원?|[+-]?\d[\d,]*(?:\.\d+)?\s*(?:원|₩|KRW))/giu;
const datePattern =
  /(?<!\d)(\d{4})\s*(?:(?:-|\.|\/)\s*(\d{1,2})\s*(?:-|\.|\/)\s*(\d{1,2})|년\s*(\d{1,2})월\s*(\d{1,2})일)(?!\d)/g;

function parseClaimedAmount(claim: string): number {
  const compact = claim.replace(/[\s,]/g, "").toUpperCase();
  const sign =
    compact.startsWith("-") || compact.startsWith("₩-") || compact.startsWith("KRW-") ? -1 : 1;
  const unsigned = compact.replace(/[+-]/g, "");
  const unit = unsigned.includes("조")
    ? 1_000_000_000_000
    : unsigned.includes("억")
      ? 100_000_000
      : unsigned.includes("만")
        ? 10_000
        : 1;
  const numeric = Number(unsigned.replace(/(?:KRW|₩|원|만|억|조)/g, ""));
  const amount = sign * numeric * unit;
  return Number.isSafeInteger(amount) ? amount : Number.NaN;
}

export function extractClaimedAmounts(text: string): number[] {
  return [...text.matchAll(moneyPattern)].map(([claim]) => parseClaimedAmount(claim));
}

export function extractClaimedDates(text: string): string[] {
  return [...text.matchAll(datePattern)].map((match) => {
    const year = Number(match[1]);
    const month = Number(match[2] ?? match[4]);
    const day = Number(match[3] ?? match[5]);
    const candidate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const parsed = new Date(`${candidate}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === candidate
      ? candidate
      : match[0];
  });
}

export function validateGroundedDraft(
  draft: unknown,
  grounding: ReviewDraftGrounding,
): ReviewDraftContent {
  const parsed = reviewDraftContentSchema.parse(draft);
  const citations = [...new Set(parsed.citations)];
  const allowed = new Set(grounding.allowedCitationIds);
  if (citations.some((citation) => !allowed.has(citation)))
    throw new DomainError(
      "AI_GROUNDING_FAILED",
      "허용된 원본 자료 밖의 근거가 포함되어 규칙 기반 초안으로 전환했습니다.",
      502,
    );
  const claimText = [parsed.summary, parsed.note, ...parsed.checks].join(" ");
  if (completedActionPattern.test(claimText))
    throw new DomainError(
      "AI_AUTHORITY_EXCEEDED",
      "AI가 완료된 업무를 단정해 규칙 기반 초안으로 전환했습니다.",
      502,
    );
  const allowedAmounts = new Set(
    grounding.allowedAmounts.flatMap((value) => [value, Math.abs(value)]),
  );
  const unsupportedMoney = extractClaimedAmounts(claimText).find(
    (value) => !allowedAmounts.has(value),
  );
  const unsupportedDate = extractClaimedDates(claimText).find(
    (value) => !grounding.allowedDates.includes(value),
  );
  if (unsupportedMoney !== undefined || unsupportedDate)
    throw new DomainError(
      "AI_GROUNDING_FAILED",
      "원본 근거에 없는 금액이나 날짜가 포함되어 규칙 기반 초안으로 전환했습니다.",
      502,
    );
  return {
    ...parsed,
    citations,
    // The model cannot add prose or identifiers to the field copied into the review record.
    evidenceReference: citations.join(" · "),
  };
}

export interface ReviewDraftResponse {
  mode: "ai" | "rules";
  model: string | null;
  generatedAt: string;
  latencyMs: number;
  draft: ReviewDraftContent;
  notice: string;
}
