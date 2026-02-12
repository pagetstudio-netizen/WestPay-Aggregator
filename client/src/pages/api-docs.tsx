import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Shield, Lock, Loader2, BookOpen, Code, Server, Key,
  ArrowRight, CheckCircle, AlertTriangle, Globe, Zap, Copy, Check
} from "lucide-react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      toast({ title: "Code copie !" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Impossible de copier", variant: "destructive" });
    }
  }, [text, toast]);

  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={handleCopy}
      className="shrink-0"
      data-testid="button-copy-code"
    >
      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
    </Button>
  );
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b">
          <span className="text-xs text-muted-foreground font-medium truncate">{label || "Code"}</span>
          <CopyButton text={code} />
        </div>
        <div className="p-3 overflow-x-auto">
          <pre className="text-xs sm:text-sm font-mono text-foreground whitespace-pre-wrap break-all sm:break-normal">{code}</pre>
        </div>
      </CardContent>
    </Card>
  );
}

function PinGate({ onAccess }: { onAccess: (data: { token: string; merchant: { name: string; email: string } }) => void }) {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/docs/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Acces refuse");
      onAccess(data);
    } catch (err: any) {
      toast({ title: "Acces refuse", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-2 pb-4">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
              <Lock className="w-6 h-6 text-primary" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-foreground" data-testid="text-docs-title">
            Documentation API WestPay
          </h1>
          <p className="text-xs text-muted-foreground">Entrez vos identifiants pour acceder a la documentation</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="doc-email">Email du marchand</Label>
              <Input
                id="doc-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@ecomat.com"
                required
                data-testid="input-docs-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-pin">Code PIN (6 chiffres)</Label>
              <Input
                id="doc-pin"
                type="password"
                value={pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setPin(val);
                }}
                placeholder="------"
                maxLength={6}
                required
                data-testid="input-docs-pin"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading || pin.length !== 6} data-testid="button-docs-access">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Shield className="w-4 h-4 mr-2" />}
              Acceder a la documentation
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function EndpointDoc({
  method,
  path,
  description,
  requestBody,
  responseBody,
  auth,
}: {
  method: string;
  path: string;
  description: string;
  requestBody?: string;
  responseBody: string;
  auth: boolean;
}) {
  const methodColor = method === "GET" ? "default" : "secondary";

  return (
    <Card>
      <CardHeader className="pb-3 px-3 sm:px-6">
        <div className="flex items-start gap-2 flex-wrap">
          <Badge variant={methodColor}>{method}</Badge>
          <code className="text-xs sm:text-sm font-mono font-semibold text-foreground break-all">{path}</code>
          {auth && <Badge variant="outline"><Lock className="w-3 h-3 mr-1" />JWT</Badge>}
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground mt-2">{description}</p>
      </CardHeader>
      <CardContent className="space-y-3 px-3 sm:px-6">
        {requestBody && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
              <ArrowRight className="w-3 h-3" />Requete
            </p>
            <CodeBlock code={requestBody} label="Request Body" />
          </div>
        )}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-green-500" />Reponse
          </p>
          <CodeBlock code={responseBody} label="Response" />
        </div>
      </CardContent>
    </Card>
  );
}

