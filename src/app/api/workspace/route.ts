import { workspaceView } from "@/application/workbench";
import { json, observeRequest, repository, sessionHash } from "@/infrastructure/http";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return observeRequest(request, "workspace.read", async () => {
    const session = await sessionHash();
    return json(workspaceView(await (await repository()).get(session)));
  });
}
