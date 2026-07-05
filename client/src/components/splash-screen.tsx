import { useEffect, useState } from "react";

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 600);
    const t2 = setTimeout(() => setPhase("out"), 2200);
    const t3 = setTimeout(() => onDone(), 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#ffffff",
        opacity: phase === "out" ? 0 : 1,
        transition: phase === "in" ? "opacity 0.5s ease" : phase === "out" ? "opacity 0.6s ease" : "none",
        pointerEvents: phase === "out" ? "none" : "all",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
          transform: phase === "in" ? "scale(0.88) translateY(12px)" : "scale(1) translateY(0)",
          opacity: phase === "in" ? 0 : 1,
          transition: "transform 0.55s cubic-bezier(0.34,1.56,0.64,1), opacity 0.5s ease",
        }}
      >
        <img
          src="/westpay-splash.svg"
          alt="WestPay"
          style={{ width: 220, height: 220, objectFit: "contain" }}
          draggable={false}
        />

        <div style={{ textAlign: "center" }}>
          <p
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: "#00b050",
              letterSpacing: "-0.5px",
              margin: 0,
              lineHeight: 1,
            }}
          >
            WestPay
          </p>
          <p
            style={{
              fontSize: 13,
              color: "#6b7280",
              marginTop: 6,
              fontWeight: 500,
              letterSpacing: "0.02em",
            }}
          >
            Plateforme de paiement Mobile Money
          </p>
        </div>

        <div
          style={{
            width: 180,
            height: 3,
            background: "#e5e7eb",
            borderRadius: 99,
            overflow: "hidden",
            marginTop: 4,
          }}
        >
          <div
            style={{
              height: "100%",
              background: "linear-gradient(90deg, #00b050, #22c55e)",
              borderRadius: 99,
              animation: "wp-progress 2s cubic-bezier(0.4,0,0.2,1) forwards",
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes wp-progress {
          0%   { width: 0%; }
          40%  { width: 55%; }
          80%  { width: 82%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
}
