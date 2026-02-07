-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a function to grant monthly allowances to all users
CREATE OR REPLACE FUNCTION grant_monthly_allowances_to_all()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_record RECORD;
  now_ym INTEGER;
  monthly_allowance_cents BIGINT;
  months_to_grant INTEGER;
  allowance_cents BIGINT;
  applied_cents BIGINT;
  adjustment_cents BIGINT;
BEGIN
  -- Calculate current year-month (same as currentYm function)
  now_ym := EXTRACT(YEAR FROM NOW())::INTEGER * 12 + EXTRACT(MONTH FROM NOW())::INTEGER;
  
  -- Default monthly allowance: 500 credits = 50000 cents
  monthly_allowance_cents := 50000;
  
  -- Process each user
  FOR user_record IN 
    SELECT 
      id,
      last_allowance_ym,
      last_allowance_cents
    FROM users
    FOR UPDATE
  LOOP
    -- Calculate months to grant (same logic as grantMonthlyAllowanceTx)
    IF user_record.last_allowance_ym IS NULL THEN
      months_to_grant := 1;
    ELSE
      months_to_grant := GREATEST(0, now_ym - user_record.last_allowance_ym);
    END IF;
    
    -- Only grant allowances if months_to_grant > 0
    -- Skip users who already received their allowance this month (they won't be affected)
    IF months_to_grant > 0 THEN
      allowance_cents := months_to_grant * monthly_allowance_cents;
      
      -- Update user balance and last allowance info
      UPDATE users
      SET 
        balance_cents = balance_cents + allowance_cents,
        last_allowance_ym = now_ym,
        last_allowance_cents = monthly_allowance_cents
      WHERE id = user_record.id;
      
      -- Create ledger entry
      INSERT INTO ledger_entries (user_id, type, amount_cents, note)
      VALUES (
        user_record.id,
        'ALLOWANCE',
        allowance_cents,
        'Monthly allowance x' || months_to_grant
      );
    -- If user already got allowance this month, skip them entirely (no adjustments)
    -- This ensures users who logged in and got 100 credits this month are not affected
    END IF;
  END LOOP;
END;
$$;

-- Schedule the job to run on the 1st of every month at midnight UTC
SELECT cron.schedule(
  'grant-monthly-allowances',
  '0 0 1 * *', -- First day of every month at 00:00 UTC
  'SELECT grant_monthly_allowances_to_all();'
);
