# 12 — Business & concurrence

Sources web citées, vérifiées le 4 août 2026. Les chiffres de tarification évoluent : chaque ligne porte son URL pour revérification.

## 12.1 Positionnement d'AppPublisher

Promesse produit (`CODE` connaissance projet) : « permettre à toute personne capable de créer une application de la publier sans devenir développeur », en orchestrant Git, Capacitor, Gradle et la Play Console depuis une application desktop.

**Le segment visé est vacant** (`PART`, recherche web) : aucun produit desktop macOS/Windows orchestrant explicitement Git + Capacitor + Gradle + Play Console pour non-développeurs n'a été identifié. Le marché a convergé vers du SaaS cloud CI/CD. C'est une opportunité réelle de différenciation, à confirmer sur Product Hunt / r/androiddev avant d'en faire un argument de levée.

## 12.2 Comparatif concurrentiel

| Acteur | Nature | Prix | Signature Android | Upload auto Play | Pour non-dev ? |
| --- | --- | --- | --- | --- | --- |
| [Expo EAS](https://expo.dev/pricing) | SaaS cloud (build + submit) | Free limité, Production 99 $/mois | Oui (keystore géré, Play App Signing) | **Oui** (`eas submit`) | Oui pour l'écosystème Expo/RN |
| [Codemagic](https://codemagic.io/pricing/) | CI/CD cloud mobile | Free, ~0,045–0,114 $/min, Enterprise 12 000 $/an | Oui | **Oui** | Semi (YAML) |
| [Bitrise](https://bitrise.io/pricing) | CI/CD mobile | Hobby gratuit, Team ~89–99 $/mois, Business ~199–225 $/mois | Oui | **Oui** | Semi (workflows visuels) |
| [Ionic Appflow](https://ionic.io/appflow/pricing) | CI/CD Ionic/Capacitor + OTA | Payant (~49 $/mois historiquement ; page en redirection, `NV`) | Oui | **Oui** | Semi |
| [Fastlane](https://fastlane.tools) | CLI open source | Gratuit | Oui | **Oui** (`supply`) | **Non** (Ruby, CLI) |
| [GitHub Actions + upload-google-play](https://github.com/r0adkll/upload-google-play) | CI + action communautaire | Gratuit (repos publics) | À gérer soi-même | Oui | **Non** (YAML, service account) |
| [Capgo](https://capgo.app/pricing) | OTA pour Capacitor | Free + abonnements | Non | Non | Oui, mais hors périmètre (updates post-publication) |
| [Median.co](https://median.co/pricing) / GoNative | Wrapper WebView cloud | Abonnements mensuels (`PART`, page 403) | Partiel (build signé fourni) | Partiel selon plan | **Oui** |
| [Google Play Console](https://support.google.com/googleplay/android-developer/answer/6112435) | Destination | 25 $ une fois | Play App Signing obligatoire | — | — |
| [Apple Developer Program](https://developer.apple.com/programs/whats-included/) | Destination iOS | 99 $/an | Xcode + Mac obligatoires | — | — |

### Contraintes de plateforme à intégrer au produit

`PART` (à revérifier à la date de lecture) : AAB obligatoire depuis août 2021 ; `targetSdk` minimum relevé chaque année ; vérification d'identité développeur renforcée ; pour les nouveaux comptes développeur **personnels**, une phase de test fermé (**20 testeurs pendant 14 jours** selon la policy la plus récente citée, seuil ayant évolué depuis 12) est requise avant l'accès à la production — [référence Google](https://support.google.com/googleplay/android-developer/answer/14151465).

**Constat BIZ-001 (P1)** — AppPublisher ne modélise **aucune** de ces contraintes : ni `targetSdk` minimum, ni la règle des testeurs, ni la vérification d'identité (`CODE` : aucune occurrence de `targetSdk`, `testers`, `identity` dans `src/core/publish/**`). Or ce sont précisément les murs sur lesquels un utilisateur non technique se cogne en premier — bien avant Gradle.

## 12.3 Écart entre la promesse et l'implémentation

| Promesse produit | État réel | Doc |
| --- | --- | --- |
| « publier son application » | Aucun appel d'API store : préparation locale + ouverture du navigateur | [03](03-inventaire-fonctionnel.md) |
| « créer une nouvelle version » | Dépend d'un `scripts/version.mjs` absent des projets réels ; `versionCode` jamais écrit dans Android | [03](03-inventaire-fonctionnel.md) |
| « sans ouvrir le Terminal » | Tenu pour build/signature sur macOS ; **impossible sur Windows** (pas de coffre-fort de mots de passe) | [07](07-audit-electron-securite.md) V-03 |
| « publier régulièrement » | Aucun canal de mise à jour du produit lui-même, paquet non signé ni notarisé | [01](01-etat-des-lieux.md) BUILD-004 |

**Conclusion business** : la différenciation est crédible et le créneau semble libre, mais **la partie de la chaîne qui justifie un prix — la publication — est celle qui manque**. En l'état, un utilisateur paierait pour un assistant de build local ; les concurrents cloud livrent le build **et** l'envoi au store pour 99 $/mois.

## 12.4 Modèle économique — pistes

`INFER` (aucune donnée de marché desktop comparable) :

1. **Licence one-time + mises à jour annuelles** cohérente avec la nature desktop et l'absence de coût d'infrastructure (le build tourne chez l'utilisateur) — argument fort face au SaaS : aucun code source ne quitte la machine, aucun keystore uploadé.
2. **Abonnement bas (10–20 €/mois)** justifié seulement une fois l'upload Play automatisé et le suivi de release livré.
3. Prérequis absolu avant toute monétisation : signature/notarisation macOS, installeur, canal de mise à jour ([01](01-etat-des-lieux.md) BUILD-004) — on ne facture pas un logiciel que Gatekeeper refuse d'ouvrir.

Argument de vente le plus défendable, et déjà techniquement vrai : **« vos clés de signature ne quittent jamais votre Mac »** (trousseau système, mots de passe hors `argv`, allowlist d'exécution). Aucun concurrent cloud ne peut le dire.
