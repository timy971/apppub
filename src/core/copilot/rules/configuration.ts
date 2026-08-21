import type { CopilotRecommendation, CopilotRule } from "../types";
import { hasLinkedSigningProfile } from "@/core/navigation/publication-next-step";

/**
 * Rejoue les findings de ProjectStatusService et les convertit en
 * recommandations Copilot. Aucune logique métier locale — on utilise la
 * source de vérité déjà en place.
 */
export const configurationRule: CopilotRule = {
  id: "configuration",
  evaluate(ctx) {
    const { status, project } = ctx;
    if (!status || !project) return null;

    const recs: CopilotRecommendation[] = [];
    for (const f of status.findings) {
      // La signature est traitée ci-dessous avec la liste réelle des profils,
      // afin de détecter aussi une association devenue obsolète.
      if (f.id === "android.keystore") continue;
      const isConfigDomain =
        f.domain === "android" ||
        f.domain === "ios" ||
        f.domain === "identity" ||
        f.domain === "git";

      if (!isConfigDomain && f.domain !== "version") continue;

      const priorityBase = f.severity === "error" ? 20 : f.severity === "warn" ? 60 : 200;
      // Version = étape 2 du cycle : légèrement moins prioritaire qu'un
      // blocage de configuration.
      const priority = priorityBase + (f.domain === "version" ? 5 : f.domain === "ios" ? 3 : 0);

      recs.push({
        id: `configuration.${f.id}`,
        kind:
          f.severity === "error" ? "blocking" : f.severity === "warn" ? "warning" : "information",
        priority,
        headline: f.message,
        description: f.explanation ?? f.hint,
        action: f.action
          ? {
              title: f.action.label,
              description: f.explanation ?? f.hint ?? "Corriger dans le cockpit.",
              route: "/projects/$id",
              priority: f.severity === "error" ? "high" : "medium",
              cockpitTab: f.action.tab,
              cockpitField: f.action.field,
            }
          : undefined,
      });
    }
    const signingReady = hasLinkedSigningProfile(project, ctx.signingProfileIds ?? []);
    if (signingReady) {
      recs.push({
        id: "configuration.android-signing.ready",
        kind: "success",
        priority: 925,
        headline: "Signature Android associée",
        completedStepId: "signing",
      });
    } else {
      recs.push({
        id: "configuration.android-signing.required",
        kind: "warning",
        priority: 48,
        headline: "Protégez l'application avant de créer le fichier Android",
        description:
          "Créez une signature ou associez un profil existant. AppPublisher en aura besoin pour produire un fichier accepté par Google Play.",
        action: {
          title: "Protéger l'application",
          description: "Créer ou choisir la signature Android de cette application.",
          route: "/signing",
          priority: "medium",
        },
      });
    }
    return recs;
  },
};
