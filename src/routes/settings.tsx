import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppStore, useSettings } from "@/core/store/app-store";
import { toast } from "sonner";
import type { ExperienceMode, ThemePreference } from "@/core/types";
import { ModeBadge } from "@/components/mode-badge";
import { isElectron } from "@/core/bridge";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const settings = useSettings();
  const navigate = useNavigate();
  const electron = isElectron();

  return (
    <div>
      <PageHeader
        title="Paramètres"
        subtitle="Personnalisez AppPublisher. Aucun réglage technique n'est requis."
        help={{
          title: "À propos des paramètres",
          content:
            "Vos préférences sont enregistrées automatiquement. Elles restent sur votre ordinateur — rien n'est envoyé en ligne.",
        }}
      />

      <div className="grid gap-4">
        <Card className="p-6 shadow-soft">
          <Row label="Votre prénom" hint="Utilisé pour vous accueillir sur le tableau de bord.">
            <Input
              value={settings.userName}
              onChange={(e) => AppStore.updateSettings({ userName: e.target.value })}
              className="max-w-xs"
              placeholder="Votre prénom"
            />
          </Row>
        </Card>

        <Card className="p-6 shadow-soft">
          <Row
            label="Mode d'utilisation"
            hint="Découverte pour apprendre, Assistant au quotidien, Expert pour plus de détails techniques."
          >
            <ModeBadge />
          </Row>
        </Card>

        <Card className="p-6 shadow-soft">
          <Row label="Apparence" hint="AppPublisher s'adapte à votre système par défaut.">
            <Select
              value={settings.theme}
              onValueChange={(v) => AppStore.updateSettings({ theme: v as ThemePreference })}
            >
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">Automatique (système)</SelectItem>
                <SelectItem value="light">Clair</SelectItem>
                <SelectItem value="dark">Sombre</SelectItem>
              </SelectContent>
            </Select>
          </Row>
        </Card>

        <Card className="p-6 shadow-soft">
          <Row
            label="Sauvegarde automatique"
            hint="Une sauvegarde légère est créée avant chaque opération sensible (version, build, publication)."
          >
            <Switch
              checked={settings.autoBackupEnabled ?? true}
              onCheckedChange={(v) => AppStore.updateSettings({ autoBackupEnabled: v })}
            />
          </Row>
        </Card>

        <Card className="p-6 shadow-soft">
          <Row label="Aide contextuelle" hint="Affiche une icône d'aide sur chaque écran.">
            <Switch
              checked={settings.contextualHelpEnabled}
              onCheckedChange={(v) => AppStore.updateSettings({ contextualHelpEnabled: v })}
            />
          </Row>
        </Card>

        <Card className="p-6 shadow-soft">
          <Row label="Langue" hint="D'autres langues seront disponibles prochainement.">
            <Select
              value={settings.language}
              onValueChange={(v) => AppStore.updateSettings({ language: v as "fr" | "en" })}
            >
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="en" disabled>
                  English (bientôt)
                </SelectItem>
              </SelectContent>
            </Select>
          </Row>
        </Card>

        <Card className="p-6 shadow-soft">
          <Row
            label="Mode d'exécution"
            hint={
              electron
                ? "AppPublisher tourne comme une véritable application Desktop."
                : "AppPublisher tourne dans le navigateur : les opérations système sont simulées. Téléchargez la version Desktop pour piloter vos vrais projets."
            }
          >
            <span className="rounded-full border bg-muted/60 px-3 py-1 text-xs">
              {electron ? "Desktop (Electron)" : "Aperçu Web (simulé)"}
            </span>
          </Row>
        </Card>

        <Card className="p-6 shadow-soft">
          <Row label="Assistance avancée" hint="Uniquement pour le support technique.">
            <Button variant="outline" asChild>
              <Link to="/journal">Ouvrir le journal</Link>
            </Button>
          </Row>
        </Card>

        <Card className="p-6 shadow-soft border-danger/40">
          <Row
            label="Recommencer la configuration"
            hint="Remet AppPublisher dans son état initial. Vos projets ne seront pas supprimés."
          >
            <Button
              variant="outline"
              onClick={() => {
                AppStore.updateSettings({ onboardingCompleted: false, mode: "discovery" as ExperienceMode });
                toast.success("Configuration réinitialisée");
                navigate({ to: "/setup" });
              }}
            >
              Relancer l'assistant
            </Button>
          </Row>
        </Card>
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0 flex-1">
        <Label className="text-base font-medium">{label}</Label>
        {hint && <div className="mt-1 text-sm text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
