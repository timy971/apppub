import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Clock3, Copy, Download, SearchCheck, Terminal } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { JournalService } from "@/core/journal/logger";
import type { JournalEntry } from "@/core/types";
import { toast } from "sonner";
import { useIsExpert } from "@/core/store/use-mode";

export const Route = createFileRoute("/journal")({
  component: JournalPage,
});

function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const isExpert = useIsExpert();

  useEffect(() => setEntries(JournalService.list()), []);

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
        title="Aide et historique"
        subtitle="Retrouvez les vérifications, les opérations passées et les informations utiles si vous avez besoin d'aide."
        help={{
          title: "À propos du support",
          content:
            "Cet écran conserve les commandes exécutées par AppPublisher pour aider notre équipe à comprendre un éventuel problème. Vous pouvez exporter le journal ou tout copier.",
        }}
      />

      <div
        className={isExpert ? "mb-6 grid gap-3 md:grid-cols-3" : "mb-6 grid gap-3 md:grid-cols-2"}
      >
        <SupportLink
          to="/diagnostic"
          icon={SearchCheck}
          title="Vérifier mon application"
          text="Comprendre ce qui est prêt et ce qui demande une action."
        />
        <SupportLink
          to="/history"
          icon={Clock3}
          title="Voir les opérations passées"
          text="Retrouver les fichiers créés et les publications effectuées."
        />
        {isExpert && (
          <SupportLink
            to="/logs"
            icon={Terminal}
            title="Console technique"
            text="Analyser les événements détaillés avec le support."
          />
        )}
      </div>

      <Card className="p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="font-semibold">Préparer une demande d'aide</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Si un problème persiste, copiez ou exportez ces informations et joignez-les à votre
              demande. Elles ne contiennent aucun mot de passe.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={copyAll} disabled={entries.length === 0}>
              <Copy className="h-4 w-4" />
              Copier les informations
            </Button>
            <Button variant="outline" onClick={exportTxt} disabled={entries.length === 0}>
              <Download className="h-4 w-4" />
              Enregistrer le fichier
            </Button>
          </div>
        </div>

        <details className="mt-5 border-t pt-4">
          <summary className="cursor-pointer text-sm font-medium">
            Afficher les informations techniques ({entries.length})
          </summary>
          {entries.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              Aucune information enregistrée pour l'instant.
            </p>
          ) : (
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
          )}
          {entries.length > 0 && (
            <Button
              className="mt-4"
              variant="ghost"
              size="sm"
              onClick={() => {
                JournalService.clear();
                refresh();
                toast.success("Informations techniques effacées");
              }}
            >
              Effacer ces informations
            </Button>
          )}
        </details>
      </Card>
    </div>
  );
}

function SupportLink({
  to,
  icon: Icon,
  title,
  text,
}: {
  to: "/diagnostic" | "/history" | "/logs";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-xl border bg-card p-5 shadow-soft transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
      <div className="mt-3 font-semibold group-hover:text-primary">{title}</div>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </Link>
  );
}
