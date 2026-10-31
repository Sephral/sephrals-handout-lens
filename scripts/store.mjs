/**
 * Where the module keeps things: reading sections and transcripts in a world setting (written by a GM), the handout
 * folder in a user setting (written by its user), the image the GM showed last in a world setting, and the last view
 * of each image in this browser.
 */

import {MODULE_ID, canEdit, keyOf, setting, t} from "./config.mjs";
import {folderAdd, isEmptyHandout, normalizeEntry, normalizeHandout} from "./handout-data.mjs";

/** Browser storage of the last view per image. */
const VIEW_STORE = `${MODULE_ID}.views`;

/** Most images whose last view this browser remembers. */
const VIEW_LIMIT = 100;

/** Writes of a setting wait for the one before, so two quick changes cannot overwrite each other. */
let handoutWrite = Promise.resolve();
let folderWrite = Promise.resolve();

/* -------------------------------------------- */
/*  Reading sections and transcripts            */
/* -------------------------------------------- */

/**
 * The reading sections, transcript and speech language of an image.
 * @param {string} key   Image key (see keyOf)
 * @returns {{regions: object[], text: string, lang: string}}
 */
export function handoutFor(key) {
  return normalizeHandout(setting("handouts")?.[key]);
}

/**
 * Keep the data of an image. An image without sections, text or language is removed from the setting.
 * @param {string} key
 * @param {object} data
 * @returns {Promise<boolean>}
 */
export function saveHandout(key, data) {
  if ( !canEdit() ) return Promise.resolve(false);
  handoutWrite = handoutWrite.then(async () => {
    const all = foundry.utils.deepClone(setting("handouts") ?? {});
    const handout = normalizeHandout(data);
    if ( isEmptyHandout(handout) ) delete all[key];
    else all[key] = handout;
    await game.settings.set(MODULE_ID, "handouts", all);
    return true;
  }).catch(err => {
    console.error(`${MODULE_ID} | Could not save the handout`, err);
    ui.notifications.error(t("SHL.Edit.saveFailed"));
    return false;
  });
  return handoutWrite;
}

/**
 * The number of images with reading sections or a transcript.
 * @returns {number}
 */
export function handoutCount() {
  return Object.keys(setting("handouts") ?? {}).length;
}

/* -------------------------------------------- */
/*  Handout folder                              */
/* -------------------------------------------- */

/**
 * The entries of this user's handout folder.
 * @returns {object[]}
 */
export function folderEntries() {
  const list = setting("folder");
  return Array.isArray(list) ? list.map(normalizeEntry).filter(Boolean) : [];
}

/**
 * Change the folder of this user.
 * @param {(list: object[]) => object[]} change
 * @returns {Promise<void>}
 */
function writeFolder(change) {
  folderWrite = folderWrite.then(() => game.settings.set(MODULE_ID, "folder", change(folderEntries())))
    .catch(err => {
      console.error(`${MODULE_ID} | Could not change the handout folder`, err);
      ui.notifications.error(t("SHL.Folder.saveFailed"));
    });
  return folderWrite;
}

/**
 * Put an image into this user's folder, or move it to the top.
 * @param {{src: string, title?: string, caption?: string}} entry
 * @returns {Promise<void>}
 */
export function addToFolder(entry) {
  return writeFolder(list => folderAdd(list, entry, Date.now()));
}

/**
 * Remove an entry from the folder.
 * @param {string} id
 * @returns {Promise<void>}
 */
export function removeFromFolder(id) {
  return writeFolder(list => list.filter(e => e.id !== id));
}

/**
 * Remove an image from the folder by its path.
 * @param {string} src
 * @returns {Promise<void>}
 */
export function removeImageFromFolder(src) {
  const key = keyOf(src);
  return writeFolder(list => list.filter(e => keyOf(e.src) !== key));
}

/**
 * Change an entry of the folder (title, pin).
 * @param {string} id
 * @param {object} changes
 * @returns {Promise<void>}
 */
export function updateFolderEntry(id, changes) {
  return writeFolder(list => list.map(e => (e.id === id ? normalizeEntry({...e, ...changes}) ?? e : e)));
}

/**
 * Is an image in this user's folder?
 * @param {string} src
 * @returns {boolean}
 */
export function inFolder(src) {
  const key = keyOf(src);
  return folderEntries().some(e => keyOf(e.src) === key);
}

/* -------------------------------------------- */
/*  The image the GM showed last                */
/* -------------------------------------------- */

/**
 * The image the GM showed last, for players who connect later.
 * @returns {{key?: string, src?: string, title?: string, caption?: string, uuid?: string, showTitle?: boolean,
 *   users?: string[], at?: number}}
 */
export function currentShown() {
  return setting("current") ?? {};
}

/**
 * Remember the image the GM just showed.
 * @param {object} shown
 * @returns {Promise<void>}
 */
export async function setCurrentShown(shown) {
  if ( !game.user.isGM || !game.user.can("SETTINGS_MODIFY") ) return;
  try {
    await game.settings.set(MODULE_ID, "current", shown);
  } catch(err) {
    console.warn(`${MODULE_ID} | Could not remember the shown image`, err);
  }
}

/**
 * Forget the shown image, if it is the given one.
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function clearCurrentShown(key) {
  if ( currentShown().key !== key ) return;
  await setCurrentShown({});
}

/* -------------------------------------------- */
/*  Last view per image (this browser)          */
/* -------------------------------------------- */

/**
 * Read the views this browser remembers.
 * @returns {Record<string, object>}
 */
function readViews() {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(VIEW_STORE) ?? "{}");
    return (value && (typeof value === "object")) ? value : {};
  } catch {
    return {};
  }
}

/**
 * The last view of an image in this browser.
 * @param {string} key
 * @returns {object|null}
 */
export function rememberedView(key) {
  return readViews()[key] ?? null;
}

/**
 * Remember the view of an image in this browser; the oldest drop out beyond the limit.
 * @param {string} key
 * @param {object} value
 */
export function rememberView(key, value) {
  try {
    const all = readViews();
    all[key] = {...value, at: Date.now()};
    const keys = Object.keys(all).sort((a, b) => (all[b].at ?? 0) - (all[a].at ?? 0));
    for ( const old of keys.slice(VIEW_LIMIT) ) delete all[old];
    globalThis.localStorage?.setItem(VIEW_STORE, JSON.stringify(all));
  } catch {
    // Storage full or blocked: the view is simply not remembered
  }
}
