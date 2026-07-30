/**
 * Chemin d'accès admin — slug jamais exposé dans le HTML ni dans aucune API.
 *
 * Mécanisme :
 *  1. Le serveur détecte si la requête entrante correspond au chemin admin.
 *  2. Si oui, il injecte window.__IS_ADMIN_PATH__ = true dans le HTML
 *     (uniquement un booléen — le slug n'apparaît jamais).
 *  3. Le client lit ce flag, prend l'URL courante comme chemin de base admin,
 *     et enregistre la route dans le routeur React.
 *  4. Si le flag est absent (Apache sert le HTML en statique, bypassant Node.js),
 *     App.tsx bascule en fallback : POST /api/auth/admin/verify-path
 *     qui répond uniquement { isAdminPath: true|false }.
 *
 * Pour changer le slug : modifier ADMIN_SLUG dans Plesk (env vars ou .env)
 * et redémarrer l'application. Aucun rebuild requis.
 */

declare global {
  interface Window {
    __IS_ADMIN_PATH__?: boolean;
  }
}

/** true si le serveur a confirmé que cette page est le chemin admin. */
const serverFlaggedAdmin =
  typeof window !== "undefined" && window.__IS_ADMIN_PATH__ === true;

/** Chemin de base déduit de l'URL courante si le serveur a posé le flag. */
const detectedAdminPath = serverFlaggedAdmin
  ? "/" + window.location.pathname.split("/").filter(Boolean)[0]
  : null;

/** Chemin admin initial — non nul si le serveur a confirmé le flag. */
export const ADMIN_PATH: string =
  detectedAdminPath ?? "/__admin_not_configured__";

/**
 * Objet mutable partagé entre toutes les pages admin.
 * Initialisé depuis le flag serveur ; mis à jour par App.tsx
 * si le fallback /api/auth/admin/verify-path est utilisé.
 */
export const adminConfig = {
  base: ADMIN_PATH,
};

/** Appelé par App.tsx une fois le chemin confirmé (fallback API). */
export function updateAdminBase(path: string) {
  adminConfig.base = path;
}

/** @deprecated Utiliser adminConfig.base dans les pages admin. */
export const ADMIN_BASE = ADMIN_PATH;
