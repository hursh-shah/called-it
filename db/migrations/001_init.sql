CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'market_status') THEN
    CREATE TYPE market_status AS ENUM ('OPEN', 'CLOSED', 'RESOLVED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'market_outcome') THEN
    CREATE TYPE market_outcome AS ENUM ('YES', 'NO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_side') THEN
    CREATE TYPE trade_side AS ENUM ('YES', 'NO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_type') THEN
    CREATE TYPE ledger_type AS ENUM ('TRADE', 'ALLOWANCE', 'PAYOUT');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  is_admin boolean NOT NULL DEFAULT false,
  balance_cents bigint NOT NULL DEFAULT 0,
  last_allowance_ym integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  rules text NOT NULL DEFAULT '',
  closes_at timestamptz NOT NULL,
  resolves_at timestamptz NOT NULL,
  status market_status NOT NULL DEFAULT 'OPEN',
  outcome market_outcome,
  resolved_at timestamptz,
  b double precision NOT NULL,
  q_yes double precision NOT NULL DEFAULT 0,
  q_no double precision NOT NULL DEFAULT 0,
  volume_cents bigint NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS markets_status_closes_at_idx ON markets (status, closes_at);

CREATE TABLE IF NOT EXISTS trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  side trade_side NOT NULL,
  delta_shares double precision NOT NULL,
  cost_cents bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trades_market_id_created_at_idx ON trades (market_id, created_at);
CREATE INDEX IF NOT EXISTS trades_user_id_created_at_idx ON trades (user_id, created_at);

CREATE TABLE IF NOT EXISTS positions (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  shares_yes double precision NOT NULL DEFAULT 0,
  shares_no double precision NOT NULL DEFAULT 0,
  cost_cents_yes bigint NOT NULL DEFAULT 0,
  cost_cents_no bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, market_id)
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market_id uuid REFERENCES markets(id) ON DELETE SET NULL,
  type ledger_type NOT NULL,
  amount_cents bigint NOT NULL,
  ref_trade_id uuid REFERENCES trades(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

