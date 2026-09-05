"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Command, WorkspaceView, explainIssues } from "@/application/workbench";

export interface SessionSelection {
  templateId?: "lumiere-beauty-v1" | "morrow-food-v1";
  brandName?: string;
  showcase?: "completed";
  cloneCurrent?: true;
  expectedVersion?: number;
  period?: string;
}

export type CommandResult = "success" | "expired" | "failed";

type Analysis = ReturnType<typeof explainIssues>;

class ApiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function responseData<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok)
    throw new ApiRequestError(
      data.error?.message || "요청을 처리하지 못했습니다.",
      response.status,
      data.error?.code,
    );
  return data;
}

async function createSession(
  selection?: SessionSelection,
  signal?: AbortSignal,
): Promise<WorkspaceView> {
  return responseData(
    await fetch("/api/session", {
      method: "POST",
      signal,
      ...(selection
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(selection),
          }
        : {}),
    }),
  );
}

export function useWorkspaceSession() {
  const [workspace, setWorkspace] = useState<WorkspaceView | null>(null);
  const [sessionRevision, setSessionRevision] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analysisRequest = useRef<AbortController | null>(null);

  const showToast = useCallback((message: string, isError = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, error: isError });
    toastTimer.current = setTimeout(() => setToast(null), 5500);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const url = new URL(window.location.href);
        const completedShowcase = url.searchParams.get("showcase") === "completed";
        let view: WorkspaceView;
        if (completedShowcase) {
          view = await createSession({ showcase: "completed" }, controller.signal);
          url.searchParams.delete("showcase");
          window.history.replaceState(
            window.history.state,
            "",
            `${url.pathname}${url.search}${url.hash}`,
          );
        } else {
          let response = await fetch("/api/workspace", { signal: controller.signal });
          if (response.status === 401)
            response = await fetch("/api/session", { method: "POST", signal: controller.signal });
          view = await responseData<WorkspaceView>(response);
        }
        if (!controller.signal.aborted) setWorkspace(view);
      } catch (failure) {
        if (!controller.signal.aborted) setError((failure as Error).message);
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      analysisRequest.current?.abort();
    },
    [],
  );

  async function refresh() {
    try {
      const view = await responseData<WorkspaceView>(await fetch("/api/workspace"));
      setWorkspace(view);
      return view;
    } catch (failure) {
      if (failure instanceof ApiRequestError && failure.status === 401) {
        await recoverExpiredSession();
        return null;
      }
      showToast((failure as Error).message, true);
      return null;
    }
  }

  async function onCommand(command: Command): Promise<CommandResult> {
    if (busy) return "failed";
    setBusy(true);
    try {
      const request = {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(command),
      };
      let response: Response;
      try {
        response = await fetch("/api/commands", request);
      } catch {
        response = await fetch("/api/commands", request);
      }
      if (response.status >= 502) response = await fetch("/api/commands", request);
      const view = await responseData<WorkspaceView>(response);
      setWorkspace(view);
      showToast(
        command.action === "resolve"
          ? "검토 사유와 증빙 참조 정보를 기록했습니다."
          : command.action === "close"
            ? `${view.period} 마감을 확정했습니다. 마감 증빙 파일을 내려받을 수 있습니다.`
            : command.action === "import"
              ? "자료를 반영했습니다. 대사를 다시 실행해 주세요."
              : "대사를 완료했습니다. 최신 자료로 결과를 갱신했습니다.",
      );
      return "success";
    } catch (failure) {
      if (failure instanceof ApiRequestError && failure.status === 401) return "expired";
      showToast((failure as Error).message, true);
      try {
        setWorkspace(await responseData<WorkspaceView>(await fetch("/api/workspace")));
      } catch {
        // Keep the original error visible.
      }
      return "failed";
    } finally {
      setBusy(false);
    }
  }

  async function reset(selection?: SessionSelection) {
    setBusy(true);
    try {
      const view = await createSession(selection);
      setWorkspace(view);
      setSessionRevision((revision) => revision + 1);
      analysisRequest.current?.abort();
      setAnalysis(null);
      setAnalysisLoading(false);
      setError("");
      showToast(
        selection?.showcase === "completed"
          ? "미리 완료된 합성 마감 예시를 열었습니다."
          : `${view.profile.brandName} 프로필로 새 데모를 시작했습니다.`,
      );
      return view;
    } catch (failure) {
      showToast((failure as Error).message, true);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function recoverExpiredSession(): Promise<boolean> {
    const selection = workspace
      ? {
          templateId: workspace.profile.templateId as SessionSelection["templateId"],
          period: workspace.period,
        }
      : undefined;
    const view = await reset(selection);
    if (!view) return false;
    showToast(
      "데모 세션이 만료되어 같은 온보딩 프로필로 새 데모를 시작했습니다. 직전 요청은 다시 실행하지 않았습니다.",
    );
    return true;
  }

  async function analyze() {
    analysisRequest.current?.abort();
    const controller = new AbortController();
    analysisRequest.current = controller;
    setAnalysisLoading(true);
    try {
      const result = await responseData<Analysis>(
        await fetch("/api/analysis", { signal: controller.signal }),
      );
      if (!controller.signal.aborted) setAnalysis(result);
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiRequestError && failure.status === 401) {
        await recoverExpiredSession();
        return;
      }
      showToast((failure as Error).message, true);
    } finally {
      if (!controller.signal.aborted) setAnalysisLoading(false);
    }
  }

  return {
    workspace,
    sessionRevision,
    error,
    busy,
    analysis,
    analysisLoading,
    toast,
    setToast,
    setAnalysis,
    showToast,
    refresh,
    onCommand,
    reset,
    recoverExpiredSession,
    analyze,
  };
}
