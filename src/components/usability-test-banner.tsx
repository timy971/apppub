import { useRouterState } from "@tanstack/react-router";
import { AlertTriangle, CircleHelp, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UsabilityTestService, useUsabilityTestSession } from "@/core/usability-test/service";

export function UsabilityTestBanner() {
  const session = useUsabilityTestSession();
  const path = useRouterState({ select: (state) => state.location.pathname });

  if (!session || session.status !== "active") return null;

  return (
    <div
      role="region"
      aria-label="Session de test utilisateur novice"
      className="sticky top-14 z-10 border-b border-primary/30 bg-primary/5 px-4 py-2"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
        <div className="mr-auto flex items-center gap-2 text-sm">
          <FlaskConical className="h-4 w-4 text-primary" />
          <span className="font-medium">Test novice en cours</span>
          <span className="text-muted-foreground">· {session.testerAlias}</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => UsabilityTestService.record("confusion", path)}
        >
          <CircleHelp className="h-4 w-4" />
          Je ne comprends pas
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => UsabilityTestService.record("blocked", path)}
        >
          <AlertTriangle className="h-4 w-4" />
          Je suis bloqué
        </Button>
      </div>
    </div>
  );
}
