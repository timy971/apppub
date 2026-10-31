const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { isWithin } = require("./path-security.cjs");
const { safeSegment } = require("./publication-workspaces.cjs");

class PublicationArtifactError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PublicationArtifactError";
    this.code = code;
  }
}

function validSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40,64}$/i.test(value);
}

function validFingerprint(value) {
  const normalized =
    typeof value === "string" ? value.replace(/[^0-9a-f]/gi, "").toUpperCase() : "";
  return normalized && /^[0-9A-F]{32,128}$/.test(normalized) ? normalized : undefined;
}

function hashFile(filePath, fsModule = fs) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fsModule.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex").toUpperCase()));
  });
}

class PublicationArtifactManager {
  constructor(rootPath, publicationWorkspaceManager, options = {}) {
    if (!publicationWorkspaceManager) throw new Error("PublicationWorkspaceManager requis.");
    this.rootPath = path.resolve(rootPath);
    this.workspaces = publicationWorkspaceManager;
    this.fs = options.fsModule ?? fs;
    this.now = options.now ?? (() => Date.now());
    this.randomBytes = options.randomBytes ?? crypto.randomBytes;
    this.fs.mkdirSync(this.rootPath, { recursive: true, mode: 0o700 });
  }

  resolveWorkspaceFile(workspacePath, inputPath, extension) {
    if (typeof inputPath !== "string" || inputPath.length > 4096) {
      throw new PublicationArtifactError("artifact-invalid", "Le fichier de publication est invalide.");
    }
    const workspace = path.resolve(workspacePath);
    const candidate = path.resolve(inputPath);
    if (!isWithin(workspace, candidate)) {
      throw new PublicationArtifactError(
        "artifact-outside-workspace",
        "Le fichier de publication n’appartient pas au workspace attendu.",
      );
    }
    if (extension && path.extname(candidate).toLowerCase() !== extension) {
      throw new PublicationArtifactError(
        "artifact-invalid-extension",
        "Le fichier de publication n’a pas le format attendu.",
      );
    }
    let real;
    try {
      real = this.fs.realpathSync(candidate);
    } catch {
      throw new PublicationArtifactError("artifact-missing", "Le fichier de publication est introuvable.");
    }
    if (!isWithin(workspace, real)) {
      throw new PublicationArtifactError(
        "artifact-outside-workspace",
        "Le fichier de publication sort du workspace autorisé.",
      );
    }
    const stat = this.fs.statSync(real);
    if (!stat.isFile() || stat.size <= 0) {
      throw new PublicationArtifactError("artifact-empty", "Le fichier de publication est vide.");
    }
    return { path: real, stat };
  }

  destination(args) {
    const project = safeSegment(args.projectId, "project");
    const version = safeSegment(args.versionName, "version");
    const sha = args.sourceSha.slice(0, 10).toLowerCase();
    const stamp = String(this.now());
    const nonce = this.randomBytes(4).toString("hex");
    return path.join(
      this.rootPath,
      project,
      version + "-" + args.versionCode + "-" + sha + "-" + stamp + "-" + nonce,
    );
  }

  resolveStableArtifact(inputPath) {
    if (typeof inputPath !== "string" || inputPath.length > 4096) {
      throw new PublicationArtifactError("artifact-invalid", "Le fichier Android stable est invalide.");
    }
    const candidate = path.resolve(inputPath);
    if (!isWithin(this.rootPath, candidate)) {
      throw new PublicationArtifactError(
        "artifact-outside-storage",
        "Le fichier Android n’appartient pas au stockage AppPublisher.",
      );
    }
    let real;
    try {
      real = this.fs.realpathSync(candidate);
    } catch {
      throw new PublicationArtifactError("artifact-missing", "Le fichier Android stable est introuvable.");
    }
    if (!isWithin(this.rootPath, real) || !this.fs.statSync(real).isFile()) {
      throw new PublicationArtifactError(
        "artifact-outside-storage",
        "Le fichier Android stable n’est plus autorisé.",
      );
    }
    return real;
  }

