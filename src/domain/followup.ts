import { digest } from "./canonical";
import { DomainError, type Workspace } from "./model";
import { verifyAudit } from "./audit";

export function followupEvidence(
  current: Workspace,
  source: Workspace,
  sourceHash: string,
  rowKey: string,
) {
  const close = source.close;
  if (!close || source.status !== "closed" || close.hash !== sourceHash)
    throw new DomainError("INVALID_FOLLOWUP_SOURCE", "확정된 이전 마감의 근거를 확인하세요.", 409);
  if (close.profile.id !== current.profile?.id || close.period >= current.period)
    throw new DomainError(
      "INVALID_FOLLOWUP_PERIOD",
      "같은 프로필의 이전 월 마감만 연결할 수 있습니다.",
      409,
    );
  const approval = close.resolutions.find(
    (entry) => entry.rowKey === rowKey && entry.disposition === "carry_forward",
  );
  const row = close.rows.find((entry) => entry.key === rowKey);
  if (!approval || !row)
    throw new DomainError("INVALID_FOLLOWUP_ROW", "이월 검토 승인된 거래가 아닙니다.");
  const { hash, ...body } = close;
  if (digest(body) !== hash || !verifyAudit(source.events) || approval.fingerprint !== digest(row))
    throw new DomainError(
      "INVALID_FOLLOWUP_SOURCE",
      "이전 마감의 무결성 검증에 실패했습니다.",
      409,
    );
  const settlements = current.settlements.filter(
    (entry) => entry.channel === row.channel && entry.orderId === row.orderId,
  );
  const fingerprint = digest({
    sourceHash,
    rowKey,
    period: current.period,
    asOf: current.asOf,
    settlements,
  });
  const key = `${sourceHash}:${rowKey}`;
  const stored = current.followups?.[key];
  return {
    key,
    row,
    settlements,
    fingerprint,
    record: stored?.fingerprint === fingerprint ? stored : null,
    stale: !!stored && stored.fingerprint !== fingerprint,
  };
}
