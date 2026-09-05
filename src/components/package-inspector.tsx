"use client";
import { useEffect, useRef, useState } from "react";
import { FileCheck2, Trash2 } from "lucide-react";
import type { PackageInspection } from "@/application/package-inspection";
import type { WorkspaceView } from "@/application/workbench";
import { CHANNEL_LABELS, ISSUE_LABELS } from "@/domain/model";
import { money } from "./format";

type VerifiedPackage = NonNullable<PackageInspection["package"]>;
export function PackageInspector({ workspace }: { workspace: WorkspaceView }) {
  const [packages, setPackages] = useState<VerifiedPackage[]>([]);
  const [active, setActive] = useState("");
  const [report, setReport] = useState<PackageInspection | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const selected = packages.find((item) => item.snapshot.hash === active);
  async function inspect(file: File | undefined) {
    if (!file) return;
    setError("");
    setReport(null);
    if (!file.name.toLowerCase().endsWith(".json") || file.size > 5_000_000) {
      setError("5MB 이하의 마감 증빙 JSON을 선택하세요.");
      return;
    }
    if (packages.length >= 12) {
      setError("한 번에 12개까지 비교할 수 있습니다. 목록에서 파일을 제거하세요.");
      return;
    }
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    try {
      const text = await file.text();
      if (controller.signal.aborted) return;
      JSON.parse(text);
      const response = await fetch("/api/packages/inspect", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: text,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "증빙 파일을 확인하지 못했습니다.");
      if (controller.signal.aborted) return;
      const result = body as PackageInspection;
      setReport(result);
      if (result.valid) {
        setPackages((previous) =>
          [
            ...previous.filter((item) => item.snapshot.hash !== result.package.snapshot.hash),
            result.package,
          ].sort((a, b) => a.snapshot.period.localeCompare(b.snapshot.period)),
        );
        setActive(result.package.snapshot.hash);
        setQuery("");
      } else setError("검증에 실패한 파일은 조회 목록에 추가하지 않습니다.");
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof SyntaxError
            ? "JSON 파일 형식이 올바르지 않습니다."
            : (failure as Error).message,
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  return (
    <section className="feature-section" aria-labelledby="package-title">
      <div className="section-heading">
        <h2 id="package-title">마감 증빙 조회</h2>
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => input.current?.click()}
        >
          <FileCheck2 size={16} />
          {loading ? "검증 중…" : "마감 증빙 열기"}
        </button>
      </div>
      <p className="muted">
        합성 자료만 사용하세요. 파일은 서버에서 검증하지만 저장하지 않습니다. TypeScript 재계산이며
        Kotlin 독립 검증이나 전자서명이 아닙니다.
      </p>
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept=".json,application/json"
        aria-label="마감 증빙 JSON 선택"
        onChange={(event) => {
          void inspect(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {report && (
        <ul className="inspection-checks" aria-label="증빙 검증 결과">
          {report.checks.map((check) => (
            <li key={check.name}>
              {check.passed ? "통과" : "실패"}: {check.name}
            </li>
          ))}
        </ul>
      )}
      {!!packages.length && (
        <>
          <label>
            조회할 마감
            <select
              value={active}
              onChange={(event) => {
                setActive(event.target.value);
                setQuery("");
              }}
            >
              {packages.map(({ snapshot }) => (
                <option key={snapshot.hash} value={snapshot.hash}>
                  {snapshot.period} / {snapshot.profile.brandName} / {snapshot.hash.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <div className="feature-table-wrap">
            <table>
              <caption>월별 마감 비교</caption>
              <thead>
                <tr>
                  <th>월 / 브랜드</th>
                  <th>예상 정산액</th>
                  <th>자료상 정산액</th>
                  <th>검토</th>
                  <th>제거</th>
                </tr>
              </thead>
              <tbody>
                {packages.map(({ snapshot }) => (
                  <tr key={snapshot.hash}>
                    <td>
                      {snapshot.period} / {snapshot.profile.brandName}
                    </td>
                    <td>{money(snapshot.expectedNet)}</td>
                    <td>{money(snapshot.actualNet)}</td>
                    <td>{snapshot.reviewedCount}건</td>
                    <td>
                      <button
                        className="icon-button"
                        title="조회 목록에서 제거"
                        aria-label={`${snapshot.period} 증빙 제거`}
                        onClick={() => {
                          const next = packages.filter(
                            (item) => item.snapshot.hash !== snapshot.hash,
                          );
                          setPackages(next);
                          if (active === snapshot.hash) setActive(next[0]?.snapshot.hash ?? "");
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {selected && (
        <>
          <details>
            <summary>거래와 검토 근거 {selected.snapshot.rows.length}건</summary>
            <label>
              증빙 거래 검색
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="feature-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>주문 / 채널</th>
                    <th>예상 / 자료상 정산액</th>
                    <th>유형</th>
                    <th>검토 근거</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.snapshot.rows
                    .filter((row) => row.orderId.toLowerCase().includes(query.toLowerCase()))
                    .map((row) => {
                      const review = selected.snapshot.resolutions.find(
                        (entry) => entry.rowKey === row.key,
                      );
                      return (
                        <tr key={row.key}>
                          <td>
                            {row.orderId}
                            <br />
                            {CHANNEL_LABELS[row.channel]}
                          </td>
                          <td>
                            {money(row.expectedNet)} / {money(row.actualNet)}
                          </td>
                          <td>{ISSUE_LABELS[row.kind]}</td>
                          <td>{review ? `${review.note} / ${review.evidence}` : "자동 일치"}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </details>
          <details>
            <summary>감사 기록 {selected.audit.length}건</summary>
            <ol>
              {selected.audit.map((event) => (
                <li key={event.id}>
                  <time>{event.at}</time>
                  <p>{event.detail}</p>
                </li>
              ))}
            </ol>
          </details>
          <details>
            <summary>
              이월 검토 항목{" "}
              {
                selected.snapshot.resolutions.filter(
                  (entry) => entry.disposition === "carry_forward",
                ).length
              }
              건
            </summary>
            <p className="muted">
              전월 금액을 이번 달 합계에 더하지 않습니다. 후속 자료 연결은 입금 확인이나 승인 완료를
              뜻하지 않습니다.
            </p>
            <ul>
              {selected.snapshot.resolutions
                .filter((entry) => entry.disposition === "carry_forward")
                .map((entry) => {
                  const row = selected.snapshot.rows.find((item) => item.key === entry.rowKey)!;
                  const sameProfile = selected.snapshot.profile.id === workspace.profile.id;
                  const laterMonth = selected.snapshot.period < workspace.period;
                  const followups =
                    sameProfile && laterMonth
                      ? workspace.settlements.filter(
                          (item) => item.orderId === row.orderId && item.channel === row.channel,
                        )
                      : [];
                  return (
                    <li key={entry.rowKey}>
                      <strong>{row.orderId}</strong> / {money(row.actualNet)} /{" "}
                      {sameProfile && laterMonth
                        ? `현재 ${workspace.period} 작업의 후속 정산 ${followups.length}행`
                        : "같은 브랜드의 이후 월에서 비교 가능"}
                    </li>
                  );
                })}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
