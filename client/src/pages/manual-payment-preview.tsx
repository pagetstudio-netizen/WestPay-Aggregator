import { useEffect } from "react";
import ManualPaymentStep, { type ManualPaymentDetails } from "@/components/manual-payment-step";
import { useLanguage } from "@/lib/language";

const previewPayment: ManualPaymentDetails = {
  recipientPhone: "00 00 00 00",
  recipientName: "RobotPay — démonstration",
  ussdCode: "*000#",
  instructions: "Après le transfert, saisissez la référence ou le message de confirmation ci-dessous.",
  paymentToken: "preview-only",
};

export default function ManualPaymentPreview() {
  const { setDefaultLang } = useLanguage();

  useEffect(() => {
    setDefaultLang("fr");
  }, [setDefaultLang]);

  return (
    <main style={{ minHeight: "100vh", padding: "16px 12px 32px", background: "#eef2ef" }}>
      <div
        role="note"
        style={{
          maxWidth: 512,
          margin: "0 auto 14px",
          padding: "12px 14px",
          border: "1px solid #efd48e",
          borderRadius: 9,
          background: "#fff8e7",
          color: "#604b1a",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 13,
          lineHeight: 1.45,
        }}
      >
        <strong style={{ display: "block", marginBottom: 4 }}>Aperçu de démonstration</strong>
        <span>
          Les coordonnées sont fictives. Le bouton de paiement et l’envoi de preuve ne déclenchent
          aucune opération depuis cet aperçu.
        </span>
      </div>
      <ManualPaymentStep
        paymentId={0}
        reference="DEMO-RP-0001"
        amount={3000}
        currency="XOF"
        operator="TMoney"
        payment={previewPayment}
        previewMode
      />
    </main>
  );
}
