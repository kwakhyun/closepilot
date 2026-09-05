import { randomBytes } from "node:crypto";
import { z } from "zod";
import { workspaceView } from "@/application/workbench";
import { DomainError } from "@/domain/model";
import { getDatabase } from "@/infrastructure/database";
import { WorkspaceLibrary } from "@/infrastructure/workspace-library";
import {
  COOKIE_NAME,
  assertSameOrigin,
  hashToken,
  json,
  libraryToken,
  observeRequest,
  readJson,
} from "@/infrastructure/http";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return observeRequest(request, "library.list", async () => {
    const token = await libraryToken();
    return json({
      workspaces: token
        ? await new WorkspaceLibrary(await getDatabase()).list(hashToken(token))
        : [],
    });
  });
}
export async function POST(request: Request) {
  return observeRequest(request, "library.open", async () => {
    assertSameOrigin(request);
    const { id } = z
      .object({ id: z.string().uuid() })
      .strict()
      .parse(await readJson(request));
    const owner = await libraryToken();
    if (!owner)
      throw new DomainError("NO_SESSION", "이 브라우저의 보관함을 찾을 수 없습니다.", 401);
    const token = randomBytes(32).toString("hex");
    const workspace = await new WorkspaceLibrary(await getDatabase()).open(
      hashToken(owner),
      id,
      hashToken(token),
    );
    const response = json(workspaceView(workspace));
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
