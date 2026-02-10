# WestPay - Private Payment Aggregator Platform

## Overview
WestPay is a private Mobile Money payment aggregation platform with admin and merchant dashboards. No public registration - admin creates all merchant accounts.

## Architecture
- **Frontend**: React + Tailwind CSS + shadcn/ui (dark theme by default)
- **Backend**: Express.js with JWT authentication
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: JWT tokens stored in localStorage

## Key URLs
- `/` - Restricted access page (public)
- `/admin-access-9584` - Admin login (hidden)
- `/admin-access-9584/dashboard` - Admin dashboard
- `/merchant-login` - Merchant login
- `/merchant/:slug` - Merchant dashboard

## Default Credentials (Seeded)
- **Admin**: admin@westpay.com / Admin@2026!
- **Merchant (EcoMat)**: contact@ecomat.com / Merchant@2026!
- **Merchant (PayFast)**: info@payfast.bj / Merchant@2026!

## API Structure
- `/api/auth/admin/login` - Admin authentication
- `/api/auth/merchant/login` - Merchant authentication
- `/api/admin/*` - Admin endpoints (JWT required)
- `/api/merchant/*` - Merchant endpoints (JWT required)
- `/sms/receive` - SMS webhook for Android SMS Forwarder

## Database Tables
admins, merchants, merchant_countries, transactions, sms_logs, numbers, settings, login_logs

## SMS Payment Flow
1. Android phone receives Mobile Money SMS
2. SMS Forwarder app sends to `/sms/receive`
3. System parses TX ID, amount, payer number
4. Matches SIM to merchant via `numbers` table
5. Credits merchant balance and records transaction

## Phone Numbers (Togo)
- Moov Money: +22899935673
- TMoney: +22892299772
