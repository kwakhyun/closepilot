import { DomainError, type Workspace } from "@/domain/model";
import { seedWorkspace } from "@/domain/seed";
import { digest } from "@/domain/canonical";
import { applyCommand, type Command } from "@/application/workbench";
import type { Database, DbSession } from "./database";

const TTL_MS = 6 * 60 * 60 * 1000;
async function recordEvents(
  transaction: DbSession,
  session: string,
  workspace: Workspace,
  start: number,
) {
  for (let index = start; index < workspace.events.length; index++) {
    await transaction.query(
      "INSERT INTO closepilot_audit_events(session_hash, sequence, event) VALUES ($1, $2, $3::jsonb)",
      [session, index + 1, workspace.events[index]],
    );
  }
}
async function consumeLimit(
  transaction: DbSession,
  bucket: string,
  maximum: number,
  expiresAt: string,
) {
  const [counter] = await transaction.query<{ hits: number }>(
    "INSERT INTO closepilot_rate_limits(bucket, hits, expires_at) VALUES ($1, 1, $2) ON CONFLICT (bucket) DO UPDATE SET hits = closepilot_rate_limits.hits + 1 RETURNING hits",
    [bucket, expiresAt],
  );
  if (counter.hits > maximum)
    throw new DomainError(
      "RATE_LIMITED",
      "데모 세션 생성 한도를 초과했습니다. 나중에 다시 시도하세요.",
      429,
    );
}

export class WorkspaceRepository {
  constructor(private database: Database) {}
  async create(session: string, clientBucket: string, now = new Date()): Promise<Workspace> {
    const workspace = seedWorkspace(now.toISOString());
    return this.database.transaction(async (transaction) => {
      await transaction.query("DELETE FROM closepilot_workspaces WHERE expires_at < $1", [
        now.toISOString(),
      ]);
      await transaction.query("DELETE FROM closepilot_rate_limits WHERE expires_at < $1", [
        now.toISOString(),
      ]);
      const hour = now.toISOString().slice(0, 13),
        day = now.toISOString().slice(0, 10);
      const expiry = new Date(now.getTime() + TTL_MS).toISOString();
      await consumeLimit(transaction, `sessions:${clientBucket}:${hour}`, 10, expiry);
      await consumeLimit(
        transaction,
        `global:${day}`,
        250,
        new Date(now.getTime() + 86_400_000).toISOString(),
      );
      await transaction.query(
        "INSERT INTO closepilot_workspaces(session_hash, state, version, status, expires_at) VALUES ($1, $2::jsonb, $3, $4, $5)",
        [session, workspace, workspace.version, workspace.status, expiry],
      );
      await recordEvents(transaction, session, workspace, 0);
      return workspace;
    });
  }
  async get(session: string): Promise<Workspace> {
    const [result] = await this.database.query<{ state: Workspace }>(
      "SELECT state FROM closepilot_workspaces WHERE session_hash = $1 AND expires_at > now()",
      [session],
    );
    if (!result)
      throw new DomainError(
        "SESSION_EXPIRED",
        "데모 세션이 만료되었습니다. 새 데모를 시작하세요.",
        401,
      );
    return result.state;
  }
  async execute(
    session: string,
    key: string,
    command: Command,
  ): Promise<{ workspace: Workspace; replayed: boolean }> {
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key))
      throw new DomainError(
        "INVALID_IDEMPOTENCY_KEY",
        "Idempotency-Key 헤더에 영문, 숫자, 밑줄(_), 하이픈(-)으로 구성된 16~100자의 요청 키를 입력하세요.",
        400,
      );
    const requestHash = digest(command);
    return this.database.transaction(async (transaction) => {
      const [result] = await transaction.query<{ state: Workspace }>(
        "SELECT state FROM closepilot_workspaces WHERE session_hash = $1 AND expires_at > now() FOR UPDATE",
        [session],
      );
      if (!result)
        throw new DomainError(
          "SESSION_EXPIRED",
          "데모 세션이 만료되었습니다. 새 데모를 시작하세요.",
          401,
        );
      const [receipt] = await transaction.query<{ request_hash: string }>(
        "SELECT request_hash FROM closepilot_receipts WHERE session_hash = $1 AND idempotency_key = $2",
        [session, key],
      );
      if (receipt) {
        if (receipt.request_hash !== requestHash)
          throw new DomainError(
            "IDEMPOTENCY_CONFLICT",
            "같은 요청 키를 다른 내용에 재사용할 수 없습니다.",
            409,
          );
        return { workspace: result.state, replayed: true };
      }
      if (result.state.events.length >= 100)
        throw new DomainError(
          "COMMAND_LIMIT",
          "데모의 변경 기록이 최대 100개에 도달했습니다. 필요한 결과를 내려받은 뒤 새 데모를 시작하세요.",
          429,
        );
      const workspace = applyCommand(result.state, command);
      await transaction.query(
        "UPDATE closepilot_workspaces SET state = $2::jsonb, version = $3, status = $4 WHERE session_hash = $1",
        [session, workspace, workspace.version, workspace.status],
      );
      await recordEvents(transaction, session, workspace, result.state.events.length);
      await transaction.query(
        "INSERT INTO closepilot_receipts(session_hash, idempotency_key, request_hash, version_after) VALUES ($1, $2, $3, $4)",
        [session, key, requestHash, workspace.version],
      );
      return { workspace, replayed: false };
    });
  }
}
