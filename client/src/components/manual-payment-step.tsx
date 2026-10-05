import { useState, type FormEvent } from "react";
import { Check, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/language";
import "./manual-payment-step.css";

export type ManualPaymentDetails = {
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
  previewMode?: boolean;
};

export default function ManualPaymentStep({
  paymentId,
  amount,
  currency,
  operator,
  payment,
  previewMode = false,
}: Props) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [proof, setProof] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyValue = async (value: string, field: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => {
        setCopiedField((current) => current === field ? null : current);
      }, 2000);
    } catch {
      toast({
        title: t("manualCopyErrorTitle"),
        description: t("manualCopyErrorDescription"),
        variant: "destructive",
      });
    }
  };

  const submitProof = async (event: FormEvent) => {
    event.preventDefault();
    if (!proof.trim() || submitting || submitted) return;
    if (previewMode) {
      toast({
        title: "Aperçu sans paiement",
        description: "La preuve n’a pas été envoyée.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/payment/manual/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, paymentToken: payment.paymentToken, proof: proof.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || t("manualSubmitError"));
      setSubmitted(true);
    } catch (error: any) {
      toast({
        title: t("manualSubmitError"),
        description: error?.message || t("manualSubmitError"),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const copyButton = (value: string, field: string, label: string) => {
    const isCopied = copiedField === field;
    return (
      <button
        type="button"
        className="manual-payment__copy"
        onClick={() => void copyValue(value, field)}
        aria-label={`${isCopied ? t("manualCopied") : t("manualCopyButton")} ${label}`}
        title={`${isCopied ? t("manualCopied") : t("manualCopyButton")} ${label}`}
        data-testid={`button-manual-copy-${field}`}
      >
        {isCopied ? <Check size={14} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
        <span>{isCopied ? t("manualCopied") : t("manualCopyButton")}</span>
      </button>
    );
  };

  return (
    <section className="manual-payment" data-testid="manual-payment-step">
      <header className="manual-payment__header">
        <div className="manual-payment__operator">
          <span>{t("payOperator")}:</span>
          <strong>{operator}</strong>
        </div>
      </header>

      <div className="manual-payment__body">
        <div className="manual-payment__notice" role="note">
          <p className="manual-payment__intro">
            {payment.instructions?.trim() || t("manualInstructionIntro")}
          </p>
        </div>

        <section className="manual-payment__card" aria-labelledby="manual-transfer-step">
          <p className="manual-payment__step" id="manual-transfer-step">{t("manualStepTransfer")}</p>
          <div className="manual-payment__details">
            {payment.recipientName && (
              <div className="manual-payment__detail-row">
                <span className="manual-payment__label">{t("manualRecipientNameLabel")}</span>
                <strong className="manual-payment__value">{payment.recipientName}</strong>
                {copyButton(payment.recipientName, "account", t("manualRecipientNameLabel"))}
              </div>
            )}
            <div className="manual-payment__detail-row">
              <span className="manual-payment__label">{t("manualRecipientLabel")}</span>
              <strong className="manual-payment__value">{payment.recipientPhone}</strong>
              {copyButton(payment.recipientPhone.replace(/\s+/g, ""), "phone", t("manualRecipientLabel"))}
            </div>
            <div className="manual-payment__detail-row manual-payment__amount-row">
              <span className="manual-payment__label">{t("manualAmountLabel")}</span>
              <strong className="manual-payment__value">
                {amount.toLocaleString()} {currency}
              </strong>
            </div>
          </div>
        </section>

        <section className="manual-payment__card manual-payment__pay-card" aria-labelledby="manual-dial-step">
          <p className="manual-payment__step" id="manual-dial-step">
            {payment.ussdCode ? t("manualStepDial") : t("manualStepNoUssd")}
          </p>
          {payment.ussdCode ? (
            <a
              href={previewMode ? "#" : `tel:${encodeURIComponent(payment.ussdCode)}`}
              onClick={previewMode ? (event) => {
                event.preventDefault();
                toast({
                  title: "Aperçu sans paiement",
                  description: "Le composeur ne sera pas ouvert.",
                });
              } : undefined}
              aria-disabled={previewMode}
              className="manual-payment__pay-button"
              data-testid="button-manual-open-dialer"
            >
              {t("manualDialerButton")}
            </a>
          ) : null}
        </section>

        <section className="manual-payment__card manual-payment__proof-card" aria-labelledby="manual-proof-step">
          <p className="manual-payment__step" id="manual-proof-step">{t("manualStepProof")}</p>
          {submitted ? (
            <div className="manual-payment__submitted" role="status" aria-live="polite">
              <Check size={19} aria-hidden="true" />
              <span>{t("manualSubmitted")}</span>
            </div>
          ) : (
            <form onSubmit={submitProof} className="manual-payment__proof-form">
              <label className="manual-payment__sr-only" htmlFor={`manual-proof-${paymentId}`}>
                {t("manualProofLabel")}
              </label>
              <input
                id={`manual-proof-${paymentId}`}
                type="text"
                value={proof}
                onChange={(event) => setProof(event.target.value.slice(0, 120))}
                placeholder={t("manualProofPlaceholder")}
                maxLength={120}
                required
                autoComplete="off"
                data-testid="input-manual-proof"
              />
              <button
                type="submit"
                disabled={!proof.trim() || submitting}
                data-testid="button-manual-submit-proof"
              >
                {submitting ? t("payProcessing") : t("manualSubmitButton")}
              </button>
            </form>
          )}
        </section>

        <footer className="manual-payment__footer">
          <span>{t("manualSecurityFooter")}</span>
          <img className="manual-payment__footer-logo" src="/robotpay-logo.png" alt="RobotPay" />
        </footer>
      </div>
    </section>
  );
}