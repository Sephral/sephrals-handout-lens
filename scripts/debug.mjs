/**
 * Handout Lens' part of the debug file of Sephral's modules: whether the viewer runs or a conflicting module keeps it
 * off, the picture the GM showed last, how many pictures have reading sections and the open viewers. No images, no
 * transcripts: the stored handouts and the handout folder are counted, not copied.
 */

import {CONFLICTS, MODULE_ID, setting, t} from "./config.mjs";
import {registerDebugMenu, registerDebugProvider} from "./debug-file.mjs";
import {currentShown, folderEntries} from "./store.mjs";
import {HandoutViewer} from "./viewer.mjs";

/**
 * Run one part and keep its error instead, so one broken reading does not cost the rest.
 * @param {Function} fn
 * @returns {*}
 */
function attempt(fn) {
  try {
    return fn();
  } catch(err) {
    return {error: String(err?.message ?? err)};
  }
}

/**
 * What the lens knows right now.
 * @returns {object}
 */
export function describeState() {
  return {
    enabled: attempt(() => setting("enabled")),
    conflicts: CONFLICTS.map(id => ({id, active: !!game.modules.get(id)?.active})),
    shown: attempt(() => {
      const {key, src, title, showTitle, users, at} = currentShown();
      return {key: key ?? null, src: src ?? null, title: title ?? null, showTitle: showTitle ?? null,
        users: Array.isArray(users) ? users.length : null, at: at ?? null};
    }),
    handouts: attempt(() => {
      const all = Object.values(setting("handouts") ?? {});
      return {pictures: all.length, sections: all.reduce((n, h) => n + (h?.regions?.length ?? 0), 0),
        transcripts: all.filter(h => h?.text).length};
    }),
    folderEntries: attempt(() => folderEntries().length),
    viewers: attempt(() => HandoutViewer.all().map(v => ({
      src: v.src, video: v.isVideo, ready: v.ready, mode: v.mode, sections: v.handout?.regions?.length ?? 0,
      section: v.regionIndex, editing: v.editing, leading: v.leading, followed: v.followed, leader: v.leader,
      lens: v.lensOn
    })))
  };
}

/**
 * The button in the settings and the lens' part of the file. Call in "init".
 */
export function registerDebug() {
  registerDebugMenu(MODULE_ID, {name: "SHL.DEBUG.Title", label: "SHL.DEBUG.Save", hint: "SHL.DEBUG.Hint"});
  registerDebugProvider({
    moduleId: MODULE_ID,
    label: () => t("SHL.DEBUG.Entry"),
    notice: file => t("SHL.DEBUG.Saved", {file}),
    recent: () => ({details: describeState()}),
    // The stored transcripts and every user's folder are summed up above
    omitSettings: ["handouts", "folder"]
  });
}
