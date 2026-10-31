/**
 * The data of the module, free of Foundry so the tests can run it: the key of an image, reading sections and
 * transcripts, the entries of the handout folder and the messages between the clients.
 */

/** Most entries a handout folder keeps; pinned entries are never dropped. */
export const FOLDER_LIMIT = 200;

/** Most reading sections of one image. */
export const REGION_LIMIT = 60;

/** Longest transcript of one image or section, in characters. */
export const TEXT_LIMIT = 20000;

/** Smallest width and height of a section, relative to the picture. */
export const MIN_REGION = 0.002;

/** Longest title of a section or folder entry. */
export const TITLE_LIMIT = 200;

/** Languages a transcript can be read aloud in; "" follows Foundry's language. */
export const SPEECH_LANGUAGES = ["", "de", "en", "fr", "es", "it", "nl", "pl", "pt"];

/**
 * The key under which the data of an image is kept: its path without the address of this server, the query and the
 * anchor, decoded. "worlds/x/a%20b.webp?123" and "/worlds/x/a b.webp" are the same image.
 * @param {string} src
 * @param {string} [origin]   The address of the server ("http://localhost:30000")
 * @returns {string}
 */
export function imageKey(src, origin="") {
  let key = String(src ?? "").trim();
  if ( origin && key.startsWith(origin) ) key = key.slice(origin.length);
  key = key.replace(/[?#].*$/, "");
  try {
    key = decodeURI(key);
  } catch {
    // A path with a lone "%" stays as it is
  }
  return key.replace(/^\/+/, "");
}

/**
 * Is the file a video, by its extension?
 * @param {string} src
 * @returns {boolean}
 */
export function isVideoPath(src) {
  return /\.(mp4|m4v|webm|ogv|ogg|mov)$/i.test(imageKey(src));
}

/**
 * A text cut to a length, without control characters apart from line breaks and tabs.
 * @param {*} value
 * @param {number} limit
 * @returns {string}
 */
export function cleanText(value, limit) {
  // eslint-disable-next-line no-control-regex
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, limit);
}

/**
 * A number within limits, or the fallback.
 * @param {*} value
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 * @returns {number}
 */
function bounded(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

/**
 * A reading section as the module keeps it, or null when it has no area.
 * @param {object} raw
 * @returns {{id: string, title: string, cx: number, cy: number, w: number, h: number, angle: number, text: string}|null}
 */
export function normalizeRegion(raw) {
  if ( !raw || (typeof raw !== "object") ) return null;
  const w = bounded(raw.w, 0, 2, 0);
  const h = bounded(raw.h, 0, 2, 0);
  if ( (w < MIN_REGION) || (h < MIN_REGION) ) return null;
  const angle = bounded(raw.angle, -180, 180, 0);
  return {
    id: validId(raw.id) ? raw.id : makeId(),
    title: cleanText(raw.title, TITLE_LIMIT).replace(/\s+/g, " ").trim(),
    cx: bounded(raw.cx, -0.5, 1.5, 0.5),
    cy: bounded(raw.cy, -0.5, 1.5, 0.5),
    w, h,
    angle: Math.round(angle * 100) / 100,
    text: cleanText(raw.text, TEXT_LIMIT)
  };
}

/**
 * The data of one image: its reading sections, a transcript of the whole image and the language for reading aloud.
 * @param {object} raw
 * @returns {{regions: object[], text: string, lang: string}}
 */
export function normalizeHandout(raw) {
  const regions = Array.isArray(raw?.regions) ? raw.regions.map(normalizeRegion).filter(Boolean).slice(0, REGION_LIMIT) : [];
  const ids = new Set();
  for ( const region of regions ) {
    while ( ids.has(region.id) ) region.id = makeId();
    ids.add(region.id);
  }
  return {
    regions,
    text: cleanText(raw?.text, TEXT_LIMIT),
    lang: SPEECH_LANGUAGES.includes(raw?.lang) ? raw.lang : ""
  };
}

/**
 * Does an image have nothing worth keeping?
 * @param {{regions: object[], text: string, lang: string}} handout
 * @returns {boolean}
 */
export function isEmptyHandout(handout) {
  return !handout.regions.length && !handout.text.trim() && !handout.lang;
}

/**
 * Does an image have something to read in the text panel?
 * @param {{regions: object[], text: string}} handout
 * @returns {boolean}
 */
export function hasTranscript(handout) {
  return !!handout.text.trim() || handout.regions.some(r => r.text.trim() || r.title);
}

/**
 * The texts read aloud for a section, or for the whole image (index -1): title and transcript.
 * @param {{regions: object[], text: string}} handout
 * @param {number} index
 * @returns {string}
 */
export function speechText(handout, index) {
  if ( index < 0 ) {
    const parts = [handout.text, ...handout.regions.map(r => [r.title, r.text].filter(Boolean).join(".\n"))];
    return parts.map(p => p.trim()).filter(Boolean).join("\n\n");
  }
  const region = handout.regions[index];
  return region ? [region.title, region.text].map(p => p.trim()).filter(Boolean).join(".\n") : "";
}

/* -------------------------------------------- */
/*  Handout folder                              */
/* -------------------------------------------- */

/**
 * A folder entry as the module keeps it, or null.
 * @param {object} raw
 * @returns {{id: string, src: string, title: string, caption: string, at: number, pinned: boolean}|null}
 */
export function normalizeEntry(raw) {
  const src = cleanText(raw?.src, 2000).trim();
  if ( !src || /^\s*javascript:/i.test(src) ) return null;
  return {
    id: validId(raw.id) ? raw.id : makeId(),
    src,
    title: cleanText(raw.title, TITLE_LIMIT).replace(/\s+/g, " ").trim(),
    caption: cleanText(raw.caption, 1000).trim(),
    at: Number.isFinite(Number(raw.at)) ? Number(raw.at) : 0,
    pinned: !!raw.pinned
  };
}

/**
 * The folder with an image added at the top. An image that is already there moves up and keeps its pin and its
 * title, unless the new one brings a title. Beyond the limit the oldest unpinned entries drop out.
 * @param {object[]} list
 * @param {object} entry
 * @param {number} now
 * @param {number} [limit]
 * @returns {object[]}
 */
export function folderAdd(list, entry, now, limit=FOLDER_LIMIT) {
  const added = normalizeEntry({...entry, at: now});
  if ( !added ) return list;
  const key = imageKey(added.src);
  const old = list.find(e => imageKey(e.src) === key);
  const merged = old ? {...old, src: added.src, title: added.title || old.title, caption: added.caption || old.caption,
    at: now} : added;
  const rest = list.filter(e => e !== old);
  const result = [merged, ...rest];
  while ( result.length > limit ) {
    const last = result.findLastIndex(e => !e.pinned);
    if ( last < 0 ) break;
    result.splice(last, 1);
  }
  return result;
}

/**
 * The folder sorted for display: pinned entries first, then the newest.
 * @param {object[]} list
 * @returns {object[]}
 */
export function folderSorted(list) {
  return [...list].sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (b.at - a.at));
}

/* -------------------------------------------- */
/*  Messages                                    */
/* -------------------------------------------- */

/**
 * A frame (what a view shows) from a message, or null.
 * @param {object} raw
 * @returns {{cx: number, cy: number, iw: number, ih: number, r: number}|null}
 */
export function cleanFrame(raw) {
  if ( !raw || (typeof raw !== "object") ) return null;
  const nums = ["cx", "cy", "iw", "ih", "r"].map(k => Number(raw[k]));
  if ( nums.some(n => !Number.isFinite(n)) ) return null;
  const [cx, cy, iw, ih, r] = nums;
  if ( (iw <= 0) || (ih <= 0) ) return null;
  return {cx, cy, iw, ih, r: bounded(r, -360, 360, 0)};
}

/**
 * A message of another client, checked and cut to what the module uses, or null.
 * @param {object} raw
 * @returns {object|null}
 */
export function cleanMessage(raw) {
  if ( !raw || (typeof raw !== "object") || (typeof raw.key !== "string") || !raw.key ) return null;
  const base = {type: raw.type, key: cleanText(raw.key, 2000), from: String(raw.from ?? "")};
  switch ( raw.type ) {
    case "close":
    case "followEnd":
    case "request":
      return base;
    case "view": {
      const frame = cleanFrame(raw.frame);
      if ( !frame ) return null;
      return {...base, frame, region: Number.isInteger(raw.region) ? raw.region : -1, follow: !!raw.follow,
        seq: Number.isFinite(Number(raw.seq)) ? Number(raw.seq) : 0};
    }
    default:
      return null;
  }
}

/**
 * Is a value usable as the id of a section or folder entry? (A plain regular expression test would accept undefined,
 * which it reads as the word "undefined".)
 * @param {*} id
 * @returns {boolean}
 */
function validId(id) {
  return (typeof id === "string") && /^[A-Za-z0-9]{1,32}$/.test(id);
}

/**
 * A random id of 16 letters and digits.
 * @returns {string}
 */
export function makeId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for ( let i = 0; i < 16; i++ ) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}
