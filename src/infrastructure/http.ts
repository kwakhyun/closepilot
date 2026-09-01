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
    throw new DomainError(
      "JSON_REQUIRED",
      "Content-Type을 application/json으로 지정하고 JSON 형식으로 요청하세요.",
      415,
    );
  if (Number(request.headers.get("content-length") || 0) > 300_000)
    throw new DomainError(
      "BODY_TOO_LARGE",
      "요청에 포함된 데이터가 너무 큽니다. 크기를 줄인 뒤 다시 시도하세요.",
      413,
    );
  if (!request.body)
    throw new DomainError("INVALID_JSON", "요청 본문에 JSON 데이터를 입력하세요.", 400);
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
        throw new DomainError(
          "BODY_TOO_LARGE",
          "요청에 포함된 데이터가 너무 큽니다. 크기를 줄인 뒤 다시 시도하세요.",
          413,
        );
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("INVALID_JSON", "요청 본문의 JSON 형식을 확인하세요.", 400);
  }
}
export function json(data: unknown, status = 200, requestId = randomUUID()) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private", "X-Request-Id": requestId },
  });
}
export function apiError(error: unknown, requestId = randomUUID()) {
  if (error instanceof DomainError)
    return json({ error: { code: error.code, message: error.message } }, error.status, requestId);
  if (error instanceof ZodError)
    return json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "입력한 항목의 형식과 길이를 확인한 뒤 다시 시도하세요.",
          fields: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      400,
      requestId,
    );
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

export async function observeRequest(
  request: Request,
  operation: string,
  handler: (context: { requestId: string }) => Promise<Response>,
): Promise<Response> {
  const requestId = randomUUID();
  const startedAt = performance.now();
  let response: Response;
  try {
    response = await handler({ requestId });
  } catch (error) {
    response = apiError(error, requestId);
  }
  const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
  response.headers.set("X-Request-Id", requestId);
  response.headers.set("Server-Timing", `app;dur=${durationMs}`);
  const status = response.status;
  console.info(
    JSON.stringify({
      level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
      event: "http_request_completed",
      requestId,
      operation,
      method: request.method,
      path: new URL(request.url).pathname,
      status,
      durationMs,
    }),
  );
  return response;
}
