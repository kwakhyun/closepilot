export const SCHEMA = `
CREATE TABLE IF NOT EXISTS closepilot_workspaces (
  session_hash TEXT PRIMARY KEY CHECK (length(session_hash) = 64),
  state JSONB NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL CHECK (status IN ('open', 'review', 'closed')),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT closepilot_state_object CHECK (jsonb_typeof(state) = 'object' AND state->>'version' IS NOT NULL AND state->>'status' IS NOT NULL),
  CHECK ((state->>'version')::integer = version),
  CHECK (state->>'status' = status)
);
CREATE INDEX IF NOT EXISTS closepilot_expiry_idx ON closepilot_workspaces(expires_at);
CREATE TABLE IF NOT EXISTS closepilot_receipts (
  session_hash TEXT NOT NULL REFERENCES closepilot_workspaces(session_hash) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 100),
  request_hash TEXT NOT NULL,
  version_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_hash, idempotency_key)
);
CREATE TABLE IF NOT EXISTS closepilot_audit_events (
  session_hash TEXT NOT NULL REFERENCES closepilot_workspaces(session_hash) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  event JSONB NOT NULL,
  CONSTRAINT closepilot_event_object CHECK (jsonb_typeof(event) = 'object' AND event->>'hash' IS NOT NULL AND event->>'previousHash' IS NOT NULL),
  PRIMARY KEY (session_hash, sequence)
);
CREATE TABLE IF NOT EXISTS closepilot_rate_limits (
  bucket TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE OR REPLACE FUNCTION closepilot_guard_closed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'closed' THEN RAISE EXCEPTION 'Closed workspace is immutable'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS closepilot_closed_guard ON closepilot_workspaces;
CREATE TRIGGER closepilot_closed_guard BEFORE UPDATE ON closepilot_workspaces
FOR EACH ROW EXECUTE FUNCTION closepilot_guard_closed();
CREATE OR REPLACE FUNCTION closepilot_guard_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit events cannot be updated'; END $$;
DROP TRIGGER IF EXISTS closepilot_audit_guard ON closepilot_audit_events;
CREATE TRIGGER closepilot_audit_guard BEFORE UPDATE ON closepilot_audit_events
FOR EACH ROW EXECUTE FUNCTION closepilot_guard_audit();
`;

// Additive migration: enforce new writes without touching existing session data.
// NOT VALID permits legacy demo rows to age out through normal cleanup.
export const JSONB_GUARDS = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'closepilot_state_object' AND conrelid = 'closepilot_workspaces'::regclass) THEN
    ALTER TABLE closepilot_workspaces ADD CONSTRAINT closepilot_state_object
      CHECK (jsonb_typeof(state) = 'object' AND state->>'version' IS NOT NULL AND state->>'status' IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'closepilot_event_object' AND conrelid = 'closepilot_audit_events'::regclass) THEN
    ALTER TABLE closepilot_audit_events ADD CONSTRAINT closepilot_event_object
      CHECK (jsonb_typeof(event) = 'object' AND event->>'hash' IS NOT NULL AND event->>'previousHash' IS NOT NULL) NOT VALID;
  END IF;
END $$;
`;

export const REVIEW_DRAFT_STORAGE = `
CREATE TABLE IF NOT EXISTS closepilot_review_drafts (
  session_hash TEXT NOT NULL REFERENCES closepilot_workspaces(session_hash) ON DELETE CASCADE,
  evidence_hash TEXT NOT NULL CHECK (length(evidence_hash) = 64),
  lease_token TEXT NOT NULL,
  lease_until TIMESTAMPTZ NOT NULL,
  response JSONB CHECK (response IS NULL OR jsonb_typeof(response) = 'object'),
  PRIMARY KEY (session_hash, evidence_hash)
);
CREATE INDEX IF NOT EXISTS closepilot_draft_lease_idx ON closepilot_review_drafts(lease_until) WHERE response IS NULL;
`;
