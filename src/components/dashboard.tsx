"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CircleHelp,
  ClipboardCheck,
  Command as CommandIcon,
  Database,
  Download,
  FileCheck2,
  FolderSync,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  Menu,
  PanelLeftClose,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import type { Command, WorkspaceView, explainIssues } from "@/application/workbench";
import { Brand } from "./brand";
import { TrendChart } from "./trend-chart";
import { TransactionTable, type RowFilter } from "./transaction-table";
import { AuditPanel, ChannelPanel, SourcesPanel } from "./workspace-panels";
import { ReviewDrawer } from "./review-drawer";
import { ImportModal } from "./import-modal";
import { CloseModal } from "./close-modal";
import { Modal } from "./modal";
import { deltaMoney, money } from "./format";

type Section = "overview" | "transactions" | "sources" | "audit";
type Analysis = ReturnType<typeof explainIssues>;
const SECTIONS = {
  overview: "마감 대시보드",
  transactions: "거래 대사",
  sources: "데이터 연결",
  audit: "감사 기록",
};

async function responseData(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "요청을 처리하지 못했습니다.");
  return data;
}
export function Dashboard() {
  const [workspace, setWorkspace] = useState<WorkspaceView | null>(null);
  const [error, setError] = useState("");
  const [section, setSection] = useState<Section>("overview");
  const [filter, setFilter] = useState<RowFilter>("issues");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const showToast = useCallback((message: string, isError = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, error: isError });
    toastTimer.current = setTimeout(() => setToast(null), 5500);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        let response = await fetch("/api/workspace", { signal: controller.signal });
        if (response.status === 401)
          response = await fetch("/api/session", { method: "POST", signal: controller.signal });
        const data = await responseData(response);
        if (!controller.signal.aborted) setWorkspace(data);
      } catch (failure) {
        if (!controller.signal.aborted) setError((failure as Error).message);
      }
    })();
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => {
      controller.abort();
      window.removeEventListener("keydown", shortcut);
    };
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  async function refresh() {
    try {
      const view = await responseData(await fetch("/api/workspace"));
      setWorkspace(view);
      return view as WorkspaceView;
    } catch (failure) {
      showToast((failure as Error).message, true);
      return null;
    }
  }
  async function onCommand(command: Command): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    try {
      const request = {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(command),
      };
      let response: Response;
      try {
        response = await fetch("/api/commands", request);
      } catch {
        response = await fetch("/api/commands", request);
      }
      if (response.status >= 502) response = await fetch("/api/commands", request);
      const data = await responseData(response);
      setWorkspace(data);
      showToast(
        command.action === "resolve"
          ? "검토 사유와 증빙을 감사 기록에 저장했습니다."
          : command.action === "close"
            ? "8월 마감이 확정되었습니다. 증빙 패키지를 내려받을 수 있어요."
            : command.action === "import"
              ? "자료를 가져왔습니다. 대사를 다시 실행해 주세요."
              : "대사가 완료되었습니다. 최신 자료로 결과를 갱신했어요.",
      );
      return true;
    } catch (failure) {
      showToast((failure as Error).message, true);
      try {
        setWorkspace(await responseData(await fetch("/api/workspace")));
      } catch {
        /* The original error remains visible. */
      }
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    setBusy(true);
    try {
      const view = await responseData(await fetch("/api/session", { method: "POST" }));
      setWorkspace(view);
      setResetOpen(false);
      setSelectedKey(null);
      setSection("overview");
      setSearch("");
      setFilter("issues");
      setError("");
      showToast("새로운 데모 세션을 시작했습니다.");
    } catch (failure) {
      showToast((failure as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function analyze() {
    setAnalysisLoading(true);
    try {
      setAnalysis(await responseData(await fetch("/api/analysis")));
    } catch (failure) {
      showToast((failure as Error).message, true);
    } finally {
      setAnalysisLoading(false);
    }
  }
  function navigate(value: Section) {
    setSection(value);
    setMobileNav(false);
    setSearch("");
    if (value === "transactions") setFilter("all");
  }
  function reviewIssues() {
    setSection("transactions");
    setFilter("issues");
    setSearch("");
  }
  const selectedRow = workspace?.rows.find((row) => row.key === selectedKey) ?? null;
  const progress = workspace
    ? Math.round(
        ((workspace.summary.total - workspace.summary.unresolved) /
          Math.max(1, workspace.summary.total)) *
          100,
      )
    : 0;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      {mobileNav && (
        <button
          className="sidebar-backdrop"
          onClick={() => setMobileNav(false)}
          aria-label="메뉴 닫기"
        />
      )}
      <aside className={`sidebar ${mobileNav ? "is-open" : ""}`} aria-label="주 메뉴">
        <Link href="/" className="brand-link" aria-label="ClosePilot 홈">
          <Brand />
        </Link>
        <button
          className="mobile-sidebar-close icon-button"
          onClick={() => setMobileNav(false)}
          aria-label="메뉴 닫기"
        >
          <PanelLeftClose size={20} />
        </button>
        <div className="workspace-switcher">
          <span className="workspace-monogram">L</span>
          <div>
            <strong>LUMIÈRE</strong>
            <span>Demo workspace</span>
          </div>
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav>
          <button
            className={section === "overview" ? "active" : ""}
            onClick={() => navigate("overview")}
          >
            <LayoutDashboard size={18} />
            마감 대시보드
          </button>
          <button
            className={section === "transactions" ? "active" : ""}
            onClick={() => navigate("transactions")}
          >
            <ListChecks size={18} />
            거래 대사
            {workspace && workspace.summary.unresolved > 0 && (
              <span className="nav-badge">{workspace.summary.unresolved}</span>
            )}
          </button>
          <button
            className={section === "sources" ? "active" : ""}
            onClick={() => navigate("sources")}
          >
            <Database size={18} />
            데이터 연결
          </button>
          <button className={section === "audit" ? "active" : ""} onClick={() => navigate("audit")}>
            <ShieldCheck size={18} />
            감사 기록
          </button>
        </nav>
        <div className="sidebar-divider" />
        <span className="nav-caption">RESOURCES</span>
        <nav>
          <Link href="/guide">
            <BookOpen size={18} />
            프로젝트 가이드
            <ArrowUpRight className="nav-external" size={14} />
          </Link>
          <a href="https://github.com/kwakhyun/closepilot" target="_blank" rel="noreferrer">
            <FolderSync size={18} />
            소스 코드
            <ArrowUpRight className="nav-external" size={14} />
          </a>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-close-card">
          <div>
            <span className="live-dot" />
            <span>8월 마감 워크스페이스</span>
          </div>
          <h3>{workspace?.close ? "마감이 완료됐어요." : "마무리까지, 한 걸음 더."}</h3>
          <div className="sidebar-progress">
            <span style={{ width: `${progress}%` }} />
          </div>
          <p>
            {workspace ? `검토 진행률 ${progress}%` : "자료를 준비하고 있어요"}
            <b>
              {workspace
                ? `${workspace.summary.total - workspace.summary.unresolved}/${workspace.summary.total}`
                : "—"}
            </b>
          </p>
          <button onClick={() => setCloseOpen(true)} disabled={!workspace}>
            마감 점검
            <ArrowRight size={15} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <div className="avatar">D</div>
          <div>
            <strong>데모 검토자</strong>
            <span>독립된 체험 세션</span>
          </div>
          <button onClick={() => setResetOpen(true)} aria-label="새 데모 시작" title="새 데모 시작">
            <RotateCcw size={16} />
          </button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="메뉴 열기"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb-workspace">워크스페이스</span>
            <span className="breadcrumb-divider">/</span>
            <strong>{SECTIONS[section]}</strong>
          </div>
          <div className="topbar-actions">
            <label className="global-search">
              <Search size={15} />
              <input
                ref={searchInput}
                aria-label="전체 거래번호 검색"
                value={search}
                placeholder="거래번호 검색"
                onFocus={() => {
                  setSection("transactions");
                  setFilter("all");
                }}
                onChange={(event) => setSearch(event.target.value)}
              />
              <kbd>
                <CommandIcon size={10} /> K
              </kbd>
            </label>
            <span className="demo-badge">
              <span />
              가상 데이터 데모
            </span>
            <Link className="icon-button help-button" href="/guide" aria-label="사용 가이드">
              <CircleHelp size={19} />
            </Link>
          </div>
        </header>
        <main id="main-content" className="main-content">
          <div className="page-header">
            <div>
              <div className="page-eyebrow">
                <span>COMMERCE OPERATIONS</span>
                <i />
                <span>2026년 8월</span>
              </div>
              <h1>
                {section === "overview" ? "매출 마감" : SECTIONS[section]}
                <span className={`period-status ${workspace?.close ? "is-closed" : ""}`}>
                  {workspace?.close ? "마감 완료" : "마감 진행 중"}
                </span>
              </h1>
              <p>
                {section === "overview"
                  ? "흩어진 매출을 연결하고, 확신 있게 마감하세요."
                  : section === "transactions"
                    ? "주문에서 정산까지. 차이의 원인을 한눈에 확인하세요."
                    : section === "sources"
                      ? "서로 다른 양식을, 하나의 기준으로 연결하세요."
                      : "누가, 무엇을, 왜 바꿨는지 투명하게 확인하세요."}
              </p>
            </div>
            <div className="page-actions">
              <div className="period-picker" title="이 데모는 2026년 8월 마감 시나리오입니다">
                <CalendarDays size={16} />
                <span>2026. 08. 01 — 08. 31</span>
              </div>
              <button
                className="button secondary"
                onClick={() => setImportOpen(true)}
                disabled={!workspace || workspace.status === "closed"}
              >
                <Upload size={16} />
                자료 업로드
              </button>
              <button
                className="button primary"
                onClick={() =>
                  workspace &&
                  void onCommand({ action: "reconcile", expectedVersion: workspace.version })
                }
                disabled={!workspace || busy || workspace.status === "closed"}
              >
                {busy ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}대사
                실행
              </button>
            </div>
          </div>
          {!workspace ? (
            <div className="loading-workspace">
              {error ? (
                <>
                  <ShieldCheck size={36} />
                  <h2>워크스페이스를 불러오지 못했어요</h2>
                  <p>{error}</p>
                  <button className="button primary" disabled={busy} onClick={() => void reset()}>
                    새 데모 시작
                  </button>
                </>
              ) : (
                <>
                  <span className="loading-logo">
                    <Brand compact />
                  </span>
                  <h2>마감 자료를 준비하고 있어요</h2>
                  <p>독립된 세션에 가상 주문과 정산 자료를 연결합니다.</p>
                  <LoaderCircle size={22} className="spin" />
                </>
              )}
            </div>
          ) : (
            <>
              {!workspace.lastRunAt && (
                <div className="notice warm stale-notice">
                  <RefreshCw size={18} />
                  <p>
                    <b>새로운 자료가 반영됐습니다.</b> 아래 수치는 미리보기입니다. 대사를 실행한 뒤
                    검토·마감을 진행하세요.
                  </p>
                </div>
              )}
              {section === "overview" && (
                <>
                  <div className="metrics-grid">
                    <Metric
                      label="총 매출"
                      value={money(workspace.summary.gross)}
                      detail={`${workspace.orders.length}건의 주문 원장 기준`}
                      icon={<BarChart3 size={17} />}
                    />
                    <Metric
                      label="예상 정산액"
                      value={money(workspace.summary.expectedNet)}
                      detail="환불과 가상 계약 수수료 반영"
                      icon={<FileCheck2 size={17} />}
                    />
                    <Metric
                      label="자동 일치율"
                      value={`${((workspace.summary.matched / Math.max(1, workspace.summary.total)) * 100).toFixed(1)}%`}
                      detail={`${workspace.summary.total}건 중 ${workspace.summary.matched}건 원 단위 일치`}
                      icon={<Check size={17} />}
                      progress={
                        (workspace.summary.matched / Math.max(1, workspace.summary.total)) * 100
                      }
                    />
                    <Metric
                      label="확인 필요한 거래"
                      value={`${workspace.summary.unresolved}`}
                      suffix="건"
                      detail={`미해결 금액 차이 ${money(workspace.rows.filter((row) => row.kind !== "matched" && !row.resolution).reduce((sum, row) => sum + Math.abs(row.delta), 0))}`}
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
                          ? `${workspace.summary.unresolved}건만 확인하면, 마감에 한 걸음 더 가까워져요.`
                          : workspace.close
                            ? "8월의 숫자와 근거가 하나의 마감 패키지로 묶였어요."
                            : "예외 검토가 끝났어요. 마감 전 마지막 확인을 진행하세요."}
                      </h2>
                      <p>
                        {workspace.summary.unresolved
                          ? `정산 누락·수수료 차이부터 입금 시차까지, 확인할 근거를 모아뒀어요.`
                          : "승인된 차이와 원본 수치는 그대로 보존되어 감사 기록에서 추적할 수 있습니다."}
                        <span className="insight-label">규칙 기반 가이드</span>
                      </p>
                    </div>
                    <button onClick={() => void analyze()} disabled={analysisLoading}>
                      {analysisLoading ? "분석 중…" : "검토 가이드"}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  <div className="analytics-grid">
                    <TrendChart workspace={workspace} />
                    <ChannelPanel workspace={workspace} onOpen={() => navigate("sources")} />
                  </div>
                  <TransactionTable
                    workspace={workspace}
                    onSelect={(row) => setSelectedKey(row.key)}
                    filter={filter}
                    setFilter={setFilter}
                    search={search}
                    setSearch={setSearch}
                  />
                  <div className="overview-bottom">
                    <div>
                      <ShieldCheck size={16} />
                      <span>모든 금액은 정수 연산 · 모든 승인은 근거와 함께</span>
                    </div>
                    <button className="text-button" onClick={() => setCloseOpen(true)}>
                      {workspace.close ? "마감 패키지 보기" : "마감 체크리스트"}
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </>
              )}
              {section === "transactions" && (
                <>
                  <div className="transaction-overview">
                    <div>
                      <span>전체 대사</span>
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
                    <button className="button secondary" onClick={() => setCloseOpen(true)}>
                      <LockKeyhole size={15} />
                      마감 점검
                    </button>
                  </div>
                  <TransactionTable
                    workspace={workspace}
                    onSelect={(row) => setSelectedKey(row.key)}
                    filter={filter}
                    setFilter={setFilter}
                    search={search}
                    setSearch={setSearch}
                    expanded
                  />
                </>
              )}
              {section === "sources" && (
                <SourcesPanel
                  workspace={workspace}
                  onUpload={() => setImportOpen(true)}
                  toast={showToast}
                />
              )}
              {section === "audit" && (
                <AuditPanel
                  workspace={workspace}
                  onVerify={() =>
                    void refresh().then((view) => {
                      if (view)
                        showToast(
                          view.auditValid
                            ? `${view.events.length}개 이벤트의 해시 연결이 정상입니다.`
                            : "감사 기록 무결성 오류가 발견되었습니다.",
                          !view.auditValid,
                        );
                    })
                  }
                />
              )}
            </>
          )}
          <footer className="app-footer">
            <span>
              ClosePilot<span className="footer-dot">·</span>근거 있는 마감의 시작
            </span>
            <span>
              개인 포트폴리오 · PortOne 비공식 · 실제 결제 없음
              <Link href="/guide">
                프로젝트 소개
                <ArrowUpRight size={12} />
              </Link>
            </span>
          </footer>
        </main>
      </div>
      {workspace && (
        <>
          <ReviewDrawer
            key={selectedKey ?? "none"}
            row={selectedRow}
            workspace={workspace}
            onClose={() => setSelectedKey(null)}
            onCommand={onCommand}
            busy={busy}
          />
          <ImportModal
            open={importOpen}
            onClose={() => setImportOpen(false)}
            onCommand={onCommand}
            version={workspace.version}
            busy={busy}
          />
          <CloseModal
            open={closeOpen}
            onClose={() => setCloseOpen(false)}
            workspace={workspace}
            onCommand={onCommand}
            onReview={reviewIssues}
            busy={busy}
          />
        </>
      )}
      <Modal open={!!analysis} onClose={() => setAnalysis(null)} title="마감을 위한 검토 가이드">
        {analysis && (
          <div className="analysis-body">
            <div className="analysis-label">
              <Sparkles size={16} />
              규칙 기반 분석<span>LLM 미사용</span>
            </div>
            <h3>{analysis.title}</h3>
            <p>{analysis.summary}</p>
            <ol>
              {analysis.steps.map((step, index) => (
                <li key={step.rowKey}>
                  <span>{index + 1}</span>
                  <div>
                    <button
                      onClick={() => {
                        setAnalysis(null);
                        setSelectedKey(step.rowKey);
                      }}
                    >
                      {step.orderId}
                      <ArrowUpRight size={14} />
                    </button>
                    <strong>{deltaMoney(step.delta)}</strong>
                    <p>{step.explanation}</p>
                    <small>근거: {step.evidence.join(" · ")}</small>
                  </div>
                </li>
              ))}
            </ol>
            <div className="notice">
              <ShieldCheck size={17} />
              <p>{analysis.guardrail}</p>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="새 데모를 시작할까요?">
        <div className="reset-body">
          <p>
            지금까지의 검토 내용을 보려면 먼저 CSV 또는 마감 패키지를 내려받으세요. 새 세션에서는
            가상 자료와 진행 상태를 처음부터 체험합니다.
          </p>
          {workspace && (
            <a href="/api/export?format=csv" download className="text-button">
              <Download size={16} />
              현재 대사 결과 다운로드
            </a>
          )}
          <div className="modal-footer">
            <button className="button secondary" onClick={() => setResetOpen(false)}>
              계속 작업하기
            </button>
            <button className="button primary" disabled={busy} onClick={() => void reset()}>
              <RotateCcw size={16} />
              {busy ? "준비 중…" : "새 데모 시작"}
            </button>
          </div>
        </div>
      </Modal>
      {toast && (
        <div
          className={`toast ${toast.error ? "error-toast" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <CircleHelp size={19} /> : <Check size={19} />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} aria-label="알림 닫기">
            <X size={15} />
          </button>
        </div>
      )}
    </div>
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
  icon: React.ReactNode;
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
