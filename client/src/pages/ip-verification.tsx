import { useState, useEffect } from "react";
import { Shield, Copy, CheckCircle, Loader2, Lock, Wifi, RefreshCw } from "lucide-react";

export default function IpVerificationPage() {
  const [ip, setIp] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(true);
  const [polling, setPolling] = useState(false);
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    fetch("/api/auth/my-ip")
      .then((r) => r.json())
      .then((d) => {
        setIp(d.ip || "Unknown");
        setChecking(false);
      })
      .catch(() => {
        setIp("Not detected");
        setChecking(false);
      });
  }, []);

  // Auto-poll every 30 seconds to check if IP has been authorized
  useEffect(() => {
    const checkAccess = async () => {
      setPolling(true);
      try {
        const res = await fetch("/api/auth/check-ip");
        const data = await res.json();
        if (data.allowed) {
          window.location.href = "/merchant-login";
          return;
        }
      } catch {}
      setPolling(false);
      setCountdown(30);
    };

    const tick = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          checkAccess();
          return 30;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(tick);
  }, []);

  const handleCopy = () => {
    if (!ip) return;
    navigator.clipboard.writeText(ip).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleManualCheck = async () => {
    setPolling(true);
    try {
      const res = await fetch("/api/auth/check-ip");
      const data = await res.json();
      if (data.allowed) {
        window.location.href = "/merchant-login";
        return;
      }
    } catch {}
    setPolling(false);
    setCountdown(30);
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)" }}
    >
      <style>{`
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes shimmer { 0%{opacity:0.4} 50%{opacity:1} 100%{opacity:0.4} }
        .ip-float { animation: float 4s ease-in-out infinite; }
        .ip-shimmer { animation: shimmer 2s ease-in-out infinite; }
        .copy-btn:hover { background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.5); }
        .copy-btn:active { transform: scale(0.97); }
        .check-btn:hover { background: rgba(99,102,241,0.2); }
        .check-btn:active { transform: scale(0.97); }
      `}</style>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="ip-float inline-block mb-5">
            <div className="relative mx-auto w-24 h-24">
              <img
                src="/robotpay-logo.jpg"
                alt="WestPay"
                className="w-24 h-24 rounded-2xl object-cover"
                style={{ boxShadow: "0 0 40px rgba(99,102,241,0.4)" }}
              />
              <div
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: "#ef4444" }}
              >
                <Lock className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">
            Access Restricted
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: "#94a3b8" }}>
            WestPay is only available in supported regions. Your location is
            outside our service area. If you have been granted access by an
            administrator, please wait — the page checks automatically.
          </p>
        </div>

        {/* IP Card */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(20px)",
          }}
        >
          <div className="p-5 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2 mb-1">
              <Wifi className="w-4 h-4" style={{ color: "#94a3b8" }} />
              <span
                className="text-xs font-medium uppercase tracking-widest"
                style={{ color: "#64748b" }}
              >
                Your detected IP address
              </span>
            </div>

            {checking ? (
              <div className="flex items-center gap-2 py-2">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#6366f1" }} />
                <span className="text-sm" style={{ color: "#94a3b8" }}>
                  Detecting...
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 mt-2">
                <span
                  className="text-xl font-bold font-mono tracking-wide"
                  style={{ color: "#e2e8f0" }}
                  data-testid="text-user-ip"
                >
                  {ip}
                </span>
                <button
                  onClick={handleCopy}
                  className="copy-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
                  style={{
                    background: "rgba(99,102,241,0.1)",
                    border: "1px solid rgba(99,102,241,0.3)",
                    color: copied ? "#10b981" : "#818cf8",
                    cursor: "pointer",
                  }}
                  data-testid="button-copy-ip"
                >
                  {copied ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy IP
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Steps */}
          <div className="p-5">
            <div className="space-y-4">
              <div className="flex gap-3">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold"
                  style={{ background: "rgba(99,102,241,0.2)", color: "#818cf8" }}
                >
                  1
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: "#e2e8f0" }}>
                    Copy your IP address
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                    Use the "Copy IP" button above
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold"
                  style={{ background: "rgba(99,102,241,0.2)", color: "#818cf8" }}
                >
                  2
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: "#e2e8f0" }}>
                    Contact the administrator
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                    Send your IP via Telegram or WhatsApp
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold"
                  style={{ background: "rgba(99,102,241,0.2)", color: "#818cf8" }}
                >
                  3
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: "#e2e8f0" }}>
                    Wait for approval
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                    Access will be granted once the admin approves your IP
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Auto-check status */}
        <div
          className="mt-4 rounded-xl p-4 flex items-center justify-between gap-3"
          style={{
            background: "rgba(99,102,241,0.08)",
            border: "1px solid rgba(99,102,241,0.2)",
          }}
        >
          <div className="flex items-center gap-3">
            {polling ? (
              <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: "#818cf8" }} />
            ) : (
              <div
                className="w-2 h-2 rounded-full shrink-0 ip-shimmer"
                style={{ background: "#6366f1" }}
              />
            )}
            <p className="text-xs" style={{ color: "#a5b4fc" }}>
              {polling
                ? "Checking access..."
                : `Checking automatically in ${countdown}s`}
            </p>
          </div>
          <button
            onClick={handleManualCheck}
            disabled={polling}
            className="check-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 disabled:opacity-50"
            style={{
              background: "rgba(99,102,241,0.15)",
              border: "1px solid rgba(99,102,241,0.3)",
              color: "#818cf8",
              cursor: polling ? "not-allowed" : "pointer",
            }}
            data-testid="button-check-access"
          >
            <RefreshCw className={`w-3 h-3 ${polling ? "animate-spin" : ""}`} />
            Check now
          </button>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "#334155" }}>
          WestPay — Secure Payment Platform
        </p>
      </div>
    </div>
  );
}
