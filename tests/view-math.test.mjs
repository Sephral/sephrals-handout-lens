import assert from "node:assert/strict";
import test from "node:test";
import * as m from "../scripts/view-math.mjs";

const near = (a, b, eps=1e-6, label="") => assert.ok(Math.abs(a - b) < eps, `${label} ${a} != ${b}`);
const nearPoint = (p, q, eps=1e-6) => {
  near(p.x, q.x, eps, "x");
  near(p.y, q.y, eps, "y");
};

const img = {w: 1400, h: 1800};
const stage = {w: 900, h: 700};

test("toImage reverses toScreen, also when turned", () => {
  for ( const view of [{s: 1, r: 0, tx: 0, ty: 0}, {s: 0.37, r: 23, tx: 120, ty: -40}, {s: 4, r: -170, tx: -900, ty: 300}] ) {
    for ( const p of [{x: 0, y: 0}, {x: 700, y: 900}, {x: 1400, y: 13}] ) nearPoint(m.toImage(view, m.toScreen(view, p)), p);
  }
});

test("zooming keeps the point under the pointer in place", () => {
  const view = {s: 0.5, r: 12, tx: 30, ty: 40};
  const q = {x: 300, y: 250};
  const before = m.toImage(view, q);
  const after = m.zoomAt(view, q, 3.2);
  near(after.s, 1.6);
  nearPoint(m.toImage(after, q), before);
});

test("turning keeps the point under the middle in place", () => {
  const view = {s: 0.8, r: 0, tx: 10, ty: 20};
  const q = {x: 450, y: 350};
  const before = m.toImage(view, q);
  const after = m.rotateAt(view, q, 90);
  near(after.r, 90);
  nearPoint(m.toImage(after, q), before);
});

test("angles stay between -180 and 180", () => {
  near(m.normalizeAngle(190), -170);
  near(m.normalizeAngle(-190), 170);
  near(m.normalizeAngle(360), 0);
  near(m.normalizeAngle(180), 180);
});

test("the whole picture fits, centred, also turned by 90 degrees", () => {
  const view = m.fitView(img, stage);
  near(view.s, 700 / 1800);
  nearPoint(m.toScreen(view, {x: 700, y: 900}), {x: 450, y: 350});
  const turned = m.fitView(img, stage, 90);
  near(turned.s, Math.min(900 / 1800, 700 / 1400));
  nearPoint(m.toScreen(turned, {x: 700, y: 900}), {x: 450, y: 350});
});

test("full width starts at the top of the picture", () => {
  const view = m.fitView(img, stage, 0, "width");
  near(view.s, 900 / 1400);
  near(m.toScreen(view, {x: 0, y: 0}).y, 0);
  near(m.toScreen(view, {x: 0, y: 0}).x, 0);
});

test("a section drawn on a turned view comes back straight and filling the stage", () => {
  // The user turned the picture by -8 degrees until a tilted note stood straight, then drew a frame around it
  const view = m.viewFrom({s: 0.9, r: -8, c: {x: 500, y: 600}}, stage);
  const rect = {x0: 200, y0: 150, x1: 600, y1: 450};
  const region = m.regionFromRect(view, rect, img);
  near(region.angle, 8);
  const shown = m.regionView(img, stage, region, 1);
  near(shown.r, -8);
  // The corners of the section are an upright rectangle that touches the stage on one side
  const box = m.regionBox(region, img);
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => {
    const local = m.rotate({x: (u - 0.5) * box.width, y: (v - 0.5) * box.height}, box.angle);
    return m.toScreen(shown, {x: region.cx * img.w + local.x, y: region.cy * img.h + local.y});
  });
  near(corners[0].y, corners[1].y, 1e-6, "top edge level");
  near(corners[0].x, corners[3].x, 1e-6, "left edge upright");
  const width = corners[1].x - corners[0].x;
  const height = corners[3].y - corners[0].y;
  near(Math.max(width / stage.w, height / stage.h), 1, 1e-6, "fills the stage");
  near((corners[0].x + corners[2].x) / 2, stage.w / 2, 1e-6, "centred");
});

