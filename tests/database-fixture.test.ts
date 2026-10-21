import { expect, it } from "vitest";
import { createTestDatabase } from "./helpers/database";

// TEST_DATABASE_URL deliberately exercises the shared disposable PostgreSQL
// service instead of the local PGlite fixture used by this regression.
it.skipIf(!!process.env.TEST_DATABASE_URL)(
  "restores separate local databases from the same empty cluster",
  async () => {
    const first = await createTestDatabase();
    try {
      await first.query(
        "INSERT INTO closepilot_rate_limits(bucket, hits, expires_at) VALUES ($1, 1, $2)",
        ["fixture-isolation", "2099-01-01T00:00:00.000Z"],
      );
      const second = await createTestDatabase();
      try {
        const rows = await second.query("SELECT bucket FROM closepilot_rate_limits");
        expect(rows).toEqual([]);
        expect(await first.query("SELECT hits FROM closepilot_rate_limits")).toEqual([{ hits: 1 }]);
        await second.query(
          "INSERT INTO closepilot_rate_limits(bucket, hits, expires_at) VALUES ($1, 2, $2)",
          ["fixture-isolation", "2099-01-01T00:00:00.000Z"],
        );
        expect(await first.query("SELECT hits FROM closepilot_rate_limits")).toEqual([{ hits: 1 }]);
      } finally {
        await second.close();
      }
    } finally {
      await first.close();
    }
  },
);
