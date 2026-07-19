import { Link } from "@tanstack/react-router";
import { AlertTriangle, RotateCw, LifeBuoy, Settings as SettingsIcon, Stethoscope } from "lucide-react";
import type { TranslatedError } from "@/core/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface QuickAction {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Choisit une action rapide contextuelle à partir du titre de l'erreur
 * traduite. On ne duplique pas la logique du translator : on lui fait
 * confiance et on route vers l'écran de résolution le plus utile.
 */
function pickQuickAction(err: TranslatedError): QuickAction | undefined {
  const t = err.title.toLowerCase();
  if (t.includes("sdk android") || t.includes("android"))
    return { label: "Lancer le diagnostic", to: "/diagnostic", icon: Stethoscope };
  if (t.includes("clé de signature") || t.includes("keystore"))
    return { label: "Ouvrir la configuration", to: "/projects", icon: SettingsIcon };
  if (t.includes("node") || t.includes("npm") || t.includes("java"))
    return { label: "Lancer le diagnostic", to: "/diagnostic", icon: Stethoscope };
  if (t.includes("dossier") || t.includes("fichier"))
    return { label: "Ouvrir le projet", to: "/projects", icon: SettingsIcon };
  return undefined;
}

interface Props {
  error: TranslatedError;
  onRetry?: () => void;
}

export function BuildErrorPanel({ error, onRetry }: Props) {
  const quick = pickQuickAction(error);
  return (
    <Card className="border-danger/40 p-6 shadow-soft">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold">{error.title}</div>
          <Section label="Ce qui s'est passé" body={error.explanation} />
          {error.cause && <Section label="Pourquoi" body={error.cause} />}
          <Section label="Comment résoudre" body={error.solution} />
          <div className="mt-4 flex flex-wrap gap-2">
            {onRetry && error.retryable && (
              <Button onClick={onRetry}>
                <RotateCw className="h-4 w-4" />
                Réessayer
              </Button>
            )}
            {quick && (
              <Button asChild variant="outline">
                <Link to={quick.to}>
                  <quick.icon className="h-4 w-4" />
                  {quick.label}
                </Link>
              </Button>
            )}
            <Button asChild variant="ghost">
              <Link to="/journal">
                <LifeBuoy className="h-4 w-4" />
                Support
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Section({ label, body }: { label: string; body: string }) {
  return (
    <p className="mt-2 text-sm">
      <span className="font-medium text-foreground">{label} · </span>
      <span className="text-muted-foreground">{body}</span>
    </p>
  );
}
