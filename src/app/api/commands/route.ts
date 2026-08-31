import { commandSchema, workspaceView } from "@/application/workbench";
import {
  apiError,
  assertSameOrigin,
  json,
  readJson,
  repository,
  sessionHash,
} from "@/infrastructure/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const command = commandSchema.parse(await readJson(request));
    const result = await (
      await repository()
    ).execute(await sessionHash(), request.headers.get("idempotency-key") || "", command);
    const response = json(workspaceView(result.workspace));
    response.headers.set("Idempotency-Replayed", String(result.replayed));
    return response;
  } catch (error) {
    return apiError(error);
  }
}
