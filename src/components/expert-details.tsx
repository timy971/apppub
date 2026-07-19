import { useState, type ReactNode } from "react";
import { ChevronDown, Copy, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ExpertOnly } from "@/components/mode-gate";

/**
 * Bloc « Détails techniques » — visible uniquement en mode Expert.
 * Permet d'inclure sans encombre : commandes exactes, chemins absolus,
 * variables d'environnement, versions détectées, stack traces.
 */
export function ExpertDetails({
  title = "Détails techniques",
  defaultOpen = false,
  children,
}: {
  title?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <ExpertOnly>
      <div className="rounded-lg border bg-muted/30">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
          aria-expanded={open}
        >
          <Terminal className="h-3.5 w-3.5" />
          <span className="flex-1">{title}</span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              open ? "rotate-180" : "",
            )}
          />
        </button>
        {open && (
          <div className="border-t px-3 py-3 space-y-2 text-xs font-mono">
            {children}
          </div>
        )}
      </div>
    </ExpertOnly>
  );
}

/**
 * Ligne "clé = valeur" avec bouton copier — utilitaire pour
 * ExpertDetails. Valeur optionnelle : affiche "—" si absente.
 */
export function ExpertRow({
  label,
  value,
  copyable = true,
}: {
  label: string;
  value: string | undefined | null;
  copyable?: boolean;
}) {
  const display = value ?? "—";
  const canCopy = copyable && !!value;
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground min-w-32 shrink-0">{label}</span>
      <span className="min-w-0 flex-1 break-all">{display}</span>
      {canCopy && <CopyButton value={value!} size="xs" />}
    </div>
  );
}

export function CopyButton({
  value,
  label,
  size = "sm",
  variant = "ghost",
}: {
  value: string;
  label?: string;
  size?: "xs" | "sm";
  variant?: "ghost" | "outline" | "secondary";
}) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copié", { description: label ?? "Presse-papiers" });
    } catch {
      toast.error("Copie impossible");
    }
  }
  const cls =
    size === "xs" ? "h-6 w-6 p-0" : "h-7 px-2";
  return (
    <Button
      type="button"
      variant={variant}
      onClick={copy}
      className={cn(cls, "shrink-0")}
      title={label ? `Copier ${label}` : "Copier"}
    >
      <Copy className={size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {size !== "xs" && label && <span className="ml-1 text-xs">{label}</span>}
    </Button>
  );
}
