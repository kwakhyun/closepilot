"use client";

import Link from "next/link";
import type { RefObject } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CircleHelp,
  Database,
  FolderSync,
  LayoutDashboard,
  ListChecks,
  Menu,
  PanelLeftClose,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import type { WorkspaceView } from "@/application/workbench";
import { Brand } from "./brand";

export type WorkspaceSection = "overview" | "transactions" | "sources" | "onboarding" | "audit";

export const WORKSPACE_SECTION_VALUES: WorkspaceSection[] = [
  "overview",
  "transactions",
  "sources",
  "onboarding",
  "audit",
];

export const WORKSPACE_SECTIONS: Record<WorkspaceSection, string> = {
  overview: "마감 대시보드",
  transactions: "거래 대사",
  sources: "자료 관리",
  onboarding: "온보딩 설계",
  audit: "감사 기록",
};

const WORKSPACE_NAV_ITEMS = [
  { section: "overview", label: "마감 대시보드", icon: LayoutDashboard },
  { section: "transactions", label: "거래 대사", icon: ListChecks },
  { section: "sources", label: "자료 관리", icon: Database },
  { section: "onboarding", label: "온보딩 설계", icon: Settings2 },
  { section: "audit", label: "감사 기록", icon: ShieldCheck },
] as const;

interface WorkspaceSidebarProps {
  workspace: WorkspaceView | null;
  section: WorkspaceSection;
  progress: number;
  mobileNav: boolean;
  isMobile: boolean;
  sidebarRef: RefObject<HTMLElement | null>;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onNavigate: (section: WorkspaceSection) => void;
  onCloseMenu: () => void;
  onOpenClose: () => void;
  onReset: () => void;
}

export function WorkspaceSidebar({
  workspace,
  section,
  progress,
  mobileNav,
  isMobile,
  sidebarRef,
  closeButtonRef,
  onNavigate,
  onCloseMenu,
  onOpenClose,
  onReset,
}: WorkspaceSidebarProps) {
  return (
    <aside
      ref={sidebarRef}
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
        ref={closeButtonRef}
        className="mobile-sidebar-close icon-button"
        onClick={onCloseMenu}
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
      <span className="nav-caption">매출 관리</span>
      <nav>
        {WORKSPACE_NAV_ITEMS.map(({ section: itemSection, label, icon: Icon }) => (
          <button
            key={itemSection}
            className={section === itemSection ? "active" : ""}
            aria-current={section === itemSection ? "page" : undefined}
            onClick={() => onNavigate(itemSection)}
          >
            <Icon size={18} />
            {label}
            {itemSection === "transactions" && workspace && workspace.summary.unresolved > 0 && (
              <span className="nav-badge">{workspace.summary.unresolved}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="sidebar-divider" />
      <span className="nav-caption">도움말</span>
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
          <span>{workspace?.period ?? "2026-08"} 마감 현황</span>
        </div>
        <h3>{workspace?.close ? "마감을 완료했습니다." : "마감 조건을 확인하세요."}</h3>
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
        <button onClick={onOpenClose} disabled={!workspace}>
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
        <button onClick={onReset} aria-label="새 데모 시작" title="새 데모 시작">
          <RotateCcw size={16} />
        </button>
      </div>
    </aside>
  );
}

interface WorkspaceTopbarProps {
  section: WorkspaceSection;
  search: string;
  mobileNav: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  onSearch: (value: string) => void;
  onSearchFocus: () => void;
  onOpenMenu: () => void;
}

export function WorkspaceTopbar({
  section,
  search,
  mobileNav,
  searchInputRef,
  menuButtonRef,
  onSearch,
  onSearchFocus,
  onOpenMenu,
}: WorkspaceTopbarProps) {
  return (
    <header className="topbar">
      <div className="breadcrumb">
        <button
          ref={menuButtonRef}
          className="icon-button mobile-menu"
          aria-label="메뉴 열기"
          aria-controls="workspace-navigation"
          aria-expanded={mobileNav}
          onClick={onOpenMenu}
        >
          <Menu size={20} />
        </button>
        <span className="breadcrumb-workspace">마감 작업</span>
        <span className="breadcrumb-divider">/</span>
        <strong>{WORKSPACE_SECTIONS[section]}</strong>
      </div>
      <div className="topbar-actions">
        <label className="global-search">
          <Search size={15} />
          <input
            ref={searchInputRef}
            aria-label="전체 주문번호 검색"
            value={search}
            placeholder="주문번호 검색"
            onFocus={onSearchFocus}
            onChange={(event) => onSearch(event.target.value)}
          />
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
  );
}
