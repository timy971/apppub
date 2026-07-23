import { Check, AlertTriangle, CircleX, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Project } from "@/core/types";
import type { ChecklistCategory, PreparationScore } from "./shared";

interface Props {
  project: Project;
  score: PreparationScore;
  categories: ChecklistCategory[];
}

export function ValidationSummaryCard({ project, score, categories }: Props) {
  const errors = categories
    .flatMap((c) => c.entries)
    .filter((e) => e.severity === "error");
  const warnings = categories
    .flatMap((c) => c.entries)
    .filter((e) => e.severity === "warn");

  // Cible du bouton principal : premier point bloquant (ou avertissement),
  // sinon la vue d'ensemble du projet. Évite d'atterrir sur "overview"
  // quand l'utilisateur vient de voir un blocage précis.
  const firstActionable = (errors[0] ?? warnings[0])?.action;
  const targetTab = firstActionable?.tab ?? "overview";
  const targetField = firstActionable?.field;


  const tone =
    score.level === "ready"
      ? {
          bg: "bg-success/10 border-success/30",
          circle: "bg-success text-success-foreground",
          Icon: Check,
          headline: "Vous pouvez publier.",
          detail:
            "Toutes les vérifications essentielles sont passées. Vous pouvez préparer la release en toute confiance.",
        }
      : score.level === "almost"
        ? {
            bg: "bg-warning/10 border-warning/30",
            circle: "bg-warning text-warning-foreground",
            Icon: AlertTriangle,
            headline: "Presque prêt.",
            detail:
              "Quelques points ne sont pas bloquants mais méritent une dernière vérification avant l'envoi.",
          }
        : {
            bg: "bg-danger/10 border-danger/30",
            circle: "bg-danger text-danger-foreground",
            Icon: CircleX,
            headline: "Publication impossible pour l'instant.",
            detail:
              "Un ou plusieurs éléments essentiels manquent. Corrigez-les pour continuer la préparation.",
          };

  const highlights = (errors.length ? errors : warnings).slice(0, 3);

  return (
    <Card className={"p-6 shadow-soft border " + tone.bg}>
      <div className="flex items-start gap-4">
        <div
          className={
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-full " +
            tone.circle
          }
        >
          <tone.Icon className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Puis-je publier ?
          </div>
          <div className="mt-0.5 text-xl font-semibold">{tone.headline}</div>
          <p className="mt-1 text-sm text-muted-foreground">{tone.detail}</p>
          {highlights.length > 0 && (
            <ul className="mt-4 space-y-1.5 text-sm">
              {highlights.map((h) => (
                <li key={h.id} className="flex items-start gap-2">
                  <span
                    className={
                      "mt-1 h-1.5 w-1.5 shrink-0 rounded-full " +
                      (h.severity === "error" ? "bg-danger" : "bg-warning")
                    }
                  />
                  <span className="text-foreground">{h.label}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link
                to="/projects/$id"
                params={{ id: project.id }}
                search={targetField ? { tab: targetTab, field: targetField } : { tab: targetTab }}
              >
                {firstActionable ? firstActionable.label : "Ouvrir le cockpit projet"}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>

            {score.level !== "blocked" && (
              <Button asChild size="sm" variant="ghost">
                <Link to="/build">Voir le dernier build</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
