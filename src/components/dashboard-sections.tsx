"use client";

import type { ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  Check,
  ClipboardCheck,
  FileCheck2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { WorkspaceView } from "@/application/workbench";
import { money } from "./format";
import { TransactionTable, type RowFilter } from "./transaction-table";
import { TrendChart } from "./trend-chart";
import { ChannelPanel } from "./workspace-panels";
import { WorkspaceProgress } from "./workspace-progress";

interface SharedSectionProps {
  workspace: WorkspaceView;
  filter: RowFilter;
  search: string;
  setFilter: (filter: RowFilter) => void;
  setSearch: (search: string) => void;
  onSelect: (key: string) => void;
  onOpenClose: () => void;
}

interface OverviewProps extends SharedSectionProps {
  analysisLoading: boolean;
  onAnalyze: () => void;
  onReviewIssues: () => void;
  onOpenSources: () => void;
  onViewResults: () => void;
}

export function DashboardOverview({
  workspace,
  filter,
  search,
  setFilter,
  setSearch,
  onSelect,
  onOpenClose,
  analysisLoading,
  onAnalyze,
  onReviewIssues,
  onOpenSources,
  onViewResults,
}: OverviewProps) {
  const unresolvedDelta = workspace.rows
    .filter((row) => row.kind !== "matched" && !row.resolution)
    .reduce((sum, row) => sum + Math.abs(row.delta), 0);

  return (
    <div className="dashboard-overview">
      <WorkspaceProgress
        workspace={workspace}
        onSources={onOpenSources}
        onResults={onViewResults}
        onReview={onReviewIssues}
        onClose={onOpenClose}
      />
      <div className="metrics-grid">
        <Metric
          label="주문 총액"
          value={money(workspace.summary.gross)}
          detail={`주문 ${workspace.orders.length}건 · 환불 차감 전`}
          icon={<BarChart3 size={17} />}
        />
        <Metric
          label="예상 정산액"
          value={money(workspace.summary.expectedNet)}
          detail="환불액과 데모 수수료 차감 후"
          icon={<FileCheck2 size={17} />}
        />
        <Metric
          label="자동 일치율"
          value={`${((workspace.summary.matched / Math.max(1, workspace.summary.total)) * 100).toFixed(1)}%`}
          detail={`${workspace.summary.total}건 중 ${workspace.summary.matched}건 원 단위 일치`}
          icon={<Check size={17} />}
          progress={(workspace.summary.matched / Math.max(1, workspace.summary.total)) * 100}
        />
        <Metric
          label="검토가 필요한 거래"
          value={`${workspace.summary.unresolved}`}
          suffix="건"
          detail={`미검토 차액 절댓값 합계 ${money(unresolvedDelta)}`}
          icon={<ClipboardCheck size={17} />}
          warning={workspace.summary.unresolved > 0}
        />
      </div>
      <div className="insight-banner">
        <div className="insight-icon">
          <Sparkles size={21} />
        </div>
        <div className="insight-copy">
          <h2>
            {workspace.summary.unresolved
              ? `마감 전에 검토할 거래가 ${workspace.summary.unresolved}건 남아 있습니다.`
              : workspace.close
                ? "마감 결과와 검토 근거를 저장했습니다."
                : "예외 거래 검토를 완료했습니다. 마감 전 점검을 진행하세요."}
          </h2>
          <p>
            {workspace.summary.unresolved
              ? "정산 누락, 수수료 차이, 입금 확인이 필요한 거래의 원본 자료를 살펴보세요."
              : "원본 금액은 그대로 유지되며, 검토 사유와 증빙 참조 정보를 감사 기록에서 확인할 수 있습니다."}{" "}
            <span className="insight-label">규칙 기반 가이드</span>
          </p>
        </div>
        <div className="insight-actions">
          <button
            className="button primary small"
            onClick={workspace.summary.unresolved ? onReviewIssues : onOpenClose}
          >
            {workspace.summary.unresolved ? "확인할 거래 보기" : "마감 점검"}
            <ArrowRight size={15} />
          </button>
          {workspace.summary.unresolved > 0 && (
            <button className="text-button" onClick={onAnalyze} disabled={analysisLoading}>
              {analysisLoading ? "불러오는 중…" : "검토 방법"}
            </button>
          )}
        </div>
      </div>
      <TransactionTable
        workspace={workspace}
        onSelect={(row) => onSelect(row.key)}
        filter={filter}
        setFilter={setFilter}
        search={search}
        setSearch={setSearch}
      />
      <div className="analytics-grid overview-analytics">
        <TrendChart workspace={workspace} />
        <ChannelPanel workspace={workspace} onOpen={onOpenSources} />
      </div>
      <div className="overview-bottom">
        <div>
          <ShieldCheck size={16} />
          <span>원 단위로 대사하고, 검토 근거를 기록합니다</span>
        </div>
        <button className="text-button" onClick={onOpenClose}>
          {workspace.close ? "마감 증빙 보기" : "마감 체크리스트"}
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

export function TransactionsDashboard({
  workspace,
  filter,
  search,
  setFilter,
  setSearch,
  onSelect,
  onOpenClose,
}: SharedSectionProps) {
  return (
    <>
      <div className="transaction-overview">
        <div>
          <span>대사 대상</span>
          <strong>
            {workspace.summary.total}
            <small>건</small>
          </strong>
        </div>
        <div>
          <span>자동 일치</span>
          <strong>
            {workspace.summary.matched}
            <small>건</small>
          </strong>
        </div>
        <div>
          <span>검토 완료</span>
          <strong>
            {workspace.summary.reviewed}
            <small>건</small>
          </strong>
        </div>
        <div>
          <span>확인 필요</span>
          <strong className="amber-text">
            {workspace.summary.unresolved}
            <small>건</small>
          </strong>
        </div>
        <button className="button secondary" onClick={onOpenClose}>
          <LockKeyhole size={15} />
          마감 점검
        </button>
      </div>
      <TransactionTable
        workspace={workspace}
        onSelect={(row) => onSelect(row.key)}
        filter={filter}
        setFilter={setFilter}
        search={search}
        setSearch={setSearch}
        expanded
      />
    </>
  );
}

function Metric({
  label,
  value,
  detail,
  icon,
  suffix,
  progress,
  warning,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  suffix?: string;
  progress?: number;
  warning?: boolean;
}) {
  return (
    <section className={`card metric-card ${warning ? "metric-warning" : ""}`}>
      <div className="metric-label">
        <h2>{label}</h2>
        <span>{icon}</span>
      </div>
      <div className="metric-value">
        {value}
        {suffix && <small>{suffix}</small>}
      </div>
      {progress !== undefined ? (
        <div className="metric-progress">
          <span style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      <p>
        {warning && <i />}
        {detail}
      </p>
    </section>
  );
}
