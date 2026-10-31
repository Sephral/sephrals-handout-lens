/**
 * The viewer inside Foundry's image window: zoom and pan with mouse, trackpad, touch and keys, the lens, reading aids,
 * the reading mode, reading sections and the toolbar. It takes the picture of the core window into a layer of its
 * own and puts it back when it is switched off.
 */

import {MODULE_ID, canEdit, esc, keyOf, openSettings, setting, t} from "./config.mjs";
import {MIN_REGION, REGION_LIMIT, hasTranscript, makeId, normalizeHandout} from "./handout-data.mjs";
import * as math from "./view-math.mjs";
import {closePanel, onPanelEvent, refreshPanel, renderPanel, stopSpeech} from "./panel.mjs";
import {addToFolder, handoutFor, inFolder, rememberView, rememberedView, removeImageFromFolder, saveHandout}
  from "./store.mjs";
import {countFeature, markUsed} from "./usage.mjs";

/** Open viewers by application id. */
const viewers = new Map();

/** The viewer under the pointer. */
let hovered = null;

/** Milliseconds until the toolbar fades when the pointer rests. */
const IDLE_MS = 2500;

/** Milliseconds of the animation to a section or a fitted view. */
const MOVE_MS = 320;

/** The default reading aids. */
const DEFAULT_AIDS = {contrast: 100, brightness: 100, gray: false, invert: false, pixel: false};

/** The resize handles of a selected frame and the sides they move (x: -1 left, 1 right; y: -1 top, 1 bottom). */
const HANDLES = {nw: {x: -1, y: -1}, n: {x: 0, y: -1}, ne: {x: 1, y: -1}, e: {x: 1, y: 0}, se: {x: 1, y: 1},
  s: {x: 0, y: 1}, sw: {x: -1, y: 1}, w: {x: -1, y: 0}};

/**
 * The size of a picture or video, once it is known.
 * @param {HTMLImageElement|HTMLVideoElement} media
 * @returns {Promise<{w: number, h: number}>}
 */
function mediaSize(media) {
  return new Promise((resolve, reject) => {
    const video = media.tagName === "VIDEO";
    const read = () => (video ? {w: media.videoWidth, h: media.videoHeight} : {w: media.naturalWidth, h: media.naturalHeight});
    const settle = () => {
      const size = read();
      if ( size.w > 0 && size.h > 0 ) resolve(size);
      else reject(new Error("The picture has no size"));
    };
    if ( video ? media.readyState >= 1 : media.complete ) {
      if ( read().w ) return settle();
      if ( !video ) return reject(new Error("The picture did not load"));
    }
    media.addEventListener(video ? "loadedmetadata" : "load", settle, {once: true});
    media.addEventListener("error", () => reject(new Error("The picture did not load")), {once: true});
  });
}

/**
 * A button of the toolbar.
 * @param {string} action
 * @param {string} icon
 * @param {string} label
 * @param {{active?: boolean, disabled?: boolean, text?: string, cls?: string}} [options]
 * @returns {string}
 */
function tool(action, icon, label, {active=false, disabled=false, text="", cls=""}={}) {
  const classes = ["shl-tool", cls, active ? "active" : ""].filter(Boolean).join(" ");
  const content = text ? `<span class="shl-tool-text">${esc(text)}</span>` : `<i class="${icon}" inert></i>`;
  return `<button type="button" class="${classes}" data-shl-action="${action}" data-tooltip="${esc(label)}"
    aria-label="${esc(label)}"${active ? " aria-pressed=\"true\"" : ""}${disabled ? " disabled" : ""}>${content}</button>`;
}

export class HandoutViewer {
  /**
   * Listeners of the sync part: "attach" (viewer ready), "view" (the view changed), "lead" (the GM starts or stops
   * leading) and "close".
   * @type {Record<string, Set<Function>>}
   */
  static #listeners = {attach: new Set(), view: new Set(), lead: new Set(), close: new Set()};

  /**
   * Listen to all viewers.
   * @param {"attach"|"view"|"lead"|"close"} event
   * @param {Function} fn   Called with the viewer and details
   */
  static on(event, fn) {
    HandoutViewer.#listeners[event].add(fn);
  }

  /**
   * Put a viewer into an image window, unless it already has one.
   * @param {ApplicationV2} app
   * @param {HTMLElement} element
   * @returns {Promise<HandoutViewer|null>}
   */
  static async attach(app, element) {
    const old = viewers.get(app.id);
    if ( old?.root?.isConnected ) return old;
    old?.dispose();
    const figure = element?.querySelector(".window-content figure") ?? element?.querySelector("figure");
    const media = figure?.querySelector(":scope > img, :scope > video");
    if ( !media || !app.options?.src ) return null;
    const viewer = new HandoutViewer(app, figure, media);
    viewers.set(app.id, viewer);
    try {
      viewer.img = await mediaSize(media);
    } catch(err) {
      console.warn(`${MODULE_ID} | The viewer leaves this picture to Foundry: ${err.message}`);
      viewer.dispose();
      return null;
    }
    if ( viewer.disposed ) return null;
    viewer.#build();
    return viewer;
  }

  /**
   * The viewer of an image window.
   * @param {ApplicationV2} app
   * @returns {HandoutViewer|undefined}
   */
  static of(app) {
    return viewers.get(app?.id);
  }

  /**
   * All open viewers.
   * @returns {HandoutViewer[]}
   */
  static all() {
    return [...viewers.values()];
  }

  /**
   * The open viewers of an image.
   * @param {string} key
   * @returns {HandoutViewer[]}
   */
  static forKey(key) {
    return HandoutViewer.all().filter(v => v.key === key);
  }

  /**
   * The viewer the keys go to: the one under the pointer, else the one that has the focus.
   * @returns {HandoutViewer|null}
   */
  static active() {
    if ( hovered && !hovered.disposed && hovered.ready ) return hovered;
    const focused = document.activeElement;
    return HandoutViewer.all().find(v => v.ready && v.root?.contains(focused)) ?? null;
  }

  /**
   * Redraw the parts of every viewer that depend on settings.
   */
  static redrawAll() {
    for ( const viewer of HandoutViewer.all() ) viewer.redraw();
  }

  /**
   * Redraw only the toolbars, for example when the handout folder changed.
   */
  static refreshToolbars() {
    for ( const viewer of HandoutViewer.all() ) viewer.refreshToolbar();
  }

  /**
   * The reading sections or transcripts changed in the world: viewers that are not being edited take them over.
   */
  static handoutsChanged() {
    for ( const viewer of HandoutViewer.all() ) {
      if ( viewer.editing || !viewer.ready ) continue;
      viewer.handout = handoutFor(viewer.key);
      if ( viewer.regionIndex >= viewer.handout.regions.length ) viewer.regionIndex = -1;
      viewer.redraw();
    }
  }

  /* -------------------------------------------- */

  /**
   * @param {ApplicationV2} app
   * @param {HTMLElement} figure
   * @param {HTMLImageElement|HTMLVideoElement} media
   */
  constructor(app, figure, media) {
    this.app = app;
    this.figure = figure;
    this.media = media;
    this.src = app.options.src;
    this.key = keyOf(this.src);
    this.isVideo = media.tagName === "VIDEO";
    this.img = {w: 0, h: 0};
    this.stageSize = {w: 0, h: 0};
    this.view = {s: 1, r: 0, tx: 0, ty: 0};
    this.mode = "fit";
    this.rot90 = 0;
    this.fine = 0;
    this.regionIndex = -1;
    this.aids = {...DEFAULT_AIDS};
    this.handout = handoutFor(this.key);
    this.lensOn = false;
    this.lensZoom = setting("lensZoom");
    this.panelMode = null;
    this.editing = false;
    this.drawing = null;
    this.selected = null;
    this.leading = false;
    this.followed = false;
    this.detached = false;
    this.leader = null;
    this.lastFrame = null;
    this.ready = false;
    this.disposed = false;
    this.counted = new Set();
  }

