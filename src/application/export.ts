import { csvCell } from "@/domain/csv";
import type { WorkspaceView } from "./workbench";

export function buildReconciliationCsv(workspace: WorkspaceView): string {
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
  return [
    columns,
    ...workspace.rows.map((row) => [
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
      workspace.ruleVersion,
    ]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}
