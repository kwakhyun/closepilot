"use client";
import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import type { WorkspaceView } from "@/application/workbench";
import type { SessionSelection } from "./use-workspace-session";

export function MonthWorkspace({
  workspace,
  busy,
  onPrepareSession,
}: {
  workspace: WorkspaceView;
  busy: boolean;
  onPrepareSession: (selection: SessionSelection) => void;
}) {
  const [period, setPeriod] = useState(workspace.period);
  return (
    <section className="feature-section" aria-labelledby="month-title">
      <h2 id="month-title">월별 작업공간</h2>
      <p className="muted">
        현재 월 {workspace.period}. 새 월은 같은 설정의 별도 합성 자료로 시작합니다. 이전 마감은
        증빙 파일로 보관하세요.
      </p>
      <form
        className="tool-actions"
        onSubmit={(event) => {
          event.preventDefault();
          onPrepareSession({
            cloneCurrent: true,
            brandName: workspace.profile.brandName,
            expectedVersion: workspace.version,
            period,
          });
        }}
      >
        <label>
          마감 월
          <input
            type="month"
            min="2020-01"
            max="2035-12"
            value={period}
            required
            onChange={(event) => setPeriod(event.target.value)}
          />
        </label>
        <button className="button secondary" disabled={busy || period === workspace.period}>
          <CalendarPlus size={16} />이 월로 새 작업 시작
        </button>
      </form>
    </section>
  );
}
