import { workspaceView } from "@/application/workbench";
import { csvCell } from "@/domain/csv";
import { DomainError } from "@/domain/model";
import { apiError, repository, sessionHash } from "@/infrastructure/http";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
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
              "합성 데이터 포트폴리오 데모. 승인된 차이는 원본 금액을 수정하지 않습니다. SHA-256은 무결성 체크섬이며 전자서명이 아닙니다.",
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
    const rows = workspaceView(workspace).rows;
    const columns = [
      "order_id",
      "channel",
      "gross_krw",
      "refund_krw",
      "expected_fee_krw",
      "actual_fee_krw",
      "expected_net_krw",
      "actual_net_krw",
      "delta_krw",
      "issue",
      "review",
      "note",
      "evidence",
      "rule_version",
    ];
    const body = [
      columns,
      ...rows.map((row) => [
        row.orderId,
        row.channel,
        row.gross,
        row.refund,
        row.expectedFee,
        row.actualFee,
        row.expectedNet,
        row.actualNet,
        row.delta,
        row.kind,
        row.resolution?.disposition || "",
        row.resolution?.note || "",
        row.resolution?.evidence || "",
        "krw-net-v1.0.0",
      ]),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    return new Response(`\uFEFF${body}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="closepilot-${workspace.period}-reconciliation.csv"`,
        "Cache-Control": "no-store, private",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
