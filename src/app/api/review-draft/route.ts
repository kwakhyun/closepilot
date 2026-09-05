import {
  buildReviewEvidence,
  reviewDraftGrounding,
  ruleBasedReviewDraft,
} from "@/application/review-draft";
import { DomainError } from "@/domain/model";
import { digest } from "@/domain/canonical";
import {
  reviewDraftRequestSchema,
  validateGroundedDraft,
  type ReviewDraftResponse,
} from "@/domain/review-draft";
import {
  assertSameOrigin,
  json,
  observeRequest,
  readJson,
  repository,
  sessionHash,
} from "@/infrastructure/http";
import {
  generateGroundedReviewDraft,
  reviewModel,
  REVIEW_DRAFT_PROMPT_VERSION,
} from "@/infrastructure/review-draft-agent";
import { getDatabase } from "@/infrastructure/database";
import { ReviewDraftStore } from "@/infrastructure/review-draft-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = performance.now();
  return observeRequest(request, "review-draft.generate", async ({ requestId }) => {
    assertSameOrigin(request);
    const input = reviewDraftRequestSchema.parse(await readJson(request));
    const session = await sessionHash();
    const workspace = await (await repository()).get(session);
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
    const evidenceHash = digest({
      packet,
      model: reviewModel(),
      promptVersion: REVIEW_DRAFT_PROMPT_VERSION,
    });
    const store = new ReviewDraftStore(await getDatabase());
    let leaseToken: string | undefined;
    let response: ReviewDraftResponse;
    try {
      if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
      const reservation = await store.reserve(session, input.expectedVersion, evidenceHash);
      if (reservation.mode === "cached") {
        const cached = {
          ...reservation.response,
          draft: validateGroundedDraft(reservation.response.draft, reviewDraftGrounding(packet)),
          notice:
            "동일한 원본 자료로 생성한 AI 초안을 다시 표시합니다. 적용하기 전에 근거를 확인하세요.",
        };
        const result = json(cached);
        result.headers.set("X-Review-Draft-Cache", "hit");
        return result;
      }
      leaseToken = reservation.token;
      const result = await generateGroundedReviewDraft(packet);
      response = {
        mode: "ai",
        model: result.model,
        generatedAt: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - startedAt),
        draft: result.draft,
        notice: "저장된 원본 자료만 사용한 AI 초안입니다. 적용하기 전에 근거와 표현을 확인하세요.",
      };
      await store.complete(session, evidenceHash, leaseToken, response);
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
      if (
        error instanceof DomainError &&
        ["SESSION_EXPIRED", "VERSION_CONFLICT", "CLOSE_LOCKED"].includes(error.code)
      )
        throw error;
      if (leaseToken) {
        try {
          await store.release(session, evidenceHash, leaseToken);
        } catch {
          /* The expiring lease prevents a failed cleanup from blocking the session. */
        }
      }
      response = {
        mode: "rules",
        model: null,
        generatedAt: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - startedAt),
        draft: ruleBasedReviewDraft(packet),
        notice:
          error instanceof DomainError && ["AI_RATE_LIMITED", "AI_BUSY"].includes(error.code)
            ? error.message
            : "AI 호출을 완료하지 못해 동일한 원본 자료로 만든 규칙 기반 초안을 표시합니다.",
      };
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "review_draft_fallback",
          requestId,
          errorType: error instanceof Error ? error.name : "Unknown",
          errorCode: error instanceof DomainError ? error.code : undefined,
          latencyMs: response.latencyMs,
        }),
      );
    }
    return json(response);
  });
}
