import type { GooglePlayLaunchPlan, GooglePlayLaunchTaskId } from "@/core/types";

export type GooglePlayLaunchPhaseId =
  "test" | "store-page" | "declarations" | "availability" | "review";

export interface GooglePlayLaunchTask {
  id: GooglePlayLaunchTaskId;
  phase: GooglePlayLaunchPhaseId;
  title: string;
  detail: string;
  help: string;
}

export interface GooglePlayLaunchPhase {
  id: GooglePlayLaunchPhaseId;
  title: string;
  description: string;
}

export const GOOGLE_PLAY_LAUNCH_PHASES: GooglePlayLaunchPhase[] = [
  {
    id: "test",
    title: "Tester l’application",
    description: "Vérifiez la vraie application installée avant de la montrer au public.",
  },
  {
    id: "store-page",
    title: "Préparer la page du store",
    description: "Donnez envie de télécharger l’application et expliquez clairement son utilité.",
  },
  {
    id: "declarations",
    title: "Répondre aux questions de Google",
    description: "Ces réponses décrivent le contenu, le public et les données de l’application.",
  },
  {
    id: "availability",
    title: "Choisir où et comment la proposer",
    description: "Définissez les pays, le prix et terminez les tests éventuellement exigés.",
  },
  {
    id: "review",
    title: "Envoyer la version au public",
    description: "Créez la version de production, relisez le dossier puis confiez-le à Google.",
  },
];

export const GOOGLE_PLAY_LAUNCH_TASKS: GooglePlayLaunchTask[] = [
  {
    id: "internal-test-installed",
    phase: "test",
    title: "Installer la version de test sur un téléphone",
    detail: "Ouvrez le lien de test interne avec un compte testeur et installez l’application.",
    help: "Dans Play Console, ouvrez Test interne, ajoutez au moins un testeur puis copiez le lien de participation.",
  },
  {
    id: "internal-test-validated",
    phase: "test",
    title: "Vérifier les fonctions importantes",
    detail:
      "Testez le démarrage, la connexion, les paiements éventuels et les fonctions principales.",
    help: "Corrigez tout blocage avant de continuer. Une fiche parfaite ne compense pas une application qui ne fonctionne pas.",
  },
  {
    id: "store-texts",
    phase: "store-page",
    title: "Rédiger le nom et les descriptions",
    detail:
      "Complétez le nom, la description courte et la description complète de la fiche principale.",
    help: "Décrivez d’abord le bénéfice pour l’utilisateur. Évitez les promesses impossibles à vérifier.",
  },
  {
    id: "store-graphics",
    phase: "store-page",
    title: "Ajouter l’icône et les captures d’écran",
    detail: "Ajoutez les visuels demandés par Google et montrez les écrans les plus utiles.",
    help: "Préparez notamment une icône 512 × 512 px, une image de présentation 1 024 × 500 px et au moins deux captures lisibles, sans données personnelles ni écran vide.",
  },
  {
    id: "privacy-policy",
    phase: "store-page",
    title: "Ajouter la politique de confidentialité",
    detail:
      "Indiquez une adresse web publique et accessible qui explique l’utilisation des données.",
    help: "La page doit correspondre au fonctionnement réel de l’application et rester accessible sans connexion.",
  },
  {
    id: "app-access",
    phase: "declarations",
    title: "Expliquer l’accès à l’application",
    detail:
      "Si une connexion est nécessaire, fournissez à Google un compte et des instructions de test valides.",
    help: "Le compte de démonstration ne doit pas expirer pendant l’examen de l’application.",
  },
  {
    id: "ads-declaration",
    phase: "declarations",
    title: "Déclarer la présence de publicités",
    detail: "Répondez oui ou non selon ce que l’utilisateur voit réellement dans l’application.",
    help: "Les bibliothèques publicitaires et les publicités natives doivent être déclarées.",
  },
  {
    id: "target-audience",
    phase: "declarations",
    title: "Choisir le public cible",
    detail: "Indiquez les tranches d’âge auxquelles l’application est réellement destinée.",
    help: "Une application destinée aux enfants entraîne des règles supplémentaires. Ne cochez pas une tranche par défaut.",
  },
  {
    id: "content-rating",
    phase: "declarations",
    title: "Remplir le questionnaire de classification",
    detail:
      "Répondez au questionnaire sur le contenu afin d’obtenir une classification officielle.",
    help: "Répondez selon tout le contenu accessible, y compris les échanges entre utilisateurs.",
  },
  {
    id: "data-safety",
    phase: "declarations",
    title: "Compléter la sécurité des données",
    detail: "Déclarez les données collectées, partagées, chiffrées et supprimables.",
    help: "Vérifiez aussi les services intégrés comme l’authentification, les statistiques, le paiement ou la publicité.",
  },
  {
    id: "countries-and-pricing",
    phase: "availability",
    title: "Choisir les pays et le prix",
    detail:
      "Sélectionnez les territoires de diffusion et confirmez si l’application est gratuite ou payante.",
    help: "Une application déclarée gratuite ne peut généralement pas devenir payante plus tard sans nouvelle fiche.",
  },
  {
    id: "testing-requirements",
    phase: "availability",
    title: "Vérifier les tests exigés par Google",
    detail:
      "Regardez si votre compte doit terminer un test fermé avant de demander l’accès à la production.",
    help: "Play Console affiche la durée et le nombre de testeurs applicables à votre compte. AppPublisher ne les invente pas.",
  },
  {
    id: "production-release",
    phase: "review",
    title: "Créer la version de production",
    detail:
      "Dans Production, promouvez la version déjà testée ou créez une version, puis relisez les avertissements.",
    help: "N’envoyez pas un autre AAB avec le même numéro interne. Utilisez la version qui a été validée.",
  },
  {
    id: "review-submitted",
    phase: "review",
    title: "Envoyer les modifications pour examen",
    detail: "Depuis la vue d’ensemble de publication, envoyez les changements terminés à Google.",
    help: "Cette action ne signifie pas encore que l’application est publique. Google doit d’abord l’accepter.",
  },
];

