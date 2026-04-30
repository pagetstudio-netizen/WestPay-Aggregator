CREATE TABLE "admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"api_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "api_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer,
	"action" text NOT NULL,
	"ip" text,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crypto_aggregator_countries" (
	"id" serial PRIMARY KEY NOT NULL,
	"aggregator_id" integer NOT NULL,
	"country" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crypto_aggregator_merchants" (
	"id" serial PRIMARY KEY NOT NULL,
	"aggregator_id" integer NOT NULL,
	"merchant_id" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crypto_aggregators" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'oxapay' NOT NULL,
	"api_key" text NOT NULL,
	"payout_api_key" text,
	"callback_key" text,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crypto_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer NOT NULL,
	"currency" text NOT NULL,
	"balance" text DEFAULT '0' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crypto_payment_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer NOT NULL,
	"unique_id" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"amount_type" text DEFAULT 'fixed' NOT NULL,
	"amount" text,
	"description" text,
	"return_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crypto_payment_links_unique_id_unique" UNIQUE("unique_id")
);
--> statement-breakpoint
CREATE TABLE "crypto_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"aggregator_id" integer NOT NULL,
	"merchant_id" integer NOT NULL,
	"track_id" text NOT NULL,
	"amount" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"pay_currency" text,
	"pay_amount" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"wallet_address" text,
	"network" text,
	"tx_hash" text,
	"order_id" text,
	"description" text,
	"callback_url" text,
	"return_url" text,
	"credited_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crypto_transactions_track_id_unique" UNIQUE("track_id")
);
--> statement-breakpoint
CREATE TABLE "crypto_withdrawal_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer NOT NULL,
	"currency" text NOT NULL,
	"amount" text NOT NULL,
	"fee_amount" text DEFAULT '0' NOT NULL,
	"net_amount" text DEFAULT '0' NOT NULL,
	"wallet_address" text NOT NULL,
	"network" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"role" text NOT NULL,
	"ip" text,
	"device" text,
	"success" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_countries" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer NOT NULL,
	"country" text NOT NULL,
	"api_key" text NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"omnipay_enabled" boolean DEFAULT false NOT NULL,
	"payin_gateway" text DEFAULT 'omnipay' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_pins" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer NOT NULL,
	"pin_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_pins_merchant_id_unique" UNIQUE("merchant_id")
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"slug" text NOT NULL,
	"password_hash" text NOT NULL,
	"suspended" boolean DEFAULT false NOT NULL,
	"fee_exempt" boolean DEFAULT false NOT NULL,
	"webhook_url" text,
	"webhook_secret" text,
	"telegram_chat_id" text,
	"telegram_bot_language" text DEFAULT 'fr' NOT NULL,
	"withdrawal_mode" text DEFAULT 'manual' NOT NULL,
	"website" text,
	"crypto_api_key" text,
	"sdk_enabled" boolean DEFAULT false NOT NULL,
	"sdk_api_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "merchants_email_unique" UNIQUE("email"),
	CONSTRAINT "merchants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "numbers" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone_number" text NOT NULL,
	"country" text NOT NULL,
	"operator" text,
	"status" text DEFAULT 'active' NOT NULL,
	"merchant_id" integer
);
--> statement-breakpoint
CREATE TABLE "payment_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer NOT NULL,
	"unique_id" text NOT NULL,
	"name" text NOT NULL,
	"amount_type" text DEFAULT 'fixed' NOT NULL,
	"amount" integer,
	"redirect_url" text,
	"expires_at" timestamp,
	"payment_limit" integer,
	"payment_count" integer DEFAULT 0 NOT NULL,
	"total_revenue" integer DEFAULT 0 NOT NULL,
	"last_payment_at" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_links_unique_id_unique" UNIQUE("unique_id")
);
--> statement-breakpoint
CREATE TABLE "pending_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer NOT NULL,
	"country" text NOT NULL,
	"amount" integer NOT NULL,
	"payer_phone" text,
	"payer_name" text,
	"payment_method" text NOT NULL,
	"tx_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"redirect_url" text,
	"omnipay_reference" text,
	"omnipay_tx_id" text,
	"omnipay_payment_url" text,
	"gateway" text DEFAULT 'omnipay' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "sms_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_sim" text NOT NULL,
	"sms_text" text NOT NULL,
	"parsed" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"parsed_amount" integer,
	"parsed_tx_id" text,
	"parsed_payer" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stats_baselines" (
	"id" serial PRIMARY KEY NOT NULL,
	"reset_at" timestamp DEFAULT now() NOT NULL,
	"transaction_count" integer DEFAULT 0 NOT NULL,
	"total_volume" integer DEFAULT 0 NOT NULL,
	"commission_total" integer DEFAULT 0 NOT NULL,
	"api_payments_count" integer DEFAULT 0 NOT NULL,
	"api_payments_total" integer DEFAULT 0 NOT NULL,
	"link_payments_count" integer DEFAULT 0 NOT NULL,
	"link_payments_total" integer DEFAULT 0 NOT NULL,
	"withdrawals_count" integer DEFAULT 0 NOT NULL,
	"withdrawals_total" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_activation_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer NOT NULL,
	"code" text NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_activation_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer NOT NULL,
	"country" text NOT NULL,
	"tx_id" text NOT NULL,
	"amount" integer NOT NULL,
	"payer_number" text,
	"payer_name" text,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"provider" text DEFAULT 'sms' NOT NULL,
	"omnipay_tx_id" text,
	"operator" text,
	"omnipay_reference" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_tx_id_unique" UNIQUE("tx_id")
);
--> statement-breakpoint
CREATE TABLE "wallet_transfer_countries" (
	"id" serial PRIMARY KEY NOT NULL,
	"country" text NOT NULL,
	"currency_zone" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_transfer_countries_country_unique" UNIQUE("country")
);
--> statement-breakpoint
CREATE TABLE "wallet_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer NOT NULL,
	"from_country_id" integer NOT NULL,
	"to_country_id" integer NOT NULL,
	"from_country" text NOT NULL,
	"to_country" text NOT NULL,
	"currency" text NOT NULL,
	"amount" integer NOT NULL,
	"fee" integer DEFAULT 0 NOT NULL,
	"net_amount" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "webhook_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer NOT NULL,
	"url" text NOT NULL,
	"payload" text NOT NULL,
	"status_code" integer,
	"response" text,
	"success" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withdrawal_operators" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'Mobile Money' NOT NULL,
	"country" text NOT NULL,
	"daily_limit" integer DEFAULT 1000000 NOT NULL,
	"gateway" text DEFAULT 'OmniPay' NOT NULL,
	"omnipay_code" text,
	"mbiyo_code" text,
	"active" boolean DEFAULT true NOT NULL,
	"maintenance_all" boolean DEFAULT false NOT NULL,
	"maintenance_deposits" boolean DEFAULT false NOT NULL,
	"maintenance_withdrawals" boolean DEFAULT false NOT NULL,
	"maintenance_payment_links" boolean DEFAULT false NOT NULL,
	"maintenance_api_payment" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer NOT NULL,
	"merchant_country_id" integer NOT NULL,
	"country" text NOT NULL,
	"amount" integer NOT NULL,
	"phone" text NOT NULL,
	"operator" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"withdrawal_mode" text DEFAULT 'manual' NOT NULL,
	"admin_note" text,
	"omnipay_ref" text,
	"fees" integer DEFAULT 0,
	"gateway" text DEFAULT 'omnipay' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "api_logs" ADD CONSTRAINT "api_logs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_aggregator_countries" ADD CONSTRAINT "crypto_aggregator_countries_aggregator_id_crypto_aggregators_id_fk" FOREIGN KEY ("aggregator_id") REFERENCES "public"."crypto_aggregators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_aggregator_merchants" ADD CONSTRAINT "crypto_aggregator_merchants_aggregator_id_crypto_aggregators_id_fk" FOREIGN KEY ("aggregator_id") REFERENCES "public"."crypto_aggregators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_aggregator_merchants" ADD CONSTRAINT "crypto_aggregator_merchants_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_balances" ADD CONSTRAINT "crypto_balances_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_payment_links" ADD CONSTRAINT "crypto_payment_links_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_transactions" ADD CONSTRAINT "crypto_transactions_aggregator_id_crypto_aggregators_id_fk" FOREIGN KEY ("aggregator_id") REFERENCES "public"."crypto_aggregators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_transactions" ADD CONSTRAINT "crypto_transactions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_withdrawal_requests" ADD CONSTRAINT "crypto_withdrawal_requests_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_countries" ADD CONSTRAINT "merchant_countries_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_pins" ADD CONSTRAINT "merchant_pins_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numbers" ADD CONSTRAINT "numbers_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_payments" ADD CONSTRAINT "pending_payments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_activation_codes" ADD CONSTRAINT "telegram_activation_codes_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transfers" ADD CONSTRAINT "wallet_transfers_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;