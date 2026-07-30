/**
 * Chemin d'accès admin — injecté par le serveur depuis process.env.ADMIN_SLUG.
 *
 * ⚠️  Aucune valeur n'est stockée dans ce fichier.
 *     Pour changer le slug : modifier la variable d'environnement ADMIN_SLUG
 *     sur le serveur (Plesk) et redémarrer l'application. Aucun rebuild requis.
 *
 * Le serveur injecte window.__ADMIN_PATH__ dans chaque réponse HTML.
 * Si l'injection échoue (Apache sert index.html en statique, bypassant Node.js),
 * App.tsx utilise POST /api/auth/admin/verify-path comme fallback sécurisé —
 * cet endpoint ne révèle jamais le slug, il répond uniquement { isAdminPath: bool }.
 */

declare global {
  interface Window {
    __ADMIN_PATH__?: string;
  }
}

const _injected =
  (typeof window !== "undefined" && window.__ADMIN_PATH__) ||
  "/__admin_not_configured__";

export const ADMIN_PATH: string = _injected;

/**
 * Objet mutable partagé entre toutes les pages admin.
 * Initialisé avec la valeur injectée ; mis à jour par App.tsx
 * quand le fallback /api/auth/admin/verify-path confirme le vrai chemin.
 */
export const adminConfig = {
  base: _injected,
};

/** Appelé par App.tsx une fois le chemin vérifié côté serveur. */
export function updateAdminBase(path: string) {
  adminConfig.base = path;
}

/** Alias rétrocompatible — égal à adminConfig.base au moment de l'import. */
export const ADMIN_BASE = _injected;
