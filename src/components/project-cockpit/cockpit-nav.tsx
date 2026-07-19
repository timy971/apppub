import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { CockpitTab, RuleAction } from "@/core/projects/status/types";

/**
 * CockpitNav — coordonne la navigation interne du cockpit.
 *
 * Les widgets ne connaissent rien du DOM cible. Ils déclarent une intention
 * ("aller au champ keystore de la section Android de l'onglet Publication")
 * et le provider :
 *   1. bascule sur l'onglet demandé
 *   2. laisse React committer l'onglet
 *   3. localise le champ via data-cockpit-field="…"
 *   4. scroll doux + focus + surbrillance temporaire
 *
 * Un « refreshKey » incrémental permet aux widgets qui lisent des services
 * (Timeline, Activity) de se rerender après une action mutante (backup),
 * sans nouvelle source de vérité.
 */

interface CockpitNavContextValue {
  tab: CockpitTab;
  setTab: (tab: CockpitTab) => void;
  /** Exécute une RuleAction : change d'onglet + focus + surbrillance. */
  runAction: (action: RuleAction) => void;
  /** Notifie les widgets qu'un service local a été muté (backup, …). */
  bumpRefresh: () => void;
  /** Compteur : à passer en dépendance de useMemo pour se rafraîchir. */
  refreshKey: number;
}

const Ctx = createContext<CockpitNavContextValue | null>(null);

export function CockpitNavProvider({
  children,
  initialTab,
}: {
  children: ReactNode;
  initialTab?: CockpitTab;
}) {
  const [tab, setTabState] = useState<CockpitTab>(initialTab ?? "overview");
  const [refreshKey, setRefreshKey] = useState(0);
  const pendingFocus = useRef<string | null>(null);

  const focusField = useCallback((field: string) => {
    // Cherche l'élément et applique scroll + focus + surbrillance.
    // On tente plusieurs fois car l'onglet peut mettre un tick à monter.
    let tries = 0;
    const attempt = () => {
      const el = document.querySelector<HTMLElement>(
        `[data-cockpit-field="${CSS.escape(field)}"]`,
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Focus l'input à l'intérieur si l'élément lui-même n'est pas focusable.
        const focusTarget =
          el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tabIndex >= 0
            ? el
            : el.querySelector<HTMLElement>("input, textarea, button, [tabindex]");
        focusTarget?.focus({ preventScroll: true });
        el.classList.add("cockpit-highlight");
        window.setTimeout(() => el.classList.remove("cockpit-highlight"), 1800);
        return;
      }
      if (tries++ < 20) window.setTimeout(attempt, 40);
    };
    attempt();
  }, []);

  const setTab = useCallback(
    (nextTab: CockpitTab) => {
      setTabState(nextTab);
      if (pendingFocus.current) {
        const field = pendingFocus.current;
        pendingFocus.current = null;
        // Laisse React committer le nouvel onglet avant de chercher le champ.
        window.setTimeout(() => focusField(field), 60);
      }
    },
    [focusField],
  );

  const runAction = useCallback(
    (action: RuleAction) => {
      if (action.field) pendingFocus.current = action.field;
      if (action.tab !== tab) {
        setTab(action.tab);
      } else if (action.field) {
        // Déjà sur le bon onglet : focus immédiat.
        const field = action.field;
        pendingFocus.current = null;
        window.setTimeout(() => focusField(field), 0);
      }
    },
    [tab, setTab, focusField],
  );

  const bumpRefresh = useCallback(() => setRefreshKey((n) => n + 1), []);

  const value = useMemo<CockpitNavContextValue>(
    () => ({ tab, setTab, runAction, bumpRefresh, refreshKey }),
    [tab, setTab, runAction, bumpRefresh, refreshKey],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCockpitNav(): CockpitNavContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCockpitNav must be used inside CockpitNavProvider");
  return ctx;
}
