import { Calendar, Layers, Package, Radio, Smartphone, Apple } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Project } from "@/core/types";
import { getAndroidConfig } from "@/core/projects/android-config";

export function ReleaseOverviewCard({ project }: { project: Project }) {
  const android = getAndroidConfig(project);
  const ios = project.publishing?.ios;
  const now = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const targets: string[] = [];
  if (project.detected.hasAndroid) targets.push("Android");
  if (project.detected.hasIos || ios) targets.push("iOS");

  const track = android.defaultTrack ?? "internal";

  return (
    <Card className="p-6 shadow-soft">
      <div className="mb-4 flex items-center gap-2">
        <Layers className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">Résumé de la release</h2>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Item
          icon={<Package className="h-4 w-4" />}
          label="Version"
          value={project.currentVersion}
        />
        <Item
          icon={<Package className="h-4 w-4" />}
          label="Build"
          value={String(project.currentBuild)}
        />
        <Item
          icon={<Calendar className="h-4 w-4" />}
          label="Date prévue"
          value={now}
          hint="Aujourd'hui"
        />
        <Item
          icon={<Radio className="h-4 w-4" />}
          label="Canal par défaut"
          value={labelTrack(track)}
          hint="Android"
        />
      </dl>
      <div className="mt-6 flex items-start gap-2 rounded-lg border bg-muted/40 p-4 text-sm">
        <div className="flex items-center gap-2 pr-3 border-r">
          {project.detected.hasAndroid && <Smartphone className="h-4 w-4" />}
          {(project.detected.hasIos || ios) && <Apple className="h-4 w-4" />}
          <span className="font-medium">
            {targets.length ? targets.join(" · ") : "Aucune plateforme"}
          </span>
        </div>
        <div className="text-muted-foreground pl-3">
          {targets.length === 0
            ? "Configurez au moins une plateforme dans le Cockpit projet."
            : `Prochaine publication de « ${project.name} » sur ${targets.join(" et ")}.`}
        </div>
      </div>
    </Card>
  );
}

function Item({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</dd>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function labelTrack(track: string): string {
  switch (track) {
    case "production":
      return "Production";
    case "beta":
      return "Bêta";
    case "alpha":
      return "Alpha";
    default:
      return "Interne";
  }
}
