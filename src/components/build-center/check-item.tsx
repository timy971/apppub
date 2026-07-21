import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import type { BuildCheck } from "@/core/build/preflight";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ExpertDetails } from "@/components/expert-details";

interface Props {
  check: BuildCheck;
  running?: boolean;
  onFix?: (check: BuildCheck) => void;
}

/**
 * Ligne unitaire de préflight : icône de statut + texte + action de correction.
 * Aucun jargon en mode Découverte ; les détails techniques sont repliés.
 */
export function CheckItem({ check, running, onFix }: Props) {
  const Icon =
    check.status === "success"
      ? CheckCircle2
      : check.status === "warning"
        ? AlertTriangle
        : XCircle;
  const tone =
    check.status === "success"
      ? "text-success"
      : check.status === "warning"
        ? "text-warning"
        : "text-danger";

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
      <div className={cn("mt-0.5 shrink-0", tone)}>
        {running ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{check.title}</div>
        <div className="mt-0.5 text-sm text-muted-foreground">
          {check.message}
        </div>
        {check.technical && (
          <div className="mt-2">
            <ExpertDetails title="Détails techniques">
              <pre className="whitespace-pre-wrap break-all text-xs text-muted-foreground">
                {check.technical}
              </pre>
            </ExpertDetails>
          </div>
        )}
      </div>
      {check.fix && onFix && (
        <Button
          size="sm"
          variant={check.status === "error" ? "default" : "outline"}
          onClick={() => onFix(check)}
        >
          {check.fix.label}
        </Button>
      )}
    </div>
  );
}
