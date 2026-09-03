import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

// ── Helpers ───────────────────────────────────────────────────────────────────
function sslFor(url: string) {
  const noSsl =
    url.includes("localhost") ||
    url.includes("127.0.0.1") ||
    url.includes("/var/run") ||
    url.includes("helium") ||          // Replit internal PostgreSQL host
    url.includes("sslmode=disable");
  return noSsl ? false : { rejectUnauthorized: false };
}
const POOL_CFG = { max: 10, connectionTimeoutMillis: 8000, idleTimeoutMillis: 30000, statement_timeout: 15000 };

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  BASE 1 — AUTH / CONFIG  →  Supabase  (AUTH_DATABASE_URL)                  ║
// ║  Tables : admins, merchants, merchant_pins, settings, numbers,              ║
// ║           allowed_ips, blocked_ips, blocked_devices, devices,              ║
// ║           admin_otp_codes, merchant_login_otps, merchant_login_activations,║
// ║           merchant_sessions, telegram_activation_codes,                   ║
// ║           withdrawal_operators, wallet_transfer_countries,                 ║
// ║           crypto_aggregators, crypto_aggregator_countries,                 ║
// ║           crypto_aggregator_merchants                                       ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
const authUrl = process.env.AUTH_DATABASE_URL;
if (!authUrl) throw new Error("AUTH_DATABASE_URL doit être défini");

export const authPool = new Pool({ connectionString: authUrl, ssl: sslFor(authUrl), ...POOL_CFG });
export const authDb   = drizzle(authPool);

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  BASE 2 — FINANCIER  →  Neon  (FINANCIAL_DATABASE_URL)                      ║
// ║  Tables : transactions, merchant_countries, withdrawals, pending_payments,  ║
// ║           wallet_transfers, payment_links, crypto_transactions,             ║
// ║           crypto_balances, crypto_withdrawal_requests,                      ║
// ║           crypto_payment_links, sms_logs, api_logs, webhook_logs,          ║
// ║           login_logs, security_logs, stats_baselines, knowledge_chunks      ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
const financialUrl = process.env.FINANCIAL_DATABASE_URL;
if (!financialUrl) throw new Error("FINANCIAL_DATABASE_URL doit être défini");

export const financialPool = new Pool({ connectionString: financialUrl, ssl: sslFor(financialUrl), ...POOL_CFG });
export const financialDb   = drizzle(financialPool);

// ── Compatibilité rétrograde (routes.ts, telegram-bot.ts, knowledge.ts) ────────
// db → authDb   (tables auth directement dans routes.ts : settings, admins)
// pool → authPool (allowed_ips, blocked_ips dans telegram-bot.ts)
export const db   = authDb;
export const pool = authPool;

// ── Chiffrement AES-256-GCM (clés API, webhookSecret, etc.) ──────────────────
const ENC_KEY = process.env.ENCRYPTION_KEY;
const ALGO = "aes-256-gcm" as const;

