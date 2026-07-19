import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useSettings, useActiveProject, useProjects } from "@/core/store/app-store";
import { HistoryService } from "@/core/history/service";
import { BackupService } from "@/core/backup/service";
import { ProjectStatusService } from "@/core/projects/status";
import { useCopilotPlan } from "@/core/copilot/use-copilot-plan";
import type { Project, ProjectBackup, PublishRecord } from "@/core/types";
import { TodayCard, type TodaySummary } from "@/components/dashboard/today-card";
import { NextStepCard } from "@/components/dashboard/next-step-card";
import { BlockersCard } from "@/components/dashboard/blockers-card";
import { ReadyCard } from "@/components/dashboard/ready-card";
import { PlanTimelineCard } from "@/components/dashboard/plan-timeline-card";
import {
  ProjectsGrid,
  type ProjectSummary,
} from "@/components/dashboard/projects-grid";
import {
  ActivityTimeline,
  buildActivityEvents,
  type ActivityEvent,
} from "@/components/dashboard/activity-timeline";
import {
  GlobalHealthCard,
  type GlobalHealth,
} from "@/components/dashboard/global-health-card";
import {
  StatsStrip,
  type DashboardStats,
} from "@/components/dashboard/stats-strip";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const settings = useSettings();
  const activeProject = useActiveProject();
  const projects = useProjects();
  const navigate = useNavigate();
  const { plan, loading: copilotLoading } = useCopilotPlan();

  useEffect(() => {
    if (!settings.onboardingCompleted) {
      navigate({ to: "/setup" });
    }
  }, [settings.onboardingCompleted, navigate]);

  const [dataReady, setDataReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setDataReady(true), 60);
    return () => window.clearTimeout(t);
  }, []);

  const history = useMemo<PublishRecord[]>(() => HistoryService.list(), [projects, plan.signature]);
  const backups = useMemo<{ backup: ProjectBackup; project: Project }[]>(() => {
    const out: { backup: ProjectBackup; project: Project }[] = [];
    for (const p of projects) {
      for (const b of BackupService.list(p.id)) out.push({ backup: b, project: p });
    }
    return out;
  }, [projects, plan.signature]);

  const summaries = useMemo<ProjectSummary[]>(() => {
    const activeId = settings.activeProjectId;
    const list = projects.map((p) => ({
      project: p,
      status: ProjectStatusService.evaluate(p),
      lastBuild: history.find((h) => h.projectId === p.id && h.kind === "build"),
      lastPublish: history.find((h) => h.projectId === p.id && h.kind === "publish"),
    }));
    return list.sort((a, b) => {
      const activeA = a.project.id === activeId ? 0 : 1;
      const activeB = b.project.id === activeId ? 0 : 1;
      if (activeA !== activeB) return activeA - activeB;
      const favA = a.project.favorite ? 0 : 1;
      const favB = b.project.favorite ? 0 : 1;
      if (favA !== favB) return favA - favB;
      return a.project.name.localeCompare(b.project.name);
    });
  }, [projects, history, settings.activeProjectId]);

  const globalHealth = useMemo<GlobalHealth>(() => {
    let ready = 0,
      attention = 0,
      blocked = 0;
    for (const s of summaries) {
      if (s.status.level === "ready") ready++;
      else if (s.status.level === "attention") attention++;
      else blocked++;
    }
    return { ready, attention, blocked, total: summaries.length };
  }, [summaries]);

  const activity = useMemo<ActivityEvent[]>(
    () => buildActivityEvents(history, backups),
    [history, backups],
  );

  const stats = useMemo<DashboardStats>(() => {
    const weekAgo = Date.now() - 7 * 86400000;
    const recent = history.filter((h) => new Date(h.createdAt).getTime() >= weekAgo);
    const builds = recent.filter((h) => h.kind === "build");
    const publishes = recent.filter((h) => h.kind === "publish");
    const versions = recent.filter((h) => h.kind === "version");
    const allBuilds = history.filter((h) => h.kind === "build" && h.durationMs > 0);
    const avg =
      allBuilds.length === 0
        ? null
        : Math.round(
            allBuilds.reduce((s, h) => s + h.durationMs, 0) /
              allBuilds.length /
              60000,
          );
    return {
      buildsThisWeek: builds.length,
      publishesThisWeek: publishes.length,
      versionsThisWeek: versions.length,
      avgBuildMinutes: avg,
      totalBackups: backups.length,
    };
  }, [history, backups]);

  const todaySummary = useMemo<TodaySummary>(() => {
    const lastBuild = history.find((h) => h.kind === "build" || h.kind === "publish");
    return {
      totalProjects: projects.length,
      attentionCount: globalHealth.attention,
      blockedCount: globalHealth.blocked,
      lastBuildAt: lastBuild?.createdAt,
      nextStep: plan.nextAction.title,
    };
  }, [projects.length, globalHealth, history, plan.nextAction.title]);

  if (!settings.onboardingCompleted) return null;

  const loading = !dataReady;
  void activeProject; // read pour ré-évaluer si le projet actif change.

  return (
    <div className="space-y-8 pb-10">
      {/* Ligne 1 : bienvenue + prochaine étape (le Copilot pilote) */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <TodayCard
            userName={settings.userName}
            summary={loading ? null : todaySummary}
            loading={loading || copilotLoading}
          />
        </div>
        <div className="lg:col-span-3">
          <NextStepCard plan={copilotLoading ? null : plan} loading={copilotLoading} />
        </div>
      </div>

      {/* Ligne 2 : ce qui bloque + ce qui est prêt */}
      <div className="grid gap-4 lg:grid-cols-2">
        <BlockersCard plan={copilotLoading ? null : plan} loading={copilotLoading} />
        <ReadyCard plan={copilotLoading ? null : plan} loading={copilotLoading} />
      </div>

      {/* Ligne 3 : chronologie logique */}
      <PlanTimelineCard plan={copilotLoading ? null : plan} loading={copilotLoading} />

      {/* Ligne 4 : statistiques */}
      <section>
        <SectionTitle title="Cette semaine" />
        <StatsStrip stats={loading ? null : stats} loading={loading} />
      </section>

      {/* Ligne 5 : projets */}
      <section>
        <SectionTitle
          title="Mes projets"
          hint={
            summaries.length > 0
              ? `${summaries.length} ${summaries.length > 1 ? "projets" : "projet"}`
              : undefined
          }
        />
        <ProjectsGrid
          summaries={summaries}
          activeId={settings.activeProjectId}
          loading={loading}
        />
      </section>

      {/* Ligne 6 : santé globale + activité */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <GlobalHealthCard health={loading ? null : globalHealth} loading={loading} />
        </div>
        <div className="lg:col-span-3">
          <ActivityTimeline events={activity} loading={loading} />
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
