import { describe, expect, it } from "vitest";
import { createDemoWorkspace } from "@/application/showcase";
import { applyCommand, workspaceView } from "@/application/workbench";

const now = "2026-08-31T09:00:00.000Z";

describe("completed demo showcase", () => {
  it("builds a clearly labelled, fully reviewed and immutable synthetic close", () => {
    const workspace = createDemoWorkspace(now, { showcase: "completed" });
    const view = workspaceView(workspace);

    expect(view.demoMode).toBe("completed-showcase");
    expect(view.status).toBe("closed");
    expect(view.summary.unresolved).toBe(0);
    expect(view.summary.reviewed).toBe(8);
    expect(view.close).not.toBeNull();
    expect(
      Object.values(view.resolutions).every((resolution) => resolution.note.includes("합성")),
    ).toBe(true);
    expect(() =>
      applyCommand(workspace, { action: "reconcile", expectedVersion: workspace.version }),
    ).toThrow("마감이 확정되어");
  });

  it("keeps ordinary sessions open for hands-on review", () => {
    const workspace = createDemoWorkspace(now);
    expect(workspace.demoMode).toBe("fresh");
    expect(workspace.status).toBe("review");
    expect(workspace.close).toBeNull();
  });
});