export function encrypt(text: string): string {
  if (!ENC_KEY || !text) return text;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto") as typeof import("crypto");
  const key    = Buffer.from(ENC_KEY, "hex");
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc    = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return `enc:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decrypt(text: string): string {
  if (!ENC_KEY || !text || !text.startsWith("enc:")) return text;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto   = require("crypto") as typeof import("crypto");
    const key      = Buffer.from(ENC_KEY, "hex");
    const parts    = text.split(":");
    const iv       = Buffer.from(parts[1], "hex");
    const tag      = Buffer.from(parts[2], "hex");
    const encBuf   = Buffer.from(parts[3], "hex");
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encBuf).toString("utf8") + decipher.final("utf8");
  } catch {
    return text; // graceful fallback — valeur stockée en clair
  }
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  MIGRATIONS BASE AUTH (Supabase)                                            ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
export async function runAuthMigrations() {
  const client = await authPool.connect();
  try {
    await client.query("BEGIN");

    // ── Tables principales ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id serial PRIMARY KEY,
        email text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        api_key text NOT NULL,
        totp_secret text,
        totp_enabled boolean NOT NULL DEFAULT false,
        token_invalidated_at timestamp,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS merchants (
        id serial PRIMARY KEY,
        name text NOT NULL,
        email text NOT NULL UNIQUE,
        slug text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        suspended boolean NOT NULL DEFAULT false,
        fee_exempt boolean NOT NULL DEFAULT false,
        webhook_url text,
        webhook_secret text,
        telegram_chat_id text,
        telegram_bot_language text NOT NULL DEFAULT 'fr',
        withdrawal_mode text NOT NULL DEFAULT 'manual',
        website text,
        crypto_api_key text,
        sdk_enabled boolean NOT NULL DEFAULT false,
        sdk_api_key text,
        payin_disabled boolean NOT NULL DEFAULT false,
        withdrawals_disabled boolean NOT NULL DEFAULT false,
        custom_fee_rate real,
        token_invalidated_at timestamp,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS merchant_pins (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE UNIQUE,
        pin_hash text NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        id serial PRIMARY KEY,
        key text NOT NULL UNIQUE,
        value text NOT NULL
      );

      CREATE TABLE IF NOT EXISTS numbers (
        id serial PRIMARY KEY,
        phone_number text NOT NULL,
        country text NOT NULL,
        operator text,
        status text NOT NULL DEFAULT 'active',
        merchant_id integer REFERENCES merchants(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS allowed_ips (
        id serial PRIMARY KEY,
        ip_address text NOT NULL UNIQUE,
        user_email text,
        role text,
        country text,
        city text,
        note text,
        created_by text,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS blocked_ips (
        id serial PRIMARY KEY,
        ip_address text NOT NULL UNIQUE,
        country text,
        city text,
        reason text,
        blocked_by text,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS blocked_devices (
        id serial PRIMARY KEY,
        fingerprint text NOT NULL UNIQUE,
        ip_address text,
        user_agent text,
        reason text,
        blocked_by text,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS devices (
        id serial PRIMARY KEY,
        user_id integer NOT NULL,
        user_role text NOT NULL DEFAULT 'admin',
        device_id text NOT NULL,
        browser text,
        os text,
        country text,
        city text,
        ip_address text,
        is_trusted boolean NOT NULL DEFAULT false,
        created_at timestamp DEFAULT now() NOT NULL,
        last_seen timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_otp_codes (
        id serial PRIMARY KEY,
        email text NOT NULL,
        code text NOT NULL,
        expires_at timestamp NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS merchant_login_otps (
        id serial PRIMARY KEY,
        email text NOT NULL,
        otp_hash text NOT NULL,
        temp_token text NOT NULL,
        expires_at timestamp NOT NULL,
        used boolean DEFAULT false NOT NULL,
        attempts integer DEFAULT 0 NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS merchant_login_activations (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        token_hash text NOT NULL UNIQUE,
        ip_address text NOT NULL,
        device_hash text NOT NULL,
        expires_at timestamp NOT NULL,
        used_at timestamp,
        created_at timestamp DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS merchant_login_activations_merchant_idx
        ON merchant_login_activations (merchant_id);

      CREATE TABLE IF NOT EXISTS merchant_sessions (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        session_hash text NOT NULL UNIQUE,
        device_hash text NOT NULL,
        expires_at timestamp NOT NULL,
        revoked_at timestamp,
        created_at timestamp DEFAULT now() NOT NULL,
        last_seen_at timestamp DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS merchant_sessions_merchant_idx
        ON merchant_sessions (merchant_id);

      CREATE TABLE IF NOT EXISTS telegram_activation_codes (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        code text NOT NULL UNIQUE,
        used boolean NOT NULL DEFAULT false,
        expires_at timestamp NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS withdrawal_operators (
        id serial PRIMARY KEY,
        name text NOT NULL,
        type text NOT NULL DEFAULT 'Mobile Money',
        country text NOT NULL,
        daily_limit integer NOT NULL DEFAULT 1000000,
        gateway text NOT NULL DEFAULT 'OmniPay',
        omnipay_code text,
        mbiyo_code text,
        seapay_code text,
        clapay_code text,
        logo text,
        sort_order integer NOT NULL DEFAULT 0,
        active boolean NOT NULL DEFAULT true,
        maintenance_all boolean NOT NULL DEFAULT false,
        maintenance_deposits boolean NOT NULL DEFAULT false,
        maintenance_withdrawals boolean NOT NULL DEFAULT false,
        maintenance_payment_links boolean NOT NULL DEFAULT false,
        maintenance_api_payment boolean NOT NULL DEFAULT false,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS wallet_transfer_countries (
        id serial PRIMARY KEY,
        country text NOT NULL UNIQUE,
        currency_zone text NOT NULL,
        active boolean NOT NULL DEFAULT true,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS crypto_aggregators (
        id serial PRIMARY KEY,
        name text NOT NULL,
        type text NOT NULL DEFAULT 'oxapay',
        api_key text NOT NULL,
        payout_api_key text,
        callback_key text,
        active boolean NOT NULL DEFAULT false,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS crypto_aggregator_countries (
        id serial PRIMARY KEY,
        aggregator_id integer NOT NULL REFERENCES crypto_aggregators(id) ON DELETE CASCADE,
        country text NOT NULL,
        active boolean NOT NULL DEFAULT false
      );

      CREATE TABLE IF NOT EXISTS crypto_aggregator_merchants (
        id serial PRIMARY KEY,
        aggregator_id integer NOT NULL REFERENCES crypto_aggregators(id) ON DELETE CASCADE,
        merchant_id integer NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        active boolean NOT NULL DEFAULT true
      );
    `);

    // ── Index & contraintes ──────────────────────────────────────────────────
    // ── Colonnes ajoutées après déploiement initial ──────────────────────────
    await client.query(`
      ALTER TABLE merchants ADD COLUMN IF NOT EXISTS custom_fee_rate REAL;
      ALTER TABLE merchants ADD COLUMN IF NOT EXISTS payin_disabled BOOLEAN NOT NULL DEFAULT false;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS merchants_crypto_api_key_idx ON merchants(crypto_api_key) WHERE crypto_api_key IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS merchants_sdk_api_key_idx ON merchants(sdk_api_key) WHERE sdk_api_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS merchant_login_otps_email_idx ON merchant_login_otps(email);
    `);
    await client.query(`
      DELETE FROM withdrawal_operators a USING withdrawal_operators b
      WHERE a.id > b.id AND a.name = b.name AND a.country = b.country;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_operators_name_country_idx ON withdrawal_operators(name, country);
    `);

    // ── Données initiales ────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO wallet_transfer_countries (country, currency_zone) VALUES
        ('Benin','XOF'),('Burkina Faso','XOF'),('Cote d''Ivoire','XOF'),('Mali','XOF'),
        ('Senegal','XOF'),('Togo','XOF'),('Niger','XOF'),('Guinee-Bissau','XOF'),
        ('Cameroun','XAF'),('Congo Brazzaville','XAF'),('Gabon','XAF'),('Tchad','XAF'),
        ('Centrafrique','XAF'),('Guinee Equatoriale','XAF'),
        ('Congo RDC','CDF'),('Guinee','GNF'),('Gambie','GMD')
      ON CONFLICT (country) DO NOTHING
    `);

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
      END WHERE omnipay_code IS NULL;
      UPDATE withdrawal_operators SET gateway = 'Mbiyo'
        WHERE country IN ('Guinee', 'Gambie') AND gateway != 'Mbiyo';
      UPDATE withdrawal_operators SET gateway = 'SendavaPay'
        WHERE country IN ('Togo', 'Cote d''Ivoire') AND gateway = 'OmniPay';
    `);

    await client.query("COMMIT");

    // OxaPay (hors transaction)
    const oxapayKey = process.env.OXAPAY_API_KEY;
    if (oxapayKey) {
      const ex = await client.query(`SELECT id FROM crypto_aggregators WHERE type='oxapay' LIMIT 1`);
      if (ex.rows.length === 0) {
        await client.query(`INSERT INTO crypto_aggregators (name,type,api_key,active) VALUES ($1,$2,$3,$4)`, ["OxaPay","oxapay",oxapayKey,true]);
        console.log("[AUTH DB] Agrégateur OxaPay créé");
      } else {
        await client.query(`UPDATE crypto_aggregators SET api_key=$1, active=true WHERE type='oxapay'`, [oxapayKey]);
      }
    }

    console.log("[AUTH DB] Migrations appliquées ✓");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[AUTH DB] Erreur migration:", err);
    throw err;
  } finally {
    client.release();
  }
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  MIGRATIONS BASE FINANCIER (Neon)                                           ║
// ║  Note : pas de FK cross-BD — merchant_id = integer simple                  ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
export async function runFinancialMigrations() {
  const client = await financialPool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS merchant_countries (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL,
        country text NOT NULL,
        api_key text NOT NULL,
        balance integer NOT NULL DEFAULT 0,
        active boolean NOT NULL DEFAULT true,
        omnipay_enabled boolean NOT NULL DEFAULT false,
        payin_gateway text NOT NULL DEFAULT 'omnipay',
        admin_credits_total integer NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL,
        country text NOT NULL,
        tx_id text NOT NULL UNIQUE,
        amount integer NOT NULL,
        payer_number text,
        payer_name text,
        status text NOT NULL DEFAULT 'confirmed',
        provider text NOT NULL DEFAULT 'sms',
        omnipay_tx_id text,
        operator text,
        omnipay_reference text,
        error_message text,
        provider_fee integer,
        merchant_country_id integer,
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

      CREATE TABLE IF NOT EXISTS login_logs (
        id serial PRIMARY KEY,
        user_id integer NOT NULL,
        role text NOT NULL,
        ip text,
        device text,
        success boolean NOT NULL DEFAULT true,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS api_logs (
        id serial PRIMARY KEY,
        merchant_id integer,
        action text NOT NULL,
        ip text,
        description text,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pending_payments (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL,
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
        gateway text NOT NULL DEFAULT 'omnipay',
        error_message text,
        payment_token text,
        sendava_token text,
        sendava_payment_url text,
        expires_at timestamp NOT NULL,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS webhook_logs (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL,
        url text NOT NULL,
        payload text NOT NULL,
        status_code integer,
        response text,
        success boolean NOT NULL DEFAULT false,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payment_links (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL,
        unique_id text NOT NULL UNIQUE,
        name text NOT NULL,
         bank text NOT NULL DEFAULT 'bank1',
        description text,
        amount_type text NOT NULL DEFAULT 'fixed',
        amount integer,
        redirect_url text,
        expires_at timestamp,
        payment_limit integer,
        payment_count integer NOT NULL DEFAULT 0,
        total_revenue integer NOT NULL DEFAULT 0,
        last_payment_at timestamp,
        active boolean NOT NULL DEFAULT true,
        created_at timestamp DEFAULT now() NOT NULL,
        countries text[],
        confirmation_message text,
        collect_billing_address boolean NOT NULL DEFAULT false,
        show_share_button boolean NOT NULL DEFAULT true,
        notification_email text
      );

      CREATE TABLE IF NOT EXISTS withdrawals (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL,
        merchant_country_id integer NOT NULL,
        country text NOT NULL,
        amount integer NOT NULL,
        phone text NOT NULL,
        recipient_name text,
        operator text,
        status text NOT NULL DEFAULT 'pending',
        withdrawal_mode text NOT NULL DEFAULT 'manual',
        admin_note text,
        omnipay_ref text,
        fees integer DEFAULT 0,
        provider_payout_fee integer,
        gateway text NOT NULL DEFAULT 'omnipay',
         provider_tx_id text,
        created_at timestamp DEFAULT now() NOT NULL,
        processed_at timestamp
      );

      CREATE TABLE IF NOT EXISTS wallet_transfers (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL,
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

      CREATE TABLE IF NOT EXISTS crypto_transactions (
        id serial PRIMARY KEY,
        aggregator_id integer NOT NULL,
        merchant_id integer NOT NULL,
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
        merchant_id integer NOT NULL,
        currency text NOT NULL,
        balance text NOT NULL DEFAULT '0',
        updated_at timestamp DEFAULT now() NOT NULL,
        UNIQUE(merchant_id, currency)
      );

      CREATE TABLE IF NOT EXISTS crypto_withdrawal_requests (
        id serial PRIMARY KEY,
        merchant_id integer NOT NULL,
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
        merchant_id integer NOT NULL,
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

      CREATE TABLE IF NOT EXISTS security_logs (
        id serial PRIMARY KEY,
        event_type text NOT NULL,
        user_email text,
        ip text,
        fingerprint text,
        action text,
        details text,
        telegram_admin text,
        created_at timestamp DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS stats_baselines (
        id serial PRIMARY KEY,
        reset_at timestamp DEFAULT now() NOT NULL,
        transaction_count integer NOT NULL DEFAULT 0,
        total_volume integer NOT NULL DEFAULT 0,
        commission_total integer NOT NULL DEFAULT 0,
        api_payments_count integer NOT NULL DEFAULT 0,
        api_payments_total integer NOT NULL DEFAULT 0,
        link_payments_count integer NOT NULL DEFAULT 0,
        link_payments_total integer NOT NULL DEFAULT 0,
        withdrawals_count integer NOT NULL DEFAULT 0,
        withdrawals_total integer NOT NULL DEFAULT 0
      );
    `);

      // Compatibilité avec les bases qui possèdent déjà la table payment_links.
      await client.query(`
        ALTER TABLE payment_links
        ADD COLUMN IF NOT EXISTS bank text NOT NULL DEFAULT 'bank1';
      `);
      await client.query(`
        ALTER TABLE withdrawals
        ADD COLUMN IF NOT EXISTS provider_tx_id text;
      `);

    // pgvector (knowledge_chunks — RAG)
    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS knowledge_chunks (
          id serial PRIMARY KEY,
          category text NOT NULL,
          title text NOT NULL,
          content text NOT NULL,
          embedding vector(1536),
          active boolean NOT NULL DEFAULT true,
          updated_at timestamp DEFAULT now() NOT NULL
        );
      `);
    } catch (e: any) {
      console.log("[FINANCIAL DB] pgvector non disponible:", e.message);
    }

    // Corriger default provider_payout_fee
    await client.query(`ALTER TABLE withdrawals ALTER COLUMN provider_payout_fee DROP DEFAULT;`).catch(() => {});

    await client.query("COMMIT");
    console.log("[FINANCIAL DB] Migrations appliquées ✓");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[FINANCIAL DB] Erreur migration:", err);
    throw err;
  } finally {
    client.release();
  }
}

// ── Point d'entrée unique ────────────────────────────────────────────────────
export async function runMigrations() {
  await Promise.all([runAuthMigrations(), runFinancialMigrations()]);
}
