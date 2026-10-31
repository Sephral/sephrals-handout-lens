/**
 * Everything between the clients: the GM leads the view of the players live, shows a picture already zoomed to a
 * part, closes a picture for everyone, players who connect later get the picture the GM just showed, and every
 * picture a player is shown lands in their handout folder.
 */

import {MODULE_ID, SOCKET, keyOf, openImage, setting, t} from "./config.mjs";
import {cleanMessage, isVideoPath} from "./handout-data.mjs";
import {HandoutViewer} from "./viewer.mjs";
import {addToFolder, clearCurrentShown, currentShown, setCurrentShown} from "./store.mjs";
import {frameOf, resolutionNote} from "./view-math.mjs";
import {countFeature} from "./usage.mjs";

/** Views sent with a picture, waiting for its window to open: key -> {frame, region, at}. */
const pending = new Map();

/** How long a view waits for its picture, in milliseconds. */
const PENDING_MS = 20000;

/** Browser storage of the last picture this client received from the GM (to skip it when connecting again). */
const RECEIVED_STORE = `${MODULE_ID}.received`;

/** Pictures the GM was already warned about in this session. */
const warned = new Set();

/** Number of the last view this GM sent. It follows the clock, so it keeps growing after a reload. */
let sequence = 0;

/**
 * The number of the next view sent, so a late one never overtakes a newer one.
 * @returns {number}
 */
function nextSequence() {
  sequence = Math.max(sequence + 1, Date.now());
  return sequence;
}

/** Last sequence seen per image. */
const seen = new Map();

/**
 * Send a message to the other clients.
 * @param {object} message
 */
function send(message) {
  game.socket.emit(SOCKET, {...message, from: game.user.id});
}

/**
 * Connect the module to the socket and to the viewers. Called on "ready".
 */
export function registerSync() {
  game.socket.on(SOCKET, onMessage);
  game.socket.on("shareImage", onShareReceived);
  if ( game.user.isGM ) watchShares();
  // A leading GM who leaves (or reloads) can no longer end the lead: the players are free again
  Hooks.on("userConnected", (user, connected) => {
    if ( connected ) return;
    for ( const viewer of HandoutViewer.all() ) if ( viewer.followed && (viewer.leader === user.id) ) viewer.endFollowed();
  });

  HandoutViewer.on("attach", viewer => {
    const view = pending.get(viewer.key);
    if ( view && (Date.now() - view.at < PENDING_MS) ) viewer.receiveFrame(view.frame, view.region, false);
    pending.delete(viewer.key);
    // A GM who leads this picture right now sends the current view
    if ( !game.user.isGM ) send({type: "request", key: viewer.key});
  });
  HandoutViewer.on("view", (viewer, {remote}) => {
    if ( viewer.leading && !remote ) sendLeadingView(viewer);
  });
  HandoutViewer.on("lead", (viewer, {leading}) => {
    if ( leading ) sendLeadingView(viewer, true);
    else send({type: "followEnd", key: viewer.key});
  });
  HandoutViewer.on("close", viewer => {
    if ( viewer.leading ) send({type: "followEnd", key: viewer.key});
  });
}

/* -------------------------------------------- */
/*  Leading the players                         */
/* -------------------------------------------- */

/** Timers of the throttled sending per viewer. */
const throttle = new WeakMap();

/**
 * Send what a leading GM sees, at most ten times a second.
 * @param {HandoutViewer} viewer
 * @param {boolean} [now]
 */
function sendLeadingView(viewer, now=false) {
  const state = throttle.get(viewer) ?? {last: 0, timer: 0};
  throttle.set(viewer, state);
  const go = () => {
    state.last = Date.now();
    state.timer = 0;
    if ( !viewer.leading || viewer.disposed ) return;
    send({type: "view", key: viewer.key, frame: frameOf(viewer.view, viewer.stageSize), region: viewer.regionIndex,
      follow: true, seq: nextSequence()});
  };
  const wait = 100 - (Date.now() - state.last);
  if ( now || (wait <= 0) ) {
    clearTimeout(state.timer);
    return go();
  }
  if ( !state.timer ) state.timer = setTimeout(go, wait);
}

/**
 * Show the picture of a viewer to all players, zoomed to what the GM sees now.
 * @param {HandoutViewer} viewer
 */
export function shareView(viewer) {
  if ( !game.user.isGM || !viewer?.ready ) return;
  const app = viewer.app;
  const Journal = foundry.documents.collections.Journal;
  Journal.showImage(viewer.src, {title: app.options.window?.title ?? "", caption: app.options.caption,
    uuid: app.options.uuid ?? undefined, showTitle: app.options.showTitle});
  send({type: "view", key: viewer.key, frame: frameOf(viewer.view, viewer.stageSize), region: viewer.regionIndex,
    follow: false, seq: nextSequence()});
  countFeature(MODULE_ID, "shareView");
  ui.notifications.info(t("SHL.Share.view"));
}

/**
 * Close a picture for all players (the GM's own window stays open).
 * @param {string} src
 */
export async function closeForAll(src) {
  if ( !game.user.isGM ) return;
  const key = keyOf(src);
  send({type: "close", key});
  for ( const viewer of HandoutViewer.forKey(key) ) if ( viewer.leading ) viewer.toggleLeading(false);
  await clearCurrentShown(key);
  countFeature(MODULE_ID, "closeForAll");
  ui.notifications.info(t("SHL.Share.closed"));
}

/* -------------------------------------------- */
/*  Messages                                    */
/* -------------------------------------------- */

/**
 * A message of another client. Anyone may ask for the view of a leading GM, only GMs lead, show views or close
 * pictures.
 * @param {object} raw
 */
