/**
 * The maximum number of messages to buffer before disconnecting the connection.
 * Buffering happens when waiting for the window manager to connect.  The
 * window manager disconnects when the screen is locked, so if buffering happens
 * in that case, it can REALLY happen.  As covered at the site the constant is
 * used, those clients will reconnect and start buffering, so this is a
 * reasonable failsafe.
 *
 * The choice of 64 is arbitarily chosen so that clients aren't constantly in
 * a state of reconnecting but we also aren't having to process a massive
 * backlog of outdated information.
 */
const MAX_BUFFERED_MESSAGES = 64;

export class BrainConnection {
  ws: any;
  brainBoss: any;
  visibilityTracker: any;
  triggerUpdate: any;
  capabilities: any[];
  nextMsgId: number;
  awaitingReplies: Map<any, any>;
  idPrefix: string;
  isWM: boolean;
  clientType: string;
  clientName: string;
  clientUniqudId: string;
  receivedInitialSlots: boolean;
  focusSlotsLinked: boolean;
  debugMessages: {};
  debugSlotsInventory: any[];
  debugVisibilityInventory: any[];
  _mostRecentMessage: any;
  bufferingMessages: any;
  goodToGo: boolean;
  clientUniqueId: any;

  constructor(ws, { brainBoss, visibilityTracker, triggerUpdate, log}) {
    this.ws = ws;
    this.brainBoss = brainBoss;
    this.visibilityTracker = visibilityTracker;
    this.triggerUpdate = triggerUpdate;
    // This may be null.
    this.log = log;
    this.capabilities = [];
    this.nextMsgId = 1;
    /**
     * Maps from message id of expected reply to `resolve` function.
     */
    this.awaitingReplies = new Map();

    ws.on('message', this.onMessage.bind(this));
    ws.on('close', this.onClose.bind(this));

    // The prefix for all containerId's and similar namespace-able things.
    this.idPrefix = '';
    // Is this the window manager client?
    this.isWM = false;
    this.clientType = '';
    this.clientName = '';
    this.clientUniqudId = '';
    this.capabilities = [];

    // Track when we've received our initial focus slots inventory so that we
    // can let interested modes update in response.  We require that the slots
    // inventory come after the initial things inventory to simplify our logic.
    this.receivedInitialSlots = false;

    // Have we successfully figured out the windows the connection's focus
    // slots are associated with?  This is meant to be sent only once, so this
    // variable handles suppression of redundant sends.
    this.focusSlotsLinked = false;

    // ## Centrally tracked debug overviews for the client
    // updated by VisibilityTracker.processFocusSlotsInventory
    this.debugMessages = {};
    this.debugSlotsInventory = [];
    // updated by VisibilityTracker.processThingsVisibilityInventory
    this.debugVisibilityInventory = [];
    this._mostRecentMessage = null;

    /**
     * If a client connects and it's not the window-manager client and the
     * window-manager hasn't connected yet, we tell it to buffer by setting this
     * to an array for the messages to be stored in.  Later, the BrainBoss will
     * tell us to drain the buffer and stop buffering via
     * `stopBufferingAndProcessMessages`.
     */
    this.bufferingMessages = null;
    this.goodToGo = false;
  }

  renderDebugDump() {
    return JSON.stringify(this._mostRecentMessage, null, 2);
  }

  stopBufferingAndProcessMessages() {
    if (!this.bufferingMessages) {
      // If we aren't buffering, this potentially means that the WM restarted
      // and our client should help us out by reporting its initial connect info
      // dump, including any window title tunneling activities.
      this.sendMessage('pleaseReportState', {});
      return;
    }

    const buffered = this.bufferingMessages;
    this.bufferingMessages = null;

    for (const data of buffered) {
      this.onMessage(data);
    }
  }

