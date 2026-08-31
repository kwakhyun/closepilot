"use client";

import { useState } from "react";
import type { WorkspaceView } from "@/application/workbench";
import { CHANNELS, CHANNEL_LABELS } from "@/domain/model";
import { money, shortMoney } from "./format";

export function TrendChart({ workspace }: { workspace: WorkspaceView }) {
  const [mode, setMode] = useState<"daily" | "channel">("daily");
  const [hovered, setHovered] = useState<number | null>(null);
  const daily = Array.from({ length: 31 }, (_, index) => {
    const date = `2026-08-${String(index + 1).padStart(2, "0")}`;
    const rows = workspace.rows.filter((row) => row.date === date);
    return {
      label: `${index + 1}일`,
      expected: rows.reduce((sum, row) => sum + row.expectedNet, 0),
      actual: rows.reduce((sum, row) => sum + row.actualNet, 0),
    };
  });
  const values =
    mode === "daily"
      ? daily
      : CHANNELS.map((channel) => ({
          label: CHANNEL_LABELS[channel],
          expected: workspace.rows
            .filter((row) => row.channel === channel)
            .reduce((sum, row) => sum + row.expectedNet, 0),
          actual: workspace.rows
            .filter((row) => row.channel === channel)
            .reduce((sum, row) => sum + row.actualNet, 0),
        }));
  const maximum = Math.max(1, ...values.flatMap((value) => [value.actual, value.expected])) * 1.2;
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
          <h2>정산 흐름</h2>
          <p>주문일 기준 예상 금액과 정산 자료를 비교합니다</p>
        </div>
        <div className="segmented" aria-label="차트 단위">
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
          실제 정산액
        </span>
        <span className="chart-unit">단위: 원 · KRW</span>
      </div>
      <div className="chart-wrap">
        <svg
          viewBox={`0 0 ${width} 220`}
          role="img"
          aria-label={`${mode === "daily" ? "일별" : "채널별"} 예상 정산액과 실제 정산액 비교 막대 차트`}
        >
          {[0, 1, 2, 3].map((tick) => {
            const value = (maximum * tick) / 3,
              y = top + height - (height * tick) / 3;
            return (
              <g key={tick}>
                <line
                  x1={left}
                  y1={y}
                  x2={width - 10}
                  y2={y}
                  stroke="#e9edeb"
                  strokeDasharray={tick === 0 ? undefined : "3 4"}
                />
                <text x={left - 10} y={y + 4} textAnchor="end" fill="#8a9792" fontSize="10">
                  {tick === 0 ? "0" : shortMoney(value)}
                </text>
              </g>
            );
          })}
          {values.map((value, index) => {
            const barWidth = Math.min(mode === "daily" ? 7 : 32, slot * 0.35);
            const x = left + slot * index + slot / 2;
            const actualHeight = Math.max(0, (value.actual / maximum) * height),
              expectedHeight = Math.max(0, (value.expected / maximum) * height);
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
                  x={x - barWidth - 1}
                  y={top + height - expectedHeight}
                  width={barWidth}
                  height={expectedHeight}
                  rx="2"
                  fill="#c2d8ce"
                />
                <rect
                  x={x + 1}
                  y={top + height - actualHeight}
                  width={barWidth}
                  height={actualHeight}
                  rx="2"
                  fill={hovered === index ? "#145f46" : "#34896b"}
                />
                {(mode === "channel" || index === 0 || index === 30 || index % 7 === 0) && (
                  <text x={x} y="204" fill="#819087" fontSize="10" textAnchor="middle">
                    {value.label}
                  </text>
                )}
                <title>
                  {value.label}: 예상 {money(value.expected)}, 실제 {money(value.actual)}
                </title>
              </g>
            );
          })}
        </svg>
        {hovered !== null && values[hovered] && (
          <div className="chart-tooltip">
            <b>{values[hovered].label}</b>
            <span>예상 {money(values[hovered].expected)}</span>
            <span>실제 {money(values[hovered].actual)}</span>
          </div>
        )}
      </div>
      <div className="chart-footnote">
        <span className="live-dot" />
        입금일별 현금 흐름이 아닌 주문일별 정산 대사입니다.
      </div>
      <details className="chart-data">
        <summary>차트 데이터 표로 보기</summary>
        <table>
          <caption className="sr-only">정산 흐름 원본 수치</caption>
          <thead>
            <tr>
              <th>구분</th>
              <th>예상 정산액</th>
              <th>실제 정산액</th>
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
