"use client";

import {
  ArrowRight,
  Check,
  CheckCheck,
  Copy,
  Download,
  FileSpreadsheet,
  FolderOpen,
  LockKeyhole,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { CHANNELS, CHANNEL_LABELS, FEE_BPS } from "@/domain/model";
import type { WorkspaceView } from "@/application/workbench";
import { ChannelBadge } from "./transaction-table";
import { money, timestamp } from "./format";

export function ChannelPanel({
  workspace,
  onOpen,
}: {
  workspace: WorkspaceView;
  onOpen: () => void;
}) {
  return (
    <section className="card channel-panel">
      <div className="card-heading">
        <div>
          <h2>채널별 마감 현황</h2>
          <p>연결된 판매 채널 3개</p>
        </div>
        <span className="icon-muted">
          <FolderOpen size={18} />
        </span>
      </div>
      <div className="channel-list">
        {CHANNELS.map((channel) => {
          const rows = workspace.rows.filter((row) => row.channel === channel);
          const unresolved = rows.filter((row) => row.kind !== "matched" && !row.resolution).length;
          const amount = rows.reduce((sum, row) => sum + row.expectedNet, 0);
          return (
            <div className="channel-summary" key={channel}>
              <div className="channel-summary-top">
                <ChannelBadge channel={channel} />
                <span className={unresolved ? "tiny-warning" : "tiny-success"}>
                  {unresolved ? `확인 ${unresolved}건` : "검토 완료"}
                </span>
              </div>
              <div className="channel-summary-value">
                <strong>{money(amount)}</strong>
                <span>{rows.length}건</span>
              </div>
              <div className="mini-progress">
                <span
                  style={{
                    width: `${((rows.length - unresolved) / Math.max(1, rows.length)) * 100}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <button className="card-bottom-link" onClick={onOpen}>
        연결된 자료 확인
        <ArrowRight size={15} />
      </button>
    </section>
  );
}

export function SourcesPanel({
  workspace,
  onUpload,
  toast,
}: {
  workspace: WorkspaceView;
  onUpload: () => void;
  toast: (message: string) => void;
}) {
  return (
    <>
      <div className="connector-grid">
        {CHANNELS.map((channel) => (
          <section className="card connector-card" key={channel}>
            <div>
              <ChannelBadge channel={channel} />
              <span className="soft-tag">CSV 어댑터</span>
            </div>
            <h3>정산 자료 표준화</h3>
            <p>채널별 파일을 공통 주문·정산 스키마로 연결합니다.</p>
            <dl>
              <div>
                <dt>가상 계약 수수료</dt>
                <dd>{FEE_BPS[channel] / 100}%</dd>
              </div>
              <div>
                <dt>지원 통화</dt>
                <dd>KRW · 원 단위</dd>
              </div>
            </dl>
            <small>실제 {CHANNEL_LABELS[channel]} API 연동이나 계약 요율이 아닙니다.</small>
          </section>
        ))}
      </div>
      <section className="card sources-card">
        <div className="card-heading">
          <div>
            <h2>
              수집한 자료 <span className="subtle-count">{workspace.sources.length}</span>
            </h2>
            <p>파일마다 행 수와 체크섬을 남겨 원본까지 추적합니다</p>
          </div>
          <button
            className="button primary small"
            onClick={onUpload}
            disabled={workspace.status === "closed"}
          >
            <Upload size={15} />
            자료 가져오기
          </button>
        </div>
        <div className="source-list">
          {workspace.sources.map((source) => (
            <article key={source.id}>
              <div className="source-file-icon">
                <FileSpreadsheet size={22} />
              </div>
              <div className="source-name">
                <h3>{source.name}</h3>
                <p>
                  {source.kind === "orders" ? "주문 원장" : "채널 정산"} · {source.rows}행 ·{" "}
                  {timestamp(source.importedAt)}
                </p>
                <code>{source.id}</code>
              </div>
              <div className="source-checksum">
                <span>
                  <CheckCheck size={14} />
                  수집 완료
                </span>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(source.digest);
                      toast("원본 체크섬을 복사했습니다.");
                    } catch {
                      toast("복사 권한이 없습니다. 표시된 체크섬을 직접 선택하세요.");
                    }
                  }}
                  title={source.digest}
                >
                  <code>{source.digest.slice(0, 16)}…</code>
                  <Copy size={13} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <div className="notice source-notice">
        <ShieldCheck size={19} />
        <p>
          동일한 파일 재업로드는 내용 해시로 차단합니다. 주문 키가 중복되면 전체 가져오기를
          취소하며, 정산 ID 중복은 대사 예외로 남깁니다.
        </p>
      </div>
      <div className="download-templates">
        <a href="/samples/orders.csv" download>
          <Download size={16} />
          주문 CSV 템플릿
        </a>
        <a href="/samples/settlements.csv" download>
          <Download size={16} />
          정산 CSV 템플릿
        </a>
      </div>
    </>
  );
}

const EVENT_LABELS = {
  seeded: "자료 수집",
  reconciled: "대사 실행",
  imported: "자료 추가",
  resolved: "검토 승인",
  closed: "마감 확정",
  analysis_created: "분석 생성",
};
export function AuditPanel({
  workspace,
  onVerify,
}: {
  workspace: WorkspaceView;
  onVerify: () => void;
}) {
  return (
    <>
      <div className="audit-summary">
        <div className="audit-shield">
          <ShieldCheck size={28} />
        </div>
        <div>
          <span className="eyebrow">TRACEABLE BY DESIGN</span>
          <h2>모든 결정에는, 근거가 남습니다.</h2>
          <p>이전 이벤트의 해시와 연결하여 변경 기록의 누락·변조 여부를 검사합니다.</p>
        </div>
        <button className="button secondary" onClick={onVerify}>
          <ShieldCheck size={16} />
          이력 검증
        </button>
      </div>
      <section className="card audit-card">
        <div className="card-heading">
          <div>
            <h2>
              감사 타임라인 <span className="subtle-count">{workspace.events.length}</span>
            </h2>
            <p>세션 내 모든 변경 · 시간대 Asia/Seoul</p>
          </div>
          <span className={`status-badge ${workspace.auditValid ? "matched" : "issue"}`}>
            <Check size={13} />
            {workspace.auditValid ? "해시 연결 정상" : "무결성 오류"}
          </span>
        </div>
        <ol className="audit-timeline">
          {[...workspace.events].reverse().map((event) => (
            <li key={event.id}>
              <div className={`timeline-marker ${event.type === "closed" ? "closed" : ""}`}>
                {event.type === "closed" ? (
                  <LockKeyhole size={16} />
                ) : event.type === "resolved" ? (
                  <Check size={16} />
                ) : (
                  <FileSpreadsheet size={16} />
                )}
              </div>
              <div className="timeline-content">
                <div className="timeline-meta">
                  <strong>{EVENT_LABELS[event.type]}</strong>
                  <span>{event.actor}</span>
                  <time dateTime={event.at}>{timestamp(event.at)}</time>
                </div>
                <p>{event.detail}</p>
                <details>
                  <summary>
                    {event.id}
                    <span>무결성 해시 확인</span>
                  </summary>
                  <dl>
                    <div>
                      <dt>현재</dt>
                      <dd>{event.hash}</dd>
                    </div>
                    <div>
                      <dt>이전</dt>
                      <dd>{event.previousHash}</dd>
                    </div>
                  </dl>
                </details>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <p className="audit-limit">
        해시 연결은 애플리케이션의 무결성 확인 장치입니다. 외부 공증이나 전자서명이 아니며,
        데이터베이스 관리자에 대한 변조 방지까지 보장하지 않습니다.
      </p>
    </>
  );
}
