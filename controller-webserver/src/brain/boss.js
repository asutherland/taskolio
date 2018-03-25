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

class BrainBoss {
  constructor() {
    this.clientsByPrefix = new Map();
  }

  registerClient(brainConn, msg) {
    const idPrefix = `${msg.type}_-_${msg.name}_-_${msg.uniqueId}:`;
    const barePrefix = idPrefix.slice(0, -1);
    this.clientsByPrefix.set(barePrefix, brainConn);
    return idPrefix;
  }

  unregisterClient(brainConn, idPrefix) {
    const barePrefix = idPrefix.slice(0, -1);
    this.clientsByPrefix.delete(barePrefix);
  }

  _messageContainerId(prefixedContainerId, messageType, extraProps) {
    const clientId = extractClientId(prefixedContainerId);
    const conn = this.clientsByPrefix.get(clientId);

    if (!conn) {
      console.warn('Got', messageType, 'request for missing client:', clientId);
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

  fadeContainerId(prefixedContainerId, value) {
    return this._messageContainerId(
      prefixedContainerId, 'fadeThings',
      {
        value
      });
  }
}

module.exports.BrainBoss = BrainBoss;