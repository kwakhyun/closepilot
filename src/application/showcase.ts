import { applyCommand, reviewedRows } from "./workbench";
import { seedWorkspace, type SeedOptions } from "@/domain/seed";
import type { Workspace } from "@/domain/model";

export interface DemoSessionOptions extends SeedOptions {
  showcase?: "completed";
}

export function createDemoWorkspace(
  now = new Date().toISOString(),
  options: DemoSessionOptions = {},
): Workspace {
  let workspace = seedWorkspace(now, options);
  workspace.demoMode = "fresh";
  if (options.showcase !== "completed") return workspace;

  for (const row of reviewedRows(workspace).filter((entry) => entry.kind !== "matched")) {
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
        note: `완료 화면 확인용 합성 기록입니다. '${row.kind}' 예외의 원본 자료를 확인한 예시이며 실제 고객 승인이 아닙니다.`,
        evidence: `SHOWCASE-${row.sources[0]}`,
      },
      now,
    );
  }
  workspace = applyCommand(workspace, { action: "close", expectedVersion: workspace.version }, now);
  workspace.demoMode = "completed-showcase";
  return workspace;
}
