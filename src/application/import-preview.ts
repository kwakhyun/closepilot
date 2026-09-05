import { applyCommand, workspaceView, type Command } from "./workbench";
import type { Workspace } from "@/domain/model";

export function previewImport(
  workspace: Workspace,
  command: Extract<Command, { action: "import" }>,
) {
  const before = workspaceView(workspace);
  const after = workspaceView(applyCommand(workspace, command, workspace.createdAt));
  return {
    expectedVersion: workspace.version,
    before: before.summary,
    after: after.summary,
    invalidatedReviews: before.rows
      .filter(
        (row) => row.resolution && !after.rows.find((next) => next.key === row.key)?.resolution,
      )
      .map((row) => ({ rowKey: row.key, orderId: row.orderId })),
  };
}
export type ImportImpact = ReturnType<typeof previewImport>;
