"use strict";

// Forked from maschine mk3 server.

import WebSocket from "ws";
import Configstore from "configstore";
import blessed from 'blessed';
import bcontrib from 'blessed-contrib';

import { BrainConnection } from "./brain/conn.js";
import { BrainBoss } from "./brain/boss.js";

import { VisibilityTracker } from "./visibility_tracker.js";
import { BookmarkManager } from "./bookmark_manager.js";
import { TaskManager } from "./task_manager.js";

import { ControllerDriver } from "./controller/f1/controller_driver.js";
import { ModeDispatcher } from "./controller/f1/mode_dispatcher.js";
import { BookmarkMode } from "./controller/maschine3/modes/bookmark_mode.js";

import { ActionBookmarkMode } from "./controller/maschine3/modes/action_bookmark_mode.js";

import { DeckControllerDriver } from "./controller/streamdeck/controller_driver.js";

import { RGBColorHelper } from "./rgb_color_helper.js";

let gBookmarkManager: BookmarkManager;
let gBrainBoss: BrainBoss;
let gConfigstore: Configstore;
let gControllerDriver: ControllerDriver;
let gSecondaryController: DeckControllerDriver;
let gControllers = [];
let gDispatcher: ModeDispatcher;
let gVisibilityTracker: VisibilityTracker;
let gTaskManager: TaskManager;

let guiScreen: blessed.Widgets.Screen;
let guiLayout: blessed.Widgets.LayoutElement;
let guiClients: bcontrib.Widgets.TableElement;
let guiVisibilityReport: bcontrib.Widgets.TableElement;
let guiVisDump: blessed.Widgets.BoxElement;
let guiDumpTabList: blessed.Widgets.ListbarElement;
let selectedDumpMode = 'logDetail';
let logDetail = '';
let guiDump: blessed.Widgets.BoxElement;
let guiLogEntries: { label: any; str: any; details: any; }[];
let guiLog: blessed.Widgets.Log;
let guiFocusRendered = false;

