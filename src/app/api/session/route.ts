import { randomBytes } from "node:crypto";
import { z } from "zod";
import { workspaceView } from "@/application/workbench";
import {
  COOKIE_NAME,
  assertSameOrigin,
  hashToken,
  json,
  observeRequest,
  readJson,
  repository,
  sessionHash,
} from "@/infrastructure/http";

export const runtime = "nodejs";
const sessionOptionsSchema = z
  .object({
    templateId: z.enum(["lumiere-beauty-v1", "morrow-food-v1"]).optional(),
    brandName: z.string().trim().min(2).max(40).optional(),
    showcase: z.literal("completed").optional(),
    cloneCurrent: z.literal(true).optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.cloneCurrent
        ? !!value.brandName && !!value.expectedVersion && !value.templateId && !value.showcase
        : value.expectedVersion === undefined,
    { message: "설정 복제에는 새 브랜드명과 현재 버전이 필요합니다." },
  );

export async function readSessionOptions(request: Request) {
  if (!request.headers.get("content-type")) return {};
  return sessionOptionsSchema.parse(await readJson(request, { allowEmpty: true }));
}

export async function POST(request: Request) {
  return observeRequest(request, "session.create", async () => {
    assertSameOrigin(request);
    const { cloneCurrent, expectedVersion, ...options } = await readSessionOptions(request);
    const clone = cloneCurrent
      ? {
          session: await sessionHash(),
          expectedVersion: expectedVersion!,
          brandName: options.brandName!,
        }
      : undefined;
    const token = randomBytes(32).toString("hex");
    const address = process.env.VERCEL
      ? request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown"
      : "local";
    const workspace = await (
      await repository()
    ).create(
      hashToken(token),
      hashToken(`${new Date().toISOString().slice(0, 10)}:${address}`),
      new Date(),
      options,
      clone,
    );
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
