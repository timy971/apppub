import { createFileRoute } from "@tanstack/react-router";
import { Apple, Clock3 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/apple")({
  component: ApplePublicationPage,
});

function ApplePublicationPage() {
  return (
    <div>
      <PageHeader
        title="Publication iPhone et iPad"
        subtitle="Une future étape indépendante de la publication sur Google Play."
      />

      <Card className="max-w-3xl border-dashed p-6 shadow-soft">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
            <Apple className="h-7 w-7" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">Publication Apple</h2>
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                <Clock3 className="h-3 w-3" aria-hidden="true" />
                En pause
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Cette partie sera développée lorsque vous souhaiterez publier sur l'App Store et que
              vous disposerez d'un compte Apple Developer. Elle aura son propre parcours, séparé de
              Google Play.
            </p>
            <p className="mt-4 text-sm font-medium">Vous n'avez rien à configurer maintenant.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
