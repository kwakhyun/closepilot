import { commandSchema, workspaceView } from "@/application/workbench";
import {
  assertSameOrigin,
  json,
  observeRequest,
  readJson,
  repository,
  sessionHash,
  libraryToken,
  hashToken,
} from "@/infrastructure/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return observeRequest(request, "workspace.command", async ({ requestId }) => {
    assertSameOrigin(request);
    const command = commandSchema.parse(await readJson(request));
    const startedAt = performance.now();
    const owner = command.action === "record_followup" ? await libraryToken() : undefined;
    const result = await (
      await repository()
    ).execute(
      await sessionHash(),
      request.headers.get("idempotency-key") || "",
      command,
      request.headers.get("x-workspace-scope") || undefined,
      owner ? hashToken(owner) : undefined,
    );
    const response = json(workspaceView(result.workspace));
    response.headers.set("Idempotency-Replayed", String(result.replayed));
    response.headers.set("X-ClosePilot-Operation", command.action);
    console.info(
      JSON.stringify({
        level: "info",
        event: "workspace_command_completed",
        requestId,
        action: command.action,
        replayed: result.replayed,
        durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      }),
    );
    return response;
  });
}
