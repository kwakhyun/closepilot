import { performance } from "node:perf_hooks";

const baseUrl = process.argv[2] || "http://127.0.0.1:3000";
const target = new URL(baseUrl);
if (
  !["localhost", "127.0.0.1", "::1"].includes(target.hostname) &&
  !process.argv.includes("--allow-remote")
)
  throw new Error("Remote benchmarks require the explicit --allow-remote flag.");

const sessionResponse = await fetch(new URL("/api/session", target), {
  method: "POST",
  headers: { Origin: target.origin },
});
if (!sessionResponse.ok) throw new Error(`Session setup failed: ${sessionResponse.status}`);
const cookie = sessionResponse.headers.get("set-cookie")?.split(";", 1)[0];
if (!cookie) throw new Error("Session cookie was not returned.");

await fetch(new URL("/api/workspace", target), { headers: { Cookie: cookie } });

const samples = [];
let failures = 0;
const request = async () => {
  const startedAt = performance.now();
  const response = await fetch(new URL("/api/workspace", target), {
    headers: { Cookie: cookie },
  });
  samples.push(performance.now() - startedAt);
  if (!response.ok) failures++;
  await response.arrayBuffer();
};
for (let batch = 0; batch < 6; batch++) await Promise.all(Array.from({ length: 5 }, request));

samples.sort((a, b) => a - b);
const percentile = (value) =>
  samples[Math.min(samples.length - 1, Math.ceil(samples.length * value) - 1)];
console.log(
  JSON.stringify(
    {
      target: target.origin,
      requests: samples.length,
      concurrency: 5,
      errorRate: failures / samples.length,
      p50Ms: Math.round(percentile(0.5) * 10) / 10,
      p95Ms: Math.round(percentile(0.95) * 10) / 10,
      scope: "bounded workspace-read check; not a capacity or SLA benchmark",
    },
    null,
    2,
  ),
);
