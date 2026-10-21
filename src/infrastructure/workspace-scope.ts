import { workspaceScope } from "@/application/workbench";
import { DomainError, type Workspace } from "@/domain/model";

// Scope identifies the displayed workspace. The session cookie still authorizes access.
export function assertWorkspaceScope(
  workspace: Workspace,
  expectedScope: string | null | undefined,
) {
  if (!expectedScope)
    throw new DomainError(
      "WORKSPACE_SCOPE_REQUIRED",
      "현재 작업을 확인할 수 없습니다. 화면을 새로고침한 뒤 다시 시도하세요.",
      400,
    );
  if (expectedScope !== workspaceScope(workspace))
    throw new DomainError(
      "WORKSPACE_CHANGED",
      "다른 탭에서 작업이 전환되었습니다. 현재 작업을 확인한 뒤 다시 시도하세요.",
      409,
    );
}
