"use strict";

const WebSocket = require("ws");

const { BrainConnection } = require("./brain/conn");
const { BrainBoss } = require("./brain/boss");

const { VisibilityTracker } = require("./visibility_tracker");
const { BookmarkManager } = require("./bookmark_manager");

const { ControllerDriver } = require("./controller/controller_driver");
const { ModeDispatcher } = require("./controller/mode_dispatcher");
const { BookmarkMode } = require("./controller/modes/bookmark_mode");

let gBookmarkManager;
let gBrainBoss;
let gControllerDriver;
let gDispatcher;
let gVisibilityTracker;

function makeDefaultConfigController() {
  const brainBoss = new BrainBoss();

  const visibilityTracker = new VisibilityTracker();
  const bookmarkManager = new BookmarkManager({
    visibilityTracker
  });

  const dispatcher = new ModeDispatcher();
  const bookmarkMode = new BookmarkMode({
    bookmarkManager,
    dispatcher
  });
  dispatcher.init({
    rootModes: [
      bookmarkMode
    ],
  });
  const controllerDriver = new ControllerDriver({ dispatcher });

  gBookmarkManager = bookmarkManager;
  gBrainBoss = brainBoss;
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
      console.log("client origin:", info.origin);
      return !info.origin;
    }
  });

  gServer.on("connection", (ws) => {
    const brainConn = new BrainConnection(ws, {
      boss: gBrainBoss,
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