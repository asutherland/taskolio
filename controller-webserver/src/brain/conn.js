class BrainConnection {
  constructor(ws, { brainBoss, visibilityTracker, triggerUpdate }) {
    this.ws = ws;
    this.brainBoss = brainBoss;
    this.visibilityTracker = visibilityTracker;
    this.triggerUpdate = triggerUpdate;

    ws.on('message', this.onMessage.bind(this));
    ws.on('close', this.onClose.bind(this));

    // The prefix for all containerId's and similar namespace-able things.
    this.idPrefix = '';
    // Is this the window manager client?
    this.isWM = false;

    // Have we successfully figured out the windows the connection's focus
    // slots are associated with?  This is meant to be sent only once, so this
    // variable handles suppression of redundant sends.
    this.focusSlotsLinked = false;
  }

  onMessage(data) {
    const obj = JSON.parse(data);
    console.log('\n===', this.idPrefix, obj.type);

    const handlerName = `onMessage_${obj.type}`;

    this[handlerName](obj.payload);
    // Trigger an update of the LEDs after processing every message.
    this.triggerUpdate();
  }

  onMessage_helloMyNameIs(msg) {
    // XXX we want to further namespace by client-type or other means of
    // avoiding collisions once we actually have multiple clients, for now,
    // for debugging sanity, let's keep things short.
    this.idPrefix = this.brainBoss.registerClient(this, msg);
    this.isWM = msg.type === 'window-manager';
  }

  onMessage_focusSlotsInventory(msg) {
    const mappedAllSlots = this.visibilityTracker.processFocusSlotsInventory(
      this.idPrefix, msg.focusSlots, this.isWM);

    // If all the slots were mapped to windows, then we tell the client so that
    // it can stop doing hacky things like tunneling process id's through
    // window titles.
    if (mappedAllSlots && !this.focusSlotsLinked) {
      this.focusSlotsLinked = true;
      this.sendMessage('focusSlotsLinked', {});
    }
  }

  onMessage_thingsExist(msg) {
    this.visibilityTracker.processThingsExist(
      this.idPrefix, msg.items, this.isWM);
  }

  onMessage_thingsGone(msg) {
    this.visibilityTracker.processThingsGone(
      this.idPrefix, msg.items, this.isWM);
  }

  onMessage_thingsVisibilityInventory(msg) {
    this.visibilityTracker.processThingsVisibilityInventory(
      this.idPrefix, msg.inventory, this.isWM);
  }

  onClose(code, reason) {
    this.visibilityTracker.evictMootPrefix(this.idPrefix);
    this.brainBoss.unregisterClient(this, this.idPrefix);
  }

  sendMessage(type, payload) {
    console.log('sending', type, payload);

    const obj = { type, payload };
    this.ws.send(JSON.stringify(obj));
  }
}

module.exports.BrainConnection = BrainConnection;