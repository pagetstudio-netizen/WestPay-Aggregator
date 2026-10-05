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

export function VerificationFirst() {
  const [verified, setVerified] = useState(false);
  const [proof, setProof] = useState("");
  const [copied, setCopied] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const copy = async (value: string, kind: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setCopied("");
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
    <main className="vf-page">
      <style>{`
        .vf-page {
          --vf-ink: #183b39;
          --vf-muted: #647875;
          --vf-forest: #164f47;
          --vf-mint: #d9eee2;
          --vf-line: #dce6dc;
          min-height: 100vh;
          padding: 0 0 34px;
          color: var(--vf-ink);
          background: #edf2e9;
          font-family: "Avenir Next", Avenir, "Segoe UI", sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .vf-page * { box-sizing: border-box; }
        .vf-header {
          position: relative;
          overflow: hidden;
          background: #174b43;
          color: #f5f4e9;
          padding: 23px 20px 26px;
        }
        .vf-header::after {
          content: "";
          position: absolute;
          width: 210px;
          height: 210px;
          right: -95px;
          top: -132px;
          border: 1px solid rgba(231, 242, 222, .22);
          border-radius: 50%;
          box-shadow: 0 0 0 18px rgba(231, 242, 222, .035), 0 0 0 38px rgba(231, 242, 222, .025);
          pointer-events: none;
        }
        .vf-header-inner, .vf-content { width: min(100% - 32px, 520px); margin-inline: auto; }
        .vf-brand-line { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
        .vf-brand { display: flex; gap: 10px; align-items: center; font-size: 14px; font-weight: 760; letter-spacing: .015em; }
        .vf-brand-mark {
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          border: 1px solid rgba(235, 246, 228, .42);
          border-radius: 11px;
          color: #e1efcf;
          font-family: Georgia, serif;
          font-size: 20px;
          font-weight: 700;
        }
        .vf-secure-label {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #d3e3d8;
          font-size: 11px;
          font-weight: 650;
          letter-spacing: .045em;
        }
        .vf-secure-dot { width: 7px; height: 7px; border-radius: 50%; background: #a8dcae; box-shadow: 0 0 0 3px rgba(168, 220, 174, .12); }
        .vf-header-title { margin: 25px 0 4px; font: 500 clamp(27px, 7vw, 35px)/1.08 Georgia, "Times New Roman", serif; letter-spacing: -.035em; }
        .vf-header-sub { margin: 0; color: #d1e1d7; font-size: 13px; line-height: 1.5; }
        .vf-content { position: relative; margin-top: -1px; }
        .vf-warning {
          display: flex;
          gap: 11px;
          padding: 13px 15px;
          border: 1px solid #eac6a0;
          border-top: 0;
          border-radius: 0 0 13px 13px;
          background: #fff5e8;
          color: #703d25;
        }
        .vf-warning-icon { flex: none; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #f2ddc3; font: 700 13px Georgia, serif; }
        .vf-warning p { margin: 0; font-size: 12px; line-height: 1.45; }
        .vf-warning strong { font-weight: 800; }
        .vf-card {
          margin-top: 16px;
          overflow: hidden;
          border: 1px solid #d8e3d8;
          border-radius: 17px;
          background: #fbfcf7;
          box-shadow: 0 9px 25px rgba(43, 72, 55, .075);
        }
        .vf-card-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 17px 18px 13px; }
        .vf-step-kicker { margin: 0 0 3px; color: #6c8177; font-size: 10px; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
        .vf-card-title { margin: 0; font-size: 16px; font-weight: 760; letter-spacing: -.025em; }
        .vf-step-pill { flex: none; padding: 5px 9px; border: 1px solid #d7e4d9; border-radius: 999px; color: #526b5e; font-size: 10px; font-weight: 700; }
        .vf-recipient {
          margin: 0 15px;
          padding: 16px 15px 14px;
          border: 1px solid #d5e4d8;
          border-radius: 13px;
          background: #f0f6ee;
        }
        .vf-recipient-label { margin: 0 0 7px; color: #678073; font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
        .vf-recipient-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .vf-recipient-name { margin: 0; font: 500 28px/1 Georgia, "Times New Roman", serif; letter-spacing: -.03em; }
        .vf-verified-seal { display: flex; align-items: center; gap: 5px; padding: 6px 8px; border: 1px solid #c7dfca; border-radius: 999px; background: #e5f2e4; color: #286143; font-size: 10px; font-weight: 750; white-space: nowrap; }
        .vf-check-icon { font-size: 12px; }
        .vf-number-line { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 13px; padding-top: 11px; border-top: 1px solid #dce8dc; }
        .vf-number { font-size: 14px; font-weight: 720; letter-spacing: .07em; }
        .vf-copy {
          min-height: 29px;
          padding: 5px 9px;
          border: 1px solid #cbd9ce;
          border-radius: 7px;
          background: #fbfcf7;
          color: #28584b;
          font: inherit;
          font-size: 10px;
          font-weight: 750;
          cursor: pointer;
          transition: transform .16s ease, background-color .16s ease;
        }
        .vf-copy:hover { transform: translateY(-1px); background: #e7f1e7; }
        .vf-amount {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 12px;
          padding: 16px 19px 15px;
          margin-top: 13px;
          background: #174b43;
          color: #f7f3e5;
        }
        .vf-amount-label { padding-bottom: 4px; color: #c4d9cd; font-size: 11px; font-weight: 650; }
        .vf-amount-value { margin: 0; font: 500 clamp(29px, 8vw, 37px)/1 Georgia, "Times New Roman", serif; letter-spacing: -.035em; white-space: nowrap; }
        .vf-amount-value small { margin-left: 4px; font: 650 12px "Avenir Next", Avenir, sans-serif; letter-spacing: .05em; }
        .vf-order-ref { margin: 0; padding: 10px 18px 13px; color: #788a7e; font-size: 10px; }
        .vf-confirm {
          display: flex;
          align-items: flex-start;
          gap: 11px;
          margin: 13px 15px 15px;
          padding: 12px;
          border: 1px solid #d7e3d8;
          border-radius: 11px;
          background: #fff;
          cursor: pointer;
        }
        .vf-confirm input { flex: none; width: 19px; height: 19px; margin: 0; accent-color: #216450; cursor: pointer; }
        .vf-confirm-copy { display: block; color: #3b5950; font-size: 12px; line-height: 1.45; font-weight: 650; }
        .vf-confirm-copy strong { display: block; color: #20483e; font-size: 12px; font-weight: 800; }
        .vf-next {
          display: block;
          width: calc(100% - 30px);
          min-height: 53px;
          margin: 0 15px 16px;
          border: 0;
          border-radius: 10px;
          background: #1a6651;
          color: #fffdf4;
          font: inherit;
          font-size: 14px;
          font-weight: 780;
          cursor: pointer;
          text-align: center;
          text-decoration: none;
          line-height: 53px;
          transition: transform .16s ease, opacity .16s ease;
        }
        .vf-next:hover { transform: translateY(-1px); }
        .vf-next.is-locked { background: #cad5cc; color: #5c6b62; cursor: not-allowed; }
        .vf-next.is-locked:hover { transform: none; }
        .vf-next-note { margin: -7px 15px 15px; color: #73847a; font-size: 10px; text-align: center; }
        .vf-proof { padding: 17px 18px 18px; }
        .vf-proof-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .vf-proof-title { margin: 0; font: 500 20px Georgia, "Times New Roman", serif; letter-spacing: -.025em; }
        .vf-proof-caption { margin: 7px 0 13px; color: var(--vf-muted); font-size: 11px; line-height: 1.5; }
        .vf-proof-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
        .vf-proof-input { min-width: 0; min-height: 47px; padding: 0 12px; border: 1px solid #cbd9ce; border-radius: 8px; background: #fff; color: var(--vf-ink); font: inherit; font-size: 12px; outline: none; }
        .vf-proof-input:focus { border-color: #38806b; box-shadow: 0 0 0 3px rgba(56, 128, 107, .12); }
        .vf-proof-input::placeholder { color: #9aa9a0; }
        .vf-submit { min-width: 97px; padding: 0 13px; border: 0; border-radius: 8px; background: #1a6651; color: #fff; font: inherit; font-size: 12px; font-weight: 750; cursor: pointer; }
        .vf-submit:disabled { background: #cad5cc; color: #637168; cursor: not-allowed; }
        .vf-success { padding: 13px; border: 1px solid #c1ddc7; border-radius: 9px; background: #eff7ed; color: #285d41; font-size: 12px; line-height: 1.45; font-weight: 700; }
        .vf-footer { display: flex; justify-content: center; align-items: center; gap: 8px; margin: 19px auto 0; color: #75847c; font-size: 10px; }
        .vf-footer-mark { display: grid; place-items: center; width: 20px; height: 20px; border: 1px solid #b9c9bc; border-radius: 6px; color: #285d4f; font: 700 12px Georgia, serif; }
        @media (max-width: 365px) {
          .vf-header-inner, .vf-content { width: calc(100% - 22px); }
          .vf-card-heading { padding-inline: 13px; }
          .vf-recipient { margin-inline: 11px; padding-inline: 12px; }
          .vf-amount { padding-inline: 14px; }
          .vf-proof-form { grid-template-columns: 1fr; }
          .vf-submit { min-height: 44px; }
        }
        @media (prefers-reduced-motion: reduce) { .vf-page *, .vf-page *::before, .vf-page *::after { transition-duration: .01ms !important; } }
      `}</style>

      <header className="vf-header">
        <div className="vf-header-inner">
          <div className="vf-brand-line">
            <div className="vf-brand"><span className="vf-brand-mark">R</span><span>RobotPay · Paiement sécurisé</span></div>
            <span className="vf-secure-label"><i className="vf-secure-dot" /> ÉTAPE 1 / 2</span>
          </div>
          <h1 className="vf-header-title">Vérifiez avant d’envoyer.</h1>
          <p className="vf-header-sub">Prenez un instant pour confirmer les détails du bénéficiaire.</p>
        </div>
      </header>

      <div className="vf-content">
        <aside className="vf-warning" role="note">
          <span className="vf-warning-icon">!</span>
          <p><strong>Ne partagez jamais votre code secret.</strong> Le paiement se fait uniquement dans le menu sécurisé TMoney. RobotPay ne vous demandera jamais votre PIN.</p>
        </aside>

        <section className="vf-card" aria-labelledby="vf-detail-heading">
          <div className="vf-card-heading">
            <div><p className="vf-step-kicker">Contrôle du paiement</p><h2 className="vf-card-title" id="vf-detail-heading">À qui envoyez-vous l’argent ?</h2></div>
            <span className="vf-step-pill">1 · Vérification</span>
          </div>

          <div className="vf-recipient">
            <p className="vf-recipient-label">Bénéficiaire TMoney</p>
            <div className="vf-recipient-row">
              <p className="vf-recipient-name">{payment.recipientName}</p>
              <span className="vf-verified-seal"><span className="vf-check-icon">✓</span> Destinataire</span>
            </div>
            <div className="vf-number-line">
              <span className="vf-number">{payment.recipientPhone}</span>
              <button className="vf-copy" type="button" onClick={() => copy(payment.recipientPhone.replaceAll(" ", ""), "phone")}>{copied === "phone" ? "Copié ✓" : "Copier le numéro"}</button>
            </div>
          </div>

          <div className="vf-amount">
            <span className="vf-amount-label">Vous allez envoyer exactement</span>
            <p className="vf-amount-value">{payment.amount}<small>{payment.currency}</small></p>
          </div>
          <p className="vf-order-ref">Commande {payment.reference} <span aria-hidden="true">·</span> Opérateur {payment.operator}</p>

          <label className="vf-confirm">
            <input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} />
            <span className="vf-confirm-copy"><strong>J’ai vérifié le nom, le numéro et le montant.</strong> Je confirme que ces informations correspondent à mon paiement.</span>
          </label>
          {verified ? (
            <a className="vf-next" href={`tel:${encodeURIComponent(payment.ussdCode)}`} data-testid="button-manual-open-dialer">Continuer vers le menu TMoney&nbsp; →</a>
          ) : (
            <button className="vf-next is-locked" type="button" disabled aria-disabled="true">Confirmez les détails pour continuer</button>
          )}
          {!verified && <p className="vf-next-note">Le composeur USSD reste verrouillé jusqu’à votre confirmation.</p>}
        </section>

        <section className="vf-card vf-proof" aria-labelledby="vf-proof-heading">
          <div className="vf-proof-top">
            <div><p className="vf-step-kicker">Après votre paiement</p><h2 className="vf-proof-title" id="vf-proof-heading">Envoyez une preuve</h2></div>
            <span className="vf-step-pill">2 · Confirmation</span>
          </div>
          <p className="vf-proof-caption">Saisissez la référence de transaction ou le message reçu. Votre paiement sera vérifié avant validation.</p>
          {submitted ? (
            <div className="vf-success" role="status">Référence reçue. Nous vérifierons le paiement avant de le valider.</div>
          ) : (
            <form className="vf-proof-form" onSubmit={submitProof}>
              <label htmlFor="vf-proof" style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}>Référence de transaction</label>
              <input className="vf-proof-input" id="vf-proof" type="text" value={proof} onChange={(event) => setProof(event.target.value.slice(0, 120))} placeholder="Référence de transaction" maxLength={120} required data-testid="input-manual-proof" />
              <button className="vf-submit" type="submit" disabled={!proof.trim() || submitting} data-testid="button-manual-submit-proof">{submitting ? "Envoi…" : "Soumettre"}</button>
            </form>
          )}
        </section>

        <footer className="vf-footer"><span className="vf-footer-mark">R</span> Paiement hébergé et sécurisé par RobotPay</footer>
      </div>
    </main>
  );
}
