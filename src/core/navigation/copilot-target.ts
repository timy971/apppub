import type { CockpitTab } from "@/core/projects/status";

/** Routes sans paramètre reconnues par l'application. */
export const STATIC_APP_ROUTES = [
  "/",
  "/build",
  "/diagnostic",
  "/history",
  "/journal",
  "/logs",
  "/projects",
  "/publish",
  "/settings",
  "/setup",
  "/signing",
  "/version",
] as const;

export type StaticAppRoute = (typeof STATIC_APP_ROUTES)[number];

export interface CopilotNavigationAction {
  route: string;
  cockpitTab?: CockpitTab;
  cockpitField?: string;
}

export type ResolvedCopilotTarget =
  | { to: StaticAppRoute }
  | {
      to: "/projects/$id";
      params: { id: string };
      search?: { tab: CockpitTab; field?: string };
    };

/**
 * Résout une action Copilot en destination TanStack Router complète.
 *
 * Les actions métier utilisent volontairement `/projects/$id` afin de ne
 * pas embarquer d'identifiant dans le moteur. Le composant d'interface doit
 * donc fournir le projet actif. Sans projet, on revient à la liste plutôt
 * que de produire `/projects/undefined`.
 */
export function resolveCopilotTarget(
  action: CopilotNavigationAction,
  projectId?: string,
): ResolvedCopilotTarget {
  if (action.route === "/projects/$id") {
    if (!projectId) return { to: "/projects" };
    const search = action.cockpitTab
      ? {
          tab: action.cockpitTab,
          ...(action.cockpitField ? { field: action.cockpitField } : {}),
        }
      : undefined;
    return {
      to: "/projects/$id",
      params: { id: projectId },
      ...(search ? { search } : {}),
    };
  }

  if (isStaticAppRoute(action.route)) return { to: action.route };

  // Une route inconnue ne doit jamais devenir un lien cassé dans l'UI.
  return { to: "/" };
}

export function isStaticAppRoute(route: string): route is StaticAppRoute {
  return (STATIC_APP_ROUTES as readonly string[]).includes(route);
}
