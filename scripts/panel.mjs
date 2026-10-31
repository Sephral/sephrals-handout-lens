/**
 * The panel beside the picture: the transcript for reading (larger text, read aloud) and, for the GM, the editing of
 * reading sections, transcripts and the speech language.
 */

import {MODULE_ID, esc, setting, t} from "./config.mjs";
import {SPEECH_LANGUAGES, TEXT_LIMIT, speechText} from "./handout-data.mjs";

/** The viewer whose text is being read aloud. */
let speaking = null;

/** Smallest and largest text size of the transcript. */
const TEXT_SIZES = {min: 12, max: 36};

/**
 * A small icon button.
 * @param {string} attr    The data attribute and value ("data-shl-panel=\"close\"")
 * @param {string} icon
 * @param {string} label
 * @param {boolean} [disabled]
 * @returns {string}
 */
function iconButton(attr, icon, label, disabled=false) {
  return `<button type="button" class="shl-icon" ${attr} data-tooltip="${esc(label)}" aria-label="${esc(label)}"${
    disabled ? " disabled" : ""}><i class="${icon}" inert></i></button>`;
}

/**
 * The name of a speech language in the user's language.
 * @param {string} code
 * @returns {string}
 */
function languageName(code) {
  if ( !code ) return t("SHL.Edit.langDefault");
  try {
    return new Intl.DisplayNames([game.i18n.lang], {type: "language"}).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Draw the panel of a viewer for its mode, or hide it.
 * @param {HandoutViewer} viewer
 */
export function renderPanel(viewer) {
  const panel = viewer.panel;
  if ( !panel ) return;
  if ( !viewer.panelMode ) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  panel.hidden = false;
  panel.dataset.mode = viewer.panelMode;
  panel.innerHTML = viewer.panelMode === "edit" ? editHTML(viewer) : readHTML(viewer);
  refreshPanel(viewer);
}

/**
 * The transcript for reading.
 * @param {HandoutViewer} viewer
 * @returns {string}
 */
function readHTML(viewer) {
  const {regions, text} = viewer.handout;
  const speech = !!globalThis.speechSynthesis;
  const sections = [];
  if ( text.trim() ) {
    sections.push(`<section data-index="-1"><h4>${esc(t("SHL.Panel.whole"))}</h4>
      <div class="shl-text">${esc(text)}</div></section>`);
  }
  regions.forEach((region, i) => {
    const title = region.title || t("SHL.Nav.section", {number: i + 1});
    const body = region.text.trim() ? `<div class="shl-text">${esc(region.text)}</div>`
      : `<p class="shl-empty">${esc(t("SHL.Panel.noText"))}</p>`;
    sections.push(`<section data-index="${i}"><h4><button type="button" data-shl-go="${i}">
      <span class="shl-num">${i + 1}</span><span>${esc(title)}</span></button></h4>${body}</section>`);
  });
  if ( !sections.length ) sections.push(`<p class="shl-empty">${esc(t("SHL.Panel.empty"))}</p>`);
  return `<header class="shl-panel-head">
      <h3><i class="fa-solid fa-align-left" inert></i> ${esc(t("SHL.Panel.title"))}</h3>
      ${iconButton("data-shl-panel=\"smaller\"", "fa-solid fa-minus", t("SHL.Panel.smaller"))}
      ${iconButton("data-shl-panel=\"larger\"", "fa-solid fa-plus", t("SHL.Panel.larger"))}
      ${speech ? iconButton("data-shl-panel=\"speak\"", "fa-solid fa-volume-high", t("SHL.Panel.speak")) : ""}
      ${iconButton("data-shl-panel=\"close\"", "fa-solid fa-xmark", t("SHL.Panel.close"))}
    </header>
    <div class="shl-panel-body shl-read" style="font-size: ${setting("textSize")}px">${sections.join("")}</div>`;
}

/**
 * The editing of sections and transcripts (GM).
 * @param {HandoutViewer} viewer
 * @returns {string}
 */
function editHTML(viewer) {
  const {regions, text, lang} = viewer.handout;
  const items = regions.map((region, i) => `<li data-id="${region.id}" data-index="${i}"${
    region.id === viewer.selected ? " class=\"selected\"" : ""}>
      <div class="shl-edit-row">
        <span class="shl-num">${i + 1}</span>
        <input type="text" name="title" value="${esc(region.title)}" maxlength="200"
          placeholder="${esc(t("SHL.Nav.section", {number: i + 1}))}" aria-label="${esc(t("SHL.Edit.sectionTitle"))}">
      </div>
      <div class="shl-edit-actions">
        ${iconButton("data-shl-region=\"go\"", "fa-solid fa-eye", t("SHL.Edit.go"))}
        ${iconButton("data-shl-region=\"redraw\"", "fa-solid fa-draw-polygon", t("SHL.Edit.redraw"))}
        <span class="shl-spacer"></span>
        ${iconButton("data-shl-region=\"up\"", "fa-solid fa-arrow-up", t("SHL.Edit.up"), i === 0)}
        ${iconButton("data-shl-region=\"down\"", "fa-solid fa-arrow-down", t("SHL.Edit.down"), i === regions.length - 1)}
        ${iconButton("data-shl-region=\"delete\"", "fa-solid fa-trash", t("SHL.Edit.delete"))}
      </div>
      <label class="shl-angle"><span>${esc(t("SHL.Edit.angle"))}</span>
        <input type="range" name="angle" min="-180" max="180" step="0.5" value="${region.angle}">
        <input type="number" name="angleNumber" min="-180" max="180" step="0.5" value="${region.angle}"
          aria-label="${esc(t("SHL.Edit.angle"))}"></label>
      <textarea name="regionText" rows="4" maxlength="${TEXT_LIMIT}" placeholder="${esc(t("SHL.Edit.textPlaceholder"))}"
        aria-label="${esc(t("SHL.Edit.sectionText"))}">${esc(region.text)}</textarea>
    </li>`).join("");
  const options = SPEECH_LANGUAGES.map(code => `<option value="${code}"${code === lang ? " selected" : ""}>${
    esc(languageName(code))}</option>`).join("");
  return `<header class="shl-panel-head">
      <h3><i class="fa-solid fa-pen-to-square" inert></i> ${esc(t("SHL.Edit.title"))}</h3>
      <span class="shl-save" aria-live="polite">
        <span data-state="pending">${esc(t("SHL.Edit.pending"))}</span>
        <span data-state="saving">${esc(t("SHL.Edit.saving"))}</span>
        <span data-state="saved">${esc(t("SHL.Edit.saved"))}</span>
        <span data-state="failed">${esc(t("SHL.Edit.failed"))}</span>
      </span>
      ${iconButton("data-shl-panel=\"close\"", "fa-solid fa-check", t("SHL.Edit.done"))}
    </header>
    <div class="shl-panel-body shl-edit">
      <p class="shl-hint">${esc(t("SHL.Edit.hint"))}</p>
      <button type="button" class="shl-wide" data-shl-edit="draw"><i class="fa-solid fa-draw-polygon" inert></i>
        ${esc(t("SHL.Edit.draw"))}</button>
      ${regions.length ? `<p class="shl-hint">${esc(t("SHL.Edit.frames"))}</p>` : ""}
      ${items ? `<ol class="shl-edit-list">${items}</ol>` : `<p class="shl-empty">${esc(t("SHL.Edit.none"))}</p>`}
      <label class="shl-field"><span>${esc(t("SHL.Edit.wholeText"))}</span>
        <textarea name="text" rows="5" maxlength="${TEXT_LIMIT}" placeholder="${esc(t("SHL.Edit.textPlaceholder"))}">${
          esc(text)}</textarea></label>
      <label class="shl-field"><span>${esc(t("SHL.Edit.lang"))}</span><select name="lang">${options}</select></label>
    </div>`;
}

/**
 * Mark the current section in the panel and the state of reading aloud.
 * @param {HandoutViewer} viewer
 */
export function refreshPanel(viewer) {
  const panel = viewer.panel;
  if ( !panel || panel.hidden ) return;
  const index = viewer.regionIndex;
  let active = null;
  for ( const el of panel.querySelectorAll("section[data-index], li[data-index]") ) {
    const on = Number(el.dataset.index) === index;
    el.classList.toggle("active", on);
    if ( on ) active = el;
  }
  if ( active && (viewer.panelMode === "read") ) active.scrollIntoView({block: "nearest", behavior: "smooth"});
  const speak = panel.querySelector("[data-shl-panel=speak]");
  if ( speak ) {
    const on = speaking === viewer;
    speak.classList.toggle("active", on);
    speak.querySelector("i").className = on ? "fa-solid fa-stop" : "fa-solid fa-volume-high";
    const label = on ? t("SHL.Panel.stop") : t("SHL.Panel.speak");
    speak.dataset.tooltip = label;
    speak.setAttribute("aria-label", label);
  }
}

/**
 * Close the panel.
 * @param {HandoutViewer} viewer
 */
export function closePanel(viewer) {
  stopSpeech(viewer);
  viewer.panelMode = null;
  renderPanel(viewer);
  viewer.panelClosed();
}

/**
 * Stop reading aloud, if this viewer is reading.
 * @param {HandoutViewer} viewer
 */
export function stopSpeech(viewer) {
  if ( speaking !== viewer ) return;
  speaking = null;
  globalThis.speechSynthesis?.cancel();
  refreshPanel(viewer);
}

/**
 * Read the current section aloud (or everything on the whole picture), or stop.
 * @param {HandoutViewer} viewer
 */
function toggleSpeech(viewer) {
  const synth = globalThis.speechSynthesis;
  if ( !synth ) return;
  if ( speaking === viewer ) return stopSpeech(viewer);
  synth.cancel();
  const text = speechText(viewer.handout, viewer.regionIndex);
  if ( !text ) return ui.notifications.info(t("SHL.Panel.nothingToRead"));
  const lang = viewer.handout.lang || game.i18n.lang;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  const voice = synth.getVoices().find(v => v.lang?.toLowerCase().startsWith(lang.toLowerCase()));
  if ( voice ) utterance.voice = voice;
  utterance.onend = utterance.onerror = () => {
    if ( speaking !== viewer ) return;
    speaking = null;
    refreshPanel(viewer);
  };
  speaking = viewer;
  synth.speak(utterance);
  viewer.count("readAloud");
  refreshPanel(viewer);
}

/**
 * Change the text size of the transcript.
 * @param {HandoutViewer} viewer
 * @param {number} step
 */
async function changeTextSize(viewer, step) {
  const size = Math.min(Math.max(setting("textSize") + step, TEXT_SIZES.min), TEXT_SIZES.max);
  await game.settings.set(MODULE_ID, "textSize", size);
  const body = viewer.panel.querySelector(".shl-read");
  if ( body ) body.style.fontSize = `${size}px`;
}

/**
 * Clicks and input in the panel.
 * @param {HandoutViewer} viewer
 * @param {Event} event
 */
export function onPanelEvent(viewer, event) {
  if ( event.type === "click" ) return onClick(viewer, event);
  if ( !viewer.editing ) return;
  const input = event.target;
  const item = input.closest("li[data-id]");
  const region = item ? viewer.handout.regions.find(r => r.id === item.dataset.id) : null;
  switch ( input.name ) {
    case "text":
      viewer.handout.text = input.value;
      break;
    case "lang":
      viewer.handout.lang = input.value;
      break;
    case "title":
      if ( region ) region.title = input.value;
      break;
    case "regionText":
      if ( region ) region.text = input.value;
      break;
    case "angle":
    case "angleNumber": {
      if ( !region ) return;
      const value = Math.min(Math.max(Number(input.value) || 0, -180), 180);
      region.angle = value;
      const partner = item.querySelector(`[name=${input.name === "angle" ? "angleNumber" : "angle"}]`);
      if ( partner ) partner.value = String(value);
      const index = viewer.handout.regions.indexOf(region);
      if ( (viewer.regionIndex === index) && (viewer.mode === "region") ) viewer.goTo(index, {animate: 0, user: false});
      break;
    }
    default:
      return;
  }
  viewer.changed({list: false});
}

/**
 * A click in the panel.
 * @param {HandoutViewer} viewer
 * @param {PointerEvent} event
 */
async function onClick(viewer, event) {
  const go = event.target.closest("[data-shl-go]");
  if ( go ) return viewer.goTo(Number(go.dataset.shlGo));
  const panelButton = event.target.closest("[data-shl-panel]");
  if ( panelButton ) {
    switch ( panelButton.dataset.shlPanel ) {
      case "close": return viewer.editing ? viewer.toggleEdit(false) : closePanel(viewer);
      case "smaller": return changeTextSize(viewer, -2);
      case "larger": return changeTextSize(viewer, 2);
      case "speak": return toggleSpeech(viewer);
    }
  }
  if ( !viewer.editing ) return;
  if ( event.target.closest("[data-shl-edit=draw]") ) return viewer.startDrawing("new");
  const button = event.target.closest("[data-shl-region]");
  const item = button?.closest("li[data-id]");
  if ( !item ) return;
  const regions = viewer.handout.regions;
  const index = regions.findIndex(r => r.id === item.dataset.id);
  if ( index < 0 ) return;
  switch ( button.dataset.shlRegion ) {
    case "go":
      viewer.select(regions[index].id);
      return viewer.goTo(index);
    case "redraw": return viewer.startDrawing(regions[index].id);
    case "up":
    case "down": {
      const to = index + (button.dataset.shlRegion === "up" ? -1 : 1);
      if ( (to < 0) || (to >= regions.length) ) return;
      [regions[index], regions[to]] = [regions[to], regions[index]];
      if ( viewer.regionIndex === index ) viewer.regionIndex = to;
      else if ( viewer.regionIndex === to ) viewer.regionIndex = index;
      return viewer.changed();
    }
    case "delete": {
      const region = regions[index];
      if ( region.text.trim() ) {
        // The question would open behind a viewer on the whole screen
        viewer.leaveReading();
        const ok = await foundry.applications.api.DialogV2.confirm({
          window: {title: t("SHL.Edit.deleteTitle")},
          content: `<p>${esc(t("SHL.Edit.deleteConfirm", {name: region.title || t("SHL.Nav.section", {number: index + 1})}))}</p>`
        });
        // Editing may have ended, or the list may have changed, while the question was open
        if ( !ok || !viewer.editing ) return;
      }
      const list = viewer.handout.regions;
      const at = list.findIndex(r => r.id === region.id);
      if ( at < 0 ) return;
      list.splice(at, 1);
      if ( viewer.regionIndex === at ) viewer.regionIndex = -1;
      else if ( viewer.regionIndex > at ) viewer.regionIndex -= 1;
      return viewer.changed();
    }
  }
}
