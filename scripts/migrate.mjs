import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Missing DATABASE_URL. Set it in your environment (or .env.local)."
    );
  }
  return url;
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
  const pool = new Pool({ connectionString: requireDatabaseUrl() });
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
