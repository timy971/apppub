import { bridge } from "@/core/bridge";
import { ProjectsService } from "@/core/projects/service";
import type { SigningScanResult } from "@/core/bridge/types";

/**
 * Scan de signatures existantes. Contraintes :
 *  - jamais tout le disque ;
 *  - jamais sans confirmation utilisateur ;
 *  - racines par défaut = projets connus + racine projets utilisateur.
 *
 * L'utilisateur peut ajouter d'autres racines explicitement.
 */

function defaultRoots(): string[] {
  const roots = new Set<string>();
  const projects = ProjectsService.list();
  for (const p of projects) {
    if (p.localPath) roots.add(p.localPath);
  }
  return [...roots];
}

export const SigningScanner = {
  /** Racines proposées par défaut (projets connus). */
  defaultRoots,

  async scan(extraRoots: string[] = []): Promise<SigningScanResult[]> {
    const all = [...defaultRoots(), ...extraRoots.filter(Boolean)];
    const unique = [...new Set(all)];
    if (unique.length === 0) return [];
    return bridge().signing.scan(unique);
  },
};
