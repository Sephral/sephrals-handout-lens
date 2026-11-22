import assert from "node:assert/strict";
import test from "node:test";
import {hasTranscript, normalizeHandout} from "../scripts/handout-data.mjs";
import {sampleFolderEntries, sampleHandout} from "../scripts/sample-data.mjs";

const text = key => `text:${key}`;

test("the sample handout has three sections with titles and a transcript, and survives normalizing", () => {
  const handout = sampleHandout(text);
  assert.equal(handout.regions.length, 3);
  assert.ok(handout.regions.every(r => r.title && r.text && r.w > 0 && r.h > 0));
  assert.equal(new Set(handout.regions.map(r => r.id)).size, 3);
  assert.ok(hasTranscript(handout));
  assert.deepEqual(normalizeHandout(handout), handout);
});

test("the sample folder lists five entries, the pinned one first, then the newest", () => {
  const now = Date.UTC(2026, 10, 22);
  const entries = sampleFolderEntries(text, now);
  assert.equal(entries.length, 5);
  assert.equal(entries[0].pinned, true);
  const rest = entries.slice(1);
  assert.deepEqual(rest.map(e => e.at), [...rest.map(e => e.at)].sort((a, b) => b - a));
  assert.ok(entries.every(e => e.title.startsWith("text:") && e.at < now));
});
