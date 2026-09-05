import { describe, expect, it } from "vitest";
import { aggregateTrend, createTrendScale, trendBar, trendY } from "@/components/trend-data";
import { shortMoney } from "@/components/format";
import { seedWorkspace } from "@/domain/seed";
import { applyCommand, workspaceView } from "@/application/workbench";

describe("trend presentation", () => {
  it("aggregates both views without changing or dropping signed amounts", () => {
    const rows = [
      { date: "2026-08-01", channel: "d2c" as const, expectedNet: 100, actualNet: 100 },
      { date: "2026-08-01", channel: "d2c" as const, expectedNet: 0, actualNet: -200 },
      { date: "2026-09-01", channel: "coupang" as const, expectedNet: 0, actualNet: 40 },
    ];
    const before = structuredClone(rows);
    const result = aggregateTrend(rows, "2026-08", ["d2c", "coupang"]);
    expect(result.daily).toHaveLength(31);
    expect(result.daily[0]).toEqual({ label: "1일", expected: 100, actual: -100 });
    expect(result.channel).toEqual([
      { label: "자사몰", expected: 100, actual: -100 },
      { label: "쿠팡", expected: 0, actual: 40 },
    ]);
    expect(rows).toEqual(before);
  });

  it("uses the workspace month and includes empty days", () => {
    expect(aggregateTrend([], "2028-02", ["d2c"]).daily).toHaveLength(29);
    expect(aggregateTrend([], "2026-02", ["d2c"]).daily).toHaveLength(28);
  });

  it.each([
    [100, 50],
    [0, -100],
    [100, -100],
    [0, 0],
    [1_000_000_000_000, -1_000_000_000_000],
  ])("keeps %s and %s within the plot, with a zero baseline", (expected, actual) => {
    const scale = createTrendScale([{ label: "test", expected, actual }]);
    expect(scale.ticks).toContain(0);
    expect(scale.maximum).toBeGreaterThan(scale.minimum);
    for (const value of [expected, actual]) {
      const bar = trendBar(value, scale, 164, 18);
      const zero = trendY(0, scale, 164, 18);
      expect(bar.y).toBeGreaterThanOrEqual(18);
      expect(bar.y + bar.height).toBeLessThanOrEqual(182.000001);
      if (value < 0) {
        expect(bar.y).toBe(zero);
        expect(bar.height).toBeGreaterThan(0);
      } else if (value > 0) {
        expect(bar.y + bar.height).toBeCloseTo(zero);
      } else expect(bar.height).toBe(0);
    }
  });

  it("renders an accepted negative settlement below zero", () => {
    const workspace = seedWorkspace();
    const imported = applyCommand(workspace, {
      action: "import",
      expectedVersion: workspace.version,
      kind: "settlements",
      filename: "negative.csv",
      csv: "settlement_id,order_id,channel,gross,refund,fee,net,due_date,paid_date\nNEG-1,ORPHAN-NEG,d2c,0,0,100,-100,2026-08-31,2026-08-31",
    });
    const view = workspaceView(imported);
    const values = aggregateTrend(
      view.rows,
      view.period,
      view.profile.policy.enabledChannels,
    ).daily;
    expect(values[30].actual).toBe(-100);
    expect(trendBar(values[30].actual, createTrendScale(values), 164, 18).height).toBeGreaterThan(
      0,
    );
  });

  it("formats small and negative ticks without turning them into zero", () => {
    expect(shortMoney(-100)).toBe("-100");
    expect(shortMoney(-100_000_000)).toBe("-1.0억");
    expect(shortMoney(1_000_000_000_000)).toBe("1.0조");
    expect(shortMoney(10_000)).toBe("1만");
  });
});
