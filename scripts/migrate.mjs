import { readdirSync, readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { Pool } from "pg"

if (!process.env.DATABASE_URL_UNPOOLED && existsSync(".env.local")) process.loadEnvFile(".env.local")
if (!process.env.DATABASE_URL_UNPOOLED && existsSync(".env")) process.loadEnvFile(".env")

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
if (!connectionString) throw new Error("Defina DATABASE_URL_UNPOOLED antes de migrar o banco.")

const pool = new Pool({ connectionString, max: 1 })
try {
  await pool.query("CREATE SCHEMA IF NOT EXISTS sevenlas")
  await pool.query("CREATE TABLE IF NOT EXISTS sevenlas.migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())")
  const applied = new Set((await pool.query("SELECT name FROM sevenlas.migrations")).rows.map((row) => row.name))
  const directory = resolve("db/migrations")
  for (const name of readdirSync(directory).filter((file) => file.endsWith(".sql")).sort()) {
    if (applied.has(name)) continue
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(readFileSync(resolve(directory, name), "utf8"))
      await client.query("INSERT INTO sevenlas.migrations (name) VALUES ($1)", [name])
      await client.query("COMMIT")
      console.log(`Migração aplicada: ${name}`)
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  }
} finally {
  await pool.end()
}
