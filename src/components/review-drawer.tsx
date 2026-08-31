"use client";

import { useState } from "react";
import { Check, FileText, ShieldCheck, Info } from "lucide-react";
import type { Command, ReviewedRow, WorkspaceView } from "@/application/workbench";
import { CHANNEL_LABELS, ISSUE_LABELS } from "@/domain/model";
import { Modal } from "./modal";
import { deltaMoney, money, timestamp } from "./format";
import "./evidence.css";

export function ReviewDrawer({
  row,
  workspace,
  onClose,
  onCommand,
  busy,
}: {
  row: ReviewedRow | null;
  workspace: WorkspaceView;
  onClose: () => void;
  onCommand: (command: Command) => Promise<boolean>;
  busy: boolean;
}) {
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const disposition =
    row?.kind === "timing"
      ? "carry_forward"
      : row?.kind === "duplicate"
        ? "exclude_duplicate"
        : "accepted_variance";
  const actionLabel =
    disposition === "carry_forward"
      ? "다음 달 이월 승인"
      : disposition === "exclude_duplicate"
        ? "중복 제외 검토 승인"
        : "차이 검토 승인";
  return (
    <Modal open={!!row} onClose={onClose} title="거래 검토" drawer>
      {row && (
        <div className="drawer-body">
          <div className="detail-title">
            <span
              className={`status-badge ${row.kind === "matched" ? "matched" : row.resolution ? "reviewed" : row.kind === "timing" ? "timing" : "issue"}`}
            >
              {row.resolution ? "검토 완료" : ISSUE_LABELS[row.kind]}
            </span>
            <h3>{row.orderId}</h3>
            <p>
              {CHANNEL_LABELS[row.channel]}
              <span>·</span>
              {row.date}
            </p>
          </div>
          <div className="comparison-grid">
            <div>
              <span>예상 정산액</span>
              <strong>{money(row.expectedNet)}</strong>
            </div>
            <div>
              <span>실제 정산액</span>
              <strong>{money(row.actualNet)}</strong>
            </div>
            <div className={row.delta ? "has-delta" : ""}>
              <span>차이 금액</span>
              <strong>{deltaMoney(row.delta)}</strong>
            </div>
          </div>
          <section className="explanation-box">
            <div>
              <ShieldCheck size={16} />
              <b>규칙 엔진의 확인 결과</b>
              <span>근거 기반</span>
            </div>
            <p>{row.explanation}</p>
          </section>
          <section className="detail-section">
            <h4>금액 비교</h4>
            <dl className="money-breakdown">
              <div>
                <dt>주문 총액</dt>
                <dd>{money(row.gross)}</dd>
              </div>
              <div>
                <dt>주문 환불액</dt>
                <dd>− {money(row.refund)}</dd>
              </div>
              <div>
                <dt>예상 수수료 / 실제 수수료</dt>
                <dd>
                  {money(row.expectedFee)} / {money(row.actualFee)}
                </dd>
              </div>
              <div>
                <dt>입금 예정일</dt>
                <dd>{row.dueDate ?? "자료 없음"}</dd>
              </div>
              <div>
                <dt>입금 확인일</dt>
                <dd>{row.paidDate ?? "미확인"}</dd>
              </div>
            </dl>
          </section>
          <section className="detail-section">
            <h4>
              연결된 원본 근거 <span>{row.sources.length}</span>
            </h4>
            <div className="source-evidence">
              {row.sources.map((sourceId) => {
                const source = workspace.sources.find((entry) => entry.id === sourceId);
                return (
                  <div key={sourceId}>
                    <FileText size={19} />
                    <div>
                      <strong>{source?.name ?? sourceId}</strong>
                      <code>
                        {sourceId} · {source?.digest.slice(0, 12)}…
                      </code>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="helper-text">
              {row.settlementIds.length
                ? `정산 ID: ${row.settlementIds.join(", ")}`
                : "연결된 정산 행이 없습니다."}
            </p>
            <SettlementEvidence row={row} workspace={workspace} />
          </section>
          {row.resolution ? (
            <section className="resolution-receipt">
              <ShieldCheck size={21} />
              <div>
                <h4>검토가 기록되었습니다</h4>
                <p>{row.resolution.note}</p>
                <p className="muted">근거: {row.resolution.evidence}</p>
                <small>
                  {row.resolution.actor} · {timestamp(row.resolution.at)}
                </small>
              </div>
            </section>
          ) : row.kind !== "matched" && workspace.status !== "closed" ? (
            <form
              className="review-form"
              onSubmit={async (event) => {
                event.preventDefault();
                await onCommand({
                  action: "resolve",
                  expectedVersion: workspace.version,
                  rowKey: row.key,
                  disposition,
                  note,
                  evidence,
                });
              }}
            >
              <div className="section-heading">
                <h4>검토 기록</h4>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setNote(
                      `합성 데이터 검토 예시: ${ISSUE_LABELS[row.kind]} 사유와 원본 행을 확인했습니다. 실거래 승인에 사용하지 않습니다.`,
                    );
                    setEvidence(`DEMO-${row.sources[0]} / 합성 증빙`);
                  }}
                >
                  데모 검토 예시
                </button>
              </div>
              <label>
                검토 사유 <span className="required">*</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="어떤 근거로 차이를 승인하는지 기록하세요 (10자 이상)"
                  minLength={10}
                  maxLength={600}
                  rows={3}
                  required
                />
              </label>
              <label>
                증빙 식별자 <span className="required">*</span>
                <input
                  value={evidence}
                  onChange={(event) => setEvidence(event.target.value)}
                  placeholder="예: 정산 파일 ID / 확인 티켓 번호"
                  minLength={5}
                  maxLength={200}
                  required
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  required
                />
                <span>원본 근거를 확인했습니다. 이 승인은 원본 금액을 수정하지 않습니다.</span>
              </label>
              <div className="inline-notice">
                <Info size={15} />
                <p>
                  {row.kind === "duplicate"
                    ? "중복 제외 판단을 검토 기록에 남깁니다. 실제 합계에서 원본 행을 삭제하거나 차이를 숨기지 않습니다."
                    : "금액과 일치율은 그대로 유지됩니다. 승인 사유와 증빙이 마감 패키지에 함께 저장됩니다."}
                </p>
              </div>
              <button
                className="button primary full-width"
                disabled={
                  busy ||
                  !confirmed ||
                  note.trim().length < 10 ||
                  evidence.trim().length < 5 ||
                  !workspace.lastRunAt
                }
                type="submit"
              >
                <Check size={17} />
                {busy ? "기록하는 중…" : actionLabel}
              </button>
              {!workspace.lastRunAt && (
                <p className="form-error">최신 자료로 대사를 다시 실행한 뒤 검토하세요.</p>
              )}
            </form>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

function SettlementEvidence({ row, workspace }: { row: ReviewedRow; workspace: WorkspaceView }) {
  const entries = workspace.settlements.filter(
    (entry) => entry.channel === row.channel && entry.orderId === row.orderId,
  );
  if (!entries.length) return null;
  return (
    <details className="raw-evidence">
      <summary>정규화된 정산 원본 {entries.length}행 보기</summary>
      <p>중복 행도 삭제하지 않고 모두 표시합니다. 은행 입금 내역과 대조한 결과는 아닙니다.</p>
      {entries.map((entry, index) => (
        <div key={`${entry.id}-${index}`}>
          <strong>
            {index + 1}. {entry.id}
          </strong>
          <dl>
            <div>
              <dt>정산 자료 매출 / 환불</dt>
              <dd>
                {money(entry.gross)} / {money(entry.refund)}
              </dd>
            </div>
            <div>
              <dt>수수료 / 순정산액</dt>
              <dd>
                {money(entry.fee)} / {money(entry.net)}
              </dd>
            </div>
            <div>
              <dt>예정일 / 입금 필드</dt>
              <dd>
                {entry.dueDate} / {entry.paidDate ?? "없음"}
              </dd>
            </div>
          </dl>
        </div>
      ))}
    </details>
  );
}
