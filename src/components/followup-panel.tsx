"use client";
import { useEffect, useState } from "react";
import { Save, RefreshCw } from "lucide-react";
import type { FollowupView } from "@/application/followup";
import type { Command, WorkspaceView } from "@/application/workbench";
import { CHANNEL_LABELS } from "@/domain/model";
import { money } from "./format";

export function FollowupPanel({
  workspace,
  busy,
  onCommand,
}: {
  workspace: WorkspaceView;
  busy: boolean;
  onCommand: (command: Command) => Promise<boolean>;
}) {
  const [data, setData] = useState<{
    expectedVersion: number;
    scope: string;
    sources: FollowupView[];
  } | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/followups", { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error?.message || "이월 근거를 불러오지 못했습니다.");
        if (!controller.signal.aborted) {
          setData(body);
          setError("");
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [revision]);
  const fresh = data?.scope === workspace.draftScope && data.expectedVersion === workspace.version;
  return (
    <section className="feature-section" aria-labelledby="followup-title">
      <div className="section-heading">
        <h2 id="followup-title">이월 근거 검토</h2>
        <button
          className="icon-button"
          aria-label="이월 목록 새로고침"
          title="이월 목록 새로고침"
          onClick={() => setRevision(revision + 1)}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      <p className="muted">
        같은 보관함과 프로필의 이전 마감만 표시합니다. 근거 검토 기록은 입금 확인이나 거래 승인이
        아니며, 전월 금액을 이번 달에 더하지 않습니다.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!error && !data && <p role="status">이월 근거를 불러오는 중입니다.</p>}
      {data && !fresh && <p role="alert">작업이 변경되었습니다. 목록을 다시 불러오세요.</p>}
      {data && fresh && !data.sources.length && (
        <p>보관함에 이번 달과 연결할 이전 마감의 이월 검토 항목이 없습니다.</p>
      )}
      {data &&
        fresh &&
        data.sources.map((source) => (
          <div key={source.hash} className="followup-source">
            <h3>
              {source.period} 마감 / {source.hash.slice(0, 8)}
            </h3>
            {source.items.map((item) => (
              <FollowupItem
                key={item.key}
                source={source}
                item={item}
                workspace={workspace}
                busy={busy}
                onCommand={onCommand}
              />
            ))}
          </div>
        ))}
    </section>
  );
}

function FollowupItem({
  source,
  item,
  workspace,
  busy,
  onCommand,
}: {
  source: FollowupView;
  item: FollowupView["items"][number];
  workspace: WorkspaceView;
  busy: boolean;
  onCommand: (command: Command) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<string[]>(item.record?.settlementIds ?? []);
  const [status, setStatus] = useState<"waiting" | "evidence_reviewed">(
    item.record?.status ?? "waiting",
  );
  const [note, setNote] = useState(item.record?.note ?? "");
  const [evidence, setEvidence] = useState(item.record?.evidence ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const duplicateIds = new Set(
    item.settlements
      .filter((entry, index, rows) => rows.findIndex((other) => other.id === entry.id) !== index)
      .map((entry) => entry.id),
  );
  return (
    <details className="followup-item">
      <summary>
        {item.row.orderId} / {CHANNEL_LABELS[item.row.channel]} /{" "}
        {item.stale
          ? "근거 변경, 재검토 필요"
          : item.record?.status === "evidence_reviewed"
            ? "근거 검토 기록됨"
            : "추적 중"}
      </summary>
      <p>
        전월 자료상 정산액 {money(item.row.actualNet)} / 이번 달 연결 후보 {item.settlements.length}
        행
      </p>
      {item.stale && (
        <p role="alert" className="form-error">
          연결된 정산 자료가 바뀌었습니다. 이전 검토 내용을 다시 확인하세요.
        </p>
      )}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!confirmed) return;
          await onCommand({
            action: "record_followup",
            expectedVersion: workspace.version,
            sourceId: source.id,
            sourceHash: source.hash,
            rowKey: item.row.key,
            settlementIds: selected,
            status,
            note,
            evidence,
          });
        }}
      >
        <fieldset disabled={busy || !!workspace.close}>
          <legend>이번 달 정산 근거</legend>
          {!item.settlements.length && <p>연결할 정산 자료가 없습니다.</p>}
          {item.settlements.map((entry, index) => (
            <label key={`${entry.id}:${index}`} className="checkbox-label">
              <input
                type="checkbox"
                checked={selected.includes(entry.id)}
                disabled={duplicateIds.has(entry.id)}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? [...selected, entry.id]
                      : selected.filter((id) => id !== entry.id),
                  )
                }
              />
              <span>
                {entry.id} / {money(entry.net)} / 입금일 {entry.paidDate ?? "미기재"}
                {duplicateIds.has(entry.id) ? " / 중복 정산번호, 선택 불가" : ""}
              </span>
            </label>
          ))}
          <label>
            추적 상태
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
            >
              <option value="waiting">추적 중</option>
              <option value="evidence_reviewed">근거 검토 기록</option>
            </select>
          </label>
          <label>
            후속 검토 사유
            <textarea
              required
              minLength={10}
              maxLength={600}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <label>
            후속 증빙 참조
            <input
              required
              minLength={5}
              maxLength={200}
              value={evidence}
              onChange={(event) => setEvidence(event.target.value)}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>선택한 근거와 검토 사유를 확인했습니다.</span>
          </label>
          <button
            className="button secondary"
            disabled={
              !confirmed ||
              note.trim().length < 10 ||
              evidence.trim().length < 5 ||
              (status === "evidence_reviewed" && (!selected.length || !workspace.lastRunAt))
            }
          >
            <Save size={16} />
            후속 검토 기록
          </button>
        </fieldset>
      </form>
    </details>
  );
}
