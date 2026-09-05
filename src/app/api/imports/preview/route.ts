import { z } from "zod";
import { CsvValidationError, importCsv, parseCsv, suggestMapping } from "@/domain/csv";
import { DomainError } from "@/domain/model";
import { previewImport } from "@/application/import-preview";
import { workspaceProfile } from "@/application/workbench";
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
    expectedVersion: z.number().int().positive().optional(),
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
      const parsed = importCsv(
        body.csv,
        body.kind,
        mapping,
        "PREVIEW",
        workspace.period,
        workspaceProfile(workspace).policy.enabledChannels,
      );
      const impact = previewImport(workspace, {
        action: "import",
        kind: body.kind,
        csv: body.csv,
        mapping,
        expectedVersion: body.expectedVersion ?? workspace.version,
        filename: "preview.csv",
      });
      return json({
        valid: true,
        headers,
        mapping,
        count: parsed.count,
        preview: parsed.preview,
        errors: [],
        issues: [],
        impact,
      });
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      if (error.code === "VERSION_CONFLICT") throw error;
      return json({
        valid: false,
        headers,
        mapping,
        count: 0,
        preview: [],
        errors: [(error as Error).message],
        issues:
          error instanceof CsvValidationError
            ? error.issues
            : [{ row: 0, field: "파일", message: error.message }],
        impact: null,
      });
    }
  });
}
