import type { Project } from "@/core/types";
import type { FieldValidator } from "@/core/projects/validators";

/**
 * Une étape du Setup Assistant.
 *
 * Chaque étape est autonome : elle sait dire si elle s'applique
 * (isRelevant), si elle est déjà remplie (isDone), et comment lire /
 * écrire son champ dans le projet.
 *
 * Pour ajouter une future intégration (Google Play, App Store Connect,
 * Fastlane, Firebase, Crashlytics, RevenueCat, Analytics), il suffit
 * d'ajouter un objet SetupStep dans `step-registry.ts`. Aucune autre
 * modification n'est nécessaire.
 */
export interface SetupStep {
  /** Identifiant stable, sert de deep-link (?setup=<id>). */
  id: string;
  /** Domaine logique (utile pour groupements futurs). */
  domain: "identity" | "location" | "git" | "android" | "ios" | "release";
  /** Titre de l'étape (mode Découverte / Assistant). */
  title: string;
  /** Une phrase qui répond à « pourquoi ? ». */
  why: string;
  /** Aide sous le champ. */
  hint?: string;
  /** Exemple concret injecté comme placeholder. */
  example?: string;
  /** Facultatif : l'utilisateur peut passer sans bloquer la suite. */
  optional?: boolean;
  /** Cette étape n'est proposée que si le projet le justifie. */
  isRelevant: (p: Project) => boolean;
  /** L'étape est déjà satisfaite. */
  isDone: (p: Project) => boolean;
  /** Lit la valeur actuelle pour préremplir le champ. */
  read: (p: Project) => string;
  /** Construit le patch à appliquer via ProjectsService.update. */
  write: (p: Project, value: string) => { patch: Partial<Project>; touched: string[] };
  /** Validation légère (facultative). */
  validate?: FieldValidator;
  /**
   * Champ ciblé dans le cockpit (data-cockpit-field). Permet le bouton
   * "Ouvrir dans le cockpit" pour les experts.
   */
  cockpitField?: string;
  cockpitTab?: "identity" | "publishing";
}
