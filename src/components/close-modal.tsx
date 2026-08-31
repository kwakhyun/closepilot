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
      detail: `${workspace.sources.length}개 파일 · SHA-256 원본 체크섬 보관`,
      done: workspace.sources.length > 0,
    },
    {
      title: "최신 규칙으로 대사",
      detail: workspace.lastRunAt
        ? workspace.ruleVersion
        : "추가한 자료가 있습니다. 대사를 다시 실행하세요.",
      done: !!workspace.lastRunAt,
    },
    {
      title: "예외 거래 검토",
      detail: workspace.summary.unresolved
        ? `${workspace.summary.unresolved}건의 미해결 차이가 남아 있습니다`
        : `${workspace.summary.reviewed}건의 승인 사유와 증빙 확인`,
      done: workspace.summary.unresolved === 0,
    },
    {
      title: "감사 기록 무결성",
      detail: `${workspace.events.length}개 이벤트 · 해시 연결 검증`,
      done: workspace.auditValid,
    },
  ];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={workspace.close ? "이번 달 마감이 완료됐어요" : "마감 전, 마지막 확인"}
    >
      <div className="close-body">
        <div className={`close-hero ${workspace.close ? "closed" : ""}`}>
          <span>{workspace.close ? <ShieldCheck size={27} /> : <LockKeyhole size={26} />}</span>
          <p>2026년 8월 · LUMIÈRE</p>
          <h3>
            {workspace.close ? "근거까지, 안전하게 보관했습니다." : "검증된 숫자로 마무리하세요."}
          </h3>
          <small>확정 후에는 자료와 승인 기록을 수정할 수 없습니다.</small>
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
            <span>자료상 실제 정산액</span>
            <strong>{money(workspace.summary.actualNet)}</strong>
          </div>
          <div>
            <span>승인 전·후 원본 차이</span>
            <strong>{money(workspace.summary.delta)}</strong>
          </div>
        </div>
        <p className="helper-text">
          차이 승인은 원본 금액을 보정하지 않습니다. 이 마감 패키지는 검토 증빙이며, 회계 전표나
          송금 지시가 아닙니다.
        </p>
        {workspace.close ? (
          <>
            <div className="snapshot-hash">
              <span>마감 스냅샷 · SHA-256</span>
              <code>{workspace.close.hash}</code>
            </div>
            <a href="/api/export?format=json" className="button primary full-width" download>
              <Download size={17} />
              증빙 포함 마감 패키지 다운로드
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
                미해결 거래 {workspace.summary.unresolved}건 검토하기
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
                  승인 사유와 남은 금액 차이를 확인했으며 이 스냅샷으로 마감을 확정합니다.
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
