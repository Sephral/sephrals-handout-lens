/**
 * Self-test: Foundry's image window, the socket, the storage, the texts, and a real viewer in an invisible test
 * window that closes again.
 */

import {MODULE_ID, TESTED_VERSIONS, conflictingModule, esc, setting, t} from "./config.mjs";
import {HandoutViewer} from "./viewer.mjs";

/** A small picture for the test window. */
const TEST_IMAGE = "icons/svg/book.svg";

/**
 * Open a test window and wait for its viewer.
 * @returns {Promise<boolean>}
 */
async function viewerWorks() {
  const ImagePopout = foundry.applications.apps.ImagePopout;
  // Invisible while it runs (Foundry keeps windows inside the screen, so it cannot go off screen)
  const app = new ImagePopout({src: TEST_IMAGE, window: {title: "Handout Lens"}, classes: ["shl-selftest"]});
  try {
    await app.render({force: true});
    for ( let i = 0; i < 40; i++ ) {
      const viewer = HandoutViewer.of(app);
      if ( viewer?.ready ) {
        viewer.zoomBy(2);
        return viewer.view.s > 0 && !!viewer.root.querySelector(".shl-toolbar button");
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
  } finally {
    await app.close({animate: false});
  }
}

/**
 * Run all checks.
 * @returns {Promise<{problems: string[], checks: number}>}
 */
async function checkAll() {
  const problems = [];
  let checks = 0;
  const check = (ok, key, data) => {
    checks++;
    if ( !ok ) problems.push(game.i18n.has(key) ? t(key, data) : key);
  };
  const ImagePopout = foundry.applications.apps?.ImagePopout;
  check(!!ImagePopout?.DEFAULT_OPTIONS?.classes?.includes("image-popout"), "SHL.SELFTEST.Popout");
  check(typeof foundry.documents.collections.Journal?.showImage === "function", "SHL.SELFTEST.Share");
  check(typeof game.socket?.emit === "function", "SHL.SELFTEST.Socket");
  for ( const key of ["handouts", "current", "folder"] ) {
    check(game.settings.settings.has(`${MODULE_ID}.${key}`), "SHL.SELFTEST.Storage", {key});
  }
  const conflict = conflictingModule();
  check(!conflict, "SHL.SELFTEST.Conflict", {module: conflict?.title ?? ""});
  check(setting("enabled"), "SHL.SELFTEST.Disabled");
  const keys = ["SHL.Tool.zoomIn", "SHL.Tool.lens", "SHL.Panel.title", "SHL.Edit.title", "SHL.Folder.title"];
  const missing = keys.filter(key => !game.i18n.has(key));
  check(!missing.length, "SHL.SELFTEST.Texts", {keys: missing.join(", ")});
  if ( !conflict && setting("enabled") ) check(await viewerWorks().catch(() => false), "SHL.SELFTEST.Viewer");
  return {problems, checks};
}

/**
 * Run the self-test and report the result.
 * @param {object} [options]
 * @param {boolean} [options.report=true]
 * @returns {Promise<{problems: string[], checks: number}>}
 */
export async function runSelfTest({report=true}={}) {
  const {problems, checks} = await checkAll();
  const summary = problems.length ? t("SHL.SELFTEST.Problems", {problems: problems.length, checks})
    : t("SHL.SELFTEST.Passed", {checks});
  if ( problems.length ) ui.notifications.warn(summary, {permanent: true});
  else ui.notifications.info(summary);
  if ( report ) {
    const versions = t("SHL.SELFTEST.Version", {current: game.version, tested: TESTED_VERSIONS.core});
    const extras = [
      globalThis.speechSynthesis ? null : t("SHL.SELFTEST.NoSpeech"),
      document.fullscreenEnabled ? null : t("SHL.SELFTEST.NoFullscreen")
    ].filter(Boolean);
    let content = `<h3>${esc(t("SHL.SELFTEST.Title"))}</h3><p>${esc(summary)}</p><p><small>${esc(versions)}</small></p>`;
    if ( problems.length ) content += `<ul>${problems.map(p => `<li>${esc(p)}</li>`).join("")}</ul>`;
    if ( extras.length ) content += `<p><small>${extras.map(esc).join("<br>")}</small></p>`;
    await ChatMessage.implementation.create({content, whisper: [game.user.id], speaker: {alias: game.modules.get(MODULE_ID).title}});
  }
  return {problems, checks};
}

/**
 * Tell the GM once when Foundry is newer than the version the module was verified against.
 */
export function noticeNewVersions() {
  if ( !game.user.isGM ) return;
  if ( !foundry.utils.isNewerVersion(game.version, TESTED_VERSIONS.core) ) return;
  const signature = `core ${game.version}`;
  if ( game.settings.get(MODULE_ID, "acknowledgedVersions") === signature ) return;
  game.settings.set(MODULE_ID, "acknowledgedVersions", signature);
  ui.notifications.info(t("SHL.SELFTEST.NewVersions", {versions: signature}), {permanent: true});
}