const KNOWN_TASKS = new Set<GooglePlayLaunchTaskId>(
  GOOGLE_PLAY_LAUNCH_TASKS.map((task) => task.id),
);

export function normalizeGooglePlayLaunchPlan(plan?: GooglePlayLaunchPlan): GooglePlayLaunchPlan {
  const completedTasks = Array.from(
    new Set((plan?.completedTasks ?? []).filter((id) => KNOWN_TASKS.has(id))),
  );
  return { completedTasks, updatedAt: plan?.updatedAt };
}

export function toggleGooglePlayLaunchTask(
  plan: GooglePlayLaunchPlan | undefined,
  taskId: GooglePlayLaunchTaskId,
  checked: boolean,
  now = new Date().toISOString(),
): GooglePlayLaunchPlan {
  if (!KNOWN_TASKS.has(taskId)) return normalizeGooglePlayLaunchPlan(plan);
  const current = normalizeGooglePlayLaunchPlan(plan).completedTasks;
  const next = checked
    ? Array.from(new Set([...current, taskId]))
    : current.filter((id) => id !== taskId);
  return { completedTasks: next, updatedAt: now };
}

export function googlePlayLaunchProgress(plan?: GooglePlayLaunchPlan) {
  const normalized = normalizeGooglePlayLaunchPlan(plan);
  const completed = normalized.completedTasks.length;
  const total = GOOGLE_PLAY_LAUNCH_TASKS.length;
  const nextTask = GOOGLE_PLAY_LAUNCH_TASKS.find(
    (task) => !normalized.completedTasks.includes(task.id),
  );
  return {
    completed,
    total,
    percent: Math.round((completed / total) * 100),
    complete: completed === total,
    nextTask,
  };
}
