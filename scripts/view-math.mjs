/**
 * The geometry of the viewer, free of Foundry and the DOM so the tests can run it.
 *
 * A view places the image on the stage: a point p of the image (in image pixels) appears at the stage point
 * q = t + R(r) · (s · p), with the scale s, the rotation r in degrees and the translation t = {x, y}. This is what the
 * CSS transform "translate(tx, ty) rotate(r) scale(s)" with transform-origin 0 0 does.
 */

/**
 * Rotate a point around the origin.
 * @param {{x: number, y: number}} p
 * @param {number} deg
 * @returns {{x: number, y: number}}
 */
export function rotate(p, deg) {
  const a = deg * Math.PI / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return {x: (p.x * cos) - (p.y * sin), y: (p.x * sin) + (p.y * cos)};
}

/**
 * The stage point of an image point.
 * @param {{s: number, r: number, tx: number, ty: number}} view
 * @param {{x: number, y: number}} p
 * @returns {{x: number, y: number}}
 */
export function toScreen(view, p) {
  const q = rotate({x: p.x * view.s, y: p.y * view.s}, view.r);
  return {x: q.x + view.tx, y: q.y + view.ty};
}

/**
 * The image point under a stage point.
 * @param {{s: number, r: number, tx: number, ty: number}} view
 * @param {{x: number, y: number}} q
 * @returns {{x: number, y: number}}
 */
export function toImage(view, q) {
  const p = rotate({x: q.x - view.tx, y: q.y - view.ty}, -view.r);
  return {x: p.x / view.s, y: p.y / view.s};
}

/**
 * The view with the scale multiplied by a factor, keeping the image point under q in place.
 * @param {object} view
 * @param {{x: number, y: number}} q
 * @param {number} factor
 * @returns {object}
 */
export function zoomAt(view, q, factor) {
  return {...view, s: view.s * factor, tx: q.x - (factor * (q.x - view.tx)), ty: q.y - (factor * (q.y - view.ty))};
}

/**
 * The view turned by some degrees around the stage point q.
 * @param {object} view
 * @param {{x: number, y: number}} q
 * @param {number} deg
 * @returns {object}
 */
export function rotateAt(view, q, deg) {
  const d = rotate({x: q.x - view.tx, y: q.y - view.ty}, deg);
  return {...view, r: normalizeAngle(view.r + deg), tx: q.x - d.x, ty: q.y - d.y};
}

/**
 * An angle between -180 (excluded) and 180 degrees.
 * @param {number} deg
 * @returns {number}
 */
