ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_allowance_cents bigint;

-- Best-effort backfill: infer the per-month allowance from the most recent
-- "Monthly allowance xN" ledger entry and store it so future rate changes can
-- be adjusted correctly.
WITH last_monthly_allowance AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    amount_cents,
    note
  FROM ledger_entries
  WHERE type = 'ALLOWANCE' AND note LIKE 'Monthly allowance x%'
  ORDER BY user_id, created_at DESC
),
parsed AS (
  SELECT
    user_id,
    amount_cents,
    NULLIF((substring(note from 'Monthly allowance x([0-9]+)'))::int, 0) AS months
  FROM last_monthly_allowance
)
UPDATE users u
SET last_allowance_cents = (p.amount_cents / p.months)
FROM parsed p
WHERE u.id = p.user_id
  AND u.last_allowance_cents IS NULL
  AND p.months IS NOT NULL;

