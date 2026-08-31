import { workspaceView } from "@/application/workbench";
import { apiError, json, repository, sessionHash } from "@/infrastructure/http";

export const runtime = "nodejs";
export async function GET() {
  try {
    const session = await sessionHash();
    return json(workspaceView(await (await repository()).get(session)));
  } catch (error) {
    return apiError(error);
  }
}
