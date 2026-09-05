-- Generated from src/infrastructure/schema.ts by npm run fixtures.
CREATE TABLE IF NOT EXISTS closepilot_review_drafts (
  session_hash TEXT NOT NULL REFERENCES closepilot_workspaces(session_hash) ON DELETE CASCADE,
  evidence_hash TEXT NOT NULL CHECK (length(evidence_hash) = 64),
  lease_token TEXT NOT NULL,
  lease_until TIMESTAMPTZ NOT NULL,
  response JSONB CHECK (response IS NULL OR jsonb_typeof(response) = 'object'),
  PRIMARY KEY (session_hash, evidence_hash)
);
CREATE INDEX IF NOT EXISTS closepilot_draft_lease_idx ON closepilot_review_drafts(lease_until) WHERE response IS NULL;
