import process from "node:process";
import pg from "pg";

const { Pool } = pg;

// LMSR functions (copied from lib/lmsr.ts)
function lmsrCost(b, qYes, qNo) {
  const a = qYes / b;
  const c = qNo / b;
  const m = Math.max(a, c);
  return b * (m + Math.log(Math.exp(a - m) + Math.exp(c - m)));
}

function lmsrTradeCost(b, qYes, qNo, side, deltaShares) {
  const before = lmsrCost(b, qYes, qNo);
  const after =
    side === "YES"
      ? lmsrCost(b, qYes + deltaShares, qNo)
      : lmsrCost(b, qYes, qNo + deltaShares);
  return after - before;
}

function normalizeEnvValue(value, name) {
  if (!value) throw new Error(`Missing ${name} in environment.`);
  const trimmed = value.trim();
  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;
  return unquoted.trim();
}

function normalizeOptionalEnvValue(value) {
  if (!value) return undefined;
  const trimmed = value.trim();
  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;
  return unquoted.trim();
}

function parseBoolean(value) {
  if (value == null) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "t" ||
    normalized === "yes" ||
    normalized === "y" ||
    normalized === "on"
  ) {
    return true;
  }
  if (
    normalized === "0" ||
    normalized === "false" ||
    normalized === "f" ||
    normalized === "no" ||
    normalized === "n" ||
    normalized === "off"
  ) {
    return false;
  }
  return undefined;
}

function normalizeOptionalPem(value) {
  const normalized = normalizeOptionalEnvValue(value);
  if (!normalized) return undefined;
  return normalized.includes("\\n") ? normalized.replaceAll("\\n", "\n") : normalized;
}

function requireDatabaseUrl() {
  return normalizeEnvValue(process.env.DATABASE_URL, "DATABASE_URL");
}

function buildPoolConfig() {
  const connectionString = requireDatabaseUrl();

  let host;
  let port;
  let user;
  let password;
  let database;
  let ssl = undefined;
  try {
    const url = new URL(connectionString);
    host = url.hostname;
    port = url.port ? Number(url.port) : undefined;
    user = url.username ? decodeURIComponent(url.username) : undefined;
    password = url.password ? decodeURIComponent(url.password) : undefined;
    database =
      url.pathname && url.pathname !== "/" ? decodeURIComponent(url.pathname.slice(1)) : undefined;

    const hostLower = url.hostname.toLowerCase();
    const isLocalHost =
      hostLower === "localhost" || hostLower === "127.0.0.1" || hostLower === "::1";
    const isSupabaseHost =
      hostLower.endsWith(".supabase.co") || hostLower.endsWith(".pooler.supabase.com");

    const sslmodeFromUrl = url.searchParams.get("sslmode")?.toLowerCase();
    const sslmodeFromEnv = normalizeOptionalEnvValue(process.env.PGSSLMODE)?.toLowerCase();
    const sslmode = sslmodeFromUrl ?? sslmodeFromEnv;
    const sslParam = parseBoolean(url.searchParams.get("ssl"));

    let shouldUseSsl = false;
    if (sslmode === "disable" || sslmode === "allow" || sslParam === false) {
      shouldUseSsl = false;
    } else if (sslmode != null || sslParam === true) {
      shouldUseSsl = true;
    } else if (isSupabaseHost) {
      shouldUseSsl = true;
    } else if (!isLocalHost) {
      shouldUseSsl = false;
    }

    if (shouldUseSsl) {
      const rejectUnauthorizedFromEnv = parseBoolean(
        normalizeOptionalEnvValue(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED)
      );
      const ca = normalizeOptionalPem(process.env.DATABASE_SSL_CA);
      let rejectUnauthorized;
      if (rejectUnauthorizedFromEnv != null) {
        rejectUnauthorized = rejectUnauthorizedFromEnv;
      } else if (sslmode === "verify-ca" || sslmode === "verify-full") {
        rejectUnauthorized = true;
      } else if (sslmode === "require" || sslmode === "prefer" || sslmode === "no-verify") {
        rejectUnauthorized = false;
      } else {
        rejectUnauthorized = ca != null;
      }

      ssl = ca ? { rejectUnauthorized, ca } : { rejectUnauthorized };
    } else if (sslmode === "disable") {
      ssl = false;
    }
  } catch {
    throw new Error(
      "Invalid DATABASE_URL. Use a Postgres connection string like postgresql://user:pass@host:5432/db?sslmode=require (do not include quotes). If your password has special characters (like @/#), URL-encode it."
    );
  }

  return { host, port, user, password, database, ssl };
}

