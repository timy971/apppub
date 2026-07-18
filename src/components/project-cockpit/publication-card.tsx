import { Apple, Rocket, Smartphone, Check, AlertTriangle, CircleX, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { ProjectStatus, RuleFinding, StatusDomain } from "@/core/projects/status";
import type { Project } from "@/core/types";
import { getAndroidConfig } from "@/core/projects/android-config";
import { worstSeverity, type DomainSeverity } from "./shared";

interface PubItem {
  label: string;
  severity: DomainSeverity;
  detail: string;
}

/**
 * Point d'entrée futur pour Google Play & App Store. La structure est
 * volontairement multi-plateformes : chaque section décrit sa propre grille
 * de contrôles à partir des règles + de la configuration du projet.
 */
export function PublicationCard({
  project,
  status,
}: {
  project: Project;
  status: ProjectStatus;
}) {
  const android = buildAndroidItems(project, status);
  const ios = buildIosItems(project, status);

  return (
    <Card className="p-6 shadow-soft">
      <div className="mb-4 flex items-center gap-2">
        <Rocket className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">Publication</h2>
      </div>

      <PlatformBlock
        icon={<Smartphone className="h-4 w-4" />}
        title="Android"
        subtitle={
          project.detected.hasAndroid
            ? "Google Play"
            : "Plateforme non détectée"
        }
        items={android}
      />

      <div className="mt-5 border-t pt-5">
        <PlatformBlock
          icon={<Apple className="h-4 w-4" />}
          title="iOS"
          subtitle={
            project.detected.hasIos || project.publishing?.ios
              ? "App Store Connect"
              : "Non configuré"
          }
          items={ios}
          muted={!project.detected.hasIos && !project.publishing?.ios}
        />
      </div>
    </Card>
  );
}

function PlatformBlock({
  icon,
  title,
  subtitle,
  items,
  muted,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  items: PubItem[];
  muted?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={
              "flex h-7 w-7 items-center justify-center rounded-md " +
              (muted ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")
            }
          >
            {icon}
          </span>
          <div>
            <div className="text-sm font-medium">{title}</div>
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          </div>
        </div>
      </div>
      {items.length > 0 ? (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {items.map((it) => (
            <li key={it.label} className="flex items-start gap-2 text-sm">
              <SeverityIcon severity={it.severity} />
              <div className="min-w-0">
                <div className={muted ? "text-muted-foreground" : ""}>{it.label}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {it.detail}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 text-xs text-muted-foreground">
          Cette plateforme sera activée lorsque vous ajouterez la configuration
          correspondante.
        </div>
      )}
    </div>
  );
}

function SeverityIcon({ severity }: { severity: DomainSeverity }) {
  if (severity === "error")
    return <CircleX className="mt-0.5 h-4 w-4 text-danger shrink-0" />;
  if (severity === "warn")
    return <AlertTriangle className="mt-0.5 h-4 w-4 text-warning shrink-0" />;
  if (severity === "info")
    return <Info className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />;
  return <Check className="mt-0.5 h-4 w-4 text-success shrink-0" />;
}

function domainFindings(status: ProjectStatus, domain: StatusDomain): RuleFinding[] {
  return status.findings.filter((f) => f.domain === domain);
}

function severityFrom(findings: RuleFinding[], present: boolean): DomainSeverity {
  if (findings.length > 0) return worstSeverity(findings);
  return present ? "ok" : "warn";
}

function buildAndroidItems(project: Project, status: ProjectStatus): PubItem[] {
  const cfg = getAndroidConfig(project);
  const androidFindings = domainFindings(status, "android");
  const idFinding = androidFindings.find((f) => f.id === "android.applicationId");
  const ksFinding = androidFindings.find((f) => f.id === "android.keystore");
  const gradleFinding = androidFindings.find((f) => f.id === "android.gradle");

  return [
    {
      label: "Package",
      severity: severityFrom(
        idFinding ? [idFinding] : [],
        !!cfg.applicationId?.trim() || !!project.packageName?.trim(),
      ),
      detail:
        cfg.applicationId?.trim() ?? project.packageName?.trim() ?? "Non renseigné",
    },
    {
      label: "Version",
      severity: /^\d+\.\d+/.test(project.currentVersion) ? "ok" : "warn",
      detail: `v${project.currentVersion} · build ${project.currentBuild}`,
    },
    {
      label: "Keystore",
      severity: severityFrom(
        ksFinding ? [ksFinding] : [],
        !!cfg.keystorePath?.trim(),
      ),
      detail: cfg.keystorePath?.trim() ?? "Non configuré",
    },
    {
      label: "Play Console",
      severity: project.playStoreAppId ? "ok" : "info",
      detail: project.playStoreAppId ?? "À connecter (bientôt disponible)",
    },
    {
      label: "Gradle",
      severity: gradleFinding ? worstSeverity([gradleFinding]) : "ok",
      detail: project.detected.hasGradleWrapper
        ? "Wrapper détecté"
        : project.detected.hasAndroid
          ? "Wrapper absent"
          : "Non applicable",
    },
    {
      label: "Piste",
      severity: cfg.defaultTrack ? "ok" : "info",
      detail: cfg.defaultTrack ?? "Non définie",
    },
  ];
}

function buildIosItems(project: Project, status: ProjectStatus): PubItem[] {
  const ios = project.publishing?.ios;
  if (!project.detected.hasIos && !ios) return [];
  const iosFindings = domainFindings(status, "ios");
  const bundleFinding = iosFindings.find((f) => f.id === "ios.bundleId");
  return [
    {
      label: "Bundle ID",
      severity: severityFrom(
        bundleFinding ? [bundleFinding] : [],
        !!ios?.bundleId?.trim(),
      ),
      detail: ios?.bundleId?.trim() ?? "Non renseigné",
    },
    {
      label: "Team ID",
      severity: ios?.teamId ? "ok" : "info",
      detail: ios?.teamId ?? "Non renseigné",
    },
    {
      label: "App Store Connect",
      severity: "info",
      detail: "À connecter (bientôt disponible)",
    },
  ];
}
