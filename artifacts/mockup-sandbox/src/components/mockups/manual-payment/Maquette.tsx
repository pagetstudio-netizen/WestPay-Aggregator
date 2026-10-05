import "./_group.css";
import { useState, type FormEvent } from "react";

const payment = {
  operator: "TMoney Togo",
  recipientName: "Kotam",
  recipientPhone: "92 29 97 72",
  amount: "10 000",
  currency: "XOF",
  reference: "WP-DEMO-2026",
  ussdCode: "*145*1*92299772*10000#",
};

export function Maquette() {
  const [proof, setProof] = useState("");
  const [copied, setCopied] = useState<"name" | "phone" | "instructions" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const copyValue = async (value: string, kind: "name" | "phone" | "instructions") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2200);
    } catch {
      setCopied(null);
    }
  };

  const submitProof = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!proof.trim() || submitting || submitted) return;
    setSubmitting(true);
    window.setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
    }, 450);
  };

  return (
    <main className="manual-payment-maquette-frame">
      <style>{`
        .manual-payment-maquette-frame {
          --pay-green: #55ad45;
          --pay-green-deep: #378e38;
          --pay-ink: #33494e;
          --pay-muted: #718186;
          --pay-line: #e7ece9;
          min-height: 100vh;
          box-sizing: border-box;
          background: #f3f6f3;
          color: var(--pay-ink);
          font-family: var(--font-sans, system-ui, sans-serif);
          padding-bottom: 24px;
        }
        .manual-payment-maquette-frame *,
        .manual-payment-maquette-frame *::before,
        .manual-payment-maquette-frame *::after { box-sizing: border-box; }
        .mp-top {
          min-height: 96px;
          display: flex;
          align-items: center;
          padding: 12px 20px;
          color: #fff;
          background: var(--pay-green);
          box-shadow: 0 3px 12px rgba(48, 108, 48, .16);
        }
        .mp-top-inner { width: 100%; max-width: 510px; margin: 0 auto; }
        .mp-operator-line {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 12px;
          margin-top: 0;
        }
        .mp-operator-label {
          margin: 0;
          font-size: clamp(22px, 6vw, 27px);
          font-weight: 800;
          letter-spacing: -.045em;
        }
        .mp-operator-name {
          margin: 0 0 2px;
          font-size: 19px;
          font-weight: 750;
          text-align: right;
        }
        .mp-content { width: min(100% - 22px, 510px); margin: 0 auto; }
        .mp-notice {
          position: relative;
          margin-top: -1px;
          padding: 14px 16px 16px;
          background: #fff;
          border: 1px solid #e8ede9;
          border-top: 0;
          border-radius: 0 0 13px 13px;
          box-shadow: 0 4px 12px rgba(39, 65, 50, .10);
        }
        .mp-notice-copy {
          margin: 0;
          color: #bf302d;
          font-size: 16px;
          line-height: 1.34;
          font-weight: 750;
          letter-spacing: -.018em;
        }
        .mp-card {
          margin-top: 17px;
          padding: 17px 16px;
          background: #fff;
          border: 1px solid #e9eeeb;
          border-radius: 13px;
          box-shadow: 0 4px 13px rgba(39, 65, 50, .10);
        }
        .mp-step-heading {
          display: flex;
          gap: 8px;
          align-items: flex-start;
          margin: 0 0 15px;
          color: #53666a;
          font-size: 13px;
          line-height: 1.45;
          font-weight: 700;
        }
        .mp-step-number {
          flex: none;
          display: inline-grid;
          place-items: center;
          width: 21px;
          height: 21px;
          border-radius: 50%;
          background: #eef6ed;
          color: var(--pay-green-deep);
          font-size: 11px;
          font-weight: 800;
        }
        .mp-detail-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          align-items: center;
          gap: 8px;
          min-height: 39px;
        }
        .mp-detail-label { color: #5d7075; font-size: 14px; font-weight: 650; }
        .mp-detail-value { color: #33494e; font-size: 16px; font-weight: 750; text-align: right; }
        .mp-copy {
          border: 0;
          border-radius: 6px;
          padding: 5px 7px;
          background: #61b353;
          color: #fff;
          font: inherit;
          font-size: 11px;
          font-weight: 750;
          white-space: nowrap;
          cursor: pointer;
          transition: transform .16s ease, background-color .16s ease;
        }
        .mp-copy:hover { background: #438f3e; transform: translateY(-1px); }
        .mp-total {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 12px;
          margin-top: 7px;
          padding-top: 12px;
          border-top: 1px solid var(--pay-line);
        }
        .mp-total-label { color: #5d7075; font-size: 14px; font-weight: 650; }
        .mp-total-value { color: #33494e; font-size: 18px; font-weight: 800; letter-spacing: -.03em; }
        .mp-order-ref { margin: 10px 0 0; color: #839094; font-size: 11px; }
        .mp-action-card { padding: 18px 16px 20px; }
        .mp-instructions { margin: -3px 0 14px 29px; color: #617176; font-size: 12px; line-height: 1.5; }
        .mp-dialer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          min-height: 64px;
          border-radius: 999px;
          padding: 11px 14px;
          background: var(--pay-green);
          color: #fff;
          text-align: center;
          text-decoration: none;
          font-size: clamp(22px, 6.2vw, 31px);
          line-height: 1.1;
          font-weight: 850;
          letter-spacing: -.045em;
          box-shadow: 0 4px 0 #398d38, 0 7px 14px rgba(64, 139, 57, .17);
          transition: transform .16s ease, box-shadow .16s ease, background-color .16s ease;
        }
        .mp-dialer:hover { transform: translateY(-1px); background: #4ca541; box-shadow: 0 5px 0 #398d38, 0 9px 16px rgba(64, 139, 57, .19); }
        .mp-dialer:active { transform: translateY(2px); box-shadow: 0 2px 0 #398d38; }
        .mp-proof-title { margin-top: 23px; margin-bottom: 7px; }
        .mp-proof-hint { margin: 0 0 11px 29px; color: #77868a; font-size: 12px; line-height: 1.45; }
        .mp-proof-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: stretch; gap: 9px; margin-left: 3px; }
        .mp-proof-input {
          width: 100%;
          min-width: 0;
          min-height: 54px;
          padding: 12px 15px;
          border: 3px solid #64ae51;
          border-radius: 10px;
          outline: none;
          background: #fff;
          color: #33494e;
          font: inherit;
          font-size: 15px;
          font-weight: 600;
          transition: box-shadow .16s ease, border-color .16s ease;
        }
        .mp-proof-input::placeholder { color: #9aa5a7; font-weight: 500; }
        .mp-proof-input:focus { border-color: #378e38; box-shadow: 0 0 0 3px rgba(85, 173, 69, .14); }
        .mp-submit {
          min-width: 102px;
          border: 0;
          border-radius: 9px;
          padding: 0 13px;
          background: #71868b;
          color: #fff;
          font: inherit;
          font-size: 14px;
          font-weight: 750;
          cursor: pointer;
          transition: background-color .16s ease, transform .16s ease;
        }
        .mp-submit:not(:disabled) { background: var(--pay-green-deep); }
        .mp-submit:not(:disabled):hover { background: #2e7e31; transform: translateY(-1px); }
        .mp-submit:disabled { cursor: not-allowed; opacity: .78; }
        .mp-success {
          margin: 12px 0 0 3px;
          padding: 13px 14px;
          border: 1px solid #c7e7c0;
          border-radius: 10px;
          background: #f1faef;
          color: #337b35;
          font-size: 13px;
          line-height: 1.45;
          font-weight: 700;
        }
        .mp-footer {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin: 20px auto 0;
          color: #202624;
          text-align: center;
        }
        .mp-footer-kicker { display: block; margin-bottom: 1px; font-size: 13px; line-height: 1.2; font-weight: 650; }
        .mp-logo { display: block; width: 164px; max-width: 45vw; height: auto; object-fit: contain; }
        @media (min-width: 560px) {
          .mp-top { min-height: 112px; padding-top: 18px; }
          .mp-content { width: min(100% - 32px, 510px); }
          .mp-card { padding: 19px 20px; }
          .mp-action-card { padding: 20px 20px 22px; }
        }
        @media (max-width: 360px) {
          .mp-content { width: calc(100% - 16px); }
          .mp-detail-row { grid-template-columns: minmax(0, 1fr) auto; }
          .mp-detail-row .mp-copy { grid-column: 2; justify-self: end; }
          .mp-proof-form { grid-template-columns: 1fr; }
          .mp-submit { min-height: 47px; }
        }
      `}</style>

      <header className="mp-top">
        <div className="mp-top-inner">
          <div className="mp-operator-line">
            <p className="mp-operator-label">Opérateur :</p>
            <p className="mp-operator-name">{payment.operator}</p>
          </div>
        </div>
      </header>

      <div className="mp-content">
        <section className="mp-notice" aria-label="Instructions de paiement">
          <p className="mp-notice-copy">
            Envoyez exactement {payment.amount} {payment.currency} au numéro indiqué. Vérifiez le bénéficiaire avant de confirmer le paiement.
          </p>
        </section>

        <section className="mp-card" aria-label="Détails du paiement">
          <h2 className="mp-step-heading">
            <span className="mp-step-number">1</span>
            <span>Vérifiez les informations avant d’envoyer les fonds.</span>
          </h2>
          <div className="mp-detail-row">
            <span className="mp-detail-label">Nom du compte</span>
            <span className="mp-detail-value">{payment.recipientName}</span>
            <button className="mp-copy" type="button" onClick={() => copyValue(payment.recipientName, "name")} aria-label="Copier le nom du compte">
              {copied === "name" ? "Copié" : "Copier"}
            </button>
          </div>
          <div className="mp-detail-row">
            <span className="mp-detail-label">Numéro de paiement</span>
            <span className="mp-detail-value">{payment.recipientPhone}</span>
            <button className="mp-copy" type="button" onClick={() => copyValue(payment.recipientPhone.replaceAll(" ", ""), "phone")} aria-label="Copier le numéro de paiement">
              {copied === "phone" ? "Copié" : "Copier"}
            </button>
          </div>
          <div className="mp-total">
            <span className="mp-total-label">Montant à payer</span>
            <span className="mp-total-value">{payment.amount} {payment.currency}</span>
          </div>
          <p className="mp-order-ref">Référence de commande : {payment.reference}</p>
        </section>

        <section className="mp-card mp-action-card" aria-label="Effectuer et confirmer le paiement">
          <h2 className="mp-step-heading">
            <span className="mp-step-number">2</span>
            <span>Payez avec TMoney en quelques secondes.</span>
          </h2>
          <p className="mp-instructions">Touchez le bouton pour ouvrir le composeur avec le code prérempli, puis suivez les étapes affichées par votre opérateur.</p>
          <a className="mp-dialer" href={`tel:${encodeURIComponent(payment.ussdCode)}`} data-testid="button-manual-open-dialer">
            <span>Cliquez ici pour payer</span>
          </a>
          <button
            className="mp-copy"
            style={{ display: "block", margin: "10px auto 0", padding: "7px 12px", fontSize: 12 }}
            type="button"
            onClick={() => copyValue(`Paiement TMoney · ${payment.amount} ${payment.currency}\nBénéficiaire : ${payment.recipientName}\nNuméro : ${payment.recipientPhone}\nCode USSD : ${payment.ussdCode}`, "instructions")}
            data-testid="button-manual-copy-instructions"
          >
            {copied === "instructions" ? "Informations copiées" : "Copier les informations"}
          </button>

          <h2 className="mp-step-heading mp-proof-title">
            <span className="mp-step-number">3</span>
            <span>Envoyez la référence de votre paiement.</span>
          </h2>
          <p className="mp-proof-hint">Saisissez la référence de transaction ou le message reçu après le paiement.</p>
          {submitted ? (
            <div className="mp-success" role="status">
              Référence reçue. Votre paiement sera vérifié avant sa validation.
            </div>
          ) : (
            <form className="mp-proof-form" onSubmit={submitProof}>
              <label htmlFor="manual-proof-demo" style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}>
                Référence de transaction
              </label>
              <input
                className="mp-proof-input"
                id="manual-proof-demo"
                type="text"
                value={proof}
                onChange={(event) => setProof(event.target.value.slice(0, 120))}
                placeholder="Entrez la référence du paiement"
                maxLength={120}
                required
                data-testid="input-manual-proof"
              />
              <button className="mp-submit" type="submit" disabled={!proof.trim() || submitting} data-testid="button-manual-submit-proof">
                {submitting ? "Envoi…" : "Soumettre"}
              </button>
            </form>
          )}

        </section>

        <footer>
          <div className="mp-footer" aria-label="Hébergé et sécurisé par RobotPay">
            <span className="mp-footer-kicker">Hébergé et sécurisé par</span>
            <img className="mp-logo" src="/robotpay-logo.png" alt="RobotPay" />
          </div>
        </footer>
      </div>
    </main>
  );
}
