/**
 * Chemin d'accès admin — valeur centralisée pour éviter la duplication.
 *
 * ⚠️  SÉCURITÉ : Ce chemin est une mesure d'obscurcissement (security by obscurity),
 * pas un mécanisme d'authentification. La vraie protection est le couple
 * mot de passe + TOTP obligatoire derrière ce chemin.
 *
 * Ce fichier est le seul endroit où la valeur est définie.
 * Pour changer le chemin après une rotation, modifiez uniquement cette constante.
 * Anciennes valeurs compromises — ne pas réutiliser :
 *   958425546648484886646634808526522886433
 *   2690ef5e8d3ab4fb952ecd6f1a0e28ad6f515941d1e916eb
 */
export const ADMIN_PATH = "/admin-access-jaimelargent95842554664848488664663480852652288643895cu";
export const ADMIN_BASE = ADMIN_PATH;
