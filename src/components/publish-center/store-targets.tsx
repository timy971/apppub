import { Link } from "@tanstack/react-router";
import {
  Apple,
  Smartphone,
  Store,
  ArrowRight,
  Check,
  AlertTriangle,
  CircleX,
  Info,
  MinusCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Project } from "@/core/types";
import type { ProjectStatus } from "@/core/projects/status";
import { buildPlatformReadiness, type PlatformReadiness, type PubSeverity } from "./shared";

export function StoreTargetsCard({
  project,
  status,
}: {
  project: Project;
  status: ProjectStatus;
}) {
  const android = buildPlatformReadiness(project, status, "android");
  const ios = buildPlatformReadiness(project, status, "ios");

  return (
    <Card className="p-6 shadow-soft">
      <div className="mb-4 flex items-center gap-2">
        <Store className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">Cibles de publication</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <PlatformTile
          project={project}
          readiness={android}
          icon={<Smartphone className="h-4 w-4" />}
          title="Android"
          integrationHint="Intégration Google Play prévue."
        />
        <PlatformTile
          project={project}
          readiness={ios}
          icon={<Apple className="h-4 w-4" />}
          title="iOS"
          integrationHint="Intégration App Store Connect prévue."
        />
      </div>
    </Card>
  );
}

function PlatformTile({
  project,
  readiness,
  icon,
  title,
  integrationHint,
}: {
  project: Project;
  readiness: PlatformReadiness;
  icon: React.ReactNode;
  title: string;
  integrationHint: string;
}) {
  const muted = !readiness.present;
  return (
    <div
      className={
        "rounded-xl border p-4 " + (muted ? "bg-muted/30" : "bg-background")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={
              "flex h-9 w-9 items-center justify-center rounded-lg " +
              (muted ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")
            }
          >
            {icon}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold">{title}</div>
              <PlatformBadge severity={readiness.severity} present={readiness.present} />
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {readiness.summary}
            </div>
          </div>
        </div>
        <Button asChild size="sm" variant="ghost">
          <Link
            to="/projects/$id"
            params={{ id: project.id }}
            search={{ tab: "publishing" }}
          >
            Configurer
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        {readiness.configLines.map((line) => (
          <div key={line.label} className="min-w-0">
            <dt className="uppercase tracking-wide text-muted-foreground">
              {line.label}
            </dt>
            <dd
              className={
                "truncate mt-0.5 " +
                (line.missing ? "text-muted-foreground" : "font-medium text-foreground")
              }
              title={line.value}
            >
              {line.value}
            </dd>
          </div>
        ))}
        <div className="min-w-0">
          <dt className="uppercase tracking-wide text-muted-foreground">Canal</dt>
          <dd className="truncate mt-0.5 font-medium">
            {labelTrack(readiness.defaultTrack)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="uppercase tracking-wide text-muted-foreground">Langue</dt>
          <dd className="truncate mt-0.5 font-medium">
            {readiness.primaryLanguage ?? "fr-FR"}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex items-start gap-2 rounded-md border border-dashed p-2.5 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>{integrationHint}</span>
      </div>
    </div>
  );
}

function labelTrack(track?: string): string {
  switch (track) {
    case "production":
      return "Production";
    case "beta":
      return "Bêta";
    case "alpha":
      return "Alpha";
    case "internal":
      return "Interne";
    default:
      return "—";
  }
}

function PlatformBadge({
  severity,
  present,
}: {
  severity: PubSeverity;
  present: boolean;
}) {
  if (!present) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
        <MinusCircle className="h-3 w-3" />
        Non détecté
      </span>
    );
  }
  const cls =
    severity === "error"
      ? "bg-danger/15 text-danger"
      : severity === "warn"
        ? "bg-warning/15 text-warning"
        : "bg-success/15 text-success";
  const label =
    severity === "error"
      ? "Bloqué"
      : severity === "warn"
        ? "À vérifier"
        : "Prêt";
  const Icon = severity === "error" ? CircleX : severity === "warn" ? AlertTriangle : Check;
  return (
    <span
      className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] " + cls}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
