import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  History,
  LifeBuoy,
  SearchCheck,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { bridge } from "@/core/bridge";
import { HistoryService } from "@/core/history/service";
import { JournalService } from "@/core/journal/logger";
import { useActiveProject } from "@/core/store/app-store";
import { useIsExpert } from "@/core/store/use-mode";
import type { JournalEntry } from "@/core/types";
import { HistoryPanel } from "./history";
import { TechnicalPanel } from "./logs";

type ActivityView = "summary" | "history" | "technical";

function activityView(value: unknown): ActivityView {
  return value === "history" || value === "technical" ? value : "summary";
}

export const Route = createFileRoute("/journal")({
  validateSearch: (search: Record<string, unknown>) => ({
    view: activityView(search.view),
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const { view } = Route.useSearch();
  const navigate = Route.useNavigate();
  const project = useActiveProject();
  const isExpert = useIsExpert();
  const [entries, setEntries] = useState<JournalEntry[]>([]);

  useEffect(() => setEntries(JournalService.list()), []);

  const records = useMemo(
    () => (project ? HistoryService.forProject(project.id) : HistoryService.list()),
    [project],
  );
  const visibleView = view === "technical" && !isExpert ? "summary" : view;
  const successful = records.filter((record) => record.outcome === "success").length;
  const failed = records.length - successful;

  function selectView(next: string) {
    const requested = activityView(next);
    const allowed = requested === "technical" && !isExpert ? "summary" : requested;
    void navigate({ search: { view: allowed }, replace: true });
  }

  function exportTxt() {
    const text = JournalService.exportText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `apppublisher-aide-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Informations enregistrées");
  }

  async function copyAll() {
    try {
      const copied = await bridge().system.copyText(JournalService.exportText());
      if (copied) toast.success("Informations copiées");
      else toast.error("Impossible de copier les informations");
    } catch {
      toast.error("Impossible de copier les informations");
    }
  }

  return (
    <div>
      <PageHeader
        title="Activité et aide"
        subtitle="Un seul endroit pour comprendre ce qui s'est passé, retrouver vos opérations et préparer une demande d'aide."
        help={{
          title: "À propos de cet espace",
          content:
            "Le résumé reste simple. L'historique conserve vos opérations et les détails techniques ne sont visibles qu'en mode Expert.",
        }}
      />

      <Tabs value={visibleView} onValueChange={selectView}>
        <TabsList
          className={
            isExpert ? "grid w-full max-w-2xl grid-cols-3" : "grid w-full max-w-md grid-cols-2"
          }
        >
          <TabsTrigger value="summary">
            <LifeBuoy className="h-4 w-4" />
            Résumé
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4" />
            Opérations passées
          </TabsTrigger>
          {isExpert && (
            <TabsTrigger value="technical">
              <Terminal className="h-4 w-4" />
              Détails techniques
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="summary" className="mt-6 space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-5 shadow-soft">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <SearchCheck className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-semibold">Vérifier l'application</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Lancez une vérification si vous souhaitez savoir ce qui est prêt ou ce qui bloque.
              </p>
              <Button asChild variant="outline" className="mt-4">
                <Link to="/diagnostic">Ouvrir la vérification</Link>
              </Button>
            </Card>

            <Card className="p-5 shadow-soft">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 text-success">
                <Clock3 className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-semibold">Vos opérations</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {records.length === 0
                  ? "Aucune opération enregistrée pour le moment."
                  : `${records.length} opération${records.length > 1 ? "s" : ""} · ${successful} réussie${successful === 1 ? "" : "s"}${failed ? ` · ${failed} en échec` : ""}.`}
              </p>
              <Button variant="outline" className="mt-4" onClick={() => selectView("history")}>
                Voir les opérations
              </Button>
            </Card>

            <Card className="p-5 shadow-soft">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <LifeBuoy className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-semibold">Besoin d'aide ?</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Préparez des informations utiles au support. Aucun mot de passe n'est inclus.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" onClick={copyAll} disabled={entries.length === 0}>
                  <Copy className="h-4 w-4" />
                  Copier
                </Button>
                <Button variant="outline" onClick={exportTxt} disabled={entries.length === 0}>
                  <Download className="h-4 w-4" />
                  Enregistrer
                </Button>
              </div>
            </Card>
          </div>

          {records.length > 0 && (
            <Card className="p-5 shadow-soft">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <h2 className="font-semibold">Dernière activité</h2>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                <div>
                  <div className="font-medium">{records[0].projectName}</div>
                  <div className="text-muted-foreground">
                    Version {records[0].version} · nº interne {records[0].build}
                  </div>
                </div>
                <div className="text-muted-foreground">
                  {new Date(records[0].createdAt).toLocaleString("fr-FR")}
                </div>
              </div>
            </Card>
          )}

          {isExpert && entries.length > 0 && (
            <details className="rounded-xl border bg-card p-5 shadow-soft">
              <summary className="cursor-pointer text-sm font-medium">
                Afficher le journal technique intermédiaire ({entries.length})
              </summary>
              <ul className="mt-4 max-h-80 divide-y overflow-auto">
                {entries.slice(0, 100).map((entry) => (
                  <li key={entry.id} className="py-2 text-xs">
                    <span className="text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString("fr-FR")}
                    </span>{" "}
                    <span className="font-medium">[{entry.level}]</span> {entry.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <HistoryPanel />
        </TabsContent>

        {isExpert && (
          <TabsContent value="technical" className="mt-6">
            <TechnicalPanel />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