const CONFIG_VERSION = 1;
const GUI_LOG_MAX_LINES = 300;

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
    if (gControllerDriver) {
      try {
        gControllerDriver.controller.device.close();
      } catch (ex) {
        console.warn('error closing primary controller', ex);
      }
    }
    if (gSecondaryController) {
      try {
        gSecondaryController.close()
      } catch (ex) {
        console.warn('error closing secondary controller', ex);
      }
    }
    try {
      gServer.close();
    } catch (ex) {
      console.warn('error closing server', ex);
    }
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

  guiDumpTabList = blessed.listbar({
    parent: guiLayout,
    label: 'Thing to dump:',
    width: '100%',
    border: {
      type: 'line',
      fg: 'gray'
    },
    interactive: true,
    keys: true,
    mouse: true,
    clickable: true,
    autoCommandKeys: true,
    commands: {
      'Log Detail': {
        callback() {
          selectedDumpMode = 'logDetail';
          blessedDirtied();
        },
      },
      'Client Most Recent': {
        callback() {
          selectedDumpMode = 'clientMessage';
          blessedDirtied();
        }
      },
      'Client Latched Messages': {
        callback() {
          selectedDumpMode = 'clientMessagesByType';
          blessedDirtied();
        }
      },
      'Container ID Lookups': {
        callback() {
          selectedDumpMode = 'containerIdLookups';
          blessedDirtied();
        }
      }
    }
  })

  let dumpHeight;
  if (guiScreen.height > 100) {
    dumpHeight = 30;
  } else {
    dumpHeight = 16;
  }

  guiDump = blessed.box({
    parent: guiLayout,
    label: 'Dump',
    height: dumpHeight,
    width: '100%',
    border: {
      type: 'line',
      fg: 'gray'
    },
    align: 'left',
    tags: true,
    content: '',
    interactive: true,
    keys: true,
    mouse: true,
    clickable: true,
    scrollable: true
  });

  guiLogEntries = [];
  guiLog = blessed.log({
    parent: guiLayout,
    label: 'Log',
    scrollback: GUI_LOG_MAX_LINES,
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
  guiLog.on('click', (data) => {
    // subtract off one for the border.
    const logRelLine = data.y - guiLog.atop - 1;
    // Then add the childBase to get to the actual visible line which is in
    // "real" space, which is what we have after wrapping occurs.  (Note that
    // the "fake" line-space is aware of all newslines, so we do require that
    // there are _no_ newlines in log entries, so we normalize them out.)
    const iRealLine = logRelLine + guiLog.childBase;
    // the "rtof" stands for "real to fake" which lets us map back to the
    // semantic underlying like, which is in "fake" space.
    const iLine = guiLog._clines.rtof[iRealLine];
    //hackLog(`dy: ${data.y}  guiLog.iy: ${guiLog.atop} ${guiLog.height} child: ${guiLog.childBase} scroll: ${guiLog.getScroll()}`);
    //data.y - guiLog.iy
    const info = guiLogEntries[iLine];
    if (!info) {
      return;
    }
    //hackLog(`mapped fake line ${iFakeLine} to ${iLine}`);
    // XXX The info.str was previously wrapped in {white-fg}{/white-fg} but
    // we need to improve the escaped/unescaped delineation for that to work.
    // Right now JSON blobs can have things that look like tags and so we're
    // currently escaping the entire string at the point of injection into the
    // blessed UI.
    logDetail = `${info.str}

${JSON.stringify(info.details, null, 2)}`;
    guiDumpTabList.select(0);
  });

  guiClients.rows.on('select item', () => { blessedDirtied(); });

  // Start out with the clients list focused.
  guiClients.focus();
  blessedDirtied();
}

function makeLogFunc(label, color) {
  const prefix = `{${color}-fg}${label}{/${color}-fg} `;

  return function(str, details=null) {
    // Our click mapping requires that `str` not include newlines, although it's
    // okay if it ends up wrapping.
    const safeStr = (str || '<null>').replace(/\n/g, '\\n');
    guiLog.log(prefix + safeStr);
    guiLogEntries.push({ label, str, details });
    if (guiLogEntries.length > GUI_LOG_MAX_LINES) {
      guiLogEntries.shift();
    }
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

function blessedDirtied(contentStillValid=false) {
  if (pendingBlessedRender || activeBlessedRender) {
    return;
  }

  blessedContentStillValid = false;
  pendingBlessedRender = true;
  setTimeout(renderBlessed, 0);
}
function renderBlessed() {
  pendingBlessedRender = false;

  if (!blessedContentStillValid) {
    guiClients.setData(gBrainBoss.renderDebugState());

    // Maps are stable, use the index.
    const selectedConn : BrainConnection = Array.from(gBrainBoss.clientsByPrefix.values())[guiClients.rows.selected];
    guiVisibilityReport.setData({
      headers: ['State', 'Focus Slot Id', 'Container Id', 'Window Container Id'],
      data: selectedConn ? selectedConn.debugVisibilityInventory : []
    });

    let dumpContent = '';
    switch (selectedDumpMode) {
      case 'clientMessage':
        if (selectedConn) {
          dumpContent = selectedConn.renderDebugDump();
        }
        break;
      case 'clientMessagesByType':
        if (selectedConn) {
          dumpContent = JSON.stringify(selectedConn.debugMessages, null, 2);
        }
        break;

      case 'logDetail':
        dumpContent = logDetail;
        break;

      case 'containerIdLookups': {
        let entries = Array.from(gVisibilityTracker.windowContainerIdLookup.entries());
        let jsonFriendly = entries.map(([descriptor, containerIdSet]) => {
          let containerInfos = Array.from(containerIdSet).map((containerId) => {
            return gVisibilityTracker.containersByFullId.get(containerId);
          });
          return [descriptor, containerInfos];
        });
        dumpContent = JSON.stringify(jsonFriendly, null, 2);
        break;
      }
    }
    guiDump.setLabel(selectedDumpMode);
    guiDump.setContent(blessed.escape(dumpContent));
    guiDump.scrollTo(0);

    guiVisDump.setContent(gVisibilityTracker.renderDebugDump());
  }

  activeBlessedRender = true;
  guiScreen.render();
  activeBlessedRender = false;
  blessedContentStillValid = true;
  guiFocusRendered = true;
}

setupBlessed();

async function makeDefaultConfigController() {
  gNodeLog("start of controller creation");
  const configstore = new Configstore("taskolio-f1");
  gNodeLog("got config");
  const colorHelper = new RGBColorHelper();
  gNodeLog("got colorHelper");

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
    log: makeLogFunc('bookmarkManager', 'yellow'),
  });

  const dispatcher = new ModeDispatcher();
  brainBoss.notifyModes = dispatcher.notifyModes.bind(dispatcher);

  gNodeLog("about to init TaskManager");
  const taskManager = new TaskManager({
    log: makeLogFunc('taskManager', 'green'),
    taskStorage: configstore.get('taskStorage'),
    updateUI: () => {
      if (gControllerDriver) {
        // This also updates the HTML.  Such misnomer.
        gControllerDriver.updateLEDs();
      }
      if (gSecondaryController) {
        gSecondaryController.updateLEDs();
      }
    },
    updateTaskStorage: (taskStorage) => {
      configstore.set('taskStorage', taskStorage);
    },
    notifyModesTaskChanged: (...args) => {
      return dispatcher.notifyModes('onCurrentTaskChanged', ...args);
    }
  });
  gNodeLog("TaskManager inited");

  const updateHTML = () => {
    // The controller driver may not exist yet.
    if (gControllerDriver) {
      return gControllerDriver.updateHTML();
    }
    if (gSecondaryController) {
      gSecondaryController.updateHTML();
    }
  };

  gNodeLog("About to init bookmarks");
  const bookmarkMode = new BookmarkMode({
    bookmarkManager,
    dispatcher,
    persistedState: configstore.get('bookmarks'),
    saveBookmarks(state) {
      configstore.set('bookmarks', state);
    },
    colorHelper,
    log: makeLogFunc('bookmarkMode', 'gray')
  });

  gNodeLog("about to init action bookmarks");
  const actionBookmarkMode = new ActionBookmarkMode({
    brainBoss,
    persistedState: configstore.get('actionBookmarks'),
    saveState(state) {
      configstore.set('actionBookmarks', state);
    },
    log: makeLogFunc('actionBookmark', 'green')
  });

  gNodeLog("about to init dispatcher");
  dispatcher.init({
    rootModes: [
      actionBookmarkMode,
      bookmarkMode
    ],

    log: makeLogFunc('dispatcher', 'red'),
  });
  gNodeLog("about to create F1 ControllerDriver");
  const controllerDriver = new ControllerDriver();
  await controllerDriver.init({
    dispatcher,
    log: makeLogFunc('controllerDriver', 'red'),
    colorHelper,
  });

  gBookmarkManager = bookmarkManager;
  gBrainBoss = brainBoss;
  gConfigstore = configstore;
  gControllerDriver = controllerDriver;
  gDispatcher = dispatcher;
  gVisibilityTracker = visibilityTracker;
  gTaskManager = taskManager;

  // no streamdeck support for now
  /*
  try {
    gSecondaryController = new DeckControllerDriver({
      dispatcher,
      log: makeLogFunc('deckDriver', 'red'),
      asyncRenderHTML: (args) => {
        return brainBoss.asyncRenderHTML(args);
      },
      colorHelper: null,
    });
  }
  catch (ex) {
    // no streamdeck.
  }
  */

  gControllerDriver.updateLEDs();
  if (gSecondaryController) {
    gSecondaryController.updateLEDs();
  }
}

let gServer: WebSocket.Server;

const run = async (port: number) => {
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
    verifyClient(info: { origin: string; }) {
      // Firefox is now sending "null" for WebExtensions... although it's
      // believable our stack is coercing this to a string?  Or maybe Firefox
      // does.  The key thing is that we just don't want to listen to web
      // origins.  But we should be further securing things like requiring a
      // hello message that allows for pairing.  (Like the server can use the
      // device to confirm that the new client is allowed and give it a name
      // or something.  Until then, the client lives in a jail.)
      const noOrigin = !info.origin || info.origin === '' || info.origin === 'null';
      const isFileOrigin = info.origin === 'file://';
      // Firefox recently changed its behavior to not expose this prefix because
      // of fingerprinting concerns.  (The UUIDs can be per-user.)
      const isWebExtOrigin = info.origin && /^moz-extension:/.test(info.origin);
      const allowed = noOrigin || isFileOrigin || isWebExtOrigin;

      gNodeLog(`client origin: ${info.origin} allowed?: ${allowed}`);

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

const gNodeLog = makeLogFunc('node', 'red');
process.on('unhandledRejection', (reason: any, promise) => {
  gNodeLog('unhandledRejection: ' + reason.message + "\n" + reason.stack, { stack: reason.stack });
});

try {
  gNodeLog('creating controller');
  await makeDefaultConfigController();
  gNodeLog('starting server');
  run(8008);
  gNodeLog('triggering blessed re-render');
  blessedDirtied();
} catch (ex) {
  gNodeLog("error: " + ex + "\n" + ex.stack);
}
