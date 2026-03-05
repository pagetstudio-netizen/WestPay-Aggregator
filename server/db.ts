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
    await client.query(`CREATE TABLE IF NOT EXISTS admins (
      id serial PRIMARY KEY,
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      api_key text NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS merchants (
      id serial PRIMARY KEY,
      name text NOT NULL,
      email text NOT NULL UNIQUE,
      slug text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      suspended boolean NOT NULL DEFAULT false,
      webhook_url text,
      webhook_secret text,
      telegram_chat_id text,
      created_at timestamp DEFAULT now() NOT NULL
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS merchant_countries (
      id serial PRIMARY KEY,
      merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      country text NOT NULL,
      api_key text NOT NULL,
      balance integer NOT NULL DEFAULT 0,
      active boolean NOT NULL DEFAULT true,
      omnipay_enabled boolean NOT NULL DEFAULT false
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS transactions (
      id serial PRIMARY KEY,
      merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      country text NOT NULL,
      tx_id text NOT NULL UNIQUE,
      amount integer NOT NULL,
      payer_number text,
      status text NOT NULL DEFAULT 'confirmed',
      provider text NOT NULL DEFAULT 'sms',
      omnipay_tx_id text,
      created_at timestamp DEFAULT now() NOT NULL
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS sms_logs (
      id serial PRIMARY KEY,
      from_sim text NOT NULL,
      sms_text text NOT NULL,
      parsed boolean NOT NULL DEFAULT false,
      error_message text,
      parsed_amount integer,
      parsed_tx_id text,
      parsed_payer text,
      created_at timestamp DEFAULT now() NOT NULL
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS numbers (
      id serial PRIMARY KEY,
      phone_number text NOT NULL,
      country text NOT NULL,
      operator text,
      status text NOT NULL DEFAULT 'active',
      merchant_id integer REFERENCES merchants(id) ON DELETE SET NULL
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS settings (
      id serial PRIMARY KEY,
      key text NOT NULL UNIQUE,
      value text NOT NULL
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS login_logs (
      id serial PRIMARY KEY,
      user_id integer NOT NULL,
      role text NOT NULL,
      ip text,
      device text,
      success boolean NOT NULL DEFAULT true,
      created_at timestamp DEFAULT now() NOT NULL
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS merchant_pins (
      id serial PRIMARY KEY,
      merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE UNIQUE,
      pin_hash text NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS api_logs (
      id serial PRIMARY KEY,
      merchant_id integer REFERENCES merchants(id) ON DELETE SET NULL,
      action text NOT NULL,
      ip text,
      description text,
      created_at timestamp DEFAULT now() NOT NULL
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS pending_payments (
      id serial PRIMARY KEY,
      merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      country text NOT NULL,
      amount integer NOT NULL,
      payer_phone text,
      payer_name text,
      payment_method text NOT NULL,
      tx_id text,
      status text NOT NULL DEFAULT 'pending',
      redirect_url text,
      omnipay_reference text,
      omnipay_tx_id text,
      omnipay_payment_url text,
      expires_at timestamp NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL
    )`);

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

    await client.query(`CREATE TABLE IF NOT EXISTS telegram_activation_codes (
      id serial PRIMARY KEY,
      merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      code text NOT NULL UNIQUE,
      used boolean NOT NULL DEFAULT false,
      expires_at timestamp NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL
    )`);

    await client.query(`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS webhook_url text`);
    await client.query(`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS webhook_secret text`);
    await client.query(`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS telegram_chat_id text`);
    await client.query(`ALTER TABLE merchant_countries ADD COLUMN IF NOT EXISTS omnipay_enabled boolean NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'sms'`);
    await client.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS omnipay_tx_id text`);
    await client.query(`ALTER TABLE pending_payments ADD COLUMN IF NOT EXISTS omnipay_reference text`);
    await client.query(`ALTER TABLE pending_payments ADD COLUMN IF NOT EXISTS omnipay_tx_id text`);
    await client.query(`ALTER TABLE pending_payments ADD COLUMN IF NOT EXISTS omnipay_payment_url text`);

    await client.query(`CREATE TABLE IF NOT EXISTS payment_links (
      id serial PRIMARY KEY,
      merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      unique_id text NOT NULL UNIQUE,
      name text NOT NULL,
      amount_type text NOT NULL DEFAULT 'fixed',
      amount integer,
      redirect_url text,
      expires_at timestamp,
      payment_limit integer,
      payment_count integer NOT NULL DEFAULT 0,
      total_revenue integer NOT NULL DEFAULT 0,
      last_payment_at timestamp,
      active boolean NOT NULL DEFAULT true,
      created_at timestamp DEFAULT now() NOT NULL
    )`);

    await client.query(`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS telegram_bot_language text NOT NULL DEFAULT 'fr'`);

    await client.query(`CREATE TABLE IF NOT EXISTS wallet_transfers (
      id serial PRIMARY KEY,
      merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      from_country_id integer NOT NULL,
      to_country_id integer NOT NULL,
      from_country text NOT NULL,
      to_country text NOT NULL,
      currency text NOT NULL,
      amount integer NOT NULL,
      fee integer NOT NULL DEFAULT 0,
      net_amount integer NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      admin_note text,
      created_at timestamp DEFAULT now() NOT NULL,
      processed_at timestamp
    )`);

    console.log("[DB] Migrations appliquees avec succes");
  } catch (err) {
    console.error("[DB] Erreur migration:", err);
  } finally {
    client.release();
  }
}
