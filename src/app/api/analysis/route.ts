import { explainIssues } from "@/application/workbench";
import { apiError, json, repository, sessionHash } from "@/infrastructure/http";

export const runtime = "nodejs";
export async function GET() {
  try {
    return json(explainIssues(await (await repository()).get(await sessionHash())));
  } catch (error) {
    return apiError(error);
  }
}
