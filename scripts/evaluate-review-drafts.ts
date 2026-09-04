import { readFile } from "node:fs/promises";
import {
  validateGroundedDraft,
  type ReviewDraftGrounding,
  type ReviewDraftResponse,
} from "../src/domain/review-draft";

interface EvaluationCase {
  name: string;
  kind: string;
  minimumCitations: number;
  forbiddenClaims: string[];
}

interface EvaluationRow {
  key: string;
  kind: string;
  channel: string;
  orderId: string;
  sources: string[];
  resolution?: unknown;
  gross: number;
  refund: number;
  expectedFee: number;
  actualFee: number;
  expectedNet: number;
  actualNet: number;
  delta: number;
  date: string;
  dueDate: string | null;
  paidDate: string | null;
}

interface EvaluationSettlement {
  id: string;
  channel: string;
  orderId: string;
  net: number;
  fee: number;
  dueDate: string;
  paidDate: string | null;
}

interface EvaluationWorkspace {
  version: number;
  rows: EvaluationRow[];
  settlements: EvaluationSettlement[];
}

interface ErrorResponse {
  error?: { message?: string };
}

const args = process.argv.slice(2);
const baseUrl = new URL(
  args.find((argument) => !argument.startsWith("--")) ?? "http://127.0.0.1:3000",
);
const allowRemote = args.includes("--allow-remote");
const requireAi = args.includes("--require-ai");
if (!["localhost", "127.0.0.1", "::1"].includes(baseUrl.hostname) && !allowRemote)
  throw new Error("Remote evaluations require the explicit --allow-remote flag.");

async function main() {
  const cases = JSON.parse(
    await readFile(new URL("../fixtures/review-draft-evals.json", import.meta.url), "utf8"),
  ) as EvaluationCase[];
  const session = await fetch(new URL("/api/session", baseUrl), {
    method: "POST",
    headers: { Origin: baseUrl.origin },
  });
  if (!session.ok) throw new Error(`Session setup failed: ${session.status}`);
  const cookie = session.headers.get("set-cookie")?.split(";", 1)[0];
  const workspace = (await session.json()) as EvaluationWorkspace;

  const results = [];
  for (const testCase of cases) {
    const row = workspace.rows.find(
      (candidate) => candidate.kind === testCase.kind && !candidate.resolution,
    );
    if (!row) throw new Error(`No unresolved ${testCase.kind} row found`);
    const response = await fetch(new URL("/api/review-draft", baseUrl), {
      method: "POST",
      headers: {
        Origin: baseUrl.origin,
        ...(cookie ? { Cookie: cookie } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rowKey: row.key, expectedVersion: workspace.version }),
    });
    const body = (await response.json()) as ReviewDraftResponse & ErrorResponse;
    if (!response.ok)
      throw new Error(`${testCase.name}: ${body.error?.message || response.status}`);

    const relatedSettlements = workspace.settlements.filter(
      (entry) => entry.channel === row.channel && entry.orderId === row.orderId,
    );
    const grounding: ReviewDraftGrounding = {
      allowedCitationIds: [
        ...new Set([...row.sources, ...relatedSettlements.map((entry) => entry.id)]),
      ],
      allowedAmounts: [
        row.gross,
        row.refund,
        row.expectedFee,
        row.actualFee,
        row.expectedNet,
        row.actualNet,
        row.delta,
        ...relatedSettlements.flatMap((entry) => [entry.net, entry.fee]),
      ],
      allowedDates: [
        row.date,
        row.dueDate,
        row.paidDate,
        ...relatedSettlements.flatMap((entry) => [entry.dueDate, entry.paidDate]),
      ].filter((value): value is string => Boolean(value)),
    };
    const combined = [
      body.draft.summary,
      body.draft.note,
      body.draft.evidenceReference,
      ...body.draft.checks,
    ].join(" ");
    let groundingError: string | null = null;
    try {
      validateGroundedDraft(body.draft, grounding);
    } catch (error) {
      groundingError = error instanceof Error ? error.message : "Unknown grounding error";
    }
    const passed =
      groundingError === null &&
      body.draft.citations.length >= testCase.minimumCitations &&
      testCase.forbiddenClaims.every((claim) => !combined.includes(claim)) &&
      (!requireAi || body.mode === "ai");
    results.push({
      name: testCase.name,
      passed,
      mode: body.mode,
      citations: body.draft.citations,
      latencyMs: body.latencyMs,
      groundingError,
      aiModeRequired: requireAi,
    });
  }

  console.log(
    JSON.stringify({ passed: results.every((result) => result.passed), results }, null, 2),
  );
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
