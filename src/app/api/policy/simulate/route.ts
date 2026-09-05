import { simulationSchema, simulatePolicy } from "@/application/policy-simulation";
import { DomainError } from "@/domain/model";
import {
  assertSameOrigin,
  json,
  observeRequest,
  readJson,
  repository,
  sessionHash,
} from "@/infrastructure/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return observeRequest(request, "policy.simulate", async () => {
    assertSameOrigin(request);
    const input = simulationSchema.parse(await readJson(request));
    const workspace = await (await repository()).get(await sessionHash());
    const scope = request.headers.get("x-workspace-scope");
    if (scope && scope !== workspace.draftScope)
      throw new DomainError(
        "WORKSPACE_CHANGED",
        "다른 탭에서 작업이 전환되었습니다. 현재 작업을 다시 여세요.",
        409,
      );
    return json(simulatePolicy(workspace, input));
  });
}
