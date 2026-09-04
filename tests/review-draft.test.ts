import { describe, expect, it } from "vitest";
import {
  buildReviewEvidence,
  reviewDraftGrounding,
  ruleBasedReviewDraft,
} from "@/application/review-draft";
import { reviewedRows } from "@/application/workbench";
import { seedWorkspace } from "@/domain/seed";
import { reviewDraftRequestSchema, validateGroundedDraft } from "@/domain/review-draft";

const workspace = seedWorkspace("2026-08-31T09:00:00.000Z");
const issue = reviewedRows(workspace).find((row) => row.kind !== "matched")!;

describe("grounded review draft", () => {
  it("builds an evidence packet scoped to one unresolved row", () => {
    const packet = buildReviewEvidence(workspace, issue.key);
    expect(packet.rowKey).toBe(issue.key);
    expect(packet.allowedCitationIds.length).toBeGreaterThan(0);
    expect(packet.sourceRows.every((row) => packet.allowedCitationIds.includes(row.id))).toBe(true);
  });

  it("creates a deterministic fallback that cites only stored evidence", () => {
    const packet = buildReviewEvidence(workspace, issue.key);
    const draft = validateGroundedDraft(ruleBasedReviewDraft(packet), reviewDraftGrounding(packet));
    expect(draft.citations.every((citation) => packet.allowedCitationIds.includes(citation))).toBe(
      true,
    );
  });

  it("rejects hallucinated evidence and completed-action claims", () => {
    const packet = buildReviewEvidence(workspace, issue.key);
    const grounding = reviewDraftGrounding(packet);
    const draft = ruleBasedReviewDraft(packet);
    expect(() =>
      validateGroundedDraft({ ...draft, citations: ["UNKNOWN-SOURCE"] }, grounding),
    ).toThrow("허용된 원본 자료 밖");
    expect(() =>
      validateGroundedDraft({ ...draft, note: `${draft.note} 검토를 승인했습니다.` }, grounding),
    ).toThrow("완료된 업무를 단정");
  });

  it.each([
    "검토 승인이 완료되었습니다.",
    "마감 처리가 완료됐습니다.",
    "수수료를 수정했습니다.",
    "전표를 생성했습니다.",
    "검토 승인 완료",
    "마감 확정됨",
    "송금 실행 완료 상태입니다.",
  ])("rejects authority claims phrased as %s", (claim) => {
    const packet = buildReviewEvidence(workspace, issue.key);
    const draft = ruleBasedReviewDraft(packet);
    expect(() =>
      validateGroundedDraft(
        { ...draft, note: `${draft.note} ${claim}` },
        reviewDraftGrounding(packet),
      ),
    ).toThrow("완료된 업무를 단정");
  });

  it.each([
    "차이는 999,999원입니다.",
    "차이는 ₩999,999입니다.",
    "차이는 KRW 999,999입니다.",
    "차이는 999,999 KRW입니다.",
    "차이는 99.9999만 원입니다.",
    "기준일은 2027-01-01입니다.",
    "기준일은 2027-1-1입니다.",
    "기준일은 2027.1.1입니다.",
    "기준일은 2027/01/01입니다.",
    "기준일은 2027년 1월 1일입니다.",
  ])("rejects an unsupported grounded claim phrased as %s", (claim) => {
    const packet = buildReviewEvidence(workspace, issue.key);
    const draft = ruleBasedReviewDraft(packet);
    const grounding = reviewDraftGrounding(packet);
    expect(() =>
      validateGroundedDraft({ ...draft, note: `${draft.note} ${claim}` }, grounding),
    ).toThrow("원본 근거에 없는 금액이나 날짜");
  });

  it.each([
    "정산 행의 12,345원과 2026-08-29 기록을 대조합니다.",
    "정산 행의 ₩12,345와 2026년 8월 29일 기록을 대조합니다.",
    "정산 행의 KRW 12,345와 2026.8.29 기록을 대조합니다.",
  ])("allows supported amount and date formats: %s", (claim) => {
    const packet = buildReviewEvidence(workspace, issue.key);
    packet.sourceRows[0].net = 12345;
    packet.sourceRows[0].dueDate = "2026-08-29";
    const draft = ruleBasedReviewDraft(packet);
    expect(() =>
      validateGroundedDraft(
        { ...draft, note: `${draft.note} ${claim}` },
        reviewDraftGrounding(packet),
      ),
    ).not.toThrow();
  });

  it("rebuilds the applied evidence reference from allowed citations only", () => {
    const packet = buildReviewEvidence(workspace, issue.key);
    const draft = ruleBasedReviewDraft(packet);
    const result = validateGroundedDraft(
      {
        ...draft,
        citations: [draft.citations[0], draft.citations[0]],
        evidenceReference: `${draft.citations[0]} · UNKNOWN-SOURCE`,
      },
      reviewDraftGrounding(packet),
    );
    expect(result.citations).toEqual([draft.citations[0]]);
    expect(result.evidenceReference).toBe(draft.citations[0]);
  });

  it("excludes user-controlled file names from the model evidence packet", () => {
    const packet = buildReviewEvidence(workspace, issue.key);
    expect(packet.sourceFiles.every((source) => !("name" in source))).toBe(true);
  });

  it("requires the current workspace version at the API boundary", () => {
    expect(
      reviewDraftRequestSchema.safeParse({ rowKey: issue.key, expectedVersion: 1 }).success,
    ).toBe(true);
    expect(reviewDraftRequestSchema.safeParse({ rowKey: issue.key }).success).toBe(false);
  });
});
