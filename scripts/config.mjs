/**
 * Constants and small helpers shared by the scripts of the module. The module runs on Foundry 13 and 14, so it uses
 * game.i18n instead of the v14 global _loc.
 */

import {imageKey} from "./handout-data.mjs";

/** The id of this module. */
export const MODULE_ID = "sephrals-handout-lens";

/** The socket event of this module (the manifest sets "socket": true). */
export const SOCKET = `module.${MODULE_ID}`;

/** The folder of the module's templates. */
export const TEMPLATES = `modules/${MODULE_ID}/templates`;

/** The Foundry versions the module was verified against (see the self-test). */
export const TESTED_VERSIONS = {core: "14.369"};

/** Modules that put their own zoom into Foundry's image window. While one is active, the viewer stays out of it. */
export const CONFLICTS = ["handout-ping-viewer", "gambitsImageViewer"];

/**
 * Read a setting of this module.
 * @param {string} key
 * @returns {*}
 */
export function setting(key) {
  return game.settings.get(MODULE_ID, key);
}

/**
 * Localize a key, with optional data.
 * @param {string} key
 * @param {object} [data]
 * @returns {string}
 */
export function t(key, data) {
  return data ? game.i18n.format(key, data) : game.i18n.localize(key);
}

/**
 * Escape a value for HTML.
 * @param {*} value
 * @returns {string}
 */
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;",
    "'": "&#39;"})[ch]);
}

/**
 * The key of an image on this server.
 * @param {string} src
 * @returns {string}
 */
export function keyOf(src) {
  return imageKey(src, window.location.origin);
}

/**
 * The module whose zoom would collide with the viewer, if one is active.
 * @returns {Module|undefined}
 */
export function conflictingModule() {
  return CONFLICTS.map(id => game.modules.get(id)).find(m => m?.active);
}

/**
 * Is a window open or on its way? While an application renders, its "rendered" flag is false, and a redraw asked
 * for in that moment would be lost.
 * @param {ApplicationV2|undefined} app
 * @returns {boolean}
 */
export function isShown(app) {
  const states = foundry.applications.api.ApplicationV2.RENDER_STATES;
  return !!app && ((app.state === states.RENDERED) || (app.state === states.RENDERING));
}

/**
 * Can this user change the reading sections and transcripts (a world setting)?
 * @returns {boolean}
 */
export function canEdit() {
  return game.user.isGM && game.user.can("SETTINGS_MODIFY");
}

/**
 * Open Foundry's image window for a picture; the viewer attaches itself through the render hook.
 * @param {{src: string, title?: string, caption?: string, uuid?: string, showTitle?: boolean}} image
 * @returns {Promise<ApplicationV2>}
 */
export function openImage({src, title, caption, uuid, showTitle}) {
  const ImagePopout = foundry.applications.apps.ImagePopout;
  return new ImagePopout({src, caption: caption || "", uuid: uuid || null, showTitle,
    window: {title: title || ""}}).render({force: true});
}

/**
 * Open Foundry's settings on the tab of this module.
 */
export async function openSettings() {
  const sheet = game.settings.sheet;
  await sheet.render({force: true});
  try {
    sheet.changeTab(MODULE_ID, "categories");
  } catch(err) {
    console.warn(`${MODULE_ID} | The settings have no tab for this module`, err);
  }
  sheet.bringToFront?.();
}

/**
 * Put a gear into the title bar of a window that opens the settings of this module. Every user has settings of the
 * module (the client settings of the viewer), so everyone gets it.
 * @param {HTMLElement} frame   The window frame
 */
export function addSettingsGear(frame) {
  const header = frame?.querySelector(".window-header");
  if ( !header || header.querySelector(".shl-settings") ) return;
  const gear = document.createElement("button");
  gear.type = "button";
  gear.className = "header-control icon fa-solid fa-gear shl-settings";
  gear.dataset.tooltip = t("SHL.gear");
  gear.setAttribute("aria-label", t("SHL.gear"));
  gear.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openSettings();
  });
  const anchor = header.querySelector("[data-action=toggleControls]") ?? header.querySelector("[data-action=close]");
  if ( anchor ) anchor.before(gear);
  else header.append(gear);
}
