import { readFile } from "node:fs/promises";
import { inject } from "vitest";
import { createDatabase, type Database } from "@/infrastructure/database";

let preparedDatabase: Database | undefined;

async function restoreLocalDatabase() {
  const snapshotPath = inject("pgliteSnapshot");
  if (!snapshotPath) throw new Error("The database project must prepare its PGlite fixture first.");
  const snapshot = new Blob([new Uint8Array(await readFile(snapshotPath))]);
  return createDatabase(undefined, "memory://", snapshot);
}

export async function prepareTestDatabase() {
  if (!process.env.TEST_DATABASE_URL) preparedDatabase = await restoreLocalDatabase();
}

export async function closeUnusedTestDatabase() {
  const database = preparedDatabase;
  preparedDatabase = undefined;
  await database?.close();
}

export async function createTestDatabase() {
  if (process.env.TEST_DATABASE_URL) return createDatabase(process.env.TEST_DATABASE_URL);

  // setupFiles prepares one runtime per isolated test file. Consume it once so
  // callers asking for another database still receive independent table data.
  const database = preparedDatabase;
  preparedDatabase = undefined;
  return database ?? restoreLocalDatabase();
}
