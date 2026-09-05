import { SCHEMA, JSONB_GUARDS, REVIEW_DRAFT_STORAGE, WORKSPACE_LIBRARY } from "./schema";

export interface DbSession {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    query: string,
    params?: unknown[],
  ): Promise<T[]>;
}
export interface Database extends DbSession {
  transaction<T>(fn: (transaction: DbSession) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function createDatabase(
  connection?: string,
  localPath = ".data/closepilot",
): Promise<Database> {
  let database: Database;
  if (connection) {
    const { default: postgres } = await import("postgres");
    const client = postgres(connection, {
      max: 3,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
    });
    database = {
      async query<T extends Record<string, unknown>>(query: string, params: unknown[] = []) {
        return Array.from(await client.unsafe<T[]>(query, params as never[]));
      },
      async transaction<T>(fn: (transaction: DbSession) => Promise<T>) {
        const value = await client.begin(async (transaction) =>
          fn({
            async query<R extends Record<string, unknown>>(query: string, params: unknown[] = []) {
              return Array.from(await transaction.unsafe<R[]>(query, params as never[]));
            },
          }),
        );
        return value as T;
      },
      async close() {
        await client.end();
      },
    };
    // Fixed, developer-owned migration SQL; never interpolate user input here.
    await client.begin(async (transaction) => {
      await transaction.unsafe("SELECT pg_advisory_xact_lock(73462101)");
      await transaction.unsafe(
        "CREATE TABLE IF NOT EXISTS closepilot_schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
      );
      const migrations = await transaction.unsafe(
        "SELECT version FROM closepilot_schema_migrations WHERE version IN (1, 2, 3, 4)",
      );
      if (!migrations.some((migration) => migration.version === 1)) {
        await transaction.unsafe(SCHEMA);
        await transaction.unsafe("INSERT INTO closepilot_schema_migrations(version) VALUES (1)");
      }
      if (!migrations.some((migration) => migration.version === 2)) {
        await transaction.unsafe(JSONB_GUARDS);
        await transaction.unsafe("INSERT INTO closepilot_schema_migrations(version) VALUES (2)");
      }
      if (!migrations.some((migration) => migration.version === 3)) {
        await transaction.unsafe(REVIEW_DRAFT_STORAGE);
        await transaction.unsafe("INSERT INTO closepilot_schema_migrations(version) VALUES (3)");
      }
      if (!migrations.some((migration) => migration.version === 4)) {
        await transaction.unsafe(WORKSPACE_LIBRARY);
        await transaction.unsafe("INSERT INTO closepilot_schema_migrations(version) VALUES (4)");
      }
    });
  } else {
    if (process.env.VERCEL)
      throw new Error(
        "DATABASE_URL is required on Vercel; ephemeral memory storage is intentionally disabled.",
      );
    if (localPath !== "memory://") {
      const { mkdir } = await import("node:fs/promises");
      const { dirname, resolve } = await import("node:path");
      await mkdir(dirname(resolve(localPath)), { recursive: true });
    }
    const { PGlite } = await import("@electric-sql/pglite");
    const client = new PGlite(localPath);
    await client.exec(SCHEMA);
    await client.exec(JSONB_GUARDS);
    await client.exec(REVIEW_DRAFT_STORAGE);
    await client.exec(WORKSPACE_LIBRARY);
    database = {
      async query<T extends Record<string, unknown>>(query: string, params: unknown[] = []) {
        return (await client.query<T>(query, params)).rows;
      },
      async transaction<T>(fn: (transaction: DbSession) => Promise<T>) {
        return client.transaction((transaction) =>
          fn({
            async query<R extends Record<string, unknown>>(query: string, params: unknown[] = []) {
              return (await transaction.query<R>(query, params)).rows;
            },
          }),
        );
      },
      async close() {
        await client.close();
      },
    };
  }
  return database;
}

const runtimeCache = globalThis as typeof globalThis & { closepilotDatabase?: Promise<Database> };
export function getDatabase(): Promise<Database> {
  runtimeCache.closepilotDatabase ??= createDatabase(
    process.env.DATABASE_URL || undefined,
    process.env.PGLITE_PATH || ".data/closepilot",
  ).catch((error) => {
    runtimeCache.closepilotDatabase = undefined;
    throw error;
  });
  return runtimeCache.closepilotDatabase;
}
