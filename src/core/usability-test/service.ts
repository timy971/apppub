import { useSyncExternalStore } from "react";
import { storage, STORAGE_KEYS } from "@/core/storage";
import { HistoryService } from "@/core/history/service";

export type UsabilityEventKind = "route" | "confusion" | "blocked";

export interface UsabilityEvent {
  id: string;
  at: string;
  kind: UsabilityEventKind;
  path: string;
  note?: string;
}

export interface UsabilitySession {
  id: string;
  testerAlias: string;
  startedAt: string;
  previousMode?: "discovery" | "assistant" | "expert";
  previousOnboardingCompleted?: boolean;
  finishedAt?: string;
  status: "active" | "completed";
  events: UsabilityEvent[];
  googlePlaySuccess: boolean;
  successfulProjectName?: string;
  successfulVersion?: string;
  successfulBuild?: number;
}

type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((listener) => listener());

function id(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

let cachedSession: UsabilitySession | null | undefined;

function load(): UsabilitySession | null {
  if (cachedSession === undefined) {
    cachedSession = storage.get<UsabilitySession | null>(STORAGE_KEYS.usabilityTest, null);
  }
  return cachedSession;
}

function save(session: UsabilitySession | null): void {
  cachedSession = session;
  if (session) storage.set(STORAGE_KEYS.usabilityTest, session);
  else storage.remove(STORAGE_KEYS.usabilityTest);
  emit();
}

function successFromHistory(startedAt: string) {
  const start = new Date(startedAt).getTime();
  return HistoryService.list().find(
    (record) =>
      record.kind === "publish" &&
      record.outcome === "success" &&
      record.storeRelease?.provider === "google-play" &&
      new Date(record.createdAt).getTime() >= start,
  );
}

export const UsabilityTestService = {
  current(): UsabilitySession | null {
    return load();
  },

  start(
    testerAlias: string,
    previous?: { mode?: "discovery" | "assistant" | "expert"; onboardingCompleted?: boolean },
  ): UsabilitySession {
    const session: UsabilitySession = {
      id: id(),
      testerAlias: testerAlias.trim() || "Testeur",
      startedAt: new Date().toISOString(),
      previousMode: previous?.mode,
      previousOnboardingCompleted: previous?.onboardingCompleted,
      status: "active",
      events: [],
      googlePlaySuccess: false,
    };
    save(session);
    return session;
  },

  record(kind: Exclude<UsabilityEventKind, "route">, path: string, note?: string): void {
    const session = load();
    if (!session || session.status !== "active") return;
    session.events.push({ id: id(), at: new Date().toISOString(), kind, path, note: note?.trim() || undefined });
    save(session);
  },

  visit(path: string): void {
    const session = load();
    if (!session || session.status !== "active") return;
    const previous = session.events.at(-1);
    if (previous?.kind === "route" && previous.path === path) return;
    session.events.push({ id: id(), at: new Date().toISOString(), kind: "route", path });
    save(session);
  },

  finish(): UsabilitySession | null {
    const session = load();
    if (!session) return null;
    const success = successFromHistory(session.startedAt);
    session.status = "completed";
    session.finishedAt = new Date().toISOString();
    session.googlePlaySuccess = Boolean(success);
    session.successfulProjectName = success?.projectName;
    session.successfulVersion = success?.version;
    session.successfulBuild = success?.build;
    save(session);
    return session;
  },

  clear(): void {
    save(null);
  },

  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  report(session = load()): string {
    if (!session) return "Aucune session de test utilisateur.";
    const durationMs =
      new Date(session.finishedAt ?? new Date().toISOString()).getTime() -
      new Date(session.startedAt).getTime();
    const minutes = Math.max(1, Math.round(durationMs / 60_000));
    const confusions = session.events.filter((event) => event.kind === "confusion");
    const blockers = session.events.filter((event) => event.kind === "blocked");
    const routes = session.events.filter((event) => event.kind === "route");
    const lines = [
      "AppPublisher — test utilisateur novice",
      `Testeur : ${session.testerAlias}`,
      `Durée : ~${minutes} min`,
      `Résultat : ${session.googlePlaySuccess ? "publication Google Play réussie" : "publication Google Play non confirmée"}`,
      `Écrans visités : ${routes.length}`,
      `Moments d'incompréhension : ${confusions.length}`,
      `Blocages : ${blockers.length}`,
    ];
    if (session.googlePlaySuccess && session.successfulProjectName) {
      lines.push(
        `Publication : ${session.successfulProjectName} v${session.successfulVersion ?? "?"} (nº ${session.successfulBuild ?? "?"})`,
      );
    }
    const frictions = session.events.filter((event) => event.kind !== "route");
    if (frictions.length) {
      lines.push("", "Frottements relevés :");
      for (const event of frictions) {
        lines.push(
          `- ${event.kind === "blocked" ? "BLOQUÉ" : "INCOMPRÉHENSION"} · ${event.path}${event.note ? ` · ${event.note}` : ""}`,
        );
      }
    }
    return lines.join("\n");
  },
};

export function useUsabilityTestSession(): UsabilitySession | null {
  return useSyncExternalStore(
    UsabilityTestService.subscribe,
    UsabilityTestService.current,
    () => null,
  );
}
