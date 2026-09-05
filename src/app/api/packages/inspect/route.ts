import { inspectPackage } from "@/application/package-inspection";
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
  return observeRequest(request, "package.inspect", async () => {
    assertSameOrigin(request);
    await (await repository()).get(await sessionHash());
    return json(inspectPackage(await readJson(request, { maxBytes: 5_000_000 })));
  });
}
