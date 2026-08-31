import { digest } from "./canonical";
import type { AuditEvent, Workspace } from "./model";

export function appendEvent(
  workspace: Workspace,
  event: Omit<AuditEvent, "id" | "hash" | "previousHash">,
): void {
  const body = {
    ...event,
    id: `EVT-${String(workspace.events.length + 1).padStart(4, "0")}`,
    previousHash: workspace.events.at(-1)?.hash ?? "GENESIS",
  };
  workspace.events.push({ ...body, hash: digest(body) });
}
export function verifyAudit(events: AuditEvent[]): boolean {
  let previousHash = "GENESIS";
  return events.every(({ hash, ...event }) => {
    const valid = event.previousHash === previousHash && digest(event) === hash;
    previousHash = hash;
    return valid;
  });
}
