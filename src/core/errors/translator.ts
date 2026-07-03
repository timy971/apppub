import type { TranslatedError } from "@/core/types";

/**
 * Traducteur d'erreurs. Aucune stack trace n'est jamais affichée à l'utilisateur.
 * On matche par code Node, par motif de message, ou par indice contextuel.
 * Toute erreur inconnue tombe sur le catalogue `UNKNOWN`.
 */

interface Pattern {
  test: (raw: string) => boolean;
  error: Omit<TranslatedError, "raw" | "retryable"> & { retryable?: boolean };
}

const PATTERNS: Pattern[] = [
  {
    test: (r) => /ENOENT/.test(r) && /version\.mjs/.test(r),
    error: {
      title: "Le script de version est introuvable",
      explanation:
        "AppPublisher n'a pas trouvé le fichier chargé de mettre à jour la version de votre projet.",
      cause: "Le fichier scripts/version.mjs est absent ou a été renommé.",
      solution:
        "Vérifiez que le dossier scripts/ du projet est bien présent, puis relancez.",
      retryable: true,
    },
  },
  {
    test: (r) => /ENOENT/.test(r),
    error: {
      title: "Un dossier ou un fichier est introuvable",
      explanation:
        "L'emplacement demandé n'existe plus ou a été déplacé depuis la dernière utilisation.",
      solution:
        "Vérifiez que votre projet existe toujours et que le dossier n'a pas été déplacé.",
      retryable: true,
    },
  },
  {
    test: (r) => /EACCES|EPERM/.test(r),
    error: {
      title: "Accès refusé au dossier",
      explanation:
        "AppPublisher n'a pas la permission de lire ou d'écrire dans ce dossier.",
      solution: "Choisissez un autre dossier ou vérifiez les permissions.",
      retryable: true,
    },
  },
  {
    test: (r) => /command not found: node|'node' is not recognized/i.test(r),
    error: {
      title: "Node.js n'est pas installé",
      explanation: "AppPublisher a besoin de Node.js pour préparer votre projet.",
      solution: "Installez Node.js LTS depuis nodejs.org, puis relancez.",
      retryable: true,
    },
  },
  {
    test: (r) => /command not found: npm|'npm' is not recognized/i.test(r),
    error: {
      title: "npm n'est pas disponible",
      explanation: "npm accompagne Node.js. Il est requis pour installer les dépendances.",
      solution: "Installez Node.js LTS depuis nodejs.org, puis relancez.",
      retryable: true,
    },
  },
  {
    test: (r) => /command not found: java|'java' is not recognized/i.test(r),
    error: {
      title: "Java n'est pas installé",
      explanation: "La construction Android a besoin de Java (JDK 17 ou plus récent).",
      solution: "Installez le JDK Adoptium (Temurin 17) puis redémarrez AppPublisher.",
      retryable: true,
    },
  },
  {
    test: (r) => /SDK location not found|ANDROID_HOME|ANDROID_SDK_ROOT/i.test(r),
    error: {
      title: "Le SDK Android est introuvable",
      explanation:
        "AppPublisher n'a pas pu localiser le kit de développement Android sur votre ordinateur.",
      cause: "La variable ANDROID_HOME n'est pas définie, ou Android Studio n'est pas installé.",
      solution:
        "Installez Android Studio et laissez-le installer le SDK, puis relancez AppPublisher.",
      retryable: true,
    },
  },
  {
    test: (r) => /Keystore file .* not found|jarsigner|signing config/i.test(r),
    error: {
      title: "Clé de signature introuvable",
      explanation:
        "Votre application ne peut pas être signée : la clé de signature n'a pas été trouvée.",
      solution:
        "Vérifiez que la clé de signature est bien configurée dans les paramètres du projet.",
      retryable: true,
    },
  },
  {
    test: (r) => /gradle.*failed|Execution failed for task/i.test(r),
    error: {
      title: "La construction Android a échoué",
      explanation:
        "L'outil de construction a rencontré un problème pendant la fabrication du fichier final.",
      solution:
        "Relancez la construction. Si le problème persiste, ouvrez Android Studio une fois pour terminer l'installation des composants.",
      retryable: true,
    },
  },
  {
    test: (r) => /ETIMEDOUT|ENOTFOUND|network|ECONNREFUSED/i.test(r),
    error: {
      title: "Pas d'accès Internet",
      explanation: "AppPublisher n'a pas pu joindre le réseau pour cette opération.",
      solution: "Vérifiez votre connexion Internet et réessayez.",
      retryable: true,
    },
  },
  {
    test: (r) => /out of memory|heap out of memory|ENOMEM/i.test(r),
    error: {
      title: "Ordinateur à court de mémoire",
      explanation: "L'opération a demandé plus de mémoire que disponible.",
      solution: "Fermez quelques applications puis réessayez.",
      retryable: true,
    },
  },
];

const UNKNOWN: TranslatedError = {
  title: "Une erreur inattendue est survenue",
  explanation: "Nous n'avons pas pu terminer l'opération, mais rien n'a été cassé.",
  solution: "Réessayez dans un instant. Si le problème persiste, contactez le support.",
  retryable: true,
};

export function translateError(input: unknown): TranslatedError {
  const raw = extractRaw(input);
  for (const p of PATTERNS) {
    if (p.test(raw)) return { ...p.error, retryable: p.error.retryable ?? true, raw };
  }
  return { ...UNKNOWN, raw };
}

function extractRaw(input: unknown): string {
  if (!input) return "";
  if (typeof input === "string") return input;
  if (input instanceof Error) return `${input.name}: ${input.message}\n${input.stack ?? ""}`;
  if (typeof input === "object") {
    const anyIn = input as { code?: string; message?: string; stderr?: string; stdout?: string };
    return [anyIn.code, anyIn.message, anyIn.stderr, anyIn.stdout]
      .filter(Boolean)
      .join("\n");
  }
  return String(input);
}
