// Sample windows (api.samples, contract in samples.mjs): Foundry's image window with the viewer on a picture that ships
// with Foundry, in the states of the module (reading sections, transcript, reading aids, editing, drawing, leading,
// following), and the handout folder with made-up entries. Nothing here is saved or sent: the viewer of a sample window
// (`app.isSample`) keeps its sections in memory, writes no setting, no browser storage and no usage counter and sends
// no socket message, and the buttons of the folder only say that they do nothing.
import {MODULE_ID, t} from "./config.mjs";
import {HandoutFolder} from "./folder-app.mjs";
import {SAMPLE_IMAGE, SMALL_IMAGE, sampleFolderEntries, sampleHandout} from "./sample-data.mjs";
import {closeSample, markSample, sampleActions, sampleId} from "./samples.mjs";
import {HandoutViewer} from "./viewer.mjs";

const text = key => t(`SHL.Sample.${key}`);

/** Actions of the folder window: every one changes the folder or opens a real window, so none stays. */
class SampleFolder extends HandoutFolder {
  constructor(options = {}) {
    super({...options, actions: sampleActions(HandoutFolder, [])});
    markSample(this);
    this.sampleEntries = sampleFolderEntries(text, Date.now());
  }
}

/**
 * Foundry's image window for a sample: the viewer takes over like in every image window, with the made-up sections.
 * @param {string} id
 * @param {object} data   {src, title, caption, handout}
 * @returns {Class}
 */
function popoutClass() {
  const ImagePopout = foundry.applications.apps.ImagePopout;
  return class SampleImagePopout extends ImagePopout {
    constructor(options) {
      super(options);
      markSample(this);
    }
  };
}

/**
 * The viewer of an image window, once it has measured the picture. Without a viewer (the module is switched off in
 * the settings, or another zoom module is active) the window stays plain.
 * @param {ApplicationV2} app
 * @returns {Promise<HandoutViewer|null>}
 */
async function readyViewer(app) {
  for ( let i = 0; i < 100; i++ ) {
    const viewer = HandoutViewer.of(app);
    if ( viewer?.ready ) return viewer;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return null;
}

/**
 * Open a sample picture and bring its viewer into a state.
 * @param {string} id
 * @param {{src?: string, handout?: boolean, width?: number, height?: number}} options
 * @param {(viewer: HandoutViewer) => void} [state]
 * @returns {Promise<ApplicationV2>}
 */
async function openPicture(id, {src = SAMPLE_IMAGE, handout = true, width = 900, height = 780} = {}, state = null) {
  const windowId = sampleId(MODULE_ID, id);
  await closeSample(windowId);
  const Popout = popoutClass();
  const app = new Popout({id: windowId, src, caption: text("caption"), window: {title: text("title")},
    position: {width, height}});
  app.sampleHandout = handout ? sampleHandout(text) : {};
  await app.render({force: true});
  const viewer = await readyViewer(app);
  if ( viewer && state ) state(viewer);
  return app;
}

/**
 * The entries of the module's samples.
 * @returns {{id: string, label: string, group: string, open: () => Promise<ApplicationV2>}[]}
 */
export function sampleWindows() {
  const group = text("group");
  const gm = game.user.isGM;
  const frame = {cx: 512, cy: 768, iw: 800, ih: 600, r: 0};
  const entries = [
    {id: "reading", label: text("reading"), open: () => openPicture("reading", {}, viewer => viewer.goTo(1, {animate: 0}))},
    {id: "text", label: text("text"), open: () => openPicture("text", {}, viewer => {
      viewer.goTo(0, {animate: 0});
      viewer.toggleText();
    })},
    {id: "aids", label: text("aids"), open: () => openPicture("aids", {}, viewer => viewer.toggleAids())},
    {id: "follow", label: text("follow"), open: () => openPicture("follow", {}, viewer => {
      viewer.receiveFrame(frame, 1, true, game.user.id);
    })},
    {id: "alone", label: text("alone"), open: () => openPicture("alone", {}, viewer => {
      viewer.receiveFrame(frame, 1, true, game.user.id);
      viewer.detached = true;
      viewer.redraw();
    })}
  ];
  if ( gm ) {
    entries.push(
      {id: "edit", label: text("edit"), open: () => openPicture("edit", {width: 1100}, viewer => {
        viewer.toggleEdit(true);
        viewer.select(viewer.handout.regions[1].id);
      })},
      {id: "draw", label: text("draw"), open: () => openPicture("draw", {handout: false}, viewer => {
        viewer.toggleEdit(true);
        viewer.startDrawing("new");
      })},
      {id: "lead", label: text("lead"), open: () => openPicture("lead", {}, viewer => {
        viewer.goTo(1, {animate: 0});
        viewer.toggleLeading(true);
      })},
      {id: "small", label: text("small"), open: () => openPicture("small", {src: SMALL_IMAGE, handout: false, width: 640, height: 620})}
    );
  }
  entries.push({id: "folder", label: text("folder"), open: async () => {
    const id = sampleId(MODULE_ID, "folder");
    await closeSample(id);
    return new SampleFolder({id}).render({force: true});
  }});
  return entries.map(entry => ({group, ...entry}));
}
