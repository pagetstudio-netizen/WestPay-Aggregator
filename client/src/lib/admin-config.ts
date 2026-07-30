/**
 * Chemin d'accès admin — jamais exposé dans le HTML.
 *
 * Le slug n'est PAS injecté dans window.__ADMIN_PATH__ ni dans aucune
 * réponse HTTP publique. Le client vérifie le chemin via l'endpoint
 * POST /api/auth/admin/verify-path qui répond uniquement { isAdminPath: bool }
 * sans jamais révéler le slug.
 *
 * Pour changer le slug : modifier ADMIN_SLUG dans les variables d'environnement
 * Plesk (ou fichier .env) et redémarrer l'application. Aucun rebuild requis.
 */

declare global {
  interface Window {
    __ADMIN_PATH__?: string; // conservé pour rétrocompatibilité, jamais rempli
  }
}

/** Toujours non configuré au chargement — App.tsx fait la vérification via API. */
export const ADMIN_PATH = "/__admin_not_configured__";

/**
 * Objet mutable partagé entre toutes les pages admin.
 * Mis à jour par App.tsx une fois que le serveur a confirmé le vrai chemin.
 */
export const adminConfig = {
  base: "/__admin_not_configured__",
};

/** Appelé par App.tsx une fois le chemin vérifié côté serveur. */
export function updateAdminBase(path: string) {
  adminConfig.base = path;
}

/** @deprecated Utiliser adminConfig.base dans les pages admin. */
export const ADMIN_BASE = "/__admin_not_configured__";
