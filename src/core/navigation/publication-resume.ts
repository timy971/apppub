import type { PublicationArtifactRecoveryResult } from "@/core/bridge/types";
import type { PublicationJourneyPath } from "@/core/types";

export interface PublicationResumeInput {
  lastJourneyPath?: PublicationJourneyPath;
  returnToJourneyPath?: PublicationJourneyPath;
  recovery?: PublicationArtifactRecoveryResult | null;
}

/**
 * Choisit l'étape réellement utile après un redémarrage.
 *
 * Ordre de confiance :
 * 1. un retour temporaire explicite (correction demandée depuis une étape) ;
 * 2. le manifeste durable : un AAB stable signifie que l'étape build est terminée ;
 * 3. le dernier écran mémorisé.
 */
export function resolvePublicationResumePath(
  input: PublicationResumeInput,
): PublicationJourneyPath | undefined {
  if (input.returnToJourneyPath) return input.returnToJourneyPath;
  if (input.recovery?.artifactPath) return "/publish";
  return input.lastJourneyPath;
}

let startupResumeConsumed = false;

/**
 * Une reprise automatique ne doit se produire qu'au démarrage de l'interface.
 * Après cela, un clic volontaire sur Accueil doit rester sur Accueil.
 */
export function consumeStartupResume(): boolean {
  if (startupResumeConsumed) return false;
  startupResumeConsumed = true;
  return true;
}

export function resetStartupResumeForTests(): void {
  startupResumeConsumed = false;
}
