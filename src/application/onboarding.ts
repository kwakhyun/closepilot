import { createProfileSnapshot } from "@/domain/onboarding";
import type { Workspace } from "@/domain/model";
import { workspaceProfile } from "./workbench";

export function cloneWorkspaceProfile(workspace: Workspace, brandName: string) {
  const source = workspaceProfile(workspace);
  const identity = createProfileSnapshot(source.templateId, brandName);
  return {
    ...structuredClone(source),
    id: identity.id,
    brandName: identity.brandName,
    monogram: identity.monogram,
    clonedFrom: source.id,
  };
}
