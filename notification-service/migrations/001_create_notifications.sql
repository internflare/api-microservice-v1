CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (
    type IN ('account', 'application', 'interview', 'offer', 'message', 'system')
  ),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'in_app')),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_unread_user_idx
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;
