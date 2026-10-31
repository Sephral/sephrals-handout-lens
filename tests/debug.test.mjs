import assert from "node:assert/strict";
import test from "node:test";

// The parts of Foundry the registration and the state touch
const menus = new Map();
const hooks = [];
const values = {
  enabled: true,
  current: {key: "maps/letter.webp", src: "maps/letter.webp", title: "Letter", users: ["u1", "u2"], at: 5},
  handouts: {a: {regions: [{}, {}], text: "Dear friend"}, b: {regions: [{}], text: ""}},
  folder: [{id: "1", src: "maps/letter.webp"}]
};
globalThis.Hooks = {on: name => hooks.push(name)};
globalThis.foundry = {applications: {api: {ApplicationV2: class {}}}};
globalThis.game = {
  user: {id: "gm", isGM: true},
  modules: new Map([["gambitsImageViewer", {active: true}]]),
  i18n: {localize: key => key, format: (key, data) => `${key} ${JSON.stringify(data)}`},
  settings: {
    registerMenu: (module, key, data) => menus.set(`${module}.${key}`, data),
    get: (module, key) => structuredClone(values[key])
  }
};

const {MODULE_ID} = await import("../scripts/config.mjs");
const {describeState, registerDebug} = await import("../scripts/debug.mjs");

test("the debug file button and the lens' part are registered, without transcripts and folders", () => {
  registerDebug();
  const menu = menus.get(`${MODULE_ID}.debugFile`);
  assert.equal(menu.label, "SHL.DEBUG.Save");
  assert.equal(menu.restricted, true);
  const provider = globalThis.sephralsDebugFiles.providers.get(MODULE_ID);
  assert.equal(provider.label(), "SHL.DEBUG.Entry");
  assert.deepEqual(provider.omitSettings, ["handouts", "folder"]);
  assert.equal(provider.message, undefined);
  assert.deepEqual(hooks, ["getChatMessageContextOptions"]);
});

test("the lens' part counts handouts and names the conflicting module", () => {
  const state = describeState();
  assert.equal(state.enabled, true);
  assert.deepEqual(state.conflicts, [{id: "handout-ping-viewer", active: false}, {id: "gambitsImageViewer", active: true}]);
  assert.deepEqual(state.shown, {key: "maps/letter.webp", src: "maps/letter.webp", title: "Letter", showTitle: null, users: 2, at: 5});
  assert.deepEqual(state.handouts, {pictures: 2, sections: 3, transcripts: 1});
  assert.equal(state.folderEntries, 1);
  assert.deepEqual(state.viewers, []);
});
