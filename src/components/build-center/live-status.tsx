import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { OperationStep } from "@/core/operations/types";

/**
 * Messages rotatifs et vivants, pour éviter l'impression d'écran figé
 * pendant les longues phases de Gradle. Ne modifie AUCUNE opération —
 * pur affichage, alimenté par l'étape courante.
 */

const PHRASES: Record<string, string[]> = {
  prepare: [
    "Préparation de l'environnement…",
    "Vérification des outils requis…",
    "Nettoyage des artefacts précédents…",
  ],
  install: [
    "Installation des dépendances…",
    "npm télécharge les paquets nécessaires…",
    "Résolution des dépendances en cours…",
  ],
  web: [
    "Compilation de l'application web…",
    "Optimisation des ressources…",
    "Création du bundle JavaScript…",
  ],
  sync: [
    "Synchronisation avec Capacitor…",
    "Mise à jour du projet Android…",
    "Copie des assets web dans Android…",
  ],
  gradle: [
    "Gradle prépare la compilation…",
    "Compilation des ressources Android…",
    "Assemblage du bundle Android (.aab)…",
    "Optimisation du code…",
    "Signature de l'application…",
    "Cette étape est souvent la plus longue.",
  ],
  sign: [
    "Signature cryptographique en cours…",
    "Vérification de la clé de signature…",
  ],
  finalize: [
    "Création du fichier final…",
    "Vérification de l'intégrité…",
    "Presque terminé.",
  ],
};

const FALLBACK: string[] = [
  "Traitement en cours…",
  "Cette étape se poursuit en arrière-plan.",
  "AppPublisher continue le travail.",
];

function phrasesFor(step: OperationStep | undefined): string[] {
  if (!step) return FALLBACK;
  const id = step.id.toLowerCase();
  for (const key of Object.keys(PHRASES)) {
    if (id.includes(key)) return PHRASES[key];
  }
  return FALLBACK;
}

/**
 * Bandeau vivant qui remplace un compteur figé. Le message tourne toutes
 * les 4 secondes même si Gradle ne produit aucune ligne, pour maintenir
 * la sensation d'activité.
 */
export function LiveStatus({ step }: { step: OperationStep | undefined }) {
  const phrases = phrasesFor(step);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [step?.id]);

  useEffect(() => {
    if (phrases.length <= 1) return;
    const t = window.setInterval(() => {
      setIdx((i) => (i + 1) % phrases.length);
    }, 4000);
    return () => window.clearInterval(t);
  }, [phrases]);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-75" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
          En cours
        </div>
        <div className="mt-0.5 text-sm text-foreground/90 animate-fade-in" key={idx}>
          {phrases[idx]}
        </div>
      </div>
    </div>
  );
}
