import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

const dbUrl = process.env.SUPABASE_DATABASE_URL;
if (!dbUrl) {
  throw new Error("SUPABASE_DATABASE_URL must be set");
}

export const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
  max: 10,
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
      crypto_api_key text,
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

    await client.query(`CREATE TABLE IF NOT EXISTS wallet_transfer_countries (
      id serial PRIMARY KEY,
      country text NOT NULL UNIQUE,
      currency_zone text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      created_at timestamp DEFAULT now() NOT NULL
    )`);

    const defaultWtcCountries = [
      { country: "Benin", zone: "XOF" },
      { country: "Burkina Faso", zone: "XOF" },
      { country: "Cote d'Ivoire", zone: "XOF" },
      { country: "Mali", zone: "XOF" },
      { country: "Senegal", zone: "XOF" },
      { country: "Togo", zone: "XOF" },
      { country: "Niger", zone: "XOF" },
      { country: "Guinee-Bissau", zone: "XOF" },
      { country: "Cameroun", zone: "XAF" },
      { country: "Congo Brazzaville", zone: "XAF" },
      { country: "Gabon", zone: "XAF" },
      { country: "Tchad", zone: "XAF" },
      { country: "Centrafrique", zone: "XAF" },
      { country: "Guinee Equatoriale", zone: "XAF" },
    ];
    for (const c of defaultWtcCountries) {
      await client.query(
        `INSERT INTO wallet_transfer_countries (country, currency_zone) VALUES ($1, $2) ON CONFLICT (country) DO NOTHING`,
        [c.country, c.zone]
      );
    }

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

    await client.query(`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS withdrawal_mode text NOT NULL DEFAULT 'manual'`);

    await client.query(`CREATE TABLE IF NOT EXISTS withdrawals (
      id serial PRIMARY KEY,
      merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      merchant_country_id integer NOT NULL,
      country text NOT NULL,
      amount integer NOT NULL,
      phone text NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      withdrawal_mode text NOT NULL DEFAULT 'manual',
      admin_note text,
      created_at timestamp DEFAULT now() NOT NULL,
      processed_at timestamp
    )`);

    await client.query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS operator text`);
    await client.query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS omnipay_ref text`);
    await client.query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS fees integer DEFAULT 0`);

    await client.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payer_name text`);
    await client.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS merchant_country_id integer`);
    await client.query(`ALTER TABLE pending_payments ADD COLUMN IF NOT EXISTS payer_name text`);

    await client.query(`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS website text`);

    await client.query(`CREATE TABLE IF NOT EXISTS withdrawal_operators (
      id serial PRIMARY KEY,
      name text NOT NULL,
      type text NOT NULL DEFAULT 'Mobile Money',
      country text NOT NULL,
      daily_limit integer NOT NULL DEFAULT 1000000,
      gateway text NOT NULL DEFAULT 'OmniPay',
      active boolean NOT NULL DEFAULT true,
      maintenance_all boolean NOT NULL DEFAULT false,
      maintenance_deposits boolean NOT NULL DEFAULT false,
      maintenance_withdrawals boolean NOT NULL DEFAULT false,
      maintenance_payment_links boolean NOT NULL DEFAULT false,
      maintenance_api_payment boolean NOT NULL DEFAULT false,
      created_at timestamp DEFAULT now() NOT NULL
    )`);

    const defaultOperators = [
      { name: "Moov Money", type: "Mobile Money", country: "Togo", dailyLimit: 1000000, gateway: "OmniPay" },
      { name: "TMoney", type: "Mobile Money", country: "Togo", dailyLimit: 1000000, gateway: "OmniPay" },
      { name: "MTN Mobile Money", type: "Mobile Money", country: "Benin", dailyLimit: 1000000, gateway: "OmniPay" },
      { name: "Moov Money", type: "Mobile Money", country: "Benin", dailyLimit: 1000000, gateway: "OmniPay" },
      { name: "Moov Money", type: "Mobile Money", country: "Burkina Faso", dailyLimit: 1000000, gateway: "OmniPay" },
      { name: "Orange Money", type: "Mobile Money", country: "Burkina Faso", dailyLimit: 1000000, gateway: "OmniPay" },
      { name: "MTN Mobile Money", type: "Mobile Money", country: "Cote d'Ivoire", dailyLimit: 1000000, gateway: "OmniPay" },
      { name: "Moov Money", type: "Mobile Money", country: "Cote d'Ivoire", dailyLimit: 1000000, gateway: "OmniPay" },
      { name: "Orange Money", type: "Mobile Money", country: "Cote d'Ivoire", dailyLimit: 1000000, gateway: "OmniPay" },
      { name: "Wave", type: "Mobile Money", country: "Cote d'Ivoire", dailyLimit: 1000000, gateway: "OmniPay" },
      { name: "Mixx by Yas", type: "Mobile Money", country: "Senegal", dailyLimit: 1000000, gateway: "OmniPay" },
      { name: "Orange Money", type: "Mobile Money", country: "Senegal", dailyLimit: 1000000, gateway: "OmniPay" },
      { name: "Wave", type: "Mobile Money", country: "Senegal", dailyLimit: 1000000, gateway: "OmniPay" },
      { name: "Orange Money", type: "Mobile Money", country: "Mali", dailyLimit: 1000000, gateway: "OmniPay" },
      { name: "MTN Mobile Money", type: "Mobile Money", country: "Cameroun", dailyLimit: 1000000, gateway: "OmniPay" },
      { name: "Orange Money", type: "Mobile Money", country: "Cameroun", dailyLimit: 1000000, gateway: "OmniPay" },
      { name: "MTN Mobile Money", type: "Mobile Money", country: "Congo Brazzaville", dailyLimit: 1000000, gateway: "OmniPay" },
      { name: "Airtel Money", type: "Mobile Money", country: "Gabon", dailyLimit: 1000000, gateway: "OmniPay" },
      { name: "Moov Money", type: "Mobile Money", country: "Gabon", dailyLimit: 1000000, gateway: "OmniPay" },
      { name: "Orange Money", type: "Mobile Money", country: "Congo RDC", dailyLimit: 500000, gateway: "OmniPay" },
      { name: "M-Pesa", type: "Mobile Money", country: "Congo RDC", dailyLimit: 500000, gateway: "OmniPay" },
    ];

    for (const op of defaultOperators) {
      await client.query(
        `INSERT INTO withdrawal_operators (name, type, country, daily_limit, gateway)
         SELECT $1, $2, $3, $4, $5
         WHERE NOT EXISTS (
           SELECT 1 FROM withdrawal_operators WHERE name = $1 AND country = $3
         )`,
        [op.name, op.type, op.country, op.dailyLimit, op.gateway]
      );
    }

    await client.query(`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS fee_exempt boolean NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE withdrawal_operators ADD COLUMN IF NOT EXISTS omnipay_code text`);
    await client.query(`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS crypto_api_key text`);
    await client.query(`ALTER TABLE merchant_countries ADD COLUMN IF NOT EXISTS payin_gateway text NOT NULL DEFAULT 'omnipay'`);
    await client.query(`ALTER TABLE pending_payments ADD COLUMN IF NOT EXISTS gateway text NOT NULL DEFAULT 'omnipay'`);
    await client.query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS gateway text NOT NULL DEFAULT 'omnipay'`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS merchants_crypto_api_key_idx ON merchants(crypto_api_key) WHERE crypto_api_key IS NOT NULL`);

    await client.query(`
      UPDATE withdrawal_operators SET omnipay_code = CASE
        WHEN LOWER(name) LIKE '%mtn%' THEN 'mtn'
        WHEN LOWER(name) LIKE '%moov%' THEN 'moov'
        WHEN LOWER(name) LIKE '%orange%' THEN 'orange'
        WHEN LOWER(name) LIKE '%wave%' THEN 'wave'
        WHEN LOWER(name) LIKE '%tmoney%' OR LOWER(name) LIKE '%t-money%' THEN 'tmoney'
        WHEN LOWER(name) LIKE '%mixx%' OR LOWER(name) LIKE '%yas%' THEN 'mixx'
        WHEN LOWER(name) LIKE '%airtel%' THEN 'airtel'
        WHEN LOWER(name) LIKE '%flooz%' THEN 'flooz'
        WHEN LOWER(name) LIKE '%mpesa%' OR LOWER(name) LIKE '%m-pesa%' OR LOWER(name) LIKE '%m pesa%' THEN 'mpesa'
        ELSE omnipay_code
      END
      WHERE omnipay_code IS NULL
    `);

    console.log("[DB] Migrations appliquees avec succes");
  } catch (err) {
    console.error("[DB] Erreur migration:", err);
  } finally {
    client.release();
  }
}
