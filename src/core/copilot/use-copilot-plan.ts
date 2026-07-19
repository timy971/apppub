import { useEffect, useState } from "react";
import { useActiveProject, useProjects } from "@/core/store/app-store";
import { DiagnosticService } from "@/core/diagnostic/service";
import { HistoryService } from "@/core/history/service";
import { BackupService } from "@/core/backup/service";
import { CopilotService } from "./service";
import { CopilotBus } from "./bus";
import type { CopilotPlan } from "./types";
import type { HealthCheck } from "@/core/types";

/**
 * useCopilotPlan — hook unique consommé par TOUS les écrans.
 *
 * - Recharge le diagnostic quand le projet actif change.
 * - S'abonne au CopilotBus : chaque mutation (build fini, publish préparé,
 *   backup créé, projet modifié) déclenche un recalcul.
 * - Fournit un plan garanti (jamais null) : les écrans peuvent afficher
 *   un état "loading" durant la première exécution du diagnostic.
 */
export function useCopilotPlan(): {
  plan: CopilotPlan;
  loading: boolean;
  refresh: () => void;
} {
  const project = useActiveProject();
  const projects = useProjects(); // s'abonne aux mutations projet.
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [checksLoading, setChecksLoading] = useState(true);
  const [busTick, setBusTick] = useState(0);

  // Diagnostic à chaque changement de projet actif.
  useEffect(() => {
    let cancelled = false;
    setChecksLoading(true);
    void DiagnosticService.run(project).then((c) => {
      if (!cancelled) {
        setChecks(c);
        setChecksLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [project?.id]);

  // Abonnement au bus — recalcul sur événement métier.
  useEffect(() => CopilotBus.subscribe(() => setBusTick((n) => n + 1)), []);

  // Historique + backups (localStorage) lus à chaque tick / mutation projet.
  const history = HistoryService.list();
  const backups = project ? BackupService.list(project.id) : [];

  const plan = CopilotService.plan({
    project,
    checks,
    history,
    backups,
  });

  // busTick / projects sont référencés implicitement pour rerender.
  void busTick;
  void projects;

  return {
    plan,
    loading: checksLoading,
    refresh: () => setBusTick((n) => n + 1),
  };
}
