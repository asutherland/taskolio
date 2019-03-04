"use strict";

const WebSocket = require("ws");
const Configstore = require("configstore");
const blessed = require('blessed');
const bcontrib = require('blessed-contrib');

const { BrainConnection } = require("./brain/conn");
const { BrainBoss } = require("./brain/boss");

const { VisibilityTracker } = require("./visibility_tracker");
const { BookmarkManager } = require("./bookmark_manager");
const { TaskManager } = require("./task_manager");

const { ControllerDriver } = require("./controller/maschine3/controller_driver");
const { ModeDispatcher } = require("./controller/maschine3/mode_dispatcher");
const { BookmarkMode } = require("./controller/maschine3/modes/bookmark_mode");
const { TabsOnDisplayButtonsMode } = require("./controller/maschine3/modes/tabs_on_display_buttons_mode");

const { TaskDisplayMode } = require("./controller/maschine3/modes/task_display_mode");
const { TaskPickerMode } = require("./controller/maschine3/modes/task_picker_mode");
const { TaskSlotMode } = require("./controller/maschine3/modes/task_slot_mode");

const { ActionBookmarkMode } = require("./controller/maschine3/modes/action_bookmark_mode");

const { ColorHelper } = require("./indexed_color_helper");

let gBookmarkManager;
let gBrainBoss;
let gConfigstore;
let gControllerDriver;
let gDispatcher;
let gVisibilityTracker;
let gTaskManager;

let guiScreen;
let guiLayout;
let guiClients;
let guiVisibilityReport;
let guiVisDump;
let guiClientDump;
let guiLog;
let guiFocusRendered = false;

const CONFIG_VERSION = 1;

///// EXPERIMENTAL ncurses-style blessed UI to aid understanding of server state
// Our general strategy here is react-ish based.  We just schedule a complete
// redraw anytime anything happens.
function setupBlessed() {
  guiScreen = blessed.screen({
    debug: true,
    autoPadding: true,
    ignoreLocked: ['C-c'],
  });

  guiLayout = blessed.layout({
    parent: guiScreen,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  });

  // Hook up keys to quit.
  guiScreen.key(['escape', 'q', 'C-c'], function(ch, key) {
    return process.exit(0);
  });

  // Hook up tab to move focus between widgets.
  guiScreen.key(['tab'], function(ch, key) {
    return key.shift
      ? guiScreen.focusPrevious()
      : guiScreen.focusNext();
  });

  // When cycling focus, update borders.
  guiScreen.on('element focus', function(cur, old) {
    if (old.border) {
      old.style.border.fg = 'gray';
    } else if (old.parent.border) {
      old.parent.style.border.fg = 'gray';
    }
    if (cur.border) {
      cur.style.border.fg = 'green';
    } else if (cur.parent.border) {
      cur.parent.style.border.fg = 'green';
    }
    if (guiFocusRendered) {
      guiFocusRendered = false;
      blessedDirtied();
    }
  });

  guiClients = bcontrib.table({
    parent: guiLayout,
    height: 16,
    width: '100%',
    label: 'Clients',
    border: {
      type: 'line',
      fg: 'gray'
    },
    align: 'left',
    columnWidth: [16, 16, 64],
    data: {
      headers: ['Type', 'Name', 'UniqueId'],
      data: []
    },
    interactive: true,
    keys: true,
    mouse: true,
    clickable: true,
  });
  guiClients.rows.mouse = true;

  guiVisibilityReport = bcontrib.table({
    parent: guiLayout,
    label: 'Client Focus Slots Inventory',
    height: 10,
    width: '100%',
    border: {
      type: 'line',
      fg: 'gray'
    },
    align: 'left',
    columnWidth: [8, 24, 40, 64],
    data: {
      headers: ['State', 'Focus Slot Id', 'Container Id', 'Window Container Id'],
      data: []
    },
    interactive: true,
    keys: true,
    mouse: true,
    clickable: true,
  });
  guiVisibilityReport.rows.mouse = true;

  guiVisDump = blessed.box({
    parent: guiLayout,
    label: 'Visibility Tracker Info',
    height: 8,
    width: '100%',
    border: {
      type: 'line',
      fg: 'gray'
    },
    align: 'left',
    content: '',
    interactive: true,
    keys: true,
    mouse: true,
    clickable: true,
  });

  guiClientDump = blessed.box({
    parent: guiLayout,
    label: 'Client Most Recent Message',
    height: 30,
    width: '100%',
    border: {
      type: 'line',
      fg: 'gray'
    },
    align: 'left',
    content: '',
    interactive: true,
    keys: true,
    mouse: true,
    clickable: true,
  });

  guiLog = blessed.log({
    parent: guiLayout,
    label: 'Log',
    // height will be auto-calculated since we omitted it.
    width: '100%',
    tags: true,
    border: {
      type: 'line',
      fg: 'gray'
    },
    interactive: true,
    keys: true,
    mouse: true,
    clickable: true,
  });

  guiClients.rows.on('select item', () => { blessedDirtied(); });

  // Start out with the clients list focused.
  guiClients.focus();
}

function makeLogFunc(label, color) {
  const prefix = `{${color}-fg}${label}{gray-fg} `;

  return function(str) {
    guiLog.log(prefix + str);
    blessedDirtied(true);
  };
}

// Track if there's an outstanding setTimeout for a render, and also if we're
// actively inside a render.  ('select item' will be synthetically generated
// when we mutate our state, so it's important to avoid recursively triggering
// our naive/dumb render function.)
let pendingBlessedRender = false;
let activeBlessedRender = false;
// In some cases like guiLog blessed is maintaining the state and we don't need
// to rebuild our concept of state.
let blessedContentStillValid = false;

