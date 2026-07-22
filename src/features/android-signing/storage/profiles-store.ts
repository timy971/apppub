import type { SigningProfile } from "../types/signing-profile";
import { storage } from "@/core/storage";

/**
 * Persistance des profils de signature. localStorage typé, préfixe dédié.
 * INVARIANT : jamais de champ contenant un mot de passe (garanti par le
 * type `SigningProfile`, testé par `profiles-store.spec.ts`).
 */

const KEY = "android-signing.profiles.v1";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "sp-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Whitelist stricte des clés autorisées sur un SigningProfile persisté. */
const ALLOWED_KEYS: ReadonlySet<string> = new Set([
  "id",
  "name",
  "keystorePath",
  "alias",
  "storeType",
  "certificate",
  "secureStorage",
  "createdAt",
  "lastValidatedAt",
  "lastUsedAt",
]);

function sanitize(profile: SigningProfile): SigningProfile {
  const clean = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(profile)) {
    if (ALLOWED_KEYS.has(k)) clean[k] = v;
  }
  return clean as unknown as SigningProfile;
}

export const ProfilesStore = {
  list(): SigningProfile[] {
    return storage.get<SigningProfile[]>(KEY, []);
  },

  get(id: string): SigningProfile | undefined {
    return this.list().find((p) => p.id === id);
  },

  create(input: Omit<SigningProfile, "id" | "createdAt">): SigningProfile {
    const profile: SigningProfile = sanitize({
      ...input,
      id: uuid(),
      createdAt: new Date().toISOString(),
    });
    storage.set(KEY, [...this.list(), profile]);
    return profile;
  },

  update(id: string, patch: Partial<SigningProfile>): SigningProfile | undefined {
    const list = this.list();
    const idx = list.findIndex((p) => p.id === id);
    if (idx === -1) return undefined;
    const merged = sanitize({ ...list[idx], ...patch, id });
    list[idx] = merged;
    storage.set(KEY, list);
    return merged;
  },

  remove(id: string): void {
    storage.set(
      KEY,
      this.list().filter((p) => p.id !== id),
    );
  },

  /** Test hook — vide entièrement le stockage. */
  _clearAll(): void {
    storage.set(KEY, []);
  },
};
