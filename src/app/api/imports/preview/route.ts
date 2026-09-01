import { z } from "zod";
import { importCsv, parseCsv, suggestMapping } from "@/domain/csv";
import {
  assertSameOrigin,
  json,
  observeRequest,
  readJson,
  repository,
  sessionHash,
} from "@/infrastructure/http";

const schema = z
  .object({
    kind: z.enum(["orders", "settlements"]),
    csv: z.string().max(256_000),
    mapping: z.record(z.string().max(50), z.string().max(100)).optional(),
  })
  .strict();
export const runtime = "nodejs";
export async function POST(request: Request) {
  return observeRequest(request, "import.preview", async () => {
    assertSameOrigin(request);
    const body = schema.parse(await readJson(request));
    const workspace = await (await repository()).get(await sessionHash());
    const [headers] = parseCsv(body.csv);
    const mapping = body.mapping ?? suggestMapping(headers, body.kind);
    try {
      const parsed = importCsv(body.csv, body.kind, mapping, "PREVIEW", workspace.period);
      return json({
        valid: true,
        headers,
        mapping,
        count: parsed.count,
        preview: parsed.preview,
        errors: [],
      });
    } catch (error) {
      return json({
        valid: false,
        headers,
        mapping,
        count: 0,
        preview: [],
        errors: [(error as Error).message],
      });
    }
  });
}
