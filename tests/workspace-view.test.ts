import { describe, expect, it } from "vitest";
import { createDemoWorkspace } from "@/application/showcase";
import { workspaceView } from "@/application/workbench";
import { digest } from "@/domain/canonical";

describe("workspace read DTO", () => {
  it("returns close metadata without duplicating the evidence package", () => {
    const workspace = createDemoWorkspace("2026-08-31T09:00:00.000Z", { showcase: "completed" });
    const before = digest(workspace);
    const view = workspaceView(workspace);
    expect(view.close).toEqual({
      hash: workspace.close!.hash,
      closedAt: workspace.close!.closedAt,
      closedBy: workspace.close!.closedBy,
    });
    expect(view.rows).toHaveLength(128);
    expect(workspace.close!.inputs.orders).toHaveLength(128);
    expect(workspace.close!.rows).toHaveLength(128);
    const { hash, ...body } = workspace.close!;
    expect(digest(body)).toBe(hash);
    expect(digest(workspace)).toBe(before);
    const legacy = JSON.stringify({ ...view, close: workspace.close });
    expect(Buffer.byteLength(JSON.stringify(view))).toBeLessThan(Buffer.byteLength(legacy) * 0.6);
  });

  it("keeps open close metadata null and does not leak future storage fields", () => {
    const workspace = { ...createDemoWorkspace(), storageOnly: "not a view field" };
    const view = workspaceView(workspace);
    expect(view.close).toBeNull();
    expect(view).not.toHaveProperty("storageOnly");
  });
});
