import { Info, Rocket } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * Bandeau pédagogique du Publish Center.
 *
 * Explique la séparation entre préparation locale et envoi explicite.
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
            Préparer puis publier, sans perdre le contrôle.
          </div>
          <p className="text-muted-foreground leading-relaxed">
            AppPublisher vérifie la configuration, les notes et le fichier Android (AAB). Une fois
            la version préparée, vous pouvez l'envoyer à vos testeurs internes sur Google Play.
          </p>
          <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[12px] text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <strong className="text-foreground">Sécurité&nbsp;:</strong> aucune publication ne
              part sans votre confirmation. La publication publique reste volontairement désactivée
              : AppPublisher commence toujours par le groupe de test interne.
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
