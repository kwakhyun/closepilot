"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { IMPORT_FIELDS, IMPORT_FIELD_LABELS, type ImportKind } from "@/domain/csv";
import type { Command } from "@/application/workbench";
import { Modal } from "./modal";

interface Preview {
  valid: boolean;
  headers: string[];
  mapping: Record<string, string>;
  count: number;
  preview: Record<string, string>[];
  errors: string[];
}
export function ImportModal({
  open,
  onClose,
  onCommand,
  version,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onCommand: (command: Command) => Promise<boolean>;
  version: number;
  busy: boolean;
}) {
  const [kind, setKind] = useState<ImportKind>("orders");
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const mappingSection = useRef<HTMLElement>(null);
  const requestVersion = useRef(0);
  const currentStep = preview?.valid ? 3 : csv ? 2 : 1;
  useEffect(() => {
    if (!open || !preview?.valid) return;
    requestAnimationFrame(() =>
      mappingSection.current?.scrollIntoView({ block: "start", behavior: "smooth" }),
    );
  }, [open, preview?.valid]);
  async function validate(text: string, mapping?: Record<string, string>, importKind = kind) {
    const version = ++requestVersion.current;
    setValidating(true);
    setError("");
    try {
      const response = await fetch("/api/imports/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: importKind, csv: text, mapping }),
      });
      const result = await response.json();
      if (version !== requestVersion.current) return;
      if (!response.ok) throw new Error(result.error?.message || "파일을 검증하지 못했습니다.");
      setPreview(result);
    } catch (failure) {
      if (version === requestVersion.current) setError((failure as Error).message);
    } finally {
      if (version === requestVersion.current) setValidating(false);
    }
  }
  async function sample() {
    try {
      const response = await fetch(`/samples/${kind}.csv`);
      if (!response.ok) throw new Error("샘플 파일을 불러오지 못했습니다.");
      const text = await response.text();
      setCsv(text);
      setFilename(`sample_${kind}.csv`);
      await validate(text);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  async function selectFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv") || file.size > 256_000) {
      setError("250KB 이하의 CSV 파일을 선택하세요.");
      return;
    }
    const text = await file.text();
    setCsv(text);
    setFilename(file.name);
    setPreview(null);
    await validate(text);
  }
  return (
    <Modal open={open} onClose={onClose} title="CSV 자료 가져오기" wide className="import-modal">
      <div className="import-body">
        <div className={`import-scroll ${preview ? "has-preview" : ""}`}>
          <ol className="import-steps" aria-label="자료 가져오기 단계">
            {(
              [
                [1, "자료 선택"],
                [2, "열 연결·검증"],
                [3, "자료 반영"],
              ] as const
            ).map(([step, label], index) => (
              <li
                key={String(label)}
                className={step < currentStep ? "completed" : step === currentStep ? "active" : ""}
                aria-current={step === currentStep ? "step" : undefined}
              >
                {index > 0 && <ArrowRight size={14} aria-hidden="true" />}
                <span>
                  <i>{step}</i>
                  {label}
                </span>
              </li>
            ))}
          </ol>
          {preview && (
            <div className="validated-file-summary">
              <div>
                <CheckCircle2 size={18} />
                <p>
                  <strong>{filename}</strong>
                  <span>
                    {kind === "orders" ? "주문 자료" : "채널 정산 자료"} · {preview.count}행
                  </span>
                </p>
              </div>
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setCsv("");
                  setFilename("");
                  setPreview(null);
                  setError("");
                  requestVersion.current++;
                }}
              >
                파일 또는 자료 유형 바꾸기
              </button>
            </div>
          )}
          <div className="notice warm">
            <AlertCircle size={18} />
            <p>
              <b>가상 데이터만 업로드하세요.</b> 실제 고객 정보나 결제 내역은 올리지 마세요. 연결한
              열만 저장하며, 데모를 시작한 시점부터 6시간 동안 자료에 접근할 수 있습니다.
            </p>
          </div>
          <fieldset className="import-kind">
            <legend>자료 유형</legend>
            <label className={kind === "orders" ? "selected" : ""}>
              <input
                type="radio"
                name="import-kind"
                checked={kind === "orders"}
                onChange={() => {
                  setKind("orders");
                  setPreview(null);
                  setCsv("");
                  setFilename("");
                  requestVersion.current++;
                  setValidating(false);
                }}
              />
              <FileSpreadsheet size={20} />
              <span>
                <b>주문 자료</b>
                <small>주문·결제·환불 내역</small>
              </span>
            </label>
            <label className={kind === "settlements" ? "selected" : ""}>
              <input
                type="radio"
                name="import-kind"
                checked={kind === "settlements"}
                onChange={() => {
                  setKind("settlements");
                  setPreview(null);
                  setCsv("");
                  setFilename("");
                  requestVersion.current++;
                  setValidating(false);
                }}
              />
              <FileSpreadsheet size={20} />
              <span>
                <b>채널 정산 자료</b>
                <small>수수료·정산액·입금일 정보</small>
              </span>
            </label>
          </fieldset>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label="CSV 파일 선택"
            onChange={(event) => void selectFile(event.target.files?.[0])}
          />
          <button
            className="dropzone"
            onClick={() => input.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void selectFile(event.dataTransfer.files[0]);
            }}
          >
            <span className="upload-icon">
              <Upload size={23} />
            </span>
            <strong>{filename || "CSV 파일을 끌어놓거나 클릭해서 선택"}</strong>
            <span>UTF-8 CSV · 최대 250KB · 데이터 500행</span>
          </button>
          <div className="sample-actions">
            <button className="text-button" onClick={() => void sample()} disabled={validating}>
              <FileSpreadsheet size={15} />
              샘플 {kind === "orders" ? "주문" : "정산"} 불러오기
            </button>
            <a href={`/samples/${kind}.csv`} download>
              <Download size={14} />
              CSV 샘플 다운로드
            </a>
          </div>
          {validating && (
            <div className="notice">
              <RefreshCw className="spin" size={16} />열 연결과 금액·날짜 형식을 확인하고 있습니다.
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {preview && (
            <section className="mapping-section" ref={mappingSection}>
              <div className="section-heading">
                <h3>원본 열 연결 확인</h3>
                <span className="soft-tag">자동 연결 · 직접 수정 가능</span>
              </div>
              <div className="mapping-grid">
                {IMPORT_FIELDS[kind].map((field) => (
                  <label key={field}>
                    <span>
                      {IMPORT_FIELD_LABELS[field]}
                      {field !== "paid_date" && <small>필수</small>}
                    </span>
                    <select
                      value={preview.mapping[field] || ""}
                      onChange={(event) =>
                        setPreview({
                          ...preview,
                          valid: false,
                          mapping: { ...preview.mapping, [field]: event.target.value },
                        })
                      }
                    >
                      <option value="">원본 열 선택</option>
                      {preview.headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <button
                className="button secondary small"
                disabled={validating}
                onClick={() => void validate(csv, preview.mapping)}
              >
                <RefreshCw size={14} />열 연결 다시 확인
              </button>
              {preview.errors.length > 0 && (
                <div className="validation-errors" role="alert">
                  <AlertCircle size={17} />
                  <div>
                    {preview.errors.map((message) => (
                      <p key={message}>{message}</p>
                    ))}
                  </div>
                </div>
              )}
              {preview.valid && (
                <>
                  <div className="validation-success" role="status">
                    <CheckCircle2 size={17} />
                    {preview.count}행 검증 완료 · 자료 반영을 누르면 전체 내용을 한 번에 저장합니다.
                  </div>
                  <div className="preview-table-wrap">
                    <table className="preview-table">
                      <caption>미리보기 · 최대 5행</caption>
                      <thead>
                        <tr>
                          {IMPORT_FIELDS[kind].map((field) => (
                            <th key={field}>{IMPORT_FIELD_LABELS[field]}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.preview.map((row, index) => (
                          <tr key={index}>
                            {IMPORT_FIELDS[kind].map((field) => (
                              <td key={field}>{row[field] || "—"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          )}
        </div>
        <div className="modal-footer import-footer">
          <p aria-live="polite">
            {validating
              ? "열 연결과 금액·날짜 형식을 확인하고 있습니다."
              : preview?.valid
                ? `${preview.count}행 검증 완료 · 반영하면 대사를 다시 실행합니다.`
                : preview?.errors.length
                  ? `오류 ${preview.errors.length}건을 수정한 뒤 다시 검증하세요.`
                  : "CSV 파일을 선택하고 열 연결을 확인하세요."}
          </p>
          <button
            className="button primary"
            disabled={!preview?.valid || validating || busy}
            onClick={async () => {
              if (
                preview &&
                (await onCommand({
                  action: "import",
                  expectedVersion: version,
                  kind,
                  csv,
                  filename,
                  mapping: preview.mapping,
                }))
              ) {
                onClose();
                setCsv("");
                setPreview(null);
                setFilename("");
              }
            }}
          >
            {busy ? "반영하는 중…" : "자료 반영"}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </Modal>
  );
}
