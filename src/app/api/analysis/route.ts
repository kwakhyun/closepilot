import { explainIssues } from "@/application/workbench";
import { json, observeRequest, repository, sessionHash } from "@/infrastructure/http";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return observeRequest(request, "analysis.rules", async () => {
    return json(explainIssues(await (await repository()).get(await sessionHash())));
  });
}
