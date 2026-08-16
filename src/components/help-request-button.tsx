import { useState } from "react";
import { LifeBuoy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { bridge } from "@/core/bridge";
import { exportDiagnosticBundle, getSysInfo } from "@/core/diag/logger";
import { JournalService } from "@/core/journal/logger";
import type { TranslatedError } from "@/core/types";

export function HelpRequestButton({ error }: { error?: TranslatedError }) {
  const [exporting, setExporting] = useState(false);
  const desktop = bridge().runtime === "electron";

  async function prepare() {
    if (!desktop || exporting) return;
    setExporting(true);
    try {
      const destination = await exportDiagnosticBundle({
        system: (await getSysInfo()) ?? {},
        error: error
          ? { title: error.title, explanation: error.explanation, cause: error.cause }
          : undefined,
        journal: JournalService.list().slice(0, 100),
      });
      if (!destination) throw new Error("Export indisponible.");
      toast.success("Demande d’aide préparée", {
        description: "Le dossier de diagnostic sécurisé a été créé et affiché dans le Finder.",
      });
    } catch (cause) {
      toast.error("Diagnostic impossible", {
        description: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <Button variant="outline" onClick={prepare} disabled={!desktop || exporting}>
      {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LifeBuoy className="h-4 w-4" />}
      {exporting ? "Préparation…" : "Préparer une demande d’aide"}
      {!desktop && <span className="sr-only"> — disponible dans l’application installée</span>}
    </Button>
  );
}
