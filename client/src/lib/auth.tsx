import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface AuthUser {
  id: number;
  email: string;
  role: "admin" | "merchant";
  name?: string;
  slug?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;        // en mémoire uniquement — jamais dans localStorage
  login: (token: string, user: AuthUser) => void;
  restoreUser: (user: AuthUser) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);  // session uniquement
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // ── Sécurité : effacer tout ancien JWT stocké dans localStorage ────────
    // Correctif XSS : les tokens JWT ne doivent plus être accessibles au JS.
    // Ils sont désormais stockés dans un cookie httpOnly côté serveur.
    localStorage.removeItem("westpay_token");

    // Récupérer uniquement les infos affichage (pas sensibles)
    const savedUser = localStorage.getItem("westpay_user");
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem("westpay_user");
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback((newToken: string, newUser: AuthUser) => {
    // Stocker le token en mémoire React seulement (perdu au refresh — le cookie prend le relai)
    setToken(newToken);
    setUser(newUser);
    // Stocker uniquement les infos d'affichage non sensibles
    localStorage.setItem("westpay_user", JSON.stringify(newUser));
    // NE PLUS stocker le token JWT dans localStorage (protection XSS)
  }, []);

  const restoreUser = useCallback((restoredUser: AuthUser) => {
    // Après un rechargement, le JWT reste uniquement dans le cookie httpOnly.
    // Cette méthode restaure les seules informations d'affichage renvoyées
    // par le serveur, sans créer ni stocker de token côté navigateur.
    setUser(restoredUser);
    localStorage.setItem("westpay_user", JSON.stringify(restoredUser));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("westpay_user");
    // Effacer le cookie httpOnly côté serveur
    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, restoreUser, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

/**
 * Wrapper fetch authentifié.
 * - Ajoute credentials: "include" pour envoyer le cookie httpOnly automatiquement.
 * - Ajoute le header Authorization: Bearer si un token en mémoire est disponible
 *   (compatibilité avec les clients API externes et la session courante).
 */
export function authFetch(token: string | null) {
  return (url: string, options: RequestInit = {}) => {
    return fetch(url, {
      ...options,
      credentials: "include",   // envoie le cookie httpOnly wp_auth
      headers: {
        ...options.headers,
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  };
}
