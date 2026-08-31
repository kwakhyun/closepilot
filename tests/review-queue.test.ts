import { describe, expect, it } from "vitest";
import type { ReviewedRow } from "@/application/workbench";
import { compareReviewRows, unresolvedReviewQueue } from "@/components/review-queue";

function row(
  key: string,
  kind: ReviewedRow["kind"],
  delta: number,
  resolution: ReviewedRow["resolution"] = null,
  date = "2026-08-01",
) {
  return { key, kind, delta, resolution, date } as ReviewedRow;
}

describe("review queue ordering", () => {
  it("keeps a zero-delta unresolved timing issue ahead of matched rows", () => {
    const rows = [row("matched", "matched", 0), row("timing", "timing", 0)].sort((a, b) =>
      compareReviewRows(a, b),
    );

    expect(rows.map((entry) => entry.key)).toEqual(["timing", "matched"]);
  });

  it("orders unresolved issues by risk, amount, then date", () => {
    const rows = [
      row("fee", "fee", -100_000),
      row("duplicate-small", "duplicate", 20_000, null, "2026-08-03"),
      row("duplicate-large", "duplicate", 80_000, null, "2026-08-02"),
      row("timing", "timing", 0),
    ].sort((a, b) => compareReviewRows(a, b));

    expect(rows.map((entry) => entry.key)).toEqual([
      "duplicate-large",
      "duplicate-small",
      "fee",
      "timing",
    ]);
  });

  it("returns only unresolved review work", () => {
    const reviewed = row("reviewed", "fee", 100, {
      disposition: "accepted_variance",
    } as ReviewedRow["resolution"]);

    expect(
      unresolvedReviewQueue([
        row("matched", "matched", 0),
        reviewed,
        row("missing", "missing", -500),
      ]).map((entry) => entry.key),
    ).toEqual(["missing"]);
  });
});
