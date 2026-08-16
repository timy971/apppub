import { useSettings, AppStore } from "@/core/store/app-store";
import { cn } from "@/lib/utils";
import type { ExperienceMode } from "@/core/types";
import { EXPERIENCE_MODES } from "@/core/i18n/fr";

/**
 * Bascule Mode Découverte / Assistant / Expert.
 * - Découverte : uniquement l'essentiel et la prochaine action.
 * - Assistant : vérifications, explications et actions guidées.
 * - Expert : chemins, commandes, journaux et détails Android.
 */
const MODES = (Object.keys(EXPERIENCE_MODES) as ExperienceMode[]).map((value) => ({
  value,
  ...EXPERIENCE_MODES[value],
}));

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
          title={`${m.summary} ${m.shows}`}
          aria-pressed={settings.mode === m.value}
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
