import { Link, useRouterState } from "@tanstack/react-router";
import { Check, ChevronRight } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { JourneyProgress, isJourneyPath } from "@/core/navigation/journey-progress";

export const PUBLICATION_STEPS = [
  { number: 1, label: "Votre application", shortLabel: "Application", to: "/projects" },
  { number: 2, label: "Vérifier", shortLabel: "Vérifier", to: "/diagnostic" },
  { number: 3, label: "Préparer la version", shortLabel: "Version", to: "/version" },
  { number: 4, label: "Protéger", shortLabel: "Protection", to: "/signing" },
  { number: 5, label: "Créer le fichier", shortLabel: "Fichier", to: "/build" },
  { number: 6, label: "Publier", shortLabel: "Google Play", to: "/publish" },
] as const;

const JOURNEY_PATHS = new Set(PUBLICATION_STEPS.map((step) => step.to));

export function PublicationJourney() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const normalized = pathname.startsWith("/projects/") ? "/projects" : pathname;
  useEffect(() => {
    if (isJourneyPath(normalized)) JourneyProgress.visit(normalized);
  }, [normalized]);
  if (!JOURNEY_PATHS.has(normalized as (typeof PUBLICATION_STEPS)[number]["to"])) return null;

  const currentIndex = PUBLICATION_STEPS.findIndex((step) => step.to === normalized);
  const current = PUBLICATION_STEPS[currentIndex];

  return (
    <nav
      aria-label="Étapes pour publier votre application"
      className="border-b bg-muted/25 px-4 py-3"
    >
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-3 md:hidden">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Étape {current.number} sur {PUBLICATION_STEPS.length}
            </div>
            <div className="text-sm font-semibold">{current.label}</div>
          </div>
          <div className="text-xs text-muted-foreground">AppPublisher vous guide</div>
        </div>

        <ol className="hidden items-center md:flex">
          {PUBLICATION_STEPS.map((step, index) => {
            const active = index === currentIndex;
            const visited = index < currentIndex;
            return (
              <li key={step.to} className="flex min-w-0 flex-1 items-center">
                <Link
                  to={step.to}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "group flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-primary/10 font-semibold text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                      active && "border-primary bg-primary text-primary-foreground",
                      visited && "border-success bg-success/10 text-success",
                    )}
                  >
                    {visited ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : step.number}
                  </span>
                  <span className="truncate">{step.shortLabel}</span>
                </Link>
                {index < PUBLICATION_STEPS.length - 1 && (
                  <ChevronRight
                    className="mx-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/50"
                    aria-hidden="true"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
