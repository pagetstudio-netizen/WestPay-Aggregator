import { useState, type FormEvent } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/language";

export type ManualPaymentDetails = {
  recipientPhone: string;
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

export default function ManualPaymentStep({ paymentId, reference, amount, currency, operator, payment }: Props) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [proof, setProof] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyInstructions = async () => {
    const text = [
      payment.instructions,
      `${t("manualRecipientLabel")}: ${payment.recipientPhone}`,
      payment.ussdCode ? `USSD: ${payment.ussdCode}` : "",
      `${operator} · ${amount.toLocaleString()} ${currency}`,
    ].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({ title: "Copie impossible", description: "Votre navigateur n’autorise pas l’accès au presse-papiers.", variant: "destructive" });
    }
  };

  const submitProof = async (event: FormEvent) => {
    event.preventDefault();
    if (!proof.trim() || submitting || submitted) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/payment/manual/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, paymentToken: payment.paymentToken, proof: proof.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Impossible d’envoyer cette référence.");
      setSubmitted(true);
    } catch (error: any) {
      toast({
        title: "Envoi impossible",
        description: error?.message || "Vérifiez votre connexion puis réessayez.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="manual-payment-step">
      <div style={{ border: "1px solid #bfdbfe", borderRadius: 12, background: "#eff6ff", padding: "14px 16px" }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: "#1e3a8a", margin: "0 0 8px" }}>{t("manualPaymentTitle")}</p>
        <p style={{ fontSize: 13, color: "#1e40af", margin: 0 }}>
          {operator} · {amount.toLocaleString()} {currency}
          {reference ? ` · ${reference}` : ""}
        </p>
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 4px" }}>{t("manualRecipientLabel")}</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: 0 }}>{payment.recipientPhone}</p>
        </div>
        <p style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "#374151", margin: 0 }}>{payment.instructions}</p>
        {payment.ussdCode ? (
          <>
            <code style={{ display: "block", padding: "10px 12px", borderRadius: 8, background: "#f3f4f6", color: "#111827", fontSize: 15, fontWeight: 700, wordBreak: "break-all" }}>
              {payment.ussdCode}
            </code>
            <a
              href={`tel:${encodeURIComponent(payment.ussdCode)}`}
              style={{ display: "block", borderRadius: 9, background: "#2563eb", color: "#fff", padding: "12px 14px", fontSize: 14, fontWeight: 700, textAlign: "center", textDecoration: "none" }}
              data-testid="button-manual-open-dialer"
            >
              {t("manualDialerButton")}
            </a>
          </>
        ) : (
          <p style={{ fontSize: 12, color: "#4b5563", margin: 0 }}>{t("manualNoUssd")}</p>
        )}
        <button
          type="button"
          onClick={copyInstructions}
          style={{ border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff", color: "#1f2937", padding: "10px 14px", fontSize: 13, fontWeight: 600 }}
          data-testid="button-manual-copy-instructions"
        >
          {copied ? t("manualCopied") : t("manualCopyButton")}
        </button>
      </div>

      <p style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 9, padding: "10px 12px", margin: 0 }}>
        {t("manualNoSecret")}
      </p>

      {submitted ? (
        <div role="status" style={{ border: "1px solid #86efac", borderRadius: 10, background: "#f0fdf4", color: "#166534", padding: "12px 14px", fontSize: 13, fontWeight: 600 }}>
          {t("manualSubmitted")}
        </div>
      ) : (
        <form onSubmit={submitProof} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label htmlFor={`manual-proof-${paymentId}`} style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{t("manualProofLabel")}</label>
          <input
            id={`manual-proof-${paymentId}`}
            type="text"
            value={proof}
            onChange={(event) => setProof(event.target.value.slice(0, 120))}
            placeholder={t("manualProofPlaceholder")}
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
            {submitting ? t("payProcessing") : t("manualSubmitButton")}
          </button>
        </form>
      )}
    </section>
  );
}