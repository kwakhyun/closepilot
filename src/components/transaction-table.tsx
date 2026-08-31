"use client";

import { useState } from "react";
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
  const pageSize = expanded ? 12 : 6;
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
    .sort(
      (a, b) =>
        (ascending ? 1 : -1) * (Math.abs(a.delta) - Math.abs(b.delta)) ||
        a.key.localeCompare(b.key),
    );
  const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  return (
    <section className="card transactions-card" id="transactions">
      <div className="card-heading">
        <div>
          <h2>
            {expanded ? "전체 거래 대사" : "지금 확인할 거래"}
            <span className="subtle-count">{workspace.summary.total}</span>
          </h2>
          <p>
            {expanded
              ? "원본 금액과 검토 근거를 거래 단위로 추적합니다"
              : "작은 차이도 놓치지 않도록, 확인이 필요한 건부터"}
          </p>
        </div>
        <a className="button ghost small" href="/api/export?format=csv" download>
          <Download size={15} />
          <span>전체 CSV</span>
        </a>
      </div>
      <div className="table-toolbar">
        <div className="table-tabs" role="tablist" aria-label="거래 상태">
          {(
            [
              { id: "issues", label: "확인 필요", count: workspace.summary.unresolved },
              { id: "all", label: "전체 거래", count: workspace.summary.total },
              { id: "reviewed", label: "검토 완료", count: workspace.summary.reviewed },
            ] as const
          ).map((tab) => (
            <button
              role="tab"
              aria-selected={filter === tab.id}
              key={tab.id}
              className={filter === tab.id ? "active" : ""}
              onClick={() => {
                setFilter(tab.id);
                setPage(0);
              }}
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
                aria-label="거래번호 검색"
                placeholder="거래번호 검색"
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
      <div className="table-scroll">
        <table className="transaction-table">
          <caption className="sr-only">주문과 정산 자료의 금액 대사 및 예외 검토 목록</caption>
          <thead>
            <tr>
              <th>주문번호 / 주문일</th>
              <th>판매 채널</th>
              <th className="numeric">예상 정산액</th>
              <th className="numeric">실제 정산액</th>
              <th className="numeric" aria-sort={ascending ? "ascending" : "descending"}>
                <button onClick={() => setAscending(!ascending)}>
                  차이 금액
                  <ArrowDownUp size={12} />
                </button>
              </th>
              <th>검토 상태</th>
              <th>
                <span className="sr-only">상세보기</span>
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
              ? "확인할 거래를 모두 검토했어요"
              : "조건에 맞는 거래가 없어요"}
          </h3>
          <p>
            {filter === "reviewed"
              ? "거래 상세에서 근거를 기록하면 이곳에 표시됩니다."
              : "다른 상태나 판매 채널로 다시 확인해 보세요."}
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
            <span className="footer-dot">·</span>원본 금액은 승인 후에도 유지됩니다
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
    </section>
  );
}
