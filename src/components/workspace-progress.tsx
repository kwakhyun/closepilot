"use client";

import { Check } from "lucide-react";
import type { WorkspaceView } from "@/application/workbench";

export function WorkspaceProgress({
  workspace,
  onSources,
  onResults,
  onReview,
  onClose,
}: {
  workspace: WorkspaceView;
  onSources: () => void;
  onResults: () => void;
  onReview: () => void;
  onClose: () => void;
}) {
  const current = workspace.close
    ? 4
    : !workspace.lastRunAt
      ? 1
      : workspace.summary.unresolved
        ? 2
        : 3;
  const steps = [
    { title: "자료 확인", detail: `${workspace.sources.length}개 자료`, action: onSources },
    { title: "대사 결과", detail: `${workspace.summary.total}건 비교`, action: onResults },
    { title: "예외 검토", detail: `미검토 ${workspace.summary.unresolved}건`, action: onReview },
    {
      title: "마감 확정",
      detail: workspace.close ? "증빙 저장 완료" : "최종 조건 점검",
      action: onClose,
    },
  ];
  return (
    <ol className="console-workflow" aria-label="마감 작업 단계">
      {steps.map((step, index) => (
        <li
          key={step.title}
          className={index < current ? "is-complete" : index === current ? "is-current" : ""}
        >
          <button onClick={step.action} aria-current={index === current ? "step" : undefined}>
            <span className="step-number">{index < current ? <Check size={13} /> : index + 1}</span>
            <span>
              <strong>{step.title}</strong>
              <small>{step.detail}</small>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
