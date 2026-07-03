import type { SystemBridge } from "./types";
import { electronBridge, hasElectronBridge } from "./electron";
import { webBridge } from "./web";

/**
 * Sélection automatique du bridge. Le renderer ne connaît jamais l'implémentation.
 * L'appel est paresseux : on ne touche à `window.appPublisher` qu'au premier usage
 * afin de rester compatible avec SSR/prerender.
 */
let _bridge: SystemBridge | null = null;

export function bridge(): SystemBridge {
  if (_bridge) return _bridge;
  _bridge = hasElectronBridge() ? electronBridge : webBridge;
  return _bridge;
}

/** Retourne true si l'application tourne dans Electron (fonctions réelles). */
export function isElectron(): boolean {
  return bridge().runtime === "electron";
}

export type { SystemBridge } from "./types";
