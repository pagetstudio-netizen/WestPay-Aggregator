import { Shield } from "lucide-react";

export default function RestrictedPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-md bg-primary/10 flex items-center justify-center">
            <Shield className="w-8 h-8 text-primary" />
          </div>
        </div>
        <h1
          className="text-2xl font-bold text-foreground mb-2"
          data-testid="text-restricted-title"
        >
          WestPay
        </h1>
        <p
          className="text-muted-foreground text-sm"
          data-testid="text-restricted-message"
        >
          Plateforme privee. Acces restreint aux utilisateurs autorises uniquement.
        </p>
        <div className="mt-8 flex items-center justify-center gap-2">
          <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          <span className="text-xs text-muted-foreground">Acces non autorise</span>
        </div>
      </div>
    </div>
  );
}
