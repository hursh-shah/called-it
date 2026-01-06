DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'suggestion_status') THEN
    CREATE TYPE suggestion_status AS ENUM ('PENDING', 'USED', 'REJECTED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  details text NOT NULL DEFAULT '',
  status suggestion_status NOT NULL DEFAULT 'PENDING',
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market_id uuid REFERENCES markets(id) ON DELETE SET NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS suggestions_status_created_at_idx
  ON suggestions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS suggestions_created_by_created_at_idx
  ON suggestions (created_by, created_at DESC);

CREATE TABLE IF NOT EXISTS market_involved_users (
  market_id uuid NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (market_id, user_id)
);

CREATE INDEX IF NOT EXISTS market_involved_users_user_market_idx
  ON market_involved_users (user_id, market_id);
