/** Publie uniquement une distribution Windows déjà certifiée. */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { ARTIFACTS } = require("./verify-win-release.cjs");

const root = path.resolve(__dirname, "..");
const version = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8")).version;
const tag = process.env.APPPUBLISHER_RELEASE_TAG || process.env.GITHUB_REF_NAME;
const expectedTag = `v${version}`;
const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

if (tag !== expectedTag) fail(`Le tag attendu est ${expectedTag}. Tag reçu : ${tag || "aucun"}.`);
if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) fail("Jeton GitHub absent.");
const report = path.join(root, ".artifacts", "windows-release-verification.json");
if (!fs.existsSync(report)) fail("Rapport de certification Windows absent.");
const verdict = JSON.parse(fs.readFileSync(report, "utf8"));
if (verdict.verdict !== "ready" || verdict.version !== version) {
  fail("La certification Windows ne correspond pas à la version à publier.");
}
const assets = [...ARTIFACTS.map((name) => path.join(root, "dist-app", name)), report];
if (assets.some((asset) => !fs.existsSync(asset))) fail("Un artefact certifié est absent.");

const existing = spawnSync("gh", ["release", "view", tag], { cwd: root, encoding: "utf8" });
const args =
  existing.status === 0
    ? ["release", "upload", tag, ...assets]
    : [
        "release",
        "create",
        tag,
        ...assets,
        "--verify-tag",
        "--latest",
        "--title",
        `AppPublisher ${version}`,
        "--generate-notes",
      ];
const result = spawnSync("gh", args, { cwd: root, stdio: "inherit", env: process.env });
if (result.status !== 0) fail("GitHub a refusé la publication Windows.");
console.log(`✓ AppPublisher ${version} pour Windows est disponible dans GitHub Releases.`);
