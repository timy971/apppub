/**
 * CopilotBus — notificateur ultra-minimal.
 *
 * Chaque mutation susceptible d'affecter le plan (record d'historique,
 * création de sauvegarde, modification de projet) appelle `notify()`.
 * Les consommateurs s'abonnent via `useCopilotPlan()` et re-calculent
 * uniquement lorsqu'un signal réel arrive.
 */

type Listener = () => void;
const listeners = new Set<Listener>();
let version = 0;

export const CopilotBus = {
  notify() {
    version++;
    for (const l of listeners) l();
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  getVersion(): number {
    return version;
  },
};
