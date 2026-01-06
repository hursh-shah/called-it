import "server-only";

import { Pool } from "pg";

type GlobalWithPgPool = typeof globalThis & {
  __cm_pg_pool__?: Pool;
};

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL in environment.");
  return url;
}

export function getPool(): Pool {
  const globalForPg = globalThis as GlobalWithPgPool;

  if (globalForPg.__cm_pg_pool__) return globalForPg.__cm_pg_pool__;
  const pool = new Pool({ connectionString: requireDatabaseUrl() });
  if (process.env.NODE_ENV !== "production") globalForPg.__cm_pg_pool__ = pool;
  return pool;
}
