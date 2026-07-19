import { useSyncExternalStore, useMemo } from "react";
import type { OperationRunner } from "@/core/operations/runner";
import type { OperationSnapshot } from "@/core/operations/types";

const EMPTY: OperationSnapshot = {
  id: "idle",
  kind: "generic",
  title: "",
  status: "idle",
  steps: [],
  currentStepIndex: 0,
  logs: [],
};

/**
 * Souscrit à un OperationRunner et retourne le snapshot le plus récent.
 * Utilise useSyncExternalStore pour rester compatible avec le mode
 * concurrent et éviter tout tearing.
 */
export function useOperationSnapshot(
  runner: OperationRunner | null,
): OperationSnapshot {
  const subscribe = useMemo(() => {
    if (!runner) return () => () => {};
    return (l: () => void) => runner.subscribe(() => l());
  }, [runner]);
  const getSnap = () => runner?.snapshot ?? EMPTY;
  return useSyncExternalStore(subscribe, getSnap, getSnap);
}
