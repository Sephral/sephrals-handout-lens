/**
 * The handout folder: every picture this user was shown or kept, newest first and pinned ones on top. A click opens
 * it again in the viewer.
 */

import {MODULE_ID, TEMPLATES, addSettingsGear, esc, isShown, openImage, setting, t} from "./config.mjs";
import {folderSorted, isVideoPath} from "./handout-data.mjs";
import {folderEntries, removeFromFolder, updateFolderEntry} from "./store.mjs";
import {countFeature} from "./usage.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

export class HandoutFolder extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "shl-folder",
    classes: ["shl-app", "shl-folder"],
    tag: "section",
    window: {title: "SHL.Folder.title", icon: "fa-solid fa-folder-open", resizable: true},
    position: {width: 640, height: 560},
    actions: {
      openEntry: HandoutFolder.#onOpen,
      pinEntry: HandoutFolder.#onPin,
      renameEntry: HandoutFolder.#onRename,
      removeEntry: HandoutFolder.#onRemove
    }
  };

  /** @override */
  static PARTS = {main: {template: `${TEMPLATES}/folder.hbs`, scrollable: [".shl-folder-grid"]}};

  /** The search text, kept across redraws. */
  #search = "";

  /** @override */
  get title() {
    return t("SHL.Folder.title");
  }

  /** @override */
  async _prepareContext() {
    const locale = game.i18n.lang;
    const entries = folderSorted(folderEntries()).map(entry => {
      const label = entry.title || t("SHL.Folder.untitled");
      return {
        ...entry,
        label,
        needle: `${label} ${entry.caption}`.toLowerCase(),
        video: isVideoPath(entry.src),
        date: entry.at ? new Date(entry.at).toLocaleString(locale, {dateStyle: "medium", timeStyle: "short"}) : ""
      };
    });
    return {
      entries,
      count: entries.length,
      search: this.#search,
      theme: setting("theme"),
      text: {
        search: t("SHL.Folder.search"),
        empty: t("SHL.Folder.empty"),
        count: entries.length === 1 ? t("SHL.Folder.countOne") : t("SHL.Folder.count", {count: entries.length}),
        pin: t("SHL.Folder.pin"),
        unpin: t("SHL.Folder.unpin"),
        rename: t("SHL.Folder.rename"),
        remove: t("SHL.Folder.remove"),
        open: t("SHL.Folder.open")
      }
    };
  }

  /** @override */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    addSettingsGear(frame);
    return frame;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.element.dataset.shlTheme = setting("theme");
    const input = this.element.querySelector("input[name=search]");
    input?.addEventListener("input", () => {
      this.#search = input.value;
      this.#filter();
    });
    this.#filter();
  }

  /** Hide the entries that do not match the search. */
  #filter() {
    const needle = this.#search.trim().toLowerCase();
    for ( const card of this.element.querySelectorAll(".shl-card") ) {
      card.hidden = !!needle && !card.dataset.search.includes(needle);
    }
  }

  /**
   * The entry of a clicked element.
   * @param {HTMLElement} target
   * @returns {object|undefined}
   */
  static #entry(target) {
    const id = target.closest("[data-entry-id]")?.dataset.entryId;
    return folderEntries().find(e => e.id === id);
  }

  /** @this {HandoutFolder} */
  static #onOpen(event, target) {
    const entry = HandoutFolder.#entry(target);
    if ( entry ) openImage({src: entry.src, title: entry.title, caption: entry.caption});
  }

  /** @this {HandoutFolder} */
  static async #onPin(event, target) {
    const entry = HandoutFolder.#entry(target);
    if ( entry ) await updateFolderEntry(entry.id, {pinned: !entry.pinned});
  }

  /** @this {HandoutFolder} */
  static async #onRename(event, target) {
    const entry = HandoutFolder.#entry(target);
    if ( !entry ) return;
    const name = await foundry.applications.api.DialogV2.prompt({
      window: {title: t("SHL.Folder.rename")},
      content: `<div class="form-group"><label>${esc(t("SHL.Folder.name"))}</label>
        <input type="text" name="name" value="${esc(entry.title)}" maxlength="200" autofocus></div>`,
      ok: {label: t("SHL.Folder.save"), callback: (event, button) => button.form.elements.name.value},
      rejectClose: false
    });
    if ( typeof name === "string" ) await updateFolderEntry(entry.id, {title: name});
  }

  /** @this {HandoutFolder} */
  static async #onRemove(event, target) {
    const entry = HandoutFolder.#entry(target);
    if ( entry ) await removeFromFolder(entry.id);
  }
}

/**
 * Open the handout folder of this user.
 * @returns {Promise<HandoutFolder>}
 */
export function openFolder() {
  const app = foundry.applications.instances.get("shl-folder") ?? new HandoutFolder();
  countFeature(MODULE_ID, "folder");
  if ( isShown(app) ) {
    app.bringToFront();
    return Promise.resolve(app);
  }
  return app.render({force: true});
}

/**
 * Redraw the folder when it is open.
 */
export function refreshFolder() {
  const app = foundry.applications.instances.get("shl-folder");
  if ( isShown(app) ) app.render();
}
