"use strict";

const WebSocket = require("ws");
const Configstore = require("configstore");

const { BrainConnection } = require("./brain/conn");
const { BrainBoss } = require("./brain/boss");

const { VisibilityTracker } = require("./visibility_tracker");
const { BookmarkManager } = require("./bookmark_manager");

const { ControllerDriver } = require("./controller/f1/controller_driver");
const { ModeDispatcher } = require("./controller/f1/mode_dispatcher");
const { BookmarkMode } = require("./controller/f1/modes/bookmark_mode");

let gBookmarkManager;
let gBrainBoss;
let gConfigstore;
let gControllerDriver;
let gDispatcher;
let gVisibilityTracker;

function makeDefaultConfigController() {
  const configstore = new Configstore("taskolio");

  const brainBoss = new BrainBoss();

  const visibilityTracker = new VisibilityTracker();
  const bookmarkManager = new BookmarkManager({
    brainBoss,
    visibilityTracker
  });

  const dispatcher = new ModeDispatcher();
  const bookmarkMode = new BookmarkMode({
    bookmarkManager,
    dispatcher,
    persistedState: configstore.get('bookmarks'),
    saveBookmarks(state) {
      configstore.set('bookmarks', state);
    }
  });
  dispatcher.init({
    rootModes: [
      bookmarkMode
    ],
  });
  const controllerDriver = new ControllerDriver({ dispatcher });

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
      const allowed = noOrigin || isFileOrigin;

      console.log("client origin:", info.origin, "allowed?", allowed);

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

const stop = async () => {
  await api.stop();

  server.close();
};

makeDefaultConfigController();
run(8008);
