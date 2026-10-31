import assert from "node:assert/strict";
import test from "node:test";
import * as d from "../scripts/handout-data.mjs";

test("the key of an image ignores the server, the query, the anchor and encoding", () => {
  const origin = "http://localhost:30000";
  assert.equal(d.imageKey("worlds/test/a%20b.webp?123", origin), "worlds/test/a b.webp");
  assert.equal(d.imageKey("/worlds/test/a b.webp", origin), "worlds/test/a b.webp");
  assert.equal(d.imageKey("http://localhost:30000/worlds/test/a%20b.webp#x", origin), "worlds/test/a b.webp");
  assert.equal(d.imageKey("https://example.com/x.png", origin), "https://example.com/x.png");
  assert.equal(d.imageKey("bad%E0%A4%A.png"), "bad%E0%A4%A.png");
});

test("videos are told apart by their extension", () => {
  assert.ok(d.isVideoPath("a/b.webm?v=1"));
  assert.ok(d.isVideoPath("a/b.MP4"));
  assert.ok(!d.isVideoPath("a/b.webp"));
});

test("a section is cleaned and keeps its geometry", () => {
  const region = d.normalizeRegion({id: "abc", title: "  Note\n 1 ", cx: 0.3, cy: 0.4, w: 0.2, h: 0.1, angle: 7.123,
    text: "Line 1\nLine 2\u0007"});
  assert.deepEqual(region, {id: "abc", title: "Note 1", cx: 0.3, cy: 0.4, w: 0.2, h: 0.1, angle: 7.12,
    text: "Line 1\nLine 2"});
  assert.equal(d.normalizeRegion({w: 0, h: 0.5}), null);
  assert.match(d.normalizeRegion({w: 0.1, h: 0.1}).id, /^[A-Za-z0-9]{16}$/);
  assert.equal(d.normalizeRegion(null), null);
  const odd = d.normalizeRegion({id: "<script>", w: 0.1, h: 0.1, angle: 999, cx: "x"});
  assert.match(odd.id, /^[A-Za-z0-9]{16}$/);
  assert.equal(odd.angle, 180);
  assert.equal(odd.cx, 0.5);
});

test("a handout drops broken sections, gets unique ids and a known language", () => {
  const handout = d.normalizeHandout({regions: [{id: "a", w: 0.1, h: 0.1}, {id: "a", w: 0.2, h: 0.2}, {w: 0}],
    text: "x", lang: "klingon"});
  assert.equal(handout.regions.length, 2);
  assert.notEqual(handout.regions[0].id, handout.regions[1].id);
  assert.equal(handout.lang, "");
  assert.equal(d.normalizeHandout({lang: "de"}).lang, "de");
  assert.ok(d.isEmptyHandout(d.normalizeHandout({})));
  assert.ok(!d.isEmptyHandout(d.normalizeHandout({text: "a"})));
  const many = d.normalizeHandout({regions: Array.from({length: 80}, () => ({w: 0.1, h: 0.1}))});
  assert.equal(many.regions.length, d.REGION_LIMIT);
});

test("transcripts and the text read aloud", () => {
  const handout = d.normalizeHandout({text: "Whole", regions: [{title: "One", text: "First", w: 0.1, h: 0.1},
    {title: "", text: "", w: 0.1, h: 0.1}]});
  assert.ok(d.hasTranscript(handout));
  assert.equal(d.speechText(handout, 0), "One.\nFirst");
  assert.equal(d.speechText(handout, 1), "");
  assert.equal(d.speechText(handout, -1), "Whole\n\nOne.\nFirst");
  assert.ok(!d.hasTranscript(d.normalizeHandout({regions: [{w: 0.1, h: 0.1}]})));
});

test("the folder puts new pictures on top and moves known ones up", () => {
  let list = [];
  list = d.folderAdd(list, {src: "a.webp", title: "A"}, 1);
  list = d.folderAdd(list, {src: "b.webp", title: "B"}, 2);
  list = d.folderAdd(list, {src: "/a.webp?x=1", title: ""}, 3);
  assert.deepEqual(list.map(e => e.title), ["A", "B"]);
  assert.ok(list.every(e => /^[A-Za-z0-9]{16}$/.test(e.id)), "every entry gets an id");
  assert.equal(d.normalizeEntry({src: "x.webp"}).id.length, 16);
  assert.equal(list[0].at, 3);
  assert.equal(list[0].src, "/a.webp?x=1");
  assert.equal(d.folderAdd(list, {src: "  "}, 4), list);
  assert.equal(d.folderAdd(list, {src: "javascript:alert(1)"}, 4), list);
});

test("the folder drops the oldest unpinned entries beyond its limit", () => {
  let list = [];
  list = d.folderAdd(list, {src: "pinned.webp"}, 0);
  list[0].pinned = true;
  for ( let i = 1; i <= 5; i++ ) list = d.folderAdd(list, {src: `${i}.webp`}, i, 4);
  assert.equal(list.length, 4);
  assert.ok(list.some(e => e.src === "pinned.webp"));
  assert.deepEqual(d.folderSorted(list).map(e => e.src), ["pinned.webp", "5.webp", "4.webp", "3.webp"]);
});

test("messages are checked and cut to what the module uses", () => {
  assert.equal(d.cleanMessage(null), null);
  assert.equal(d.cleanMessage({type: "view", key: "a"}), null);
  assert.equal(d.cleanMessage({type: "view", key: "a", frame: {cx: 1, cy: 1, iw: 0, ih: 1, r: 0}}), null);
  assert.equal(d.cleanMessage({type: "drop", key: "a"}), null);
  assert.deepEqual(d.cleanMessage({type: "close", key: "a", from: "u1", extra: 1}), {type: "close", key: "a", from: "u1"});
  const view = d.cleanMessage({type: "view", key: "a", from: "g", frame: {cx: "1", cy: 2, iw: 3, ih: 4, r: 5},
    region: 2, follow: 1, seq: 9});
  assert.deepEqual(view, {type: "view", key: "a", from: "g", frame: {cx: 1, cy: 2, iw: 3, ih: 4, r: 5}, region: 2,
    follow: true, seq: 9});
  assert.equal(d.cleanMessage({type: "view", key: "a", frame: {cx: 1, cy: 2, iw: 3, ih: 4, r: 5}, region: "x"}).region, -1);
  assert.deepEqual(d.cleanMessage({type: "request", key: "k", from: "p"}), {type: "request", key: "k", from: "p"});
});
