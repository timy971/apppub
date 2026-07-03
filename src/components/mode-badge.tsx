import { useSettings, AppStore } from "@/core/store/app-store";
import { cn } from "@/lib/utils";
import type { ExperienceMode } from "@/core/types";

/**
 * Bascule Mode Découverte / Assistant / Expert.
 * - Découverte : explications systématiques, actions pédagogiques.
 * - Assistant : guidé, jargon masqué (défaut Phase 1).
 * - Expert : détails techniques additionnels affichés.
 */
const MODES: { value: ExperienceMode; label: string }[] = [
  { value: "discovery", label: "Découverte" },
  { value: "assistant", label: "Assistant" },
  { value: "expert", label: "Expert" },
];

export function ModeBadge({ className }: { className?: string }) {
  const settings = useSettings();
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border bg-muted/60 p-0.5 text-xs font-medium",
        className,
      )}
      role="group"
      aria-label="Mode d'utilisation"
    >
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          onClick={() => AppStore.updateSettings({ mode: m.value })}
          className={cn(
            "rounded-full px-3 py-1 transition-colors",
            settings.mode === m.value
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
