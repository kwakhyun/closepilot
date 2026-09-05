"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleHelp,
  Download,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import type { Command } from "@/application/workbench";
import { AuditPanel, SourcesPanel } from "./workspace-panels";
import { ReviewDrawer } from "./review-drawer";
import { ImportModal } from "./import-modal";
import { CloseModal } from "./close-modal";
import { Modal } from "./modal";
import { deltaMoney } from "./format";
import { OnboardingPanel } from "./onboarding-panel";
import { DashboardOverview, TransactionsDashboard } from "./dashboard-sections";
import { type RowFilter } from "./transaction-table";
import {
  WORKSPACE_SECTIONS,
  WORKSPACE_SECTION_VALUES,
  WorkspaceSidebar,
  type WorkspaceSection,
  WorkspaceTopbar,
} from "./workspace-navigation";
import { type SessionSelection, useWorkspaceSession } from "./use-workspace-session";
import { PolicySimulator } from "./policy-simulator";
import { PackageInspector } from "./package-inspector";
import { MonthWorkspace } from "./month-workspace";
import { FollowupPanel } from "./followup-panel";
import { periodLabel } from "@/domain/period";
import "./workbench-tools.css";

function sectionFromUrl(): WorkspaceSection {
  if (typeof window === "undefined") return "overview";
  const value = new URL(window.location.href).searchParams.get("view");
  return WORKSPACE_SECTION_VALUES.includes(value as WorkspaceSection)
    ? (value as WorkspaceSection)
    : "overview";
}

