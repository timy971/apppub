import { AlertTriangle, RotateCw, LifeBuoy } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { TranslatedError } from "@/core/types";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

/**
 * ErrorCard — présente une erreur traduite. Jamais de stack, jamais de code.
 */
export function ErrorCard({
  error,
  onRetry,
}: {
  error: TranslatedError;
  onRetry?: () => void;
}) {
  return (
    <Card className="p-6 shadow-soft border-danger/40">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-lg font-semibold">{error.title}</div>
          <p className="mt-1 text-sm text-muted-foreground">{error.explanation}</p>
          {error.cause && (
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Cause probable : </span>
              {error.cause}
            </p>
          )}
          <p className="mt-2 text-sm">
            <span className="font-medium">Que faire ? </span>
            {error.solution}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {onRetry && error.retryable && (
              <Button onClick={onRetry}>
                <RotateCw className="h-4 w-4" />
                Réessayer
              </Button>
            )}
            <Button asChild variant="outline">
              <Link to="/journal">
                <LifeBuoy className="h-4 w-4" />
                Consulter le support
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
