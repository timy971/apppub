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
} from "@/core/types";

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

export interface SecretsSupportInfo {
  platform: "darwin" | "win32" | "linux" | "web";
  available: boolean;
  reason?: string;
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
    registerRoots(paths: string[]): Promise<string[]>;
  };

  exec: {
    run(opts: ExecOptions, onLine?: ExecLineHandler): Promise<ExecResult>;
  };

  fs: {
    exists(path: string): Promise<boolean>;
    readJson<T = unknown>(path: string): Promise<T | null>;
    readText(path: string): Promise<string | null>;
    stat(path: string): Promise<{ size: number; isFile: boolean; isDir: boolean } | null>;
    listDir(path: string): Promise<string[]>;
    findByExtension(dir: string, ext: string, maxDepth?: number): Promise<string[]>;
    mkdir(path: string): Promise<boolean>;
    writeText(path: string, content: string): Promise<boolean>;
    writeJson(path: string, value: unknown): Promise<boolean>;
    copyFile(src: string, dest: string): Promise<boolean>;
  };

  shell: {
    openFolder(path: string): Promise<void>;
    revealItem(path: string): Promise<void>;
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
    /** Renvoie null si absent, indisponible, ou refusé par l'utilisateur. */
    get(profileId: string, field: "storepass" | "keypass"): Promise<string | null>;
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
    /** Scan ciblé : uniquement les racines fournies. Jamais tout le disque. */
    scan(roots: string[]): Promise<SigningScanResult[]>;
  };
}

