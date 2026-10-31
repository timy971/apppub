const assert = require("node:assert/strict");
const test = require("node:test");

const {
  resolveSigningProjectContext,
} = require("../electron/signing-project-context.cjs");

test("normal build requires the signing profile to be linked to the build project", async () => {
  const linked = [];
  const result = await resolveSigningProjectContext(
    { projectPath: "/managed/app", profileId: "profile-1" },
    {
      resolveAllowed: (p) => p,
      linkedStoredProject: (p, id) => {
        linked.push([p, id]);
        return p === "/managed/app" && id === "profile-1";
      },
      workspaces: { assertWorkspaceOwner: async () => assert.fail("not expected") },
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.buildProjectPath, "/managed/app");
  assert.equal(result.keystoreProjectPath, "/managed/app");
  assert.deepEqual(linked, [["/managed/app", "profile-1"]]);
});

test("publication workspace inherits signing only from its verified managed source", async () => {
  const ownership = [];
  const result = await resolveSigningProjectContext(
    {
      projectPath: "/workspaces/app-release",
      sourceProjectPath: "/managed/app",
      profileId: "profile-1",
    },
    {
      resolveAllowed: (p) => p,
      linkedStoredProject: (p, id) => p === "/managed/app" && id === "profile-1",
      workspaces: {
        assertWorkspaceOwner: async (workspace, source) => {
          ownership.push([workspace, source]);
          return workspace;
        },
      },
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.buildProjectPath, "/workspaces/app-release");
  assert.equal(result.keystoreProjectPath, "/managed/app");
  assert.equal(result.sourceProjectPath, "/managed/app");
  assert.deepEqual(ownership, [["/workspaces/app-release", "/managed/app"]]);
});

test("workspace cannot borrow a profile from another project", async () => {
  const result = await resolveSigningProjectContext(
    {
      projectPath: "/workspaces/app-release",
      sourceProjectPath: "/managed/other",
      profileId: "profile-1",
    },
    {
      resolveAllowed: (p) => p,
      linkedStoredProject: () => false,
      workspaces: { assertWorkspaceOwner: async () => assert.fail("not expected") },
    },
  );
  assert.deepEqual(result, { ok: false, errorCode: "profile-mismatch" });
});

test("workspace ownership is verified even when the source has the right profile", async () => {
  const result = await resolveSigningProjectContext(
    {
      projectPath: "/workspaces/attacker",
      sourceProjectPath: "/managed/app",
      profileId: "profile-1",
    },
    {
      resolveAllowed: (p) => p,
      linkedStoredProject: () => true,
      workspaces: {
        assertWorkspaceOwner: async () => {
          throw new Error("owner mismatch");
        },
      },
    },
  );
  assert.deepEqual(result, { ok: false, errorCode: "profile-mismatch" });
});