function blessedDirtied(contentStillValid) {
  // Make sure we invalidate the blessed contents before checking whether we
  // have a render in flight.
  if (!contentStillValid) {
    blessedContentStillValid = false;
  }

  if (pendingBlessedRender || activeBlessedRender) {
    return;
  }

  pendingBlessedRender = true;
  setTimeout(renderBlessed, 0);
}
function renderBlessed() {
  pendingBlessedRender = false;

  if (!blessedContentStillValid) {
    guiClients.setData(gBrainBoss.renderDebugState());

    // Maps are stable, use the index.
    const selectedConn = Array.from(gBrainBoss.clientsByPrefix.values())[guiClients.rows.selected];
    guiVisibilityReport.setData({
      headers: ['State', 'Focus Slot Id', 'Container Id', 'Window Container Id'],
      data: selectedConn ? selectedConn.debugVisibilityInventory : []
    });

    if (selectedConn) {
      guiClientDump.setContent(selectedConn.renderDebugDump());
    }

    guiVisDump.setContent(gVisibilityTracker.renderDebugDump());
  }

  activeBlessedRender = true;
  guiScreen.render();
  activeBlessedRender = false;
  blessedContentStillValid = true;
  guiFocusRendered = true;
}

setupBlessed();

function makeDefaultConfigController() {
  const configstore = new Configstore("taskolio-maschine3");
  const colorHelper = ColorHelper;

  if (configstore.get('version') !== CONFIG_VERSION) {
    configstore.clear();
    configstore.set('version', CONFIG_VERSION);
  }

  const brainBoss = new BrainBoss({
    debugStateUpdated: blessedDirtied,
    log: makeLogFunc('brainBoss', 'blue')
  });

  const visibilityTracker = new VisibilityTracker({
    brainBoss,
    log: makeLogFunc('visTracker', 'magenta')
  });
  const bookmarkManager = new BookmarkManager({
    brainBoss,
    visibilityTracker,
    colorHelper,
  });

  const taskManager = new TaskManager ();

  const dispatcher = new ModeDispatcher();
  brainBoss.notifyModes = dispatcher.notifyModes.bind(dispatcher);

  const updateHTML = () => {
    // The controller driver may not exist yet.
    if (gControllerDriver) {
      return gControllerDriver.updateHTML();
    }
  };

  const bookmarkMode = new BookmarkMode({
    bookmarkManager,
    dispatcher,
    persistedState: configstore.get('bookmarks'),
    saveBookmarks(state) {
      configstore.set('bookmarks', state);
    }
  });
  const tabsOnTopMode = new TabsOnDisplayButtonsMode({
    dispatcher,
    visibilityTracker,
    bookmarkMode,
    updateHTML,
    log: makeLogFunc('tabsOnTop', 'cyan')
  });

  const taskPickerMode = new TaskPickerMode({
    dispatcher,
    colorHelper,
    taskManager,
    updateHTML
  });
  const taskDisplayMode = new TaskDisplayMode({
    dispatcher,
    taskManager,
    taskPickerMode,
  });
  const taskSlotMode = new TaskSlotMode({
    dispatcher,
    colorHelper,
    persistedState: configstore.get('taskBookmarks'),
    saveTaskBookmarks: (taskBookmarks) => {
      configstore.set('taskBookmarks', taskBookmarks);
    }
  });

  const actionBookmarkMode = new ActionBookmarkMode({
    brainBoss,
    persistedState: configstore.get('actionBookmarks'),
    saveState(state) {
      configstore.set('actionBookmarks', state);
    },
    log: makeLogFunc('actionBookmark', 'green')
  });

  dispatcher.init({
    rootModes: [
      actionBookmarkMode,
      tabsOnTopMode,
      taskDisplayMode,
      taskSlotMode,
      bookmarkMode
    ],
  });
  const controllerDriver = new ControllerDriver({
    dispatcher,
    log: makeLogFunc('controllerDriver', 'red'),
    asyncRenderHTML: (args) => {
      return brainBoss.asyncRenderHTML(args);
    },
    colorHelper: ColorHelper
  });

  gBookmarkManager = bookmarkManager;
  gBrainBoss = brainBoss;
  gConfigstore = configstore;
  gControllerDriver = controllerDriver;
  gDispatcher = dispatcher;
  gVisibilityTracker = visibilityTracker;
  gTaskManager = taskManager;

  gControllerDriver.updateLEDs();
}

let gServer;

const run = async (port) => {
  gServer = new WebSocket.Server({
    port,
    // track the clients on gServer.clients so we don't have to.
    clientTracking: true,

    /**
     * Currently, we don't want to allow browsers to talk to us for security
     * reasons.  There's no CORS for websockets, just the origin header, so
     * we do need to decide based on this, because the browser won't fail the
     * connection due to lack of affirmative response.  We do want our
     * gnome-shell extension's libsoup connection though, and it (not conforming
     * to browser behavior) will have an empty origin.
     */
    verifyClient(info) {
      const noOrigin = !info.origin;
      const isFileOrigin = info.origin === 'file://';
      const isWebExtOrigin = info.origin && /^moz-extension:/.test(info.origin);
      const allowed = noOrigin || isFileOrigin || isWebExtOrigin;

      //console.log("client origin:", info.origin, "allowed?", allowed);

      return allowed;
    }
  });

  gServer.on("connection", (ws) => {
    const brainConn = new BrainConnection(ws, {
      brainBoss: gBrainBoss,
      visibilityTracker: gVisibilityTracker,
      triggerUpdate: () => {
        gControllerDriver.updateLEDs();
      }
    });
    // Am I allowed to stick random expandos on the ws?  Hope so!
    ws.brainConn = brainConn;
  });
};

makeDefaultConfigController();
run(8008);
blessedDirtied();
