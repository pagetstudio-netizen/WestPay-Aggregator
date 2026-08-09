/**
 * Configuration dynamique des taux de frais
 * Chargée depuis la DB au démarrage et rechargée après chaque modification admin.
 * Remplace les constantes hardcodées de routes.ts et reconciliation.ts.
 */

import { storage } from "./storage";

// ── Overrides FIXES (prestataires spéciaux — SeaPay) ─────────────────────────
// Ces pays ont des coûts réseau très différents. Non éditables depuis l'UI admin.
const FIXED_COUNTRY_OVERRIDES: Record<string, { payin: number; payout: number }> = {
  "India":       { payin: 15, payout: 5 },
  "Pakistan":    { payin: 15, payout: 5 },
  "Nigeria":     { payin: 15, payout: 5 },
  "Philippines": { payin: 15, payout: 5 },
};

// Frais fixes supplémentaires en devise locale (prélevés en plus du %)
export const FLAT_PAYIN_FEE: Record<string, number> = {
  "India": 10,  // 10 INR flat fee (SeaPay)
};

// ── Valeurs par défaut ────────────────────────────────────────────────────────
export const DEFAULT_PAYIN_RATE  = 6.6;   // % pour Afrique Ouest + Centrale
export const DEFAULT_PAYOUT_RATE = 5.5;   // %

// Pays ClaPay avec taux propre (isolés monétairement)
const DEFAULT_COUNTRY_OVERRIDES: Record<string, { payin: number; payout: number }> = {
  "Niger": { payin: 6, payout: 6 },
  "Kenya": { payin: 6, payout: 6 },
  "Ghana": { payin: 6, payout: 6 },
};

// ── État dynamique (rechargé depuis la DB) ────────────────────────────────────
let _payinRate  = DEFAULT_PAYIN_RATE;
let _payoutRate = DEFAULT_PAYOUT_RATE;
let _countryOverrides: Record<string, { payin: number; payout: number }> = {
  ...DEFAULT_COUNTRY_OVERRIDES,
};

/**
 * Charge (ou recharge) les taux depuis la DB.
 * Initialise les valeurs par défaut si absent.
 * À appeler au démarrage du serveur et après chaque modification admin.
 */
export async function loadFeeConfig(): Promise<void> {
  try {
    const [payin, payout, overJson, wtFeeVal] = await Promise.all([
      storage.getSetting("payin_fee_rate"),
      storage.getSetting("payout_fee_rate"),
      storage.getSetting("country_fee_overrides"),
      storage.getSetting("wallet_transfer_fee_value"),
    ]);

    // Seeding : écrire les defaults si absent (premier démarrage)
    const seeds: Promise<void>[] = [];
    if (!payin)    seeds.push(storage.setSetting("payin_fee_rate",         String(DEFAULT_PAYIN_RATE)));
    if (!payout)   seeds.push(storage.setSetting("payout_fee_rate",        String(DEFAULT_PAYOUT_RATE)));
    if (!overJson) seeds.push(storage.setSetting("country_fee_overrides",  JSON.stringify(DEFAULT_COUNTRY_OVERRIDES)));
    if (!wtFeeVal) seeds.push(storage.setSetting("wallet_transfer_fee_value", "4.5"));
    if (!wtFeeVal) seeds.push(storage.setSetting("wallet_transfer_fee_type",  "percentage"));
    if (seeds.length > 0) await Promise.all(seeds);

    _payinRate  = payin  ? (parseFloat(payin)  || DEFAULT_PAYIN_RATE)  : DEFAULT_PAYIN_RATE;
    _payoutRate = payout ? (parseFloat(payout) || DEFAULT_PAYOUT_RATE) : DEFAULT_PAYOUT_RATE;
    if (overJson) {
      try { _countryOverrides = JSON.parse(overJson); } catch { /* garder ancien */ }
    }

    console.log(`[FEE CONFIG] Chargé — Payin=${_payinRate}% Payout=${_payoutRate}% Overrides=[${Object.keys(_countryOverrides).join(",")}]`);
  } catch (e: any) {
    console.error("[FEE CONFIG] Erreur chargement:", e.message);
  }
}

/**
 * Persiste les taux en DB et met à jour l'état en mémoire.
 */
export async function saveFeeConfig(
  payin: number,
  payout: number,
  overrides: Record<string, { payin: number; payout: number }>
): Promise<void> {
  await Promise.all([
    storage.setSetting("payin_fee_rate",        String(payin)),
    storage.setSetting("payout_fee_rate",       String(payout)),
    storage.setSetting("country_fee_overrides", JSON.stringify(overrides)),
  ]);
  _payinRate       = payin;
  _payoutRate      = payout;
  _countryOverrides = overrides;
}

/** Snapshot des taux actuels (pour l'API admin). */
export function getFeeSnapshot() {
  return {
    payinRate:      _payinRate,
    payoutRate:     _payoutRate,
    countryOverrides: _countryOverrides,
    fixedOverrides: FIXED_COUNTRY_OVERRIDES,
  };
}

/** Taux payin en décimal (ex: 0.066 pour 6.6%). */
export function getCollectionFeeRate(country?: string | null): number {
  if (country && FIXED_COUNTRY_OVERRIDES[country]) return FIXED_COUNTRY_OVERRIDES[country].payin / 100;
  if (country && _countryOverrides[country] !== undefined) return _countryOverrides[country].payin / 100;
  return _payinRate / 100;
}

/** Taux payout en décimal (ex: 0.055 pour 5.5%). */
export function getWithdrawalFeeRate(country?: string | null): number {
  if (country && FIXED_COUNTRY_OVERRIDES[country]) return FIXED_COUNTRY_OVERRIDES[country].payout / 100;
  if (country && _countryOverrides[country] !== undefined) return _countryOverrides[country].payout / 100;
  return _payoutRate / 100;
}

/** Crédit net marchand après déduction des frais payin. */
export function calcMerchantCredit(grossAmount: number, country?: string | null): number {
  const flatFee = country && FLAT_PAYIN_FEE[country] ? FLAT_PAYIN_FEE[country] : 0;
  return Math.max(0, Math.floor(grossAmount * (1 - getCollectionFeeRate(country)) - flatFee));
}