async function deleteUser(client, username) {
  await client.query("BEGIN");
  try {
    // Find the user
    const userRes = await client.query(
      `
        SELECT id, username
        FROM users
        WHERE username = $1
        FOR UPDATE
      `,
      [username]
    );
    const user = userRes.rows[0];
    if (!user) {
      process.stdout.write(`User ${username} not found.\n`);
      await client.query("ROLLBACK");
      return false;
    }

    process.stdout.write(`Processing user: ${username} (${user.id})\n`);

    // Get all positions for this user
    const positionsRes = await client.query(
      `
        SELECT market_id, shares_yes, shares_no
        FROM positions
        WHERE user_id = $1
        FOR UPDATE
      `,
      [user.id]
    );

    process.stdout.write(`  Found ${positionsRes.rows.length} positions to liquidate.\n`);

    // Liquidate all positions
    for (const position of positionsRes.rows) {
      // Get market details
      const marketRes = await client.query(
        `
          SELECT id, status, closes_at, outcome, b, q_yes, q_no
          FROM markets
          WHERE id = $1
          FOR UPDATE
        `,
        [position.market_id]
      );
      const market = marketRes.rows[0];
      if (!market) continue;

      // Skip if market is resolved or closed
      if (market.status === "RESOLVED" || market.outcome) {
        process.stdout.write(`  Skipping market ${market.id} (resolved/closed)\n`);
        continue;
      }
      const closesAtMs = new Date(market.closes_at).getTime();
      if (Date.now() >= closesAtMs) {
        process.stdout.write(`  Skipping market ${market.id} (trading closed)\n`);
        continue;
      }

      // Liquidate YES shares
      if (position.shares_yes > 1e-9) {
        const deltaShares = -position.shares_yes;
        const costCredits = lmsrTradeCost(market.b, market.q_yes, market.q_no, "YES", deltaShares);
        const costCents = Math.round(costCredits * 100);

        if (costCents < 0) {
          // User receives money from selling
          const nextQYes = market.q_yes + deltaShares;

          await client.query(
            `
              UPDATE markets
              SET
                q_yes = $1,
                volume_cents = volume_cents + $2
              WHERE id = $3
            `,
            [nextQYes, Math.abs(costCents), market.id]
          );

          await client.query(
            `
              INSERT INTO trades (user_id, market_id, side, delta_shares, cost_cents)
              VALUES ($1, $2, 'YES', $3, $4)
            `,
            [user.id, market.id, deltaShares, costCents]
          );

          await client.query(
            `
              UPDATE users
              SET balance_cents = balance_cents - $1
              WHERE id = $2
            `,
            [costCents, user.id]
          );

          process.stdout.write(
            `  Liquidated ${position.shares_yes.toFixed(4)} YES shares in market ${market.id} (received ${Math.abs(costCents) / 100} credits)\n`
          );
        }
      }

      // Liquidate NO shares
      if (position.shares_no > 1e-9) {
        // Refresh market state after YES liquidation
        const refreshedMarketRes = await client.query(
          `
            SELECT q_yes, q_no
            FROM markets
            WHERE id = $1
          `,
          [market.id]
        );
        const refreshedMarket = refreshedMarketRes.rows[0];

        const deltaShares = -position.shares_no;
        const costCredits = lmsrTradeCost(
          market.b,
          refreshedMarket.q_yes,
          refreshedMarket.q_no,
          "NO",
          deltaShares
        );
        const costCents = Math.round(costCredits * 100);

        if (costCents < 0) {
          // User receives money from selling
          const nextQNo = refreshedMarket.q_no + deltaShares;

          await client.query(
            `
              UPDATE markets
              SET
                q_no = $1,
                volume_cents = volume_cents + $2
              WHERE id = $3
            `,
            [nextQNo, Math.abs(costCents), market.id]
          );

          await client.query(
            `
              INSERT INTO trades (user_id, market_id, side, delta_shares, cost_cents)
              VALUES ($1, $2, 'NO', $3, $4)
            `,
            [user.id, market.id, deltaShares, costCents]
          );

          await client.query(
            `
              UPDATE users
              SET balance_cents = balance_cents - $1
              WHERE id = $2
            `,
            [costCents, user.id]
          );

          process.stdout.write(
            `  Liquidated ${position.shares_no.toFixed(4)} NO shares in market ${market.id} (received ${Math.abs(costCents) / 100} credits)\n`
          );
        }
      }
    }

    // Delete the user (cascades will handle sessions, trades, positions, ledger_entries)
    await client.query(
      `
        DELETE FROM users
        WHERE id = $1
      `,
      [user.id]
    );

    await client.query("COMMIT");
    process.stdout.write(`✓ Successfully deleted user: ${username}\n`);
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function main() {
  const usernames = ["punlord", "naithikpradeep", "yoshi"];

  const pool = new Pool(buildPoolConfig());
  const client = await pool.connect();
  try {
    for (const username of usernames) {
      await deleteUser(client, username);
    }
    process.stdout.write("Done.\n");
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