test("a frame shows the same part on a stage of another size", () => {
  const view = m.viewFrom({s: 2, r: 15, c: {x: 333, y: 444}}, stage);
  const frame = m.frameOf(view, stage);
  const other = {w: 1800, h: 1400};
  const shown = m.viewFromFrame(frame, other);
  near(shown.r, 15);
  nearPoint(m.centerOf(shown, other), {x: 333, y: 444});
  near(shown.s, 4);
});

test("the picture cannot be dragged off the stage", () => {
  const big = m.viewFrom({s: 2, r: 0, c: {x: 700, y: 900}}, stage);
  const away = m.clampView({...big, tx: big.tx + 5000, ty: big.ty - 5000}, img, stage);
  // Larger than the stage: no empty edge on the left or at the bottom
  assert.ok(m.toScreen(away, {x: 0, y: 0}).x <= 1e-6);
  assert.ok(m.toScreen(away, {x: 0, y: 1800}).y >= stage.h - 1e-6);
  const small = m.viewFrom({s: 0.1, r: 0, c: {x: 700, y: 900}}, stage);
  const pushed = m.clampView({...small, tx: -1000}, img, stage);
  assert.ok(m.toScreen(pushed, {x: 0, y: 0}).x >= -1e-6);
});

test("scale limits allow 800 % and twice the fitted size of tiny pictures", () => {
  assert.deepEqual(m.scaleLimits(img, stage, 8).max, 8);
  const tiny = {w: 40, h: 30};
  near(m.scaleLimits(tiny, stage, 8).max, Math.min(900 / 40, 700 / 30) * 2);
  const clamped = m.clampScale({s: 50, r: 0, tx: 0, ty: 0}, {min: 0.1, max: 8}, {x: 0, y: 0});
  near(clamped.s, 8);
});

test("interpolation starts and ends at the views and takes the short way round", () => {
  const a = m.viewFrom({s: 0.5, r: 170, c: {x: 100, y: 100}}, stage);
  const b = m.viewFrom({s: 2, r: -170, c: {x: 900, y: 1200}}, stage);
  assert.ok(m.sameView(m.interpolate(a, b, 0, stage), a));
  assert.ok(m.sameView(m.interpolate(a, b, 1, stage), b));
  const half = m.interpolate(a, b, 0.5, stage);
  near(Math.abs(half.r), 180, 1e-6, "through 180, not through 0");
  near(half.s, 1);
});

test("wheel steps zoom in and out evenly, lines count like pixels", () => {
  near(m.wheelFactor({deltaY: -100, deltaMode: 0}) * m.wheelFactor({deltaY: 100, deltaMode: 0}), 1);
  near(m.wheelFactor({deltaY: 3, deltaMode: 1}), m.wheelFactor({deltaY: 48, deltaMode: 0}));
  assert.ok(m.wheelFactor({deltaY: -10, deltaMode: 0, ctrlKey: true}) > m.wheelFactor({deltaY: -10, deltaMode: 0}));
});

test("small and huge pictures get a note", () => {
  assert.equal(m.resolutionNote({w: 800, h: 600}), "small");
  assert.equal(m.resolutionNote({w: 1400, h: 1800}), null);
  assert.equal(m.resolutionNote({w: 9000, h: 9000}), "huge");
  assert.equal(m.resolutionNote({w: 20000, h: 100}), "huge");
  assert.equal(m.resolutionNote(null), null);
});

/* -------------------------------------------- */
/*  Drawing sections by corners, editing frames */
/* -------------------------------------------- */

const page = {w: 1000, h: 1000};

/**
 * The corners of a rotated rectangle in image pixels, clockwise from the top left.
 * @param {{x: number, y: number}} c
 * @param {number} w
 * @param {number} h
 * @param {number} deg
 * @returns {{x: number, y: number}[]}
 */
