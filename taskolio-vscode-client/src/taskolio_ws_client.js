const WebSocket = require('ws');

/**
 * The gnome-shell TaskolioClient ported over to ES6-supportiung node.js and the
 * "ws" module from the weird gjs Lang.Class mechanism and libsoup for
 * WebSockets.  I'm maintaining the same event-handling idiom used there rather
 * than going node.js EventEmitter.
 */
class TaskolioClient {
  constructor(settings) {
    this._settings = settings;

    this.state = 'disconnected';
    this.shutdownRequested = false;

    this._timeoutId = null;

    this.connect();
  }

  connect() {
    console.log("taskolio connecting");
    this.state = 'connecting';

    this.ws = new WebSocket(this._settings.endpoint);
    this.ws.on('open', this.onConnected.bind(this));
    this.ws.on('message', this.onMessage.bind(this));
    this.ws.on('error', this.onError.bind(this));
    this.ws.on('close', this.onClosed.bind(this));
  }

  sendMessage(type, payload) {
    if (!this.ws) {
      return;
    }

    const obj = { type, payload };

    this.ws.send(JSON.stringify(obj));
  }

  onConnected() {
    console.log("taskolio connected");
    this.state = 'connected';

    this._settings.onConnect();
  }

  onMessage(rawData) {
    const data = JSON.parse(rawData);

    const handlerName = `onMessage_${data.type}`;

    if (handlerName in this._settings) {
      this._settings[handlerName](data.payload);
    } else {
      console.warn("Unhandled message type:", data.type);
    }
  }

  /**
   * On close, notify about our disconnect and schedule an auto-reconnect.  This
   * handler is also used if we fail to connect.
   */
  onClosed() {
    // if we've already transitioned to disconnected/waiting, just leave
    // immmediately, but leave a log message for debugging assistance.
    if (this.state === 'disconnected' ||
        this.state === 'waiting') {
      console.log("taskolio redundant close notification, ignored.");
      return;
    }

    console.log("taskolio disconnected, shutdown requested: " +
               this.shutdownRequested + ", timeoutId: " + this._timeoutId);

    this.ws = null;

    // Only notify disconnection if we previously notified connection;
    if (this.state === 'connected') {
      this._settings.onDisconnect();
      this.state = 'disconnected';
    }

    if (!this.shutdownRequested && !this._timeoutId) {
      this.state = 'waiting';
      this._timeoutId = setTimeout(() => {
        console.log("taskolio reconnect wakeup, state: " + this.state);
        this._timeoutId = 0;
        if (this.state === 'waiting') {
          this.connect();
        }
      }, 5000);
    }
  }

  onError(err) {
    console.log("taskolio connection error: " + err);
  }

  shutdown() {
    this.shutdownRequested = true;
    this.close();
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

module.exports.TaskolioClient = TaskolioClient;
