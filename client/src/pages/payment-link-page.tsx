import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Link, AlertCircle, QrCode, ExternalLink, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type LinkInfo = {
  link: {
    id: number;
    uniqueId: string;
    name: string;
    amountType: string;
    amount: number | null;
    redirectUrl: string | null;
    paymentCount: number;
    totalRevenue: number;
    active: boolean;
    expiresAt: string | null;
    paymentLimit: number | null;
  };
  merchantName: string;
  merchantSlug: string;
};

export default function PaymentLinkPage() {
  const [, params] = useRoute("/link/:uniqueId");
  const uniqueId = params?.uniqueId || "";
  const [customAmount, setCustomAmount] = useState("");

  const { data, isLoading, error } = useQuery<LinkInfo>({
    queryKey: ["/api/payment-link", uniqueId],
    queryFn: async () => {
      const res = await fetch(`/api/payment-link/${uniqueId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Lien introuvable");
      }
      return res.json();
    },
    enabled: !!uniqueId,
    retry: false,
  });

  const proceed = () => {
    if (!data) return;
    const { link, merchantSlug } = data;
    const amount = link.amountType === "fixed" ? link.amount : Number(customAmount);
    if (!amount || amount <= 0) return;
    const params = new URLSearchParams({ merchant: merchantSlug, amount: String(amount) });
    if (link.redirectUrl) params.set("redirect", link.redirectUrl);
    window.location.href = `/pay?${params.toString()}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-xl font-bold">Lien invalide</h1>
          <p className="text-sm text-muted-foreground">{(error as Error)?.message || "Ce lien de paiement est introuvable ou a expiré."}</p>
        </div>
      </div>
    );
  }

  const { link, merchantName, merchantSlug } = data;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(window.location.href)}`;
  const isFlexible = link.amountType === "flexible";
  const canPay = isFlexible ? Number(customAmount) > 0 : true;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-4">
            <Link className="w-3.5 h-3.5" />
            Lien de paiement sécurisé
          </div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-link-title">{link.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">par <span className="font-medium text-foreground">{merchantName}</span></p>
        </div>

        <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-primary/5 border-b p-6 flex flex-col items-center gap-4">
            <img src={qrUrl} alt="QR Code" className="w-40 h-40 rounded-xl border bg-white p-1" data-testid="img-qr-code" />
            <div className="text-center">
              {link.amountType === "fixed" ? (
                <p className="text-3xl font-bold text-foreground" data-testid="text-amount">
                  {link.amount?.toLocaleString()} <span className="text-lg font-semibold text-muted-foreground">F CFA</span>
                </p>
              ) : (
                <Badge variant="secondary" className="text-sm px-3 py-1">Montant libre</Badge>
              )}
            </div>
          </div>

          <div className="p-6 space-y-4">
            {link.paymentLimit && (
              <div className="flex items-center justify-between text-sm bg-muted rounded-lg px-3 py-2">
                <span className="text-muted-foreground">Paiements</span>
                <span className="font-medium">{link.paymentCount} / {link.paymentLimit}</span>
              </div>
            )}

            {isFlexible && (
              <div className="space-y-2">
                <Label htmlFor="custom-amount">Montant à payer (F CFA)</Label>
                <Input
                  id="custom-amount"
                  type="number"
                  placeholder="Entrez le montant"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="text-lg"
                  data-testid="input-custom-amount"
                />
              </div>
            )}

            <Button
              className="w-full h-12 text-base font-semibold"
              onClick={proceed}
              disabled={!canPay}
              data-testid="button-pay-now"
            >
              <CheckCircle2 className="w-5 h-5 mr-2" />
              {isFlexible ? `Payer${customAmount ? ` ${Number(customAmount).toLocaleString()} F` : ""}` : `Payer ${link.amount?.toLocaleString()} F CFA`}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Paiement traité de manière sécurisée via WestPay
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span>{link.paymentCount} paiement{link.paymentCount !== 1 ? "s" : ""} reçu{link.paymentCount !== 1 ? "s" : ""}</span>
          <span>•</span>
          <span>Powered by WestPay</span>
        </div>
      </div>
    </div>
  );
}
