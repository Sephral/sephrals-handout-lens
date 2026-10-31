/**
 * Settings of the module. Like in every Sephral module, all options appear in Foundry's settings dialog under this
 * module, starting with the module language.
 */

import {MODULE_ID, isShown} from "./config.mjs";
import {FOLLOW_FOUNDRY, applyModuleLanguage} from "./language.mjs";
import {runSelfTest} from "./selftest.mjs";

/**
 * The settings of the module, in the order they appear in the settings dialog.
 * @type {Record<string, object>}
 */
export const SETTINGS = {
  uiLanguage: {type: String, default: FOLLOW_FOUNDRY, scope: "client", onChange: "language", choices: {
    [FOLLOW_FOUNDRY]: "SHL.LANGUAGE.default", de: "SHL.LANGUAGE.de", en: "SHL.LANGUAGE.en"}},
  theme: {type: String, default: "signature", scope: "client", onChange: "redraw", choices: {
    signature: "SHL.SETTINGS.theme.signature", foundry: "SHL.SETTINGS.theme.foundry"}},
  enabled: {type: Boolean, default: true, scope: "client", onChange: "redraw"},
  toolbar: {type: String, default: "auto", scope: "client", onChange: "redraw", choices: {
    auto: "SHL.SETTINGS.toolbar.auto", always: "SHL.SETTINGS.toolbar.always"}},
  maxZoom: {type: Number, default: 8, scope: "client", range: {min: 2, max: 16, step: 1}},
  lensSize: {type: Number, default: 240, scope: "client", range: {min: 120, max: 400, step: 20}},
  lensZoom: {type: Number, default: 2.5, scope: "client", range: {min: 1.5, max: 6, step: 0.5}},
  showMarkers: {type: Boolean, default: true, scope: "client", onChange: "redraw"},
  rememberView: {type: Boolean, default: true, scope: "client"},
  resolutionHint: {type: Boolean, default: true, scope: "client", onChange: "redraw"},
  collectShared: {type: Boolean, default: true},
  lateJoinMinutes: {type: Number, default: 30, range: {min: 0, max: 240, step: 5}}
};

/**
 * Register all settings of the module and its menus.
 * @param {{language: Function, redraw: Function, handouts: Function, folder: Function, openFolder: Function}} handlers
 */
export function registerSettings(handlers) {
  openFolderMenu = handlers.openFolder;
  for ( const [key, def] of Object.entries(SETTINGS) ) {
    game.settings.register(MODULE_ID, key, {
      name: `SHL.SETTINGS.${key}.name`,
      hint: `SHL.SETTINGS.${key}.hint`,
      scope: def.scope ?? "world",
      config: true,
      type: def.range ? new foundry.data.fields.NumberField({...def.range, initial: def.default}) : def.type,
      choices: def.choices,
      default: def.default,
      onChange: def.onChange ? value => handlers[def.onChange]?.(value) : undefined
    });
  }

  // Reading sections and transcripts by image (written by a GM), and the image the GM showed last
  game.settings.register(MODULE_ID, "handouts", {scope: "world", config: false, type: Object, default: {},
    onChange: value => handlers.handouts?.(value)});
  game.settings.register(MODULE_ID, "current", {scope: "world", config: false, type: Object, default: {}});

  // The handout folder of each user, kept in the world so it follows the user to every device
  game.settings.register(MODULE_ID, "folder", {scope: "user", config: false, type: Array, default: [],
    onChange: value => handlers.folder?.(value)});

  game.settings.register(MODULE_ID, "textSize", {scope: "client", config: false, type: Number, default: 18});
  game.settings.register(MODULE_ID, "acknowledgedVersions", {scope: "client", config: false, type: String, default: ""});

  game.settings.registerMenu(MODULE_ID, "folder", {
    name: "SHL.Folder.title",
    label: "SHL.Folder.menuLabel",
    hint: "SHL.Folder.menuHint",
    icon: "fa-solid fa-folder-open",
    type: FolderMenu,
    restricted: false
  });
  game.settings.registerMenu(MODULE_ID, "selfTest", {
    name: "SHL.SELFTEST.Title",
    label: "SHL.SELFTEST.Run",
    hint: "SHL.SELFTEST.Hint",
    icon: "fa-solid fa-stethoscope",
    type: LensSelfTestMenu,
    restricted: true
  });
}

/** Opens the handout folder for the menu button. */
let openFolderMenu = () => {};

/** The menu button which opens the handout folder (the one window, not a second copy of it). */
class FolderMenu extends foundry.applications.api.ApplicationV2 {
  /** @override */
  async render() {
    await openFolderMenu();
    return this;
  }
}

/** The menu button which runs the self-test. Foundry only accepts application classes as menus. */
class LensSelfTestMenu extends foundry.applications.api.ApplicationV2 {
  /** @override */
  async render() {
    if ( game.user.isGM ) await runSelfTest();
    return this;
  }
}

/**
 * Switch the module strings when the user picks another module language, then redraw.
 * @param {string} value
 * @param {Function} redraw
 */
export function changeLanguage(value, redraw) {
  applyModuleLanguage(value).then(() => {
    const app = foundry.applications.instances.get("shl-folder");
    if ( isShown(app) ) app.render({window: {title: app.title}});
    redraw();
    if ( game.settings.sheet?.rendered ) game.settings.sheet.render();
  });
}
