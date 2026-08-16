import { ContextualHelp } from "./contextual-help";

export function PageHeader({
  title,
  subtitle,
  help,
  actions,
}: {
  title: string;
  subtitle?: string;
  help?: { title: string; content: React.ReactNode };
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 pb-8">
      <div className="min-w-0">
        <h1 data-page-heading tabIndex={-1} className="text-3xl font-semibold tracking-tight">
          {title}
        </h1>
        {subtitle && <p className="mt-2 text-base text-muted-foreground max-w-2xl">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {actions}
        {help && <ContextualHelp title={help.title}>{help.content}</ContextualHelp>}
      </div>
    </div>
  );
}
