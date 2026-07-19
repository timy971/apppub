/**
 * Validateurs légers réutilisés par le Cockpit et le Publish Center.
 * Toujours non-bloquants : ils retournent un message court ou `null`.
 * Le champ reste sauvegardable même si la validation échoue — c'est
 * l'utilisateur qui décide (mais il est prévenu).
 */

export type FieldValidator = (value: string) => string | null;

/** URL Git valide (https ou ssh). */
export const validateGitUrl: FieldValidator = (raw) => {
  const v = raw.trim();
  if (v.length === 0) return null;
  if (/^https?:\/\/[^\s]+\.git$/i.test(v)) return null;
  if (/^git@[^:]+:[^\s]+\.git$/.test(v)) return null;
  if (/^https?:\/\/[^\s]+$/i.test(v)) return null;
  return "Format attendu : https://… ou git@…:…/….git";
};

/** Application ID Android : au moins deux segments minuscules séparés par . */
export const validateApplicationId: FieldValidator = (raw) => {
  const v = raw.trim();
  if (v.length === 0) return null;
  return /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(v)
    ? null
    : "Format attendu : com.exemple.monapp";
};

/** Bundle Identifier iOS — même format qu'Android en pratique. */
export const validateBundleId: FieldValidator = (raw) => {
  const v = raw.trim();
  if (v.length === 0) return null;
  return /^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z][A-Za-z0-9-]*)+$/.test(v)
    ? null
    : "Format attendu : com.exemple.monapp";
};

/** Nom de package (Java-like). */
export const validatePackageName: FieldValidator = (raw) => {
  const v = raw.trim();
  if (v.length === 0) return null;
  return /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(v)
    ? null
    : "Format attendu : com.exemple.monapp";
};

/** SemVer souple : 1, 1.2, 1.2.3, 1.2.3-beta.1. */
export const validateSemver: FieldValidator = (raw) => {
  const v = raw.trim();
  if (v.length === 0) return null;
  return /^\d+(\.\d+){0,2}(-[0-9A-Za-z.-]+)?$/.test(v)
    ? null
    : "Format attendu : 1.2.3";
};

/** Team ID Apple (10 caractères alphanumériques). */
export const validateAppleTeamId: FieldValidator = (raw) => {
  const v = raw.trim();
  if (v.length === 0) return null;
  return /^[A-Z0-9]{10}$/.test(v)
    ? null
    : "Format attendu : 10 caractères (ex : ABCDE12345)";
};

/** Nom de branche Git basique. */
export const validateBranchName: FieldValidator = (raw) => {
  const v = raw.trim();
  if (v.length === 0) return null;
  return /^[A-Za-z0-9._/-]+$/.test(v)
    ? null
    : "Caractères autorisés : lettres, chiffres, . _ / -";
};