function corners(c, w, h, deg) {
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const p = m.rotate({x: sx * w / 2, y: sy * h / 2}, deg);
    return {x: c.x + p.x, y: c.y + p.y};
  });
}

/**
 * The corners of a section in image pixels.
 * @param {object} region
 * @param {{w: number, h: number}} size
 * @returns {{x: number, y: number}[]}
 */
function regionCorners(region, size) {
  return corners({x: region.cx * size.w, y: region.cy * size.h}, region.w * size.w, region.h * size.h, region.angle);
}

test("four corners of a straight note give its frame", () => {
  const r = m.regionFromCorners([{x: 100, y: 100}, {x: 500, y: 100}, {x: 500, y: 300}, {x: 100, y: 300}], page);
  near(r.angle, 0);
  near(r.cx, 0.3);
  near(r.cy, 0.2);
  near(r.w, 0.4);
  near(r.h, 0.2);
});

test("a tilted note keeps its slant, from whichever corner the clicks start", () => {
  const points = corners({x: 600, y: 800}, 400, 300, 7);
  for ( let start = 0; start < 4; start++ ) {
    const order = [...points.slice(start), ...points.slice(0, start)];
    for ( const list of [order, [...order].reverse()] ) {
      const r = m.regionFromCorners(list, img);
      near(r.angle, 7, 0.01, "angle");
      near(r.cx * img.w, 600, 0.01, "cx");
      near(r.cy * img.h, 800, 0.01, "cy");
      near(r.w * img.w, 400, 0.01, "w");
      near(r.h * img.h, 300, 0.01, "h");
    }
  }
});

test("slightly missed clicks still give the slant within a degree, and the frame holds every click", () => {
  const points = corners({x: 500, y: 500}, 300, 420, -12).map((p, i) => ({x: p.x + [3, -2, 1, -3][i], y: p.y + [-2, 3, -3, 2][i]}));
  const r = m.regionFromCorners(points, page);
  near(r.angle, -12, 1, "angle");
  const local = points.map(p => m.rotate({x: p.x - (r.cx * 1000), y: p.y - (r.cy * 1000)}, -r.angle));
  for ( const p of local ) assert.ok((Math.abs(p.x) <= (r.w * 500) + 1e-6) && (Math.abs(p.y) <= (r.h * 500) + 1e-6));
});

test("a note lying sideways reads upright when the picture was turned for it", () => {
  // The note's writing runs downwards on the image (turned by 94 degrees); the GM turned the view by -90 to read it
  const points = corners({x: 400, y: 600}, 300, 200, 94);
  const r = m.regionFromCorners(points, img, -90);
  near(r.angle, 94, 0.01);
  near(r.w * img.w, 300, 0.01);
  near(r.h * img.h, 200, 0.01);
  // Shown as a section, its top edge runs from left to right on the screen
  const view = m.regionView(img, stage, r);
  const [a, b] = regionCorners(r, img).map(p => m.toScreen(view, p));
  near(Math.atan2(b.y - a.y, b.x - a.x), 0, 1e-6);
  assert.ok(b.x > a.x);
});

test("three corners are enough, fewer give nothing", () => {
  const r = m.regionFromCorners([{x: 100, y: 100}, {x: 500, y: 100}, {x: 500, y: 300}], page);
  near(r.angle, 0);
  near(r.w, 0.4);
  near(r.h, 0.2);
  assert.equal(m.regionFromCorners([{x: 0, y: 0}, {x: 10, y: 0}], page), null);
  assert.equal(m.regionFromCorners([{x: 5, y: 5}, {x: 5, y: 5}, {x: 5, y: 5}], page), null);
});

test("moving a frame follows the pointer on the picture, also zoomed and turned", () => {
  const region = {cx: 0.5, cy: 0.5, w: 0.2, h: 0.1, angle: 10};
  const view = {s: 2, r: 30, tx: 40, ty: -20};
  const from = m.toScreen(view, {x: 500, y: 500});
  const to = m.toScreen(view, {x: 560, y: 470});
  const moved = m.moveRegion(region, view, from, to, page);
  near(moved.cx, 0.56);
  near(moved.cy, 0.47);
  near(moved.angle, 10);
});

