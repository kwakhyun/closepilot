import { z } from "zod";
import { digest } from "@/domain/canonical";
import { verifyAudit } from "@/domain/audit";
import { CHANNELS, RULE_VERSION, MAX_AMOUNT, sumWon } from "@/domain/model";
import { reconcile } from "@/domain/reconcile";

const date = z.iso.date();
const money = z.number().int().min(-MAX_AMOUNT).max(MAX_AMOUNT);
const positive = money.nonnegative();
const id = z.string().min(1).max(100);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const channel = z.enum(CHANNELS);
const fees = z
  .object({
    d2c: z.number().int().min(0).max(10000),
    naver: z.number().int().min(0).max(10000),
    coupang: z.number().int().min(0).max(10000),
  })
  .strict();
const order = z
  .object({ id, channel, date, gross: positive, refund: positive, sourceId: id })
  .strict()
  .refine((row) => row.refund <= row.gross);
const settlement = z
  .object({
    id,
    orderId: id,
    channel,
    gross: positive,
    refund: positive,
    fee: positive,
    net: money,
    dueDate: date,
    paidDate: date.nullable(),
    sourceId: id,
  })
  .strict()
  .refine((row) => row.refund <= row.gross);
const event = z
  .object({
    id,
    type: z.enum(["seeded", "reconciled", "imported", "resolved", "closed", "analysis_created"]),
    actor: id,
    at: z.iso.datetime(),
    detail: z.string().max(5000),
    previousHash: z.string(),
    hash,
  })
  .strict();
const resolution = z
  .object({
    rowKey: id,
    disposition: z.enum(["accepted_variance", "carry_forward", "exclude_duplicate"]),
    note: z.string().trim().min(10).max(600),
    evidence: z.string().trim().min(5).max(200),
    actor: id,
    at: z.iso.datetime(),
    fingerprint: hash,
  })
  .strict();
const schema = z
  .object({
    snapshot: z
      .object({
        period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        ruleVersion: z.literal(RULE_VERSION),
        closedAt: z.iso.datetime(),
        closedBy: id,
        hash,
        gross: money,
        refunds: money,
        expectedNet: money,
        actualNet: money,
        delta: money,
        rowCount: z.number().int().min(1).max(1500),
        reviewedCount: z.number().int().min(0).max(1500),
        sources: z.array(z.object({ id, digest: hash }).strict()).max(12),
        inputs: z
          .object({
            orders: z.array(order).min(1).max(500),
            settlements: z.array(settlement).max(1000),
            asOf: date,
            feeBps: fees,
          })
          .strict(),
        profile: z
          .object({
            id,
            templateId: id,
            brandName: z.string().min(1).max(100),
            period: z.string(),
            asOf: date,
            policy: z.object({ feeBps: fees }).passthrough(),
          })
          .passthrough(),
        rows: z.array(z.record(z.string(), z.unknown())).max(1500),
        resolutions: z.array(resolution).max(1500),
      })
      .passthrough(),
    audit: z.array(event).min(2).max(101),
    notice: z.string().max(2000).optional(),
  })
  .passthrough();

export function inspectPackage(input: unknown) {
  const checks: { name: string; passed: boolean }[] = [];
  function check(name: string, run: () => void) {
    try {
      run();
      checks.push({ name, passed: true });
    } catch {
      checks.push({ name, passed: false });
      throw new Error(name);
    }
  }
  try {
    check("파일 구조와 규칙 버전", () => {
      schema.parse(input);
    });
    const parsed = schema.parse(input);
    // Hash the original payload, never a transformed validation result.
    const original = input as { snapshot: Record<string, unknown>; audit: z.infer<typeof event>[] };
    const { hash: storedHash, ...body } = original.snapshot;
    check("마감 체크섬", () => {
      if (digest(body) !== storedHash) throw new Error();
    });
    const snapshot = parsed.snapshot;
    const { orders, settlements, asOf, feeBps } = snapshot.inputs;
    const rows = reconcile(orders, settlements, asOf, feeBps);
    check("TypeScript 재계산과 검토 근거", () => {
      const require = (value: boolean) => {
        if (!value) throw new Error();
      };
      require(orders.every((entry) => entry.date.startsWith(`${snapshot.period}-`)));
      require(snapshot.profile.period === snapshot.period && snapshot.profile.asOf === asOf);
      require(digest(snapshot.profile.policy.feeBps) === digest(feeBps));
      const sources = new Set(snapshot.sources.map((source) => source.id));
      require(sources.size === snapshot.sources.length);
      require([...orders, ...settlements].every((entry) => sources.has(entry.sourceId)));
      require(digest(rows) === digest(snapshot.rows) && rows.length === snapshot.rowCount);
      require(snapshot.gross === sumWon(orders.map((entry) => entry.gross)));
      require(snapshot.refunds === sumWon(orders.map((entry) => entry.refund)));
      require(snapshot.expectedNet === sumWon(rows.map((entry) => entry.expectedNet)));
      require(snapshot.actualNet === sumWon(rows.map((entry) => entry.actualNet)));
      require(snapshot.delta === sumWon(rows.map((entry) => entry.delta)));
      const issues = rows.filter((row) => row.kind !== "matched");
      require(
        snapshot.resolutions.length === issues.length && snapshot.reviewedCount === issues.length,
      );
      require(new Set(snapshot.resolutions.map((entry) => entry.rowKey)).size === issues.length);
      for (const row of issues) {
        const approval = snapshot.resolutions.find((entry) => entry.rowKey === row.key);
        require(approval?.fingerprint === digest(row));
        require(
          approval?.disposition ===
            (row.kind === "timing"
              ? "carry_forward"
              : row.kind === "duplicate"
                ? "exclude_duplicate"
                : "accepted_variance"),
        );
      }
    });
    check("감사 연결과 마감 기록", () => {
      const last = parsed.audit.at(-1)!;
      if (
        !verifyAudit(original.audit) ||
        !parsed.audit.every(
          (entry, index) => entry.id === `EVT-${String(index + 1).padStart(4, "0")}`,
        ) ||
        last.type !== "closed" ||
        last.at !== snapshot.closedAt ||
        last.actor !== snapshot.closedBy ||
        !last.detail.includes(snapshot.hash.slice(0, 16))
      )
        throw new Error();
    });
    return {
      valid: true as const,
      checks,
      package: { ...parsed, snapshot: { ...snapshot, rows } },
    };
  } catch {
    return { valid: false as const, checks, package: null };
  }
}
export type PackageInspection = ReturnType<typeof inspectPackage>;
