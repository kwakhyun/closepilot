import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inspectPackage } from "@/application/package-inspection";
import { RULE_VERSION } from "@/domain/model";

describe("signed settlement sum contract", () => {
  it("accepts the command-generated package shared with the Kotlin HTTP verifier", () => {
    const input = JSON.parse(readFileSync("fixtures/signed-sum-closed-package.json", "utf8"));
    const result = inspectPackage(input);
    expect(result.valid).toBe(true);
    const snapshot = result.package!.snapshot;
    expect(snapshot.ruleVersion).toBe(RULE_VERSION);
    expect(snapshot.rows.find((row) => row.key === "d2c:SIGNED-SUM")).toMatchObject({
      kind: "amount",
      actualNet: 700_000_000_000,
      delta: 700_000_000_000,
    });
    expect(snapshot.rowCount).toBe(129);
    expect(snapshot.reviewedCount).toBe(9);
  });
});
