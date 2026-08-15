const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 12 * 1000;

/**
 * Pilote electron-updater sans dépendre du renderer. Les dialogues natifs
 * restent accessibles même si l'interface React rencontre un problème.
 */
class MacUpdateManager {
  constructor(options) {
    this.app = options.app;
    this.dialog = options.dialog;
    this.updater = options.updater;
    this.log = options.log ?? (() => {});
    this.getWindow = options.getWindow ?? (() => undefined);
    this.platform = options.platform ?? process.platform;
    this.setTimeout = options.setTimeoutFn ?? setTimeout;
    this.clearTimeout = options.clearTimeoutFn ?? clearTimeout;
    this.setInterval = options.setIntervalFn ?? setInterval;
    this.clearInterval = options.clearIntervalFn ?? clearInterval;
    this.startupDelayMs = options.startupDelayMs ?? STARTUP_DELAY_MS;
    this.intervalMs = options.intervalMs ?? SIX_HOURS_MS;
    this.started = false;
    this.checking = false;
    this.manualCheck = false;
    this.errorDialogShown = false;
    this.timeout = null;
    this.interval = null;
  }

  isSupported() {
    return this.platform === "darwin" && this.app.isPackaged === true;
  }

  start() {
    if (!this.isSupported() || this.started) return false;
    this.started = true;
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = true;
    this.updater.logger = {
      info: (message) => this.write("info", message),
      warn: (message) => this.write("warn", message),
      error: (message) => this.write("error", message),
      debug: (message) => this.write("debug", message),
    };

    this.updater.on("checking-for-update", () => this.write("info", "Vérification en cours"));
    this.updater.on("update-available", (info) => void this.onUpdateAvailable(info));
    this.updater.on("update-not-available", () => void this.onNoUpdate());
    this.updater.on("update-downloaded", (info) => void this.onUpdateDownloaded(info));
    this.updater.on("error", (error) => void this.onError(error));

    this.timeout = this.setTimeout(() => {
      void this.check(false);
      this.interval = this.setInterval(() => void this.check(false), this.intervalMs);
    }, this.startupDelayMs);
    this.write("info", "Mises à jour automatiques activées");
    return true;
  }

  stop() {
    if (this.timeout) this.clearTimeout(this.timeout);
    if (this.interval) this.clearInterval(this.interval);
    this.timeout = null;
    this.interval = null;
  }

  async checkNow() {
    if (!this.isSupported()) {
      await this.showMessage({
        type: "info",
        title: "Mises à jour",
        message:
          "La recherche de mises à jour est disponible dans la version installée d’AppPublisher.",
        detail: "Les versions de développement ne se mettent pas à jour automatiquement.",
        buttons: ["OK"],
      });
      return false;
    }
    return this.check(true);
  }

  async check(manual) {
    if (this.checking) {
      if (manual) {
        await this.showMessage({
          type: "info",
          title: "Mise à jour",
          message: "Une vérification est déjà en cours.",
          buttons: ["OK"],
        });
      }
      return false;
    }
    this.checking = true;
    this.manualCheck = manual;
    this.errorDialogShown = false;
    try {
      await this.updater.checkForUpdates();
      return true;
    } catch (error) {
      await this.onError(error, manual);
      return false;
    } finally {
      this.checking = false;
    }
  }

  async onUpdateAvailable(info = {}) {
    this.checking = false;
    this.manualCheck = false;
    const version = info.version ? ` ${info.version}` : "";
    this.write("info", `Mise à jour${version} disponible`);
    const result = await this.showMessage({
      type: "info",
      title: "Mise à jour disponible",
      message: `Une nouvelle version d’AppPublisher${version} est disponible.`,
      detail: "Le téléchargement peut continuer pendant que vous utilisez l’application.",
      buttons: ["Télécharger", "Plus tard"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (result.response !== 0) return;
    try {
      this.errorDialogShown = false;
      await this.updater.downloadUpdate();
    } catch (error) {
      await this.onError(error, true);
    }
  }

  async onNoUpdate() {
    this.checking = false;
    const wasManual = this.manualCheck;
    this.manualCheck = false;
    this.write("info", "Aucune mise à jour disponible");
    if (!wasManual) return;
    await this.showMessage({
      type: "info",
      title: "AppPublisher est à jour",
      message: `Vous utilisez déjà la dernière version (${this.app.getVersion()}).`,
      buttons: ["OK"],
    });
  }

  async onUpdateDownloaded(info = {}) {
    const version = info.version ? ` ${info.version}` : "";
    this.write("info", `Mise à jour${version} téléchargée`);
    const result = await this.showMessage({
      type: "info",
      title: "Mise à jour prête",
      message: `AppPublisher${version} est prêt à être installé.`,
      detail: "L’application va redémarrer. Votre travail enregistré sera conservé.",
      buttons: ["Redémarrer et installer", "Plus tard"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (result.response === 0) this.updater.quitAndInstall(false, true);
  }

  async onError(error, forceDialog = false) {
    this.checking = false;
    const wasManual = this.manualCheck;
    this.manualCheck = false;
    this.write("error", `Échec de la mise à jour : ${String(error?.message ?? error)}`);
    if ((!wasManual && !forceDialog) || this.errorDialogShown) return;
    this.errorDialogShown = true;
    await this.showMessage({
      type: "warning",
      title: "Mise à jour indisponible",
      message: "AppPublisher n’a pas pu vérifier ou télécharger la mise à jour.",
      detail: "Vérifiez votre connexion Internet, puis réessayez depuis le menu AppPublisher.",
      buttons: ["OK"],
    });
  }

  showMessage(options) {
    return this.dialog.showMessageBox(this.getWindow(), options);
  }

  write(level, message) {
    this.log({ level, message, source: "auto-update" });
  }
}

module.exports = { MacUpdateManager, SIX_HOURS_MS, STARTUP_DELAY_MS };
