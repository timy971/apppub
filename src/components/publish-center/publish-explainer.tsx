import { Info, Rocket } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * Bandeau pédagogique du Publish Center.
 *
 * Explique la philosophie du produit : AppPublisher prépare la release
 * localement — l'envoi automatique vers Google Play, App Store Connect,
 * TestFlight, Fastlane, GitHub Releases arrive en priorité sur la
 * feuille de route. Rend l'attente compréhensible et non-frustrante.
 */
export function PublishExplainer() {
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/8 via-background to-background p-5 shadow-soft">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Rocket className="h-5 w-5" />
        </div>
        <div className="min-w-0 space-y-2 text-sm">
          <div className="font-semibold text-foreground">
            Préparer une release, sereinement.
          </div>
          <p className="text-muted-foreground leading-relaxed">
            AppPublisher vérifie que tout est prêt avant que vous n'ouvriez
            Google Play Console : configuration correcte, notes de version
            rédigées, artefact signé. Vous gardez la main pour l'envoi
            final.
          </p>
          <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[12px] text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <strong className="text-foreground">Prochainement&nbsp;:</strong>{" "}
              envoi automatique vers Google Play, App Store Connect,
              TestFlight et GitHub Releases.
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
