# Sephral’s Handout Lens: Manual

Handout Lens works inside Foundry's own image window. Everything that opens a picture there gets it: a picture the GM shows to the players, a click on an image in a journal, the portrait of an actor or an item, a map note with an image, the avatar in the player list.

## For players

### Moving around the picture

| Do | To |
| --- | --- |
| Mouse wheel | Zoom in and out around the mouse pointer |
| Drag with the left or middle mouse button | Move the picture |
| Double click (double tap on a tablet) | Zoom in where you clicked, or back to the whole picture |
| Pinch on a trackpad or with two fingers | Zoom |
| Hold Shift | Show the lens under the mouse, Shift and the wheel change its strength |

The toolbar at the bottom of the picture fades while the mouse rests and comes back when it moves. From left to right:

* **Zoom out, zoom level, zoom in.** A click on the zoom level shows the picture in its own pixels (1:1).
* **Whole picture** and **full width.** Full width starts at the top, handy for long letters.
* **Turn left and right** by a quarter.
* **Reading aids:** contrast, brightness, a fine angle from minus 45 to 45 degrees for tilted notes, grayscale, light on dark and sharp pixels for small pixel art. *Reset* undoes all of them.
* **Lens:** keeps the lens on without holding Shift.
* **Reading mode:** the picture fills the whole screen. Esc or the same button brings it back.
* **Reading sections** (only when the GM made some): previous, the current section, next. A click on the section name goes back to the whole picture.
* **Transcript** (only when the GM wrote one): the text beside the picture, with smaller and larger print and *Read aloud*.
* **Keep:** puts the picture into your handout folder, or takes it out.
* **Gear:** the settings of the module.

Numbers on the picture mark the reading sections. A click on a number shows that section.

### Following the GM

When the GM leads, a green note says *The GM leads the view* and your picture moves with the GM's. As soon as you zoom or move yourself, you look around alone, and *Follow the GM* takes you back to what the GM sees.

### Handout folder

Every picture the GM shows you lands in your handout folder. Open it with the button *Handout folder* above the journal list, from the menu of any image window or with a key you choose in Foundry's key settings. You can search, pin pictures to the top, rename and remove them. A click opens the picture again. The folder belongs to your user and is the same on every device you play on.

## For the GM

### Showing pictures

Show pictures as you always do: with the eye button of an image window, from a journal image page or with any module that shows pictures. Handout Lens adds three entries to the menu of the image window (the three dots):

* **Show to players at this zoom:** shows the picture to all players, opened right at the part you see.
* **Players follow my view:** every player who has the picture open sees what you see, live, until you switch it off. The button with the radio tower in the toolbar does the same and shows whether it is on.
* **Close for everyone:** closes the picture on every other screen, your own window stays open.

A player who connects shortly after you showed a picture gets it too (see *Show to late players*). When a shown picture has fewer than 1000 pixels on its longer side, you get a note that small writing in it will be blurry for the players. Very large pictures get a note as well, because they load slowly.

### Reading sections and transcripts

Click the pencil in the toolbar (or *Edit sections and transcript* in the menu of the window). A panel opens beside the picture.

1. Click *Draw a section*, then click the four corners of the note one after the other, in any order around it. The frame takes the slant of the note, so players later see it straight, also when it lies crooked on the picture.
2. Give the section a title and, if you like, type its transcript.

While you click corners, a click on the first corner, a double click, Enter or *Done* closes the frame after three corners already. A right click or Backspace takes the last corner back, Esc stops. Between the clicks you can move and zoom the picture. Instead of clicking corners you can also drag a frame: it stands straight on the screen, so turn the picture first (*Reading aids → Angle*) until the note stands straight.

Every frame can be changed in the picture while the panel is open. Click a frame to select it (or the eye of its section in the panel) and drag it to move it. The selected frame has handles: the squares at the corners and edges make it larger or smaller (Shift at a corner keeps the proportions), the round handle above the top edge turns it (Shift turns in steps of 5 degrees). A click beside the frames lets go of it. The slider of a section sets its angle as well.

Repeat this for every note. You can also show a section, draw it again, move it up or down in the list and delete it. Below the sections you can write a transcript of the whole picture and choose the language it is read aloud in. Everything is saved a moment after you stop typing or dragging, *Done* closes the panel.

Sections and transcripts belong to the picture file. Every window that shows the same file has them, also in other journals or scenes.

Players see the titles and transcripts, so do not put secrets there.

## Keys

All keys act on the picture under the mouse and can be changed in Foundry's key settings. Away from the picture, Foundry's own keys work as usual.

| Key | Does |
| --- | --- |
| `+` | Zoom in |
| `-` | Zoom out |
| `0` | Whole picture |
| Right arrow, Page Down | Next section, or move the picture when it has none |
| Left arrow, Page Up | Previous section, or move the picture |
| Up and down arrows | Move the picture |
| `L` | Lens on or off |
| `F` | Reading mode |
| (none) | Open the handout folder |

## Settings

All options are in *Game Settings → Configure Settings → Sephral’s Handout Lens*. The gear in the toolbar and in the handout folder opens them directly, for players too.

