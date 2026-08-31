-- Generated from src/infrastructure/schema.ts by npm run fixtures.
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
