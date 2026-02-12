import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS webhook_url text`);
    await client.query(`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS webhook_secret text`);
    await client.query(`CREATE TABLE IF NOT EXISTS webhook_logs (
      id serial PRIMARY KEY,
      merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      url text NOT NULL,
      payload text NOT NULL,
      status_code integer,
      response text,
      success boolean NOT NULL DEFAULT false,
      created_at timestamp DEFAULT now() NOT NULL
    )`);
    console.log("[DB] Migrations appliquees avec succes");
  } catch (err) {
    console.error("[DB] Erreur migration:", err);
  } finally {
    client.release();
  }
}