test("the turn handle turns around the middle, with steps", () => {
  const region = {cx: 0.5, cy: 0.5, w: 0.2, h: 0.1, angle: 3};
  const view = {s: 1, r: 0, tx: 0, ty: 0};
  const turned = m.rotateRegion(region, view, {x: 500, y: 300}, {x: 700, y: 500}, page);
  near(turned.angle, 93);
  near(turned.cx, 0.5);
  const v = m.rotate({x: 0, y: -200}, 13);
  const stepped = m.rotateRegion(region, view, {x: 500, y: 300}, {x: 500 + v.x, y: 500 + v.y}, page, 5);
  near(stepped.angle, 15);
  near(m.rotateRegion({...region, angle: 175}, view, {x: 500, y: 300}, {x: 700, y: 500}, page).angle, -95);
});

test("a corner handle resizes and keeps the opposite corner in place, also on a turned frame", () => {
  const region = {cx: 0.5, cy: 0.5, w: 0.2, h: 0.1, angle: 30};
  const view = {s: 0.5, r: -15, tx: 100, ty: 50};
  const [nw, , se] = regionCorners(region, page);
  const target = {x: se.x + 40, y: se.y + 25};
  const resized = m.resizeRegion(region, view, {x: 1, y: 1}, m.toScreen(view, target), page);
  const after = regionCorners(resized, page);
  nearPoint(after[0], nw, 1e-6);
  nearPoint(after[2], target, 1e-6);
  near(resized.angle, 30);
});

test("an edge handle changes one side only", () => {
  const region = {cx: 0.5, cy: 0.5, w: 0.2, h: 0.1, angle: 0};
  const view = {s: 1, r: 0, tx: 0, ty: 0};
  const resized = m.resizeRegion(region, view, {x: 1, y: 0}, {x: 700, y: 900}, page);
  near(resized.w, 0.3);
  near(resized.h, 0.1);
  near(resized.cx, 0.55);
  near(resized.cy, 0.5);
  // Dragged across the opposite side, the frame stays at the smallest size instead of turning inside out
  const tiny = m.resizeRegion(region, view, {x: -1, y: 0}, {x: 900, y: 500}, page, {min: 8});
  near(tiny.w * 1000, 8);
  near((tiny.cx * 1000) + (tiny.w * 500), 600, 1e-6);
});

test("Shift at a corner keeps the proportions", () => {
  const region = {cx: 0.5, cy: 0.5, w: 0.2, h: 0.1, angle: 0};
  const view = {s: 1, r: 0, tx: 0, ty: 0};
  const resized = m.resizeRegion(region, view, {x: 1, y: 1}, {x: 800, y: 560}, page, {keepRatio: true});
  near(resized.w / resized.h, 2);
  near(resized.w, 0.4);
  // The top left corner stays where it was
  near((resized.cx - (resized.w / 2)), 0.4);
  near((resized.cy - (resized.h / 2)), 0.45);
});

test("handle points sit on the corners and edges of a turned frame", () => {
  const region = {cx: 0.5, cy: 0.4, w: 0.2, h: 0.1, angle: 25};
  const four = regionCorners(region, img);
  nearPoint(m.handlePoint(region, {x: -1, y: -1}, img), four[0]);
  nearPoint(m.handlePoint(region, {x: 1, y: 1}, img), four[2]);
  const e = m.handlePoint(region, {x: 1, y: 0}, img);
  nearPoint(e, {x: (four[1].x + four[2].x) / 2, y: (four[1].y + four[2].y) / 2});
  nearPoint(m.handlePoint(region, {x: 0, y: 0}, img), {x: 0.5 * img.w, y: 0.4 * img.h});
});
