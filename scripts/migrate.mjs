import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

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

  let ssl = undefined;
  try {
    const url = new URL(connectionString);
    const host = url.hostname.toLowerCase();
    const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "::1";
    const isSupabaseHost =
      host.endsWith(".supabase.co") || host.endsWith(".pooler.supabase.com");

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
      const rejectUnauthorized = rejectUnauthorizedFromEnv ?? (ca ? true : false);
      ssl = ca
        ? { rejectUnauthorized, ca }
        : { rejectUnauthorized };
    }
  } catch {
    throw new Error(
      "Invalid DATABASE_URL. Use a Postgres connection string like postgresql://user:pass@host:5432/db?sslmode=require (do not include quotes). If your password has special characters (like @/#), URL-encode it."
    );
  }

  return { connectionString, ssl };
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function listMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".sql"))
    .map((e) => e.name)
    .sort();
}

async function isApplied(client, id) {
  const res = await client.query(
    "SELECT 1 FROM schema_migrations WHERE id = $1 LIMIT 1",
    [id]
  );
  return res.rowCount > 0;
}

async function applyMigration(client, id, sql) {
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function main() {
  const pool = new Pool(buildPoolConfig());
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const files = await listMigrationFiles();
    for (const file of files) {
      const id = file;
      if (await isApplied(client, id)) continue;
      const fullPath = path.join(MIGRATIONS_DIR, file);
      const sql = await fs.readFile(fullPath, "utf8");
      process.stdout.write(`Applying ${file}...\n`);
      await applyMigration(client, id, sql);
    }
    process.stdout.write("Done.\n");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
