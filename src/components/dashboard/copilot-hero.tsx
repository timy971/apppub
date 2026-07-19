import { Link } from "@tanstack/react-router";
import { Sparkles, ArrowRight, Clock } from "lucide-react";
import type { CopilotSuggestion } from "@/core/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WhyButton } from "@/components/why-button";

/**
 * Version "hero" du copilote — carte principale du Dashboard.
 * Plus large, contraste plus fort, action mise en avant.
 */
export function CopilotHero({
  suggestion,
  etaMinutes,
  loading,
}: {
  suggestion: CopilotSuggestion | null;
  etaMinutes?: number;
  loading: boolean;
}) {
  return (
    <Card className="relative overflow-hidden p-8 shadow-elevated border-primary/40 bg-gradient-to-br from-primary/8 via-primary/5 to-transparent">
      <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="relative flex items-start gap-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
          <Sparkles className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-[0.14em] text-primary font-semibold">
            Prochaine meilleure action
          </div>
          {loading || !suggestion ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-9 w-40 mt-3" />
            </div>
          ) : (
            <>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                {suggestion.title}
              </h2>
              <p className="mt-1.5 text-[15px] text-muted-foreground max-w-2xl">
                {suggestion.reason}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                {suggestion.action.to ? (
                  <Button asChild size="lg">
                    <Link to={suggestion.action.to}>
                      {suggestion.action.label}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button size="lg">{suggestion.action.label}</Button>
                )}
                {suggestion.why && (
                  <WhyButton title="Pourquoi cette suggestion ?">
                    {suggestion.why}
                  </WhyButton>
                )}
                {(etaMinutes ?? suggestion.etaMinutes) != null && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-background/80 backdrop-blur px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-border">
                    <Clock className="h-3 w-3" />
                    Publication estimée : {etaMinutes ?? suggestion.etaMinutes} min
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
