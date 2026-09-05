"use client";
import { useEffect, useState } from "react";
import { CalendarPlus, FolderOpen, RefreshCw } from "lucide-react";
import type { WorkspaceView } from "@/application/workbench";
import type { SessionSelection } from "./use-workspace-session";

export function MonthWorkspace({
  workspace,
  busy,
  onPrepareSession,
  onOpen,
}: {
  workspace: WorkspaceView;
  busy: boolean;
  onPrepareSession: (selection: SessionSelection) => void;
  onOpen: (selection: SessionSelection) => Promise<void>;
}) {
  const [period, setPeriod] = useState(workspace.period);
  const [items, setItems] = useState<
    Array<{
      id: string;
      scope: string;
      brand: string;
      period: string;
      status: string;
      createdAt: string;
      expiresAt: string;
    }>
  >([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/workspaces", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "보관함을 불러오지 못했습니다.");
        if (!controller.signal.aborted) {
          setItems(data.workspaces);
          setError("");
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  return (
    <section className="feature-section" aria-labelledby="month-title">
      <h2 id="month-title">월별 작업공간</h2>
      <p className="muted">
        현재 작업 기간은 {workspace.period}입니다. 다른 월의 작업은 현재 설정을 유지하고 새 합성
        자료로 시작합니다.
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
      <div className="section-heading">
        <h3>월별 작업 보관함</h3>
        <button
          className="icon-button"
          aria-label="보관함 새로고침"
          title="보관함 새로고침"
          disabled={loading || busy}
          onClick={() => {
            setLoading(true);
            setRevision(revision + 1);
          }}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      <p className="muted">
        작업은 최대 12개까지 보관하며, 생성일로부터 30일간 이 브라우저에서 다시 열 수 있습니다.
        쿠키를 삭제하면 접근할 수 없습니다. 실제 거래 자료는 저장하지 마세요.
      </p>
      {loading && <p role="status">보관함을 불러오는 중입니다.</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <p>보관된 작업이 없습니다. 이전 버전의 데모는 보관함에 자동 추가되지 않습니다.</p>
      )}
      <ul className="workspace-library">
        {items.map((item) => (
          <li key={item.id}>
            <div>
              <strong>
                {item.period} {item.brand}
              </strong>
              <span>
                {item.status === "closed"
                  ? "마감 완료"
                  : item.status === "open"
                    ? "대사 필요"
                    : "검토 중"}{" "}
                / {item.createdAt.slice(0, 10)} 생성 / {item.expiresAt.slice(0, 10)}까지
              </span>
            </div>
            <button
              className="button secondary small"
              disabled={busy || item.scope === workspace.draftScope}
              onClick={() => void onOpen({ workspaceId: item.id })}
            >
              <FolderOpen size={16} />
              {item.scope === workspace.draftScope ? "현재 작업" : "작업 열기"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
