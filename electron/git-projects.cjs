const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { isWithin } = require("./path-security.cjs");

const MAX_OUTPUT = 1024 * 1024;

class GitProjectError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GitProjectError";
    this.code = code;
  }
}

function normalizeRemoteUrl(raw, options = {}) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value || value.length > 2048 || /[\r\n\0]/.test(value)) {
    throw new GitProjectError("invalid-url", "L’adresse du dépôt Git est invalide.");
  }
  if (options.allowLocal === true && path.isAbsolute(value)) return path.resolve(value);

  const scp = value.match(/^([A-Za-z0-9._-]+)@([A-Za-z0-9.-]+):([^\s]+)$/);
  if (scp) {
    const repoPath = scp[3].replace(/\/+$/, "");
    if (!repoPath || repoPath.startsWith("/") || repoPath.split("/").length < 2) {
      throw new GitProjectError("invalid-url", "L’adresse SSH du dépôt est incomplète.");
    }
    return `${scp[1]}@${scp[2].toLowerCase()}:${repoPath}`;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new GitProjectError(
      "invalid-url",
      "Utilisez une adresse HTTPS ou SSH complète vers un dépôt Git.",
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "ssh:") {
    throw new GitProjectError("invalid-url", "Seuls les dépôts HTTPS et SSH sont acceptés.");
  }
  if (parsed.password || (parsed.protocol === "https:" && parsed.username)) {
    throw new GitProjectError(
      "credentials-in-url",
      "Ne placez jamais d’identifiant ou de jeton dans l’adresse du dépôt.",
    );
  }
  if (!parsed.hostname || parsed.search || parsed.hash) {
    throw new GitProjectError("invalid-url", "L’adresse du dépôt Git est invalide.");
  }
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  if (parsed.pathname.split("/").filter(Boolean).length < 2) {
    throw new GitProjectError("invalid-url", "L’adresse doit viser un dépôt précis.");
  }
  return parsed.toString().replace(/\/$/, "");
}

function validateBranch(raw) {
  const branch = typeof raw === "string" ? raw.trim() : "";
  const invalid =
    !branch ||
    branch.length > 255 ||
    branch.startsWith("-") ||
    branch.startsWith("/") ||
    branch.endsWith("/") ||
    branch.endsWith(".") ||
    branch.endsWith(".lock") ||
    branch.includes("..") ||
    branch.includes("//") ||
    branch.includes("@{") ||
    /[\s~^:?*[\\\u0000-\u001f\u007f]/.test(branch);
  if (invalid) {
    throw new GitProjectError("invalid-branch", "Le nom de branche Git est invalide.");
  }
  return branch;
}

function repositoryName(remoteUrl) {
  if (path.isAbsolute(remoteUrl)) return path.basename(remoteUrl).replace(/\.git$/i, "");
  const scp = remoteUrl.match(/^[^@]+@[^:]+:(.+)$/);
  const rawPath = scp ? scp[1] : new URL(remoteUrl).pathname;
  const name =
    rawPath
      .split("/")
      .filter(Boolean)
      .pop()
      ?.replace(/\.git$/i, "") || "project";
  const safe = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 64);
  return safe || "project";
}

function managedFolderName(remoteUrl, branch = "main") {
  const hash = crypto
    .createHash("sha256")
    .update(`${remoteUrl}\0${branch}`)
    .digest("hex")
    .slice(0, 10);
  return `${repositoryName(remoteUrl)}-${hash}`;
}

function safeChangedPath(value) {
  return value.replace(/[\u0000-\u001f\u007f]/g, "�").slice(0, 500);
}

class GitProjectManager {
  constructor(rootPath, options = {}) {
    this.rootPath = path.resolve(rootPath);
    this.fs = options.fsModule ?? fs;
    this.spawn = options.spawnImpl ?? spawn;
    this.platform = options.platform ?? process.platform;
    this.allowLocalRemotes = options.allowLocalRemotes === true;
    this.hooksPath = path.join(this.rootPath, ".hooks-disabled");
    this.fs.mkdirSync(this.rootPath, { recursive: true });
    this.fs.mkdirSync(this.hooksPath, { recursive: true });
  }

