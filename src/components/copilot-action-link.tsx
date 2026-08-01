import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import {
  resolveCopilotTarget,
  type CopilotNavigationAction,
} from "@/core/navigation/copilot-target";

export function CopilotActionLink({
  action,
  projectId,
  children,
  className,
}: {
  action: CopilotNavigationAction;
  projectId?: string;
  children: ReactNode;
  className?: string;
}) {
  const target = resolveCopilotTarget(action, projectId);

  if (target.to === "/projects/$id") {
    return (
      <Link
        to="/projects/$id"
        params={target.params}
        search={target.search}
        className={className}
      >
        {children}
      </Link>
    );
  }

  return (
    <Link to={target.to} className={className}>
      {children}
    </Link>
  );
}
