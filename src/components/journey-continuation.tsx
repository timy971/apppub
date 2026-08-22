import { ArrowRight } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { JOURNEY_LABELS, JourneyProgress } from "@/core/navigation/journey-progress";
import { useSettings } from "@/core/store/app-store";
import type { PublicationJourneyPath } from "@/core/types";

export function JourneyContinuation({
  fallbackTo,
  fallbackLabel,
  title = "Vous pouvez continuer",
  description,
  onlyWhenReturning = false,
}: {
  fallbackTo: PublicationJourneyPath;
  fallbackLabel: string;
  title?: string;
  description: string;
  onlyWhenReturning?: boolean;
}) {
  const settings = useSettings();
  const navigate = useNavigate();
  const returnTo = settings.returnToJourneyPath;

  if (onlyWhenReturning && !returnTo) return null;

  const target = returnTo ?? fallbackTo;
  const label = returnTo ? `Continuer vers « ${JOURNEY_LABELS[returnTo]} »` : fallbackLabel;

  return (
    <Card className="border-primary/30 bg-primary/5 p-5 shadow-soft">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Button
          className="shrink-0"
          onClick={() => {
            JourneyProgress.clearReturnTo();
            void navigate({ to: target });
          }}
        >
          {label}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
