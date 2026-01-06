import "server-only";

import { Pool } from "pg";

type GlobalWithPgPool = typeof globalThis & {
  __cm_pg_pool__?: Pool;
};

function normalizeEnvValue(value: string | undefined, name: string) {
  if (!value) throw new Error(`Missing ${name} in environment.`);
  const trimmed = value.trim();
  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;
  return unquoted.trim();
}

function requireDatabaseUrl() {
  return normalizeEnvValue(process.env.DATABASE_URL, "DATABASE_URL");
}

function buildPoolConfig() {
  const connectionString = requireDatabaseUrl();

  let ssl: undefined | { rejectUnauthorized: boolean } = undefined;
  try {
    const url = new URL(connectionString);
    const host = url.hostname.toLowerCase();
    const isSupabaseHost =
      host.endsWith(".supabase.co") || host.endsWith(".pooler.supabase.com");

    const sslmode = url.searchParams.get("sslmode")?.toLowerCase();
    const shouldUseSsl =
      sslmode == null ? isSupabaseHost : sslmode !== "disable" && sslmode !== "allow";

    if (shouldUseSsl) {
      ssl = { rejectUnauthorized: false };
    }
  } catch {
    throw new Error(
      "Invalid DATABASE_URL. Use a Postgres connection string like postgresql://user:pass@host:5432/db?sslmode=require (do not include quotes). If your password has special characters (like @/#), URL-encode it."
    );
  }

  return { connectionString, ssl };
}

export function getPool(): Pool {
  const globalForPg = globalThis as GlobalWithPgPool;

  if (!globalForPg.__cm_pg_pool__) {
    globalForPg.__cm_pg_pool__ = new Pool({
      ...buildPoolConfig(),
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000
    });
  }
  return globalForPg.__cm_pg_pool__;
}
