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
  Settings2,
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
import { OnboardingPanel, type SessionSelection } from "./onboarding-panel";

type Section = "overview" | "transactions" | "sources" | "onboarding" | "audit";
type Analysis = ReturnType<typeof explainIssues>;
const SECTION_VALUES: Section[] = ["overview", "transactions", "sources", "onboarding", "audit"];
const SECTIONS = {
  overview: "마감 대시보드",
  transactions: "거래 대사",
  sources: "자료 관리",
  onboarding: "온보딩 설계",
  audit: "감사 기록",
};

function sectionFromUrl(): Section {
  if (typeof window === "undefined") return "overview";
  const value = new URL(window.location.href).searchParams.get("view");
  return SECTION_VALUES.includes(value as Section) ? (value as Section) : "overview";
}

async function responseData(response: Response) {
  const data = await response.json();
  if (!response.ok)
    throw new ApiRequestError(
      data.error?.message || "요청을 처리하지 못했습니다.",
      response.status,
      data.error?.code,
    );
  return data;
}
class ApiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
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
  const [pendingSession, setPendingSession] = useState<SessionSelection | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const mobileMenuButton = useRef<HTMLButtonElement>(null);
  const mobileMenuCloseButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
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
  useEffect(() => {
    const restoreView = (focusHeading = false) => {
      const nextSection = sectionFromUrl();
      setSection(nextSection);
      setMobileNav(false);
      setSearch("");
      if (nextSection === "transactions") setFilter("issues");
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      if (focusHeading) requestAnimationFrame(() => pageHeading.current?.focus());
    };
    restoreView();
    const onPopState = () => restoreView(true);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const update = () => {
      setIsMobile(media.matches);
      if (!media.matches) setMobileNav(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!isMobile || !mobileNav) return;
    const menu = sidebar.current;
    if (!menu) return;
    const trigger = mobileMenuButton.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    mobileMenuCloseButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileNav(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        menu.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      if (window.matchMedia("(max-width: 800px)").matches) trigger?.focus();
    };
  }, [isMobile, mobileNav]);

  async function refresh() {
    try {
      const view = await responseData(await fetch("/api/workspace"));
      setWorkspace(view);
      return view as WorkspaceView;
    } catch (failure) {
      if (failure instanceof ApiRequestError && failure.status === 401) {
        await recoverExpiredSession();
        return null;
      }
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
          ? "검토 사유와 증빙 참조 정보를 기록했습니다."
          : command.action === "close"
            ? "8월 마감을 확정했습니다. 마감 증빙 파일을 내려받을 수 있습니다."
            : command.action === "import"
              ? "자료를 반영했습니다. 대사를 다시 실행해 주세요."
              : "대사를 완료했습니다. 최신 자료로 결과를 갱신했습니다.",
      );
      return true;
    } catch (failure) {
      if (failure instanceof ApiRequestError && failure.status === 401) {
        await recoverExpiredSession();
        return false;
      }
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
  async function reset(selection?: SessionSelection) {
    setBusy(true);
    try {
      const nextSelection =
        selection ??
        pendingSession ??
        (workspace
          ? { templateId: workspace.profile.templateId as SessionSelection["templateId"] }
          : undefined);
      const view = await responseData(
        await fetch("/api/session", {
          method: "POST",
          ...(nextSelection
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(nextSelection),
              }
            : {}),
        }),
      );
      setWorkspace(view);
      setResetOpen(false);
      setPendingSession(null);
      setSelectedKey(null);
      navigate("overview");
      setSearch("");
      setFilter("issues");
      setError("");
      showToast(`${view.profile.brandName} 프로필로 새 데모를 시작했습니다.`);
    } catch (failure) {
      showToast((failure as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function recoverExpiredSession(): Promise<boolean> {
    setBusy(true);
    try {
      const selection = workspace
        ? { templateId: workspace.profile.templateId as SessionSelection["templateId"] }
        : undefined;
      const view = await responseData(
        await fetch("/api/session", {
          method: "POST",
          ...(selection
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(selection),
              }
            : {}),
        }),
      );
      setWorkspace(view);
      setSelectedKey(null);
      setImportOpen(false);
      setCloseOpen(false);
      setAnalysis(null);
      setError("");
      navigate("overview");
      showToast(
        "데모 세션이 만료되어 같은 온보딩 프로필로 새 데모를 시작했습니다. 직전 요청은 다시 실행하지 않았습니다.",
      );
      return true;
    } catch (failure) {
      showToast((failure as Error).message, true);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function analyze() {
    setAnalysisLoading(true);
    try {
      setAnalysis(await responseData(await fetch("/api/analysis")));
    } catch (failure) {
      if (failure instanceof ApiRequestError && failure.status === 401) {
        await recoverExpiredSession();
        return;
      }
      showToast((failure as Error).message, true);
    } finally {
      setAnalysisLoading(false);
    }
  }
  function navigate(value: Section) {
    setSection(value);
    setMobileNav(false);
    setSearch("");
    if (value === "transactions") setFilter(workspace?.summary.unresolved ? "issues" : "all");
    const url = new URL(window.location.href);
    if (value === "overview") url.searchParams.delete("view");
    else url.searchParams.set("view", value);
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) window.history.pushState({ view: value }, "", nextUrl);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    requestAnimationFrame(() => pageHeading.current?.focus());
  }
  function reviewIssues() {
    navigate("transactions");
    setFilter("issues");
  }
  function prepareSession(selection: SessionSelection) {
    setPendingSession(selection);
    setResetOpen(true);
  }
  const selectedRow = workspace?.rows.find((row) => row.key === selectedKey) ?? null;
  const progress = workspace
    ? Math.round(
        ((workspace.summary.total - workspace.summary.unresolved) /
          Math.max(1, workspace.summary.total)) *
          100,
      )
    : 0;
  const pendingTemplate = workspace?.availableProfiles.find(
    (profile) => profile.templateId === pendingSession?.templateId,
  );

  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        aria-hidden={isMobile && mobileNav}
        tabIndex={isMobile && mobileNav ? -1 : undefined}
      >
        본문으로 건너뛰기
      </a>
      {mobileNav && (
        <button
          className="sidebar-backdrop"
          onClick={() => setMobileNav(false)}
          aria-hidden="true"
          tabIndex={-1}
        />
      )}
      <aside
        ref={sidebar}
        id="workspace-navigation"
        className={`sidebar ${mobileNav ? "is-open" : ""}`}
        aria-label="주 메뉴"
        aria-hidden={isMobile && !mobileNav}
        aria-modal={isMobile && mobileNav ? true : undefined}
        role={isMobile && mobileNav ? "dialog" : undefined}
        inert={isMobile && !mobileNav ? true : undefined}
      >
        <Link href="/" className="brand-link" aria-label="ClosePilot 홈">
          <Brand />
        </Link>
        <button
          ref={mobileMenuCloseButton}
          className="mobile-sidebar-close icon-button"
          onClick={() => setMobileNav(false)}
          aria-label="메뉴 닫기"
        >
          <PanelLeftClose size={20} />
        </button>
        <div className="workspace-switcher">
          <span className="workspace-monogram">{workspace?.profile.monogram ?? "L"}</span>
          <div>
            <strong>{workspace?.profile.brandName ?? "LUMIÈRE"}</strong>
            <span>
              {workspace ? `${workspace.profile.industry} 가상 브랜드` : "가상 브랜드 · 체험용"}
            </span>
          </div>
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav>
          <button
            className={section === "overview" ? "active" : ""}
            aria-current={section === "overview" ? "page" : undefined}
            onClick={() => navigate("overview")}
          >
            <LayoutDashboard size={18} />
            마감 대시보드
          </button>
          <button
            className={section === "transactions" ? "active" : ""}
            aria-current={section === "transactions" ? "page" : undefined}
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
            aria-current={section === "sources" ? "page" : undefined}
            onClick={() => navigate("sources")}
          >
            <Database size={18} />
            자료 관리
          </button>
          <button
            className={section === "onboarding" ? "active" : ""}
            aria-current={section === "onboarding" ? "page" : undefined}
            onClick={() => navigate("onboarding")}
          >
            <Settings2 size={18} />
            온보딩 설계
          </button>
          <button
            className={section === "audit" ? "active" : ""}
            aria-current={section === "audit" ? "page" : undefined}
            onClick={() => navigate("audit")}
          >
            <ShieldCheck size={18} />
            감사 기록
          </button>
        </nav>
        <div className="sidebar-divider" />
        <span className="nav-caption">RESOURCES</span>
        <nav>
          <Link href="/guide">
            <BookOpen size={18} />
            제품 가이드
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
            <span>8월 마감 현황</span>
          </div>
          <h3>{workspace?.close ? "8월 마감을 완료했습니다." : "마감 조건을 확인하세요."}</h3>
          <div className="sidebar-progress">
            <span style={{ width: `${progress}%` }} />
          </div>
          <p title="자동 일치 건수와 검토 완료 건수를 합산한 비율입니다">
            {workspace ? `대사 처리율 ${progress}%` : "자료를 준비하고 있습니다"}
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
            <span>방문자별 체험 공간</span>
          </div>
          <button onClick={() => setResetOpen(true)} aria-label="새 데모 시작" title="새 데모 시작">
            <RotateCcw size={16} />
          </button>
        </div>
      </aside>
      <div className="workspace-main" inert={isMobile && mobileNav ? true : undefined}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              ref={mobileMenuButton}
              className="icon-button mobile-menu"
              aria-label="메뉴 열기"
              aria-controls="workspace-navigation"
              aria-expanded={mobileNav}
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb-workspace">마감 작업</span>
            <span className="breadcrumb-divider">/</span>
            <strong>{SECTIONS[section]}</strong>
          </div>
          <div className="topbar-actions">
            <label className="global-search">
              <Search size={15} />
              <input
                ref={searchInput}
                aria-label="전체 주문번호 검색"
                value={search}
                placeholder="주문번호 검색"
                onFocus={() => {
                  setSection("transactions");
                  setFilter("all");
                  const url = new URL(window.location.href);
                  url.searchParams.set("view", "transactions");
                  window.history.replaceState(
                    { view: "transactions" },
                    "",
                    `${url.pathname}${url.search}${url.hash}`,
                  );
                }}
                onChange={(event) => setSearch(event.target.value)}
              />
              <kbd>
                <CommandIcon size={10} /> K
              </kbd>
            </label>
            <span className="demo-badge">
              <span />
              가상 데이터 · 데모
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
              <div className="page-title-row">
                <h1 ref={pageHeading} tabIndex={-1}>
                  {section === "overview" ? "매출 마감" : SECTIONS[section]}
                </h1>
                <span className={`period-status ${workspace?.close ? "is-closed" : ""}`}>
                  {workspace?.close ? "마감 완료" : "마감 진행 중"}
                </span>
              </div>
              <p>
                {section === "overview"
                  ? workspace?.close
                    ? "확정한 마감 결과와 검토 근거를 확인하세요."
                    : "주문과 정산 자료를 비교하고, 차이를 확인해 마감하세요."
                  : section === "transactions"
                    ? "주문별 정산 결과와 차이의 원인을 확인하세요."
                    : section === "sources"
                      ? workspace?.close
                        ? "마감에 사용한 CSV 자료와 원본 정보를 확인하세요."
                        : "채널별 CSV를 같은 형식으로 정리하고 원본 자료를 관리하세요."
                      : section === "onboarding"
                        ? "고객 문제를 버전형 설정과 재사용 가능한 제품 기능으로 전환한 과정을 확인하세요."
                        : "자료 반영부터 검토 승인과 마감까지 변경 이력을 확인하세요."}
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
                자료 가져오기
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
                  <h2>마감 자료를 불러오지 못했습니다</h2>
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
                  <h2>마감 자료를 준비하고 있습니다</h2>
                  <p>이 데모에서 사용할 가상 주문과 정산 자료를 불러옵니다.</p>
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
                    <b>새 자료를 반영했습니다.</b> 아래 수치는 미리보기입니다. 대사를 다시 실행해야
                    검토 승인과 마감 확정을 진행할 수 있습니다.
                  </p>
                </div>
              )}
              {section === "overview" && (
                <>
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
                      progress={
                        (workspace.summary.matched / Math.max(1, workspace.summary.total)) * 100
                      }
                    />
                    <Metric
                      label="검토가 필요한 거래"
                      value={`${workspace.summary.unresolved}`}
                      suffix="건"
                      detail={`미검토 차액 절댓값 합계 ${money(workspace.rows.filter((row) => row.kind !== "matched" && !row.resolution).reduce((sum, row) => sum + Math.abs(row.delta), 0))}`}
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
                            ? "8월 마감 결과와 검토 근거를 저장했습니다."
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
                        onClick={
                          workspace.summary.unresolved ? reviewIssues : () => setCloseOpen(true)
                        }
                      >
                        {workspace.summary.unresolved ? "확인할 거래 보기" : "마감 점검"}
                        <ArrowRight size={15} />
                      </button>
                      {workspace.summary.unresolved > 0 && (
                        <button
                          className="text-button"
                          onClick={() => void analyze()}
                          disabled={analysisLoading}
                        >
                          {analysisLoading ? "불러오는 중…" : "검토 방법"}
                        </button>
                      )}
                    </div>
                  </div>
                  <TransactionTable
                    workspace={workspace}
                    onSelect={(row) => setSelectedKey(row.key)}
                    filter={filter}
                    setFilter={setFilter}
                    search={search}
                    setSearch={setSearch}
                  />
                  <div className="analytics-grid overview-analytics">
                    <TrendChart workspace={workspace} />
                    <ChannelPanel workspace={workspace} onOpen={() => navigate("sources")} />
                  </div>
                  <div className="overview-bottom">
                    <div>
                      <ShieldCheck size={16} />
                      <span>원 단위로 대사하고, 검토 근거를 기록합니다</span>
                    </div>
                    <button className="text-button" onClick={() => setCloseOpen(true)}>
                      {workspace.close ? "마감 증빙 보기" : "마감 체크리스트"}
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </>
              )}
              {section === "transactions" && (
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
              {section === "onboarding" && (
                <OnboardingPanel
                  workspace={workspace}
                  busy={busy}
                  onPrepareSession={prepareSession}
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
                            ? `감사 기록 ${view.events.length}건의 해시 연결을 확인했습니다. 이상이 없습니다.`
                            : "감사 기록의 해시가 일치하지 않습니다. 기록을 확인해 주세요.",
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
              ClosePilot<span className="footer-dot">·</span>근거를 남기는 매출 마감
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
            onSelect={setSelectedKey}
            onCommand={onCommand}
            onSessionExpired={recoverExpiredSession}
            busy={busy}
          />
          <ImportModal
            open={importOpen}
            onClose={() => setImportOpen(false)}
            onCommand={onCommand}
            version={workspace.version}
            busy={busy}
            profileName={workspace.profile.brandName}
            policy={workspace.profile.policy}
            savedMappings={workspace.profile.mappings}
            onSessionExpired={recoverExpiredSession}
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
              규칙 기반 검토 안내<span>LLM 미사용</span>
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
                        navigate("transactions");
                        setSelectedKey(step.rowKey);
                      }}
                    >
                      {step.orderId}
                      <ArrowUpRight size={14} />
                    </button>
                    <strong>{deltaMoney(step.delta)}</strong>
                    <p>{step.explanation}</p>
                    <small>원본 자료: {step.evidence.join(" · ")}</small>
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
      <Modal
        open={resetOpen}
        onClose={() => {
          setResetOpen(false);
          setPendingSession(null);
        }}
        title={pendingSession?.brandName ? "현재 설정을 복제할까요?" : "새 데모를 시작할까요?"}
      >
        <div className="reset-body">
          <p>
            {pendingSession?.brandName
              ? `${workspace?.profile.brandName ?? "현재 브랜드"} 설정을 ${pendingSession.brandName} 작업공간으로 복제합니다. 거래 자료와 검토 기록은 새 가상 데이터로 시작합니다.`
              : pendingTemplate && pendingTemplate.templateId !== workspace?.profile.templateId
                ? `${pendingTemplate.brandName} 온보딩 설정으로 새 작업공간을 만듭니다. 현재 자료와 검토 기록에는 다시 접근할 수 없습니다.`
                : "새 데모를 시작하면 현재 자료와 검토 기록에 다시 접근할 수 없습니다. 필요한 결과를 먼저 CSV로 내려받으세요. 마감을 확정했다면 마감 증빙 파일도 저장해 주세요."}
          </p>
          {workspace && (
            <a href="/api/export?format=csv" download className="text-button">
              <Download size={16} />
              현재 대사 결과 다운로드
            </a>
          )}
          <div className="modal-footer">
            <button
              className="button secondary"
              onClick={() => {
                setResetOpen(false);
                setPendingSession(null);
              }}
            >
              계속 작업하기
            </button>
            <button className="button primary" disabled={busy} onClick={() => void reset()}>
              <RotateCcw size={16} />
              {busy ? "준비 중…" : pendingSession?.brandName ? "설정 복제 후 시작" : "새 데모 시작"}
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
