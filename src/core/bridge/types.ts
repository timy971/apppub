/**
 * SystemBridge — contrat unique entre le renderer et le monde extérieur.
 * Web (preview Lovable) : implémenté par un adapter simulé.
 * Electron (binaire distribué) : implémenté par le preload qui expose
 * `window.appPublisher` via `contextBridge`.
 */
import type {
  DetectedFiles,
  ExecLineHandler,
  ExecOptions,
  ExecResult,
  ScannedProject,
  SystemInfo,
  GitRelation,
} from "@/core/types";

export interface GitRemoteInfo {
  remoteUrl: string;
  defaultBranch: string;
  branches: string[];
}

export interface GitProjectStatus {
  remoteUrl: string;
  branch: string;
  headSha: string;
  shortSha: string;
  upstream?: string;
  ahead: number;
  behind: number;
  relation: GitRelation;
  workingTree: "clean" | "dirty";
  changedFiles: string[];
  checkedAt: string;
}

export interface GitCloneResult {
  localPath: string;
  reused: boolean;
  status: GitProjectStatus;
  detected: DetectedFiles;
}

export interface GitSyncResult {
  updated: boolean;
  previousHeadSha: string;
  status: GitProjectStatus;
  detected: DetectedFiles;
}

export interface SigningKeystoreListArgs {
  keystorePath: string;
  /** Mot de passe du store — jamais persisté. */
  storepass: string;
  /** Optionnel : restreint la lecture à un alias donné. */
  alias?: string;
}

export interface SigningKeystoreListResult {
  ok: boolean;
  /** stdout brut (parsable par `parseKeytoolListOutput`). */
  stdout?: string;
  /** Code d'erreur classifié (jamais le stderr brut). */
  errorCode?:
    | "file-missing"
    | "wrong-password"
    | "alias-not-found"
    | "invalid-keystore"
    | "keytool-missing"
    | "unknown";
  errorHint?: string;
}

export interface SigningKeystoreCreateArgs {
  keystorePath: string;
  alias: string;
  storepass: string;
  keypass: string;
  /** DN complet, ex : "CN=CranioScan Release, O=TCC, C=FR". */
  dname: string;
  /** Durée de validité en jours (défaut 10000). */
  validityDays: number;
  keyalg?: "RSA";
  keysize?: number;
}

export interface SigningKeystoreCreateResult {
  ok: boolean;
  errorCode?: "file-exists" | "keytool-missing" | "invalid-args" | "unknown";
  errorHint?: string;
}

export interface SigningScanResult {
  path: string;
  /** Détecté à partir de l'extension. */
  storeType: "JKS" | "PKCS12" | "unknown";
  /** Taille en octets (informationnel). */
  size: number;
}

export interface SigningKeystoreResolveResult {
  ok: boolean;
  storedPath: string;
  resolvedPath?: string;
  testedPaths: string[];
  isAbsolute: boolean;
  readable: boolean;
  errorCode?: "not-found" | "multiple-matches" | "not-a-file" | "not-readable" | "invalid-path";
  candidates?: string[];
}

export interface SigningAabVerifyResult {
  ok: boolean;
  sha256?: string;
  certificate?: string;
  errorCode?:
    "file-missing" | "empty-file" | "jarsigner-missing" | "unsigned" | "verification-failed";
  errorHint?: string;
}

export type SigningStoredValidationResult = Omit<SigningKeystoreListResult, "errorCode"> & {
  errorCode?:
    | SigningKeystoreListResult["errorCode"]
    | "keychain-unavailable"
    | "keychain-missing"
    | "profile-mismatch";
};

export type SigningPrepareBuildResult =
  | {
      ok: true;
      sessionId: string;
      keystorePath: string;
      storedPathWasAbsolute: boolean;
      testedPaths: string[];
    }
  | {
      ok: false;
      errorCode:
        | "profile-mismatch"
        | "project-not-authorized"
        | "file-missing"
        | "wrong-password"
        | "alias-not-found"
        | "invalid-keystore"
        | "keytool-missing"
        | "keychain-unavailable"
        | "keychain-missing"
        | "session-failed"
        | "unknown";
      errorHint?: string;
    };

export interface SecretsSupportInfo {
  platform: "darwin" | "win32" | "linux" | "web";
  available: boolean;
  reason?: string;
}

export interface GradleEnsureExecutableResult {
  ok: boolean;
  path?: string;
  errorCode?:
    | "project-not-authorized"
    | "wrapper-not-found"
    | "wrapper-not-file"
    | "chmod-failed"
    | "internal-error";
}

export interface BackupFileRecord {
  path: string;
  size: number;
}

export interface NativeBackupResult {
  location: string;
  files: BackupFileRecord[];
}

export interface SystemBridge {
  readonly runtime: "electron" | "web";

  system: {
    detect(): Promise<SystemInfo>;
  };

