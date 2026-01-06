import "server-only";

import pg from "pg";

const { Pool } = pg;

type GlobalWithPgPool = typeof globalThis & {
  __cm_pg_pool__?: pg.Pool;
};

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL in environment.");
  return url;
}

export function getPool() {
  const globalForPg = globalThis as GlobalWithPgPool;

  if (globalForPg.__cm_pg_pool__) return globalForPg.__cm_pg_pool__;
  const pool = new Pool({ connectionString: requireDatabaseUrl() });
  if (process.env.NODE_ENV !== "production") globalForPg.__cm_pg_pool__ = pool;
  return pool;
}
