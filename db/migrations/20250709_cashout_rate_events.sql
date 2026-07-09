-- Rate-limit tracking for cashout API endpoints

CREATE TABLE IF NOT EXISTS cashout_api_events (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cashout_api_events_user_action
  ON cashout_api_events (user_id, action, created_at DESC);
