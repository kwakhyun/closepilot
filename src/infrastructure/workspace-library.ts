import { DomainError, type Workspace } from "@/domain/model";
import type { Database, DbSession } from "./database";
import { followupView } from "@/application/followup";

export const ACCESS_MS = 6 * 60 * 60 * 1000;
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export async function attachLibrary(
  transaction: DbSession,
  workspace: string,
  owner: string,
  handle: string,
  now: Date,
) {
  await transaction.query(
    "INSERT INTO closepilot_library(workspace_hash, owner_hash, handle, created_at) VALUES ($1, $2, $3, $4)",
    [workspace, owner, handle, now.toISOString()],
  );
  await transaction.query(
    "INSERT INTO closepilot_access_sessions(token_hash, workspace_hash, expires_at) VALUES ($1, $1, $2)",
    [workspace, new Date(now.getTime() + ACCESS_MS).toISOString()],
  );
}

export class WorkspaceLibrary {
  constructor(private database: Database) {}

  async resolve(tokenHash: string) {
    const [access] = await this.database.query<{ workspace_hash: string; active: boolean }>(
      "SELECT workspace_hash, expires_at > now() AS active FROM closepilot_access_sessions WHERE token_hash = $1",
      [tokenHash],
    );
    if (access) {
      if (!access.active)
        throw new DomainError(
          "SESSION_EXPIRED",
          "작업 세션이 만료되었습니다. 보관함에서 다시 열어 주세요.",
          401,
        );
      return access.workspace_hash;
    }
    // Only pre-migration, six-hour workspaces may use the legacy token lookup.
    const [managed] = await this.database.query(
      "SELECT 1 FROM closepilot_library WHERE workspace_hash = $1",
      [tokenHash],
    );
    if (managed) throw new DomainError("SESSION_EXPIRED", "작업 세션이 만료되었습니다.", 401);
    return tokenHash;
  }

  async list(owner: string) {
    const rows = await this.database.query<{
      handle: string;
      period: string;
      brand: string;
      status: string;
      scope: string;
      created_at: Date | string;
      expires_at: Date | string;
    }>(
      `SELECT l.handle, w.state->>'period' AS period,
       coalesce(w.state->'profile'->>'brandName', 'LUMIÈRE') AS brand,
       w.status, w.state->>'draftScope' AS scope, l.created_at, w.expires_at
       FROM closepilot_library l JOIN closepilot_workspaces w ON w.session_hash = l.workspace_hash
       WHERE l.owner_hash = $1 AND w.expires_at > now()
       ORDER BY l.last_opened_at DESC, l.created_at DESC, l.handle LIMIT 12`,
      [owner],
    );
    return rows.map((row) => ({
      id: row.handle,
      period: row.period,
      brand: row.brand,
      status: row.status,
      scope: row.scope,
      createdAt: new Date(row.created_at).toISOString(),
      expiresAt: new Date(row.expires_at).toISOString(),
    }));
  }

  async open(owner: string, handle: string, tokenHash: string): Promise<Workspace> {
    return this.database.transaction(async (transaction) => {
      const [entry] = await transaction.query<{ workspace_hash: string; state: Workspace }>(
        `SELECT l.workspace_hash, w.state FROM closepilot_library l
         JOIN closepilot_workspaces w ON w.session_hash = l.workspace_hash
         WHERE l.owner_hash = $1 AND l.handle = $2 AND w.expires_at > now() FOR UPDATE OF l`,
        [owner, handle],
      );
      if (!entry)
        throw new DomainError(
          "WORKSPACE_NOT_FOUND",
          "보관된 작업을 찾을 수 없거나 보관 기간이 지났습니다.",
          404,
        );
      await transaction.query(
        "UPDATE closepilot_library SET last_opened_at = now() WHERE workspace_hash = $1",
        [entry.workspace_hash],
      );
      // Keep expired initial grants as tombstones so legacy lookup cannot revive them.
      await transaction.query(
        "DELETE FROM closepilot_access_sessions WHERE workspace_hash = $1 AND token_hash <> workspace_hash",
        [entry.workspace_hash],
      );
      await transaction.query(
        "INSERT INTO closepilot_access_sessions(token_hash, workspace_hash, expires_at) VALUES ($1, $2, now() + interval '6 hours')",
        [tokenHash, entry.workspace_hash],
      );
      return entry.state;
    });
  }

  async mappings(owner: string, profileId: string) {
    const rows = await this.database.query<{
      handle: string;
      period: string;
      mappings: NonNullable<Workspace["profile"]>["mappings"];
    }>(
      `SELECT l.handle, w.state->>'period' AS period, w.state->'profile'->'mappings' AS mappings
       FROM closepilot_library l JOIN closepilot_workspaces w ON w.session_hash = l.workspace_hash
       WHERE l.owner_hash = $1 AND w.expires_at > now() AND w.state->'profile'->>'id' = $2
       AND w.state->'profile'->'mappings'->>'updatedAt' IS NOT NULL
       ORDER BY l.created_at DESC, l.handle LIMIT 12`,
      [owner, profileId],
    );
    return rows.map((row) => ({ id: row.handle, period: row.period, mappings: row.mappings }));
  }

  async followups(owner: string, current: Workspace) {
    const rows = await this.database.query<{ handle: string; state: Workspace }>(
      `SELECT l.handle, w.state FROM closepilot_library l JOIN closepilot_workspaces w ON w.session_hash = l.workspace_hash
       WHERE l.owner_hash = $1 AND w.expires_at > now() AND w.status = 'closed'
       AND w.state->'profile'->>'id' = $2 AND w.state->>'period' < $3
       AND EXISTS (SELECT 1 FROM closepilot_library own JOIN closepilot_workspaces active ON active.session_hash = own.workspace_hash
         WHERE own.owner_hash = $1 AND active.state->>'draftScope' = $4 AND active.expires_at > now())
       ORDER BY w.state->>'period' DESC, l.created_at DESC LIMIT 12`,
      [owner, current.profile?.id ?? "", current.period, current.draftScope ?? ""],
    );
    return rows
      .map((row) => followupView(current, row.state, row.handle))
      .filter((entry) => entry !== null && entry.items.length > 0);
  }
}
