/**
 * Chemin d'accès admin — injecté par le serveur depuis process.env.ADMIN_SLUG.
 *
 * ⚠️  Aucune valeur n'est stockée dans ce fichier.
 *     Pour changer le slug : modifier la variable d'environnement ADMIN_SLUG
 *     sur le serveur (Plesk) et redémarrer l'application. Aucun rebuild requis.
 *
 * Le serveur injecte window.__ADMIN_PATH__ dans chaque réponse HTML.
 */

declare global {
  interface Window {
    __ADMIN_PATH__?: string;
  }
}

export const ADMIN_PATH: string =
  (typeof window !== "undefined" && window.__ADMIN_PATH__) || "/__admin_not_configured__";

export const ADMIN_BASE = ADMIN_PATH;
