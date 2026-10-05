import "./_group.css";
import { useState, type FormEvent } from "react";

type ManualPaymentDetails = {
  recipientPhone: string;
  recipientName?: string | null;
  ussdCode: string | null;
  instructions: string;
  paymentToken: string;
};

type Props = {
  paymentId: number;
  reference: string | null;
  amount: number;
  currency: string;
  operator: string;
  payment: ManualPaymentDetails;
};

function CurrentManualPaymentStep({ paymentId, reference, amount, currency, operator, payment }: Props) {
  const [proof, setProof] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyInstructions = async () => {
    const text = [
      payment.instructions,
      payment.recipientName ? `Nom du titulaire du compte : ${payment.recipientName}` : "",
      `Numéro de paiement : ${payment.recipientPhone}`,
      payment.ussdCode ? `USSD : ${payment.ussdCode}` : "",
      `${operator} · ${amount.toLocaleString()} ${currency}`,
    ].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // The clipboard may be unavailable in an isolated preview.
    }
  };

  const submitProof = (event: FormEvent) => {
    event.preventDefault();
    if (!proof.trim() || submitting || submitted) return;
    setSubmitting(true);
    window.setTimeout(() => {
      setSubmitted(true);
      setSubmitting(false);
    }, 350);
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="manual-payment-step">
      <div style={{ border: "1px solid #bfdbfe", borderRadius: 12, background: "#eff6ff", padding: "14px 16px" }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: "#1e3a8a", margin: "0 0 8px" }}>Paiement à effectuer manuellement</p>
        <p style={{ fontSize: 13, color: "#1e40af", margin: 0 }}>
          {operator} · {amount.toLocaleString()} {currency}
          {reference ? ` · ${reference}` : ""}
        </p>
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {payment.recipientName && (
          <div>
            <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 4px" }}>Nom du titulaire du compte</p>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: 0 }}>{payment.recipientName}</p>
          </div>
        )}
        <div>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 4px" }}>Numéro de paiement</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: 0 }}>{payment.recipientPhone}</p>
        </div>
        <p style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "#374151", margin: 0 }}>{payment.instructions}</p>
        {payment.ussdCode ? (
          <a
            href={`tel:${encodeURIComponent(payment.ussdCode)}`}
            style={{ display: "block", borderRadius: 9, background: "#2563eb", color: "#fff", padding: "12px 14px", fontSize: 14, fontWeight: 700, textAlign: "center", textDecoration: "none" }}
            data-testid="button-manual-open-dialer"
          >
            Ouvrir le composeur avec le code USSD
          </a>
        ) : (
          <p style={{ fontSize: 12, color: "#4b5563", margin: 0 }}>Suivez les instructions ci-dessous sur votre téléphone.</p>
        )}
        <button
          type="button"
          onClick={copyInstructions}
          style={{ border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff", color: "#1f2937", padding: "10px 14px", fontSize: 13, fontWeight: 600 }}
          data-testid="button-manual-copy-instructions"
        >
          {copied ? "Instructions copiées" : "Copier les instructions"}
        </button>
      </div>

      {submitted ? (
        <div role="status" style={{ border: "1px solid #86efac", borderRadius: 10, background: "#f0fdf4", color: "#166534", padding: "12px 14px", fontSize: 13, fontWeight: 600 }}>
          Soumission reçue. Le paiement sera vérifié avant validation.
        </div>
      ) : (
        <form onSubmit={submitProof} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label htmlFor={`manual-proof-${paymentId}`} style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Référence de transaction</label>
          <input
            id={`manual-proof-${paymentId}`}
            type="text"
            value={proof}
            onChange={(event) => setProof(event.target.value.slice(0, 120))}
            placeholder="Saisissez uniquement la référence de transaction affichée après le paiement"
            maxLength={120}
            required
            style={{ width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 9, padding: "10px 12px", fontSize: 13 }}
            data-testid="input-manual-proof"
          />
          <button
            type="submit"
            disabled={!proof.trim() || submitting}
            style={{ border: 0, borderRadius: 9, background: !proof.trim() || submitting ? "#9ca3af" : "#16a34a", color: "#fff", padding: "12px 14px", fontSize: 14, fontWeight: 700, cursor: !proof.trim() || submitting ? "not-allowed" : "pointer" }}
            data-testid="button-manual-submit-proof"
          >
            {submitting ? "Traitement en cours..." : "Envoyer pour vérification"}
          </button>
        </form>
      )}

      <footer style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 8px 0", color: "#202326" }}>
        <span style={{ fontSize: 11, lineHeight: 1.25 }}>Hébergé et sécurisé par</span>
        <img src="/robotpay-logo.png" alt="RobotPay" style={{ display: "block", width: 156, maxWidth: "46vw", height: "auto", objectFit: "contain" }} />
      </footer>
    </section>
  );
}

export function Current() {
  return (
    <main className="manual-payment-current-frame" style={{ background: "#fff", padding: "12px 16px 24px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 400, margin: "0 auto", padding: 20, borderRadius: 24, boxShadow: "0 2px 24px rgba(0,0,0,.14), 0 1px 4px rgba(0,0,0,.07)", boxSizing: "border-box" }}>
        <CurrentManualPaymentStep
          paymentId={4218}
          reference="WP-DEMO-2026"
          amount={10000}
          currency="XOF"
          operator="TMoney Togo"
          payment={{
            recipientPhone: "92299772",
            recipientName: "Kotam",
            ussdCode: "*145*1*92299772*10000#",
            instructions: "Effectuez le paiement vers le numéro indiqué. Votre opérateur vous guidera pour terminer l’opération. Revenez ensuite saisir la référence de transaction affichée après le paiement.",
            paymentToken: "preview-only",
          }}
        />
      </div>
    </main>
  );
}
