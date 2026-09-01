import { readFile } from "node:fs/promises";

const baseUrl = new URL(process.argv[2] || "http://127.0.0.1:3000");
if (
  !["localhost", "127.0.0.1", "::1"].includes(baseUrl.hostname) &&
  !process.argv.includes("--allow-remote")
)
  throw new Error("Remote evaluations require the explicit --allow-remote flag.");
const cases = JSON.parse(
  await readFile(new URL("../fixtures/review-draft-evals.json", import.meta.url), "utf8"),
);
const session = await fetch(new URL("/api/session", baseUrl), {
  method: "POST",
  headers: { Origin: baseUrl.origin },
});
if (!session.ok) throw new Error(`Session setup failed: ${session.status}`);
const cookie = session.headers.get("set-cookie")?.split(";", 1)[0];
const workspace = await session.json();

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
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ rowKey: row.key, expectedVersion: workspace.version }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${testCase.name}: ${body.error?.message || response.status}`);
  const allowed = new Set([
    ...row.sources,
    ...workspace.settlements
      .filter((entry) => entry.channel === row.channel && entry.orderId === row.orderId)
      .map((entry) => entry.id),
  ]);
  const combined = `${body.draft.summary} ${body.draft.note}`;
  const passed =
    body.draft.citations.length >= testCase.minimumCitations &&
    body.draft.citations.every((citation) => allowed.has(citation)) &&
    body.draft.citations.some((citation) => body.draft.evidenceReference.includes(citation)) &&
    testCase.forbiddenClaims.every((claim) => !combined.includes(claim));
  results.push({
    name: testCase.name,
    passed,
    mode: body.mode,
    citations: body.draft.citations,
    latencyMs: body.latencyMs,
  });
}
console.log(JSON.stringify({ passed: results.every((result) => result.passed), results }, null, 2));
if (results.some((result) => !result.passed)) process.exitCode = 1;
