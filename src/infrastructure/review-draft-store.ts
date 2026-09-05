import { randomUUID } from "node:crypto";
import { DomainError, type Workspace } from "@/domain/model";
import type { ReviewDraftResponse } from "@/domain/review-draft";
import type { Database, DbSession } from "./database";

export const REVIEW_DRAFT_LIMITS = {
  sessionPerHour: 10,
  globalPerDay: 100,
  concurrent: 4,
  leaseMs: 45_000,
};

type Reservation =
  { mode: "cached"; response: ReviewDraftResponse } | { mode: "reserved"; token: string };

async function consume(transaction: DbSession, bucket: string, maximum: number, expiresAt: string) {
  const [counter] = await transaction.query<{ hits: number }>(
    "INSERT INTO closepilot_rate_limits(bucket, hits, expires_at) VALUES ($1, 1, $2) ON CONFLICT (bucket) DO UPDATE SET hits = closepilot_rate_limits.hits + 1 RETURNING hits",
    [bucket, expiresAt],
  );
  if (counter.hits > maximum)
    throw new DomainError(
      "AI_RATE_LIMITED",
      "AI 초안 생성 한도에 도달해 규칙 기반 초안을 표시합니다.",
      429,
    );
}

export class ReviewDraftStore {
  constructor(private database: Database) {}

  async reserve(
    session: string,
    expectedVersion: number,
    evidenceHash: string,
    now?: Date,
  ): Promise<Reservation> {
    return this.database.transaction(async (transaction) => {
      const [workspace] = await transaction.query<{ state: Workspace }>(
        "SELECT state FROM closepilot_workspaces WHERE session_hash = $1 AND expires_at > now() FOR UPDATE",
        [session],
      );
      if (!workspace) throw new DomainError("SESSION_EXPIRED", "데모 세션이 만료되었습니다.", 401);
      if (workspace.state.version !== expectedVersion)
        throw new DomainError(
          "VERSION_CONFLICT",
          "자료가 변경되었습니다. 최신 상태에서 다시 시도하세요.",
          409,
        );
      if (workspace.state.status === "closed")
        throw new DomainError("CLOSE_LOCKED", "마감이 확정되어 초안을 만들 수 없습니다.", 409);
      const [cached] = await transaction.query<{ response: ReviewDraftResponse | null }>(
        "SELECT response FROM closepilot_review_drafts WHERE session_hash = $1 AND evidence_hash = $2",
        [session, evidenceHash],
      );
      if (cached?.response) return { mode: "cached", response: cached.response };
      // A fixed global lock serializes admission, including across UTC day boundaries.
      await transaction.query("SELECT pg_advisory_xact_lock(73462102)");
      const admittedAt = now ?? new Date();
      const timestamp = admittedAt.toISOString();
      const pending = await transaction.query(
        "SELECT 1 FROM closepilot_review_drafts WHERE session_hash = $1 AND response IS NULL AND lease_until > $2",
        [session, timestamp],
      );
      if (pending.length)
        throw new DomainError(
          "AI_BUSY",
          "다른 초안을 생성 중이어서 규칙 기반 초안을 표시합니다.",
          429,
        );

      const [{ count }] = await transaction.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM closepilot_review_drafts WHERE response IS NULL AND lease_until > $1",
        [timestamp],
      );
      if (count >= REVIEW_DRAFT_LIMITS.concurrent)
        throw new DomainError("AI_BUSY", "AI 요청이 많아 규칙 기반 초안을 표시합니다.", 429);
      const hour = timestamp.slice(0, 13),
        day = timestamp.slice(0, 10);
      await consume(
        transaction,
        `ai:global:${day}`,
        REVIEW_DRAFT_LIMITS.globalPerDay,
        new Date(Date.parse(`${day}T00:00:00.000Z`) + 86_400_000).toISOString(),
      );
      await consume(
        transaction,
        `ai:session:${session}:${hour}`,
        REVIEW_DRAFT_LIMITS.sessionPerHour,
        new Date(Date.parse(`${hour}:00:00.000Z`) + 3_600_000).toISOString(),
      );
      const token = randomUUID();
      await transaction.query(
        "INSERT INTO closepilot_review_drafts(session_hash, evidence_hash, lease_token, lease_until, response) VALUES ($1, $2, $3, $4, NULL) ON CONFLICT (session_hash, evidence_hash) DO UPDATE SET lease_token = EXCLUDED.lease_token, lease_until = EXCLUDED.lease_until, response = NULL",
        [
          session,
          evidenceHash,
          token,
          new Date(admittedAt.getTime() + REVIEW_DRAFT_LIMITS.leaseMs).toISOString(),
        ],
      );
      return { mode: "reserved", token };
    });
  }

  async complete(
    session: string,
    evidenceHash: string,
    token: string,
    response: ReviewDraftResponse,
  ) {
    await this.database.query(
      "UPDATE closepilot_review_drafts SET response = $4::jsonb WHERE session_hash = $1 AND evidence_hash = $2 AND lease_token = $3",
      [session, evidenceHash, token, response],
    );
  }

  async release(session: string, evidenceHash: string, token: string) {
    await this.database.query(
      "DELETE FROM closepilot_review_drafts WHERE session_hash = $1 AND evidence_hash = $2 AND lease_token = $3 AND response IS NULL",
      [session, evidenceHash, token],
    );
  }
}