  /** Private state of the interaction. */
  #abort = new AbortController();
  #resize = null;
  #pointers = new Map();
  #drag = null;
  #pinch = null;
  #band = null;
  #edit = null;
  #lastTap = null;
  #pointer = null;
  #shift = false;
  #animation = 0;
  #animating = false;
  #idleTimer = 0;
  #rememberTimer = 0;
  #saveTimer = 0;
  #movingTimer = 0;
  #hintHidden = false;

  /** Is this viewer shown on the whole screen? */
  get isFullscreen() {
    return !!this.root && (this.root.ownerDocument.fullscreenElement === this.root);
  }

  /** The rotation the user chose: steps of 90 degrees plus the fine angle. */
  get userRotation() {
    return math.normalizeAngle(this.rot90 + this.fine);
  }

  /* -------------------------------------------- */
  /*  Building and removing                       */
  /* -------------------------------------------- */

  /** Build the viewer around the picture. */
  #build() {
    const signal = this.#abort.signal;
    const root = this.root = document.createElement("div");
    root.className = "shl-viewer";
    root.innerHTML = `<div class="shl-frame">
      <div class="shl-stage" tabindex="0" aria-label="${esc(t("SHL.Viewer.stage"))}">
        <div class="shl-layer"><div class="shl-regions"></div></div>
        <div class="shl-lens" hidden></div>
        <div class="shl-band" hidden></div>
        <svg class="shl-corners" hidden></svg>
        <div class="shl-hud"></div>
        <div class="shl-toolbar" role="toolbar" aria-label="${esc(t("SHL.Viewer.toolbar"))}"></div>
        <div class="shl-popover" hidden></div>
      </div>
      <aside class="shl-panel" hidden></aside></div>`;
    this.stage = root.querySelector(".shl-stage");
    this.layer = root.querySelector(".shl-layer");
    this.regionsEl = root.querySelector(".shl-regions");
    this.lensEl = root.querySelector(".shl-lens");
    this.bandEl = root.querySelector(".shl-band");
    this.cornersEl = root.querySelector(".shl-corners");
    this.hud = root.querySelector(".shl-hud");
    this.toolbar = root.querySelector(".shl-toolbar");
    this.popover = root.querySelector(".shl-popover");
    this.panel = root.querySelector(".shl-panel");

    this.figure.insertBefore(root, this.media);
    this.layer.prepend(this.media);
    this.media.draggable = false;
    this.media.classList.add("shl-media");
    this.layer.style.width = `${this.img.w}px`;
    this.layer.style.height = `${this.img.h}px`;
    this.figure.classList.add("shl-figure");
    this.app.element?.classList.add("shl-enhanced");

