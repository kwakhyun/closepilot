import { getDatabase } from "@/infrastructure/database";
import {
  hashToken,
  json,
  libraryToken,
  observeRequest,
  repository,
  sessionHash,
} from "@/infrastructure/http";
import { WorkspaceLibrary } from "@/infrastructure/workspace-library";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return observeRequest(request, "followups.list", async () => {
    const current = await (await repository()).get(await sessionHash());
    const owner = await libraryToken();
    return json({
      expectedVersion: current.version,
      scope: current.draftScope,
      sources: owner
        ? await new WorkspaceLibrary(await getDatabase()).followups(hashToken(owner), current)
        : [],
    });
  });
}