  onMessage(data) {
    if (this.log) {
      this.log("received message", data);
    }
    if (this.bufferingMessages) {
      this.bufferingMessages.push(data);
      // Drop the connection if we've buffered too many messages.
      //
      // The window manager client disconnects when the screen lock is activated
      // which results in other reconnecting clients needing to buffer.  But
      // we don't want to OOM, so at some point we just need to cut the clients
      // loose.  The clients will re-connect when this happens and send their
      // current state, so there's no real loss of information.  There won't
      // even really be too much latency because they will successfully
      // reconnect and buffer.
      if (this.bufferingMessages.length > MAX_BUFFERED_MESSAGES) {
        this.ws.close();
      }
      return;
    }

    const obj = JSON.parse(data);
    //console.log('\n===', this.idPrefix, obj.type);

    if (obj.type === 'reply') {
      const replyResolve = this.awaitingReplies.get(obj.id);
      if (!replyResolve) {
        //console.error('got reply we were not waiting for:', obj);
        return;
      }
      this.awaitingReplies.delete(obj.id);
      replyResolve(obj.payload);
      return;
    } else {
      if (obj.type) {
        this.debugMessages[obj.type] = obj;
      }
      // If this is anything but a reply, then save it off parsed so that we can
      // re-format it for display.  The reply thing is because the HTML image
      // data is obviously not something useful to dump.
      this._mostRecentMessage = obj;
    }

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

    this.clientType = msg.type;
    this.clientName = msg.name;
    this.clientUniqueId = msg.uniqueId;

    this.capabilities = msg.capabilities || [];
    const shouldBuffer =
      this.brainBoss.reportClientCapabilities(this, this.capabilities);

    if (shouldBuffer) {
      this.bufferingMessages = [];
    }
  }

  onMessage_focusSlotsInventory(msg) {
    const isInitial = !this.receivedInitialSlots;
    this.receivedInitialSlots = true;

    const mappedAllSlots = this.visibilityTracker.processFocusSlotsInventory(
      this.idPrefix, msg.focusSlots, this.isWM, this);

    // If all the slots were mapped to windows, then we tell the client so that
    // it can stop doing hacky things like tunneling process id's through
    // window titles.
    if (mappedAllSlots && !this.focusSlotsLinked) {
      this.focusSlotsLinked = true;
      this.sendMessage('focusSlotsLinked', {});
    }

    if (isInitial) {
      // We're defining this event to mean that a client has connected and has
      // fully told us everything we need to know.
      this.brainBoss.notifyModes('onClientReady', this);
    }

    this.brainBoss.debugStateUpdated();
  }

  onMessage_thingsExist(msg) {
    this.visibilityTracker.processThingsExist(
      this.idPrefix, msg.items, this.isWM);
    if (this.isWM && !this.goodToGo) {
      this.brainBoss.wmGoodToGo(this);
    }
    // XXX this is really a hack, as it's only true for the WM.
    this.goodToGo = true;
  }

  onMessage_thingsGone(msg) {
    this.visibilityTracker.processThingsGone(
      this.idPrefix, msg.items, this.isWM);
  }

  onMessage_thingsVisibilityInventory(msg) {
    this.visibilityTracker.processThingsVisibilityInventory(
      this.idPrefix, msg.inventory, this.isWM, this);

    this.brainBoss.debugStateUpdated();
  }

  onMessage_actionBookmarkRequest(msg) {
    const fullContainerId = this.idPrefix + msg.containerId;
    const actionId = msg.actionId;

    const info = {
      containerId: fullContainerId,
      actionId
    };

    this.brainBoss.notifyModes('onActionBookmarkRequest', info, this);
  }

  onClose(code, reason) {
    this.visibilityTracker.evictMootPrefix(this.idPrefix);
    this.brainBoss.unregisterClient(this, this.idPrefix);
  }

  sendMessage(type, payload) {
    //console.log('sending', type, payload);

    const obj = { type, payload };
    this.ws.send(JSON.stringify(obj));
  }

  async sendMessageAwaitingReply(type, payload) {
    const id = this.nextMsgId++;
    const obj = { type, id, payload };
    this.ws.send(JSON.stringify(obj));

    const reply = await new Promise((resolve) => {
      this.awaitingReplies.set(id, resolve);
    });
    return reply;
  }
}