  async promote(args) {
    if (!args || typeof args !== "object") {
      throw new PublicationArtifactError("invalid-args", "Promotion de publication invalide.");
    }
    if (!validSha(args.sourceSha)) {
      throw new PublicationArtifactError("source-commit-invalid", "Commit source invalide.");
    }
    if (!Number.isSafeInteger(args.versionCode) || args.versionCode < 1) {
      throw new PublicationArtifactError("version-code-invalid", "Numéro interne invalide.");
    }
    if (typeof args.versionName !== "string" || !args.versionName.trim()) {
      throw new PublicationArtifactError("version-name-invalid", "Version visible invalide.");
    }
    if (typeof args.applicationId !== "string" || !args.applicationId.trim()) {
      throw new PublicationArtifactError("application-id-invalid", "Identifiant Android invalide.");
    }

    const workspace = await this.workspaces.assertWorkspaceOwner(
      args.workspacePath,
      args.projectPath,
    );
    const aab = this.resolveWorkspaceFile(workspace, args.aabPath, ".aab");
    const report = args.reportPath
      ? this.resolveWorkspaceFile(workspace, args.reportPath, ".json")
      : null;

    const sourceHash = await hashFile(aab.path, this.fs);
    const expectedHash =
      typeof args.artifactSha256 === "string"
        ? args.artifactSha256.replace(/[^0-9a-f]/gi, "").toUpperCase()
        : undefined;
    if (expectedHash && expectedHash !== sourceHash) {
      throw new PublicationArtifactError(
        "artifact-hash-mismatch",
        "L’empreinte du fichier Android a changé avant son archivage.",
      );
    }

    const destination = this.destination(args);
    this.fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
    const artifactPath = path.join(destination, "app-release.aab");
    const reportPath = report ? path.join(destination, "app-release.aab.apppublisher-report.json") : undefined;
    const manifestPath = path.join(destination, "publication-manifest.json");
    const temporaryArtifact = artifactPath + ".tmp-" + process.pid;

    try {
      this.fs.copyFileSync(aab.path, temporaryArtifact);
      this.fs.renameSync(temporaryArtifact, artifactPath);
      if (report && reportPath) {
        this.fs.copyFileSync(report.path, reportPath);
        try {
          const parsed = JSON.parse(this.fs.readFileSync(reportPath, "utf8"));
          this.fs.writeFileSync(
            reportPath,
            JSON.stringify({ ...parsed, reportPath }, null, 2) + "\n",
            { encoding: "utf8", mode: 0o600 },
          );
        } catch {
          // Le rapport original a déjà été validé comme fichier non vide.
          // S'il n'est pas JSON, on conserve sa copie brute plutôt que de
          // perdre l'AAB stable.
        }
      }

      const copiedHash = await hashFile(artifactPath, this.fs);
      const copiedStat = this.fs.statSync(artifactPath);
      if (copiedHash !== sourceHash || copiedStat.size !== aab.stat.size) {
        throw new PublicationArtifactError(
          "artifact-copy-mismatch",
          "La copie stable du fichier Android n’a pas pu être vérifiée.",
        );
      }

      const storedAt = new Date(this.now()).toISOString();
      const manifest = {
        schemaVersion: 1,
        storedAt,
        project: {
          id: String(args.projectId),
          name: typeof args.projectName === "string" ? args.projectName : undefined,
        },
        source: {
          commit: args.sourceSha.toLowerCase(),
          branch: typeof args.branch === "string" ? args.branch : undefined,
        },
        release: {
          applicationId: args.applicationId,
          versionName: args.versionName,
          versionCode: args.versionCode,
        },
        artifact: {
          fileName: path.basename(artifactPath),
          sizeBytes: copiedStat.size,
          sha256: copiedHash,
          signerSha256: validFingerprint(args.signerSha256),
        },
        corrections: Array.isArray(args.corrections)
          ? args.corrections
              .filter((value) => typeof value === "string")
              .map((value) => value.slice(0, 512))
              .slice(0, 50)
          : [],
        adjustments: Array.isArray(args.adjustments) ? args.adjustments.slice(0, 20) : [],
        reportFileName: reportPath ? path.basename(reportPath) : undefined,
      };
      const temporaryManifest = manifestPath + ".tmp-" + process.pid;
      this.fs.writeFileSync(temporaryManifest, JSON.stringify(manifest, null, 2) + "\n", {
        encoding: "utf8",
        mode: 0o600,
      });
      this.fs.renameSync(temporaryManifest, manifestPath);

      return {
        artifactPath,
        reportPath,
        manifestPath,
        artifactSizeBytes: copiedStat.size,
        artifactSha256: copiedHash,
        storedAt,
      };
    } catch (error) {
      try {
        this.fs.rmSync(destination, { recursive: true, force: true });
      } catch {}
      throw error;
    } finally {
      try {
        if (this.fs.existsSync(temporaryArtifact)) this.fs.unlinkSync(temporaryArtifact);
      } catch {}
    }
  }

