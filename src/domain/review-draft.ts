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

const completedActionPattern = /(마감을 확정했|검토를 승인했|송금을 실행했|전표를 생성했)/;

export function validateGroundedDraft(
  draft: unknown,
  allowedCitationIds: readonly string[],
): ReviewDraftContent {
  const parsed = reviewDraftContentSchema.parse(draft);
  const allowed = new Set(allowedCitationIds);
  if (parsed.citations.some((citation) => !allowed.has(citation)))
    throw new DomainError(
      "AI_GROUNDING_FAILED",
      "허용된 원본 자료 밖의 근거가 포함되어 규칙 기반 초안으로 전환했습니다.",
      502,
    );
  if (!parsed.citations.some((citation) => parsed.evidenceReference.includes(citation)))
    throw new DomainError(
      "AI_GROUNDING_FAILED",
      "증빙 참조 정보와 원본 자료가 연결되지 않아 규칙 기반 초안으로 전환했습니다.",
      502,
    );
  if (completedActionPattern.test(`${parsed.summary} ${parsed.note}`))
    throw new DomainError(
      "AI_AUTHORITY_EXCEEDED",
      "AI가 완료된 업무를 단정해 규칙 기반 초안으로 전환했습니다.",
      502,
    );
  return parsed;
}

export interface ReviewDraftResponse {
  mode: "ai" | "rules";
  model: string | null;
  generatedAt: string;
  latencyMs: number;
  draft: ReviewDraftContent;
  notice: string;
}
