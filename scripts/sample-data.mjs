/**
 * The made-up data of the sample windows (api.samples): a picture with reading sections and a transcript, and the
 * entries of a handout folder. Free of Foundry, so the tests can run it. `text` gives a text of the module by key.
 */

import {folderSorted, normalizeEntry, normalizeHandout} from "./handout-data.mjs";

/** The pictures of the samples: both ship with Foundry (v13 and v14). The card is large enough to read, the parchment is small. */
export const SAMPLE_IMAGE = "cards/dark-gold/hearts-ace.webp";
export const SMALL_IMAGE = "ui/parchment.jpg";

/**
 * Reading sections and transcript of the sample picture.
 * @param {(key: string) => string} text   Looks up `SHL.Sample.<key>`
 * @returns {{regions: object[], text: string, lang: string}}
 */
export function sampleHandout(text) {
  return normalizeHandout({
    lang: "",
    text: text("whole"),
    regions: [
      {id: "sampleheader", title: text("s1Title"), text: text("s1Text"), cx: 0.5, cy: 0.12, w: 0.7, h: 0.1, angle: 0},
      {id: "samplemain", title: text("s2Title"), text: text("s2Text"), cx: 0.5, cy: 0.5, w: 0.78, h: 0.36, angle: 0},
      {id: "samplenote", title: text("s3Title"), text: text("s3Text"), cx: 0.5, cy: 0.86, w: 0.6, h: 0.1, angle: -6}
    ]
  });
}

/**
 * The entries of a made-up handout folder: newest first, one pinned.
 * @param {(key: string) => string} text   Looks up `SHL.Sample.<key>`
 * @param {number} now                     Milliseconds
 * @returns {object[]}
 */
export function sampleFolderEntries(text, now) {
  const hour = 3600 * 1000;
  const list = [
    {key: "folder1", src: SAMPLE_IMAGE, ago: 1, pinned: true},
    {key: "folder2", src: "icons/svg/village.svg", ago: 5},
    {key: "folder3", src: "icons/svg/skull.svg", ago: 28},
    {key: "folder4", src: "icons/svg/tankard.svg", ago: 52},
    {key: "folder5", src: "icons/svg/chest.svg", ago: 100}
  ];
  const entries = list.map(({key, src, ago, pinned = false}, i) => normalizeEntry({
    id: `sampleentry${i + 1}`, src, title: text(key), caption: "", pinned, at: now - ago * hour
  })).filter(Boolean);
  return folderSorted(entries);
}
