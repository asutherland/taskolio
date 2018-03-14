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
  }

  onMessage(data) {
    const obj = JSON.parse(data);
    //console.log('message', obj.type, obj.payload);

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
  }

  onMessage_focusSlotsInventory(msg) {
    this.visibilityTracker.processFocusSlotsInventory(
      this.idPrefix, msg.focusSlots);
  }

  onMessage_thingsExist(msg) {
    this.visibilityTracker.processThingsExist(this.idPrefix, msg.items);
  }

  onMessage_thingsGone(msg) {
    this.visibilityTracker.processThingsGone(this.idPrefix, msg.items);
  }

  onMessage_thingsVisibilityInventory(msg) {
    this.visibilityTracker.processThingsVisibilityInventory(
      this.idPrefix, msg.inventory);
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