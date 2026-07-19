import { Lightbulb } from "lucide-react";
import type { ReactNode } from "react";
import { DiscoveryOnly } from "@/components/mode-gate";

/**
 * Encart pédagogique affiché uniquement en mode Découverte.
 * Ne stocke aucun état — c'est purement de l'affichage conditionnel.
 */
export function DiscoveryHint({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <DiscoveryOnly>
      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          {title && <div className="font-medium">{title}</div>}
          <div className="text-muted-foreground">{children}</div>
        </div>
      </div>
    </DiscoveryOnly>
  );
}
