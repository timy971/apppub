import type { SetupStep } from "./step";
import { patchAndroidConfig } from "@/core/projects/android-config";
import {
  validateApplicationId,
  validateBundleId,
  validateGitUrl,
} from "@/core/projects/validators";

/**
 * Registre ordonné des étapes du Setup Assistant.
 *
 * L'ordre reflète le parcours logique de configuration d'un projet :
 * identité → dossier → git → android → ios.
 *
 * Extensibilité (Play Console, App Store Connect, Fastlane, Firebase,
 * Crashlytics, RevenueCat, Analytics) : ajouter un objet dans ce
 * tableau — le moteur d'assistant s'adapte automatiquement.
 */
export const SETUP_STEPS: SetupStep[] = [
  {
    id: "name",
    domain: "identity",
    title: "Comment s'appelle votre application ?",
    why: "C'est le nom vu par vos utilisateurs sur le store et sur l'écran d'accueil.",
    hint: "Vous pourrez le modifier à tout moment.",
    example: "Ma Super App",
    isRelevant: () => true,
    isDone: (p) => p.name.trim().length > 0,
    read: (p) => p.name,
    write: (_p, v) => ({ patch: { name: v.trim() }, touched: ["name"] }),
    cockpitTab: "identity",
    cockpitField: "name",
  },
  {
    id: "git",
    domain: "git",
    title: "Votre dépôt Git",
    why: "Un dépôt Git permet de sauvegarder votre code et facilitera plus tard les publications automatiques via GitHub Actions ou Fastlane.",
    hint: "Optionnel. Vous pourrez l'ajouter plus tard.",
    example: "https://github.com/mon-compte/mon-app.git",
    optional: true,
    isRelevant: () => true,
    isDone: (p) => (p.githubRepo ?? "").trim().length > 0,
    read: (p) => p.githubRepo ?? "",
    write: (_p, v) => ({ patch: { githubRepo: v.trim() }, touched: ["githubRepo"] }),
    validate: validateGitUrl,
    cockpitTab: "identity",
    cockpitField: "githubRepo",
  },
  {
    id: "android.applicationId",
    domain: "android",
    title: "Identifiant Android de votre application",
    why: "C'est l'identifiant unique demandé par Google Play. Il ne pourra plus être modifié après la première publication : choisissez-le avec soin.",
    hint: "Format inversé de votre domaine, en minuscules.",
    example: "com.monentreprise.monapp",
    isRelevant: (p) => p.detected.hasAndroid,
    isDone: (p) => (p.publishing?.android?.applicationId ?? "").trim().length > 0,
    read: (p) => p.publishing?.android?.applicationId ?? "",
    write: (p, v) => ({
      patch: patchAndroidConfig(p, { applicationId: v.trim() }),
      touched: ["publishing.android.applicationId"],
    }),
    validate: validateApplicationId,
    cockpitTab: "publishing",
    cockpitField: "android.applicationId",
  },
  {
    id: "android.keystore",
    domain: "android",
    title: "Signature de votre application Android",
    why: "Google Play refuse toute mise à jour qui n'est pas signée avec la même clé que la version initiale. Cette clé est votre carte d'identité auprès de Google.",
    hint: "Chemin vers votre fichier .jks ou .keystore.",
    example: "/Users/moi/keys/monapp.jks",
    optional: true,
    isRelevant: (p) => p.detected.hasAndroid,
    isDone: (p) =>
      (p.publishing?.android?.keystorePath ?? p.keystorePath ?? "").trim().length > 0,
    read: (p) => p.publishing?.android?.keystorePath ?? p.keystorePath ?? "",
    write: (p, v) => ({
      patch: patchAndroidConfig(p, { keystorePath: v.trim() }),
      touched: ["publishing.android.keystorePath"],
    }),
    cockpitTab: "publishing",
    cockpitField: "android.keystorePath",
  },
  {
    id: "android.language",
    domain: "android",
    title: "Langue principale sur Google Play",
    why: "C'est la langue par défaut de votre fiche sur le store. Vous pourrez ajouter d'autres langues plus tard directement dans Play Console.",
    hint: "Code de langue et de pays.",
    example: "fr-FR",
    optional: true,
    isRelevant: (p) => p.detected.hasAndroid,
    isDone: (p) => (p.publishing?.android?.primaryLanguage ?? "").trim().length > 0,
    read: (p) => p.publishing?.android?.primaryLanguage ?? "",
    write: (p, v) => ({
      patch: patchAndroidConfig(p, { primaryLanguage: v.trim() }),
      touched: ["publishing.android.primaryLanguage"],
    }),
    cockpitTab: "publishing",
    cockpitField: "android.primaryLanguage",
  },
  {
    id: "ios.bundleId",
    domain: "ios",
    title: "Identifiant iOS de votre application",
    why: "L'App Store exige un identifiant unique. Utilisez le même schéma que pour Android quand c'est possible.",
    hint: "Format inversé de votre domaine.",
    example: "com.monentreprise.monapp",
    optional: true,
    isRelevant: (p) => p.detected.hasIos || !!p.publishing?.ios,
    isDone: (p) => (p.publishing?.ios?.bundleId ?? "").trim().length > 0,
    read: (p) => p.publishing?.ios?.bundleId ?? "",
    write: (p, v) => ({
      patch: {
        publishing: {
          ...(p.publishing ?? {}),
          ios: { ...(p.publishing?.ios ?? {}), bundleId: v.trim() },
        },
      },
      touched: ["publishing.ios.bundleId"],
    }),
    validate: validateBundleId,
    cockpitTab: "publishing",
    cockpitField: "ios.bundleId",
  },
];
