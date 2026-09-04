import { describe, expect, it } from "vitest";
import { buildReconciliationCsv } from "@/application/export";
import { workspaceView } from "@/application/workbench";
import { RULE_VERSION } from "@/domain/model";
import { seedWorkspace } from "@/domain/seed";

describe("reconciliation export", () => {
  it("exports the current rule version for every row", () => {
    const csv = buildReconciliationCsv(workspaceView(seedWorkspace("2026-08-31T09:00:00.000Z")));
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain('"rule_version"');
    expect(lines).toHaveLength(129);
    expect(lines.slice(1).every((line) => line.endsWith(`"${RULE_VERSION}"`))).toBe(true);
    expect(csv).not.toContain("krw-net-v1.0.0");
  });
});