  projects: {
    detect(path: string): Promise<DetectedFiles | null>;
    scan(rootPath: string): Promise<ScannedProject[]>;
    chooseFolder(): Promise<string | null>;
    reauthorizeFolder(expectedPath: string): Promise<string | null>;
  };

  git: {
    inspectRemote(remoteUrl: string): Promise<GitRemoteInfo>;
    clone(args: { remoteUrl: string; branch: string }): Promise<GitCloneResult>;
    status(args: {
      projectPath: string;
      remoteUrl: string;
      branch: string;
    }): Promise<GitProjectStatus>;
    check(args: {
      projectPath: string;
      remoteUrl: string;
      branch: string;
    }): Promise<GitProjectStatus>;
    sync(args: { projectPath: string; remoteUrl: string; branch: string }): Promise<GitSyncResult>;
  };

  gradle: {
    ensureExecutable(projectPath: string): Promise<GradleEnsureExecutableResult>;
    ensureSigningPatch(androidDir: string): Promise<{
      ok: boolean;
      changed?: boolean;
      errorCode?:
        | "project-not-authorized"
        | "gradle-missing"
        | "invalid-content"
        | "managed-block-corrupt"
        | "write-failed";
    }>;
  };

  backups: {
    create(
      projectPath: string,
      reason: "build" | "manual" | "publish" | "version",
    ): Promise<NativeBackupResult>;
    restore(
      projectPath: string,
      location: string,
      files: BackupFileRecord[],
    ): Promise<NativeBackupResult>;
  };

  exec: {
    run(opts: ExecOptions, onLine?: ExecLineHandler, signal?: AbortSignal): Promise<ExecResult>;
  };

  fs: {
    exists(path: string): Promise<boolean>;
    readJson<T = unknown>(path: string): Promise<T | null>;
    readText(path: string): Promise<string | null>;
    stat(path: string): Promise<{ size: number; isFile: boolean; isDir: boolean } | null>;
    listDir(path: string): Promise<string[]>;
    findByExtension(dir: string, ext: string, maxDepth?: number): Promise<string[]>;
  };

  shell: {
    openFolder(path: string): Promise<void>;
    revealItem(path: string): Promise<void>;
    openExternal(url: string): Promise<boolean>;
  };

  net: {
    online(): Promise<boolean>;
  };

  /**
   * Coffre de secrets système (macOS Keychain, Windows/Linux : stub).
   * INVARIANT : aucun secret ne transite par le journal, le diag ou
   * l'analytics. Seul le rendu qui vient de saisir le mot de passe le
   * connaît, le temps de l'envoyer au coffre.
   */
  secrets: {
    supported(): Promise<SecretsSupportInfo>;
    /** true si stocké avec succès. Un `false` = coffre indisponible. */
    set(profileId: string, field: "storepass" | "keypass", value: string): Promise<boolean>;
    /** Efface toutes les entrées associées à un profil. */
    remove(profileId: string): Promise<boolean>;
  };

  /**
   * Opérations dédiées aux signatures Android. Encapsulent `keytool` afin
   * que le renderer ne manipule jamais un stderr brut ni ne construise
   * lui-même une ligne de commande contenant un mot de passe.
   */
  signing: {
    /** Ouvre un dialog natif pour choisir un fichier .jks / .keystore. */
    chooseKeystore(): Promise<string | null>;
    /** Ouvre un dialog natif pour choisir un dossier de destination. */
    chooseOutputFolder(): Promise<string | null>;
    /** Lit un keystore via `keytool -list -v`. Ne persiste aucun secret. */
    keystoreList(args: SigningKeystoreListArgs): Promise<SigningKeystoreListResult>;
    /** Crée un keystore via `keytool -genkeypair`. Refuse si le fichier existe déjà. */
    keystoreCreate(args: SigningKeystoreCreateArgs): Promise<SigningKeystoreCreateResult>;
    /** Valide un profil enregistré sans ressortir son mot de passe du main process. */
    validateStored(args: {
      profileId: string;
      keystorePath: string;
      alias: string;
      projectPath?: string;
    }): Promise<SigningStoredValidationResult>;
    /** Prépare un jeton Gradle mono-usage ; aucun secret n'est retourné au renderer. */
    prepareBuild(args: {
      profileId: string;
      keystorePath: string;
      alias: string;
      projectPath: string;
    }): Promise<SigningPrepareBuildResult>;
    /** Scan ciblé : uniquement les racines fournies. Jamais tout le disque. */
    scan(roots: string[]): Promise<SigningScanResult[]>;
    /** Normalise et vérifie le chemin du keystore avant tout lancement Gradle. */
    resolveKeystore(args: {
      storedPath: string;
      projectPath: string;
    }): Promise<SigningKeystoreResolveResult>;
    /** Vérifie qu'un AAB non vide porte une signature JAR valide. */
    verifyAab(path: string): Promise<SigningAabVerifyResult>;
  };
}
