import { followupEvidence } from "@/domain/followup";
import type { Workspace } from "@/domain/model";

export function followupView(current: Workspace, source: Workspace, id: string) {
  if (!source.close) return null;
  return {
    id,
    hash: source.close.hash,
    period: source.close.period,
    items: source.close.resolutions
      .filter((entry) => entry.disposition === "carry_forward")
      .map((entry) => followupEvidence(current, source, source.close!.hash, entry.rowKey)),
  };
}
export type FollowupView = NonNullable<ReturnType<typeof followupView>>;
