"use client";

import { useState } from "react";
import { Save, RotateCcw, Trash2 } from "lucide-react";
import { readReviewDraft, saveReviewDraft, reviewDraftKey } from "./review-draft-storage";

export function ReviewDraftControls({
  scope,
  rowKey,
  fingerprint,
  createdAt,
  note,
  evidence,
  onRestore,
  disabled,
}: {
  scope: string;
  rowKey: string;
  fingerprint: string;
  createdAt: string;
  note: string;
  evidence: string;
  onRestore: (note: string, evidence: string) => void;
  disabled: boolean;
}) {
  const [message, setMessage] = useState("");
  const key = reviewDraftKey(scope, rowKey);
  function act(action: "save" | "restore" | "discard") {
    try {
      if (action === "save") {
        saveReviewDraft(sessionStorage, key, {
          note,
          evidence,
          fingerprint,
          expiresAt: Math.min(
            Date.now() + 6 * 60 * 60 * 1000,
            Date.parse(createdAt) + 30 * 24 * 60 * 60 * 1000,
          ),
        });
        setMessage("이 탭에 임시 저장했습니다. 검토 승인은 아직 하지 않았습니다.");
      } else if (action === "restore") {
        const draft = readReviewDraft(sessionStorage, key);
        if (!draft) {
          setMessage("저장된 임시 메모가 없습니다.");
          return;
        }
        onRestore(draft.note, draft.evidence);
        setMessage(
          draft.fingerprint === fingerprint
            ? "임시 메모를 불러왔습니다. 원본을 다시 확인하세요."
            : "저장 이후 원본 자료가 변경되었습니다. 메모와 근거를 다시 확인하세요.",
        );
      } else {
        sessionStorage.removeItem(key);
        setMessage("저장된 임시 메모를 삭제했습니다.");
      }
    } catch {
      setMessage("브라우저 임시 저장소를 사용할 수 없습니다. 작성 중인 내용은 그대로 유지합니다.");
    }
  }
  return (
    <div className="draft-controls">
      <div className="tool-actions">
        <button
          type="button"
          className="text-button"
          disabled={disabled || (!note && !evidence)}
          onClick={() => act("save")}
        >
          <Save size={15} />
          임시 저장
        </button>
        <button
          type="button"
          className="text-button"
          disabled={disabled}
          onClick={() => act("restore")}
        >
          <RotateCcw size={15} />
          임시 메모 불러오기
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="임시 메모 삭제"
          title="임시 메모 삭제"
          disabled={disabled}
          onClick={() => act("discard")}
        >
          <Trash2 size={15} />
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
