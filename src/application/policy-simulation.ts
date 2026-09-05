import { z } from "zod";
import { DomainError, type Workspace } from "@/domain/model";
import { workspaceView, workspaceProfile } from "./workbench";

const bps = z.number().int().min(0).max(10_000);
export const simulationSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    feeBps: z.object({ d2c: bps, naver: bps, coupang: bps }).strict(),
  })
  .strict();
export function simulatePolicy(workspace: Workspace, input: z.infer<typeof simulationSchema>) {
  if (workspace.version !== input.expectedVersion)
    throw new DomainError(
      "VERSION_CONFLICT",
      "자료가 변경되었습니다. 최신 자료로 다시 비교하세요.",
      409,
    );
  const before = workspaceView(workspace);
  const candidate = structuredClone(workspace);
  candidate.profile = structuredClone(workspaceProfile(workspace));
  candidate.profile.policy.feeBps = input.feeBps;
  const after = workspaceView(candidate);
  return {
    expectedVersion: workspace.version,
    feeBps: input.feeBps,
    before: before.summary,
    after: after.summary,
    changes: after.rows.flatMap((row) => {
      const previous = before.rows.find((entry) => entry.key === row.key)!;
      return previous.expectedFee === row.expectedFee && previous.kind === row.kind
        ? []
        : [
            {
              rowKey: row.key,
              orderId: row.orderId,
              beforeFee: previous.expectedFee,
              afterFee: row.expectedFee,
              beforeKind: previous.kind,
              afterKind: row.kind,
              needsReview: !!previous.resolution && !row.resolution,
            },
          ];
    }),
  };
}
export type PolicySimulation = ReturnType<typeof simulatePolicy>;