  readStableManifest(manifestPath) {
    let manifest;
    try {
      manifest = JSON.parse(this.fs.readFileSync(manifestPath, "utf8"));
    } catch {
      return null;
    }
    if (
      manifest?.schemaVersion !== 1 ||
      typeof manifest?.project?.id !== "string" ||
      typeof manifest?.release?.applicationId !== "string" ||
      typeof manifest?.release?.versionName !== "string" ||
      !Number.isSafeInteger(manifest?.release?.versionCode) ||
      manifest.release.versionCode < 1 ||
      typeof manifest?.artifact?.fileName !== "string" ||
      typeof manifest?.artifact?.sha256 !== "string" ||
      !/^[0-9A-Fa-f]{64}$/.test(manifest.artifact.sha256) ||
      typeof manifest?.storedAt !== "string" ||
      Number.isNaN(Date.parse(manifest.storedAt))
    ) {
      return null;
    }
    return manifest;
  }

  writeStableManifest(manifestPath, manifest) {
    const temporary = manifestPath + ".tmp-" + process.pid + "-" + this.now();
    try {
      this.fs.writeFileSync(temporary, JSON.stringify(manifest, null, 2) + "\n", {
        encoding: "utf8",
        mode: 0o600,
      });
      this.fs.renameSync(temporary, manifestPath);
    } catch (error) {
      try {
        this.fs.unlinkSync(temporary);
      } catch {}
      throw error;
    }
  }

  recordPreparation(aabPath, input = {}) {
    const artifactPath = this.resolveStableArtifact(aabPath);
    const manifestPath = path.join(path.dirname(artifactPath), "publication-manifest.json");
    const manifest = this.readStableManifest(manifestPath);
    if (!manifest || manifest.artifact.fileName !== path.basename(artifactPath)) {
      throw new PublicationArtifactError(
        "manifest-mismatch",
        "Le manifeste ne correspond pas à ce fichier Android.",
      );
    }
    const notes = typeof input.notes === "string" ? input.notes.trim() : "";
    if (!notes || [...notes].length > 500) {
      throw new PublicationArtifactError(
        "release-notes-invalid",
        "Les notes de version préparées sont absentes ou dépassent 500 caractères.",
      );
    }
    const preparedAt =
      typeof input.preparedAt === "string" && !Number.isNaN(Date.parse(input.preparedAt))
        ? input.preparedAt
        : new Date(this.now()).toISOString();
    const next = {
      ...manifest,
      preparation: {
        notes,
        preparedAt,
      },
    };
    this.writeStableManifest(manifestPath, next);
    return { manifestPath, preparedAt };
  }

