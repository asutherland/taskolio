/**
 * This file is most recently cloned from taskolio-atom-client, which in turn
 * derived it from taskolio-vscode-client which in turn was derived from the
 * gnome-shell client.
 **/

export default class TaskolioClient {
  constructor(settings) {
    this._settings = settings;

    this.state = 'disconnected';
    this.shutdownRequested = false;

    this._timeoutId = 0;

    this.connect();
  }

  connect() {
    console.log("taskolio connecting");
    this.state = 'connecting';

    this.ws = new WebSocket(this._settings.endpoint);
    this.ws.addEventListener('open', this.onConnected.bind(this));
    this.ws.addEventListener('message', this.onMessage.bind(this));
    this.ws.addEventListener('error', this.onError.bind(this));
    this.ws.addEventListener('close', this.onClosed.bind(this));
  }

  sendMessage(type, payload, id) {
    if (!this.ws) {
      return;
    }

    const obj = { type, payload };
    if (id) {
      obj.id = id;
    }

    this.ws.send(JSON.stringify(obj));
  }

  onConnected() {
    console.log("taskolio connected");
    this.state = 'connected';

    this._settings.onConnect();
  }

  onMessage(rawData) {
    rawData = rawData.data;
    let data;
    try {
      data = JSON.parse(rawData);
    } catch (ex) {
      if (ex) {
        console.error("problem parsing JSON:", ex);
        console.log("JSON was:", { rawData });
      }
      return;
    }

    const handlerName = `onMessage_${data.type}`;

    const replyFunc = (replyMsg) => {
      this.sendMessage('reply', replyMsg, data.id);
    };

    this._settings[handlerName](data.payload, replyFunc);
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
    console.log("taskolio connection error:", err);
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
