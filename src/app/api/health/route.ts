import { getDatabase } from "@/infrastructure/database";
import { json } from "@/infrastructure/http";

export const runtime = "nodejs";
export async function GET() {
  try {
    await (await getDatabase()).query("SELECT 1 AS ready");
    return json({
      status: "ok",
      service: "closepilot",
      storage: process.env.DATABASE_URL ? "postgresql" : "embedded-postgresql",
      mode: "synthetic-sandbox",
    });
  } catch {
    return json({ status: "unavailable", service: "closepilot" }, 503);
  }
}
