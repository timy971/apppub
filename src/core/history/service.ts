import type { PublishRecord, UUID } from "@/core/types";
import { storage, STORAGE_KEYS } from "@/core/storage";
import { CopilotBus } from "@/core/copilot/bus";

export const HistoryService = {
  list(): PublishRecord[] {
    return storage.get<PublishRecord[]>(STORAGE_KEYS.history, []);
  },

  record(entry: Omit<PublishRecord, "id" | "createdAt">): PublishRecord {
    const rec: PublishRecord = {
      ...entry,
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2),
      createdAt: new Date().toISOString(),
    };
    storage.set(STORAGE_KEYS.history, [rec, ...this.list()].slice(0, 200));
    CopilotBus.notify();
    return rec;
  },

  forProject(id: UUID): PublishRecord[] {
    return this.list().filter((r) => r.projectId === id);
  },

  clear(): void {
    storage.remove(STORAGE_KEYS.history);
  },
};
