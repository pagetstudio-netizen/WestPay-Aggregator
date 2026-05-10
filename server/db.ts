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
    // ─── Toutes les migrations dans une seule transaction pour maximiser la vitesse ───
    await client.query("BEGIN");

    // ── Tables de base ──────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id serial PRIMARY KEY,
        email text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        api_key text NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS merchants (
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
      );

      CREATE TABLE IF NOT EXISTS merchant_countries (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        country text NOT NULL,
        api_key text NOT NULL,
        balance integer NOT NULL DEFAULT 0,
        active boolean NOT NULL DEFAULT true,
        omnipay_enabled boolean NOT NULL DEFAULT false
      );

      CREATE TABLE IF NOT EXISTS transactions (
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
      );

      CREATE TABLE IF NOT EXISTS sms_logs (
        id serial PRIMARY KEY,
        from_sim text NOT NULL,
        sms_text text NOT NULL,
        parsed boolean NOT NULL DEFAULT false,
        error_message text,
        parsed_amount integer,
        parsed_tx_id text,
        parsed_payer text,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS numbers (
        id serial PRIMARY KEY,
        phone_number text NOT NULL,
        country text NOT NULL,
        operator text,
        status text NOT NULL DEFAULT 'active',
        merchant_id integer REFERENCES merchants(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        id serial PRIMARY KEY,
        key text NOT NULL UNIQUE,
        value text NOT NULL
      );

      CREATE TABLE IF NOT EXISTS login_logs (
        id serial PRIMARY KEY,
        user_id integer NOT NULL,
        role text NOT NULL,
        ip text,
        device text,
        success boolean NOT NULL DEFAULT true,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS merchant_pins (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE UNIQUE,
        pin_hash text NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS api_logs (
        id serial PRIMARY KEY,
        merchant_id integer REFERENCES merchants(id) ON DELETE SET NULL,
        action text NOT NULL,
        ip text,
        description text,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pending_payments (
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
      );

      CREATE TABLE IF NOT EXISTS webhook_logs (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        url text NOT NULL,
        payload text NOT NULL,
        status_code integer,
        response text,
        success boolean NOT NULL DEFAULT false,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS telegram_activation_codes (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        code text NOT NULL UNIQUE,
        used boolean NOT NULL DEFAULT false,
        expires_at timestamp NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payment_links (
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
      );

      CREATE TABLE IF NOT EXISTS wallet_transfer_countries (
        id serial PRIMARY KEY,
        country text NOT NULL UNIQUE,
        currency_zone text NOT NULL,
        active boolean NOT NULL DEFAULT true,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS wallet_transfers (
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
      );

      CREATE TABLE IF NOT EXISTS withdrawals (
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
      );

      CREATE TABLE IF NOT EXISTS withdrawal_operators (
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
      );

      CREATE TABLE IF NOT EXISTS crypto_aggregators (
        id serial PRIMARY KEY,
        name text NOT NULL,
        type text NOT NULL DEFAULT 'oxapay',
        api_key text NOT NULL,
        active boolean NOT NULL DEFAULT true,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS crypto_transactions (
        id serial PRIMARY KEY,
        aggregator_id integer NOT NULL REFERENCES crypto_aggregators(id) ON DELETE CASCADE,
        merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        track_id text NOT NULL UNIQUE,
        amount text NOT NULL,
        currency text NOT NULL DEFAULT 'USD',
        pay_currency text,
        pay_amount text,
        status text NOT NULL DEFAULT 'pending',
        wallet_address text,
        network text,
        tx_hash text,
        order_id text,
        description text,
        callback_url text,
        return_url text,
        credited_at timestamp,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS crypto_balances (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        currency text NOT NULL,
        balance text NOT NULL DEFAULT '0',
        updated_at timestamp DEFAULT now() NOT NULL,
        UNIQUE(merchant_id, currency)
      );

      CREATE TABLE IF NOT EXISTS crypto_withdrawal_requests (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        currency text NOT NULL,
        amount text NOT NULL,
        fee_amount text NOT NULL DEFAULT '0',
        net_amount text NOT NULL DEFAULT '0',
        wallet_address text NOT NULL,
        network text,
        status text NOT NULL DEFAULT 'pending',
        admin_note text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS crypto_payment_links (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        unique_id text NOT NULL UNIQUE,
        name text NOT NULL,
        currency text NOT NULL DEFAULT 'USDT',
        amount_type text NOT NULL DEFAULT 'fixed',
        amount text,
        description text,
        return_url text,
        active boolean NOT NULL DEFAULT true,
        created_at timestamp DEFAULT now() NOT NULL
      );
    `);

    // ── Colonnes ajoutées progressivement (idempotentes) ──────────────────────────
    await client.query(`
      ALTER TABLE merchants ADD COLUMN IF NOT EXISTS webhook_url text;
      ALTER TABLE merchants ADD COLUMN IF NOT EXISTS webhook_secret text;
      ALTER TABLE merchants ADD COLUMN IF NOT EXISTS telegram_chat_id text;
      ALTER TABLE merchants ADD COLUMN IF NOT EXISTS telegram_bot_language text NOT NULL DEFAULT 'fr';
      ALTER TABLE merchants ADD COLUMN IF NOT EXISTS withdrawal_mode text NOT NULL DEFAULT 'manual';
      ALTER TABLE merchants ADD COLUMN IF NOT EXISTS website text;
      ALTER TABLE merchants ADD COLUMN IF NOT EXISTS fee_exempt boolean NOT NULL DEFAULT false;
      ALTER TABLE merchants ADD COLUMN IF NOT EXISTS crypto_api_key text;
      ALTER TABLE merchants ADD COLUMN IF NOT EXISTS sdk_enabled boolean NOT NULL DEFAULT false;
      ALTER TABLE merchants ADD COLUMN IF NOT EXISTS sdk_api_key text;
      ALTER TABLE merchant_countries ADD COLUMN IF NOT EXISTS omnipay_enabled boolean NOT NULL DEFAULT false;
      ALTER TABLE merchant_countries ADD COLUMN IF NOT EXISTS payin_gateway text NOT NULL DEFAULT 'omnipay';
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'sms';
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS omnipay_tx_id text;
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payer_name text;
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS merchant_country_id integer;
      ALTER TABLE pending_payments ADD COLUMN IF NOT EXISTS omnipay_reference text;
      ALTER TABLE pending_payments ADD COLUMN IF NOT EXISTS omnipay_tx_id text;
      ALTER TABLE pending_payments ADD COLUMN IF NOT EXISTS omnipay_payment_url text;
      ALTER TABLE pending_payments ADD COLUMN IF NOT EXISTS payer_name text;
      ALTER TABLE pending_payments ADD COLUMN IF NOT EXISTS gateway text NOT NULL DEFAULT 'omnipay';
      ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS operator text;
      ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS omnipay_ref text;
      ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS fees integer DEFAULT 0;
      ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS gateway text NOT NULL DEFAULT 'omnipay';
      ALTER TABLE withdrawal_operators ADD COLUMN IF NOT EXISTS omnipay_code text;
      ALTER TABLE withdrawal_operators ADD COLUMN IF NOT EXISTS mbiyo_code text;
    `);

    // ── Index uniques ──────────────────────────────────────────────────────────────
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS merchants_crypto_api_key_idx ON merchants(crypto_api_key) WHERE crypto_api_key IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS merchants_sdk_api_key_idx ON merchants(sdk_api_key) WHERE sdk_api_key IS NOT NULL;
    `);

    // ── Déduplication des opérateurs avant d'ajouter la contrainte ────────────────
    await client.query(`
      DELETE FROM withdrawal_operators a
      USING withdrawal_operators b
      WHERE a.id > b.id
        AND a.name = b.name
        AND a.country = b.country;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_operators_name_country_idx
        ON withdrawal_operators(name, country);
    `);

    // ── Données par défaut : pays de transfert ────────────────────────────────────
    await client.query(`
      INSERT INTO wallet_transfer_countries (country, currency_zone) VALUES
        ('Benin','XOF'),('Burkina Faso','XOF'),('Cote d''Ivoire','XOF'),('Mali','XOF'),
        ('Senegal','XOF'),('Togo','XOF'),('Niger','XOF'),('Guinee-Bissau','XOF'),
        ('Cameroun','XAF'),('Congo Brazzaville','XAF'),('Gabon','XAF'),('Tchad','XAF'),
        ('Centrafrique','XAF'),('Guinee Equatoriale','XAF'),
        ('Congo RDC','CDF'),('Guinee','GNF'),('Gambie','GMD')
      ON CONFLICT (country) DO NOTHING
    `);

    // ── Données par défaut : opérateurs de retrait ────────────────────────────────
    await client.query(`
      INSERT INTO withdrawal_operators (name, type, country, daily_limit, gateway) VALUES
        ('Moov Money','Mobile Money','Togo',1000000,'OmniPay'),
        ('TMoney','Mobile Money','Togo',1000000,'OmniPay'),
        ('MTN Mobile Money','Mobile Money','Benin',1000000,'OmniPay'),
        ('Moov Money','Mobile Money','Benin',1000000,'OmniPay'),
        ('Moov Money','Mobile Money','Burkina Faso',1000000,'OmniPay'),
        ('Orange Money','Mobile Money','Burkina Faso',1000000,'OmniPay'),
        ('MTN Mobile Money','Mobile Money','Cote d''Ivoire',1000000,'OmniPay'),
        ('Moov Money','Mobile Money','Cote d''Ivoire',1000000,'OmniPay'),
        ('Orange Money','Mobile Money','Cote d''Ivoire',1000000,'OmniPay'),
        ('Wave','Mobile Money','Cote d''Ivoire',1000000,'OmniPay'),
        ('Mixx by Yas','Mobile Money','Senegal',1000000,'OmniPay'),
        ('Orange Money','Mobile Money','Senegal',1000000,'OmniPay'),
        ('Wave','Mobile Money','Senegal',1000000,'OmniPay'),
        ('Orange Money','Mobile Money','Mali',1000000,'OmniPay'),
        ('MTN Mobile Money','Mobile Money','Cameroun',1000000,'OmniPay'),
        ('Orange Money','Mobile Money','Cameroun',1000000,'OmniPay'),
        ('MTN Mobile Money','Mobile Money','Congo Brazzaville',1000000,'OmniPay'),
        ('Airtel Money','Mobile Money','Gabon',1000000,'OmniPay'),
        ('Moov Money','Mobile Money','Gabon',1000000,'OmniPay'),
        ('Orange Money','Mobile Money','Congo RDC',500000,'OmniPay'),
        ('M-Pesa','Mobile Money','Congo RDC',500000,'OmniPay'),
        ('MTN Mobile Money','Mobile Money','Guinee',1000000,'Mbiyo'),
        ('Orange Money','Mobile Money','Guinee',1000000,'Mbiyo'),
        ('Africell Money','Mobile Money','Gambie',1000000,'Mbiyo')
      ON CONFLICT (name, country) DO NOTHING
    `);

    // ── Mise à jour codes opérateurs ──────────────────────────────────────────────
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
      WHERE omnipay_code IS NULL;

      UPDATE withdrawal_operators SET gateway = 'Mbiyo'
      WHERE country IN ('Guinee', 'Gambie') AND gateway != 'Mbiyo';
    `);

    await client.query("COMMIT");

    // ── Auto-seed OxaPay (hors transaction pour éviter les problèmes de lock) ─────
    const oxapayKey = process.env.OXAPAY_API_KEY;
    if (oxapayKey) {
      const existing = await client.query(`SELECT id FROM crypto_aggregators WHERE type = 'oxapay' LIMIT 1`);
      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO crypto_aggregators (name, type, api_key, active) VALUES ($1, $2, $3, $4)`,
          ["OxaPay", "oxapay", oxapayKey, true]
        );
        console.log("[DB] Agrégateur OxaPay créé automatiquement");
      } else {
        await client.query(
          `UPDATE crypto_aggregators SET api_key = $1, active = true WHERE type = 'oxapay'`,
          [oxapayKey]
        );
        console.log("[DB] Agrégateur OxaPay mis à jour");
      }
    }

    console.log("[DB] Migrations appliquées avec succès");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[DB] Erreur migration:", err);
  } finally {
    client.release();
  }
}
