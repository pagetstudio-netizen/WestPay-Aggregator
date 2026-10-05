import { useEffect } from "react";
import ManualPaymentStep, { type ManualPaymentDetails } from "@/components/manual-payment-step";
import { useLanguage } from "@/lib/language";

const previewPayment: ManualPaymentDetails = {
  recipientPhone: "00 00 00 00",
  recipientName: "Compte démo",
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
    <main
      aria-label="Aperçu de démonstration, paiement et envoi de preuve désactivés."
      style={{ minHeight: "100vh", width: "100%", margin: 0, padding: 0, background: "#f5f5f5" }}
    >
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
