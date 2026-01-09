DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'market_trade_ban') THEN
    CREATE TYPE market_trade_ban AS ENUM ('YES', 'NO', 'ALL');
  END IF;
END $$;

ALTER TABLE market_involved_users
ADD COLUMN IF NOT EXISTS ban market_trade_ban NOT NULL DEFAULT 'ALL';
