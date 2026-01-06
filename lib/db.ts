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

function normalizeOptionalEnvValue(value: string | undefined) {
  if (!value) return undefined;
  const trimmed = value.trim();
  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;
  return unquoted.trim();
}

function parseBoolean(value: string | null | undefined) {
  if (value == null) return undefined;
  const normalized = value.trim().toLowerCase();
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

function normalizeOptionalPem(value: string | undefined) {
  const normalized = normalizeOptionalEnvValue(value);
  if (!normalized) return undefined;
  return normalized.includes("\\n") ? normalized.replaceAll("\\n", "\n") : normalized;
}

function requireDatabaseUrl() {
  return normalizeEnvValue(process.env.DATABASE_URL, "DATABASE_URL");
}

function buildPoolConfig() {
  const connectionString = requireDatabaseUrl();

  let host: string;
  let port: number | undefined;
  let user: string | undefined;
  let password: string | undefined;
  let database: string | undefined;
  let ssl: false | undefined | { rejectUnauthorized: boolean; ca?: string } = undefined;
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
      let rejectUnauthorized: boolean;
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
