import { CheckCircle2, Copy, ExternalLink, FolderSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { bridge } from "@/core/bridge";
import type { PublishRecord } from "@/core/types";
import { formatSize } from "./shared";

const PLAY_CONSOLE_URL = "https://play.google.com/console/";

export function PublishHandoffCard({ release }: { release: PublishRecord }) {
  const artifactPath = release.artifactPath;
  const filename = artifactPath?.split(/[\\/]/).pop();

  async function revealArtifact() {
    if (!artifactPath) return;
    try {
      await bridge().shell.revealItem(artifactPath);
    } catch {
      toast.error("Impossible d'afficher le fichier AAB");
    }
  }

  async function copyNotes() {
    if (!release.notes) return;
    try {
      await navigator.clipboard.writeText(release.notes);
      toast.success("Notes de version copiées");
    } catch {
      toast.error("Impossible de copier les notes");
    }
  }

  async function openPlayConsole() {
    try {
      const opened = await bridge().shell.openExternal(PLAY_CONSOLE_URL);
      if (!opened) toast.error("Impossible d'ouvrir Google Play Console");
    } catch {
      toast.error("Impossible d'ouvrir Google Play Console");
    }
  }

  return (
    <Card className="border-success/30 bg-success/5 p-6 shadow-soft">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold">Release prête pour Google Play</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              L'AAB a été retrouvé et sa signature a été vérifiée. AppPublisher peut maintenant vous
              accompagner jusqu'à l'envoi manuel dans la console.
            </p>
            <div
              className="mt-2 truncate font-mono text-xs text-muted-foreground"
              title={artifactPath}
            >
              {filename ?? "Fichier AAB"}
              {release.artifactSizeBytes ? ` · ${formatSize(release.artifactSizeBytes)}` : ""}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" onClick={revealArtifact} disabled={!artifactPath}>
            <FolderSearch className="h-4 w-4" />
            Afficher l'AAB
          </Button>
          <Button variant="outline" onClick={copyNotes} disabled={!release.notes}>
            <Copy className="h-4 w-4" />
            Copier les notes
          </Button>
          <Button onClick={openPlayConsole}>
            <ExternalLink className="h-4 w-4" />
            Ouvrir Play Console
          </Button>
        </div>
      </div>
    </Card>
  );
}
