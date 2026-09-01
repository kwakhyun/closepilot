import { describe, expect, it } from "vitest";
import { buildReviewEvidence, ruleBasedReviewDraft } from "@/application/review-draft";
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
    const draft = validateGroundedDraft(ruleBasedReviewDraft(packet), packet.allowedCitationIds);
    expect(draft.citations.every((citation) => packet.allowedCitationIds.includes(citation))).toBe(
      true,
    );
  });

  it("rejects hallucinated evidence and completed-action claims", () => {
    const packet = buildReviewEvidence(workspace, issue.key);
    const draft = ruleBasedReviewDraft(packet);
    expect(() =>
      validateGroundedDraft({ ...draft, citations: ["UNKNOWN-SOURCE"] }, packet.allowedCitationIds),
    ).toThrow("허용된 원본 자료 밖");
    expect(() =>
      validateGroundedDraft(
        { ...draft, note: `${draft.note} 검토를 승인했습니다.` },
        packet.allowedCitationIds,
      ),
    ).toThrow("완료된 업무를 단정");
  });

  it("requires the current workspace version at the API boundary", () => {
    expect(
      reviewDraftRequestSchema.safeParse({ rowKey: issue.key, expectedVersion: 1 }).success,
    ).toBe(true);
    expect(reviewDraftRequestSchema.safeParse({ rowKey: issue.key }).success).toBe(false);
  });
});
