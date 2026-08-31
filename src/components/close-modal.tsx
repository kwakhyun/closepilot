"use client";

import { useState } from "react";
import { Check, Circle, Download, LockKeyhole, ShieldCheck, ArrowRight } from "lucide-react";
import type { Command, WorkspaceView } from "@/application/workbench";
import { Modal } from "./modal";
import { money } from "./format";

export function CloseModal({
  open,
  onClose,
  workspace,
  onCommand,
  onReview,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  workspace: WorkspaceView;
  onCommand: (command: Command) => Promise<boolean>;
  onReview: () => void;
  busy: boolean;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const checklist = [
    {
      title: "원본 자료 수집",
      detail: `자료 ${workspace.sources.length}개 · SHA-256 체크섬 저장`,
      done: workspace.sources.length > 0,
    },
    {
      title: "최신 자료 대사",
      detail: workspace.lastRunAt
        ? `대사 규칙: ${workspace.ruleVersion}`
        : "추가한 자료가 있습니다. 대사를 다시 실행하세요.",
      done: !!workspace.lastRunAt,
    },
    {
      title: "예외 거래 검토",
      detail: workspace.summary.unresolved
        ? `아직 검토하지 않은 거래가 ${workspace.summary.unresolved}건 있습니다`
        : `${workspace.summary.reviewed}건의 검토 사유와 증빙 참조 정보 기록`,
      done: workspace.summary.unresolved === 0,
    },
    {
      title: "감사 기록 검증",
      detail: `기록 ${workspace.events.length}건 · 해시 연결 확인`,
      done: workspace.auditValid,
    },
  ];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={workspace.close ? "8월 마감을 완료했습니다" : "마감 전 최종 확인"}
    >
      <div className="close-body">
        <div className={`close-hero ${workspace.close ? "closed" : ""}`}>
          <span>{workspace.close ? <ShieldCheck size={27} /> : <LockKeyhole size={26} />}</span>
          <p>2026년 8월 · LUMIÈRE</p>
          <h3>
            {workspace.close
              ? "마감 결과와 검토 근거를 저장했습니다."
              : "검토 근거를 확인하고 마감을 확정하세요."}
          </h3>
          <small>
            {workspace.close
              ? "세션이 만료되기 전에 마감 증빙 파일을 내려받으세요."
              : "확정 후에는 자료와 검토 기록을 수정할 수 없습니다."}
          </small>
        </div>
        <div className="close-checklist">
          {checklist.map((item) => (
            <div key={item.title} className={item.done ? "done" : "pending"}>
              {item.done ? <Check size={17} /> : <Circle size={17} />}
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="close-totals">
          <div>
            <span>예상 정산액</span>
            <strong>{money(workspace.summary.expectedNet)}</strong>
          </div>
          <div>
            <span>자료상 정산액</span>
            <strong>{money(workspace.summary.actualNet)}</strong>
          </div>
          <div>
            <span>정산액 차이 (자료 − 예상)</span>
            <strong>{money(workspace.summary.delta)}</strong>
          </div>
        </div>
        <p className="helper-text">
          검토를 승인해도 원본 금액은 바뀌지 않습니다. 마감 증빙 파일에는 검토 결과가 담기며, 회계
          전표나 송금 지시로 사용할 수 없습니다.
        </p>
        {workspace.close ? (
          <>
            <div className="snapshot-hash">
              <span>마감 결과 체크섬 · SHA-256</span>
              <code>{workspace.close.hash}</code>
            </div>
            <a href="/api/export?format=json" className="button primary full-width" download>
              <Download size={17} />
              마감 증빙 다운로드 (JSON)
            </a>
          </>
        ) : (
          <>
            {workspace.summary.unresolved > 0 ? (
              <button
                className="button secondary full-width"
                onClick={() => {
                  onClose();
                  onReview();
                }}
              >
                미검토 거래 {workspace.summary.unresolved}건 확인하기
                <ArrowRight size={16} />
              </button>
            ) : (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  검토 사유와 남아 있는 금액 차이를 확인했습니다. 현재 결과로 마감을 확정하며,
                  이후에는 수정할 수 없음을 확인했습니다.
                </span>
              </label>
            )}
            <button
              className="button primary full-width"
              disabled={busy || !confirmed || checklist.some((item) => !item.done)}
              onClick={() =>
                void onCommand({ action: "close", expectedVersion: workspace.version })
              }
            >
              <LockKeyhole size={16} />
              {busy ? "마감을 확정하는 중…" : "8월 마감 확정"}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
