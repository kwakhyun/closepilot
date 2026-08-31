import { describe, expect, it } from "vitest";
import { feeFor, sumWon, won, MAX_AMOUNT } from "@/domain/model";

describe("integer KRW arithmetic", () => {
  it("rounds exact half won upward without floating point", () => {
    expect(feeFor(15, 1000)).toBe(2);
    expect(feeFor(14, 1000)).toBe(1);
    expect(feeFor(1_000_000_000_000, 385)).toBe(38_500_000_000);
  });
  it("calculates the agreed net-of-refunds example", () => {
    expect(feeFor(80_000 - 10_000, 385)).toBe(2695);
  });
  it.each([0.1, Number.NaN, Number.POSITIVE_INFINITY, MAX_AMOUNT + 1, -MAX_AMOUNT - 1])(
    "rejects an invalid amount: %s",
    (value) => {
      expect(() => won(value)).toThrow();
    },
  );
  it("rejects aggregate overflow even for individually valid rows", () => {
    expect(() => sumWon([MAX_AMOUNT, 1])).toThrow();
  });
  it.each([-1, 10_001, 1.5])("rejects an invalid basis-point policy: %s", (value) => {
    expect(() => feeFor(100, value)).toThrow();
  });
  it("rejects negative net sales and supports zero", () => {
    expect(() => feeFor(-1, 330)).toThrow();
    expect(feeFor(0, 330)).toBe(0);
  });
});
