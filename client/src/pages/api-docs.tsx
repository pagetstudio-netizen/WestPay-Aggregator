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
  ArrowRight, CheckCircle, AlertTriangle, Globe, Zap, Copy, Check,
  Send, ArrowDownCircle, Bell
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
  notes,
}: {
  method: string;
  path: string;
  description: string;
  requestBody?: string;
  responseBody: string;
  auth: boolean;
  notes?: string;
}) {
  const methodColor = method === "GET" ? "default" : method === "DELETE" ? "destructive" : "secondary";

  return (
    <Card>
      <CardHeader className="pb-3 px-3 sm:px-6">
        <div className="flex items-start gap-2 flex-wrap">
          <Badge variant={methodColor}>{method}</Badge>
          <code className="text-xs sm:text-sm font-mono font-semibold text-foreground break-all">{path}</code>
          {auth && <Badge variant="outline"><Lock className="w-3 h-3 mr-1" />JWT</Badge>}
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground mt-2">{description}</p>
        {notes && (
          <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 shrink-0" />{notes}
          </p>
        )}
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
              <p className="text-xs text-muted-foreground">v2.0</p>
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
            WestPay est une plateforme d'aggregation de paiements Mobile Money. Tous les paiements sont traites
            automatiquement via paiement mobile : une requete USSD est envoyee directement sur le telephone du client,
            qui n'a plus qu'a valider. L'API vous permet egalement d'effectuer des <strong>retraits automatiques</strong> (transferts)
            vers n'importe quel portefeuille Mobile Money.
          </p>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Important</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">Ne partagez jamais vos cles API ni votre secret webhook. Regenerez-les immediatement si vous suspectez une fuite.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-4 space-y-2">
              <p className="text-sm font-semibold text-foreground">Fonctionnalites principales</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  <span className="text-xs sm:text-sm text-foreground">Paiements automatiques via USSD push</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  <span className="text-xs sm:text-sm text-foreground">Retraits automatiques (transferts)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  <span className="text-xs sm:text-sm text-foreground">Notifications webhook en temps reel</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  <span className="text-xs sm:text-sm text-foreground">Support multi-pays et multi-operateurs</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  <span className="text-xs sm:text-sm text-foreground">Page de paiement hebergee et securisee</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  <span className="text-xs sm:text-sm text-foreground">Consultation des soldes et transactions</span>
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
          <p className="text-sm text-muted-foreground">Toutes les requetes API protegees doivent inclure les headers suivants :</p>
          <CodeBlock
            code={`Authorization: Bearer <JWT_TOKEN>\nX-API-KEY: <VOTRE_CLE_API>`}
            label="Headers requis"
          />
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
              <span className="text-xs sm:text-sm text-foreground">Le JWT Token est obtenu via l'endpoint de connexion (valide 24h)</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
              <span className="text-xs sm:text-sm text-foreground">La cle API est disponible dans votre tableau de bord (onglet "Cles API")</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
              <span className="text-xs sm:text-sm text-foreground">Chaque pays a sa propre cle API (format: PREFIX-[40 caracteres])</span>
            </div>
          </div>
        </section>

        <Separator />

        <section className="space-y-6">
          <h2 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
            <Server className="w-5 h-5 text-primary shrink-0" />
            Endpoints - Authentification & Consultation
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
    "active": true,
    "enabled": true
  }
]`}
            auth={true}
          />

          <EndpointDoc
            method="GET"
            path="/api/merchant/transactions"
            description="Liste toutes les transactions du marchand connecte (paiements et transferts)."
            responseBody={`[
  {
    "id": 1,
    "merchantId": 1,
    "country": "Togo",
    "txId": "OP-abc123",
    "amount": 5000,
    "payerNumber": "+22898123456",
    "status": "confirmed",
    "provider": "mobile",
    "txId_provider": "12345",
    "createdAt": "2026-01-15T10:30:00Z"
  },
  {
    "id": 2,
    "merchantId": 1,
    "country": "Togo",
    "txId": "TR-def456",
    "amount": -3000,
    "payerNumber": "+22890654321",
    "status": "confirmed",
    "provider": "mobile",
    "createdAt": "2026-01-16T14:00:00Z"
  }
]`}
            auth={true}
            notes="Les transferts (retraits) ont un montant negatif et un txId prefixe par TR-"
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
    "apiKey": "TGO-a1b2c3d4e5f6...",
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
  "apiKey": "TGO-nouvelle_cle_generee..."
}`}
            auth={true}
            notes="L'ancienne cle cesse de fonctionner immediatement"
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

        <section className="space-y-6">
          <h2 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
            <ArrowDownCircle className="w-5 h-5 text-primary shrink-0" />
            Retraits automatiques (Transferts)
          </h2>
          <p className="text-sm text-muted-foreground">
            Envoyez de l'argent directement vers n'importe quel portefeuille Mobile Money. Le montant est debite
            de votre solde marchand et envoye instantanement au destinataire via Mobile Money.
          </p>

          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Flux de retrait</p>
                  <ol className="text-xs sm:text-sm text-muted-foreground mt-2 space-y-1 list-decimal pl-4">
                    <li>Vous appelez l'endpoint de transfert avec le numero, le montant et le nom du destinataire</li>
                    <li>WestPay verifie votre solde et initie le transfert</li>
                    <li>Le montant est transfere sur le portefeuille Mobile Money du destinataire</li>
                    <li>Votre solde est debite du montant + frais eventuels</li>
                    <li>La transaction est enregistree avec un txId prefixe par <code className="bg-muted px-1 rounded">TR-</code></li>
                  </ol>
                </div>
              </div>
            </CardContent>
          </Card>

          <EndpointDoc
            method="POST"
            path="/api/merchant/transfer"
            description="Effectuer un retrait automatique (transfert) vers un portefeuille Mobile Money. Le montant est debite de votre solde."
            requestBody={`{
  "country": "Togo",
  "msisdn": "22890123456",
  "amount": 3000,
  "firstName": "Jean",
  "lastName": "Dupont",
  "operator": "moov"
}`}
            responseBody={`{
  "success": true,
  "reference": "WP-abc123def456",
  "transactionId": 78901,
  "fees": 50,
  "amount": 3000
}`}
            auth={true}
            notes="Le champ 'operator' est optionnel. Les operateurs supportes dependent du pays."
          />

          <Card>
            <CardContent className="p-3 sm:p-4">
              <p className="text-sm font-semibold text-foreground mb-2">Operateurs disponibles par pays</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 text-foreground font-semibold">Pays</th>
                      <th className="text-left p-2 text-foreground font-semibold">Indicatif</th>
                      <th className="text-left p-2 text-foreground font-semibold">Operateurs</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b"><td className="p-2">Togo</td><td className="p-2">+228</td><td className="p-2">Moov Money, TMoney</td></tr>
                    <tr className="border-b"><td className="p-2">Benin</td><td className="p-2">+229</td><td className="p-2">MTN Mobile Money</td></tr>
                    <tr className="border-b"><td className="p-2">Burkina Faso</td><td className="p-2">+226</td><td className="p-2">Moov Money, Orange Money</td></tr>
                    <tr className="border-b"><td className="p-2">Cameroun</td><td className="p-2">+237</td><td className="p-2">MTN Mobile Money, Orange Money</td></tr>
                    <tr className="border-b"><td className="p-2">Congo Brazzaville</td><td className="p-2">+242</td><td className="p-2">MTN Mobile Money</td></tr>
                    <tr className="border-b"><td className="p-2">Gabon</td><td className="p-2">+241</td><td className="p-2">Airtel Money, Moov Money</td></tr>
                    <tr className="border-b"><td className="p-2">Cote d'Ivoire</td><td className="p-2">+225</td><td className="p-2">Moov Money, MTN Mobile Money, Orange Money, Wave</td></tr>
                    <tr className="border-b"><td className="p-2">Mali</td><td className="p-2">+223</td><td className="p-2">Orange Money</td></tr>
                    <tr><td className="p-2">Senegal</td><td className="p-2">+221</td><td className="p-2">Mixx by Yas, Orange Money, Wave</td></tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        <section className="space-y-6">
          <h2 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary shrink-0" />
            Page de paiement hebergee
          </h2>
          <p className="text-sm text-muted-foreground">
            WestPay fournit une page de paiement securisee et hebergee. Redirigez simplement vos utilisateurs vers cette page.
            Le paiement est traite automatiquement : une notification USSD est envoyee sur le telephone du client,
            et il n'a qu'a valider. Apres confirmation, l'utilisateur est redirige vers votre site.
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
                    <li>L'utilisateur entre son numero de telephone et son nom, puis choisit son operateur</li>
                    <li>Une demande USSD est envoyee automatiquement sur son telephone</li>
                    <li>L'utilisateur valide le paiement en composant son code secret</li>
                    <li>WestPay confirme le paiement et redirige l'utilisateur vers votre site avec :
                      <code className="bg-muted px-1 rounded text-xs block mt-1 break-all">?status=success&amount=5000&ref=WP-abc123</code>
                    </li>
                  </ol>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-4">
              <p className="text-sm font-semibold text-foreground mb-2">Parametres de l'URL de paiement</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 text-foreground font-semibold">Parametre</th>
                      <th className="text-left p-2 text-foreground font-semibold">Requis</th>
                      <th className="text-left p-2 text-foreground font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b"><td className="p-2 font-mono">merchant</td><td className="p-2">Oui</td><td className="p-2">Votre slug marchand (ex: ecomat)</td></tr>
                    <tr className="border-b"><td className="p-2 font-mono">amount</td><td className="p-2">Oui</td><td className="p-2">Montant en F CFA (entier)</td></tr>
                    <tr className="border-b"><td className="p-2 font-mono">country</td><td className="p-2">Non</td><td className="p-2">Pays (ex: Togo, Benin). Si omis, le premier pays actif est utilise</td></tr>
                    <tr><td className="p-2 font-mono">redirect</td><td className="p-2">Non</td><td className="p-2">URL de retour apres paiement. Recevra ?status=success&amount=X&ref=Y</td></tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <EndpointDoc
            method="GET"
            path="/api/payment/:slug/info"
            description="Recupere les informations publiques du marchand. Utilise par la page de paiement."
            responseBody={`{
  "merchant": {
    "name": "EcoMat Togo",
    "slug": "ecomat",
    "countries": ["Togo", "Benin"]
  }
}`}
            auth={false}
          />

          <EndpointDoc
            method="POST"
            path="/api/payment/initiate"
            description="Initie un paiement Mobile Money. Envoie une demande USSD push sur le telephone du client. Pour l'operateur Wave, retourne un lien de paiement."
            requestBody={`{
  "merchantSlug": "ecomat",
  "country": "Togo",
  "amount": 5000,
  "payerPhone": "90123456",
  "payerName": "Jean Dupont",
  "paymentMethod": "TMoney",
  "redirectUrl": "https://votresite.com/merci",
  "firstName": "Jean",
  "lastName": "Dupont",
  "operator": "wave"
}`}
            responseBody={`{
  "success": true,
  "paymentId": 42,
  "reference": "WP-abc123def456",
  "paymentUrl": null,
  "fees": 75
}`}
            auth={false}
            notes="Le champ 'operator' est optionnel. Pour Wave, un paymentUrl est retourne pour la redirection."
          />

          <EndpointDoc
            method="GET"
            path="/api/omnipay/payment/:paymentId/status"
            description="Verifie le statut d'un paiement en cours. Utilisez ce endpoint pour le polling cote client."
            responseBody={`{
  "status": "confirmed",
  "paymentId": 42,
  "reference": "WP-abc123def456"
}`}
            auth={false}
            notes="Statuts possibles : pending, pending, confirmed, failed, expired"
          />
        </section>

        <Separator />

        <section className="space-y-6">
          <h2 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary shrink-0" />
            Notifications Webhook
          </h2>
          <p className="text-sm text-muted-foreground">
            Configurez un webhook dans votre tableau de bord pour recevoir des notifications en temps reel
            lorsqu'un paiement est confirme. WestPay envoie un POST a votre URL avec les details de la transaction,
            signe avec votre secret webhook via HMAC-SHA256.
          </p>

          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Configuration</p>
                  <ol className="text-xs sm:text-sm text-muted-foreground mt-2 space-y-1 list-decimal pl-4">
                    <li>Allez dans votre tableau de bord marchand, onglet "Webhook"</li>
                    <li>Entrez votre URL de webhook (ex: https://votresite.com/api/westpay-webhook)</li>
                    <li>Copiez votre secret webhook pour verifier les signatures</li>
                    <li>Utilisez le bouton "Tester" pour envoyer une notification de test</li>
                  </ol>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground">Payload envoye a votre webhook</p>
              <CodeBlock
                label="POST votre-url-webhook"
                code={`// Headers
X-WestPay-Signature: hmac_sha256_hex_de_votre_secret
X-WestPay-Event: payment.confirmed
Content-Type: application/json

// Body
{
  "event": "payment.confirmed",
  "txId": "OP-abc123",
  "amount": 5000,
  "currency": "XOF",
  "payer": "+22890123456",
  "country": "Togo",
  "merchantSlug": "ecomat",
  "provider": "mobile",
  "timestamp": "2026-01-15T10:30:00.000Z"
}`}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground">Verification de la signature (exemple)</p>
              <CodeBlock
                label="JavaScript - Verification HMAC-SHA256"
                code={`const crypto = require("crypto");

function verifyWebhookSignature(body, signature, secret) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(body))
    .digest("hex");
  return signature === expected;
}

// Dans votre handler Express :
app.post("/api/westpay-webhook", (req, res) => {
  const signature = req.headers["x-westpay-signature"];
  const event = req.headers["x-westpay-event"];

  if (!verifyWebhookSignature(req.body, signature, "VOTRE_SECRET")) {
    return res.status(401).json({ error: "Signature invalide" });
  }

  if (event === "payment.confirmed") {
    console.log("Paiement confirme:", req.body.txId, req.body.amount);
    // Mettez a jour votre base de donnees ici
  }

  res.json({ received: true });
});`}
              />
            </CardContent>
          </Card>

          <EndpointDoc
            method="GET"
            path="/api/merchant/webhook"
            description="Recupere la configuration webhook du marchand connecte."
            responseBody={`{
  "webhookUrl": "https://votresite.com/api/webhook",
  "webhookSecret": "votre_secret_32_caracteres...",
  "hasWebhook": true
}`}
            auth={true}
          />

          <EndpointDoc
            method="PUT"
            path="/api/merchant/webhook"
            description="Met a jour l'URL du webhook du marchand. Un nouveau secret est genere si c'est la premiere configuration."
            requestBody={`{
  "webhookUrl": "https://votresite.com/api/westpay-webhook"
}`}
            responseBody={`{
  "success": true,
  "webhookUrl": "https://votresite.com/api/westpay-webhook",
  "webhookSecret": "secret_genere_automatiquement..."
}`}
            auth={true}
          />

          <EndpointDoc
            method="POST"
            path="/api/merchant/webhook/test"
            description="Envoie une notification de test a votre URL webhook pour verifier la configuration."
            responseBody={`{
  "success": true,
  "message": "Notification test envoyee avec succes",
  "statusCode": 200
}`}
            auth={true}
          />

          <EndpointDoc
            method="GET"
            path="/api/merchant/webhook/logs"
            description="Historique des notifications webhook envoyees (20 derniers)."
            responseBody={`[
  {
    "id": 1,
    "merchantId": 1,
    "event": "payment.confirmed",
    "url": "https://votresite.com/api/webhook",
    "statusCode": 200,
    "success": true,
    "payload": "{...}",
    "createdAt": "2026-01-15T10:30:00Z"
  }
]`}
            auth={true}
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
                      <td className="p-3 text-muted-foreground text-xs sm:text-sm">Requete invalide (parametres manquants ou solde insuffisant)</td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-3"><Badge variant="secondary">401</Badge></td>
                      <td className="p-3 text-muted-foreground text-xs sm:text-sm">Non autorise (token invalide ou manquant)</td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-3"><Badge variant="secondary">403</Badge></td>
                      <td className="p-3 text-muted-foreground text-xs sm:text-sm">Acces interdit (role insuffisant)</td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-3"><Badge variant="secondary">404</Badge></td>
                      <td className="p-3 text-muted-foreground text-xs sm:text-sm">Ressource introuvable (marchand, transaction, etc.)</td>
                    </tr>
                    <tr>
                      <td className="p-3"><Badge variant="secondary">500</Badge></td>
                      <td className="p-3 text-muted-foreground text-xs sm:text-sm">Erreur interne du serveur ou erreur de paiement</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-lg sm:text-xl font-bold text-foreground">Exemples complets (JavaScript)</h2>

          <p className="text-sm font-semibold text-foreground">1. Authentification et consultation du solde</p>
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

          <p className="text-sm font-semibold text-foreground mt-4">2. Effectuer un retrait automatique (transfert)</p>
          <CodeBlock
            label="JavaScript - Transfert Mobile Money"
            code={`// Envoyer 3000 F CFA vers un portefeuille Mobile Money
const transferRes = await fetch("https://westpay.replit.app/api/merchant/transfer", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": \`Bearer \${token}\`,
    "X-API-KEY": "TGO-VOTRE_CLE_API"
  },
  body: JSON.stringify({
    country: "Togo",
    msisdn: "22890123456",
    amount: 3000,
    firstName: "Jean",
    lastName: "Dupont"
  })
});
const transfer = await transferRes.json();

if (transfer.success) {
  console.log("Transfert reussi !");
  console.log("Reference:", transfer.reference);
  console.log("Frais:", transfer.fees, "F CFA");
} else {
  console.error("Erreur:", transfer.message);
}`}
          />

          <p className="text-sm font-semibold text-foreground mt-4">3. Rediriger vos utilisateurs vers la page de paiement</p>
          <CodeBlock
            label="JavaScript - Redirection paiement"
            code={`// Rediriger l'utilisateur vers la page de paiement WestPay
const montant = 5000; // Montant en F CFA
const pays = "Togo";
const retour = "https://votresite.com/merci"; // URL de retour

window.location.href = \`https://westpay.replit.app/pay?merchant=ecomat&amount=\${montant}&country=\${pays}&redirect=\${encodeURIComponent(retour)}\`;

// Apres le paiement confirme, l'utilisateur sera redirige vers :
// https://votresite.com/merci?status=success&amount=5000&ref=WP-abc123

// Parametres retournes :
// - status : "success" (paiement confirme)
// - amount : le montant paye
// - ref    : la reference de la transaction`}
          />

          <p className="text-sm font-semibold text-foreground mt-4">4. Configurer et verifier les webhooks</p>
          <CodeBlock
            label="JavaScript - Configuration Webhook"
            code={`// Configurer l'URL du webhook
const webhookRes = await fetch("https://westpay.replit.app/api/merchant/webhook", {
  method: "PUT",
  headers: {
    "Content-Type": "application/json",
    "Authorization": \`Bearer \${token}\`
  },
  body: JSON.stringify({
    webhookUrl: "https://votresite.com/api/westpay-webhook"
  })
});
const { webhookSecret } = await webhookRes.json();
console.log("Secret webhook (a sauvegarder):", webhookSecret);

// Tester le webhook
const testRes = await fetch("https://westpay.replit.app/api/merchant/webhook/test", {
  method: "POST",
  headers: { "Authorization": \`Bearer \${token}\` }
});
const testResult = await testRes.json();
console.log("Test:", testResult.success ? "OK" : "Echec");`}
          />
        </section>

        <div className="py-8 text-center">
          <p className="text-xs text-muted-foreground">WestPay API Documentation v2.0 - Usage interne uniquement</p>
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
