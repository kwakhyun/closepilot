"use client";
import { useEffect, useRef, useState } from "react";
import { FlaskConical } from "lucide-react";
import type { WorkspaceView } from "@/application/workbench";
import type { PolicySimulation } from "@/application/policy-simulation";
import { CHANNEL_LABELS, ISSUE_LABELS } from "@/domain/model";
import { money } from "./format";

export function PolicySimulator({ workspace }: { workspace: WorkspaceView }) {
  const [fees, setFees] = useState(workspace.profile.policy.feeBps);
  const [result, setResult] = useState<PolicySimulation | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  return (
    <section className="feature-section" aria-labelledby="simulation-title">
      <h2 id="simulation-title">수수료 정책 시뮬레이션</h2>
      <p className="muted">
        가상 요율 비교이며 저장된 정책, 원본 금액과 승인 기록은 바뀌지 않습니다.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          pending.current?.abort();
          const controller = new AbortController();
          pending.current = controller;
          setLoading(true);
          setError("");
          setResult(null);
          try {
            const response = await fetch("/api/policy/simulate", {
              method: "POST",
              signal: controller.signal,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ expectedVersion: workspace.version, feeBps: fees }),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error?.message || "비교하지 못했습니다.");
            if (!controller.signal.aborted) setResult(body);
          } catch (failure) {
            if (!controller.signal.aborted) setError((failure as Error).message);
          } finally {
            if (!controller.signal.aborted) setLoading(false);
          }
        }}
      >
        <div className="simulation-inputs">
          {workspace.profile.policy.enabledChannels.map((channel) => (
            <label key={channel}>
              {CHANNEL_LABELS[channel]} 수수료율 (%)
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                value={fees[channel] / 100}
                disabled={loading}
                onChange={(event) => {
                  setFees({ ...fees, [channel]: Math.round(Number(event.target.value) * 100) });
                  setResult(null);
                }}
              />
            </label>
          ))}
        </div>
        <button className="button secondary" disabled={loading}>
          <FlaskConical size={16} />
          {loading ? "비교 중…" : "현재 정책과 비교"}
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="impact-summary" aria-live="polite">
          {result.expectedVersion !== workspace.version ? (
            <p className="form-error">자료가 변경되었습니다. 다시 비교하세요.</p>
          ) : (
            <>
              <dl>
                <div>
                  <dt>예상 정산액</dt>
                  <dd>
                    {money(result.before.expectedNet)} → {money(result.after.expectedNet)}
                  </dd>
                </div>
                <div>
                  <dt>예외 거래</dt>
                  <dd>
                    {result.before.issues} → {result.after.issues}건
                  </dd>
                </div>
                <div>
                  <dt>재검토 대상</dt>
                  <dd>{result.changes.filter((row) => row.needsReview).length}건</dd>
                </div>
              </dl>
              <details>
                <summary>변경 예상 거래 {result.changes.length}건</summary>
                <div className="feature-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>주문번호</th>
                        <th>수수료 전 → 후</th>
                        <th>분류 전 → 후</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.changes.map((row) => (
                        <tr key={row.rowKey}>
                          <td>{row.orderId}</td>
                          <td>
                            {money(row.beforeFee)} → {money(row.afterFee)}
                          </td>
                          <td>
                            {ISSUE_LABELS[row.beforeKind]} → {ISSUE_LABELS[row.afterKind]}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}
        </div>
      )}
    </section>
  );
}
