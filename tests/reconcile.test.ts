import { describe, expect, it } from "vitest";
import { reconcile } from "@/domain/reconcile";
import { seedWorkspace } from "@/domain/seed";
import type { Order, Settlement } from "@/domain/model";

const order: Order = {
  id: "ORD-1",
  channel: "d2c",
  date: "2026-08-15",
  gross: 100_000,
  refund: 0,
  sourceId: "orders",
};
const settlement: Settlement = {
  id: "SET-1",
  orderId: "ORD-1",
  channel: "d2c",
  gross: 100_000,
  refund: 0,
  fee: 3300,
  net: 96_700,
  dueDate: "2026-08-31",
  paidDate: "2026-08-31",
  sourceId: "settlements",
};

describe("evidence-first reconciliation", () => {
  it("matches a fully reconciled order", () => {
    expect(reconcile([order], [settlement])[0]).toMatchObject({
      kind: "matched",
      expectedNet: 96700,
      delta: 0,
      sources: ["orders", "settlements"],
    });
  });
  it("identifies missing settlements instead of dropping the order", () => {
    expect(reconcile([order], [])[0]).toMatchObject({ kind: "missing", delta: -96700 });
  });
  it("identifies orphan settlements without counting them as sales", () => {
    expect(reconcile([], [settlement])[0]).toMatchObject({
      kind: "orphan",
      gross: 0,
      actualNet: 96700,
    });
  });
  it("does not match identical order IDs across channels", () => {
    const rows = reconcile([order], [{ ...settlement, channel: "naver" }]);
    expect(rows.map((row) => row.kind).sort()).toEqual(["missing", "orphan"]);
  });
  it("blocks duplicate order keys", () => {
    expect(() => reconcile([order, order], [])).toThrow("중복 주문");
  });
  it("retains duplicate settlement amounts as an explicit exception", () => {
    expect(reconcile([order], [settlement, settlement])[0]).toMatchObject({
      kind: "duplicate",
      actualNet: 193400,
      delta: 96700,
    });
  });
  it("marks an ID collision across different orders within one channel", () => {
    const rows = reconcile(
      [order, { ...order, id: "ORD-2" }],
      [settlement, { ...settlement, orderId: "ORD-2" }],
    );
    expect(rows.every((row) => row.kind === "duplicate")).toBe(true);
  });
  it("aggregates distinct split-settlement IDs", () => {
    const split = { ...settlement, gross: 50000, fee: 1650, net: 48350 };
    expect(reconcile([order], [split, { ...split, id: "SET-2" }])[0].kind).toBe("matched");
  });
  it("distinguishes refund timing from fee differences", () => {
    expect(reconcile([{ ...order, refund: 10000 }], [settlement])[0].kind).toBe("refund");
  });
  it("detects a wrong fee even when the settlement arithmetic balances", () => {
    expect(reconcile([order], [{ ...settlement, fee: 3400, net: 96600 }])[0]).toMatchObject({
      kind: "fee",
      delta: -100,
    });
  });
  it("detects a broken settlement accounting identity", () => {
    expect(reconcile([order], [{ ...settlement, net: 97000 }])[0].kind).toBe("amount");
  });
  it.each([null, "2026-09-01"])(
    "treats unconfirmed or future payments as timing differences: %s",
    (paidDate) => {
      expect(reconcile([order], [{ ...settlement, paidDate }])[0]).toMatchObject({
        kind: "timing",
        delta: 0,
      });
    },
  );
  it("reproduces the documented synthetic baseline", () => {
    const seed = seedWorkspace("2026-08-31T00:00:00.000Z");
    const rows = reconcile(seed.orders, seed.settlements);
    expect(rows).toHaveLength(128);
    expect(rows.filter((row) => row.kind === "matched")).toHaveLength(120);
    expect(rows.filter((row) => row.kind === "timing")).toHaveLength(2);
    expect(rows.filter((row) => row.kind === "fee")).toHaveLength(2);
    expect(rows.filter((row) => row.kind === "missing")).toHaveLength(2);
    expect(rows.filter((row) => row.kind === "duplicate")).toHaveLength(1);
    expect(rows.filter((row) => row.kind === "refund")).toHaveLength(1);
  });
});
