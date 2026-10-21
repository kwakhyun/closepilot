import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { TestProject } from "vitest/node";

export default async function setup(project: TestProject) {
  if (process.env.TEST_DATABASE_URL) return;

  // initdb is expensive on a cold runtime. Prepare only the empty PostgreSQL
  // cluster once; every suite still runs our migrations on its own database.
  const directory = await mkdtemp(join(tmpdir(), "closepilot-test-cluster-"));
  const snapshotPath = join(directory, "empty-cluster.tar");
  const client = new PGlite("memory://");
  try {
    await client.waitReady;
    const snapshot = await client.dumpDataDir("none");
    await writeFile(snapshotPath, Buffer.from(await snapshot.arrayBuffer()));
    project.provide("pgliteSnapshot", snapshotPath);
    await client.close();
  } catch (error) {
    // Keep the original preparation error if cleanup also fails.
    await client.close().catch(() => {});
    await rm(directory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }

  return () => rm(directory, { recursive: true, force: true });
}
