"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  ListFilter,
  CheckCircle2,
} from "lucide-react";
import type { ReviewedRow, WorkspaceView } from "@/application/workbench";
import { CHANNELS, CHANNEL_LABELS, ISSUE_LABELS, type Channel } from "@/domain/model";
import { deltaMoney, money } from "./format";
import { compareReviewRows } from "./review-queue";

export type RowFilter = "issues" | "all" | "reviewed";
export function ChannelBadge({ channel, label = true }: { channel: Channel; label?: boolean }) {
  return (
    <span className="channel-badge">
      <i className={`channel-symbol ${channel}`}>
        {channel === "d2c" ? "L" : channel === "naver" ? "N" : "C"}
      </i>
      {label && CHANNEL_LABELS[channel]}
    </span>
  );
}
export function TransactionTable({
  workspace,
  onSelect,
  filter,
  setFilter,
  search,
  setSearch,
  expanded = false,
}: {
  workspace: WorkspaceView;
  onSelect: (row: ReviewedRow) => void;
  filter: RowFilter;
  setFilter: (filter: RowFilter) => void;
  search: string;
  setSearch: (value: string) => void;
  expanded?: boolean;
}) {
  const [channel, setChannel] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [ascending, setAscending] = useState(false);
  const tabSetId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pageSize = expanded ? 12 : 6;
  const tabs = [
    { id: "issues", label: "확인 필요", count: workspace.summary.unresolved },
    { id: "all", label: "전체 거래", count: workspace.summary.total },
    { id: "reviewed", label: "검토 완료", count: workspace.summary.reviewed },
  ] as const;
  const panelId = `${tabSetId}-panel`;
  function selectTab(tab: RowFilter, index: number, focus = false) {
    setFilter(tab);
    setPage(0);
    if (focus) tabRefs.current[index]?.focus();
  }
  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const key = event.key;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) return;
    event.preventDefault();
    const nextIndex =
      key === "Home"
        ? 0
        : key === "End"
          ? tabs.length - 1
          : (index + (key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    selectTab(tabs[nextIndex].id, nextIndex, true);
  }
  const rows = workspace.rows
    .filter((row) => {
      const matchFilter =
        filter === "all" ||
        (filter === "issues" ? row.kind !== "matched" && !row.resolution : !!row.resolution);
      return (
        matchFilter &&
        (channel === "all" || row.channel === channel) &&
        (!search || row.orderId.toLowerCase().includes(search.trim().toLowerCase()))
      );
    })
    .sort((a, b) => compareReviewRows(a, b, ascending));
  const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  return (
    <section className="card transactions-card" id="transactions">
      <div className="card-heading">
        <div>
          <h2>
            거래별 대사 결과
            <span className="subtle-count">{workspace.summary.total}</span>
          </h2>
          <p>
            {expanded ? "주문별 금액과 검토 근거를 확인하세요" : "차액과 원본 자료를 확인하세요"}
          </p>
        </div>
        <a className="button ghost small" href="/api/export?format=csv" download>
          <Download size={15} />
          <span>전체 CSV 다운로드</span>
        </a>
      </div>
      <div className="table-toolbar">
        <div className="table-tabs" role="tablist" aria-label="거래 상태">
          {tabs.map((tab, index) => (
            <button
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              role="tab"
              id={`${tabSetId}-${tab.id}`}
              aria-controls={panelId}
              aria-selected={filter === tab.id}
              tabIndex={filter === tab.id ? 0 : -1}
              key={tab.id}
              className={filter === tab.id ? "active" : ""}
              onClick={() => selectTab(tab.id, index)}
              onKeyDown={(event) => moveTab(event, index)}
            >
              {tab.label}
              <span>{tab.count}</span>
            </button>
          ))}
        </div>
        <div className="table-filters">
          <div className="select-with-icon">
            <ListFilter size={14} />
            <select
              aria-label="채널 필터"
              value={channel}
              onChange={(event) => {
                setChannel(event.target.value);
                setPage(0);
              }}
            >
              <option value="all">전체 채널</option>
              {CHANNELS.map((value) => (
                <option key={value} value={value}>
                  {CHANNEL_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          {expanded && (
            <label className="table-search">
              <Search size={15} />
              <input
                aria-label="주문번호 검색"
                placeholder="주문번호 검색"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
              />
            </label>
          )}
        </div>
      </div>
      <div
        className="transaction-tabpanel"
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${tabSetId}-${filter}`}
      >
        <div className="table-scroll">
          <table className="transaction-table">
            <caption className="sr-only">주문과 정산 자료의 금액 대사 및 예외 검토 목록</caption>
            <thead>
              <tr>
                <th>주문번호 / 주문일</th>
                <th>판매 채널</th>
                <th className="numeric">예상 정산액</th>
                <th className="numeric">자료상 정산액</th>
                <th className="numeric" aria-sort={ascending ? "ascending" : "descending"}>
                  <button
                    onClick={() => setAscending(!ascending)}
                    title="차액의 절댓값을 기준으로 정렬"
                  >
                    차이 금액
                    <ArrowDownUp size={12} />
                  </button>
                </th>
                <th>검토 상태</th>
                <th>
                  <span className="sr-only">상세 보기</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.key} className={row.resolution ? "resolved-row" : ""}>
                  <td>
                    <button className="order-id" onClick={() => onSelect(row)}>
                      {row.orderId}
                    </button>
                    <span className="table-date">{row.date.replaceAll("-", ".")}</span>
                  </td>
                  <td>
                    <ChannelBadge channel={row.channel} />
                  </td>
                  <td className="numeric">{money(row.expectedNet)}</td>
                  <td className="numeric">{money(row.actualNet)}</td>
                  <td
                    className={`numeric delta-cell ${row.delta ? (row.resolution ? "resolved-delta" : "negative") : "neutral"}`}
                  >
                    {deltaMoney(row.delta)}
                  </td>
                  <td>
                    <span
                      className={`status-badge ${row.resolution ? "reviewed" : row.kind === "matched" ? "matched" : row.kind === "timing" ? "timing" : "issue"}`}
                    >
                      {row.resolution ? (
                        <>
                          <CheckCircle2 size={12} />
                          검토 완료
                        </>
                      ) : (
                        <>
                          <i />
                          {ISSUE_LABELS[row.kind]}
                        </>
                      )}
                    </span>
                  </td>
                  <td>
                    <button
                      className="row-arrow"
                      aria-label={`${row.orderId} 거래 검토`}
                      onClick={() => onSelect(row)}
                    >
                      <ArrowRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="empty-state">
            <CheckCircle2 size={30} />
            <h3>
              {filter === "issues" && !search && channel === "all"
                ? "모든 예외 거래를 검토했습니다"
                : "조건에 맞는 거래가 없습니다"}
            </h3>
            <p>
              {filter === "issues" && !search && channel === "all"
                ? workspace.close
                  ? "마감 증빙 보기에서 확정한 결과를 내려받을 수 있습니다."
                  : "마감 점검에서 남은 조건을 확인하고 마감을 확정하세요."
                : filter === "reviewed" && !search && channel === "all"
                  ? "거래 상세에서 검토를 승인하면 이 목록에 표시됩니다."
                  : "검색어나 판매 채널, 검토 상태를 바꿔 다시 확인하세요."}
            </p>
            {(search || channel !== "all") && (
              <button
                className="text-button"
                onClick={() => {
                  setSearch("");
                  setChannel("all");
                }}
              >
                필터 초기화
              </button>
            )}
          </div>
        )}
        <div className="table-footer">
          <span>
            {rows.length
              ? `${rows.length}건 중 ${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, rows.length)}건`
              : "0건"}
            <span className="table-footer-note">
              <span className="footer-dot">·</span>검토 승인 후에도 원본 금액은 유지됩니다
            </span>
          </span>
          <div className="pagination">
            <button
              aria-label="이전 페이지"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>{currentPage + 1}</span>
            <button
              aria-label="다음 페이지"
              disabled={currentPage >= lastPage}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
