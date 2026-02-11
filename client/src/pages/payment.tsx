import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Shield, Loader2, Phone, Copy, CheckCircle, XCircle,
  Clock, ArrowRight, AlertTriangle, Smartphone
} from "lucide-react";

type PaymentNumber = {
  id: number;
  phoneNumber: string;
  country: string;
  operator: string | null;
};

type MerchantInfo = {
  name: string;
  slug: string;
  countries: string[];
};

type VerificationResult = {
  verified: boolean;
  transaction?: {
    txId: string;
    amount: number;
    country: string;
    status: string;
    createdAt: string;
  };
  message: string;
};

export default function PaymentPage() {
  const [, params] = useRoute("/pay/:slug");
  const slug = params?.slug || "";
  const { toast } = useToast();

  const [merchantInfo, setMerchantInfo] = useState<MerchantInfo | null>(null);
  const [paymentNumbers, setPaymentNumbers] = useState<PaymentNumber[]>([]);
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [txId, setTxId] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);

  const [selectedCountry, setSelectedCountry] = useState<string>("");

  useEffect(() => {
    if (!slug) return;
    fetchMerchantInfo();
  }, [slug]);

  const fetchMerchantInfo = async () => {
    setIsLoadingInfo(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/payment/${slug}/info`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Marchand introuvable");
      }
      const data = await res.json();
      setMerchantInfo(data.merchant);
      setPaymentNumbers(data.numbers);
      if (data.merchant.countries.length > 0) {
        setSelectedCountry(data.merchant.countries[0]);
      }
    } catch (err: any) {
      setLoadError(err.message);
    } finally {
      setIsLoadingInfo(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txId.trim()) return;

    setIsVerifying(true);
    setVerificationResult(null);
    try {
      const res = await fetch("/api/verify-transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txId: txId.trim(), merchantSlug: slug }),
      });
      const data = await res.json();
      setVerificationResult(data);
    } catch (err: any) {
      toast({ title: "Erreur", description: "Impossible de verifier la transaction", variant: "destructive" });
    } finally {
      setIsVerifying(false);
    }
  };

  const copyNumber = (number: string) => {
    navigator.clipboard.writeText(number);
    toast({ title: "Numero copie !" });
  };

  const filteredNumbers = selectedCountry
    ? paymentNumbers.filter(n => n.country === selectedCountry)
    : paymentNumbers;

  if (isLoadingInfo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError || !merchantInfo) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="p-6 text-center space-y-3">
            <XCircle className="w-10 h-10 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold text-foreground">Page introuvable</h2>
            <p className="text-sm text-muted-foreground">{loadError || "Ce lien de paiement n'est pas valide."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 z-50 bg-background">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">WestPay</p>
              <p className="text-xs text-muted-foreground">Paiement securise</p>
            </div>
          </div>
          <Badge variant="secondary" data-testid="text-pay-merchant">{merchantInfo.name}</Badge>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-bold text-foreground" data-testid="text-pay-title">
            Effectuer un paiement
          </h1>
          <p className="text-sm text-muted-foreground">
            Envoyez votre paiement Mobile Money puis soumettez l'ID de transaction pour confirmation.
          </p>
        </div>

        {merchantInfo.countries.length > 1 && (
          <div className="flex items-center gap-2 justify-center flex-wrap">
            {merchantInfo.countries.map(country => (
              <Button
                key={country}
                variant={selectedCountry === country ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCountry(country)}
                data-testid={`button-country-${country}`}
              >
                {country}
              </Button>
            ))}
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="w-4 h-4 text-primary" />
              Etape 1 : Envoyer le paiement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Envoyez le montant souhaite a l'un des numeros suivants via Mobile Money :
            </p>

            {filteredNumbers.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Aucun numero disponible pour ce pays
              </div>
            ) : (
              filteredNumbers.map(num => (
                <div
                  key={num.id}
                  className="flex items-center justify-between gap-2 p-3 rounded-md border"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <Smartphone className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground font-mono" data-testid={`text-pay-number-${num.id}`}>
                        {num.phoneNumber}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {num.operator && (
                          <span className="text-xs text-muted-foreground">{num.operator}</span>
                        )}
                        <Badge variant="outline" className="text-xs">{num.country}</Badge>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyNumber(num.phoneNumber)}
                    data-testid={`button-copy-number-${num.id}`}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}

            <Card className="border-dashed">
              <CardContent className="p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    Conservez l'ID de transaction (TX) que vous recevrez par SMS apres votre paiement. Vous en aurez besoin a l'etape suivante.
                  </p>
                </div>
              </CardContent>
            </Card>
          </CardContent>
        </Card>

        <div className="flex items-center justify-center">
          <ArrowRight className="w-5 h-5 text-muted-foreground" />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-primary" />
              Etape 2 : Confirmer le paiement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tx-id">ID de transaction (TX)</Label>
                <Input
                  id="tx-id"
                  value={txId}
                  onChange={(e) => { setTxId(e.target.value.toUpperCase()); setVerificationResult(null); }}
                  placeholder="Ex: TX12345"
                  required
                  data-testid="input-tx-id"
                />
                <p className="text-xs text-muted-foreground">
                  Entrez l'ID de transaction que vous avez recu par SMS apres votre paiement Mobile Money.
                </p>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isVerifying || !txId.trim()}
                data-testid="button-verify-tx"
              >
                {isVerifying ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle className="w-4 h-4 mr-2" />
                )}
                Verifier la transaction
              </Button>
            </form>

            {verificationResult && (
              <div className="mt-4">
                {verificationResult.verified ? (
                  <Card className="border-green-500/30 bg-green-500/5">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <p className="text-sm font-semibold text-green-600 dark:text-green-400" data-testid="text-verify-success">
                          Transaction verifiee
                        </p>
                      </div>
                      {verificationResult.transaction && (
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Ref:</span>
                            <span className="font-mono text-foreground" data-testid="text-verify-txid">{verificationResult.transaction.txId}</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Montant:</span>
                            <span className="font-semibold text-foreground" data-testid="text-verify-amount">
                              {verificationResult.transaction.amount.toLocaleString("fr-FR")} F CFA
                            </span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Pays:</span>
                            <span className="text-foreground">{verificationResult.transaction.country}</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Statut:</span>
                            <Badge variant="default">{verificationResult.transaction.status}</Badge>
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">{verificationResult.message}</p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-destructive/30 bg-destructive/5">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        {verificationResult.message.includes("en attente") || verificationResult.message.includes("pas encore") ? (
                          <Clock className="w-5 h-5 text-amber-500" />
                        ) : (
                          <XCircle className="w-5 h-5 text-destructive" />
                        )}
                        <div>
                          <p className="text-sm font-semibold text-foreground" data-testid="text-verify-failed">
                            {verificationResult.message.includes("en attente") || verificationResult.message.includes("pas encore")
                              ? "Transaction en attente"
                              : "Transaction non trouvee"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">{verificationResult.message}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-center py-4">
          <p className="text-xs text-muted-foreground">
            Paiement securise via WestPay - Ne partagez jamais vos informations personnelles
          </p>
        </div>
      </div>
    </div>
  );
}
