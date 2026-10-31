import {MODULE_ID, TESTED_VERSIONS, canEdit, conflictingModule, keyOf, openImage, setting, t} from "./config.mjs";
import {registerDebug} from "./debug.mjs";
import {saveDebugFile} from "./debug-file.mjs";
import {registerHubModule} from "./hub.mjs";
import {openFolder, refreshFolder} from "./folder-app.mjs";
import {registerKeys} from "./keys.mjs";
import {applyModuleLanguage} from "./language.mjs";
import {noticeNewVersions, runSelfTest} from "./selftest.mjs";
import {changeLanguage, registerSettings} from "./settings.mjs";
import {addToFolder, folderEntries, handoutFor} from "./store.mjs";
import {closeForAll, openMissedPicture, registerSync, shareView} from "./sync.mjs";
import {registerUsage} from "./usage.mjs";
import {HandoutViewer} from "./viewer.mjs";

Hooks.once("init", () => {
  registerHubModule({moduleId: MODULE_ID, tested: TESTED_VERSIONS});
  registerSettings({
    language: value => changeLanguage(value, redraw),
    redraw,
    handouts: () => HandoutViewer.handoutsChanged(),
    folder: () => {
      refreshFolder();
      HandoutViewer.refreshToolbars();
    },
    openFolder
  });
  // Counted only on the active GM's client, like every Sephral module
  registerUsage(MODULE_ID, {
    features: ["lens", "readingMode", "readingAids", "regionsSaved", "transcript", "readAloud", "followView",
      "shareView", "closeForAll", "folder"],
    settings: ["theme", "toolbar", "maxZoom", "showMarkers", "rememberView", "collectShared", "lateJoinMinutes"]
  });
  registerKeys(openFolder);
  registerDebug();
  Hooks.on("renderImagePopout", onRenderImagePopout);
  Hooks.on("closeImagePopout", app => HandoutViewer.of(app)?.dispose());
  Hooks.on("getHeaderControlsImagePopout", onHeaderControls);
  Hooks.on("renderJournalDirectory", onRenderJournalDirectory);
  game.modules.get(MODULE_ID).api = {
    /** Open a picture in the viewer: {src, title?, caption?}. */
    open: openImage,
    /** Open the handout folder of this user. */
    openFolder,
    /** The entries of this user's handout folder, and adding a picture to it. */
    folder: folderEntries,
    addToFolder,
    /** The reading sections, transcript and speech language of a picture. */
    handout: src => handoutFor(keyOf(src)),
    /** The open viewers, and the viewer of an image window. */
    viewers: () => HandoutViewer.all(),
    viewerOf: app => HandoutViewer.of(app),
    /** Show the picture of an image window to all players, zoomed like the GM sees it (GM). */
    shareView: app => shareView(HandoutViewer.of(app)),
    /** Close a picture on every client (GM). */
    closeForAll,
    /** Check the module (GM). */
    runSelfTest,
    /** Save the debug file of Sephral's modules (GM): about one chat message, or without an id the latest picture. */
    saveDebugFile: messageId => saveDebugFile(messageId ?? null, {moduleId: MODULE_ID})
  };
});

/** Applying a fixed module language loads its file; the rest of "ready" waits for it. */
let languageReady = Promise.resolve();

Hooks.once("i18nInit", () => {
  languageReady = applyModuleLanguage(setting("uiLanguage"));
});

Hooks.once("ready", async () => {
  await languageReady;
  registerSync();
  const conflict = conflictingModule();
  if ( conflict && game.user.isGM ) ui.notifications.warn(t("SHL.Conflict", {module: conflict.title}));
  openMissedPicture();
  noticeNewVersions();
});

/**
 * Hook "renderImagePopout": the viewer takes over the picture.
 * @param {ApplicationV2} app
 * @param {HTMLElement} element
 */
function onRenderImagePopout(app, element) {
  if ( !setting("enabled") || conflictingModule() ) return;
  HandoutViewer.attach(app, element);
}

/** Redraw after a setting changed; switching the viewer on or off applies to open windows at once. */
function redraw() {
  const ImagePopout = foundry.applications.apps.ImagePopout;
  if ( !setting("enabled") || conflictingModule() ) {
    for ( const viewer of HandoutViewer.all() ) viewer.dispose();
  }
  else {
    for ( const app of foundry.applications.instances.values() ) {
      if ( (app instanceof ImagePopout) && app.rendered && !HandoutViewer.of(app) ) HandoutViewer.attach(app, app.element);
    }
  }
  HandoutViewer.redrawAll();
  refreshFolder();
}

/**
 * Hook "getHeaderControlsImagePopout": entries in the menu of the image window. Foundry looks the handlers up in the
 * window's actions, so they are put there too.
 * @param {ApplicationV2} app
 * @param {object[]} controls
 */
function onHeaderControls(app, controls) {
  const add = (action, icon, label, visible, handler) => {
    app.options.actions[action] = handler;
    controls.push({action, icon, label, visible});
  };
  const withViewer = run => function() {
    const viewer = HandoutViewer.of(this);
    if ( viewer?.ready ) return run(viewer);
    ui.notifications.warn(t("SHL.Control.noViewer"));
  };
  const gm = () => game.user.isGM;
  add("shlFolder", "fa-solid fa-folder-open", "SHL.Control.folder", () => true, () => openFolder());
  add("shlEdit", "fa-solid fa-pen-to-square", "SHL.Control.edit", () => canEdit(), withViewer(v => v.toggleEdit()));
  add("shlLead", "fa-solid fa-tower-broadcast", "SHL.Control.lead", gm, withViewer(v => v.toggleLeading()));
  add("shlShareView", "fa-solid fa-crop-simple", "SHL.Control.shareView", gm, withViewer(v => shareView(v)));
  add("shlCloseAll", "fa-solid fa-eye-slash", "SHL.Control.closeAll", gm, function() {
    closeForAll(this.options.src);
  });
}

/**
 * Hook "renderJournalDirectory": a button for the handout folder above the journal list.
 * @param {ApplicationV2} app
 * @param {HTMLElement} html
 */
function onRenderJournalDirectory(app, html) {
  const element = (html instanceof HTMLElement) ? html : html?.[0];
  const actions = element?.querySelector(".header-actions");
  if ( !actions || actions.querySelector(".shl-open-folder") ) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "shl-open-folder";
  button.innerHTML = `<i class="fa-solid fa-folder-open" inert></i> <span>${t("SHL.Folder.title")}</span>`;
  button.addEventListener("click", event => {
    event.preventDefault();
    openFolder();
  });
  actions.append(button);
}
