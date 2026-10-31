const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { isWithin } = require("./path-security.cjs");
const { validateBranch } = require("./git-projects.cjs");

class PublicationWorkspaceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PublicationWorkspaceError";
    this.code = code;
  }
}

function safeSegment(value, fallback = "project") {
  const normalized = String(value ?? "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 48);
  return normalized || fallback;
}

function repositoryLabel(remoteUrl) {
  try {
    if (path.isAbsolute(remoteUrl)) return safeSegment(path.basename(remoteUrl).replace(/\.git$/i, ""));
    const scp = String(remoteUrl).match(/^[^@]+@[^:]+:(.+)$/);
    const rawPath = scp ? scp[1] : new URL(remoteUrl).pathname;
    return safeSegment(
      rawPath
        .split("/")
        .filter(Boolean)
        .pop()
        ?.replace(/\.git$/i, ""),
    );
  } catch {
    return "project";
  }
}

class PublicationWorkspaceManager {
  constructor(rootPath, gitProjectManager, options = {}) {
    if (!gitProjectManager) throw new Error("GitProjectManager requis.");
    this.rootPath = path.resolve(rootPath);
    this.git = gitProjectManager;
    this.fs = options.fsModule ?? fs;
    this.now = options.now ?? (() => Date.now());
    this.randomBytes = options.randomBytes ?? crypto.randomBytes;
    this.fs.mkdirSync(this.rootPath, { recursive: true });
  }

  resolveWorkspace(inputPath) {
    if (typeof inputPath !== "string" || !inputPath || inputPath.length > 4096) {
      throw new PublicationWorkspaceError(
        "workspace-not-managed",
        "Ce workspace de publication n’est pas géré par AppPublisher.",
      );
    }
    const resolved = path.resolve(inputPath);
    if (resolved === this.rootPath || !isWithin(this.rootPath, resolved)) {
      throw new PublicationWorkspaceError(
        "workspace-not-managed",
        "Ce workspace de publication n’est pas géré par AppPublisher.",
      );
    }
    return resolved;
  }

  async assertWorkspaceOwner(workspacePath, managedProjectPath) {
    const workspace = this.resolveWorkspace(workspacePath);
    const common = await this.git.runChecked(["rev-parse", "--git-common-dir"], {
      cwd: workspace,
    });
    const commonDir = path.resolve(workspace, common.stdout.trim());
    const expected = path.resolve(managedProjectPath, ".git");
    let commonReal = commonDir;
    let expectedReal = expected;
    try {
      commonReal = this.fs.realpathSync(commonDir);
      expectedReal = this.fs.realpathSync(expected);
    } catch {}
    if (commonReal !== expectedReal) {
      throw new PublicationWorkspaceError(
        "workspace-owner-mismatch",
        "Ce workspace n’appartient pas au projet source attendu.",
      );
    }
    return workspace;
  }

  async remoteHead(managedProjectPath, branch) {
    const ref = "refs/remotes/origin/" + validateBranch(branch);
    const result = await this.git.runChecked(["rev-parse", "--verify", ref], {
      cwd: managedProjectPath,
    });
    const sha = result.stdout.trim().toLowerCase();
    if (!/^[0-9a-f]{40,64}$/.test(sha)) {
      throw new PublicationWorkspaceError(
        "source-commit-invalid",
        "Le commit distant à publier n’a pas pu être déterminé.",
      );
    }
    return sha;
  }

  workspacePath(remoteUrl, sourceSha) {
    const nonce = this.randomBytes(4).toString("hex");
    const stamp = String(this.now());
    return path.join(
      this.rootPath,
      repositoryLabel(remoteUrl) + "-" + sourceSha.slice(0, 10) + "-" + stamp + "-" + nonce,
    );
  }

  async prepare(args) {
    const managedProjectPath = this.git.resolveManagedProject(args?.projectPath);
    const remoteUrl = this.git.normalizeRemote(args?.remoteUrl);
    const branch = validateBranch(args?.branch);

    // check valide l'identité du clone puis fetch la branche distante sans
    // modifier les fichiers locaux. Le workspace est ensuite créé directement
    // depuis origin/<branche>, donc les fichiers générés ou modifications locales
    // du clone géré ne peuvent jamais contaminer une publication.
    const sourceStatus = await this.git.check({
      projectPath: managedProjectPath,
      remoteUrl,
      branch,
    });
    const sourceSha = await this.remoteHead(managedProjectPath, branch);
    const workspace = this.workspacePath(remoteUrl, sourceSha);

    try {
      await this.git.runChecked(
        ["worktree", "add", "--detach", "--force", workspace, sourceSha],
        { cwd: managedProjectPath, timeoutMs: 5 * 60_000 },
      );

      const [head, status] = await Promise.all([
        this.git.runChecked(["rev-parse", "--verify", "HEAD"], { cwd: workspace }),
        this.git.runChecked(["status", "--porcelain=v1", "--untracked-files=all"], {
          cwd: workspace,
        }),
      ]);
      const actualSha = head.stdout.trim().toLowerCase();
      if (actualSha !== sourceSha) {
        throw new PublicationWorkspaceError(
          "workspace-commit-mismatch",
          "Le workspace créé ne correspond pas au commit distant attendu.",
        );
      }
      if (status.stdout.trim()) {
        throw new PublicationWorkspaceError(
          "workspace-dirty",
          "Le workspace de publication n’est pas propre après sa création.",
        );
      }
      await this.assertWorkspaceOwner(workspace, managedProjectPath);

      return {
        workspacePath: workspace,
        managedProjectPath,
        remoteUrl,
        branch,
        sourceSha,
        shortSha: sourceSha.slice(0, 10),
        sourceRelation: sourceStatus.relation,
        sourceWorkingTree: sourceStatus.workingTree,
        createdAt: new Date(this.now()).toISOString(),
      };
    } catch (error) {
      try {
        await this.git.run(["worktree", "remove", "--force", workspace], {
          cwd: managedProjectPath,
          timeoutMs: 60_000,
        });
      } catch {}
      try {
        if (this.fs.existsSync(workspace) && isWithin(this.rootPath, workspace)) {
          this.fs.rmSync(workspace, { recursive: true, force: true });
        }
      } catch {}
      throw error;
    }
  }

  async release(args) {
    const managedProjectPath = this.git.resolveManagedProject(args?.projectPath);
    const workspace = await this.assertWorkspaceOwner(
      args?.workspacePath,
      managedProjectPath,
    );

    const result = await this.git.run(["worktree", "remove", "--force", workspace], {
      cwd: managedProjectPath,
      timeoutMs: 2 * 60_000,
    });
    if (result.exitCode !== 0) {
      throw new PublicationWorkspaceError(
        "workspace-remove-failed",
        "Le workspace temporaire n’a pas pu être supprimé proprement.",
      );
    }
    await this.git.run(["worktree", "prune"], { cwd: managedProjectPath, timeoutMs: 60_000 });
    return { released: true, workspacePath: workspace };
  }

  /**
   * Nettoyage de démarrage : aucune publication ne peut être active avant
   * l'ouverture de la fenêtre. On ne supprime que les dossiers qui peuvent
   * être prouvés comme worktrees d'un projet Git géré encore connu.
   * Les dossiers inconnus sont volontairement laissés intacts.
   */
  async cleanupOrphans(projectPaths = []) {
    let entries = [];
    try {
      entries = this.fs.readdirSync(this.rootPath, { withFileTypes: true });
    } catch {
      return { removed: [], skipped: [] };
    }

    const managedProjects = [];
    for (const projectPath of projectPaths) {
      try {
        managedProjects.push(this.git.resolveManagedProject(projectPath));
      } catch {}
    }

    const removed = [];
    const skipped = [];
    for (const entry of entries) {
      if (!entry?.isDirectory?.()) continue;
      const workspacePath = path.join(this.rootPath, entry.name);
      let owner;
      for (const projectPath of managedProjects) {
        try {
          await this.assertWorkspaceOwner(workspacePath, projectPath);
          owner = projectPath;
          break;
        } catch {}
      }
      if (!owner) {
        skipped.push(workspacePath);
        continue;
      }
      try {
        await this.release({ projectPath: owner, workspacePath });
        removed.push(workspacePath);
      } catch {
        skipped.push(workspacePath);
      }
    }
    return { removed, skipped };
  }
}

module.exports = {
  PublicationWorkspaceError,
  PublicationWorkspaceManager,
  repositoryLabel,
  safeSegment,
};
