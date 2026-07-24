import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, ShieldCheck, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Project } from "@/core/types";
import { PreflightService, type BuildCheck, type BuildPreflight } from "@/core/build/preflight";
import { ensureGradleExecutable } from "@/core/build/gradle";
import { patchAndroidConfig } from "@/core/projects/android-config";
import { ProjectsService } from "@/core/projects/service";
import { AppStore } from "@/core/store/app-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckItem } from "./check-item";
import { AndroidCreateDialog } from "./android-create-dialog";
import { cn } from "@/lib/utils";

interface Props {
  project: Project;
  onReady: (ready: boolean) => void;
}

const CATEGORY_LABEL: Record<string, string> = {
  project: "Projet",
  android: "Android",
  keystore: "Clé de signature",
  environment: "Environnement",
  capacitor: "Capacitor",
};

export function PreflightCard({ project, onReady }: Props) {
  const [state, setState] = useState<BuildPreflight | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyCheckId, setBusyCheckId] = useState<string | null>(null);
  const [createAndroidOpen, setCreateAndroidOpen] = useState(false);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await PreflightService.run(project);
      setState(result);
      onReady(result.ok);
    } finally {
      setLoading(false);
    }
  }, [project, onReady]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const grouped = useMemo(() => {
    if (!state) return [];
    const map = new Map<string, BuildCheck[]>();
    for (const c of state.checks) {
      const arr = map.get(c.category) ?? [];
      arr.push(c);
      map.set(c.category, arr);
    }
    return Array.from(map.entries());
  }, [state]);

  const applyFix = useCallback(
    async (check: BuildCheck) => {
      if (!check.fix) return;
      setBusyCheckId(check.id);
      try {
        switch (check.fix.kind) {
          case "chmod-gradlew": {
            const ok = await ensureGradleExecutable(project.localPath);
            toast[ok ? "success" : "error"](
              ok ? "gradlew rendu exécutable." : "Impossible de modifier gradlew.",
            );
            break;
          }
          case "adopt-keystore": {
            const path = check.fix.payload?.path;
            if (!path) break;
            const confirmed = window.confirm(
              `Utiliser cette clé de signature ?\n\n${path}`,
            );
            if (!confirmed) break;
            const patch = patchAndroidConfig(project, { keystorePath: path });
            ProjectsService.update(project.id, patch, {
              touched: ["android.keystorePath"],
            });
            AppStore.refreshProjects();
            toast.success("Clé de signature mise à jour.");
            break;
          }
          case "open-cockpit": {
            const payload = check.fix.payload ?? {};
            void navigate({
              to: "/projects/$id",
              params: { id: project.id },
              search: {
                ...(payload.tab ? { tab: payload.tab as never } : {}),
                ...(payload.field ? { field: payload.field } : {}),
              },
            });
            return; // pas de refresh, on quitte l'écran
          }
          case "open-diagnostic": {
            void navigate({ to: "/diagnostic" });
            return;
          }
          case "create-android": {
            setCreateAndroidOpen(true);
            return;
          }
        }
        await refresh();
      } finally {
        setBusyCheckId(null);
      }
    },
    [navigate, project, refresh],
  );

  const tone = state?.hasBlockers
    ? "border-danger/40"
    : state && state.checks.some((c) => c.status === "warning")
      ? "border-warning/40"
      : "border-success/30";

  return (
    <Card className={cn("p-5 shadow-soft", tone)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : state?.hasBlockers ? (
              <AlertTriangle className="h-5 w-5 text-danger" />
            ) : state?.checks.some((c) => c.status === "warning") ? (
              <ShieldCheck className="h-5 w-5 text-warning" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-success" />
            )}
          </div>
          <div>
            <div className="text-base font-semibold">Préparation du build</div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {loading
                ? "AppPublisher vérifie votre environnement…"
                : state?.hasBlockers
                  ? "Un ou plusieurs points bloquent le build. Corrigez-les avant de lancer."
                  : state?.checks.some((c) => c.status === "warning")
                    ? "Le build peut démarrer, mais des points méritent attention."
                    : "Tout est prêt. Vous pouvez lancer le build en toute confiance."}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Revérifier
        </Button>
      </div>

      {state && (
        <div className="mt-4 space-y-4">
          {grouped.map(([cat, items]) => (
            <section key={cat}>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {CATEGORY_LABEL[cat] ?? cat}
              </div>
              <div className="space-y-1.5">
                {items.map((c) => (
                  <CheckItem
                    key={c.id}
                    check={c}
                    running={busyCheckId === c.id}
                    onFix={applyFix}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}
