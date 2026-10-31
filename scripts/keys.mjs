/**
 * Keys of the viewer. They act only on the viewer under the pointer (or with the focus) and run before Foundry's own
 * keys, so the arrow keys move the picture there and the map everywhere else.
 */

import {MODULE_ID} from "./config.mjs";
import {HandoutViewer} from "./viewer.mjs";

/** Pixels an arrow key moves the picture. */
const PAN_STEP = 80;

/** Keys that act once while held. */
const ONCE = new Set(["next", "previous", "lens", "reading", "fit"]);

/**
 * The keys, with their default bindings. "+" and "-" sit on other keys on German keyboards, so both layouts are
 * bound.
 * @type {Record<string, {keys: string[], run: (viewer: HandoutViewer) => boolean|void}>}
 */
const KEYS = {
  zoomIn: {keys: ["Equal", "BracketRight", "NumpadAdd"], run: v => v.runAction("zoomIn")},
  zoomOut: {keys: ["Minus", "Slash", "NumpadSubtract"], run: v => v.runAction("zoomOut")},
  fit: {keys: ["Digit0", "Numpad0"], run: v => v.runAction("fit")},
  next: {keys: ["ArrowRight", "PageDown"], run: (v, key) => {
    if ( v.handout.regions.length ) return v.next();
    if ( key.startsWith("Arrow") ) return v.pan(-PAN_STEP, 0);
    return false;
  }},
  previous: {keys: ["ArrowLeft", "PageUp"], run: (v, key) => {
    if ( v.handout.regions.length ) return v.previous();
    if ( key.startsWith("Arrow") ) return v.pan(PAN_STEP, 0);
    return false;
  }},
  panUp: {keys: ["ArrowUp"], run: v => v.pan(0, PAN_STEP)},
  panDown: {keys: ["ArrowDown"], run: v => v.pan(0, -PAN_STEP)},
  lens: {keys: ["KeyL"], run: v => v.toggleLens()},
  reading: {keys: ["KeyF"], run: v => v.toggleReading()}
};

/**
 * Register the keys. Called on "init".
 * @param {Function} openFolder
 */
export function registerKeys(openFolder) {
  const precedence = CONST.KEYBINDING_PRECEDENCE.PRIORITY;
  for ( const [action, {keys, run}] of Object.entries(KEYS) ) {
    game.keybindings.register(MODULE_ID, action, {
      name: `SHL.Keys.${action}`,
      editable: keys.map(key => ({key})),
      precedence,
      // Held keys repeat: without this, Foundry hands the repeats to its own keys, which move the map or a token
      repeat: true,
      onDown: context => {
        const viewer = HandoutViewer.active();
        if ( !viewer ) return false;
        // A held key acts once for switches and for paging through sections, zooming and moving keep going
        if ( context.repeat && ONCE.has(action) ) {
          const paging = (action === "next") || (action === "previous");
          if ( !paging || viewer.handout.regions.length ) return true;
        }
        return run(viewer, context.key ?? "") !== false;
      }
    });
  }
  game.keybindings.register(MODULE_ID, "openFolder", {
    name: "SHL.Keys.openFolder",
    editable: [],
    onDown: () => {
      openFolder();
      return true;
    }
  });
}
