import type { ReviewedRow } from "@/application/workbench";
import type { IssueKind } from "@/domain/model";

const ISSUE_PRIORITY: Record<IssueKind, number> = {
  duplicate: 0,
  missing: 0,
  orphan: 0,
  refund: 1,
  amount: 1,
  fee: 2,
  timing: 3,
  matched: 4,
};

export function isUnresolvedReview(row: ReviewedRow) {
  return row.kind !== "matched" && !row.resolution;
}

export function compareReviewRows(a: ReviewedRow, b: ReviewedRow, ascendingDelta = false) {
  const unresolvedOrder = Number(!isUnresolvedReview(a)) - Number(!isUnresolvedReview(b));
  if (unresolvedOrder) return unresolvedOrder;

  const reviewedOrder = Number(!a.resolution) - Number(!b.resolution);
  if (reviewedOrder) return reviewedOrder;

  const priorityOrder = ISSUE_PRIORITY[a.kind] - ISSUE_PRIORITY[b.kind];
  if (priorityOrder) return priorityOrder;

  const deltaOrder = Math.abs(a.delta) - Math.abs(b.delta);
  if (deltaOrder) return ascendingDelta ? deltaOrder : -deltaOrder;

  return a.date.localeCompare(b.date) || a.key.localeCompare(b.key);
}

export function unresolvedReviewQueue(rows: ReviewedRow[]) {
  return rows.filter(isUnresolvedReview).sort((a, b) => compareReviewRows(a, b));
}
