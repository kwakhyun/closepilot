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
import { CHANNEL_LABELS } from "@/domain/model";
import { describeAuditEvent } from "@/domain/review-copy";
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
          <p>대사 대상 판매 채널 {workspace.profile.policy.enabledChannels.length}개</p>
        </div>
        <span className="icon-muted">
          <FolderOpen size={18} />
        </span>
      </div>
      <div className="channel-list">
        {workspace.profile.policy.enabledChannels.map((channel) => {
          const rows = workspace.rows.filter((row) => row.channel === channel);
          const unresolved = rows.filter((row) => row.kind !== "matched" && !row.resolution).length;
          const amount = rows.reduce((sum, row) => sum + row.expectedNet, 0);
          return (
            <div className="channel-summary" key={channel}>
              <div className="channel-summary-top">
                <ChannelBadge channel={channel} />
                <span className={unresolved ? "tiny-warning" : "tiny-success"}>
                  {unresolved ? `미검토 ${unresolved}건` : "검토 완료"}
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
        원본 자료 확인
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
        {workspace.profile.policy.enabledChannels.map((channel) => (
          <section className="card connector-card" key={channel}>
            <div>
              <ChannelBadge channel={channel} />
              <span className="soft-tag">CSV 가져오기</span>
            </div>
            <h3>정산 자료 표준화</h3>
            <p>채널별 CSV 열을 주문·정산 항목에 맞춰 가져옵니다.</p>
            <dl>
              <div>
                <dt>데모 수수료율</dt>
                <dd>{workspace.profile.policy.feeBps[channel] / 100}%</dd>
              </div>
              <div>
                <dt>지원 통화</dt>
                <dd>KRW · 원 단위</dd>
              </div>
            </dl>
            <small>
              표시된 요율은 데모용 가정이며, {CHANNEL_LABELS[channel]} API는 연결하지 않았습니다.
            </small>
          </section>
        ))}
      </div>
      <section className="card sources-card">
        <div className="card-heading">
          <div>
            <h2>
              가져온 자료 <span className="subtle-count">{workspace.sources.length}</span>
            </h2>
            <p>자료별 행 수와 내용 확인용 체크섬을 저장합니다</p>
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
                  {source.kind === "orders" ? "주문 자료" : "채널 정산 자료"} · {source.rows}행 ·{" "}
                  {timestamp(source.importedAt)}
                </p>
                <code>{source.id}</code>
              </div>
              <div className="source-checksum">
                <span>
                  <CheckCheck size={14} />
                  반영 완료
                </span>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(source.digest);
                      toast("자료 체크섬을 복사했습니다.");
                    } catch {
                      toast("복사하지 못했습니다. 표시된 체크섬을 직접 선택해 복사하세요.");
                    }
                  }}
                  title={source.digest}
                  aria-label={`${source.name} 체크섬 복사`}
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
          같은 내용의 파일은 다시 반영하지 않습니다. 같은 채널에 동일한 주문번호가 있으면 파일
          전체를 반영하지 않으며, 정산번호 중복은 검토가 필요한 거래로 표시합니다.
        </p>
      </div>
      <div className="download-templates">
        <a href="/samples/orders.csv" download>
          <Download size={16} />
          주문 CSV 샘플
        </a>
        <a href="/samples/settlements.csv" download>
          <Download size={16} />
          정산 CSV 샘플
        </a>
      </div>
    </>
  );
}

const EVENT_LABELS = {
  seeded: "데모 자료 준비",
  reconciled: "대사 실행",
  imported: "자료 반영",
  resolved: "검토 승인",
  closed: "마감 확정",
  analysis_created: "검토 안내 생성",
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
          <h2>마감까지의 변경 이력을 확인하세요.</h2>
          <p>각 기록을 이전 기록의 해시와 연결해 내용이 바뀌었는지 검사합니다.</p>
        </div>
        <button className="button secondary" onClick={onVerify}>
          <ShieldCheck size={16} />
          기록 다시 검증
        </button>
      </div>
      <section className="card audit-card">
        <div className="card-heading">
          <div>
            <h2>
              변경 이력 <span className="subtle-count">{workspace.events.length}</span>
            </h2>
            <p>현재 데모의 변경 기록 · 한국 표준시(KST)</p>
          </div>
          <span className={`status-badge ${workspace.auditValid ? "matched" : "issue"}`}>
            <Check size={13} />
            {workspace.auditValid ? "기록 검증 통과" : "기록 검증 실패"}
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
                <p>{describeAuditEvent(event)}</p>
                <details>
                  <summary>
                    {event.id}
                    <span>체크섬 확인</span>
                  </summary>
                  <dl>
                    <div>
                      <dt>현재 기록</dt>
                      <dd>{event.hash}</dd>
                    </div>
                    <div>
                      <dt>이전 기록</dt>
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
        해시 연결은 기록의 내용이 달라졌는지 확인하는 장치입니다. 외부 공증이나 전자서명이 아니며,
        데이터베이스 관리자가 기록을 바꾸는 상황까지 막지는 못합니다.
      </p>
    </>
  );
}
