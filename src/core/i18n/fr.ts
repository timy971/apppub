/**
 * Vocabulaire centralisé — Phase UX 1.0.
 *
 * Aucun runtime i18n. Un simple registre de constantes lisible partout
 * dans l'application. Pour ajouter une langue plus tard : dupliquer ce
 * fichier et introduire un sélecteur — l'API des composants ne bouge pas.
 *
 * Convention : la version « humaine » est utilisée en mode Découverte /
 * Assistant. La version « technique » (quand elle existe) est réservée
 * au mode Expert.
 */

export interface Term {
  /** Libellé humain (Découverte / Assistant). */
  label: string;
  /** Libellé technique (mode Expert). */
  technical?: string;
  /** Aide courte affichée sous le champ. */
  hint?: string;
  /** Justification pédagogique — répond à « pourquoi c'est demandé ? ». */
  why?: string;
}

export const TERMS = {
  projectFolder: {
    label: "Dossier du projet",
    technical: "Chemin du projet",
    hint: "Le dossier local qui contient les fichiers de votre application.",
    why: "AppPublisher lit les fichiers de ce dossier pour construire et publier votre application.",
  },
  projectName: {
    label: "Nom de l'application",
    hint: "Le nom vu par vos utilisateurs.",
    why: "C'est le nom affiché sur la fiche du store et sur l'appareil.",
  },
  gitRepo: {
    label: "Dépôt Git",
    technical: "Repository",
    hint: "Adresse du dépôt distant (GitHub, GitLab…). Optionnel mais recommandé.",
    why: "Un dépôt Git permet de sauvegarder votre code et d'automatiser les publications.",
  },
  androidId: {
    label: "Identifiant Android",
    technical: "applicationId",
    hint: "Exemple : com.monentreprise.monapp",
    why: "C'est l'identifiant unique de votre application sur Google Play. Il ne pourra plus être changé une fois publié.",
  },
  androidKeystore: {
    label: "Signature Android",
    technical: "keystore",
    hint: "Fichier .jks ou .keystore qui signe cryptographiquement votre application.",
    why: "Google Play exige que chaque mise à jour soit signée avec la même clé, pour prouver que vous en êtes bien l'auteur.",
  },
  androidKeystoreAlias: {
    label: "Alias du keystore",
    technical: "keystore alias",
    hint: "Nom donné à votre clé lors de sa création.",
    why: "Un même keystore peut contenir plusieurs clés — l'alias identifie celle utilisée pour signer.",
  },
  androidLanguage: {
    label: "Langue principale (Android)",
    hint: "Exemple : fr-FR",
    why: "Détermine la fiche par défaut de votre application sur Google Play.",
  },
  iosBundleId: {
    label: "Identifiant iOS",
    technical: "bundleId",
    hint: "Exemple : com.monentreprise.monapp",
    why: "Identifiant unique de votre application sur l'App Store.",
  },
  iosTeamId: {
    label: "Identifiant d'équipe Apple",
    technical: "Team ID",
    hint: "10 caractères alphanumériques fournis par Apple Developer.",
    why: "Apple exige un Team ID valide pour signer et publier une application iOS.",
  },
  artifact: {
    label: "Fichier généré (.aab)",
    technical: "Artifact",
    why: "Google Play accepte uniquement des fichiers .aab générés pour la version en cours.",
  },
  workingDir: {
    label: "Dossier utilisé",
    technical: "Working directory",
  },
} satisfies Record<string, Term>;

export type TermKey = keyof typeof TERMS;

/** Retourne le libellé selon le mode d'expérience. */
export function termLabel(key: TermKey, expert: boolean): string {
  const t = TERMS[key] as Term;
  return expert && t.technical ? t.technical : t.label;
}
