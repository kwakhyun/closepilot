"use client";

import { useMemo, useState } from "react";
import type { WorkspaceView } from "@/application/workbench";
import { money, shortMoney } from "./format";
import { aggregateTrend, createTrendScale, trendBar, trendY } from "./trend-data";

export function TrendChart({ workspace }: { workspace: WorkspaceView }) {
  const [mode, setMode] = useState<"daily" | "channel">("daily");
  const [hovered, setHovered] = useState<number | null>(null);
  const aggregates = useMemo(
    () =>
      aggregateTrend(workspace.rows, workspace.period, workspace.profile.policy.enabledChannels),
    [workspace.rows, workspace.period, workspace.profile.policy.enabledChannels],
  );
  const values = aggregates[mode];
  const scale = useMemo(() => createTrendScale(values), [values]);
  const width = 650,
    height = 164,
    left = 46,
    top = 18,
    plot = width - left - 12;
  const slot = plot / values.length;
  return (
    <section className="card chart-card" aria-label="정산 금액 차트">
      <div className="card-heading">
        <div>
          <h2>정산액 비교</h2>
          <p>
            {mode === "daily"
              ? "주문일별로 예상 정산액과 자료상 정산액을 비교합니다"
              : "판매 채널별로 예상 정산액과 자료상 정산액을 비교합니다"}
          </p>
        </div>
        <div className="segmented" aria-label="차트 집계 기준">
          <button
            aria-pressed={mode === "daily"}
            className={mode === "daily" ? "active" : ""}
            onClick={() => {
              setMode("daily");
              setHovered(null);
            }}
          >
            일별
          </button>
          <button
            aria-pressed={mode === "channel"}
            className={mode === "channel" ? "active" : ""}
            onClick={() => {
              setMode("channel");
              setHovered(null);
            }}
          >
            채널별
          </button>
        </div>
      </div>
      <div className="chart-legend">
        <span>
          <i className="legend-expected" />
          예상 정산액
        </span>
        <span>
          <i className="legend-actual" />
          자료상 정산액
        </span>
        <span className="chart-unit">단위: 원(KRW)</span>
      </div>
      <div className="chart-wrap">
        <svg
          viewBox={`0 0 ${width} 220`}
          role="img"
          aria-label={`${mode === "daily" ? "일별" : "채널별"} 예상 정산액과 자료상 정산액 비교 막대 차트`}
        >
          {scale.ticks.map((value) => {
            const y = trendY(value, scale, height, top);
            return (
              <g key={value}>
                <line
                  x1={left}
                  y1={y}
                  x2={width - 10}
                  y2={y}
                  data-zero-baseline={value === 0 ? "true" : undefined}
                  stroke={value === 0 ? "#819087" : "#e9edeb"}
                  strokeDasharray={value === 0 ? undefined : "3 4"}
                />
                <text x={left - 10} y={y + 4} textAnchor="end" fill="#8a9792" fontSize="10">
                  {value === 0 ? "0" : shortMoney(value)}
                </text>
              </g>
            );
          })}
          {values.map((value, index) => {
            const barWidth = Math.min(mode === "daily" ? 7 : 32, slot * 0.35);
            const x = left + slot * index + slot / 2;
            const actual = trendBar(value.actual, scale, height, top);
            const expected = trendBar(value.expected, scale, height, top);
            return (
              <g
                key={value.label}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
              >
                <rect
                  x={x - slot / 2}
                  y={top}
                  width={slot}
                  height={height}
                  fill={hovered === index ? "#f0f5f2" : "transparent"}
                />
                <rect
                  data-series="expected"
                  data-value={value.expected}
                  x={x - barWidth - 1}
                  y={expected.y}
                  width={barWidth}
                  height={expected.height}
                  rx="2"
                  fill="#c2d8ce"
                />
                <rect
                  data-series="actual"
                  data-value={value.actual}
                  x={x + 1}
                  y={actual.y}
                  width={barWidth}
                  height={actual.height}
                  rx="2"
                  fill={hovered === index ? "#145f46" : "#34896b"}
                />
                {(mode === "channel" ||
                  index === 0 ||
                  index === values.length - 1 ||
                  index % 7 === 0) && (
                  <text x={x} y="204" fill="#819087" fontSize="10" textAnchor="middle">
                    {value.label}
                  </text>
                )}
                <title>
                  {value.label}: 예상 {money(value.expected)}, 자료상 {money(value.actual)}
                </title>
              </g>
            );
          })}
        </svg>
        {hovered !== null && values[hovered] && (
          <div className="chart-tooltip">
            <b>{values[hovered].label}</b>
            <span>예상 {money(values[hovered].expected)}</span>
            <span>자료상 {money(values[hovered].actual)}</span>
          </div>
        )}
      </div>
      <div className="chart-footnote">
        <span className="live-dot" />
        정산 자료에 기록된 금액을 비교한 결과입니다. 은행 입금 내역은 조회하지 않습니다.
      </div>
      <details className="chart-data">
        <summary>차트 데이터를 표로 보기</summary>
        <table>
          <caption className="sr-only">정산액 비교 차트의 집계 수치</caption>
          <thead>
            <tr>
              <th>구분</th>
              <th>예상 정산액</th>
              <th>자료상 정산액</th>
            </tr>
          </thead>
          <tbody>
            {values.map((value) => (
              <tr key={value.label}>
                <td>{value.label}</td>
                <td>{money(value.expected)}</td>
                <td>{money(value.actual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
