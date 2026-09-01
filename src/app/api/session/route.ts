import { randomBytes } from "node:crypto";
import { workspaceView } from "@/application/workbench";
import {
  COOKIE_NAME,
  assertSameOrigin,
  hashToken,
  json,
  observeRequest,
  repository,
} from "@/infrastructure/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return observeRequest(request, "session.create", async () => {
    assertSameOrigin(request);
    const token = randomBytes(32).toString("hex");
    const address = process.env.VERCEL
      ? request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown"
      : "local";
    const workspace = await (
      await repository()
    ).create(hashToken(token), hashToken(`${new Date().toISOString().slice(0, 10)}:${address}`));
    const response = json(workspaceView(workspace), 201);
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 6 * 60 * 60,
    });
    return response;
  });
}
