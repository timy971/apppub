async function resolveSigningProjectContext(args, deps) {
  const buildProjectPath = deps.resolveAllowed(args?.projectPath);
  if (!buildProjectPath) return { ok: false, errorCode: "project-not-authorized" };

  if (args?.sourceProjectPath) {
    const sourceProjectPath = deps.resolveAllowed(args.sourceProjectPath);
    if (!sourceProjectPath) return { ok: false, errorCode: "project-not-authorized" };
    if (!deps.linkedStoredProject(sourceProjectPath, args.profileId)) {
      return { ok: false, errorCode: "profile-mismatch" };
    }
    try {
      await deps.workspaces.assertWorkspaceOwner(buildProjectPath, sourceProjectPath);
    } catch {
      return { ok: false, errorCode: "profile-mismatch" };
    }
    return {
      ok: true,
      buildProjectPath,
      keystoreProjectPath: sourceProjectPath,
      sourceProjectPath,
    };
  }

  if (!deps.linkedStoredProject(buildProjectPath, args?.profileId)) {
    return { ok: false, errorCode: "profile-mismatch" };
  }
  return {
    ok: true,
    buildProjectPath,
    keystoreProjectPath: buildProjectPath,
  };
}

module.exports = { resolveSigningProjectContext };
