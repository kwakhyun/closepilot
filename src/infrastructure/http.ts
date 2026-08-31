import { randomUUID, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DomainError } from "@/domain/model";
import { getDatabase } from "./database";
import { WorkspaceRepository } from "./repository";

export const COOKIE_NAME = "closepilot_session";
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export async function repository() {
  return new WorkspaceRepository(await getDatabase());
}
export async function sessionHash(): Promise<string> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new DomainError("NO_SESSION", "데모 세션을 시작하세요.", 401);
  return hashToken(token);
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const publicUrl = new URL(process.env.APP_ORIGIN || request.url);
  // Next may expose an internal localhost URL behind a proxy. Host is the
  // browser's destination authority, not a caller-selected tenant identifier.
  if (!process.env.APP_ORIGIN && request.headers.get("host"))
    publicUrl.host = request.headers.get("host")!;
  const expected = publicUrl.origin;
  if (!origin || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site")
    throw new DomainError("ORIGIN_DENIED", "동일한 사이트에서만 변경을 요청할 수 있습니다.", 403);
}
export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new DomainError("JSON_REQUIRED", "application/json 요청이 필요합니다.", 415);
  if (Number(request.headers.get("content-length") || 0) > 300_000)
    throw new DomainError("BODY_TOO_LARGE", "요청 크기가 제한을 초과했습니다.", 413);
  if (!request.body) throw new DomainError("INVALID_JSON", "JSON 본문이 필요합니다.", 400);
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = "",
    bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 300_000) {
        await reader.cancel();
        throw new DomainError("BODY_TOO_LARGE", "요청 크기가 제한을 초과했습니다.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("INVALID_JSON", "유효한 JSON 본문이 필요합니다.", 400);
  }
}
export function json(data: unknown, status = 200, requestId = randomUUID()) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private", "X-Request-Id": requestId },
  });
}
export function apiError(error: unknown) {
  if (error instanceof DomainError)
    return json({ error: { code: error.code, message: error.message } }, error.status);
  if (error instanceof ZodError)
    return json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "입력값을 확인하세요.",
          fields: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      400,
    );
  const requestId = randomUUID();
  console.error(
    JSON.stringify({
      level: "error",
      event: "api_failure",
      requestId,
      errorType: error instanceof Error ? error.name : "Unknown",
    }),
  );
  return json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.",
        requestId,
      },
    },
    500,
    requestId,
  );
}
