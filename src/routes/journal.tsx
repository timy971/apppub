import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Copy } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { JournalService } from "@/core/journal/logger";
import type { JournalEntry } from "@/core/types";
import { toast } from "sonner";

export const Route = createFileRoute("/journal")({
  component: JournalPage,
});

function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>(() => JournalService.list());

  function refresh() {
    setEntries(JournalService.list());
  }

  function exportTxt() {
    const text = JournalService.exportText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `apppublisher-journal-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Journal exporté");
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(JournalService.exportText());
      toast.success("Journal copié");
    } catch {
      toast.error("Impossible de copier");
    }
  }

  return (
    <div>
      <PageHeader
        title="Support"
        subtitle="Réservé à l'assistance. Ce contenu n'est jamais nécessaire pour utiliser AppPublisher."
        help={{
          title: "À propos du support",
          content:
            "Cet écran conserve les commandes exécutées par AppPublisher pour aider notre équipe à comprendre un éventuel problème. Vous pouvez exporter le journal ou tout copier.",
        }}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={copyAll} disabled={entries.length === 0}>
              <Copy className="h-4 w-4" />
              Copier
            </Button>
            <Button variant="outline" onClick={exportTxt} disabled={entries.length === 0}>
              <Download className="h-4 w-4" />
              Exporter (.txt)
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                JournalService.clear();
                refresh();
                toast.success("Journal effacé");
              }}
              disabled={entries.length === 0}
            >
              Effacer
            </Button>
          </div>
        }
      />

      {entries.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground shadow-soft">
          Le journal est vide.
        </Card>
      ) : (
        <Card className="p-4 shadow-soft">
          <ul className="divide-y">
            {entries.map((e) => (
              <li key={e.id} className="py-2 font-mono text-xs">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString("fr-FR")}
                  </span>
                  <span
                    className={
                      e.level === "error"
                        ? "text-danger"
                        : e.level === "warn"
                          ? "text-warning"
                          : e.level === "command"
                            ? "text-primary"
                            : ""
                    }
                  >
                    [{e.level}]
                  </span>
                  <span className="font-sans">{e.message}</span>
                  {e.durationMs != null && (
                    <span className="text-muted-foreground">· {Math.round(e.durationMs)}ms</span>
                  )}
                  {e.exitCode != null && (
                    <span className={e.exitCode === 0 ? "text-success" : "text-danger"}>
                      · exit {e.exitCode}
                    </span>
                  )}
                </div>
                {e.cwd && <div className="text-muted-foreground">cwd: {e.cwd}</div>}
                {e.tail && (
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2">
                    {e.tail}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
