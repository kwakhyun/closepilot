-- Generated from src/infrastructure/schema.ts by npm run fixtures.
CREATE TABLE IF NOT EXISTS closepilot_library (
  workspace_hash TEXT PRIMARY KEY REFERENCES closepilot_workspaces(session_hash) ON DELETE CASCADE,
  owner_hash TEXT NOT NULL CHECK (length(owner_hash) = 64),
  handle UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_opened_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS closepilot_library_owner_idx ON closepilot_library(owner_hash);
CREATE TABLE IF NOT EXISTS closepilot_access_sessions (
  token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
  workspace_hash TEXT NOT NULL REFERENCES closepilot_workspaces(session_hash) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS closepilot_access_workspace_idx ON closepilot_access_sessions(workspace_hash);
