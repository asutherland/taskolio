const Soup = imports.gi.Soup;

/**
 * An allegedly auto-reconnecting websocket connection to the server.
 */
const TaskolioClient = new Lang.Class({
  name: "TaskolioClient",

  _init: function(settings) {
    this._settings = settings;

    this.state = 'disconnected';
    this.shutdownRequested = false;

    this._timeoutId = 0;

    this.connect();
  },

  connect() {
    this.state = 'connecting';

    const httpSession = this._httpSession =
      new Soup.Session({ ssl_use_system_ca_file: true });
    httpSession.httpsAliases = ["wss"];

    const message = new Soup.Message({
      method: "GET",
      uri: new Soup.URI(settings.endpoint),
    });
    httpSession.websocket_connect_async(
      message, null, null, null, this.onConnected.bind(this));
  },

  sendMessage(type, payload) {
    if (!this._websocketConnection) {
      return;
    }

    const obj = { type, payload };

    this._websocketConnection.send_text(JSON.stringify(obj));
  },

  onConnected(session, res) {
    // XXX this may throw on error?  Not sure how the bindings map.
    this._websocketConnection = session.websocket_connect_finish(res);
    if (!this._websocketConnection) {
      this.onClosed();
      return;
    }
    this.state = 'connected';

    try {
      this._cb_onConnect()
    } catch (ex) {
      this._settings.onConnect();
    }

    this._websocketConnection.connect('message', this.onMessage.bind(this));
    this._websocketConnection.connect('closed', this.onClosed.bind(this));
  },

  onMessage(connection, type, message) {
    const data = JSON.parse(message.get_data());

    const handlerName = `onMessage_${data.type}`;

    this._settings[handlerName](data.payload);
  },

  /**
   * On close, notify about our disconnect and
   */
  onClosed(connection) {
    // XXX uh, will the signals clean up after themselves?  Will something
    // assert?  So many questions...
    this._websocketConnection = null;
    this._httpSession = null;

    // Only notify disconnection if we previously notified connection;
    if (this.state === 'connected') {
      this._settings.onDisconnect();
    }

    this.state = 'disconnected';

    if (!this.shutdownRequested && !this._timeoutId) {
      this.state = 'waiting';
      this._timeoutId = Mainloop.timeout_add(5000, () => {
        this._timeoutId = 0;
        if (this.state === 'waiting') {
          this.connect();
        }

        return GLib.SOURCE_REMOVE;
      });
      GLib.Source.set_name_by_id(this._timeoutId,
                                 '[gnome-shell] ext: taskolio connect timer');
    }
  },

  shutdown() {
    this.shutdownRequested = true;
    this.close();
  },

  close() {
    if (this._websocketConnection) {
      this._websocketConnection.close(Soup.WebsocketCloseCode.NORMAL, '');
    }
  }
});