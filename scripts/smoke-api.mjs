import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const base = (process.argv[2] || "http://127.0.0.1:3100").replace(/\/$/, "");
const remote = !["localhost", "127.0.0.1", "::1"].includes(new URL(base).hostname);
if (remote && !process.argv.includes("--allow-remote"))
  throw new Error(
    "Remote smoke tests create synthetic sessions. Pass --allow-remote only for your own deployment.",
  );
const canonical = (value) =>
  value === null || typeof value !== "object"
    ? JSON.stringify(value)
    : Array.isArray(value)
      ? `[${value.map(canonical).join(",")}]`
      : `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
          .join(",")}}`;
const hash = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const checks = [];
const started = performance.now();
let cookie = "";
let view;
async function request(
  endpoint,
  {
    method = "GET",
    body,
    key,
    session = cookie,
    origin = base,
    raw,
    contentType = "application/json",
  } = {},
) {
  const headers = {};
  if (session) headers.Cookie = session;
  if (method !== "GET") {
    headers.Origin = origin;
    headers["Content-Type"] = contentType;
  }
  if (key) headers["Idempotency-Key"] = key;
  const response = await fetch(`${base}${endpoint}`, {
    method,
    headers,
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    signal: AbortSignal.timeout(30_000),
  });
  return response;
}
async function check(name, fn) {
  await fn();
  checks.push({ name, status: "passed" });
  console.log(`PASS ${name}`);
}
async function command(body, { key = randomUUID(), expectedStatus = 200 } = {}) {
  const response = await request("/api/commands", { method: "POST", body, key });
  const data = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(data));
  if (response.ok) view = data;
  return { response, data, key };
}
await check("database readiness", async () => {
  const response = await request("/api/health");
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.status, "ok");
  if (remote) assert.equal(health.storage, "postgresql");
});
await check("unauthenticated read is denied", async () => {
  assert.equal((await request("/api/workspace")).status, 401);
});
await check("cross-origin session creation is denied", async () => {
  assert.equal(
    (await request("/api/session", { method: "POST", origin: "https://untrusted.example" })).status,
    403,
  );
});
await check("isolated HttpOnly session with a real baseline", async () => {
  const response = await request("/api/session", { method: "POST" });
  assert.equal(response.status, 201);
  const setCookie = response.headers.getSetCookie()[0];
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=lax/i);
  if (remote) assert.match(setCookie, /Secure/i);
  cookie = setCookie.split(";")[0];
  view = await response.json();
  assert.equal(view.summary.total, 128);
  assert.equal(view.summary.unresolved, 8);
});
const otherSessionResponse = await request("/api/session", { method: "POST", session: "" });
assert.equal(otherSessionResponse.status, 201);
const otherCookie = otherSessionResponse.headers.getSetCookie()[0].split(";")[0];
await check("missing idempotency key is rejected", async () => {
  assert.equal(
    (
      await request("/api/commands", {
        method: "POST",
        body: { action: "reconcile", expectedVersion: 1 },
      })
    ).status,
    400,
  );
});
await check("malformed JSON and unexpected tenant fields are rejected", async () => {
  assert.equal(
    (await request("/api/commands", { method: "POST", raw: "{", key: randomUUID() })).status,
    400,
  );
  await command(
    { action: "close", expectedVersion: 1, tenant: "another-workspace" },
    { expectedStatus: 400 },
  );
});
await check("unresolved close rolls back", async () => {
  await command({ action: "close", expectedVersion: 1 }, { expectedStatus: 409 });
  const after = await (await request("/api/workspace")).json();
  assert.equal(after.version, 1);
  assert.equal(after.events.length, 2);
});
await check("two concurrent identical requests have one effect", async () => {
  const key = randomUUID(),
    body = { action: "reconcile", expectedVersion: 1 };
  const results = await Promise.all([
    request("/api/commands", { method: "POST", body, key }),
    request("/api/commands", { method: "POST", body, key }),
  ]);
  assert(results.every((response) => response.status === 200));
  assert.equal(
    results.filter((response) => response.headers.get("idempotency-replayed") === "true").length,
    1,
  );
  view = await results[0].json();
  assert.equal(view.version, 2);
  assert.equal(view.events.length, 3);
});
await check("same key with changed content conflicts", async () => {
  const result = await command({ action: "reconcile", expectedVersion: view.version });
  await command(
    { action: "close", expectedVersion: view.version },
    { key: result.key, expectedStatus: 409 },
  );
});
await check("two concurrent stale revisions cannot both commit", async () => {
  const body = { action: "reconcile", expectedVersion: view.version };
  const results = await Promise.all([
    request("/api/commands", { method: "POST", body, key: randomUUID() }),
    request("/api/commands", { method: "POST", body, key: randomUUID() }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  view = await (await request("/api/workspace")).json();
});
const orders = await readFile(new URL("../public/samples/orders.csv", import.meta.url), "utf8");
const settlements = await readFile(
  new URL("../public/samples/settlements.csv", import.meta.url),
  "utf8",
);
await check("CSV mapping preview and invalid money checks", async () => {
  const good = await (
    await request("/api/imports/preview", { method: "POST", body: { kind: "orders", csv: orders } })
  ).json();
  assert.equal(good.valid, true);
  assert.equal(good.count, 3);
  const bad = await (
    await request("/api/imports/preview", {
      method: "POST",
      body: { kind: "orders", csv: orders.replace("100000", "=1+1") },
    })
  ).json();
  assert.equal(bad.valid, false);
});
await check("atomic import, content deduplication and fresh-run requirement", async () => {
  await command({
    action: "import",
    expectedVersion: view.version,
    kind: "orders",
    csv: orders,
    filename: "smoke_orders.csv",
  });
  assert.equal(view.lastRunAt, null);
  await command({ action: "close", expectedVersion: view.version }, { expectedStatus: 409 });
  await command(
    {
      action: "import",
      expectedVersion: view.version,
      kind: "orders",
      csv: orders,
      filename: "renamed.csv",
    },
    { expectedStatus: 409 },
  );
  await command({
    action: "import",
    expectedVersion: view.version,
    kind: "settlements",
    csv: settlements,
    filename: "smoke_settlements.csv",
  });
  await command({ action: "reconcile", expectedVersion: view.version });
  assert.equal(view.summary.total, 131);
  assert.equal(view.summary.matched, 123);
  assert.equal(view.summary.unresolved, 8);
});
await check("deterministic analysis is explicitly labelled", async () => {
  const analysis = await (await request("/api/analysis")).json();
  assert.equal(analysis.mode, "deterministic");
  assert(analysis.steps.length > 0);
});
const beforeReview = structuredClone(view.summary);
await check("evidence-backed reviews preserve original money and match counts", async () => {
  for (const row of view.rows.filter((row) => row.kind !== "matched" && !row.resolution)) {
    await command({
      action: "resolve",
      expectedVersion: view.version,
      rowKey: row.key,
      disposition:
        row.kind === "timing"
          ? "carry_forward"
          : row.kind === "duplicate"
            ? "exclude_duplicate"
            : "accepted_variance",
      note: '=HYPERLINK("https://invalid.example","synthetic injection test"); evidence reviewed',
      evidence: `SYNTHETIC-${row.sources[0]}`,
    });
  }
  assert.equal(view.summary.unresolved, 0);
  assert.equal(view.summary.matched, beforeReview.matched);
  assert.equal(view.summary.actualNet, beforeReview.actualNet);
  assert.equal(view.summary.delta, beforeReview.delta);
});
let closeKey, closeCommand;
await check("close returns evidence metadata without duplicating the package", async () => {
  closeCommand = { action: "close", expectedVersion: view.version };
  const result = await command(closeCommand);
  closeKey = result.key;
  assert.equal(view.status, "closed");
  assert.deepEqual(Object.keys(view.close).sort(), ["closedAt", "closedBy", "hash"]);
  assert.match(view.close.hash, /^[a-f0-9]{64}$/);
});
await check("closed writes are denied while identical close retries succeed", async () => {
  const version = view.version;
  await command({ action: "reconcile", expectedVersion: version }, { expectedStatus: 409 });
  const result = await command(closeCommand, { key: closeKey });
  assert.equal(result.response.headers.get("idempotency-replayed"), "true");
  assert.equal(view.version, version);
});
await check("CSV export neutralizes formula injection", async () => {
  const response = await request("/api/export?format=csv");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition"), /attachment/);
  const csv = await response.text();
  assert(csv.includes("'="));
  assert(csv.includes("expected_net_krw"));
});
let closePackage;
await check("exported package has intact snapshot and audit checksums", async () => {
  const response = await request("/api/export?format=json");
  assert.equal(response.status, 200);
  closePackage = await response.json();
  const { hash: expectedHash, ...snapshot } = closePackage.snapshot;
  assert.equal(hash(snapshot), expectedHash);
  assert.equal(snapshot.inputs.orders.length, 131);
  let previous = "GENESIS";
  for (const { hash: eventHash, ...event } of closePackage.audit) {
    assert.equal(event.previousHash, previous);
    assert.equal(hash(event), eventHash);
    previous = eventHash;
  }
  assert.equal(closePackage.snapshot.hash, view.close.hash);
});
await check("a second visitor remains unchanged", async () => {
  const other = await (await request("/api/workspace", { session: otherCookie })).json();
  assert.equal(other.version, 1);
  assert.equal(other.status, "review");
  assert.equal(other.summary.unresolved, 8);
});
await check("a forged session token reveals no workspace", async () => {
  assert.equal(
    (await request("/api/workspace", { session: `closepilot_session=${"a".repeat(64)}` })).status,
    401,
  );
});
const report = {
  target: base,
  testedAt: new Date().toISOString(),
  durationMs: Math.round(performance.now() - started),
  checks: checks.length,
  results: checks,
  finalRows: view.summary.total,
  snapshotHash: view.close.hash,
};
const reportPath = process.argv.includes("--report")
  ? process.argv[process.argv.indexOf("--report") + 1]
  : null;
if (reportPath) {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
}
await mkdir(".data", { recursive: true });
await writeFile(
  `.data/${remote ? "production" : "local"}-close.json`,
  JSON.stringify(closePackage, null, 2),
);
console.log(
  JSON.stringify({
    checks: report.checks,
    status: "passed",
    target: base,
    durationMs: report.durationMs,
  }),
);
