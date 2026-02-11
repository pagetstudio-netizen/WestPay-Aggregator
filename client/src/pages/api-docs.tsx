import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Shield, Lock, Loader2, BookOpen, Code, Server, Key,
  ArrowRight, CheckCircle, AlertTriangle, Globe, Zap
} from "lucide-react";

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

function ApiDocumentation({ merchantName }: { merchantName: string }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 z-50 bg-background">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground">WestPay API Documentation</h1>
              <p className="text-xs text-muted-foreground">v1.0</p>
            </div>
          </div>
          <Badge variant="secondary" data-testid="text-docs-merchant">{merchantName}</Badge>
        </div>
      </header>

      <ScrollArea className="h-[calc(100vh-57px)]">
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2" data-testid="text-docs-intro-title">
              <Zap className="w-6 h-6 text-primary" />
              Introduction
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              L'API WestPay permet d'integrer les paiements Mobile Money dans vos applications.
              Chaque marchand dispose de cles API uniques par pays pour authentifier les requetes.
            </p>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Important</p>
                    <p className="text-sm text-muted-foreground">Ne partagez jamais vos cles API. Regenerez-les immediatement si vous suspectez une fuite.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <Separator />

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              Authentification
            </h2>
            <p className="text-muted-foreground">Toutes les requetes API doivent inclure les headers suivants :</p>
            <Card>
              <CardContent className="p-4">
                <pre className="text-sm font-mono text-foreground overflow-x-auto whitespace-pre-wrap">
{`Authorization: Bearer <JWT_TOKEN>
X-API-KEY: <VOTRE_CLE_API>`}
                </pre>
              </CardContent>
            </Card>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-sm text-foreground">Le JWT Token est obtenu lors de la connexion</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-sm text-foreground">La cle API est disponible dans votre tableau de bord</span>
              </div>
            </div>
          </section>

          <Separator />

          <section className="space-y-6">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Server className="w-5 h-5 text-primary" />
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
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              Webhook SMS (Android SMS Forwarder)
            </h2>
            <p className="text-muted-foreground">
              Pour recevoir des paiements automatiquement, configurez l'application Android SMS Forwarder
              pour envoyer les SMS Mobile Money a votre serveur WestPay.
            </p>

            <EndpointDoc
              method="POST"
              path="/sms/receive"
              description="Recoit un SMS forwardé depuis un telephone Android. Le systeme parse automatiquement le TX ID, le montant et credite le marchand."
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

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Code className="w-5 h-5 text-primary" />
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
                        <td className="p-3 text-muted-foreground">Requete reussie</td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-3"><Badge variant="secondary">400</Badge></td>
                        <td className="p-3 text-muted-foreground">Requete invalide (parametres manquants)</td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-3"><Badge variant="secondary">401</Badge></td>
                        <td className="p-3 text-muted-foreground">Non autorise (token invalide ou manquant)</td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-3"><Badge variant="secondary">403</Badge></td>
                        <td className="p-3 text-muted-foreground">Acces interdit (role insuffisant)</td>
                      </tr>
                      <tr>
                        <td className="p-3"><Badge variant="secondary">500</Badge></td>
                        <td className="p-3 text-muted-foreground">Erreur interne du serveur</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </section>

          <Separator />

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-foreground">Exemple d'integration (JavaScript)</h2>
            <Card>
              <CardContent className="p-4">
                <pre className="text-sm font-mono text-foreground overflow-x-auto whitespace-pre-wrap">
{`// 1. Connexion
const loginRes = await fetch("/api/auth/merchant/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "contact@ecomat.com",
    password: "votre_mot_de_passe"
  })
});
const { token } = await loginRes.json();

// 2. Recuperer le solde
const balanceRes = await fetch("/api/merchant/balance", {
  headers: {
    "Authorization": \`Bearer \${token}\`,
    "X-API-KEY": "TGO-VOTRE_CLE_API"
  }
});
const balance = await balanceRes.json();
console.log("Solde:", balance);

// 3. Lister les transactions
const txRes = await fetch("/api/merchant/transactions", {
  headers: {
    "Authorization": \`Bearer \${token}\`,
    "X-API-KEY": "TGO-VOTRE_CLE_API"
  }
});
const transactions = await txRes.json();`}
                </pre>
              </CardContent>
            </Card>
          </section>

          <div className="py-8 text-center">
            <p className="text-xs text-muted-foreground">WestPay API Documentation v1.0 - Usage interne uniquement</p>
          </div>
        </div>
      </ScrollArea>
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
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={methodColor}>{method}</Badge>
          <code className="text-sm font-mono font-semibold text-foreground">{path}</code>
          {auth && <Badge variant="outline"><Lock className="w-3 h-3 mr-1" />JWT</Badge>}
        </div>
        <p className="text-sm text-muted-foreground mt-2">{description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {requestBody && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
              <ArrowRight className="w-3 h-3" />Requete
            </p>
            <Card>
              <CardContent className="p-3">
                <pre className="text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap">{requestBody}</pre>
              </CardContent>
            </Card>
          </div>
        )}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-green-500" />Reponse
          </p>
          <Card>
            <CardContent className="p-3">
              <pre className="text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap">{responseBody}</pre>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ApiDocsPage() {
  const [accessData, setAccessData] = useState<{ token: string; merchant: { name: string; email: string } } | null>(null);

  if (!accessData) {
    return <PinGate onAccess={setAccessData} />;
  }

  return <ApiDocumentation merchantName={accessData.merchant.name} />;
}
