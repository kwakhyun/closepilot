import { openai } from "@ai-sdk/openai";
import { isStepCount, Output, tool, ToolLoopAgent } from "ai";
import { z } from "zod";
import { reviewDraftGrounding, type ReviewEvidencePacket } from "@/application/review-draft";
import {
  reviewDraftContentSchema,
  validateGroundedDraft,
  type ReviewDraftContent,
} from "@/domain/review-draft";

export const DEFAULT_REVIEW_MODEL = "gpt-5.6-luna";

export async function generateGroundedReviewDraft(
  packet: ReviewEvidencePacket,
): Promise<{ draft: ReviewDraftContent; model: string; totalTokens: number | undefined }> {
  const model = process.env.OPENAI_REVIEW_MODEL?.trim() || DEFAULT_REVIEW_MODEL;
  const readEvidence = tool({
    description:
      "현재 거래에 저장된 합성 주문·정산 근거를 읽습니다. 자료를 수정하거나 검토·마감을 승인하지 않습니다.",
    inputSchema: z.object({ rowKey: z.string() }).strict(),
    execute: async ({ rowKey }) => {
      if (rowKey !== packet.rowKey) throw new Error("Requested row is outside the approved scope");
      return packet;
    },
  });
  const agent = new ToolLoopAgent({
    id: "closepilot-review-draft",
    model: openai(model),
    instructions: `당신은 커머스 매출 마감 담당자의 검토 메모 초안을 돕는 읽기 전용 에이전트입니다.

규칙:
- 첫 단계에서 반드시 readEvidence 도구로 저장된 합성 근거를 읽습니다.
- 도구가 돌려준 값만 사용하고 추측하거나 외부 지식을 추가하지 않습니다.
- citations에는 allowedCitationIds에 실제로 있는 ID만 그대로 적습니다.
- evidenceReference에는 citations의 모든 값을 그대로 포함합니다. 서버가 적용 전에 허용된 citations만으로 이 필드를 다시 구성합니다.
- 원본 금액 변경, 검토 승인, 마감 확정, 전표 생성, 송금 실행을 수행하거나 완료했다고 말하지 않습니다.
- 최종 판단은 사용자가 원본 자료를 확인한 뒤 내립니다.
- 간결하고 자연스러운 한국어로 씁니다.`,
    tools: { readEvidence },
    output: Output.object({ schema: reviewDraftContentSchema }),
    stopWhen: isStepCount(3),
    maxOutputTokens: 700,
    prepareStep: ({ stepNumber }) =>
      stepNumber === 0
        ? { toolChoice: { type: "tool", toolName: "readEvidence" } }
        : { toolChoice: "none" },
    providerOptions: {
      openai: {
        store: false,
        reasoningEffort: "low",
        reasoningSummary: null,
        textVerbosity: "low",
      },
    },
  });
  const result = await agent.generate({
    prompt: `거래 ${packet.rowKey}의 검토 메모 초안을 작성하세요.`,
    abortSignal: AbortSignal.timeout(15_000),
  });
  return {
    draft: validateGroundedDraft(result.output, reviewDraftGrounding(packet)),
    model,
    totalTokens: result.usage.totalTokens,
  };
}
