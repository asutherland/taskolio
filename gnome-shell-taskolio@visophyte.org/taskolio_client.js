const Soup = imports.gi.Soup;

const TaskolioClient = new Lang.Class({
  name: "TaskolioClient",

  _init: function(settings) {
    const httpSession = this._httpSession =
      new Soup.Session({ ssl_use_system_ca_file: true });
    httpSession.httpsAliases = ["wss"];

    const message = new Soup.Message({
      method: "GET",
      uri: new Soup.URI(settings.endpoint),
    });
    httpSession.websocket_connect_async(
      message, null, null, null,
      (session, res) => {
        this._websocketConnection = session.websocket_connect_finish(res);
        this._websocketConnection.connect(
          "message", (connection, type, message) => {
            const data = JSON.parse(message.get_data());
            this.onMessage(data);
          });
      });
  },

  close: function() {

  }
});