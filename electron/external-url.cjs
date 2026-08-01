/* eslint-disable */

const ALLOWED_EXTERNAL_HOSTS = new Set([
  "play.google.com",
  "appstoreconnect.apple.com",
  "github.com",
  "gitlab.com",
  "bitbucket.org",
]);

/**
 * Le renderer ne peut ouvrir que des services de publication ou de dépôt
 * explicitement connus. Cela évite qu'une donnée projet malformée transforme
 * AppPublisher en lanceur d'URL arbitraire.
 */
function sanitizeExternalUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    if (!ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname.toLowerCase())) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

module.exports = { ALLOWED_EXTERNAL_HOSTS, sanitizeExternalUrl };
