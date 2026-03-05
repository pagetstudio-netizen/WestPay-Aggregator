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
    await client.query(`ALTER TABLE merchant_countries ADD COLUMN IF NOT EXISTS omnipay_enabled boolean NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'sms'`);
    await client.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS omnipay_tx_id text`);
    await client.query(`ALTER TABLE pending_payments ADD COLUMN IF NOT EXISTS omnipay_reference text`);
    await client.query(`ALTER TABLE pending_payments ADD COLUMN IF NOT EXISTS omnipay_tx_id text`);
    await client.query(`ALTER TABLE pending_payments ADD COLUMN IF NOT EXISTS omnipay_payment_url text`);
    console.log("[DB] Migrations appliquees avec succes");
  } catch (err) {
    console.error("[DB] Erreur migration:", err);
  } finally {
    client.release();
  }
}
