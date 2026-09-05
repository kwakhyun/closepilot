"use client";
import { useEffect, useState } from "react";
import { IMPORT_FIELDS, type ImportKind } from "@/domain/csv";
import type { WorkspaceView } from "@/application/workbench";

export function missingMappingHeaders(
  mapping: Record<string, string>,
  headers: string[],
  kind: ImportKind,
) {
  return IMPORT_FIELDS[kind].filter(
    (field) => field !== "paid_date" && (!mapping[field] || !headers.includes(mapping[field])),
  );
}

export function MappingTemplates({
  kind,
  headers,
  disabled,
  onApply,
}: {
  kind: ImportKind;
  headers: string[];
  disabled: boolean;
  onApply: (mapping: Record<string, string>) => void;
}) {
  const [templates, setTemplates] = useState<
    Array<{ id: string; period: string; mappings: WorkspaceView["profile"]["mappings"] }>
  >([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/imports/templates", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error?.message || "저장된 열 연결을 불러오지 못했습니다.");
        if (!controller.signal.aborted) {
          setTemplates(data.templates);
          setError("");
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [revision]);
  const template = templates.find((entry) => entry.id === selected);
  const missing = template ? missingMappingHeaders(template.mappings[kind], headers, kind) : [];
  return (
    <div className="mapping-template-picker">
      <label>
        이전 작업의 열 연결
        <select
          aria-label="저장된 열 연결 선택"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          disabled={disabled}
        >
          <option value="">열 연결 선택</option>
          {templates.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.period} / {entry.mappings.updatedAt?.slice(0, 19).replace("T", " ")}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="button secondary small"
        disabled={disabled || !template || missing.length > 0}
        onClick={() => {
          if (!template) return;
          const mapping = { ...template.mappings[kind] };
          if (mapping.paid_date && !headers.includes(mapping.paid_date)) mapping.paid_date = "";
          onApply(mapping);
        }}
      >
        열 연결 적용
      </button>
      {missing.length > 0 && (
        <p role="alert" className="form-error">
          필수 열이 변경되어 적용할 수 없습니다:{" "}
          {missing.map((field) => template?.mappings[kind][field] || field).join(", ")}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}{" "}
          <button type="button" className="text-button" onClick={() => setRevision(revision + 1)}>
            다시 불러오기
          </button>
        </p>
      )}
    </div>
  );
}
