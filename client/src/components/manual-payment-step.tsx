import { useState } from "react";
import manualPaymentDesign from "../../../attached_assets/Pasted--box-sizing-border-box-html-body-root-margin-0-padding-_1791238715582.txt?raw";
import copyIconPng from "../../../attached_assets/copie_1791241107801.png";
import waveBrandLogo from "../../../attached_assets/1756606482154_1791243181275.png";

export type ManualPaymentDetails = {
  recipientPhone: string;
  recipientName?: string | null;
  ussdCode: string | null;
  instructions: string;
  paymentToken: string;
  wavePaymentUrl?: string | null;
  waveQrCodeUrl?: string | null;
};

type Props = {
  paymentId: number;
  reference: string | null;
  amount: number;
  currency: string;
  operator: string;
  payment: ManualPaymentDetails;
  merchantReturnUrl?: string | null;
  showMerchantReturnButton?: boolean;
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

.header {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 146px;
  padding: 12px 22px 24px;
}

.header-title {
  width: 100%;
  text-align: center;
  font-size: 26px;
}

.operator-row {
  width: 100%;
  justify-content: space-between;
  gap: 12px;
  margin-top: 38px;
  font-size: 20px;
  font-weight: 700;
}

.operator-row span:first-child {
  font-weight: 700;
}

.card {
  width: calc(100% - 16px);
  margin: 6px auto 0;
  padding: 16px;
  border-radius: 9px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.payment-method-title {
  color: #777;
  text-align: center;
  font-size: 18px;
  margin-bottom: 16px;
}

.warning {
  color: #e53935;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.55;
}

.step-title,
.step-two-title,
.step-three-title {
  color: #536169;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.5;
}

.step-title,
.step-two-title,
.step-three-title {
  margin-bottom: 18px;
}

.info-row,
.info-row.last-row {
  flex-direction: row;
  flex-wrap: nowrap;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
  border-bottom: none;
}

.info-row.last-row {
  padding-bottom: 2px;
}

.info-label,
.info-value {
  color: #536169;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.4;
}

.info-label {
  flex: 0 0 auto;
  max-width: none;
  white-space: nowrap;
}

.info-value {
  flex: 0 1 auto;
  max-width: 60%;
  gap: 8px;
  flex-wrap: nowrap;
}

.info-value > span {
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: normal;
}

.copy-btn {
  flex-shrink: 0;
  min-height: 34px;
  padding: 5px 9px;
  border: none;
  border-radius: 7px;
  background: #58b844;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
}

.copy-btn:hover {
  background: #4aa83a;
}

.copy-icon {
  display: block;
  width: 15px;
  height: 15px;
  flex: 0 0 15px;
  object-fit: contain;
  filter: brightness(0) invert(1);
}

.pay-button {
  min-height: 60px;
  border-radius: 999px;
  font-size: 22px;
}

.step-two,
.step-three {
  padding-right: 22px;
  padding-left: 22px;
}

.reference-input {
  height: 64px;
  border: 2px solid #58b844;
  border-radius: 10px;
  font-size: 16px;
}

.submit-btn {
  min-width: 110px;
  height: 64px;
  border-radius: 10px;
  font-size: 16px;
}

.submit-btn:disabled {
  background: #cbd2d5;
  color: #fff;
  opacity: 1;
}

.verify-button {
  min-height: 64px;
  margin-top: 16px;
  border: 2px solid #58b844;
  border-radius: 10px;
  color: #58b844;
  font-size: 18px;
}

.verify-button:hover:not(:disabled) {
  background: #f4fbf2;
}

.wave-manual .header {
  min-height: 166px;
  background: #20bde9;
  color: #fff;
}

.wave-manual .header-title {
  display: none;
}

.wave-brand-logo {
  display: block;
  width: min(230px, 72vw);
  height: auto;
  margin: 2px auto 0;
}

.wave-manual .operator-row {
  margin-top: 6px;
  color: #fff;
  font-size: 16px;
}

.wave-manual .payment-method {
  display: none;
}

.wave-payment-card {
  padding: 18px 16px 22px;
  text-align: center;
}

.wave-instructions {
  color: #536169;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.45;
  margin-bottom: 12px;
}

.wave-manual .pay-button {
  min-height: 54px;
  border-radius: 999px;
  background: #20bde9;
  color: #fff;
  font-size: 18px;
  font-weight: 700;
}

.wave-manual .pay-button:hover {
  background: #12acd8;
}

.wave-qr-instructions {
  margin: 22px auto 12px;
  color: #536169;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.4;
}

.wave-qr {
  display: block;
  width: min(100%, 270px);
  max-height: 360px;
  margin: 0 auto 14px;
  object-fit: contain;
  border-radius: 4px;
}

.wave-payment-amount {
  color: #536169;
  font-size: 16px;
  font-weight: 700;
}

.wave-manual .reference-input {
  border-color: #20bde9;
}

.wave-manual .reference-input:focus {
  outline-color: rgba(32, 189, 233, 0.35);
}

.wave-manual .submit-btn.active {
  border-color: #20bde9;
  background: #20bde9;
}

.wave-manual .verify-button {
  border-color: #20bde9;
  color: #20bde9;
}

.wave-manual .verify-button:hover:not(:disabled) {
  background: #effbff;
}

.wave-manual button:focus-visible {
  outline-color: rgba(32, 189, 233, 0.4);
}

button {
  -webkit-tap-highlight-color: transparent;
  transition:
    transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 160ms ease,
    filter 160ms ease,
    background-color 180ms ease,
    border-color 180ms ease,
    color 180ms ease;
  transform-origin: center;
}

@media (hover: hover) and (pointer: fine) {
  button:hover:not(:disabled) {
    transform: translateY(-1px);
  }
}

button:active:not(:disabled) {
  transform: translateY(1px) scale(0.965);
  filter: brightness(0.94);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.16);
}

button:focus-visible {
  outline: 3px solid rgba(88, 184, 68, 0.38);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  button {
    transition: none;
  }

  button:hover:not(:disabled),
  button:active:not(:disabled) {
    transform: none;
  }
}

.footer {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 30px 16px 40px;
  background: #fff;
}

.footer img,
.success-footer img {
  width: 400px;
  max-width: 85%;
}

.success-footer img {
  width: 360px;
}

@media (min-width: 768px) {
  .header {
    padding-left: calc((100% - 700px) / 2 + 16px);
    padding-right: calc((100% - 700px) / 2 + 16px);
  }
}

@media (max-width: 480px) {
  .header {
    min-height: 132px;
    padding: 12px 16px 20px;
  }

  .header-title {
    font-size: 22px;
  }

  .operator-row {
    margin-top: 34px;
    font-size: 16px;
  }

  .card {
    width: calc(100% - 18px);
    margin-top: 9px;
    padding: 14px;
  }

  .payment-method-title {
    font-size: 16px;
  }

  .warning,
  .step-title,
  .step-two-title,
  .step-three-title {
    font-size: 16px;
  }

  .info-row,
  .info-row.last-row {
    gap: 7px;
    padding: 10px 0;
  }

  .info-label,
  .info-value {
    font-size: 15px;
  }

  .info-label {
    max-width: none;
    line-height: 1.35;
  }

  .info-value {
    max-width: 60%;
    gap: 6px;
    line-height: 1.35;
  }

  .copy-btn {
    min-height: 32px;
    padding: 4px 7px;
    font-size: 12px;
  }

  .pay-button {
    min-height: 54px;
    font-size: 18px;
  }

  .reference-row {
    gap: 6px;
  }

  .reference-input,
  .submit-btn {
    height: 54px;
  }

  .submit-btn {
    min-width: 88px;
    font-size: 13px;
  }

  .verify-button {
    min-height: 58px;
    font-size: 15px;
  }

  .footer {
    padding: 28px 12px 34px;
  }

  .footer img {
    width: 360px;
    max-width: 88%;
  }
}
}
`;

export default function ManualPaymentStep({
  paymentId,
  reference: paymentReference,
  amount,
  currency,
  operator,
  payment,
  merchantReturnUrl = null,
  showMerchantReturnButton = false,
  previewMode = false,
}: Props) {
  const [message, setMessage] = useState("");
  const [proofReference, setProofReference] = useState("");
  const [success, setSuccess] = useState(false);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [successReference, setSuccessReference] = useState("");

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
    if (payment.wavePaymentUrl) {
      showMessage("Ouverture de Wave...");
      window.location.assign(payment.wavePaymentUrl);
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
      showMessage("Aperçu : l’actualisation du statut est désactivée.");
      return;
    }

    setChecking(true);
    try {
      const response = await fetch(`/api/payment/${paymentId}/status`, {
        headers: { "X-Payment-Token": payment.paymentToken },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Impossible d’actualiser le statut du paiement.");
      }

      if (data.status === "confirmed") {
        setSuccessReference(proofReference.trim());
        setSuccess(true);
      } else if (data.status === "failed") {
        showMessage("Paiement non confirmé.");
      } else {
        showMessage("Statut actualisé.");
      }
    } catch (error: unknown) {
      showMessage(error instanceof Error ? error.message : "Impossible d’actualiser le statut du paiement.");
    } finally {
      setChecking(false);
    }
  };

  const normalizedOperator = operator.trim().replace(/[\s_-]/g, "").toLowerCase();
  const operatorName = normalizedOperator === "tmoney" ? "Tmoney togo" : operator;
  const isWavePayment = Boolean(payment.wavePaymentUrl && payment.waveQrCodeUrl);
  const recipientName = payment.recipientName?.trim() || "—";
  const displayedReference = successReference || paymentReference || proofReference;
  const merchantReturnHref = (() => {
    const raw = merchantReturnUrl?.trim();
    if (!raw || /^(javascript|data|vbscript):/i.test(raw)) return null;
    try {
      const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const url = new URL(normalized);
      if (!["http:", "https:"].includes(url.protocol)) return null;
      url.searchParams.set("status", "success");
      url.searchParams.set("amount", String(amount));
      url.searchParams.set("ref", paymentReference || displayedReference);
      return url.toString();
    } catch {
      return null;
    }
  })();
  const formattedAmount = amount.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  if (success) {
    return (
      <div className={`robotpay-manual-page-root${isWavePayment ? " wave-manual" : ""}`}>
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

            <h1>Paiement soumis avec succès.</h1>

            <p className="success-message">
              Votre paiement est en cours de traitement.
            </p>

            <div className="success-line"></div>

            <div className="success-info-label">
              RÉFÉRENCE DU PAIEMENT
            </div>

            <div className="success-reference">
              {displayedReference}
            </div>

            {showMerchantReturnButton && (
              <button
                type="button"
                className="success-return"
                onClick={() => {
                  if (merchantReturnHref) window.location.assign(merchantReturnHref);
                  else window.history.back();
                }}
                data-testid="button-return-to-merchant"
              >
                Retourner sur le site marchand
              </button>
            )}
          </div>

          <div className="success-footer">
            <img src="/assets/logo.png" alt="RobotPay" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`robotpay-manual-page-root${isWavePayment ? " wave-manual" : ""}`} data-testid="manual-payment-step">
      <style>{scopedDesign}</style>
      <div className="page">
        <header className="header">
          {isWavePayment ? (
            <img className="wave-brand-logo" src={waveBrandLogo} alt="Wave" />
          ) : (
            <div className="header-title">
              Payment
            </div>
          )}

          <div className="operator-row">
            <span>{isWavePayment ? "Montant à payer :" : "opérateur:"}</span>
            <span>{isWavePayment ? `${formattedAmount} ${currency}` : operatorName}</span>
          </div>
        </header>

        {isWavePayment ? (
          <section className="card wave-payment-card">
            <div className="wave-instructions">
              Veuillez ouvrir l’application Wave pour terminer le paiement
            </div>
            <button
              type="button"
              className="pay-button"
              onClick={payNow}
            >
              Ouvrir l’application Wave
            </button>
            <div className="wave-qr-instructions">
              Appuyez longuement sur le code QR pour l’enregistrer
            </div>
            <img
              className="wave-qr"
              src={payment.waveQrCodeUrl || ""}
              alt="Code QR de paiement Wave"
            />
            <div className="wave-payment-amount">
              Référence de commande : {paymentReference || "—"}
            </div>
          </section>
        ) : (
          <>
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
                    <img className="copy-icon" src={copyIconPng} alt="" aria-hidden="true" />
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
                    <img className="copy-icon" src={copyIconPng} alt="" aria-hidden="true" />
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
          </>
        )}

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
            Actualiser le statut
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
                Paiement en cours de traitement
              </h2>

              <p>
                Nous actualisons le statut de votre paiement.
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
