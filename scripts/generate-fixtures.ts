import { mkdirSync, writeFileSync } from "node:fs";
import { seedWorkspace } from "../src/domain/seed";
import { applyCommand, reviewedRows, workspaceView } from "../src/application/workbench";
import { SCHEMA, JSONB_GUARDS } from "../src/infrastructure/schema";

const at = "2026-08-31T09:00:00.000Z";
let workspace = seedWorkspace(at);
const baseline = workspaceView(workspace).summary;
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
    { ruleVersion: "krw-net-v1.0.0", dataset: "lumiere-2026-08-synthetic", summary: baseline },
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
