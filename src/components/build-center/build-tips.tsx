import { useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";
import { Card } from "@/components/ui/card";

const TIPS: string[] = [
  "Premier build Android ? Gradle télécharge parfois plusieurs centaines de Mo de dépendances. Les builds suivants seront beaucoup plus rapides.",
  "Vous pouvez continuer à utiliser AppPublisher pendant qu'un build est en cours.",
  "Un build échoue ? AppPublisher traduit l'erreur en langage clair dans le panneau ci-dessous.",
  "Le fichier .aab produit peut être envoyé directement sur Google Play Console.",
  "Les builds suivants réutilisent le cache Gradle : ils prennent souvent moitié moins de temps.",
  "Chaque build est enregistré dans l'historique, avec sa durée et son résultat.",
];

interface Props {
  /** L'astuce n'apparaît qu'après ce délai (par défaut 20 s). */
  afterMs?: number;
  /** Rotation entre astuces. */
  rotateMs?: number;
}

/**
 * Astuces contextuelles affichées pendant l'attente d'un build long.
 * Rassure l'utilisateur en occupant utilement le temps mort.
 */
export function BuildTips({ afterMs = 20000, rotateMs = 8000 }: Props) {
  const [visible, setVisible] = useState(false);
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * TIPS.length));

  useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), afterMs);
    return () => window.clearTimeout(t);
  }, [afterMs]);

  useEffect(() => {
    if (!visible) return;
    const t = window.setInterval(() => {
      setIdx((i) => (i + 1) % TIPS.length);
    }, rotateMs);
    return () => window.clearInterval(t);
  }, [visible, rotateMs]);

  if (!visible) return null;

  return (
    <Card className="p-4 shadow-soft border-dashed">
      <div className="flex items-start gap-3">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Le saviez-vous ?
          </div>
          <p className="mt-1 text-sm text-foreground/90 animate-fade-in" key={idx}>
            {TIPS[idx]}
          </p>
        </div>
      </div>
    </Card>
  );
}