function ApiDocumentation({ merchantName }: { merchantName: string }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 z-50 bg-background">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xs sm:text-sm font-bold text-foreground truncate">WestPay API Documentation</h1>
              <p className="text-xs text-muted-foreground">v1.0</p>
            </div>
          </div>
          <Badge variant="secondary" className="shrink-0" data-testid="text-docs-merchant">{merchantName}</Badge>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-6 sm:py-8 space-y-6 sm:space-y-8">
        <section className="space-y-4">
          <h2 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2" data-testid="text-docs-intro-title">
            <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" />
            Introduction
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            WestPay gere les paiements Mobile Money pour vos utilisateurs via une page de paiement securisee.
            Redirigez simplement vos clients vers WestPay, et ils seront renvoyes sur votre site apres le paiement.
            L'API ci-dessous vous permet de consulter vos transactions et soldes.
          </p>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Important</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">Ne partagez jamais vos cles API. Regenerez-les immediatement si vous suspectez une fuite.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
            <Key className="w-5 h-5 text-primary shrink-0" />
            Authentification
          </h2>
          <p className="text-sm text-muted-foreground">Toutes les requetes API doivent inclure les headers suivants :</p>
          <CodeBlock
            code={`Authorization: Bearer <JWT_TOKEN>\nX-API-KEY: <VOTRE_CLE_API>`}
            label="Headers"
          />
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
              <span className="text-xs sm:text-sm text-foreground">Le JWT Token est obtenu lors de la connexion</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
              <span className="text-xs sm:text-sm text-foreground">La cle API est disponible dans votre tableau de bord</span>
            </div>
          </div>
        </section>

        <Separator />

        <section className="space-y-6">
          <h2 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
            <Server className="w-5 h-5 text-primary shrink-0" />
            Endpoints
          </h2>

          <EndpointDoc
            method="POST"
            path="/api/auth/merchant/login"
            description="Authentification du marchand. Retourne un token JWT valide 24h."
            requestBody={`{
  "email": "contact@ecomat.com",
  "password": "votre_mot_de_passe"
}`}
            responseBody={`{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "email": "contact@ecomat.com",
    "name": "EcoMat Togo",
    "slug": "ecomat"
  }
}`}
            auth={false}
          />

          <EndpointDoc
            method="GET"
            path="/api/merchant/balance"
            description="Recupere le solde par pays du marchand connecte."
            responseBody={`[
  {
    "id": 1,
    "merchantId": 1,
    "country": "Togo",
    "apiKey": "TGO-...",
    "balance": 12500,
    "active": true
  }
]`}
            auth={true}
          />

          <EndpointDoc
            method="GET"
            path="/api/merchant/transactions"
            description="Liste toutes les transactions du marchand connecte."
            responseBody={`[
  {
    "id": 1,
    "merchantId": 1,
    "country": "Togo",
    "txId": "TX12345",
    "amount": 2000,
    "payerNumber": "+22898123456",
    "status": "confirmed",
    "createdAt": "2026-01-15T10:30:00Z"
  }
]`}
            auth={true}
          />

          <EndpointDoc
            method="GET"
            path="/api/merchant/api-keys"
            description="Liste les cles API du marchand par pays actif."
            responseBody={`[
  {
    "id": 1,
    "merchantId": 1,
    "country": "Togo",
    "apiKey": "TGO-A1B2C3D4E5F6...",
    "balance": 12500,
    "active": true
  }
]`}
            auth={true}
          />

          <EndpointDoc
            method="POST"
            path="/api/merchant/regenerate-api"
            description="Regenere la cle API pour un pays specifique. L'ancienne cle est immediatement invalidee."
            requestBody={`{
  "merchantCountryId": 1
}`}
            responseBody={`{
  "success": true,
  "apiKey": "TGO-NOUVELLE_CLE..."
}`}
            auth={true}
          />

          <EndpointDoc
            method="GET"
            path="/api/merchant/stats"
            description="Statistiques du marchand : nombre de transactions et volume total."
            responseBody={`{
  "transactionCount": 15,
  "totalVolume": 125000
}`}
            auth={true}
          />
        </section>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary shrink-0" />
            Webhook SMS (Android SMS Forwarder)
          </h2>
          <p className="text-sm text-muted-foreground">
            Pour recevoir des paiements automatiquement, configurez l'application Android SMS Forwarder
            pour envoyer les SMS Mobile Money a votre serveur WestPay.
          </p>

          <EndpointDoc
            method="POST"
            path="/sms/receive"
            description="Recoit un SMS forwarde depuis un telephone Android. Le systeme parse automatiquement le TX ID, le montant et credite le marchand."
            requestBody={`{
  "from_sim": "+22899935673",
  "sms_text": "Vous avez recu 5000 F CFA de +22898123456. TX12345",
  "received_at": "2026-01-15T10:30:00Z"
}`}
            responseBody={`{
  "status": "processed",
  "txId": "TX12345",
  "amount": 5000,
  "country": "Togo"
}`}
            auth={false}
          />
        </section>

        <Separator />

        <section className="space-y-6">
          <h2 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-primary shrink-0" />
            Page de paiement
          </h2>
          <p className="text-sm text-muted-foreground">
            WestPay fournit une page de paiement securisee. Redirigez simplement vos utilisateurs vers cette page avec le montant et le pays.
            Apres le paiement, l'utilisateur est automatiquement renvoye sur votre site avec les informations de la transaction.
          </p>

          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Flux de paiement</p>
                  <ol className="text-xs sm:text-sm text-muted-foreground mt-2 space-y-2 list-decimal pl-4">
                    <li>Redirigez votre utilisateur vers :
                      <code className="bg-muted px-1 rounded text-xs block mt-1 break-all">/pay?merchant=votre-slug&amount=5000&country=Togo&redirect=https://votresite.com/merci</code>
                    </li>
                    <li>Le montant est affiche et verrouille (non modifiable par l'utilisateur)</li>
                    <li>L'utilisateur choisit sa methode de paiement et effectue le transfert</li>
                    <li>L'utilisateur soumet l'ID de transaction (TX) recu par SMS</li>
                    <li>WestPay enregistre le paiement et redirige l'utilisateur vers votre site avec :
                      <code className="bg-muted px-1 rounded text-xs block mt-1 break-all">?status=success&amount=5000&tx_id=TRF123</code>
                    </li>
                  </ol>
                </div>
              </div>
            </CardContent>
          </Card>

          <EndpointDoc
            method="GET"
            path="/api/payment/:slug/info"
            description="Recupere les informations publiques du marchand et ses numeros de paiement actifs. Utilise par la page de paiement."
            responseBody={`{
  "merchant": {
    "name": "EcoMat Togo",
    "slug": "ecomat",
    "countries": ["Togo", "Benin"]
  },
  "numbers": [
    {
      "id": 1,
      "phoneNumber": "+22899935673",
      "country": "Togo",
      "operator": "Moov Money"
    }
  ]
}`}
            auth={false}
          />
        </section>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
            <Code className="w-5 h-5 text-primary shrink-0" />
            Codes d'erreur
          </h2>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 text-foreground font-semibold">Code</th>
                      <th className="text-left p-3 text-foreground font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="p-3"><Badge variant="secondary">200</Badge></td>
                      <td className="p-3 text-muted-foreground text-xs sm:text-sm">Requete reussie</td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-3"><Badge variant="secondary">400</Badge></td>
                      <td className="p-3 text-muted-foreground text-xs sm:text-sm">Requete invalide (parametres manquants)</td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-3"><Badge variant="secondary">401</Badge></td>
                      <td className="p-3 text-muted-foreground text-xs sm:text-sm">Non autorise (token invalide ou manquant)</td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-3"><Badge variant="secondary">403</Badge></td>
                      <td className="p-3 text-muted-foreground text-xs sm:text-sm">Acces interdit (role insuffisant)</td>
                    </tr>
                    <tr>
                      <td className="p-3"><Badge variant="secondary">500</Badge></td>
                      <td className="p-3 text-muted-foreground text-xs sm:text-sm">Erreur interne du serveur</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-lg sm:text-xl font-bold text-foreground">Exemples (JavaScript)</h2>

          <p className="text-sm font-semibold text-foreground">Authentification et consultation</p>
          <CodeBlock
            label="JavaScript - Connexion & Solde"
            code={`// 1. Connexion
const loginRes = await fetch("https://westpay.replit.app/api/auth/merchant/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "contact@ecomat.com",
    password: "votre_mot_de_passe"
  })
});
const { token } = await loginRes.json();

// 2. Recuperer le solde
const balanceRes = await fetch("https://westpay.replit.app/api/merchant/balance", {
  headers: {
    "Authorization": \`Bearer \${token}\`,
    "X-API-KEY": "TGO-VOTRE_CLE_API"
  }
});
const balance = await balanceRes.json();
console.log("Solde:", balance);

// 3. Lister les transactions
const txRes = await fetch("https://westpay.replit.app/api/merchant/transactions", {
  headers: {
    "Authorization": \`Bearer \${token}\`,
    "X-API-KEY": "TGO-VOTRE_CLE_API"
  }
});
const transactions = await txRes.json();`}
          />

          <p className="text-sm font-semibold text-foreground mt-4">Rediriger vos utilisateurs vers la page de paiement</p>
          <CodeBlock
            label="JavaScript - Redirection paiement"
            code={`// Rediriger l'utilisateur vers la page de paiement WestPay
const montant = 5000; // Montant en F CFA
const pays = "Togo";
const retour = "https://votresite.com/merci"; // URL de retour

window.location.href = \`https://westpay.replit.app/pay?merchant=ecomat&amount=\${montant}&country=\${pays}&redirect=\${encodeURIComponent(retour)}\`;

// Apres le paiement, l'utilisateur sera redirige vers :
// https://votresite.com/merci?status=success&amount=5000&tx_id=TRF123456

// Parametres retournes :
// - status : "success" (paiement enregistre)
// - amount : le montant paye
// - tx_id  : l'identifiant de la transaction`}
          />
        </section>

        <div className="py-8 text-center">
          <p className="text-xs text-muted-foreground">WestPay API Documentation v1.0 - Usage interne uniquement</p>
        </div>
      </div>
    </div>
  );
}

export default function ApiDocsPage() {
  const [accessData, setAccessData] = useState<{ token: string; merchant: { name: string; email: string } } | null>(null);

  if (!accessData) {
    return <PinGate onAccess={setAccessData} />;
  }

  return <ApiDocumentation merchantName={accessData.merchant.name} />;
}
