/* eslint-disable */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { BACKUP_REASONS, SNAPSHOT_FILES, safeRelativeFile } = require("./backup-schema.cjs");

const BACKUPS_FOLDER = ".apppublisher-backups";
const REASONS = new Set(BACKUP_REASONS);

function makeStamp(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, "-");
}

class BackupManager {
  constructor(accessRegistry, options = {}) {
    this.access = accessRegistry;
    this.fs = options.fsModule ?? fs;
    this.randomBytes = options.randomBytes ?? crypto.randomBytes;
  }

  resolveProject(projectPath) {
    const project = this.access.resolveExisting(projectPath);
    if (!project) throw new Error("Projet non autorisé.");
    const packageFile = this.access.resolveExisting(path.join(project, "package.json"));
    if (!packageFile || !this.fs.statSync(packageFile).isFile()) {
      throw new Error("Le dossier autorisé n'est pas un projet AppPublisher valide.");
    }
    return project;
  }

  create(projectPath, reason) {
    if (!REASONS.has(reason)) throw new Error("Motif de sauvegarde invalide.");
    const project = this.resolveProject(projectPath);
    const suffix = this.randomBytes(4).toString("hex");
    const locationInput = path.join(project, BACKUPS_FOLDER, `${makeStamp()}-${reason}-${suffix}`);
    const location = this.access.resolveForCreate(locationInput);
    if (!location) throw new Error("Destination de sauvegarde non autorisée.");
    this.fs.mkdirSync(location, { recursive: true, mode: 0o700 });

    const files = [];
    try {
      for (const relative of SNAPSHOT_FILES) {
        const source = this.access.resolveExisting(path.join(project, relative));
        if (!source) continue;
        const sourceStat = this.fs.statSync(source);
        if (!sourceStat.isFile()) continue;
        const destination = this.access.resolveForCreate(path.join(location, relative));
        if (!destination) throw new Error(`Destination refusée pour ${relative}.`);
        this.fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
        this.fs.copyFileSync(source, destination);
        const copiedStat = this.fs.statSync(destination);
        if (!copiedStat.isFile() || copiedStat.size !== sourceStat.size) {
          throw new Error(`Copie incomplète pour ${relative}.`);
        }
        files.push({ path: relative, size: sourceStat.size });
      }
    } catch (error) {
      try {
        this.fs.rmSync(location, { recursive: true, force: true });
      } catch {}
      throw error;
    }

    if (!files.some((file) => file.path === "package.json")) {
      try {
        this.fs.rmSync(location, { recursive: true, force: true });
      } catch {}
      throw new Error("La sauvegarde ne contient pas package.json.");
    }
    return { location, files };
  }

  restore(projectPath, locationInput, files) {
    const project = this.resolveProject(projectPath);
    const backupRoot = this.access.resolveExisting(path.join(project, BACKUPS_FOLDER));
    const location = this.access.resolveExisting(locationInput);
    if (!backupRoot || !location) throw new Error("Sauvegarde introuvable ou non autorisée.");
    const relativeLocation = path.relative(backupRoot, location);
    if (
      relativeLocation === "" ||
      relativeLocation.startsWith("..") ||
      path.isAbsolute(relativeLocation)
    ) {
      throw new Error("Emplacement de sauvegarde invalide.");
    }
    if (!Array.isArray(files) || files.length === 0) throw new Error("Sauvegarde vide.");

    const validated = files.map((file) => {
      if (
        !file ||
        !safeRelativeFile(file.path) ||
        !Number.isSafeInteger(file.size) ||
        file.size < 0
      ) {
        throw new Error("Métadonnées de sauvegarde invalides.");
      }
      const source = this.access.resolveExisting(path.join(location, file.path));
      if (!source) throw new Error(`Fichier de sauvegarde introuvable : ${file.path}.`);
      const stat = this.fs.statSync(source);
      if (!stat.isFile() || stat.size !== file.size) {
        throw new Error(`Fichier de sauvegarde altéré : ${file.path}.`);
      }
      const destination = this.access.resolveForCreate(path.join(project, file.path));
      if (!destination) throw new Error(`Destination de restauration refusée : ${file.path}.`);
      return { ...file, source, destination };
    });

    for (const item of validated) {
      this.fs.mkdirSync(path.dirname(item.destination), { recursive: true });
      const temporary = `${item.destination}.apppublisher-restore-${process.pid}`;
      try {
        this.fs.copyFileSync(item.source, temporary);
        if (this.fs.statSync(temporary).size !== item.size) {
          throw new Error(`Restauration incomplète : ${item.path}.`);
        }
        this.fs.renameSync(temporary, item.destination);
      } catch (error) {
        try {
          this.fs.unlinkSync(temporary);
        } catch {}
        throw error;
      }
    }
    return { files: validated.map(({ path: relative, size }) => ({ path: relative, size })) };
  }
}

module.exports = {
  BACKUPS_FOLDER,
  BackupManager,
  REASONS,
  SNAPSHOT_FILES,
  makeStamp,
  safeRelativeFile,
};
