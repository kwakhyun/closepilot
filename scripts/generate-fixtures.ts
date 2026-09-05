import { mkdirSync, writeFileSync } from "node:fs";
import { seedWorkspace } from "../src/domain/seed";
import { applyCommand, reviewedRows, workspaceView } from "../src/application/workbench";
import { SCHEMA, JSONB_GUARDS, REVIEW_DRAFT_STORAGE } from "../src/infrastructure/schema";
import { RULE_VERSION } from "../src/domain/model";
import { reconcile } from "../src/domain/reconcile";

const at = "2026-08-31T09:00:00.000Z";
let workspace = seedWorkspace(at);
const baseline = workspaceView(workspace).summary;
const contractSeed = seedWorkspace(at);
const contractKinds = ["matched", "missing", "duplicate", "refund", "fee", "timing"] as const;
const contractKeys = new Set(
  contractKinds.map((kind) => reviewedRows(contractSeed).find((row) => row.kind === kind)!.key),
);
const contractOrders = contractSeed.orders.filter((order) =>
  contractKeys.has(`${order.channel}:${order.id}`),
);
const contractSettlements = contractSeed.settlements.filter((settlement) =>
  contractKeys.has(`${settlement.channel}:${settlement.orderId}`),
);
const contractFeeBps = contractSeed.profile!.policy.feeBps;
const contractRows = reconcile(
  contractOrders,
  contractSettlements,
  contractSeed.asOf,
  contractFeeBps,
);
const contractRequest = {
  ruleVersion: RULE_VERSION,
  asOf: contractSeed.asOf,
  feeBps: contractFeeBps,
  orders: contractOrders,
  settlements: contractSettlements,
};
const contractExpectedRows = contractRows.map((row) => {
  const { explanation, ...expectedRow } = row;
  void explanation;
  return expectedRow;
});
const contractExpected = {
  ruleVersion: RULE_VERSION,
  engine: "kotlin-jvm",
  rows: contractExpectedRows,
  summary: {
    total: contractRows.length,
    matched: contractRows.filter((row) => row.kind === "matched").length,
    issues: contractRows.filter((row) => row.kind !== "matched").length,
    expectedNet: contractRows.reduce((sum, row) => sum + row.expectedNet, 0),
    actualNet: contractRows.reduce((sum, row) => sum + row.actualNet, 0),
    delta: contractRows.reduce((sum, row) => sum + row.delta, 0),
  },
};
for (const row of reviewedRows(workspace).filter((row) => row.kind !== "matched")) {
  workspace = applyCommand(
    workspace,
    {
      action: "resolve",
      expectedVersion: workspace.version,
      rowKey: row.key,
      disposition:
        row.kind === "timing"
          ? "carry_forward"
          : row.kind === "duplicate"
            ? "exclude_duplicate"
            : "accepted_variance",
      note: "합성 데이터 검증용 승인입니다. 실제 증빙이나 고객 확인을 의미하지 않습니다.",
      evidence: `SYNTHETIC-${row.sources[0]}`,
    },
    at,
  );
}
workspace = applyCommand(workspace, { action: "close", expectedVersion: workspace.version }, at);
mkdirSync("fixtures", { recursive: true });
mkdirSync("migrations", { recursive: true });
writeFileSync(
  "fixtures/closed-package.json",
  JSON.stringify(
    {
      snapshot: workspace.close,
      audit: workspace.events,
      notice: "Deterministic synthetic fixture. Not a real financial close.",
    },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  "fixtures/baseline.json",
  JSON.stringify(
    { ruleVersion: RULE_VERSION, dataset: "lumiere-2026-08-synthetic", summary: baseline },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  "fixtures/reconciliation-contract.json",
  JSON.stringify(
    {
      generatedBy: "TypeScript reconciliation domain",
      request: contractRequest,
      expected: contractExpected,
    },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  "migrations/001_initial.sql",
  `-- Generated from src/infrastructure/schema.ts by npm run fixtures.\n${SCHEMA.trim()}\n`,
);
writeFileSync(
  "migrations/002_jsonb_guards.sql",
  `-- Generated from src/infrastructure/schema.ts by npm run fixtures.\n${JSONB_GUARDS.trim()}\n`,
);
console.log(
  JSON.stringify({
    fixture: "fixtures/closed-package.json",
    rows: baseline.total,
    exceptions: baseline.issues,
    hash: workspace.close!.hash,
  }),
);
writeFileSync(
  "migrations/003_review_drafts.sql",
  `-- Generated from src/infrastructure/schema.ts by npm run fixtures.\n${REVIEW_DRAFT_STORAGE.trim()}\n`,
);
