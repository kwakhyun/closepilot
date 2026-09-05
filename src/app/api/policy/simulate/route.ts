import { simulationSchema, simulatePolicy } from "@/application/policy-simulation";
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
    return json(simulatePolicy(workspace, input));
  });
}