| Setting | What it does |
| --- | --- |
| Module language | Follow Foundry, German or English, for you |
| Look | Warm paper colors (Signature) or the dark colors of Foundry for the transcript and the folder, for you |
| Zoom and lens in image windows | Switch the viewer off to get Foundry's plain image window back, for you |
| Toolbar | Fades while the mouse rests, or always visible, for you |
| Largest zoom | 2 to 16 times the picture's own pixels (default 8), for you |
| Lens size | 120 to 400 pixels (default 240), for you |
| Lens strength | 1.5 to 6 times (default 2.5), for you |
| Number the reading sections | Show the numbers on the picture, for you |
| Remember the view | Open a picture with the part, angle and reading aids you used last time on this device, for you |
| Warn about small pictures | The note for the GM about small or very large pictures, for you |
| Collect shown pictures | Shown pictures go into the players' handout folders (default on) |
| Show to late players | Minutes after showing a picture during which players who connect get it too (0 to 240, default 30, 0 is off) |
| Handout folder | Opens your handout folder |
| Self test | Checks the image window, the storage and a test viewer (GM) |
| Save debug file | One file about all of Sephral’s modules for bug reports (GM), see [Debug file](#debug-file) |

## Usage statistics

The module can take part in a small usage report shared by all of Sephral’s modules. Nothing is counted or sent until the GM agrees: shortly after the world starts, the active GM is asked, and the question comes back at every start until there is an answer. The answer counts for all of Sephral’s modules in the world. *Share usage statistics* in the module settings turns the report on or off at any time, and *Manage statistics* below it shows what the report contains right now.

With the GM’s consent only the active GM’s browser counts, and it sends at most one report a day. The counts are kept in a hidden world setting, so all browsers and computers of the GM count together, and turning the statistics off deletes them. A copy of a world gets its own world ID. The question lists everything the report contains, from the Foundry version to a random world ID. For Handout Lens it holds:

* on how many of the last 30 days the module was used
* how often the GM uses the lens, the reading mode, the reading aids and the transcript, has it read aloud, saves reading sections, leads the players' view, shows a picture at a zoom, closes a picture for everyone and opens the handout folder
* the settings *Look*, *Toolbar*, *Largest zoom*, *Number the reading sections*, *Remember the view*, *Collect shown pictures* and *Show to late players* (only the chosen option)
* where errors occur in the module code: file, line and error type, never the error message

No pictures, file names, titles, transcripts or other content of the world are sent, and nothing the players do is counted.

## Debug file

For bug reports, the GM saves one file about all of Sephral’s modules in this world: `Save debug file` in the module settings, or `Save Debug File (Sephral’s Modules)` in the context menu of a chat message. It holds the versions of Foundry, the system and the active modules, the settings of the modules and what they recorded, for Handout Lens whether the viewer runs or a conflicting module keeps it off, the picture shown last, the number of pictures with reading sections and transcripts and the open viewers. Transcripts and the handout folders are counted, not copied. Macros call `game.modules.get("sephrals-handout-lens").api.saveDebugFile()`.

The file contains chat text and whispers. Check it before you share it.

## Sephral’s Modules

The first button in the module settings, *Sephral’s Modules* (GMs only), opens one window for all of Sephral's modules in the world: the version, self test, settings, manual and demo video of each, a button that switches on an installed module that is off (Foundry then reloads the world for everyone), and the debug file. Below, *More from Sephral* lists other modules that fit the game system of the world, shown only after a click, each with its demo video. The list is part of the module. Only a video you start is loaded, from the module page on GitHub.

## Storage

* Reading sections, transcripts and speech languages are kept in the world settings, by picture file. Back up the world to keep them.
* Each user's handout folder is kept in the world as a setting of that user. It holds the file paths and titles, not the pictures.
* The picture the GM showed last is kept in the world settings for players who connect later.
* The last view of each picture (part, angle, reading aids) stays in your browser.

## Compatibility

* Foundry VTT 13 and 14, any game system.
* Videos in image windows can be zoomed and moved, the lens only works on pictures.
* While Handout Ping Viewer or Gambit's Image Viewer is active, Handout Lens leaves the image windows to that module and tells the GM once. The handout folder keeps working.
* Reading aloud uses the voices of the browser or the operating system. Without a voice for the chosen language, the browser picks one.
* When the browser does not allow full screen, the reading mode fills the browser window instead.

## API

`game.modules.get("sephrals-handout-lens").api`:

| Function | Does |
| --- | --- |
| `open({src, title, caption})` | Opens a picture in the image window with the viewer |
| `openFolder()` | Opens the handout folder of this user |
| `folder()` | The entries of this user's handout folder |
| `addToFolder({src, title, caption})` | Puts a picture into this user's handout folder |
| `handout(src)` | The reading sections, transcript and speech language of a picture |
| `viewers()`, `viewerOf(app)` | The open viewers, the viewer of an image window |
| `shareView(app)` | Shows the picture of an image window to all players at the GM's zoom (GM) |
| `closeForAll(src)` | Closes a picture on every other screen (GM) |
| `runSelfTest()` | The self test (GM) |
| `saveDebugFile()` | Saves the debug file of Sephral’s modules (GM) |
