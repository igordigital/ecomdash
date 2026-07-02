import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

/**
 * Minimal forward-only migration runner: applies migrations/*.sql in filename
 * order, tracked in _migrations. Usable locally, in CI (service container),
 * and against Supabase (DATABASE_URL).
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const { rows } = await client.query<{ name: string }>("select name from _migrations");
    const applied = new Set(rows.map((r) => r.name));

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(join(dir, file), "utf8");
      console.log(`applying ${file}`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into _migrations (name) values ($1)", [file]);
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw err;
      }
    }
    console.log("migrations up to date");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
