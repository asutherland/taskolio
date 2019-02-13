"use strict";

const WebSocket = require("ws");
const Configstore = require("configstore");
const blessed = require('blessed');
const bcontrib = require('blessed-contrib');

const { BrainConnection } = require("./brain/conn");
const { BrainBoss } = require("./brain/boss");

const { VisibilityTracker } = require("./visibility_tracker");
const { BookmarkManager } = require("./bookmark_manager");

const { ControllerDriver } = require("./controller/maschine3/controller_driver");
const { ModeDispatcher } = require("./controller/maschine3/mode_dispatcher");
const { BookmarkMode } = require("./controller/maschine3/modes/bookmark_mode");
const { TabsOnDisplayButtonsMode } = require("./controller/maschine3/modes/tabs_on_display_buttons_mode");

const { ColorHelper } = require("./indexed_color_helper");

let gBookmarkManager;
let gBrainBoss;
let gConfigstore;
let gControllerDriver;
let gDispatcher;
let gVisibilityTracker;

let guiScreen;
let guiClients;
let guiVisibilityReport;

const CONFIG_VERSION = 1;

///// EXPERIMENTAL ncurses-style blessed UI to aid understanding of server state
// Our general strategy here is react-ish based.  We just schedule a complete
// redraw anytime anything happens.
function setupBlessed() {
  guiScreen = blessed.screen({
    debug: true,
    bg: 'blue'
  });
  guiScreen.key(['escape', 'q', 'C-c'], function(ch, key) {
    return process.exit(0);
  });

  guiClients = bcontrib.table({
    parent: guiScreen,
    height: 16,
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
  });

  guiVisibilityReport = bcontrib.table({
    parent: guiScreen,
    label: 'Client Focus Slots Inventory',
    top: 17,
    border: {
      type: 'line',
      fg: 'gray'
    },
    align: 'left',
    columnWidth: [8, 32, 64],
    data: {
      headers: ['State', 'Focus Slot Id', 'Container Id'],
      data: []
    }
  })

  guiClients.rows.on('select item', () => { blessedDirtied(); });

  // Start out with the clients list focused.
  guiClients.focus();
}

// Track if there's an outstanding setTimeout for a render, and also if we're
// actively inside a render.  ('select item' will be synthetically generated
// when we mutate our state, so it's important to avoid recursively triggering
// our naive/dumb render function.)
let pendingBlessedRender = false;
let activeBlessedRender = false;
function blessedDirtied() {
  if (pendingBlessedRender || activeBlessedRender) {
    return;
  }

  pendingBlessedRender = true;
  setTimeout(renderBlessed, 0);
}
function renderBlessed() {
  pendingBlessedRender = false;

  guiClients.setData(gBrainBoss.renderDebugState());

  // Maps are stable, use the index.
  const selectedConn = Array.from(gBrainBoss.clientsByPrefix.values())[guiClients.rows.selected];
  guiVisibilityReport.setData({
    headers: ['State', 'Focus Slot Id', 'Container Id'],
    data: selectedConn ? selectedConn.debugVisibilityInventory : []
  });

  activeBlessedRender = true;
  guiScreen.render();
  activeBlessedRender = false;
}

setupBlessed();

function makeDefaultConfigController() {
  const configstore = new Configstore("taskolio-maschine3");

  if (configstore.get('version') !== CONFIG_VERSION) {
    configstore.clear();
    configstore.set('version', CONFIG_VERSION);
  }

  const brainBoss = new BrainBoss({
    debugStateUpdated: blessedDirtied
  });

  const visibilityTracker = new VisibilityTracker({
    brainBoss
  });
  const bookmarkManager = new BookmarkManager({
    brainBoss,
    visibilityTracker,
    colorHelper: ColorHelper
  });

  const dispatcher = new ModeDispatcher();
  brainBoss.notifyModes = dispatcher.notifyModes.bind(dispatcher);

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
    updateHTML: () => {
      // The controller driver may not exist yet.
      if (gControllerDriver) {
        return gControllerDriver.updateHTML();
      }
    }
  });

  dispatcher.init({
    rootModes: [
      tabsOnTopMode,
      bookmarkMode
    ],
  });
  const controllerDriver = new ControllerDriver({
    dispatcher,
    asyncRenderHTML: (args) => {
      return brainBoss.asyncRenderHTML(args);
    }
  });

  gBookmarkManager = bookmarkManager;
  gBrainBoss = brainBoss;
  gConfigstore = configstore;
  gControllerDriver = controllerDriver;
  gDispatcher = dispatcher;
  gVisibilityTracker = visibilityTracker;

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
