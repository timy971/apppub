/**
 * Android Signing Manager — modèle de données.
 *
 * INVARIANT DE SÉCURITÉ : aucun champ de ce type ne doit jamais contenir
 * un mot de passe, une clé privée ou un secret. Les mots de passe
 * (storepass / keypass) sont stockés exclusivement dans le trousseau
 * système via `SecretVault`. Le renderer ne les manipule qu'en mémoire
 * volatile (state React d'un formulaire, effacé au submit).
 */

export type SigningStoreType = "JKS" | "PKCS12";

export interface CertificateInfo {
  /** DN complet du sujet (CN=…, O=…, C=…). */
  subject: string;
  /** DN complet de l'émetteur (identique au sujet pour un self-signed). */
  issuer: string;
  /** ISO string. */
  validFrom: string;
  /** ISO string. */
  validUntil: string;
  /** Empreinte SHA-256, format "AA:BB:CC:…". */
  sha256: string;
  /** Empreinte SHA-1, format "AA:BB:CC:…". */
  sha1: string;
  /** Algorithme de signature (ex : "SHA256withRSA"). */
  algorithm: string;
  /** Numéro de série (hex). */
  serialNumber?: string;
}

export type SecureStorageKind = "system-keychain" | "unavailable";

export interface SigningProfile {
  id: string;
  /** Nom d'affichage libre (ex : "CranioScan Release"). */
  name: string;
  keystorePath: string;
  alias: string;
  storeType: SigningStoreType;
  /**
   * Métadonnées lisibles extraites de `keytool -list -v`. Optionnel :
   * peut être `undefined` avant la première validation.
   */
  certificate?: CertificateInfo;
  secureStorage: SecureStorageKind;
  createdAt: string;
  /** Dernière validation réussie (mot de passe correct + certificat lisible). */
  lastValidatedAt?: string;
  /** Dernière utilisation par un build (mise à jour par le pipeline). */
  lastUsedAt?: string;
}

export type SigningValidationCode =
  | "ok"
  | "file-missing"
  | "invalid-keystore"
  | "wrong-password"
  | "alias-not-found"
  | "certificate-unreadable"
  | "keychain-missing"
  | "keychain-unavailable"
  | "keytool-missing"
  | "unknown";

export interface SigningValidationResult {
  code: SigningValidationCode;
  /** Titre court destiné à l'UI ("Mot de passe incorrect"). */
  title: string;
  /** Explication pédagogique, jamais technique brute. */
  message: string;
  certificate?: CertificateInfo;
  /** true si l'utilisateur peut lancer un build avec ce profil. */
  ok: boolean;
}

export type SigningEventKind =
  | "profile-created"
  | "profile-imported"
  | "profile-deleted"
  | "profile-validated"
  | "profile-used"
  | "keystore-created";

/**
 * Payload de log — n'accepte QUE des champs non-secrets. Tout ajout ici
 * doit être vérifié : jamais de storepass/keypass.
 */
export interface SigningEvent {
  kind: SigningEventKind;
  profileId?: string;
  profileName?: string;
  alias?: string;
  sha256?: string;
  projectId?: string;
  message?: string;
}
