function extractClientId(prefixed) {
  return prefixed.split(':', 1)[0];
}

function extractUnprefixedContainerId(prefixed) {
  const idxColon = prefixed.indexOf(':');
  return prefixed.substring(idxColon + 1);
}

class BrainBoss {
  constructor() {
    this.clientsByPrefix = new Map();
  }

  registerClient(brainConn, msg) {
    const idPrefix = msg.uniqueId + ':';
    this.clientsByPrefix.set(msg.uniqueId, brainConn);
    return idPrefix;
  }

  unregisterClient(brainConn, idPrefix) {
    const barePrefix = idPrefix.slice(0, -1);
    this.clientsByPrefix.delete(barePrefix);
  }

  focusContainerId(prefixedContainerId) {
    const clientId = extractClientId(prefixedContainerId);
    const conn = this.clientsByPrefix.get(clientId);

    if (!conn) {
      console.warn('Got focus request for missing client:', clientId);
      return;
    }

    conn.sendMessage('selectThings', {
      items: [
        {
          containerId: extractUnprefixedContainerId(prefixedContainerId)
        }
      ]
    });
  }
}

module.exports.BrainBoss = BrainBoss;