"use strict";

const http = require("http");
const api = require("api.io");

const { ControllerDriver } = require("./controller/controller_driver");
const { ModeDispatcher } = require("./controller/mode_dispatcher");
const { BookmarkMode } = require("./controller/modes/bookmark_mode");

let gDispatcher;
let gControllerDriver;

function makeDefaultConfigController() {
  const dispatcher = new ModeDispatcher();
  const bookmarkMode = new BookmarkMode({ dispatcher });
  dispatcher.init({
    rootModes: [
      bookmarkMode
    ],
  });
  const controllerDriver = new ControllerDriver({ dispatcher });

  gDispatcher = dispatcher;
  gControllerDriver = controllerDriver;

  gControllerDriver.updateLEDs();
}

// Registers the api with the name myApi
const taskolioApi = api.register("taskolio", {
  helloMyNameIs: api.export((session, data) => {
  }),
  focusSlotsInventory: api.export(async (session, data) => {
  }),
  thingsExist: api.export((session, data) => {
  }),
  thingsGone: api.export((session, data) => {
  }),
  thingsVisibilityInventory: api.export((session, data) => {
  }),
});

let server;

const run = async (port) => {
  server = new http.Server();
  await api.start(server);
  server.listen(port);
};

const stop = async () => {
  await api.stop();

  server.close();
};

makeDefaultConfigController();
run();