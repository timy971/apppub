import { Bot, CheckCircle2, MousePointerClick } from "lucide-react";
import { Card } from "@/components/ui/card";

/** Résumé invariant de chaque étape : automatique, action humaine, résultat. */
export function StepPurpose({
  automatic,
  yourAction,
  result,
}: {
  automatic: string;
  yourAction: string;
  result: string;
}) {
  return (
    <Card className="mb-6 border-primary/20 bg-primary/[0.035] p-4 shadow-soft">
      <h2 className="sr-only">Déroulement de cette étape</h2>
      <div className="grid gap-4 text-sm md:grid-cols-3">
        <PurposeItem icon={Bot} label="AppPublisher s'occupe de" text={automatic} />
        <PurposeItem icon={MousePointerClick} label="Votre seule action" text={yourAction} />
        <PurposeItem icon={CheckCircle2} label="À la fin" text={result} />
      </div>
    </Card>
  );
}

function PurposeItem({
  icon: Icon,
  label,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <p className="mt-1 leading-relaxed text-foreground/90">{text}</p>
      </div>
    </div>
  );
}