    const stage = this.stage;
    stage.addEventListener("pointerdown", e => this.#onPointerDown(e), {signal});
    stage.addEventListener("pointermove", e => this.#onPointerMove(e), {signal});
    stage.addEventListener("pointerup", e => this.#onPointerUp(e), {signal});
    stage.addEventListener("pointercancel", e => this.#onPointerUp(e), {signal});
    stage.addEventListener("pointerleave", () => this.#onPointerLeave(), {signal});
    stage.addEventListener("wheel", e => this.#onWheel(e), {signal, passive: false});
    stage.addEventListener("dblclick", e => this.#onDoubleClick(e), {signal});
    stage.addEventListener("contextmenu", e => e.preventDefault(), {signal});
    // The middle button pans instead of starting the browser's autoscroll
    stage.addEventListener("mousedown", e => {
      if ( e.button === 1 ) e.preventDefault();
    }, {signal});
    root.addEventListener("pointerenter", () => {
      hovered = this;
    }, {signal});
    root.addEventListener("pointerleave", () => {
      if ( hovered === this ) hovered = null;
    }, {signal});
    this.toolbar.addEventListener("click", e => this.#onToolbarClick(e), {signal});
    this.hud.addEventListener("click", e => this.#onHudClick(e), {signal});
    this.regionsEl.addEventListener("click", e => this.#onMarkerClick(e), {signal});
    this.popover.addEventListener("input", e => this.#onAidInput(e), {signal});
    this.popover.addEventListener("click", e => this.#onAidClick(e), {signal});
    for ( const type of ["click", "input", "change"] ) {
      this.panel.addEventListener(type, e => onPanelEvent(this, e), {signal});
    }
    window.addEventListener("keydown", e => this.#onShiftKey(e, true), {signal});
    window.addEventListener("keyup", e => this.#onShiftKey(e, false), {signal});
    window.addEventListener("blur", () => this.#setShift(false), {signal});
    // Esc stops drawing a section and leaves the reading mode that fills the browser window (real full screen ends on
    // Esc by itself), before Foundry closes windows with it. While corners are placed, Enter closes the frame and
    // Backspace takes the last corner back.
    window.addEventListener("keydown", e => {
      if ( this.drawing?.points.length && this.#onCornerKey(e) ) return;
      if ( e.key !== "Escape" ) return;
      const maximized = this.root.classList.contains("shl-maximized");
      if ( !this.drawing && !maximized ) return;
      e.stopPropagation();
      e.preventDefault();
      if ( this.drawing ) return this.cancelDrawing();
      this.#setMaximized(false);
    }, {signal, capture: true});
    // The event bubbles from the full screen element, so this also works in a window detached from Foundry (v14)
    root.addEventListener("fullscreenchange", () => this.#renderToolbar(), {signal});

    this.#resize = new ResizeObserver(() => this.#onResize());
    this.#resize.observe(stage);
    this.redraw();
  }

  /**
   * Take the viewer out. The picture goes back to where Foundry put it, unless the window is gone anyway.
   */
  dispose() {
    if ( this.disposed ) return;
    this.disposed = true;
    this.#emit("close");
    if ( this.editing ) this.#flushSave();
    stopSpeech(this);
    this.#abort.abort();
    this.#resize?.disconnect();
    cancelAnimationFrame(this.#animation);
    for ( const timer of [this.#idleTimer, this.#rememberTimer, this.#saveTimer, this.#movingTimer] ) clearTimeout(timer);
    if ( this.isFullscreen ) this.root.ownerDocument.exitFullscreen().catch(() => {});
    this.app.element?.classList.remove("shl-max-host");
    if ( hovered === this ) hovered = null;
    if ( viewers.get(this.app.id) === this ) viewers.delete(this.app.id);
    if ( this.root?.isConnected ) {
      this.media.classList.remove("shl-media");
      this.media.style.filter = "";
      this.figure.insertBefore(this.media, this.root);
      this.root.remove();
      this.figure.classList.remove("shl-figure");
      this.app.element?.classList.remove("shl-enhanced");
    }
  }

  /**
   * Call the listeners of an event.
   * @param {string} event
   * @param {object} [details]
   */
  #emit(event, details={}) {
    for ( const fn of HandoutViewer.#listeners[event] ) {
      try {
        fn(this, details);
      } catch(err) {
        console.error(`${MODULE_ID} | A viewer listener failed`, err);
      }
    }
  }

  /**
   * Count the use of a feature once per viewer.
   * @param {string} feature
   */
  count(feature) {
    if ( this.counted.has(feature) ) return;
    this.counted.add(feature);
    countFeature(MODULE_ID, feature);
  }

  /* -------------------------------------------- */
  /*  Size and first view                         */
  /* -------------------------------------------- */

  /** The stage changed its size: keep what the user was looking at. */
  #onResize() {
    const w = this.stage.clientWidth;
    const h = this.stage.clientHeight;
    if ( (w < 8) || (h < 8) ) return;
    const old = this.stageSize;
    this.stageSize = {w, h};
    if ( !this.ready ) return this.#initView();
    if ( (old.w === w) && (old.h === h) ) return;
    this.setView(this.#viewForMode(old), {mode: this.mode, save: false});
  }

  /**
   * The view that matches the current mode on the new stage.
   * @param {{w: number, h: number}} old   The stage size before
   * @returns {object}
   */
  #viewForMode(old) {
    const region = this.handout.regions[this.regionIndex];
    if ( this.mode === "fit" ) return math.fitView(this.img, this.stageSize, this.userRotation);
    if ( this.mode === "width" ) return math.fitView(this.img, this.stageSize, this.userRotation, "width");
    if ( (this.mode === "region") && region ) return math.regionView(this.img, this.stageSize, region);
    if ( (this.mode === "follow") && this.lastFrame ) return math.viewFromFrame(this.lastFrame.frame, this.stageSize);
    const c = math.centerOf(this.view, old);
    return math.viewFrom({s: this.view.s, r: this.view.r, c}, this.stageSize);
  }

  /** The first view: what this browser remembers of the image, else the whole picture. */
  #initView() {
    this.ready = true;
    // The sections may have changed while the picture loaded
    this.handout = handoutFor(this.key);
    const memory = setting("rememberView") ? rememberedView(this.key) : null;
    if ( memory ) {
      this.rot90 = Math.round((Number(memory.rot90) || 0) / 90) * 90;
      this.fine = Math.min(Math.max(Number(memory.fine) || 0, -45), 45);
      this.aids = {...DEFAULT_AIDS, ...(memory.aids ?? {})};
    }
    this.#applyAids();
    const region = this.handout.regions[memory?.region ?? -1];
    if ( memory?.mode === "region" && region ) {
      this.regionIndex = memory.region;
      this.setView(math.regionView(this.img, this.stageSize, region), {mode: "region", save: false});
    }
    else if ( (memory?.mode === "free") && memory.frame ) {
      this.setView(math.viewFromFrame(memory.frame, this.stageSize), {mode: "free", save: false});
    }
    else {
      const mode = memory?.mode === "width" ? "width" : "fit";
      this.setView(math.fitView(this.img, this.stageSize, this.userRotation, mode === "width" ? "width" : "contain"),
        {mode, save: false});
    }
    this.redraw();
    markUsed(MODULE_ID);
    this.#emit("attach");
  }

  /* -------------------------------------------- */
  /*  Views                                       */
  /* -------------------------------------------- */

  /**
   * Show a view, within the limits.
   * @param {object} view
   * @param {object} [options]
   * @param {string} [options.mode="free"]   fit, width, region, follow or free
   * @param {number} [options.animate=0]     Milliseconds of animation
   * @param {boolean} [options.user=false]   The user moved the view (ends following the GM)
   * @param {boolean} [options.remote=false] The view came from another client (not sent on)
   * @param {boolean} [options.save=true]    Remember the view in this browser
   */
  setView(view, {mode="free", animate=0, user=false, remote=false, save=true}={}) {
    if ( !this.ready ) return;
    if ( user ) this.#onUserMove();
    const center = {x: this.stageSize.w / 2, y: this.stageSize.h / 2};
    const limits = math.scaleLimits(this.img, this.stageSize, setting("maxZoom"));
    const target = math.clampView(math.clampScale(view, limits, center), this.img, this.stageSize);
    cancelAnimationFrame(this.#animation);
    this.#animating = false;
    this.mode = mode;
    const finish = () => {
      this.#animating = false;
      this.#apply(target);
      if ( save ) this.#scheduleRemember();
      this.#emit("view", {user, remote});
    };
    if ( !animate || math.sameView(this.view, target) ) return finish();
    const from = this.view;
    const start = performance.now();
    const step = now => {
      const k = Math.min((now - start) / animate, 1);
      if ( k >= 1 ) return finish();
      this.#apply(math.interpolate(from, target, math.ease(k), this.stageSize));
      this.#animation = requestAnimationFrame(step);
    };
    this.#animating = true;
    this.#animation = requestAnimationFrame(step);
  }

  /**
   * Stop a running animation where it is. The view it stopped at counts as the user's: it is remembered and a
   * leading GM sends it.
   */
  #stopAnimation() {
    cancelAnimationFrame(this.#animation);
    if ( !this.#animating ) return;
    this.#animating = false;
    this.mode = "free";
    this.#onUserMove();
    this.#scheduleRemember();
    this.#emit("view", {user: true, remote: false});
  }

  /**
   * Put a view on the screen.
   * @param {object} view
   */
  #apply(view) {
    this.view = view;
    this.layer.style.transform = `translate(${view.tx}px, ${view.ty}px) rotate(${view.r}deg) scale(${view.s})`;
    this.root.style.setProperty("--shl-scale", String(view.s));
    this.root.classList.add("shl-moving");
    clearTimeout(this.#movingTimer);
    this.#movingTimer = setTimeout(() => this.root?.classList.remove("shl-moving"), 250);
    const label = this.toolbar.querySelector("[data-shl-action=actual] .shl-tool-text");
    if ( label ) label.textContent = `${Math.round(view.s * 100)} %`;
    if ( this.#lensVisible() ) this.#placeLens();
    if ( this.drawing?.points.length ) this.#renderCorners();
  }

  /** Remember the view of this image in the browser, a moment after it stops changing. */
  #scheduleRemember() {
    if ( !setting("rememberView") ) return;
    clearTimeout(this.#rememberTimer);
    this.#rememberTimer = setTimeout(() => {
      if ( this.disposed || !this.ready ) return;
      rememberView(this.key, {mode: this.mode === "follow" ? "free" : this.mode, region: this.regionIndex,
        frame: math.frameOf(this.view, this.stageSize), rot90: this.rot90, fine: this.fine, aids: this.aids});
    }, 800);
  }

  /** The user moved the view: a player stops following the GM until they choose to follow again. */
  #onUserMove() {
    if ( this.followed && !this.detached ) {
      this.detached = true;
      this.#renderHud();
    }
  }

  /**
   * Zoom by a factor around a stage point (the middle when none is given).
   * @param {number} factor
   * @param {{x: number, y: number}} [q]
   * @param {number} [animate=0]
   */
  zoomBy(factor, q, animate=0) {
    q ??= {x: this.stageSize.w / 2, y: this.stageSize.h / 2};
    this.setView(math.zoomAt(this.view, q, factor), {user: true, animate});
  }

  /**
   * Show the whole picture, or its full width.
   * @param {"contain"|"width"} [how="contain"]
   */
  fit(how="contain") {
    this.regionIndex = -1;
    this.setView(math.fitView(this.img, this.stageSize, this.userRotation, how),
      {mode: how === "width" ? "width" : "fit", user: true, animate: MOVE_MS});
    this.#afterNavigation();
  }

  /** Show the picture in its own pixels (1:1), around the middle of the stage. */
  actualSize() {
    this.zoomBy(1 / this.view.s, undefined, MOVE_MS);
  }

  /**
   * Turn the picture in steps of 90 degrees.
   * @param {number} steps
   */
  rotateBy(steps) {
    this.rot90 = math.normalizeAngle(this.rot90 + (steps * 90));
    this.#turnTo(this.userRotation);
  }

  /**
   * Set the fine angle (-45 to 45 degrees).
   * @param {number} deg
   */
  setFine(deg) {
    this.fine = Math.min(Math.max(Number(deg) || 0, -45), 45);
    this.#turnTo(this.userRotation, 0);
  }

  /**
   * Turn the view to an angle around the middle of the stage.
   * @param {number} deg
   * @param {number} [animate]
   */
  #turnTo(deg, animate=MOVE_MS / 2) {
    const center = {x: this.stageSize.w / 2, y: this.stageSize.h / 2};
    if ( this.mode === "fit" || this.mode === "width" ) {
      return this.setView(math.fitView(this.img, this.stageSize, deg, this.mode === "width" ? "width" : "contain"),
        {mode: this.mode, user: true, animate});
    }
    this.setView(math.rotateAt(this.view, center, math.normalizeAngle(deg - this.view.r)), {user: true, animate});
  }

  /**
   * Move the view by some pixels.
   * @param {number} dx
   * @param {number} dy
   */
  pan(dx, dy) {
    this.setView({...this.view, tx: this.view.tx + dx, ty: this.view.ty + dy}, {user: true, animate: 120});
  }

  /* -------------------------------------------- */
  /*  Reading sections                            */
  /* -------------------------------------------- */

  /**
   * Show a reading section, straight and as large as the stage allows; -1 shows the whole picture.
   * @param {number} index
   * @param {{animate?: number, user?: boolean}} [options]
   */
  goTo(index, {animate=MOVE_MS, user=true}={}) {
    const region = this.handout.regions[index];
    if ( !region ) {
      this.regionIndex = -1;
      this.setView(math.fitView(this.img, this.stageSize, this.userRotation), {mode: "fit", user, animate});
    }
    else {
      this.regionIndex = index;
      this.setView(math.regionView(this.img, this.stageSize, region), {mode: "region", user, animate});
    }
    this.#afterNavigation();
  }

  /** The next reading section. */
  next() {
    const count = this.handout.regions.length;
    if ( count ) this.goTo(Math.min(this.regionIndex + 1, count - 1));
  }

  /** The previous reading section, then the whole picture. */
  previous() {
    if ( this.handout.regions.length ) this.goTo(Math.max(this.regionIndex - 1, -1));
  }

  /** Update what shows the current section. */
  #afterNavigation() {
    this.#renderToolbar();
    this.#renderRegions();
    refreshPanel(this);
  }

  /**
   * Draw a new reading section, or draw an existing one again.
   * @param {string} target   "new" or the id of a section
   */
  startDrawing(target="new") {
    if ( !this.editing ) return;
    if ( (target === "new") && (this.handout.regions.length >= REGION_LIMIT) ) {
      return ui.notifications.warn(t("SHL.Edit.limit", {count: REGION_LIMIT}));
    }
    this.drawing = {target, points: []};
    this.stage.classList.add("shl-drawing");
    this.#renderRegions();
    this.#renderHud();
  }

  /** Stop drawing without a change. */
  cancelDrawing() {
    this.drawing = null;
    this.#band = null;
    this.bandEl.hidden = true;
    if ( this.cornersEl ) {
      this.cornersEl.hidden = true;
      this.cornersEl.innerHTML = "";
    }
    this.stage.classList.remove("shl-drawing");
    this.#renderRegions();
    this.#renderHud();
  }

  /**
   * A rectangle was drawn on the stage: make it a reading section.
   * @param {{x0: number, y0: number, x1: number, y1: number}} rect
   */
  #finishDrawing(rect) {
    const target = this.drawing?.target;
    this.cancelDrawing();
    if ( (Math.abs(rect.x1 - rect.x0) < 8) || (Math.abs(rect.y1 - rect.y0) < 8) ) return;
    this.#placeSection(math.regionFromRect(this.view, rect, this.img), target);
  }

  /**
   * A corner of a note was clicked. A click on the first corner closes the frame, the fourth corner closes it too.
   * @param {{x: number, y: number}} q   Stage point
   */
  #addCorner(q) {
    const points = this.drawing?.points;
    if ( !points ) return;
    const distance = p => {
      const s = math.toScreen(this.view, p);
      return Math.hypot(s.x - q.x, s.y - q.y);
    };
    if ( (points.length >= 3) && (distance(points[0]) < 12) ) return this.#finishCorners();
    // The second click of a double click lands on the same spot
    if ( points.length && (distance(points.at(-1)) < 4) ) return;
    points.push(math.toImage(this.view, q));
    if ( points.length >= 4 ) return this.#finishCorners();
    this.#renderCorners();
    this.#renderHud();
  }

  /** Take the last corner back. */
  #removeCorner() {
    const points = this.drawing?.points;
    if ( !points?.length ) return;
    points.pop();
    this.#renderCorners();
    this.#renderHud();
  }

  /** Make the clicked corners a reading section: the frame takes the slant of the note. */
  #finishCorners() {
    const {points, target} = this.drawing ?? {};
    if ( !points || (points.length < 3) ) return;
    const geometry = math.regionFromCorners(points, this.img, this.view.r);
    this.cancelDrawing();
    if ( geometry ) this.#placeSection(geometry, target);
  }

  /**
   * Keys while corners are placed: Enter closes the frame, Backspace takes the last corner back.
   * @param {KeyboardEvent} event
   * @returns {boolean}   Whether the key was used
   */
  #onCornerKey(event) {
    if ( event.target.closest?.("input, textarea, select, [contenteditable]") ) return false;
    if ( (event.key === "Enter") && (this.drawing.points.length >= 3) ) this.#finishCorners();
    else if ( event.key === "Backspace" ) this.#removeCorner();
    else return false;
    event.stopPropagation();
    event.preventDefault();
    return true;
  }

  /**
   * Put a drawn frame into the handout, as a new section or as the new place of one drawn again, and select it.
   * @param {{cx: number, cy: number, w: number, h: number, angle: number}} geometry
   * @param {string} target   "new" or the id of a section
   */
  #placeSection(geometry, target) {
    // Saving drops sections below this size, so they are refused right here
    if ( (geometry.w < MIN_REGION) || (geometry.h < MIN_REGION) ) return ui.notifications.warn(t("SHL.Edit.tooSmall"));
    let region = this.handout.regions.find(r => r.id === target);
    if ( region ) Object.assign(region, geometry);
    else {
      region = {id: makeId(), title: "", text: "", ...geometry};
      this.handout.regions.push(region);
    }
    this.selected = region.id;
    this.changed();
  }

  /**
   * Select a reading section for editing in the picture: its frame gets handles to move, resize and turn it.
   * @param {string|null} id
   */
  select(id) {
    if ( this.selected === id ) return;
    this.selected = id;
    this.#renderRegions();
    for ( const item of this.panel?.querySelectorAll("li[data-id]") ?? [] ) {
      const on = item.dataset.id === id;
      item.classList.toggle("selected", on);
      if ( on ) item.scrollIntoView({block: "nearest", behavior: "smooth"});
    }
  }

  /**
   * Show the angle of a section in its slider while its frame is turned in the picture.
   * @param {object} region
   */
  #syncAngleInputs(region) {
    const item = this.panel?.querySelector(`li[data-id="${region.id}"]`);
    for ( const input of item?.querySelectorAll("[name=angle], [name=angleNumber]") ?? [] ) input.value = String(region.angle);
  }

  /**
   * The GM changed the handout: show it and save it a moment later.
   * @param {{list?: boolean}} [options]   list: the list of sections changed, so the panel is drawn again
   */
  changed({list=true}={}) {
    this.#renderRegions();
    this.#renderToolbar();
    if ( list ) renderPanel(this);
    clearTimeout(this.#saveTimer);
    this.root.dataset.saving = "pending";
    this.#saveTimer = setTimeout(() => this.#flushSave(), 600);
  }

  /** Save the handout now. */
  #flushSave() {
    clearTimeout(this.#saveTimer);
    if ( this.root?.dataset.saving !== "pending" ) return;
    this.root.dataset.saving = "saving";
    saveHandout(this.key, this.handout).then(ok => {
      if ( !this.root ) return;
      this.root.dataset.saving = ok ? "saved" : "failed";
      if ( ok ) this.count("regionsSaved");
    });
  }

  /**
   * Switch the editing of reading sections and transcripts (GM).
   * @param {boolean} [force]
   */
  toggleEdit(force) {
    if ( !canEdit() ) return;
    const editing = force ?? !this.editing;
    if ( editing === this.editing ) return;
    if ( !editing ) {
      this.#flushSave();
      this.cancelDrawing();
      this.editing = false;
      this.selected = null;
      // The edited data stays until the saved setting comes back (handoutsChanged)
      this.handout = normalizeHandout(this.handout);
      if ( this.regionIndex >= this.handout.regions.length ) this.regionIndex = -1;
      closePanel(this);
    }
    else {
      this.editing = true;
      // While the last save is on its way, the setting is older than what this viewer holds
      if ( this.root.dataset.saving !== "saving" ) this.handout = handoutFor(this.key);
      this.panelMode = "edit";
      renderPanel(this);
    }
    this.redraw();
  }

  /* -------------------------------------------- */
  /*  Following the GM                            */
  /* -------------------------------------------- */

  /**
   * Show what another client sent: a frame of the picture and the section it belongs to.
   * @param {{cx: number, cy: number, iw: number, ih: number, r: number}} frame
   * @param {number} region
   * @param {boolean} follow   The GM leads live (else it is a single view shared with the picture)
   * @param {string} [leader]  The id of the leading GM
   */
  receiveFrame(frame, region, follow, leader) {
    if ( !this.ready ) return;
    const before = `${this.regionIndex}|${this.followed}|${this.detached}`;
    if ( follow ) {
      this.followed = true;
      this.leader = leader ?? this.leader;
      this.lastFrame = {frame, region};
      if ( this.detached ) {
        if ( before !== `${this.regionIndex}|${this.followed}|${this.detached}` ) this.#renderHud();
        return;
      }
    }
    this.regionIndex = this.handout.regions[region] ? region : -1;
    this.setView(math.viewFromFrame(frame, this.stageSize), {mode: follow ? "follow" : "free", animate: follow ? 160 : MOVE_MS,
      remote: true});
    // A leading GM sends about ten views a second: the toolbar and the notes are only drawn again when they change,
    // so a click on them is not lost
    if ( !follow || (before !== `${this.regionIndex}|${this.followed}|${this.detached}`) ) {
      this.#afterNavigation();
      this.#renderHud();
    }
  }

  /** The GM stopped leading. */
  endFollowed() {
    this.leader = null;
    this.followed = false;
    this.detached = false;
    this.lastFrame = null;
    if ( this.mode === "follow" ) this.mode = "free";
    this.#renderHud();
  }

  /** Follow the GM again after looking around alone. */
  rejoin() {
    this.detached = false;
    if ( this.lastFrame ) this.receiveFrame(this.lastFrame.frame, this.lastFrame.region, true, this.leader);
    else this.#renderHud();
  }

  /**
   * The GM starts or stops leading every player who has this picture open.
   * @param {boolean} [force]
   */
  toggleLeading(force) {
    if ( !game.user.isGM ) return;
    const leading = force ?? !this.leading;
    if ( leading === this.leading ) return;
    this.leading = leading;
    if ( leading ) this.count("followView");
    this.#emit("lead", {leading});
    this.#renderToolbar();
    this.#renderHud();
  }

  /* -------------------------------------------- */
  /*  Drawing the parts                           */
  /* -------------------------------------------- */

  /** Redraw everything that depends on settings and state. */
  redraw() {
    if ( !this.root ) return;
    this.root.dataset.shlTheme = setting("theme");
    this.root.classList.toggle("shl-always", setting("toolbar") === "always");
    this.root.classList.toggle("shl-editing", this.editing);
    this.root.classList.toggle("shl-markers", setting("showMarkers") || this.editing);
    this.root.classList.toggle("shl-video", this.isVideo);
    this.#renderToolbar();
    this.#renderRegions();
    this.#renderHud();
    if ( this.panelMode ) renderPanel(this);
    this.#showToolbar();
  }

  /** Redraw the toolbar. */
  refreshToolbar() {
    this.#renderToolbar();
  }

  /** The toolbar for the current state. */
  #renderToolbar() {
    if ( !this.toolbar ) return;
    const regions = this.handout.regions;
    const index = this.regionIndex;
    const groups = [];
    groups.push([
      tool("zoomOut", "fa-solid fa-magnifying-glass-minus", t("SHL.Tool.zoomOut")),
      tool("actual", "", t("SHL.Tool.actual"), {text: `${Math.round(this.view.s * 100)} %`, cls: "shl-zoom"}),
      tool("zoomIn", "fa-solid fa-magnifying-glass-plus", t("SHL.Tool.zoomIn")),
      tool("fit", "fa-solid fa-expand", t("SHL.Tool.fit"), {active: this.mode === "fit"}),
      tool("fitWidth", "fa-solid fa-arrows-left-right-to-line", t("SHL.Tool.fitWidth"), {active: this.mode === "width"})
    ].join(""));
    groups.push([
      tool("rotateLeft", "fa-solid fa-rotate-left", t("SHL.Tool.rotateLeft")),
      tool("rotateRight", "fa-solid fa-rotate-right", t("SHL.Tool.rotateRight")),
      tool("aids", "fa-solid fa-sliders", t("SHL.Tool.aids"), {active: !this.popover.hidden}),
      tool("lens", "fa-solid fa-magnifying-glass", t("SHL.Tool.lens"), {active: this.lensOn, disabled: this.isVideo}),
      tool("reading", this.isFullscreen || this.root.classList.contains("shl-maximized")
        ? "fa-solid fa-down-left-and-up-right-to-center" : "fa-solid fa-up-right-and-down-left-from-center",
      t("SHL.Tool.reading"), {active: this.isFullscreen || this.root.classList.contains("shl-maximized")})
    ].join(""));
    if ( regions.length ) {
      const region = regions[index];
      const label = region ? `${index + 1} / ${regions.length}${region.title ? ` · ${region.title}` : ""}` : t("SHL.Nav.overview");
      groups.push([
        tool("previous", "fa-solid fa-chevron-left", t("SHL.Tool.previous"), {disabled: index < 0}),
        tool("overview", "", region ? t("SHL.Tool.overview") : t("SHL.Nav.count", {count: regions.length}),
          {text: label, cls: "shl-nav"}),
        tool("next", "fa-solid fa-chevron-right", t("SHL.Tool.next"), {disabled: index >= regions.length - 1})
      ].join(""));
    }
    const extra = [];
    if ( hasTranscript(this.handout) || this.editing ) {
      extra.push(tool("text", "fa-solid fa-align-left", t("SHL.Tool.text"), {active: this.panelMode === "read"}));
    }
    const kept = inFolder(this.src);
    extra.push(tool("folder", kept ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark",
      kept ? t("SHL.Tool.unkeep") : t("SHL.Tool.keep"), {active: kept}));
    if ( game.user.isGM ) {
      extra.push(tool("lead", "fa-solid fa-tower-broadcast", t("SHL.Tool.lead"), {active: this.leading}));
      if ( canEdit() ) extra.push(tool("edit", "fa-solid fa-pen-to-square", t("SHL.Tool.edit"), {active: this.editing}));
    }
    extra.push(tool("settings", "fa-solid fa-gear", t("SHL.gear")));
    groups.push(extra.join(""));
    this.toolbar.innerHTML = groups.map(g => `<div class="shl-group">${g}</div>`).join("");
  }

  /** The outlines and numbers of the reading sections, in the coordinates of the picture. */
  #renderRegions() {
    if ( !this.regionsEl ) return;
    this.regionsEl.innerHTML = this.handout.regions.map((region, i) => {
      const box = math.regionBox(region, this.img);
      const active = i === this.regionIndex ? " active" : "";
      const selected = this.editing && !this.drawing && (region.id === this.selected);
      const title = region.title || t("SHL.Nav.section", {number: i + 1});
      // The selected frame gets handles: eight to resize and a round one above the top edge to turn it
      const handles = selected ? `<span class="shl-turn-line"></span>${Object.keys(HANDLES).map(h =>
        `<span class="shl-handle shl-handle-${h}" data-handle="${h}"></span>`).join("")}
        <span class="shl-handle shl-handle-turn" data-handle="turn" data-tooltip="${esc(t("SHL.Edit.turnHandle"))}"></span>`
        : "";
      return `<div class="shl-region${active}${selected ? " selected" : ""}" data-index="${i}" style="left: ${box.left}px;
        top: ${box.top}px; width: ${box.width}px; height: ${box.height}px; transform: rotate(${box.angle}deg);">
        <button type="button" class="shl-marker" data-index="${i}" data-tooltip="${esc(title)}"
          aria-label="${esc(title)}">${i + 1}</button>${handles}</div>`;
    }).join("");
  }

  /** The corners clicked so far, the edge to the pointer and the closing edge, on the stage. */
  #renderCorners() {
    const el = this.cornersEl;
    const points = this.drawing?.points ?? [];
    if ( !el ) return;
    if ( !points.length ) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    const screen = points.map(p => math.toScreen(this.view, p));
    const pointer = this.#pointer;
    const line = [...screen, ...(pointer ? [pointer] : [])].map(p => `${p.x},${p.y}`).join(" ");
    const closable = points.length >= 3;
    const first = screen[0];
    el.hidden = false;
    el.innerHTML = `<polyline points="${line}"/>${(closable && pointer) ? `<line class="shl-close" x1="${pointer.x}"
      y1="${pointer.y}" x2="${first.x}" y2="${first.y}"/>` : ""}${screen.map((p, i) => `<circle cx="${p.x}" cy="${p.y}"
      r="${(i === 0) && closable ? 8 : 5}"${i === 0 ? " class=\"shl-first\"" : ""}/>`).join("")}`;
  }

  /** The notes over the picture: following the GM, leading, drawing, a picture too small to read. */
  #renderHud() {
    if ( !this.hud ) return;
    const chips = [];
    if ( this.drawing ) {
      const count = this.drawing.points.length;
      const text = count ? t("SHL.Hud.corners", {count}) : t("SHL.Hud.draw");
      const finish = count >= 3 ? `<button type="button" data-shl-hud="finishDraw">${esc(t("SHL.Hud.finish"))}</button>` : "";
      chips.push(`<div class="shl-chip shl-chip-draw"><i class="fa-solid fa-draw-polygon" inert></i>
        <span>${esc(text)}</span>${finish}
        <button type="button" data-shl-hud="cancelDraw">${esc(t("SHL.Hud.cancel"))}</button></div>`);
    }
    if ( this.leading ) {
      chips.push(`<div class="shl-chip shl-chip-lead"><i class="fa-solid fa-tower-broadcast" inert></i>
        <span>${esc(t("SHL.Hud.leading"))}</span>
        <button type="button" data-shl-hud="stopLead">${esc(t("SHL.Hud.stop"))}</button></div>`);
    }
    if ( this.followed ) {
      chips.push(this.detached
        ? `<div class="shl-chip shl-chip-follow"><i class="fa-solid fa-person-walking" inert></i>
          <span>${esc(t("SHL.Hud.alone"))}</span>
          <button type="button" data-shl-hud="rejoin">${esc(t("SHL.Hud.rejoin"))}</button></div>`
        : `<div class="shl-chip shl-chip-follow"><i class="fa-solid fa-tower-broadcast" inert></i>
          <span>${esc(t("SHL.Hud.followed"))}</span>
          <button type="button" data-shl-hud="detach">${esc(t("SHL.Hud.detach"))}</button></div>`);
    }
    const note = game.user.isGM && setting("resolutionHint") && !this.#hintHidden && !this.isVideo
      ? math.resolutionNote(this.img) : null;
    if ( note ) {
      chips.push(`<div class="shl-chip shl-chip-warn" data-tooltip="${esc(t(`SHL.Hud.${note}Hint`))}">
        <i class="fa-solid fa-triangle-exclamation" inert></i>
        <span>${esc(t(`SHL.Hud.${note}`, {w: this.img.w, h: this.img.h}))}</span>
        <button type="button" class="icon fa-solid fa-xmark" data-shl-hud="hideHint"
          aria-label="${esc(t("SHL.Hud.hide"))}"></button></div>`);
    }
    this.hud.innerHTML = chips.join("");
  }

  /* -------------------------------------------- */
  /*  Toolbar, notes and markers                  */
  /* -------------------------------------------- */

  /**
   * A click in the toolbar.
   * @param {PointerEvent} event
   */
  #onToolbarClick(event) {
    const button = event.target.closest("[data-shl-action]");
    if ( !button || button.disabled ) return;
    event.preventDefault();
    this.runAction(button.dataset.shlAction);
  }

  /**
   * Run an action of the toolbar or a key.
   * @param {string} action
   */
  runAction(action) {
    switch ( action ) {
      case "zoomIn": return this.zoomBy(1.4, undefined, 160);
      case "zoomOut": return this.zoomBy(1 / 1.4, undefined, 160);
      case "actual": return this.actualSize();
      case "fit": return this.fit();
      case "fitWidth": return this.fit("width");
      case "rotateLeft": return this.rotateBy(-1);
      case "rotateRight": return this.rotateBy(1);
      case "aids": return this.toggleAids();
      case "lens": return this.toggleLens();
      case "reading": return this.toggleReading();
      case "previous": return this.previous();
      case "next": return this.next();
      case "overview": return this.regionIndex >= 0 ? this.goTo(-1) : this.goTo(0);
      case "text": return this.toggleText();
      case "folder": return this.toggleFolder();
      case "lead": return this.toggleLeading();
      case "edit": return this.toggleEdit();
      case "settings":
        this.leaveReading();
        return openSettings();
    }
  }

  /**
   * A click on a note over the picture.
   * @param {PointerEvent} event
   */
  #onHudClick(event) {
    const button = event.target.closest("[data-shl-hud]");
    if ( !button ) return;
    event.preventDefault();
    switch ( button.dataset.shlHud ) {
      case "cancelDraw": return this.cancelDrawing();
      case "finishDraw": return this.#finishCorners();
      case "stopLead": return this.toggleLeading(false);
      case "rejoin": return this.rejoin();
      case "detach":
        this.detached = true;
        if ( this.mode === "follow" ) this.mode = "free";
        return this.#renderHud();
      case "hideHint":
        this.#hintHidden = true;
        return this.#renderHud();
    }
  }

  /**
   * A click on the number of a section.
   * @param {PointerEvent} event
   */
  #onMarkerClick(event) {
    const marker = event.target.closest(".shl-marker");
    if ( !marker || this.drawing ) return;
    event.preventDefault();
    this.goTo(Number(marker.dataset.index));
  }

  /** Show the toolbar, and fade it again when the pointer rests. */
  #showToolbar() {
    if ( !this.root ) return;
    this.root.classList.remove("shl-idle");
    clearTimeout(this.#idleTimer);
    if ( setting("toolbar") === "always" ) return;
    this.#idleTimer = setTimeout(() => {
      if ( this.disposed ) return;
      const keep = this.toolbar.matches(":hover") || this.toolbar.contains(document.activeElement)
        || !this.popover.hidden || this.drawing || this.editing;
      if ( keep ) return this.#showToolbar();
      this.root.classList.add("shl-idle");
    }, IDLE_MS);
  }

  /** Keep or remove the picture from this user's handout folder. */
  async toggleFolder() {
    if ( inFolder(this.src) ) await removeImageFromFolder(this.src);
    else {
      const title = this.app.title || this.app.options.window?.title || "";
      await addToFolder({src: this.src, title, caption: this.app.options.caption});
      ui.notifications.info(t("SHL.Folder.added"));
    }
    this.#renderToolbar();
  }

  /** Open or close the transcript. */
  toggleText() {
    if ( this.panelMode === "read" ) return closePanel(this);
    if ( this.editing ) this.toggleEdit(false);
    this.panelMode = "read";
    renderPanel(this);
    this.#renderToolbar();
    this.count("transcript");
  }

  /** The panel was closed by the panel itself. */
  panelClosed() {
    this.#renderToolbar();
  }

  /* -------------------------------------------- */
  /*  Reading aids                                */
  /* -------------------------------------------- */

  /** Open or close the reading aids. */
  toggleAids() {
    const open = this.popover.hidden;
    this.popover.hidden = !open;
    if ( open ) {
      this.#renderAids();
      this.popover.style.bottom = `${this.toolbar.offsetHeight + 18}px`;
    }
    this.#renderToolbar();
  }

  /** The panel of the reading aids. */
  #renderAids() {
    const a = this.aids;
    const range = (aid, min, max, step, value, unit) => `<label class="shl-aid"><span>${esc(t(`SHL.Aid.${aid}`))}</span>
      <input type="range" data-aid="${aid}" min="${min}" max="${max}" step="${step}" value="${value}">
      <output>${value}${unit}</output></label>`;
    const check = (aid, value) => `<label class="shl-aid shl-check"><input type="checkbox" data-aid="${aid}"${value
      ? " checked" : ""}><span>${esc(t(`SHL.Aid.${aid}`))}</span></label>`;
    this.popover.innerHTML = `<div class="shl-aids">
      ${range("contrast", 50, 300, 5, a.contrast, " %")}
      ${range("brightness", 40, 200, 5, a.brightness, " %")}
      ${range("fine", -45, 45, 0.5, this.fine, "°")}
      ${check("gray", a.gray)}${check("invert", a.invert)}${check("pixel", a.pixel)}
      <button type="button" data-aid-action="reset"><i class="fa-solid fa-arrow-rotate-left" inert></i>
        ${esc(t("SHL.Aid.reset"))}</button></div>`;
  }

  /**
   * A reading aid changed.
   * @param {Event} event
   */
  #onAidInput(event) {
    const input = event.target.closest("[data-aid]");
    if ( !input ) return;
    const aid = input.dataset.aid;
    const output = input.parentElement.querySelector("output");
    if ( aid === "fine" ) {
      this.setFine(input.value);
      if ( output ) output.textContent = `${this.fine}°`;
    }
    else {
      this.aids[aid] = input.type === "checkbox" ? input.checked : Number(input.value);
      if ( output ) output.textContent = `${input.value} %`;
      this.#applyAids();
    }
    this.count("readingAids");
    this.#scheduleRemember();
  }

  /**
   * A button of the reading aids.
   * @param {PointerEvent} event
   */
  #onAidClick(event) {
    if ( !event.target.closest("[data-aid-action=reset]") ) return;
    this.aids = {...DEFAULT_AIDS};
    this.fine = 0;
    this.#applyAids();
    this.#turnTo(this.userRotation);
    this.#renderAids();
    this.#scheduleRemember();
  }

  /** Put the reading aids on the picture and the lens. */
  #applyAids() {
    const a = this.aids;
    const parts = [];
    if ( a.contrast !== 100 ) parts.push(`contrast(${a.contrast}%)`);
    if ( a.brightness !== 100 ) parts.push(`brightness(${a.brightness}%)`);
    if ( a.gray ) parts.push("grayscale(1)");
    if ( a.invert ) parts.push("invert(1) hue-rotate(180deg)");
    this.root.style.setProperty("--shl-filter", parts.join(" ") || "none");
    this.root.classList.toggle("shl-pixel", !!a.pixel);
  }

  /* -------------------------------------------- */
  /*  Reading mode                                */
  /* -------------------------------------------- */

  /** Show the viewer on the whole screen, or back in its window. */
  async toggleReading() {
    if ( this.isFullscreen || this.root.classList.contains("shl-maximized") ) return this.leaveReading();
    this.count("readingMode");
    const doc = this.root.ownerDocument;
    if ( doc.fullscreenEnabled && this.root.requestFullscreen ) {
      try {
        await this.root.requestFullscreen({navigationUI: "hide"});
        return;
      } catch {
        // Not allowed here: fill the browser window instead
      }
    }
    this.#setMaximized(true);
  }

  /** Leave the reading mode, if it is on. */
  leaveReading() {
    if ( this.isFullscreen ) this.root.ownerDocument.exitFullscreen().catch(() => {});
    this.#setMaximized(false);
  }

  /**
   * The reading mode without full screen: the viewer fills the browser window. Foundry's image window blurs what
   * lies behind it, which would hold the viewer inside the window, so the window drops that while it lasts.
   * @param {boolean} on
   */
  #setMaximized(on) {
    if ( !this.root || (this.root.classList.contains("shl-maximized") === on) ) return;
    this.root.classList.toggle("shl-maximized", on);
    this.app.element?.classList.toggle("shl-max-host", on);
    this.#renderToolbar();
  }

  /* -------------------------------------------- */
  /*  Lens                                        */
  /* -------------------------------------------- */

  /** Switch the lens on or off for good (it also shows while Shift is held). */
  toggleLens() {
    if ( this.isVideo ) return;
    this.lensOn = !this.lensOn;
    this.#updateLens();
    this.#renderToolbar();
  }

  /**
   * Shift went down or up somewhere.
   * @param {KeyboardEvent} event
   * @param {boolean} down
   */
  #onShiftKey(event, down) {
    if ( event.key !== "Shift" ) return;
    if ( down && (hovered !== this) ) return;
    this.#setShift(down);
  }

  /**
   * Hold the lens while Shift is down.
   * @param {boolean} down
   */
  #setShift(down) {
    if ( this.#shift === down ) return;
    this.#shift = down;
    this.#updateLens();
  }

  /** @returns {boolean} */
  #lensVisible() {
    return !this.isVideo && (this.lensOn || this.#shift) && !!this.#pointer && !this.drawing && !this.#pinch;
  }

  /** Show, move or hide the lens. */
  #updateLens() {
    if ( !this.lensEl ) return;
    const visible = this.#lensVisible();
    if ( visible && !this.lensEl.firstChild ) {
      const img = document.createElement("img");
      img.src = this.media.currentSrc || this.media.src;
      img.alt = "";
      img.draggable = false;
      img.style.width = `${this.img.w}px`;
      img.style.height = `${this.img.h}px`;
      this.lensEl.append(img);
    }
    this.lensEl.hidden = !visible;
    if ( visible ) {
      this.#placeLens();
      this.count("lens");
    }
  }

  /** Put the lens under the pointer: the picture inside is the same view, larger by the lens zoom. */
  #placeLens() {
    const q = this.#pointer;
    const img = this.lensEl.firstChild;
    if ( !q || !img ) return;
    const size = setting("lensSize");
    const m = this.lensZoom;
    const half = size / 2;
    this.lensEl.style.width = this.lensEl.style.height = `${size}px`;
    this.lensEl.style.transform = `translate(${q.x - half}px, ${q.y - half}px)`;
    const tx = half - (m * (q.x - this.view.tx));
    const ty = half - (m * (q.y - this.view.ty));
    img.style.transform = `translate(${tx}px, ${ty}px) rotate(${this.view.r}deg) scale(${this.view.s * m})`;
  }

  /* -------------------------------------------- */
  /*  Pointer and wheel                           */
  /* -------------------------------------------- */

  /**
   * A point of the stage from a pointer event, also when the window is scaled.
   * @param {PointerEvent|WheelEvent} event
   * @returns {{x: number, y: number}}
   */
  #point(event) {
    const rect = this.stage.getBoundingClientRect();
    const sx = rect.width / (this.stage.clientWidth || rect.width || 1);
    const sy = rect.height / (this.stage.clientHeight || rect.height || 1);
    return {x: (event.clientX - rect.left) / (sx || 1), y: (event.clientY - rect.top) / (sy || 1)};
  }

  /**
   * @param {PointerEvent} event
   */
  #onPointerDown(event) {
    if ( !this.ready ) return;
    if ( event.target.closest(".shl-toolbar, .shl-popover, .shl-hud, .shl-marker") ) return;
    // A right click while corners are placed takes the last one back
    if ( this.drawing && (event.pointerType === "mouse") && (event.button === 2) ) {
      event.preventDefault();
      return this.#removeCorner();
    }
    if ( (event.pointerType === "mouse") && ![0, 1].includes(event.button) ) return;
    // While a frame is drawn or edited, a second finger does nothing
    if ( this.#band || this.#edit ) return event.preventDefault();
    if ( !this.popover.hidden ) {
      this.popover.hidden = true;
      this.#renderToolbar();
    }
    // Keys reach the picture after a click, without the focus ring a keyboard user would see
    this.stage.focus({preventScroll: true, focusVisible: false});
    const q = this.#point(event);
    this.#pointers.set(event.pointerId, q);
    this.stage.setPointerCapture?.(event.pointerId);
    this.#stopAnimation();
    event.preventDefault();
    if ( this.drawing && (this.#pointers.size === 1) && (event.button === 0) ) {
      // Before the first corner a drag draws a straight frame and a click places the first corner; after it a drag
      // moves the picture and a click places the next corner
      if ( !this.drawing.points.length ) this.#band = {x0: q.x, y0: q.y, x1: q.x, y1: q.y, pending: true};
      else this.#drag = {start: q, last: q, moved: false, corner: true};
      return;
    }
    // Editing: a frame takes the pointer to be moved, a handle to resize or turn it
    if ( this.editing && !this.drawing && (this.#pointers.size === 1) && (event.button === 0) ) {
      const frame = event.target.closest(".shl-region");
      const region = frame ? this.handout.regions[Number(frame.dataset.index)] : null;
      if ( region ) {
        const handle = event.target.closest(".shl-handle")?.dataset.handle ?? "move";
        this.select(region.id);
        this.#edit = {id: region.id, handle, start: q, region: {...region}, moved: false};
        return;
      }
    }
    if ( this.#pointers.size >= 2 ) {
      const [a, b] = [...this.#pointers.values()];
      this.#pinch = {d0: Math.hypot(b.x - a.x, b.y - a.y) || 1, m0: {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2},
        view: this.view};
      this.#drag = null;
      this.#updateLens();
      return;
    }
    this.#drag = {start: q, last: q, moved: false, touch: event.pointerType === "touch"};
  }

  /**
   * @param {PointerEvent} event
   */
  #onPointerMove(event) {
    if ( !this.ready ) return;
    const q = this.#point(event);
    this.#pointer = q;
    this.#showToolbar();
    if ( event.shiftKey !== this.#shift && (event.pointerType === "mouse") ) this.#setShift(event.shiftKey);
    if ( this.#lensVisible() ) this.#updateLens();
    if ( this.drawing?.points.length ) this.#renderCorners();
    if ( !this.#pointers.has(event.pointerId) ) return;
    this.#pointers.set(event.pointerId, q);
    if ( this.#edit ) return this.#moveEdit(q, event.shiftKey);
    if ( this.#band ) {
      if ( this.#band.pending ) {
        if ( Math.hypot(q.x - this.#band.x0, q.y - this.#band.y0) < 6 ) return;
        this.#band.pending = false;
      }
      this.#band.x1 = q.x;
      this.#band.y1 = q.y;
      return this.#drawBand();
    }
    if ( this.#pinch && (this.#pointers.size >= 2) ) {
      const [a, b] = [...this.#pointers.values()];
      const p = this.#pinch;
      const m = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
      const view = math.zoomAt(p.view, p.m0, Math.hypot(b.x - a.x, b.y - a.y) / p.d0);
      this.setView({...view, tx: view.tx + (m.x - p.m0.x), ty: view.ty + (m.y - p.m0.y)}, {user: true});
      return;
    }
    const drag = this.#drag;
    if ( !drag ) return;
    if ( !drag.moved && (Math.hypot(q.x - drag.start.x, q.y - drag.start.y) < 4) ) return;
    drag.moved = true;
    this.stage.classList.add("shl-grabbing");
    const view = {...this.view, tx: this.view.tx + (q.x - drag.last.x), ty: this.view.ty + (q.y - drag.last.y)};
    drag.last = q;
    this.setView(view, {user: true});
  }

  /**
   * @param {PointerEvent} event
   */
  #onPointerUp(event) {
    if ( !this.#pointers.has(event.pointerId) ) return;
    this.#pointers.delete(event.pointerId);
    this.stage.releasePointerCapture?.(event.pointerId);
    if ( this.#edit ) {
      const edit = this.#edit;
      this.#edit = null;
      this.stage.classList.remove("shl-grabbing");
      if ( edit.moved ) this.changed({list: false});
      return;
    }
    if ( this.#band ) {
      const band = this.#band;
      this.#band = null;
      this.bandEl.hidden = true;
      if ( event.type !== "pointerup" ) return;
      if ( band.pending ) return this.#addCorner({x: band.x0, y: band.y0});
      return this.#finishDrawing(band);
    }
    if ( this.#pinch ) {
      this.#pinch = null;
      const rest = [...this.#pointers.values()][0];
      this.#drag = rest ? {start: rest, last: rest, moved: true} : null;
      return;
    }
    const drag = this.#drag;
    this.#drag = null;
    this.stage.classList.remove("shl-grabbing");
    const click = drag && !drag.moved && (event.type === "pointerup");
    if ( click && drag.corner ) return this.#addCorner(drag.start);
    // A click beside the frames while editing lets go of the selected one
    if ( click && this.editing && !this.drawing && this.selected ) this.select(null);
    if ( click && drag.touch ) {
      const q = this.#point(event);
      const last = this.#lastTap;
      const now = performance.now();
      if ( last && (now - last.at < 320) && (Math.hypot(q.x - last.q.x, q.y - last.q.y) < 30) ) {
        this.#lastTap = null;
        this.#toggleZoomAt(q);
      }
      else this.#lastTap = {at: now, q};
    }
  }

  /** The pointer left the stage: the lens goes away. */
  #onPointerLeave() {
    if ( this.#pointers.size ) return;
    this.#pointer = null;
    this.#updateLens();
  }

  /**
   * The wheel zooms around the pointer; with the lens showing, Shift and the wheel change the lens zoom.
   * @param {WheelEvent} event
   */
  #onWheel(event) {
    if ( !this.ready || event.target.closest(".shl-popover, .shl-toolbar") ) return;
    event.preventDefault();
    const deltaY = event.deltaY || event.deltaX;
    const q = this.#point(event);
    this.#pointer = q;
    if ( this.#lensVisible() && event.shiftKey ) {
      const factor = math.wheelFactor({deltaY, deltaMode: event.deltaMode, ctrlKey: false});
      this.lensZoom = Math.min(Math.max(this.lensZoom * factor, 1.25), 8);
      return this.#placeLens();
    }
    const factor = math.wheelFactor({deltaY, deltaMode: event.deltaMode, ctrlKey: event.ctrlKey});
    this.setView(math.zoomAt(this.view, q, factor), {user: true});
  }

  /**
   * A double click zooms in at the pointer, or back to the whole picture.
   * @param {MouseEvent} event
   */
  #onDoubleClick(event) {
    // A double click closes a frame of three or more corners
    if ( this.drawing ) {
      if ( this.drawing.points.length >= 3 ) this.#finishCorners();
      return;
    }
    if ( !this.ready || this.editing || event.target.closest(".shl-toolbar, .shl-popover, .shl-hud, .shl-marker") ) return;
    event.preventDefault();
    this.#toggleZoomAt(this.#point(event));
  }

  /**
   * Zoom in at a point, or back to the whole picture when already zoomed in.
   * @param {{x: number, y: number}} q
   */
  #toggleZoomAt(q) {
    const fit = math.fitScale(this.img, this.stageSize, this.view.r);
    if ( this.view.s > fit * 1.15 ) return this.fit();
    const target = Math.max(fit * 2.5, Math.min(1, fit * 6));
    this.setView(math.zoomAt(this.view, q, target / this.view.s), {user: true, animate: MOVE_MS});
  }

  /**
   * The pointer moves a frame, one of its sides or its turn handle. Every step starts from the frame as it was when
   * the drag began, so nothing drifts. Shift turns in steps of 5 degrees and keeps the proportions at a corner.
   * @param {{x: number, y: number}} q
   * @param {boolean} shift
   */
  #moveEdit(q, shift) {
    const edit = this.#edit;
    if ( !edit.moved && (Math.hypot(q.x - edit.start.x, q.y - edit.start.y) < 3) ) return;
    const region = this.handout.regions.find(r => r.id === edit.id);
    if ( !region ) return;
    edit.moved = true;
    this.stage.classList.add("shl-grabbing");
    let next;
    if ( edit.handle === "move" ) next = math.moveRegion(edit.region, this.view, edit.start, q, this.img);
    else if ( edit.handle === "turn" ) next = math.rotateRegion(edit.region, this.view, edit.start, q, this.img, shift ? 5 : 0.5);
    else {
      // The handle moves by what the pointer moved, so the side does not jump to the pointer when the drag starts
      const side = HANDLES[edit.handle];
      edit.from ??= math.toScreen(this.view, math.handlePoint(edit.region, side, this.img));
      const to = {x: edit.from.x + (q.x - edit.start.x), y: edit.from.y + (q.y - edit.start.y)};
      next = math.resizeRegion(edit.region, this.view, side, to, this.img, {keepRatio: shift, min: 8 / this.view.s});
    }
    Object.assign(region, {cx: next.cx, cy: next.cy, w: next.w, h: next.h, angle: next.angle});
    this.#renderRegions();
    if ( edit.handle === "turn" ) this.#syncAngleInputs(region);
  }

  /** The rubber band while a section is drawn. */
  #drawBand() {
    const b = this.#band;
    if ( !b ) return;
    this.bandEl.hidden = false;
    this.bandEl.style.left = `${Math.min(b.x0, b.x1)}px`;
    this.bandEl.style.top = `${Math.min(b.y0, b.y1)}px`;
    this.bandEl.style.width = `${Math.abs(b.x1 - b.x0)}px`;
    this.bandEl.style.height = `${Math.abs(b.y1 - b.y0)}px`;
  }
}
