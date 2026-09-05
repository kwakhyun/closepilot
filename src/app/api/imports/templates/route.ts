import { workspaceProfile } from "@/application/workbench";
import { getDatabase } from "@/infrastructure/database";
import { WorkspaceLibrary } from "@/infrastructure/workspace-library";
import {
  hashToken,
  json,
  libraryToken,
  observeRequest,
  repository,
  sessionHash,
} from "@/infrastructure/http";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return observeRequest(request, "import.templates", async () => {
    const workspace = await (await repository()).get(await sessionHash());
    const owner = await libraryToken();
    return json({
      templates: owner
        ? await new WorkspaceLibrary(await getDatabase()).mappings(
            hashToken(owner),
            workspaceProfile(workspace).id,
          )
        : [],
    });
  });
}