export function Dashboard() {
  const [settingsView, setSettingsView] = useState<"brand" | "month" | "policy">("brand");
  const {
    workspace,
    sessionRevision,
    error,
    busy,
    analysis,
    analysisLoading,
    toast,
    setToast,
    setAnalysis,
    showToast,
    refresh,
    onCommand: executeCommand,
    reset: createSession,
    recoverExpiredSession: recoverSession,
    analyze,
  } = useWorkspaceSession();
  const [section, setSection] = useState<WorkspaceSection>("overview");
  const [filter, setFilter] = useState<RowFilter>("issues");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [pendingSession, setPendingSession] = useState<SessionSelection | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const mobileMenuButton = useRef<HTMLButtonElement>(null);
  const mobileMenuCloseButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
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

  function navigate(value: WorkspaceSection) {
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

  async function recoverExpiredSession(): Promise<boolean> {
    const recovered = await recoverSession();
    if (!recovered) return false;
    setSelectedKey(null);
    setImportOpen(false);
    setCloseOpen(false);
    setAnalysis(null);
    navigate("overview");
    return true;
  }

  async function onCommand(command: Command): Promise<boolean> {
    const result = await executeCommand(command);
    if (result === "expired") await recoverExpiredSession();
    return result === "success";
  }

  async function reset(selection?: SessionSelection) {
    const nextSelection =
      selection ??
      pendingSession ??
      (workspace
        ? { templateId: workspace.profile.templateId as SessionSelection["templateId"] }
        : undefined);
    const view = await createSession(nextSelection);
    if (!view) return;
    setResetOpen(false);
    setPendingSession(null);
    setSelectedKey(null);
    navigate("overview");
    setImportOpen(false);
    setCloseOpen(false);
    setSearch("");
    setFilter("issues");
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
      <WorkspaceSidebar
        workspace={workspace}
        section={section}
        progress={progress}
        mobileNav={mobileNav}
        isMobile={isMobile}
        sidebarRef={sidebar}
        closeButtonRef={mobileMenuCloseButton}
        onNavigate={navigate}
        onCloseMenu={() => setMobileNav(false)}
        onOpenClose={() => setCloseOpen(true)}
        onReset={() => setResetOpen(true)}
      />
      <div className="workspace-main" inert={isMobile && mobileNav ? true : undefined}>
        <WorkspaceTopbar
          section={section}
          search={search}
          mobileNav={mobileNav}
          searchInputRef={searchInput}
          menuButtonRef={mobileMenuButton}
          onSearch={setSearch}
          onSearchFocus={() => {
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
          onOpenMenu={() => setMobileNav(true)}
        />
        <main id="main-content" className="main-content">
          <div className="page-header">
            <div>
              <div className="page-eyebrow">
                <span>매출 관리</span>
                <i />
                <span>{periodLabel(workspace?.period ?? "2026-08")}</span>
              </div>
              <div className="page-title-row">
                <h1 ref={pageHeading} tabIndex={-1}>
                  {section === "overview" ? "매출 마감" : WORKSPACE_SECTIONS[section]}
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
                        ? "브랜드 설정, 마감 월과 수수료 정책을 관리하세요."
                        : "자료 반영부터 검토 승인과 마감까지 변경 이력을 확인하세요."}
              </p>
            </div>
            <div className="page-actions">
              <button
                className="period-picker"
                title="월별 작업공간"
                onClick={() => {
                  setSettingsView("month");
                  navigate("onboarding");
                }}
              >
                <CalendarDays size={16} />
                <span>
                  {workspace?.period ?? "2026-08"}-01 ~ {workspace?.asOf ?? "2026-08-31"}
                </span>
              </button>
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
                {busy ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}
                대사 실행
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
                  <LoaderCircle size={28} className="spin" />
                  <h2>마감 자료를 준비하고 있습니다</h2>
                  <p>이 데모에서 사용할 가상 주문과 정산 자료를 불러옵니다.</p>
                </>
              )}
            </div>
          ) : (
            <>
              {workspace.demoMode === "completed-showcase" && (
                <div className="notice showcase-notice">
                  <ShieldCheck size={18} />
                  <p>
                    <b>미리 완료된 합성 마감 예시입니다.</b> 실제 고객 승인이나 결제 처리가 아니며,
                    검토 기록과 마감 증빙의 읽기 전용 결과를 빠르게 살펴볼 수 있습니다.
                  </p>
                  <a href="/api/export?format=json" download className="text-button">
                    마감 증빙 내려받기
                  </a>
                </div>
              )}
              {!workspace.lastRunAt && (
                <div className="notice warm stale-notice">
                  <RefreshCw size={18} />
                  <p>
                    <b>자료 또는 정책이 변경되었습니다.</b> 아래 수치는 미리보기입니다. 대사를 다시
                    실행해야 검토 승인과 마감 확정을 진행할 수 있습니다.
                  </p>
                </div>
              )}
              {section === "overview" && (
                <DashboardOverview
                  workspace={workspace}
                  filter={filter}
                  search={search}
                  setFilter={setFilter}
                  setSearch={setSearch}
                  onSelect={setSelectedKey}
                  onOpenClose={() => setCloseOpen(true)}
                  analysisLoading={analysisLoading}
                  onAnalyze={() => void analyze()}
                  onReviewIssues={reviewIssues}
                  onOpenSources={() => navigate("sources")}
                  onViewResults={() => {
                    navigate("transactions");
                    setFilter("all");
                  }}
                />
              )}
              {section === "transactions" && (
                <TransactionsDashboard
                  workspace={workspace}
                  filter={filter}
                  search={search}
                  setFilter={setFilter}
                  setSearch={setSearch}
                  onSelect={setSelectedKey}
                  onOpenClose={() => setCloseOpen(true)}
                />
              )}
              {section === "sources" && (
                <SourcesPanel
                  workspace={workspace}
                  onUpload={() => setImportOpen(true)}
                  toast={showToast}
                />
              )}
              {section === "onboarding" && (
                <>
                  <div className="settings-navigation" role="group" aria-label="설정 보기">
                    {(
                      [
                        ["brand", "브랜드 설정"],
                        ["month", "월별 작업"],
                        ["policy", "정책 비교"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        aria-pressed={settingsView === value}
                        onClick={() => setSettingsView(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {settingsView === "month" && (
                    <MonthWorkspace
                      key={`month:${sessionRevision}`}
                      workspace={workspace}
                      busy={busy}
                      onPrepareSession={prepareSession}
                      onOpen={reset}
                    />
                  )}
                  {settingsView === "brand" && (
                    <OnboardingPanel
                      workspace={workspace}
                      busy={busy}
                      onPrepareSession={prepareSession}
                    />
                  )}
                  {settingsView === "policy" && (
                    <PolicySimulator
                      key={`policy:${sessionRevision}`}
                      workspace={workspace}
                      busy={busy}
                      onCommand={onCommand}
                    />
                  )}
                </>
              )}
              {section === "audit" && (
                <>
                  <PackageInspector key={`package:${sessionRevision}`} workspace={workspace} />
                  <FollowupPanel
                    key={`followup:${sessionRevision}:${workspace.version}`}
                    workspace={workspace}
                    busy={busy}
                    onCommand={onCommand}
                  />
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
                </>
              )}
            </>
          )}
          <footer className="app-footer">
            <span>
              ClosePilot<span className="footer-dot">·</span>근거를 남기는 매출 마감
            </span>
            <span>
              합성 데이터 데모 · 실제 결제 없음
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
            key={`${sessionRevision}:${selectedKey ?? "none"}`}
            row={selectedRow}
            workspace={workspace}
            onClose={() => setSelectedKey(null)}
            onSelect={setSelectedKey}
            onCommand={onCommand}
            onSessionExpired={recoverExpiredSession}
            busy={busy}
          />
          <ImportModal
            key={`import:${sessionRevision}`}
            open={importOpen}
            onClose={() => setImportOpen(false)}
            onCommand={onCommand}
            version={workspace.version}
            period={workspace.period}
            busy={busy}
            profileName={workspace.profile.brandName}
            policy={workspace.profile.policy}
            savedMappings={workspace.profile.mappings}
            onSessionExpired={recoverExpiredSession}
          />
          <CloseModal
            key={`close:${sessionRevision}`}
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
        title={
          pendingSession?.period
            ? "새 월의 작업을 시작할까요?"
            : pendingSession?.brandName
              ? "현재 설정을 복제할까요?"
              : "새 데모를 시작할까요?"
        }
      >
        <div className="reset-body">
          <p>
            {pendingSession?.period
              ? `${pendingSession.period} 합성 자료로 별도 작업공간을 만듭니다. 보관함에 있는 기존 작업은 보관 기간 안에 다시 열 수 있습니다. 기존 마감의 금액과 승인 기록은 변경하지 않습니다.`
              : pendingSession?.brandName
                ? `${workspace?.profile.brandName ?? "현재 브랜드"} 설정을 ${pendingSession.brandName} 작업공간으로 복제합니다. 거래 자료와 검토 기록은 새 가상 데이터로 시작합니다.`
                : pendingTemplate && pendingTemplate.templateId !== workspace?.profile.templateId
                  ? `${pendingTemplate.brandName} 온보딩 설정으로 새 작업공간을 만듭니다. 보관된 기존 작업은 월별 작업 보관함에서 다시 열 수 있습니다.`
                  : "별도의 합성 자료로 새 데모를 시작합니다. 보관함에 있는 기존 작업은 생성일로부터 30일간 다시 열 수 있습니다. 필요한 마감 증빙은 파일로도 내려받으세요."}
          </p>
          {workspace && (
            <a href="/api/export?format=csv" download className="text-button">
              <Download size={16} />
              현재 대사 결과 다운로드
            </a>
          )}
          {workspace?.close && (
            <a href="/api/export?format=json" download className="text-button">
              <Download size={16} />
              현재 마감 증빙 다운로드
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
              {busy
                ? "준비 중…"
                : pendingSession?.period
                  ? "새 월 작업 시작"
                  : pendingSession?.brandName
                    ? "설정 복제 후 시작"
                    : "새 데모 시작"}
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
