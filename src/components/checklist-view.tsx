import type { Checklist } from "@/core/types";
import { Link } from "@tanstack/react-router";
import { StatusDot } from "./status-dot";
import { Card } from "./ui/card";
import { Button } from "./ui/button";

/**
 * ChecklistView — liste intelligente, sans coche manuelle. Chaque item
 * calcule son état à partir de la réalité du projet et propose, si besoin,
 * un bouton pour réparer.
 */
export function ChecklistView({ checklist }: { checklist: Checklist }) {
  return (
    <Card className="p-6 shadow-soft">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm font-medium text-muted-foreground">{checklist.title}</div>
        <div className="text-xs text-muted-foreground">
          {checklist.items.filter((i) => i.status === "ok").length}/{checklist.items.length}
        </div>
      </div>
      <ul className="divide-y">
        {checklist.items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 py-3">
            <StatusDot status={item.status} className="mt-1.5" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{item.label}</div>
              {item.detail && (
                <div className="mt-0.5 text-sm text-muted-foreground">{item.detail}</div>
              )}
            </div>
            {item.fix && item.status !== "ok" && (
              <Button asChild size="sm" variant="outline">
                {item.fix.to ? <Link to={item.fix.to}>{item.fix.label}</Link> : <span>{item.fix.label}</span>}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
