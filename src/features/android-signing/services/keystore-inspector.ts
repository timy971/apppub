import type { CertificateInfo } from "../types/signing-profile";

/**
 * Parseur du stdout produit par `keytool -list -v -keystore … -alias …`.
 *
 * Isolé de tout I/O pour être testable en pur. Aucune écriture disque,
 * aucun appel bridge. Reçoit du texte, renvoie des champs structurés.
 */

const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

/**
 * Parse une date au format keytool ("Mon Nov 01 10:23:45 CET 2025").
 * Renvoie ISO ou `undefined` si non parsable — jamais d'exception.
 */
function parseKeytoolDate(raw: string): string | undefined {
  const m = raw
    .trim()
    .match(/^\w{3}\s+(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+\S+\s+(\d{4})$/);
  if (!m) {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  const [, mon, day, hh, mm, ss, yyyy] = m;
  const month = MONTHS[mon];
  if (month === undefined) return undefined;
  const d = new Date(
    Date.UTC(Number(yyyy), month, Number(day), Number(hh), Number(mm), Number(ss)),
  );
  return d.toISOString();
}

function extractLine(text: string, prefix: string): string | undefined {
  const re = new RegExp(`^\\s*${prefix}\\s*:\\s*(.+)$`, "mi");
  const m = text.match(re);
  return m ? m[1].trim() : undefined;
}

export function parseKeytoolListOutput(stdout: string): CertificateInfo | null {
  const owner = extractLine(stdout, "Owner") ?? extractLine(stdout, "Propriétaire");
  const issuer =
    extractLine(stdout, "Issuer") ??
    extractLine(stdout, "Émetteur") ??
    extractLine(stdout, "Emetteur");
  const validFromRaw =
    stdout.match(/Valid from:?\s*(.+?)\s+until\b\s*:?\s*(.+)$/im) ??
    stdout.match(/Valide du\s*:?\s*(.+?)\s+au\b\s*:?\s*(.+)$/im);
  const sha256 = stdout.match(/SHA[\s-]?256\s*:\s*([0-9A-Fa-f:]+)/i)?.[1]?.trim();
  const sha1 = stdout.match(/(?<!\d)SHA[\s-]?1\s*:\s*([0-9A-Fa-f:]+)/i)?.[1]?.trim();
  const algorithm =
    extractLine(stdout, "Signature algorithm name") ??
    extractLine(stdout, "Nom de l'algorithme de signature");
  const serial = extractLine(stdout, "Serial number") ?? extractLine(stdout, "Numéro de série");

  if (!owner || !issuer || !sha256 || !validFromRaw) return null;

  const validFrom = parseKeytoolDate(validFromRaw[1]);
  const validUntil = parseKeytoolDate(validFromRaw[2]);
  if (!validFrom || !validUntil) return null;

  return {
    subject: owner,
    issuer,
    validFrom,
    validUntil,
    sha256,
    sha1: sha1 ?? "",
    algorithm: algorithm ?? "unknown",
    serialNumber: serial,
  };
}

/**
 * Extrait les alias qui correspondent réellement à une clé privée.
 *
 * Un keystore peut aussi contenir de simples certificats de confiance. Ces
 * entrées ont bien un alias, mais ne peuvent pas signer un AAB : elles ne sont
 * donc volontairement pas proposées dans le parcours d'import.
 */
export function parseKeytoolPrivateKeyAliases(stdout: string): string[] {
  const aliasPattern = /^\s*(?:Alias name|Nom d['’]alias)\s*:\s*(.+?)\s*$/gim;
  const matches = [...stdout.matchAll(aliasPattern)];
  const aliases: string[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const alias = match[1]?.trim();
    if (!alias) continue;

    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? stdout.length;
    const entry = stdout.slice(start, end);
    const entryType =
      extractLine(entry, "Entry type") ??
      extractLine(entry, "Type d'entrée") ??
      extractLine(entry, "Type d’entrée");

    const isPrivateKey =
      entryType?.toLowerCase().includes("privatekeyentry") ||
      entryType?.toLowerCase().includes("clé privée");
    if (isPrivateKey && !aliases.includes(alias)) aliases.push(alias);
  }

  return aliases;
}

export type KeytoolFailureCode =
  "wrong-password" | "alias-not-found" | "invalid-keystore" | "unknown";

/**
 * Traduit un stderr keytool en un code d'erreur non-technique.
 * Détecte les messages EN et FR.
 */
export function classifyKeytoolError(stderr: string): KeytoolFailureCode {
  const s = stderr.toLowerCase();
  if (
    s.includes("password was incorrect") ||
    s.includes("keystore was tampered") ||
    s.includes("mot de passe est incorrect") ||
    s.includes("password verification failed")
  ) {
    return "wrong-password";
  }
  if (s.includes("alias") && (s.includes("does not exist") || s.includes("n'existe pas"))) {
    return "alias-not-found";
  }
  if (
    s.includes("invalid keystore format") ||
    s.includes("not a valid keystore") ||
    s.includes("format du keystore")
  ) {
    return "invalid-keystore";
  }
  return "unknown";
}

/** Utilitaire d'affichage : renvoie true si le certificat expire sous N jours. */
export function isExpiringSoon(info: CertificateInfo | undefined, days = 90): boolean {
  if (!info) return false;
  const end = new Date(info.validUntil).getTime();
  if (Number.isNaN(end)) return false;
  return end - Date.now() < days * 24 * 3600 * 1000;
}

/** Utilitaire d'affichage : renvoie true si le certificat est déjà expiré. */
export function isExpired(info: CertificateInfo | undefined): boolean {
  if (!info) return false;
  const end = new Date(info.validUntil).getTime();
  if (Number.isNaN(end)) return false;
  return end < Date.now();
}
