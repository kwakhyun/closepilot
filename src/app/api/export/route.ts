import { workspaceView } from "@/application/workbench";
import { buildReconciliationCsv } from "@/application/export";
import { DomainError } from "@/domain/model";
import { observeRequest, repository, sessionHash } from "@/infrastructure/http";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return observeRequest(request, "export.download", async () => {
    const workspace = await (await repository()).get(await sessionHash());
    const format = new URL(request.url).searchParams.get("format") || "csv";
    if (format === "json") {
      if (!workspace.close)
        throw new DomainError("CLOSE_REQUIRED", "마감 패키지는 확정 후 내려받을 수 있습니다.", 409);
      return new Response(
        JSON.stringify(
          {
            snapshot: workspace.close,
            audit: workspace.events,
            notice:
              "가상 거래로 만든 포트폴리오 데모입니다. 검토를 승인해도 원본 금액은 바뀌지 않습니다. SHA-256은 내용이 달라졌는지 확인하는 체크섬이며, 전자서명이 아닙니다.",
          },
          null,
          2,
        ),
        {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="closepilot-${workspace.period}-close.json"`,
            "Cache-Control": "no-store, private",
          },
        },
      );
    }
    if (format !== "csv")
      throw new DomainError("INVALID_FORMAT", "csv 또는 json 형식을 사용하세요.", 400);
    const body = buildReconciliationCsv(workspaceView(workspace));
    return new Response(`\uFEFF${body}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="closepilot-${workspace.period}-reconciliation.csv"`,
        "Cache-Control": "no-store, private",
      },
    });
  });
}
