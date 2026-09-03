import { useEffect, useState } from "react";
import { Loader2, Shield, XCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { getDeviceFingerprint } from "@/pages/merchant-login";

type ActivationState = "loading" | "denied";

export default function MerchantActivation() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [state, setState] = useState<ActivationState>("loading");

  useEffect(() => {
    let cancelled = false;
    const activate = async () => {
      const token = new URLSearchParams(window.location.search).get("token") || "";
      if (!token) {
        setState("denied");
        return;
      }

      try {
        const response = await fetch("/api/auth/merchant/activate", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-Device-FP": getDeviceFingerprint(),
          },
          body: JSON.stringify({ token }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.token || !data.user) {
          throw new Error("activation_denied");
        }
        if (cancelled) return;
        login(data.token, {
          id: data.user.id,
          email: data.user.email,
          role: "merchant",
          name: data.user.name,
          slug: data.user.slug,
        });
        window.history.replaceState({}, "", "/merchant/activate");
        setLocation(`/merchant/${data.user.slug}`);
      } catch {
        if (!cancelled) setState("denied");
      }
    };
    void activate();
    return () => { cancelled = true; };
  }, [login, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-5">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm border border-slate-200">
        {state === "loading" ? (
          <>
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600">
              <Loader2 className="h-7 w-7 animate-spin text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Activation sécurisée</h1>
            <p className="mt-2 text-sm text-slate-500">Vérification de votre appareil en cours…</p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100">
              <XCircle className="h-7 w-7 text-red-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Connexion non autorisée</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Ce lien est expiré, déjà utilisé ou ne correspond pas à l’appareil qui a demandé la connexion.
            </p>
            <button
              type="button"
              onClick={() => setLocation("/merchant/index/login")}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Shield className="h-4 w-4" />
              Retour à la connexion
            </button>
          </>
        )}
      </div>
    </div>
  );
}