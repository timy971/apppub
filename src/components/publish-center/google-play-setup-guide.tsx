import {
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  FileArchive,
  Info,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { bridge } from "@/core/bridge";

const PLAY_CONSOLE_URL = "https://play.google.com/console/";

interface Props {
  projectName: string;
  packageName: string;
  aabPath?: string;
  verifying: boolean;
  onVerify: () => void;
}

export function GooglePlaySetupGuide({
  projectName,
  packageName,
  aabPath,
  verifying,
  onVerify,
}: Props) {
  async function openPlayConsole() {
    const opened = await bridge().shell.openExternal(PLAY_CONSOLE_URL);
    if (!opened) toast.error("Impossible d’ouvrir Google Play Console");
  }

  async function copyPackageName() {
    const copied = await bridge().system.copyText(packageName);
    if (copied) toast.success("Identifiant Android copié");
    else toast.error("Impossible de copier l’identifiant Android");
  }

  async function revealAab() {
    if (!aabPath) return;
    try {
      await bridge().shell.revealItem(aabPath);
    } catch {
      toast.error("Impossible d’afficher le fichier AAB");
    }
  }

  return (
    <div className="mt-5 rounded-2xl border border-amber-300/70 bg-amber-50/70 p-5 dark:border-amber-800 dark:bg-amber-950/20">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
        <div>
          <h3 className="font-semibold text-amber-950 dark:text-amber-100">
            Une première installation manuelle est nécessaire
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-amber-900/80 dark:text-amber-100/75">
            Votre compte Google est bien connecté. Google impose simplement de créer la fiche et
            d’ajouter le premier fichier Android (AAB) dans Play Console. AppPublisher pourra
            ensuite envoyer les mises à jour automatiquement.
          </p>
        </div>
      </div>

      <ol className="mt-5 space-y-4">
        <SetupStep number="1" title="Créez l’application dans Play Console">
          <p>
            Cliquez sur <strong>Créer une application</strong>, puis indiquez le nom « {projectName}{" "}
            », la langue principale, « Application » et votre choix gratuit ou payant. Acceptez
            ensuite les déclarations demandées par Google.
          </p>
          <Button className="mt-3" variant="outline" onClick={openPlayConsole}>
            <ExternalLink className="h-4 w-4" />
            Ouvrir Play Console
          </Button>
        </SetupStep>

        <SetupStep number="2" title="Gardez exactement cet identifiant Android">
          <p>
            Il sera attaché définitivement à la fiche lors du premier téléversement. Ne le modifiez
            pas dans le fichier Android.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border bg-background px-3 py-2 text-xs">
              {packageName}
            </code>
            <Button variant="outline" onClick={copyPackageName}>
              <ClipboardCopy className="h-4 w-4" />
              Copier
            </Button>
          </div>
          <p className="mt-2 text-xs">
            Si Google indique que cet identifiant est déjà utilisé, n’envoyez pas le fichier : il
            faudra d’abord choisir un nouvel identifiant dans AppPublisher et recréer l’application.
          </p>
        </SetupStep>

        <SetupStep number="3" title="Ajoutez le premier fichier Android au test interne">
          <p>
            Dans Play Console, ouvrez <strong>Tests et publication → Tests → Test interne</strong>,
            créez une version, déposez le fichier Android ci-dessous, puis enregistrez-la. Il n’est
            pas nécessaire de publier pour tout le monde.
          </p>
          {aabPath ? (
            <>
              <p className="mt-2 break-all rounded-lg border bg-background px-3 py-2 text-xs">
                {aabPath}
              </p>
              <Button className="mt-3" variant="outline" onClick={revealAab}>
                <FileArchive className="h-4 w-4" />
                Afficher le fichier dans le Finder
              </Button>
            </>
          ) : (
            <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-200">
              Aucun fichier prêt n’a été trouvé. Revenez à « Créer le fichier Android ».
            </p>
          )}
        </SetupStep>

        <SetupStep number="4" title="Laissez AppPublisher vérifier">
          <p>
            Une fois le premier fichier enregistré dans Play Console, revenez ici. AppPublisher
            vérifiera la fiche sans publier de nouvelle version.
          </p>
          <Button className="mt-3" onClick={onVerify} disabled={verifying}>
            {verifying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            J’ai terminé, vérifier maintenant
          </Button>
        </SetupStep>
      </ol>

      <div className="mt-5 flex items-start gap-2 rounded-xl bg-background/70 p-3 text-xs text-muted-foreground">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        Cette opération n’est nécessaire qu’une seule fois pour chaque nouvelle application.
      </div>
    </div>
  );
}

function SetupStep({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-600 text-sm font-semibold text-white">
        {number}
      </div>
      <div className="min-w-0 flex-1 pt-0.5 text-sm leading-relaxed text-foreground/85">
        <h4 className="font-medium text-foreground">{title}</h4>
        <div className="mt-1 text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}
