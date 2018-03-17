const Lang = imports.lang;
const Soup = imports.gi.Soup;
const Mainloop = imports.mainloop;
const GLib = imports.gi.GLib;


/**
 * An allegedly auto-reconnecting websocket connection to the server.
 */
var TaskolioClient = new Lang.Class({
  Name: "TaskolioClient",

  _init: function(settings) {
    this._settings = settings;

    this.state = 'disconnected';
    this.shutdownRequested = false;

    this._timeoutId = 0;

    this.connect();
  },

  connect() {
    global.log("taskolio connecting");
    this.state = 'connecting';

    const httpSession = this._httpSession =
      new Soup.Session({ ssl_use_system_ca_file: true });
    httpSession.httpsAliases = ["wss"];

    const message = new Soup.Message({
      method: "GET",
      uri: new Soup.URI(this._settings.endpoint),
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
    try {
      this._websocketConnection = session.websocket_connect_finish(res);
    } catch (ex) {
      global.log("taskolio connection error, will try and reconnect");
      this.onClosed();
      return;
    }

    global.log("taskolio connected");
    this.state = 'connected';

    try {
      this._settings.onConnect();
    } catch (ex) {
      global.log("taskolio connect handler threw: " + ex);
    }

    this._websocketConnection.connect('message', this.onMessage.bind(this));
    this._websocketConnection.connect('closed', this.onClosed.bind(this));
    this._websocketConnection.connect('error', this.onError.bind(this));
  },

  onMessage(connection, type, message) {
    const data = JSON.parse(message.get_data());

    const handlerName = `onMessage_${data.type}`;

    this._settings[handlerName](data.payload);
  },

  /**
   * On close, notify about our disconnect and schedule an auto-reconnect.  This
   * handler is also used if we fail to connect.
   */
  onClosed(connection) {
    // if we've already transitioned to disconnected/waiting, just leave
    // immmediately, but leave a log message for debugging assistance.
    if (this.state === 'disconnected' ||
        this.state === 'waiting') {
      global.log("taskolio redundant close notification, ignored.");
      return;
    }

    global.log("taskolio disconnected, shutdown requested: " +
               this.shutdownRequested + ", timeoutId: " + this._timeoutId);

    // XXX uh, will the signals clean up after themselves?  Will something
    // assert?  So many questions...
    this._websocketConnection = null;
    this._httpSession = null;

    // Only notify disconnection if we previously notified connection;
    if (this.state === 'connected') {
      this._settings.onDisconnect();
      this.state = 'disconnected';
    }



    if (!this.shutdownRequested && !this._timeoutId) {
      this.state = 'waiting';
      this._timeoutId = Mainloop.timeout_add(5000, () => {
        global.log("taskolio reconnect wakeup, state: " + this.state);
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

  onError(connection, err) {
    global.log("taskolio connection error: " + err);
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