import { Sparkles, User } from "lucide-react";
import type { FieldSource } from "@/core/projects/sources";
import { cn } from "@/lib/utils";

/**
 * Petit badge indiquant l'origine d'une valeur affichée dans le Cockpit.
 * Rendu discret — c'est une information technique, pas un CTA.
 */
export function SourceBadge({
  source,
  className,
}: {
  source: FieldSource | undefined;
  className?: string;
}) {
  if (!source) return null;
  const isDetected = source === "detected";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1",
        isDetected
          ? "bg-primary/10 text-primary ring-primary/20"
          : "bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:text-violet-300",
        className,
      )}
      title={
        isDetected
          ? "Valeur détectée automatiquement dans les fichiers du projet"
          : "Valeur modifiée manuellement — remplace la valeur détectée"
      }
    >
      {isDetected ? (
        <Sparkles className="h-2.5 w-2.5" />
      ) : (
        <User className="h-2.5 w-2.5" />
      )}
      {isDetected ? "Auto" : "Modifié"}
    </span>
  );
}
