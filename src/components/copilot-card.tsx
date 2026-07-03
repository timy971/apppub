import { Link } from "@tanstack/react-router";
import { Sparkles, ArrowRight, Clock } from "lucide-react";
import type { CopilotSuggestion } from "@/core/types";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { WhyButton } from "./why-button";

/**
 * CopilotCard — présente la prochaine action suggérée avec transparence.
 * Le bouton « Pourquoi ? » explique la recommandation en une phrase.
 */
export function CopilotCard({
  suggestion,
  etaMinutes,
}: {
  suggestion: CopilotSuggestion;
  etaMinutes?: number;
}) {
  return (
    <Card className="p-6 shadow-soft border-primary/30 bg-primary/5">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-primary/80 font-medium">
            Suggestion du copilote
          </div>
          <div className="mt-1 text-lg font-semibold">{suggestion.title}</div>
          <p className="mt-1 text-sm text-muted-foreground">{suggestion.reason}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {suggestion.action.to ? (
              <Button asChild>
                <Link to={suggestion.action.to}>
                  {suggestion.action.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <Button>{suggestion.action.label}</Button>
            )}
            {suggestion.why && (
              <WhyButton title="Pourquoi cette suggestion ?">{suggestion.why}</WhyButton>
            )}
            {(etaMinutes ?? suggestion.etaMinutes) != null && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-background px-3 py-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Publication estimée : {etaMinutes ?? suggestion.etaMinutes} min
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