export function normalizeAngle(deg) {
  const a = ((Number(deg) % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;
}

/**
 * The size of the box around a rotated rectangle.
 * @param {number} w
 * @param {number} h
 * @param {number} deg
 * @returns {{w: number, h: number}}
 */
export function boundsSize(w, h, deg) {
  const a = deg * Math.PI / 180;
  const cos = Math.abs(Math.cos(a));
  const sin = Math.abs(Math.sin(a));
  return {w: (w * cos) + (h * sin), h: (w * sin) + (h * cos)};
}

/**
 * The view with scale s and rotation r that shows the image point c in the middle of the stage.
 * @param {{s: number, r: number, c: {x: number, y: number}}} state
 * @param {{w: number, h: number}} stage
 * @returns {{s: number, r: number, tx: number, ty: number}}
 */
export function viewFrom({s, r, c}, stage) {
  const d = rotate({x: c.x * s, y: c.y * s}, r);
  return {s, r: normalizeAngle(r), tx: (stage.w / 2) - d.x, ty: (stage.h / 2) - d.y};
}

/**
 * The image point in the middle of the stage.
 * @param {object} view
 * @param {{w: number, h: number}} stage
 * @returns {{x: number, y: number}}
 */
export function centerOf(view, stage) {
  return toImage(view, {x: stage.w / 2, y: stage.h / 2});
}

/**
 * The view that shows the whole image, or its full width from the top.
 * @param {{w: number, h: number}} img
 * @param {{w: number, h: number}} stage
 * @param {number} [deg=0]
 * @param {"contain"|"width"} [mode="contain"]
 * @returns {object}
 */
export function fitView(img, stage, deg=0, mode="contain") {
  const box = boundsSize(img.w, img.h, deg);
  const s = mode === "width" ? stage.w / box.w : Math.min(stage.w / box.w, stage.h / box.h);
  const view = viewFrom({s, r: deg, c: {x: img.w / 2, y: img.h / 2}}, stage);
  if ( (mode === "width") && (box.h * s > stage.h) ) view.ty += ((box.h * s) - stage.h) / 2;
  return view;
}

/**
 * The scale at which the whole image fits.
 * @param {{w: number, h: number}} img
 * @param {{w: number, h: number}} stage
 * @param {number} [deg=0]
 * @returns {number}
 */
export function fitScale(img, stage, deg=0) {
  const box = boundsSize(img.w, img.h, deg);
  return Math.min(stage.w / box.w, stage.h / box.h);
}

/**
 * The smallest and largest scale the viewer allows.
 * @param {{w: number, h: number}} img
 * @param {{w: number, h: number}} stage
 * @param {number} maxZoom   Largest scale relative to the image's own pixels (8 = 800 %)
 * @returns {{min: number, max: number}}
 */
export function scaleLimits(img, stage, maxZoom) {
  const fit = fitScale(img, stage, 0);
  return {min: Math.min(fit * 0.5, 1), max: Math.max(maxZoom, fit * 2)};
}

/**
 * Keep the scale within the limits, around the stage point q.
 * @param {object} view
 * @param {{min: number, max: number}} limits
 * @param {{x: number, y: number}} q
 * @returns {object}
 */
export function clampScale(view, limits, q) {
  if ( view.s > limits.max ) return zoomAt(view, q, limits.max / view.s);
  if ( view.s < limits.min ) return zoomAt(view, q, limits.min / view.s);
  return view;
}

/**
 * Keep the image on the stage: a picture larger than the stage covers it without empty edges, a smaller one stays
 * fully inside. The box around the rotated image counts.
 * @param {object} view
 * @param {{w: number, h: number}} img
 * @param {{w: number, h: number}} stage
 * @returns {object}
 */
export function clampView(view, img, stage) {
  const box = boundsSize(img.w * view.s, img.h * view.s, view.r);
  const center = toScreen(view, {x: img.w / 2, y: img.h / 2});
  const limit = (pos, size, room) => {
    const low = size > room ? room - (size / 2) : size / 2;
    const high = size > room ? size / 2 : room - (size / 2);
    return Math.min(Math.max(pos, Math.min(low, high)), Math.max(low, high));
  };
  const x = limit(center.x, box.w, stage.w);
  const y = limit(center.y, box.h, stage.h);
  return {...view, tx: view.tx + (x - center.x), ty: view.ty + (y - center.y)};
}

/**
 * The view that fills the stage with a reading section and turns it straight.
 * @param {{w: number, h: number}} img
 * @param {{w: number, h: number}} stage
 * @param {{cx: number, cy: number, w: number, h: number, angle: number}} region   Relative to the image size
 * @param {number} [padding=0.92]
 * @returns {object}
 */
export function regionView(img, stage, region, padding=0.92) {
  const w = Math.max(region.w * img.w, 1);
  const h = Math.max(region.h * img.h, 1);
  const s = Math.min(stage.w / w, stage.h / h) * padding;
  return viewFrom({s, r: -region.angle, c: {x: region.cx * img.w, y: region.cy * img.h}}, stage);
}

/**
 * A reading section from a rectangle drawn on the stage: the rectangle stands straight on the screen, so on the
 * image it is turned against the view.
 * @param {object} view
 * @param {{x0: number, y0: number, x1: number, y1: number}} rect   Stage points
 * @param {{w: number, h: number}} img
 * @returns {{cx: number, cy: number, w: number, h: number, angle: number}}
 */
export function regionFromRect(view, rect, img) {
  const c = toImage(view, {x: (rect.x0 + rect.x1) / 2, y: (rect.y0 + rect.y1) / 2});
  return {
    cx: c.x / img.w,
    cy: c.y / img.h,
    w: Math.abs(rect.x1 - rect.x0) / view.s / img.w,
    h: Math.abs(rect.y1 - rect.y0) / view.s / img.h,
    angle: normalizeAngle(-view.r)
  };
}

/**
 * A reading section from the corners of a note clicked on the picture. The frame takes the slant of the clicked edges:
 * each edge is folded into -45 to 45 degrees as the user sees it on the screen, and the edges are averaged by length
 * (with four times the angle, so that edges at -44 and 44 degrees do not cancel out). So it does not matter at which
 * corner the clicks start, and a picture the user turned by 90 degrees gives a section that reads upright too. Three
 * corners count as two edges. The frame is the smallest rectangle with that slant around all clicked points.
 * @param {{x: number, y: number}[]} points   Image points, at least three
 * @param {{w: number, h: number}} img
 * @param {number} [viewRotation=0]           The rotation of the view while the corners were clicked
 * @returns {{cx: number, cy: number, w: number, h: number, angle: number}|null}
 */
export function regionFromCorners(points, img, viewRotation=0) {
  if ( !Array.isArray(points) || (points.length < 3) ) return null;
  let sx = 0;
  let sy = 0;
  // Three clicks are two edges of the note: the line back to the first corner would be a diagonal
  const edges = (points.length === 3) ? 2 : points.length;
  for ( let i = 0; i < edges; i++ ) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if ( !length ) continue;
    const screen = Math.atan2(b.y - a.y, b.x - a.x) + (viewRotation * Math.PI / 180);
    sx += length * Math.cos(4 * screen);
    sy += length * Math.sin(4 * screen);
  }
  if ( !sx && !sy ) return null;
  const slant = (Math.atan2(sy, sx) / 4) * 180 / Math.PI;
  const angle = Math.round(normalizeAngle(slant - viewRotation) * 100) / 100;
  const local = points.map(p => rotate(p, -angle));
  const xs = local.map(p => p.x);
  const ys = local.map(p => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const c = rotate({x: (x0 + x1) / 2, y: (y0 + y1) / 2}, angle);
  return {cx: c.x / img.w, cy: c.y / img.h, w: (x1 - x0) / img.w, h: (y1 - y0) / img.h, angle};
}

/**
 * A reading section moved by the user from one stage point to another.
 * @param {{cx: number, cy: number}} region   As it was when the move started
 * @param {object} view
 * @param {{x: number, y: number}} from       Stage point where the move started
 * @param {{x: number, y: number}} to         Stage point now
 * @param {{w: number, h: number}} img
 * @returns {object}
 */
export function moveRegion(region, view, from, to, img) {
  const a = toImage(view, from);
  const b = toImage(view, to);
  return {...region, cx: region.cx + ((b.x - a.x) / img.w), cy: region.cy + ((b.y - a.y) / img.h)};
}

/**
 * A reading section turned around its middle by the user's drag of the turn handle.
 * @param {{cx: number, cy: number, angle: number}} region   As it was when the drag started
 * @param {object} view
 * @param {{x: number, y: number}} from                      Stage point where the drag started
 * @param {{x: number, y: number}} to                        Stage point now
 * @param {{w: number, h: number}} img
 * @param {number} [step=0.5]                                Round the angle to this step (5 while Shift is held)
 * @returns {object}
 */
export function rotateRegion(region, view, from, to, img, step=0.5) {
  const c = {x: region.cx * img.w, y: region.cy * img.h};
  const a = toImage(view, from);
  const b = toImage(view, to);
  const turn = (Math.atan2(b.y - c.y, b.x - c.x) - Math.atan2(a.y - c.y, a.x - c.x)) * 180 / Math.PI;
  const angle = step ? Math.round((region.angle + turn) / step) * step : region.angle + turn;
  return {...region, angle: normalizeAngle(Math.round(angle * 100) / 100)};
}

/**
 * Where a handle of a section sits on the image: a corner, the middle of an edge, or the middle for {x: 0, y: 0}.
 * @param {{cx: number, cy: number, w: number, h: number, angle: number}} region
 * @param {{x: -1|0|1, y: -1|0|1}} side
 * @param {{w: number, h: number}} img
 * @returns {{x: number, y: number}}   Image point
 */
export function handlePoint(region, side, img) {
  const p = rotate({x: side.x * region.w * img.w / 2, y: side.y * region.h * img.h / 2}, region.angle);
  return {x: (region.cx * img.w) + p.x, y: (region.cy * img.h) + p.y};
}

/**
 * A reading section resized by dragging one of its handles. A corner handle moves two sides, an edge handle one; the
 * opposite corner or edge stays where it is. Sizes are measured along the slant of the section.
 * @param {{cx: number, cy: number, w: number, h: number, angle: number}} region   As it was when the drag started
 * @param {object} view
 * @param {{x: -1|0|1, y: -1|0|1}} handle   Which side: x -1 left, 1 right, 0 none; y -1 top, 1 bottom, 0 none
 * @param {{x: number, y: number}} to        Stage point now
 * @param {{w: number, h: number}} img
 * @param {object} [options]
 * @param {boolean} [options.keepRatio]      A corner keeps the proportions (Shift)
 * @param {number} [options.min=8]           Smallest side in image pixels
 * @returns {object}
 */
export function resizeRegion(region, view, handle, to, img, {keepRatio=false, min=8}={}) {
  const c = {x: region.cx * img.w, y: region.cy * img.h};
  const w = region.w * img.w;
  const h = region.h * img.h;
  const p = toImage(view, to);
  const local = rotate({x: p.x - c.x, y: p.y - c.y}, -region.angle);
  const anchor = {x: -handle.x * w / 2, y: -handle.y * h / 2};
  let nw = handle.x ? Math.max(min, handle.x * (local.x - anchor.x)) : w;
  let nh = handle.y ? Math.max(min, handle.y * (local.y - anchor.y)) : h;
  if ( keepRatio && handle.x && handle.y ) {
    const k = Math.max(nw / w, nh / h);
    nw = w * k;
    nh = h * k;
  }
  const middle = {x: handle.x ? anchor.x + (handle.x * nw / 2) : 0, y: handle.y ? anchor.y + (handle.y * nh / 2) : 0};
  const shift = rotate(middle, region.angle);
  return {...region, cx: (c.x + shift.x) / img.w, cy: (c.y + shift.y) / img.h, w: nw / img.w, h: nh / img.h};
}

/**
 * Where a reading section sits on the image, in image pixels.
 * @param {{cx: number, cy: number, w: number, h: number, angle: number}} region
 * @param {{w: number, h: number}} img
 * @returns {{left: number, top: number, width: number, height: number, angle: number}}
 */
export function regionBox(region, img) {
  const width = region.w * img.w;
  const height = region.h * img.h;
  return {left: (region.cx * img.w) - (width / 2), top: (region.cy * img.h) - (height / 2), width, height,
    angle: region.angle};
}

/**
 * What a view shows, independent of the stage size: the image point in the middle, the visible width and height in
 * image pixels and the rotation. Another stage shows the same part with viewFromFrame.
 * @param {object} view
 * @param {{w: number, h: number}} stage
 * @returns {{cx: number, cy: number, iw: number, ih: number, r: number}}
 */
export function frameOf(view, stage) {
  const c = centerOf(view, stage);
  return {cx: c.x, cy: c.y, iw: stage.w / view.s, ih: stage.h / view.s, r: view.r};
}

/**
 * The view that shows a frame on a stage of another size: all of the frame fits.
 * @param {{cx: number, cy: number, iw: number, ih: number, r: number}} frame
 * @param {{w: number, h: number}} stage
 * @returns {object}
 */
export function viewFromFrame(frame, stage) {
  const s = Math.min(stage.w / frame.iw, stage.h / frame.ih);
  return viewFrom({s, r: frame.r, c: {x: frame.cx, y: frame.cy}}, stage);
}

/**
 * A view between two others: the scale changes evenly in steps of zoom, the rotation takes the short way and the
 * middle of the stage moves in a straight line over the image.
 * @param {object} a
 * @param {object} b
 * @param {number} k   0 to 1
 * @param {{w: number, h: number}} stage
 * @returns {object}
 */
export function interpolate(a, b, k, stage) {
  const ca = centerOf(a, stage);
  const cb = centerOf(b, stage);
  const s = Math.exp(Math.log(a.s) + ((Math.log(b.s) - Math.log(a.s)) * k));
  const turn = normalizeAngle(b.r - a.r);
  return viewFrom({s, r: a.r + (turn * k), c: {x: ca.x + ((cb.x - ca.x) * k), y: ca.y + ((cb.y - ca.y) * k)}}, stage);
}

/**
 * Smooth start and end of an animation.
 * @param {number} k
 * @returns {number}
 */
export function ease(k) {
  return k < 0.5 ? 2 * k * k : 1 - (((-2 * k) + 2) ** 2 / 2);
}

/**
 * Do two views show the same, within half a pixel and a tenth of a degree?
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
export function sameView(a, b) {
  return (Math.abs(a.s - b.s) / b.s < 0.002) && (Math.abs(normalizeAngle(a.r - b.r)) < 0.1)
    && (Math.abs(a.tx - b.tx) < 0.5) && (Math.abs(a.ty - b.ty) < 0.5);
}

/**
 * The zoom factor of a wheel event: lines and pages count like 16 and 400 pixels, a pinch on a trackpad (wheel with
 * the control key) zooms faster per pixel.
 * @param {{deltaY: number, deltaMode: number, ctrlKey: boolean}} event
 * @returns {number}
 */
export function wheelFactor({deltaY, deltaMode, ctrlKey}) {
  const pixels = deltaY * ([1, 16, 400][deltaMode] ?? 1);
  const rate = ctrlKey ? 0.01 : 0.0018;
  return Math.exp(-Math.max(Math.min(pixels, 300), -300) * rate);
}

/**
 * Is the picture too small to read text in it, or so large that it loads slowly?
 * @param {{w: number, h: number}} img
 * @returns {"small"|"huge"|null}
 */
export function resolutionNote(img) {
  if ( !img?.w || !img?.h ) return null;
  if ( Math.max(img.w, img.h) < 1000 ) return "small";
  if ( (img.w * img.h > 50e6) || (Math.max(img.w, img.h) > 16384) ) return "huge";
  return null;
}