function onMessage(raw) {
  const message = cleanMessage(raw);
  if ( !message ) return;
  const key = message.key;
  if ( message.type === "request" ) {
    for ( const viewer of HandoutViewer.forKey(key) ) if ( viewer.leading ) sendLeadingView(viewer, true);
    return;
  }
  if ( !game.users.get(message.from)?.isGM ) return;
  switch ( message.type ) {
    case "close":
      for ( const app of foundry.applications.instances.values() ) {
        if ( (app instanceof foundry.applications.apps.ImagePopout) && (keyOf(app.options.src) === key) ) app.close();
      }
      pending.delete(key);
      return;
    case "followEnd":
      for ( const viewer of HandoutViewer.forKey(key) ) viewer.endFollowed();
      return;
    case "view": {
      if ( message.follow ) {
        const last = seen.get(`${message.from}:${key}`) ?? 0;
        if ( message.seq && (message.seq < last) ) return;
        seen.set(`${message.from}:${key}`, message.seq);
      }
      for ( const viewer of HandoutViewer.forKey(key) ) {
        if ( viewer.ready ) viewer.receiveFrame(message.frame, message.region, message.follow, message.from);
      }
      // A shown view comes with the picture, which Foundry opens in a new window even when one is open already
      if ( !message.follow ) pending.set(key, {frame: message.frame, region: message.region, at: Date.now()});
    }
  }
}

/* -------------------------------------------- */
/*  Pictures shown by the GM                    */
/* -------------------------------------------- */

/**
 * The title of a shown picture as Foundry would show it to this user.
 * @param {{title?: string, uuid?: string, showTitle?: boolean}} data
 * @returns {Promise<string>}
 */
async function visibleTitle({title, uuid, showTitle}) {
  if ( showTitle === false ) return "";
  if ( showTitle === true || !uuid ) return title ?? "";
  try {
    const doc = await foundry.utils.fromUuid(uuid);
    return (!doc || doc.testUserPermission(game.user, "LIMITED")) ? (title ?? "") : "";
  } catch {
    return "";
  }
}

/**
 * Foundry delivered a picture the GM shows: it goes into the handout folder.
 * @param {{image: string, title?: string, caption?: string, uuid?: string, showTitle?: boolean}} data
 */
async function onShareReceived(data) {
  if ( !data?.image ) return;
  try {
    globalThis.localStorage?.setItem(RECEIVED_STORE, JSON.stringify({key: keyOf(data.image), at: game.time.serverTime}));
  } catch {
    // Without storage the picture may open once more after a reload
  }
  if ( !setting("collectShared") ) return;
  await addToFolder({src: data.image, title: await visibleTitle(data), caption: data.caption});
}

/**
 * Notice every picture this GM shows, whichever module or button sends it: Foundry and other modules emit the core
 * event "shareImage", so the module listens to the socket's emit instead of one function.
 */
function watchShares() {
  const socket = game.socket;
  const emit = socket.emit;
  socket.emit = function(event, ...args) {
    if ( event === "shareImage" ) {
      try {
        onShareSent(args[0]);
      } catch(err) {
        console.error(`${MODULE_ID} | Could not note the shown picture`, err);
      }
    }
    return emit.call(this, event, ...args);
  };
}

/**
 * The GM shows a picture: remember it for players who connect later, and warn when it is too small to read.
 * @param {{image: string, title?: string, caption?: string, uuid?: string, showTitle?: boolean, users?: string[]}} data
 */
function onShareSent(data) {
  if ( !data?.image ) return;
  const key = keyOf(data.image);
  setCurrentShown({key, src: data.image, title: data.title ?? "", caption: data.caption ?? "", uuid: data.uuid ?? "",
    showTitle: data.showTitle, users: Array.isArray(data.users) ? data.users : [], at: game.time.serverTime});
  if ( !setting("resolutionHint") || warned.has(key) || isVideoPath(data.image) ) return;
  const probe = new Image();
  probe.onload = () => {
    const note = resolutionNote({w: probe.naturalWidth, h: probe.naturalHeight});
    if ( !note ) return;
    warned.add(key);
    ui.notifications.warn(t(`SHL.Share.${note}`, {w: probe.naturalWidth, h: probe.naturalHeight}));
  };
  probe.src = data.image;
}

/**
 * A player who connects shortly after the GM showed a picture gets it too, unless this browser already had it.
 */
export function openMissedPicture() {
  if ( game.user.isGM ) return;
  const shown = currentShown();
  const minutes = setting("lateJoinMinutes");
  // Times on the server's clock, so a player's wrong clock does not matter
  if ( !shown.src || !minutes || !(game.time.serverTime - (shown.at ?? 0) < minutes * 60000) ) return;
  if ( shown.users?.length && !shown.users.includes(game.user.id) ) return;
  try {
    const received = JSON.parse(globalThis.localStorage?.getItem(RECEIVED_STORE) ?? "null");
    if ( (received?.key === shown.key) && (received.at > shown.at - 5000) ) return;
  } catch {
    // Unknown: show it
  }
  const open = foundry.applications.instances;
  for ( const app of open.values() ) {
    if ( (app instanceof foundry.applications.apps.ImagePopout) && (keyOf(app.options.src) === shown.key) ) return;
  }
  onShareReceived({image: shown.src, title: shown.title, caption: shown.caption, uuid: shown.uuid || undefined,
    showTitle: shown.showTitle});
  openImage({src: shown.src, title: shown.title, caption: shown.caption, uuid: shown.uuid || undefined,
    showTitle: shown.showTitle});
}
