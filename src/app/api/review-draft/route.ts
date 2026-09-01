import { buildReviewEvidence, ruleBasedReviewDraft } from "@/application/review-draft";
import { DomainError } from "@/domain/model";
import { reviewDraftRequestSchema, type ReviewDraftResponse } from "@/domain/review-draft";
import {
  assertSameOrigin,
  json,
  observeRequest,
  readJson,
  repository,
  sessionHash,
} from "@/infrastructure/http";
import { generateGroundedReviewDraft } from "@/infrastructure/review-draft-agent";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = performance.now();
  return observeRequest(request, "review-draft.generate", async ({ requestId }) => {
    assertSameOrigin(request);
    const input = reviewDraftRequestSchema.parse(await readJson(request));
    const workspace = await (await repository()).get(await sessionHash());
    if (workspace.version !== input.expectedVersion)
      throw new DomainError(
        "VERSION_CONFLICT",
        "다른 요청에서 자료가 변경되었습니다. 최신 상태를 확인한 뒤 다시 시도하세요.",
        409,
      );
    if (workspace.status === "closed")
      throw new DomainError(
        "CLOSE_LOCKED",
        "마감이 확정된 뒤에는 검토 초안을 만들 수 없습니다.",
        409,
      );
    const packet = buildReviewEvidence(workspace, input.rowKey);
    let response: ReviewDraftResponse;
    try {
      if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
      const result = await generateGroundedReviewDraft(packet);
      response = {
        mode: "ai",
        model: result.model,
        generatedAt: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - startedAt),
        draft: result.draft,
        notice: "저장된 원본 자료만 사용한 AI 초안입니다. 적용하기 전에 근거와 표현을 확인하세요.",
      };
      console.info(
        JSON.stringify({
          level: "info",
          event: "review_draft_generated",
          requestId,
          mode: "ai",
          model: result.model,
          totalTokens: result.totalTokens,
          latencyMs: response.latencyMs,
        }),
      );
    } catch (error) {
      response = {
        mode: "rules",
        model: null,
        generatedAt: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - startedAt),
        draft: ruleBasedReviewDraft(packet),
        notice: "AI 호출을 완료하지 못해 동일한 원본 자료로 만든 규칙 기반 초안을 표시합니다.",
      };
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "review_draft_fallback",
          requestId,
          errorType: error instanceof Error ? error.name : "Unknown",
          latencyMs: response.latencyMs,
        }),
      );
    }
    return json(response);
  });
}
