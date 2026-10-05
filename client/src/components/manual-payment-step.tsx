import { useState } from "react";
import manualPaymentDesign from "../../../attached_assets/Pasted--box-sizing-border-box-html-body-root-margin-0-padding-_1791238715582.txt?raw";

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

const scopedDesign = `
.robotpay-manual-page-root {
  width: 100%;
  min-height: 100vh;
  margin: 0;
  background: #f5f5f5;
  color: #222;
  font-family: Arial, Helvetica, sans-serif;
  -webkit-tap-highlight-color: transparent;
}

.robotpay-manual-page-root,
.robotpay-manual-page-root * {
  box-sizing: border-box;
}

@scope (.robotpay-manual-page-root) {
${manualPaymentDesign}
}
`;

export default function ManualPaymentStep({
  paymentId,
  reference: paymentReference,
  amount,
  currency,
  operator,
  payment,
  previewMode = false,
}: Props) {
  const [message, setMessage] = useState("");
  const [proofReference, setProofReference] = useState("");
  const [success, setSuccess] = useState(false);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [successReference, setSuccessReference] = useState("");
  const [successStatus, setSuccessStatus] = useState<"pending" | "confirmed">("pending");

  const showMessage = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2200);
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }

    showMessage(`Copié : ${text}`);
  };

  const payNow = () => {
    if (previewMode) {
      showMessage("Aperçu : paiement désactivé.");
      return;
    }
    if (!payment.ussdCode?.trim()) {
      showMessage("Code USSD indisponible.");
      return;
    }

    showMessage("Ouverture du paiement...");
    window.location.assign(`tel:${encodeURIComponent(payment.ussdCode)}`);
  };

  const submitPayment = async () => {
    const cleanProof = proofReference.trim();
    if (!cleanProof || submitting || submitted) return;
    if (previewMode) {
      showMessage("Aperçu : l’envoi de preuve est désactivé.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/payment/manual/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId,
          paymentToken: payment.paymentToken,
          proof: cleanProof,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Impossible d’envoyer la preuve.");
      }

      setSubmitted(true);
      setSuccessReference(cleanProof);
      setSuccessStatus("pending");
      setSuccess(true);
    } catch (error: unknown) {
      showMessage(error instanceof Error ? error.message : "Impossible d’envoyer la preuve.");
    } finally {
      setSubmitting(false);
    }
  };

  const checkPayment = async () => {
    if (!proofReference.trim()) {
      showMessage("Veuillez entrer la référence du paiement.");
      return;
    }
    if (checking) return;
    if (previewMode) {
      showMessage("Aperçu : la vérification est désactivée.");
      return;
    }

    setChecking(true);
    try {
      const response = await fetch(`/api/payment/${paymentId}/status`, {
        headers: { "X-Payment-Token": payment.paymentToken },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Vérification impossible.");
      }

      if (data.status === "confirmed") {
        setSuccessReference(proofReference.trim());
        setSuccessStatus("confirmed");
        setSuccess(true);
      } else if (data.status === "failed") {
        showMessage("Paiement non confirmé.");
      } else {
        showMessage("Vérification terminée.");
      }
    } catch (error: unknown) {
      showMessage(error instanceof Error ? error.message : "Vérification impossible.");
    } finally {
      setChecking(false);
    }
  };

  const normalizedOperator = operator.trim().replace(/[\s_-]/g, "").toLowerCase();
  const operatorName = normalizedOperator === "tmoney" ? "Tmoney togo" : operator;
  const recipientName = payment.recipientName?.trim() || "—";
  const displayedReference = successReference || paymentReference || proofReference;
  const formattedAmount = amount.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  if (success) {
    return (
      <div className="robotpay-manual-page-root">
        <style>{scopedDesign}</style>
        <div className="success-page">
          <button
            className="success-close"
            onClick={() => setSuccess(false)}
            aria-label="Fermer"
          >
            ×
          </button>

          <div className="success-content">
            <div className="success-check-animation">
              <div className="success-check-circle">
                <span>✓</span>
              </div>
            </div>

            <h1>Paiement soumis avec succès !</h1>

            <p className="success-message">
              Votre paiement a bien été soumis.
            </p>

            <div className="success-line"></div>

            <div className="success-info-label">
              RÉFÉRENCE DU PAIEMENT
            </div>

            <div className="success-reference">
              {displayedReference}
            </div>

            <div className="success-status">
              <span className="success-status-dot"></span>
              {successStatus === "confirmed" ? "Paiement confirmé" : "Paiement en cours de vérification"}
            </div>

            <p className="success-note">
              Vous pouvez consulter le statut de votre paiement
              depuis la page de paiement.
            </p>

            <button
              className="success-return"
              onClick={() => setSuccess(false)}
            >
              Retour au paiement
            </button>
          </div>

          <div className="success-footer">
            <img src="/assets/logo.png" alt="RobotPay" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="robotpay-manual-page-root" data-testid="manual-payment-step">
      <style>{scopedDesign}</style>
      <div className="page">
        <header className="header">
          <div className="header-title">
            Payment
          </div>

          <div className="operator-row">
            <span>opérateur:</span>
            <span>{operatorName}</span>
          </div>
        </header>

        <section className="card payment-method">
          <div className="payment-method-title">
            Click a payment method
          </div>

          <div className="warning">
            veuillez versé le montant du paiement sur le numéro suivant assurer
            vous que le numéro est correct et après l&apos;envoi en attente pour que
            votre paiement soit traité pour tout problème veuillez contacter le
            commerçant.
          </div>
        </section>

        <section className="card step">
          <div className="step-title">
            1. Veuillez envoyer les fonds à ce numéro. Veuillez lire
            attentivement les informations.
          </div>

          <div className="info-row">
            <div className="info-label">
              Nom du compte :
            </div>

            <div className="info-value">
              <span>{recipientName}</span>

              <button
                type="button"
                className="copy-btn"
                onClick={() => void copyText(recipientName)}
              >
                Copy
                <span className="copy-icon"></span>
              </button>
            </div>
          </div>

          <div className="info-row">
            <div className="info-label">
              Numéro de paiement.
            </div>

            <div className="info-value">
              <span>{payment.recipientPhone}</span>

              <button
                type="button"
                className="copy-btn"
                onClick={() => void copyText(payment.recipientPhone.replace(/\s+/g, ""))}
              >
                Copy
                <span className="copy-icon"></span>
              </button>
            </div>
          </div>

          <div className="info-row last-row">
            <div className="info-label">
              Montant du paiement :
            </div>

            <div className="info-value">
              <span>{formattedAmount} {currency}</span>
            </div>
          </div>
        </section>

        <section className="card step-two">
          <div className="step-two-title">
            2. vous pouvez cliquer sur le bouton payé pour gagner du temps.
          </div>

          <button
            type="button"
            className="pay-button"
            onClick={payNow}
          >
            cliquez ici pour payer
          </button>
        </section>

        <section className="card step-three">
          <div className="step-three-title">
            3. veuillez soumettre la preuve de paiement (la référence ou le
            message reçu)
          </div>

          <div className="reference-row">
            <input
              className="reference-input"
              type="text"
              placeholder="entre la référence du paiement"
              value={proofReference}
              onChange={(event) => setProofReference(event.target.value.slice(0, 120))}
              maxLength={120}
              autoComplete="off"
            />

            <button
              type="button"
              className={`submit-btn ${proofReference.trim() && !submitted ? "active" : ""}`}
              disabled={!proofReference.trim() || submitting || submitted}
              onClick={() => void submitPayment()}
            >
              Soumettre
            </button>
          </div>

          <button
            type="button"
            className="verify-button"
            disabled={checking || submitting}
            onClick={() => void checkPayment()}
          >
            Vérifier le statut du paiement
          </button>
        </section>

        <footer className="footer">
          <img src="/assets/logo.png" alt="RobotPay" />
        </footer>

        {message && (
          <div className="message show" role="status" aria-live="polite">
            {message}
          </div>
        )}

        {checking && (
          <div className="verification-overlay">
            <div className="verification-box">
              <div className="verification-animation">
                <div className="verification-ring"></div>
                <div className="verification-icon">
                  ✓
                </div>
              </div>

              <h2>
                Paiement en cours de vérification
              </h2>

              <p>
                Nous vérifions votre paiement.
                <br />
                Veuillez patienter quelques instants...
              </p>

              <div className="verification-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