  gitEnvironment() {
    const env = {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_COUNT: "3",
      GIT_CONFIG_KEY_0: "protocol.file.allow",
      GIT_CONFIG_VALUE_0: "never",
      GIT_CONFIG_KEY_1: "core.hooksPath",
      GIT_CONFIG_VALUE_1: this.hooksPath,
      GIT_CONFIG_KEY_2: "submodule.recurse",
      GIT_CONFIG_VALUE_2: "false",
    };
    if (this.allowLocalRemotes) env.GIT_CONFIG_VALUE_0 = "always";
    return env;
  }

  normalizeRemote(raw) {
    return normalizeRemoteUrl(raw, { allowLocal: this.allowLocalRemotes });
  }

  run(args, options = {}) {
    return new Promise((resolve, reject) => {
      const child = this.spawn("git", args, {
        cwd: options.cwd,
        env: this.gitEnvironment(),
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const append = (current, chunk) => (current + chunk.toString("utf8")).slice(-MAX_OUTPUT);
      child.stdout?.on("data", (chunk) => {
        stdout = append(stdout, chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr = append(stderr, chunk);
      });
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          child.kill("SIGKILL");
        } catch {}
        reject(new GitProjectError("timeout", "L’opération Git a dépassé le délai autorisé."));
      }, options.timeoutMs ?? 120_000);
      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(
          new GitProjectError(
            error?.code === "ENOENT" ? "git-missing" : "git-failed",
            error?.code === "ENOENT"
              ? "Git n’est pas installé ou n’est pas accessible depuis AppPublisher."
              : "Impossible de lancer Git.",
          ),
        );
      });
      child.once("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({ exitCode: Number(code ?? -1), stdout, stderr });
      });
    });
  }

  async runChecked(args, options = {}) {
    const result = await this.run(args, options);
    if (result.exitCode === 0) return result;
    const combined = `${result.stderr}\n${result.stdout}`;
    if (
      /authentication failed|could not read username|permission denied \(publickey\)/i.test(
        combined,
      )
    ) {
      throw new GitProjectError(
        "authentication-required",
        "Git n’est pas encore authentifié pour ce dépôt privé sur cet ordinateur.",
      );
    }
    if (/repository not found|does not appear to be a git repository/i.test(combined)) {
      throw new GitProjectError(
        "repository-not-found",
        "Dépôt introuvable. Vérifiez l’adresse et vos droits d’accès.",
      );
    }
    if (/could not resolve host|failed to connect|network is unreachable/i.test(combined)) {
      throw new GitProjectError("network", "Impossible de joindre le serveur Git.");
    }
    throw new GitProjectError("git-failed", "L’opération Git a échoué.");
  }

  async inspectRemote(rawUrl) {
    const remoteUrl = this.normalizeRemote(rawUrl);
    const result = await this.runChecked(
      ["ls-remote", "--symref", remoteUrl, "HEAD", "refs/heads/*"],
      { timeoutMs: 60_000 },
    );
    const branches = new Set();
    let defaultBranch;
    for (const line of result.stdout.split(/\r?\n/)) {
      const symbolic = line.match(/^ref:\s+refs\/heads\/(.+)\s+HEAD$/);
      if (symbolic) defaultBranch = symbolic[1];
      const head = line.match(/^[0-9a-f]{40,64}\s+refs\/heads\/(.+)$/i);
      if (head) branches.add(head[1]);
    }
    const sorted = [...branches].sort((a, b) => a.localeCompare(b));
    if (!sorted.length) {
      throw new GitProjectError("no-branches", "Ce dépôt ne contient aucune branche importable.");
    }
    const resolvedDefault =
      defaultBranch && branches.has(defaultBranch) ? defaultBranch : sorted[0];
    const list = [resolvedDefault, ...sorted.filter((branch) => branch !== resolvedDefault)].slice(
      0,
      500,
    );
    return {
      remoteUrl,
      defaultBranch: resolvedDefault,
      branches: list,
    };
  }

  resolveManagedProject(projectPath) {
    if (typeof projectPath !== "string" || projectPath.length > 4096) {
      throw new GitProjectError(
        "project-not-managed",
        "Ce projet n’est pas géré par AppPublisher.",
      );
    }
    let rootReal;
    let projectReal;
    try {
      rootReal = this.fs.realpathSync(this.rootPath);
      projectReal = this.fs.realpathSync(projectPath);
    } catch {
      throw new GitProjectError("project-missing", "La copie locale du projet est introuvable.");
    }
    if (projectReal === rootReal || !isWithin(rootReal, projectReal)) {
      throw new GitProjectError(
        "project-not-managed",
        "Ce projet n’est pas géré par AppPublisher.",
      );
    }
    if (!this.fs.existsSync(path.join(projectReal, ".git"))) {
      throw new GitProjectError("not-git", "La copie locale n’est plus un dépôt Git valide.");
    }
    return projectReal;
  }

  async status(args) {
    const projectPath = this.resolveManagedProject(args?.projectPath);
    const expectedRemote = args?.remoteUrl ? this.normalizeRemote(args.remoteUrl) : undefined;
    const expectedBranch = args?.branch ? validateBranch(args.branch) : undefined;
    const [remoteResult, branchResult, headResult, changesResult] = await Promise.all([
      this.runChecked(["remote", "get-url", "origin"], { cwd: projectPath }),
      this.runChecked(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: projectPath }),
      this.runChecked(["rev-parse", "--verify", "HEAD"], { cwd: projectPath }),
      this.runChecked(["status", "--porcelain=v1", "--untracked-files=all"], {
        cwd: projectPath,
      }),
    ]);
    const remoteUrl = this.normalizeRemote(remoteResult.stdout.trim());
    const branch = branchResult.stdout.trim();
    const headSha = headResult.stdout.trim();
    if (branch === "HEAD") {
      throw new GitProjectError("detached-head", "Le projet est sur un commit détaché.");
    }
    if (expectedRemote && remoteUrl !== expectedRemote) {
      throw new GitProjectError(
        "remote-mismatch",
        "Le dépôt origin ne correspond plus au projet importé.",
      );
    }
    if (expectedBranch && branch !== expectedBranch) {
      throw new GitProjectError(
        "branch-mismatch",
        `La copie locale est sur « ${branch} » au lieu de « ${expectedBranch} ».`,
      );
    }
    const changedFiles = changesResult.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(0, 50)
      .map((line) => safeChangedPath(line.length > 3 ? line.slice(3) : line));
    const upstreamResult = await this.run(
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
      { cwd: projectPath },
    );
    let upstream;
    let ahead = 0;
    let behind = 0;
    if (upstreamResult.exitCode === 0) {
      upstream = upstreamResult.stdout.trim();
      const relation = await this.runChecked(
        ["rev-list", "--left-right", "--count", `HEAD...${upstream}`],
        { cwd: projectPath },
      );
      const counts = relation.stdout.trim().split(/\s+/).map(Number);
      ahead = Number.isFinite(counts[0]) ? counts[0] : 0;
      behind = Number.isFinite(counts[1]) ? counts[1] : 0;
    }
    const relation = !upstream
      ? "no-upstream"
      : ahead > 0 && behind > 0
        ? "diverged"
        : behind > 0
          ? "behind"
          : ahead > 0
            ? "ahead"
            : "up-to-date";
    return {
      remoteUrl,
      branch,
      headSha,
      shortSha: headSha.slice(0, 10),
      upstream,
      ahead,
      behind,
      relation,
      workingTree: changedFiles.length ? "dirty" : "clean",
      changedFiles,
      checkedAt: new Date().toISOString(),
    };
  }

  async clone(args) {
    const remoteUrl = this.normalizeRemote(args?.remoteUrl);
    const branch = validateBranch(args?.branch);
    const destination = path.join(this.rootPath, managedFolderName(remoteUrl, branch));
    if (this.fs.existsSync(destination)) {
      const current = await this.status({ projectPath: destination, remoteUrl, branch });
      return { localPath: destination, reused: true, status: current };
    }
    const temporary = `${destination}.importing-${process.pid}-${Date.now()}`;
    try {
      await this.runChecked(
        [
          "clone",
          "--no-recurse-submodules",
          "--single-branch",
          "--branch",
          branch,
          "--",
          remoteUrl,
          temporary,
        ],
        { timeoutMs: 10 * 60_000 },
      );
      this.fs.renameSync(temporary, destination);
      const current = await this.status({ projectPath: destination, remoteUrl, branch });
      return { localPath: destination, reused: false, status: current };
    } catch (error) {
      try {
        if (this.fs.existsSync(temporary) && isWithin(this.rootPath, temporary)) {
          this.fs.rmSync(temporary, { recursive: true, force: true });
        }
      } catch {}
      throw error;
    }
  }

  async check(args) {
    const projectPath = this.resolveManagedProject(args?.projectPath);
    const remoteUrl = this.normalizeRemote(args?.remoteUrl);
    const branch = validateBranch(args?.branch);
    // Valide d'abord l'identité locale : on ne contacte jamais un autre
    // origin que celui associé au projet dans AppPublisher.
    await this.status({ projectPath, remoteUrl, branch });
    await this.runChecked(["fetch", "--prune", "origin", branch], {
      cwd: projectPath,
      timeoutMs: 5 * 60_000,
    });
    return this.status({ projectPath, remoteUrl, branch });
  }

  async sync(args) {
    const projectPath = this.resolveManagedProject(args?.projectPath);
    const remoteUrl = this.normalizeRemote(args?.remoteUrl);
    const branch = validateBranch(args?.branch);
    const before = await this.status({ projectPath, remoteUrl, branch });
    if (before.workingTree === "dirty") {
      throw new GitProjectError(
        "local-changes",
        "Synchronisation bloquée : la copie locale contient des modifications.",
      );
    }
    if (before.relation === "ahead" || before.relation === "diverged") {
      throw new GitProjectError(
        "not-fast-forward",
        "Synchronisation bloquée : la branche locale contient des commits non publiés.",
      );
    }
    await this.runChecked(["fetch", "--prune", "origin", branch], {
      cwd: projectPath,
      timeoutMs: 5 * 60_000,
    });
    const fetched = await this.status({ projectPath, remoteUrl, branch });
    if (fetched.workingTree === "dirty") {
      throw new GitProjectError(
        "local-changes",
        "Synchronisation bloquée : la copie locale contient des modifications.",
      );
    }
    if (fetched.relation === "ahead" || fetched.relation === "diverged") {
      throw new GitProjectError(
        "not-fast-forward",
        "La branche locale ne peut pas être mise à jour automatiquement sans réécrire son historique.",
      );
    }
    if (fetched.relation === "no-upstream") {
      throw new GitProjectError(
        "no-upstream",
        "Synchronisation bloquée : cette branche ne suit plus de branche distante.",
      );
    }
    if (fetched.relation === "behind") {
      await this.runChecked(["merge", "--ff-only", fetched.upstream], {
        cwd: projectPath,
        timeoutMs: 5 * 60_000,
      });
    }
    const after = await this.status({ projectPath, remoteUrl, branch });
    return {
      updated: before.headSha !== after.headSha,
      previousHeadSha: before.headSha,
      status: after,
    };
  }
}

module.exports = {
  GitProjectError,
  GitProjectManager,
  managedFolderName,
  normalizeRemoteUrl,
  validateBranch,
};
