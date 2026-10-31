function isAndroidApplicationId(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 255) return false;
  return /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(trimmed);
}

function resolveStoredAndroidPackage(project) {
  const android = project?.publishing?.android ?? {};
  const candidates = [
    android.applicationId,
    project?.playStoreAppId,
    project?.detected?.capacitorAppId,
    project?.packageName,
  ];
  const resolved = candidates.find(isAndroidApplicationId);
  return typeof resolved === "string" ? resolved.trim() : undefined;
}

module.exports = {
  isAndroidApplicationId,
  resolveStoredAndroidPackage,
};
