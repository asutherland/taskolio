import { BrainConnection } from "./conn.js";

function extractClientId(prefixed) {
  return prefixed.split(':', 1)[0];
}

function extractUnprefixedContainerId(prefixed) {
  // propagate null/undefined, don't explode.
  if (!prefixed) {
    return prefixed;
  }
  const idxColon = prefixed.indexOf(':');
  return prefixed.substring(idxColon + 1);
}

export class BrainBoss {
  clientsByPrefix: Map<String, BrainConnection>;
  awaitingClientsByCapability: Map<any, any>;
  notifyModes: any;
  debugStateUpdated: any;
  log: any;
  wmConnected: boolean;

  constructor({ debugStateUpdated, log }) {
    /**
     * Clients by "bare" prefix (no ':' delimiter suffix.)
     */
    this.clientsByPrefix = new Map();
    /**
     * Map from capability string to a list of resolve functions to invoke with
     * a conn when it shows up.
     */
    this.awaitingClientsByCapability = new Map();

    // This is a method that gets clobbered in shortly after we're creating.
    // See ModeDispatcher.notifyModes.
    this.notifyModes = null;

    this.debugStateUpdated = debugStateUpdated;
    this.log = log;

    this.wmConnected = false;
  }

  renderDebugState() {
    const rows = [];
    for (const brainConn of this.clientsByPrefix.values()) {
      rows.push([
        brainConn.clientType || '<pending>',
        brainConn.clientName || '<pending>',
        brainConn.clientUniqueId || '<pending>'
      ]);
    }
    return {
      headers: ['Type', 'Name', 'UniqueId'],
      data: rows
    };
  }

  registerClient(brainConn, msg) {
    const idPrefix = `${msg.type}_-_${msg.name}_-_${msg.uniqueId}:`;
    const barePrefix = idPrefix.slice(0, -1);
    this.clientsByPrefix.set(barePrefix, brainConn);
    this.debugStateUpdated();
    return idPrefix;
  }

  /**
   * Invoked by a connection when its client reports its capabilities.  This
   * allows us to unblock any requests currently tracked in
   * `awaitingClientsByCapability`.
   */
  reportClientCapabilities(brainConn, capabilities) {
    for (const capability of capabilities) {
      //console.log('processing client capability:', capability);
      if (this.awaitingClientsByCapability.has(capability)) {
        for (const resolve of this.awaitingClientsByCapability.get(capability)) {
          //console.log('  resolving awaiting client...');
          resolve(brainConn);
        }
        this.awaitingClientsByCapability.delete(capability);
      }
    }

    this.debugStateUpdated();

    if (brainConn.isWM) {
      this.log(`WM connected with prefix: ${brainConn.idPrefix}`);
    } else {
      if (this.wmConnected) {
        // no need to buffer if the WM is connected.
        this.log(`Client connected with prefix: ${brainConn.idPrefix}`);
        return false;
      } else {
        // do need to buffer...
        this.log(`Buffering client with prefix: ${brainConn.idPrefix}`);
        return true;
      }
    }
  }

  wmGoodToGo(brainConn) {
    this.log(`WM good to go with prefix: ${brainConn.idPrefix}`);
    this.wmConnected = true;
    for (const otherConn of this.clientsByPrefix.values()) {
      if (otherConn === brainConn) {
        continue;
      }
      this.log(`Client connected with prefix: ${otherConn.idPrefix}`);
      otherConn.stopBufferingAndProcessMessages();
    }
  }



  unregisterClient(brainConn, idPrefix) {
    const barePrefix = idPrefix.slice(0, -1);
    this.clientsByPrefix.delete(barePrefix);

    this.debugStateUpdated();
  }

  _messageContainerId(prefixedContainerId, messageType, extraProps) {
    const clientId = extractClientId(prefixedContainerId);
    const conn = this.clientsByPrefix.get(clientId);

    if (!conn) {
      //console.warn('Got', messageType, 'request for missing client:', clientId);
      return;
    }

    conn.sendMessage(messageType, {
      items: [
        Object.assign(
          { containerId: extractUnprefixedContainerId(prefixedContainerId) },
          extraProps)
      ]
    });
  }

  focusContainerId(prefixedContainerId, prefixedSlotId) {
    const focusSlotId = extractUnprefixedContainerId(prefixedSlotId);
    return this._messageContainerId(
      prefixedContainerId, 'selectThings',
      {
        focusSlotId
      });
  }

  styleContainerId(prefixedContainerId, prefixedSlotId, stylingObj) {
    const focusSlotId = extractUnprefixedContainerId(prefixedSlotId);
    this.log(`Sending styleThings message to: ${prefixedContainerId}`,
             stylingObj);
    return this._messageContainerId(
      prefixedContainerId, 'styleThings',
      {
        focusSlotId,
        ...stylingObj
      });
  }

  triggerContainerAction(prefixedContainerId, actionId) {
    this.log(`triggerContainerAction ${prefixedContainerId} ${actionId}`)
    return this._messageContainerId(
      prefixedContainerId, 'triggerActionBookmark',
      {
        actionId
      });
  }

  fadeContainerId(prefixedContainerId, value) {
    return this._messageContainerId(
      prefixedContainerId, 'fadeThings',
      {
        value
      });
  }

  /**
   * Synchronously locate a connection with the desired capability, returning
   * null if one could not be found.
   */
  _findConnWithCapability(capability) {
    for (const conn of this.clientsByPrefix.values()) {
      if (conn.capabilities.indexOf(capability) !== -1) {
        return conn;
      }
    }

    return null;
  }

  /**
   * Synchronously tries to find a connection with the desired capability.  If
   * one is not present, asynchronously wait for one to show up.
   */
  async _awaitConnWithCapability(capability) {
    //console.log('looking for connection with capability', capability);
    let conn = this._findConnWithCapability(capability);
    if (conn) {
      //console.log('found one, returning it synchronously');
      return conn;
    }
    //console.log('did not find one, async waiting)');

    let pending = this.awaitingClientsByCapability.get(capability);
    if (!pending) {
      pending = [];
      this.awaitingClientsByCapability.set(capability, pending);
    }
    const promise : Promise<BrainConnection> = new Promise((resolve) => {
      pending.push(resolve);
    });
    conn = await promise;
    return conn;
  }

  async asyncRenderHTML(args) {
    const conn = await this._awaitConnWithCapability('renderHtml-1');
    //console.log('got connection, sending message and awaiting reply');
    const reply = await conn.sendMessageAwaitingReply('renderHtml', args);
    //console.log('received reply');
    return reply;
  }
}
