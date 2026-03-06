import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Lang = "fr" | "en" | "pt";

export const LANGUAGES: { code: Lang; label: string; flag: string }[] = [
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "pt", label: "Português", flag: "🇵🇹" },
];

const translations: Record<Lang, Record<string, string>> = {
  fr: {
    overview: "Vue d'ensemble",
    transactions: "Transactions",
    transfers: "Virements",
    withdrawals: "Reversements",
    paymentlinks: "Liens de paiement",
    apikeys: "Clés API",
    webhook: "Webhook",
    settings: "Paramètres",
    navigation: "Navigation",
    merchantSpace: "Espace Marchand",
    notifications: "Notifications",
    messages: "Messages",
    help: "Aide",
    logout: "Déconnexion",
    language: "Langue",
    dashboard: "Tableau de bord",
    balance: "Solde",
    reversements: "Reversements",
    todayStats: "Statistique journalier",
    today: "Aujourd'hui",
    yesterday: "Hier",
    balanceByCountry: "Solde par pays",
    noTransactions: "Aucune transaction",
    search: "Rechercher",
    export: "Exporter",
    pending: "En attente",
    approved: "Approuvé",
    rejected: "Rejeté",
    loading: "Chargement...",
  },
  en: {
    overview: "Overview",
    transactions: "Transactions",
    transfers: "Transfers",
    withdrawals: "Withdrawals",
    paymentlinks: "Payment Links",
    apikeys: "API Keys",
    webhook: "Webhook",
    settings: "Settings",
    navigation: "Navigation",
    merchantSpace: "Merchant Space",
    notifications: "Notifications",
    messages: "Messages",
    help: "Help",
    logout: "Logout",
    language: "Language",
    dashboard: "Dashboard",
    balance: "Balance",
    reversements: "Withdrawals",
    todayStats: "Daily Statistics",
    today: "Today",
    yesterday: "Yesterday",
    balanceByCountry: "Balance by Country",
    noTransactions: "No transactions",
    search: "Search",
    export: "Export",
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    loading: "Loading...",
  },
  pt: {
    overview: "Visão geral",
    transactions: "Transações",
    transfers: "Transferências",
    withdrawals: "Retiradas",
    paymentlinks: "Links de pagamento",
    apikeys: "Chaves API",
    webhook: "Webhook",
    settings: "Configurações",
    navigation: "Navegação",
    merchantSpace: "Espaço do Comerciante",
    notifications: "Notificações",
    messages: "Mensagens",
    help: "Ajuda",
    logout: "Sair",
    language: "Idioma",
    dashboard: "Painel",
    balance: "Saldo",
    reversements: "Retiradas",
    todayStats: "Estatísticas diárias",
    today: "Hoje",
    yesterday: "Ontem",
    balanceByCountry: "Saldo por país",
    noTransactions: "Sem transações",
    search: "Pesquisar",
    export: "Exportar",
    pending: "Pendente",
    approved: "Aprovado",
    rejected: "Rejeitado",
    loading: "Carregando...",
  },
};

interface LanguageContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
  currentLanguage: { code: Lang; label: string; flag: string };
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem("westpay_lang");
    if (saved === "fr" || saved === "en" || saved === "pt") return saved;
    return "fr";
  });

  const setLang = (newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem("westpay_lang", newLang);
  };

  const t = (key: string): string => {
    return translations[lang][key] || translations["fr"][key] || key;
  };

  const currentLanguage = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, currentLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