  async latestForProject(input = {}) {
    const projectId = typeof input.projectId === "string" ? input.projectId : "";
    if (!projectId) return null;
    const projectRoot = path.join(this.rootPath, safeSegment(projectId, "project"));
    if (!isWithin(this.rootPath, projectRoot) || !this.fs.existsSync(projectRoot)) return null;

    let entries;
    try {
      entries = this.fs.readdirSync(projectRoot, { withFileTypes: true });
    } catch {
      return null;
    }

    const candidates = [];
    for (const entry of entries) {
      if (!entry?.isDirectory?.()) continue;
      const dir = path.join(projectRoot, entry.name);
      const manifestPath = path.join(dir, "publication-manifest.json");
      const manifest = this.readStableManifest(manifestPath);
      if (!manifest || manifest.project.id !== projectId) continue;
      if (input.applicationId && manifest.release.applicationId !== input.applicationId) continue;
      if (input.versionName && manifest.release.versionName !== input.versionName) continue;
      if (
        Number.isSafeInteger(input.versionCode) &&
        manifest.release.versionCode !== input.versionCode
      ) {
        continue;
      }
      const artifactPath = path.join(dir, manifest.artifact.fileName);
      let artifactReal;
      try {
        artifactReal = this.resolveStableArtifact(artifactPath);
      } catch {
        continue;
      }
      const stat = this.fs.statSync(artifactReal);
      if (!stat.isFile() || stat.size !== manifest.artifact.sizeBytes) continue;
      const actualHash = await hashFile(artifactReal, this.fs);
      if (actualHash !== manifest.artifact.sha256.toUpperCase()) continue;

      let reportPath;
      if (typeof manifest.reportFileName === "string") {
        const candidate = path.join(dir, manifest.reportFileName);
        try {
          const real = this.fs.realpathSync(candidate);
          if (isWithin(dir, real) && this.fs.statSync(real).isFile()) reportPath = real;
        } catch {}
      }
      candidates.push({
        manifest,
        manifestPath,
        artifactPath: artifactReal,
        artifactSizeBytes: stat.size,
        artifactSha256: actualHash,
        reportPath,
      });
    }

    candidates.sort(
      (a, b) => Date.parse(b.manifest.storedAt) - Date.parse(a.manifest.storedAt),
    );
    const latest = candidates[0];
    if (!latest) return null;
    return {
      projectId: latest.manifest.project.id,
      projectName: latest.manifest.project.name,
      versionName: latest.manifest.release.versionName,
      versionCode: latest.manifest.release.versionCode,
      applicationId: latest.manifest.release.applicationId,
      artifactPath: latest.artifactPath,
      artifactSizeBytes: latest.artifactSizeBytes,
      artifactSha256: latest.artifactSha256,
      reportPath: latest.reportPath,
      manifestPath: latest.manifestPath,
      sourceCommit: latest.manifest.source?.commit,
      sourceBranch: latest.manifest.source?.branch,
      storedAt: latest.manifest.storedAt,
      notes: latest.manifest.preparation?.notes,
      preparedAt: latest.manifest.preparation?.preparedAt,
      googlePlay: latest.manifest.googlePlay,
    };
  }

  recordGooglePlayResult(aabPath, result) {
    const artifactPath = this.resolveStableArtifact(aabPath);
    const manifestPath = path.join(path.dirname(artifactPath), "publication-manifest.json");
    let manifest;
    try {
      manifest = JSON.parse(this.fs.readFileSync(manifestPath, "utf8"));
    } catch {
      throw new PublicationArtifactError(
        "manifest-missing",
        "Le manifeste de publication est introuvable ou illisible.",
      );
    }
    if (
      manifest?.artifact?.fileName !== path.basename(artifactPath) ||
      manifest?.release?.applicationId !== result?.packageName ||
      manifest?.release?.versionCode !== result?.versionCode
    ) {
      throw new PublicationArtifactError(
        "manifest-mismatch",
        "Le résultat Google Play ne correspond pas au manifeste de cet AAB.",
      );
    }
    const committedAt =
      typeof result.committedAt === "string" && !Number.isNaN(Date.parse(result.committedAt))
        ? result.committedAt
        : new Date(this.now()).toISOString();
    const next = {
      ...manifest,
      googlePlay: {
        provider: "google-play",
        track: "internal",
        packageName: result.packageName,
        versionCode: result.versionCode,
        releaseStatus: "completed",
        editId: String(result.editId ?? "").slice(0, 512),
        accountEmail: String(result.accountEmail ?? "").slice(0, 320),
        authMode: result.authMode === "service-account" ? "service-account" : "oauth",
        resumed: result.resumed === true,
        recoveredCommit: result.recoveredCommit === true,
        committedAt,
      },
    };
    this.writeStableManifest(manifestPath, next);
    return { manifestPath, committedAt };
  }
}

module.exports = {
  PublicationArtifactError,
  PublicationArtifactManager,
  hashFile,
};
