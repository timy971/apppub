import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ReactNode } from "react";

/**
 * WhyButton — bouton « Pourquoi ? » léger, disponible sur les actions
 * importantes. Explique une notion technique en une ou deux phrases,
 * en français, sans jargon.
 */
export function WhyButton({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          Pourquoi ?
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="space-y-2">
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
