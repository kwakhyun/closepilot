"use client";

import { useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  FileText,
  LoaderCircle,
  Sparkles,
  ShieldCheck,
  Info,
} from "lucide-react";
import type { Command, ReviewedRow, WorkspaceView } from "@/application/workbench";
import { CHANNEL_LABELS, ISSUE_LABELS } from "@/domain/model";
import type { ReviewDraftResponse } from "@/domain/review-draft";
import { describeReconciliation, REVIEW_ACTION_LABELS } from "@/domain/review-copy";
import { Modal } from "./modal";
import { deltaMoney, money, timestamp } from "./format";
import { unresolvedReviewQueue } from "./review-queue";
import "./evidence.css";

export function ReviewDrawer({
  row,
  workspace,
  onClose,
  onSelect,
  onCommand,
  busy,
}: {
  row: ReviewedRow | null;
  workspace: WorkspaceView;
  onClose: () => void;
  onSelect: (rowKey: string) => void;
  onCommand: (command: Command) => Promise<boolean>;
  busy: boolean;
}) {
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [draft, setDraft] = useState<ReviewDraftResponse | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState("");
  const disposition =
    row?.kind === "timing"
      ? "carry_forward"
      : row?.kind === "duplicate"
        ? "exclude_duplicate"
        : "accepted_variance";
  const actionLabel = REVIEW_ACTION_LABELS[disposition];
  const queue = unresolvedReviewQueue(workspace.rows);
  const queueIndex = row ? queue.findIndex((entry) => entry.key === row.key) : -1;
  const previousRow = queueIndex > 0 ? queue[queueIndex - 1] : null;
  const nextRow = queueIndex >= 0 && queueIndex < queue.length - 1 ? queue[queueIndex + 1] : null;
  const noteReady = note.trim().length >= 10;
  const evidenceReady = evidence.trim().length >= 5;
  const latestRunReady = !!workspace.lastRunAt;
  const reviewReady = noteReady && evidenceReady && confirmed && latestRunReady;
  async function createDraft() {
    if (!row || draftLoading) return;
    setDraftLoading(true);
    setDraftError("");
    try {
      const response = await fetch("/api/review-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowKey: row.key, expectedVersion: workspace.version }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message || "검토 메모 초안을 만들지 못했습니다.");
      setDraft(data);
    } catch (error) {
      setDraftError((error as Error).message);
    } finally {
      setDraftLoading(false);
    }
  }
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
          {queueIndex >= 0 && (
            <nav className="review-navigation" aria-label="미검토 거래 이동">
              <span>
                미검토 거래 <b>{queueIndex + 1}</b>/{queue.length}
              </span>
              <div>
                <button
                  type="button"
                  className="button secondary small"
                  disabled={!previousRow}
                  onClick={() => previousRow && onSelect(previousRow.key)}
                >
                  <ChevronLeft size={15} />
                  이전
                </button>
                <button
                  type="button"
                  className="button secondary small"
                  disabled={!nextRow}
                  onClick={() => nextRow && onSelect(nextRow.key)}
                >
                  다음
                  <ChevronRight size={15} />
                </button>
              </div>
            </nav>
          )}
          <div className="comparison-grid">
            <div>
              <span>예상 정산액</span>
              <strong>{money(row.expectedNet)}</strong>
            </div>
            <div>
              <span>자료상 정산액</span>
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
              <b>대사 결과 안내</b>
              <span>규칙 기반</span>
            </div>
            <p>{describeReconciliation(row)}</p>
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
                <dt>예상 수수료 / 자료상 수수료</dt>
                <dd>
                  {money(row.expectedFee)} / {money(row.actualFee)}
                </dd>
              </div>
              <div>
                <dt>입금 예정일</dt>
                <dd>{row.dueDate ?? "자료 없음"}</dd>
              </div>
              <div>
                <dt>자료상 입금일</dt>
                <dd>{row.paidDate ?? "미확인"}</dd>
              </div>
            </dl>
          </section>
          <section className="detail-section">
            <h4>
              연결된 원본 자료 <span>{row.sources.length}</span>
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
                ? `정산번호: ${row.settlementIds.join(", ")}`
                : "연결된 정산 내역이 없습니다."}
            </p>
            <SettlementEvidence row={row} workspace={workspace} />
          </section>
          {row.resolution ? (
            <section className="resolution-receipt">
              <ShieldCheck size={21} />
              <div>
                <h4>{REVIEW_ACTION_LABELS[row.resolution.disposition]} 완료</h4>
                <p>{row.resolution.note}</p>
                <p className="muted">증빙 참조 정보: {row.resolution.evidence}</p>
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
                const submitter = (event.nativeEvent as SubmitEvent)
                  .submitter as HTMLButtonElement | null;
                const moveToNext = submitter?.value === "next";
                const succeeded = await onCommand({
                  action: "resolve",
                  expectedVersion: workspace.version,
                  rowKey: row.key,
                  disposition,
                  note,
                  evidence,
                });
                if (succeeded && moveToNext) {
                  if (nextRow) onSelect(nextRow.key);
                  else onClose();
                }
              }}
            >
              <div className="section-heading">
                <h4>검토 기록</h4>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setNote(
                      `데모 검토 예시: '${ISSUE_LABELS[row.kind]}' 거래의 원본 자료와 검토 사유를 확인했습니다. 실제 거래에 대한 승인이 아닙니다.`,
                    );
                    setEvidence(`DEMO-${row.sources[0]} / 가상 증빙`);
                  }}
                >
                  검토 예시 불러오기
                </button>
              </div>
              <section className="ai-draft-panel" aria-labelledby="ai-draft-title">
                <div className="ai-draft-heading">
                  <span>
                    <Sparkles size={16} />
                    <strong id="ai-draft-title">AI 검토 메모 초안</strong>
                  </span>
                  <small>읽기 전용 · 승인 권한 없음</small>
                </div>
                <p>
                  이 거래에 저장된 합성 주문·정산 근거만 읽어 초안을 만듭니다. 금액, 검토 상태, 마감
                  상태는 바꾸지 않습니다.
                </p>
                <button
                  type="button"
                  className="button secondary small"
                  disabled={draftLoading || busy}
                  onClick={() => void createDraft()}
                >
                  {draftLoading ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <Sparkles size={15} />
                  )}
                  {draftLoading
                    ? "근거를 확인하는 중…"
                    : draft
                      ? "초안 다시 만들기"
                      : "초안 만들기"}
                </button>
                <div className="ai-draft-result" aria-live="polite">
                  {draftError && <p className="form-error">{draftError}</p>}
                  {draft && (
                    <div>
                      <div className="ai-draft-meta">
                        <span>{draft.mode === "ai" ? "AI 초안" : "규칙 기반 대체"}</span>
                        <span>{draft.latencyMs.toLocaleString("ko-KR")}ms</span>
                      </div>
                      <strong>{draft.draft.summary}</strong>
                      <ul>
                        {draft.draft.checks.map((check) => (
                          <li key={check}>{check}</li>
                        ))}
                      </ul>
                      <p className="ai-draft-citations">
                        근거 ID · {draft.draft.citations.join(" · ")}
                      </p>
                      <small>{draft.notice}</small>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          setNote(draft.draft.note);
                          setEvidence(draft.draft.evidenceReference);
                        }}
                      >
                        검토 사유와 증빙 참조에 적용
                      </button>
                    </div>
                  )}
                </div>
              </section>
              <label>
                검토 사유 <span className="required">*</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="차이를 확인한 근거와 처리 사유를 10자 이상 입력하세요"
                  minLength={10}
                  maxLength={600}
                  rows={3}
                  required
                />
              </label>
              <label>
                증빙 참조 정보 <span className="required">*</span>
                <input
                  value={evidence}
                  onChange={(event) => setEvidence(event.target.value)}
                  placeholder="예: 정산 파일명, 문의 티켓 번호 (5자 이상)"
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
                <span>
                  원본 자료와 검토 사유를 확인했습니다. 승인해도 원본 금액은 바뀌지 않습니다.
                </span>
              </label>
              <div className="inline-notice">
                <Info size={15} />
                <p>
                  {row.kind === "duplicate"
                    ? "중복으로 판단한 사유를 기록합니다. 원본 행을 삭제하거나 합계에서 빼지는 않습니다."
                    : row.kind === "timing"
                      ? "다음 달로 이월할 사유를 기록합니다. 다음 달 자료를 자동으로 만들거나 원본 금액을 바꾸지는 않습니다."
                      : "원본 금액과 자동 일치율은 유지됩니다. 검토 사유와 증빙 참조 정보는 마감 증빙 파일에 함께 저장됩니다."}
                </p>
              </div>
              <ul className="review-readiness" id="review-readiness" aria-label="기록 조건">
                {[
                  [noteReady, "검토 사유 10자 이상"],
                  [evidenceReady, "증빙 참조 정보 5자 이상"],
                  [confirmed, "원본 자료 확인"],
                  [latestRunReady, "최신 자료로 대사 완료"],
                ].map(([ready, label]) => (
                  <li className={ready ? "is-ready" : ""} key={String(label)}>
                    {ready ? <Check size={13} /> : <Circle size={10} />}
                    {label}
                  </li>
                ))}
              </ul>
              <div className="review-submit-actions">
                {nextRow && (
                  <button
                    className="button secondary"
                    disabled={busy || !reviewReady}
                    type="submit"
                    value="stay"
                    aria-describedby="review-readiness"
                  >
                    {actionLabel}
                  </button>
                )}
                <button
                  className="button primary"
                  disabled={busy || !reviewReady}
                  type="submit"
                  value={nextRow ? "next" : "stay"}
                  aria-describedby="review-readiness"
                >
                  <Check size={17} />
                  {busy ? "기록하는 중…" : nextRow ? "기록하고 다음 거래 보기" : actionLabel}
                </button>
              </div>
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
      <summary>연결된 정산 내역 {entries.length}행 보기</summary>
      <p>
        표준 형식으로 정리한 정산 자료입니다. 중복 행도 모두 표시하며, 은행 입금 내역과 대조한
        결과는 아닙니다.
      </p>
      {entries.map((entry, index) => (
        <div key={`${entry.id}-${index}`}>
          <strong>
            {index + 1}. {entry.id}
          </strong>
          <dl>
            <div>
              <dt>총액(환불 전) / 환불액</dt>
              <dd>
                {money(entry.gross)} / {money(entry.refund)}
              </dd>
            </div>
            <div>
              <dt>수수료 / 정산액</dt>
              <dd>
                {money(entry.fee)} / {money(entry.net)}
              </dd>
            </div>
            <div>
              <dt>입금 예정일 / 자료상 입금일</dt>
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
