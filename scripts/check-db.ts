import { createDatabase } from "../src/infrastructure/database";

async function main() {
  const memory = process.argv.includes("--memory");
  const database = await createDatabase(
    memory ? undefined : process.env.DATABASE_URL || undefined,
    memory ? "memory://" : ".data/closepilot-probe",
  );
  try {
    console.log(
      JSON.stringify({
        status: "ok",
        storage: memory || !process.env.DATABASE_URL ? "embedded-postgresql" : "postgresql",
        result: await database.query("SELECT 1 AS ready"),
      }),
    );
  } finally {
    await database.close();
  }
}
main().catch((error) => {
  console.error(
    process.env.DATABASE_URL
      ? "Database check failed. Verify the private connection configuration."
      : error,
  );
  process.exitCode = 1;
});
