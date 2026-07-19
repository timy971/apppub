import type { ReactNode } from "react";
import { useMode } from "@/core/store/use-mode";
import type { ExperienceMode } from "@/core/types";

/**
 * Ces composants ne masquent pas de la logique métier : ils filtrent
 * uniquement l'affichage selon le mode. Ils ne conservent aucun état.
 */

export function ModeGate({
  modes,
  children,
}: {
  modes: ExperienceMode | ExperienceMode[];
  children: ReactNode;
}) {
  const current = useMode();
  const list = Array.isArray(modes) ? modes : [modes];
  return list.includes(current) ? <>{children}</> : null;
}

export function DiscoveryOnly({ children }: { children: ReactNode }) {
  return <ModeGate modes="discovery">{children}</ModeGate>;
}

export function AssistantOrAbove({ children }: { children: ReactNode }) {
  return <ModeGate modes={["assistant", "expert"]}>{children}</ModeGate>;
}

export function ExpertOnly({ children }: { children: ReactNode }) {
  return <ModeGate modes="expert">{children}</ModeGate>;
}

export function HideInDiscovery({ children }: { children: ReactNode }) {
  return <ModeGate modes={["assistant", "expert"]}>{children}</ModeGate>;
}
