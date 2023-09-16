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

    // We should already have cleared any prior session and connection, but just
    // in case...
    this._cleanup();

    // Let's only ever create one session.
    let httpSession = this._httpSession;
    if (!httpSession) {
      httpSession = this._httpSession =
        new Soup.Session();
      httpSession.httpsAliases = ["wss"];
    }

    const message = Soup.Message.new(
      "GET",
      this._settings.endpoint
    );
    httpSession.websocket_connect_async(
      message, null, null, /* normal */ 2, null, this.onConnected.bind(this));
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

    this._cleanup();

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

  _cleanup() {
    // So, we were absolutely leaking file descriptors before if the daemon
    // wasn't running and the auto-reconnect kept firing.  So now we are trying
    // to more reliably clean everything up, so we'll close/abort things even
    // if they should presumably already be in that state.
    if (this._websocketConnection) {
      try {
        this._websocketConnection.close(Soup.WebsocketCloseCode.NORMAL, '');
      } catch (ex) {
        // Nothing to do.
      }
      this._websocketConnection = null;
    }
    if (this._httpSession) {
      try {
        this._httpSession.abort();
      } catch (ex) {
        // Nothing to do.
      }
      // Leave the session around to be reused.
    }
  },

  onError(connection, err) {
    global.log("taskolio connection error: " + err);
  },

  shutdown() {
    this.shutdownRequested = true;
    // paranoia: seeing multiple events happening, want to more aggressively
    // trigger disconnect logic.  For now we'll just require that the disconnect
    // logic is idempotent;
    this._settings.onDisconnect();
    this.close();
  },

  close() {
    this._cleanup();
  }
});
